//! Candidate creation from repeated observations, with acceptance fixed before authoring.
use crate::{
    activity::Observation,
    project::Project,
    store::{EvaluationMode, Store, Task, Version, digest},
};
use anyhow::{Context, Result, ensure};
use rusqlite::{OptionalExtension, params};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::Path,
};
struct Group {
    observations: Vec<(String, String, Observation, Value)>,
}
impl Store {
    pub fn record_observation(
        &self,
        project: &str,
        session: &str,
        observation: Observation,
    ) -> Result<Value> {
        let p = self.project(project)?;
        ensure!(
            p.settings.automatic && p.settings.record_conversations,
            "project has not authorized conversational observation"
        );
        ensure!(
            !session.is_empty() && session.len() <= 200,
            "invalid session identity"
        );
        observation.validate()?;
        ensure!(
            !p.settings.excludes(&observation.contract.name),
            "workflow is excluded"
        );
        let id = digest(&(session, &observation))?;
        let body = json!({"session":session,"adapter":"conversation","observation":observation,"usage":null,"provenance":"agent_supplied_observation"});
        ensure!(
            serde_json::to_vec(&body)?.len() <= 1024 * 1024,
            "observation exceeds byte limit"
        );
        let inserted = self.db.execute(
            "INSERT OR IGNORE INTO activity(project,id,body) VALUES(?1,?2,?3)",
            params![project, id, body.to_string()],
        )?;
        Ok(json!({"recorded":inserted==1,"id":id,"provenance":"agent_supplied_observation"}))
    }
    pub(crate) fn learn(&mut self, project: &str, job: i64, executable: &Path) -> Result<Value> {
        let p = self.project(project)?;
        self.check_job(project, job)?;
        let groups = self.observation_groups(project)?;
        for (fingerprint, group) in groups {
            if group.observations.len() < p.settings.min_occurrences {
                continue;
            }
            let sessions: BTreeSet<_> = group.observations.iter().map(|(s, _, _, _)| s).collect();
            if sessions.len() < p.settings.min_occurrences {
                continue;
            }
            let first = &group.observations[0].2;
            if p.settings.excludes(&first.contract.name) {
                continue;
            }
            if self
                .named_task(project, &first.contract.name, false)
                .is_ok()
            {
                continue;
            }
            let previous: Option<(String,String,u32)> = self
                .db
                .query_row(
                    "SELECT status,task,attempts FROM learning_groups WHERE project=?1 AND fingerprint=?2",
                    params![project, fingerprint],
                    |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?)),
                )
                .optional()?;
            if previous
                .as_ref()
                .is_some_and(|(status, _, attempts)| status == "created" || *attempts >= 2)
            {
                continue;
            }
            let mut task = Task {
                evidence: None,
                project: Some(project.into()),
                evaluation: EvaluationMode::ReadOnlyBehavior,
                contract: first.contract.clone(),
                cases: vec![],
            };
            if task
                .contract
                .capabilities
                .iter()
                .any(|c| !matches!(c.as_str(), "files.read" | "files.list"))
            {
                continue;
            }
            task.contract.limits.wall_ms = task.contract.limits.wall_ms.min(5000);
            let mut inputs = BTreeMap::new();
            let mut conflict = false;
            for (_, id, o, _) in &group.observations {
                let key = digest(&o.case.input)?;
                if let Some(old) = inputs.insert(key, o.case.expected.clone()) {
                    if old != o.case.expected {
                        conflict = true;
                        break;
                    } else {
                        continue;
                    }
                }
                if task.cases.len() < 8 {
                    let mut case = o.case.clone();
                    case.name = format!("observed-{}", &id[..12]);
                    task.cases.push(case);
                }
            }
            if conflict || task.cases.len() < 3 {
                continue;
            }
            ensure!(
                task.cases
                    .iter()
                    .flat_map(|c| &c.calls)
                    .all(|call| call.input["root"].as_str().is_some_and(|root| p
                        .settings
                        .grants
                        .roots
                        .contains_key(root))),
                "observed workflow requires an ungranted file root; no candidate was created"
            );
            // Freeze all cases first. Source author receives no held-out input or expected result.
            task.evidence = Some(
                json!({"kind":"supplied_observations","source_records":group.observations.iter().take(8).map(|(_,id,_,provenance)|json!({"id":id,"provenance":provenance})).collect::<Vec<_>>(),"withheld_case":task.cases.last().map(|c|&c.name),"claim":"Agreement on supplied cases, not authenticated or universal correctness."}),
            );
            if let Some((_, id, _)) = &previous {
                task = self.get("task", id)?;
            }
            task.validate()?;
            let task_id = self.prepare_task(&task)?;
            self.db.execute("INSERT INTO learning_groups(project,fingerprint,task,status,attempts) VALUES(?1,?2,?3,'authoring',1) ON CONFLICT(project,fingerprint) DO UPDATE SET status='authoring',attempts=attempts+1",params![project,fingerprint,task_id])?;
            let result = (|| -> Result<Value> {
                let packet = json!({"contract":task.contract,"examples":&task.cases[..task.cases.len()-1],"purpose":"Create a parameterized routine; one additional recorded case is withheld."});
                let source = self.propose_source(project, job, "create", packet)?;
                self.check_job(project, job)?;
                let version = self.submit(executable, &task_id, source)?;
                let report = self.evaluate(executable, &version)?;
                ensure!(
                    report["accepted"] == true,
                    "candidate disagrees with recorded behavior; ordinary work is unchanged"
                );
                self.promote_automatic(&p, job, &version, None, "created")?;
                Ok(
                    json!({"name":task.contract.name,"task":task_id,"version":version,"accepted":true,"evidence":"recorded-case agreement with one withheld example","savings":null}),
                )
            })();
            let (status, value) = match result {
                Ok(v) => ("created", v),
                Err(e) => ("failed", json!({"error":e.to_string(),"task":task_id})),
            };
            self.db.execute("UPDATE learning_groups SET status=?3,report=?4 WHERE project=?1 AND fingerprint=?2",params![project,fingerprint,status,value.to_string()])?;
            return Ok(json!({"status":status,"result":value}));
        }
        Ok(json!({"status":"no_eligible_observations"}))
    }
    fn observation_groups(&self, project: &str) -> Result<BTreeMap<String, Group>> {
        let mut stmt=self.db.prepare("SELECT id,body FROM activity WHERE project=?1 AND json_extract(body,'$.observation') IS NOT NULL ORDER BY seq DESC LIMIT 500")?;
        let mut groups: BTreeMap<String, Group> = BTreeMap::new();
        let mut rows = stmt.query([project])?;
        let mut bytes = 0;
        while let Some(row) = rows.next()? {
            let body: String = row.get(1)?;
            bytes += body.len();
            if bytes > 4 * 1024 * 1024 {
                break;
            }
            let v: Value = serde_json::from_str(&body)?;
            let o: Observation = serde_json::from_value(v["observation"].clone())?;
            let fingerprint = digest(&o.contract)?;
            groups
                .entry(fingerprint)
                .or_insert(Group {
                    observations: vec![],
                })
                .observations
                .push((
                    v["session"]
                        .as_str()
                        .context("missing observation session")?
                        .into(),
                    row.get(0)?,
                    o,
                    v["provenance"].clone(),
                ));
        }
        Ok(groups)
    }
    pub(crate) fn promote_automatic(
        &mut self,
        project: &Project,
        job: i64,
        version: &str,
        expected: Option<&str>,
        reason: &str,
    ) -> Result<()> {
        self.check_job(&project.id, job)?;
        let v: Version = self.get("version", version)?;
        self.owns_task(&project.id, &v.task)?;
        let task: Task = self.get("task", &v.task)?;
        let report = self.inspect(version)?;
        ensure!(
            report["evaluation"]["accepted"] == true,
            "candidate has no passing evaluation"
        );
        let tx = self
            .db
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let authorized:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM projects JOIN background_jobs ON background_jobs.project=projects.id WHERE projects.id=?1 AND background_jobs.id=?2 AND projects.revision=background_jobs.revision AND background_jobs.cancelled=0 AND background_jobs.status='running' AND json_extract(projects.body,'$.settings.automatic')=1)",params![project.id,job],|r|r.get(0))?;
        ensure!(authorized, "authorization changed before promotion");
        let current: Option<String> = tx
            .query_row("SELECT version FROM active WHERE task=?1", [&v.task], |r| {
                r.get(0)
            })
            .optional()?;
        ensure!(
            current.as_deref() == expected,
            "active version changed before promotion"
        );
        let named: Option<(String, bool, bool)> = tx
            .query_row(
                "SELECT task,paused,excluded FROM project_routines WHERE project=?1 AND name=?2",
                params![project.id, task.contract.name],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()?;
        ensure!(
            named
                .as_ref()
                .is_none_or(|(t, paused, excluded)| t == &v.task && !paused && !excluded),
            "routine changed, paused or excluded before promotion"
        );
        tx.execute("INSERT INTO project_routines(project,name,task,origin,previous) VALUES(?1,?2,?3,'automatic',?4) ON CONFLICT(project,name) DO UPDATE SET previous=excluded.previous",params![project.id,task.contract.name,v.task,expected])?;
        tx.execute("INSERT INTO active(task,version) VALUES(?1,?2) ON CONFLICT(task) DO UPDATE SET version=excluded.version",params![v.task,version])?;
        tx.execute("INSERT INTO component_changes(project,task,version,previous,reason,job) VALUES(?1,?2,?3,?4,?5,?6)",params![project.id,v.task,version,expected,reason,job])?;
        tx.commit()?;
        Ok(())
    }
}
