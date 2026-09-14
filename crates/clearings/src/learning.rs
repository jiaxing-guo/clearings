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
    observations: Vec<(String, String, Observation)>,
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
            let sessions: BTreeSet<_> = group.observations.iter().map(|(s, _, _)| s).collect();
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
            for (_, id, o) in &group.observations {
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
            if conflict
                || task.cases.len() < 3
                || !task
                    .cases
                    .iter()
                    .any(|case| matches!(case.expected, crate::contract::Outcome::Completed { .. }))
            {
                continue;
            }
            // Freeze all cases first. Source author receives no held-out input or expected result.
            if let Some((_, id, _)) = &previous {
                task = self.get("task", id)?;
            }
            task.validate()?;
            let task_id = self.prepare_task(&task)?;
            self.db.execute("INSERT INTO learning_groups(project,fingerprint,task,status,attempts) VALUES(?1,?2,?3,'pending',0) ON CONFLICT(project,fingerprint) DO NOTHING",params![project,fingerprint,task_id])?;
            let result = (|| -> Result<Value> {
                let packet = json!({"contract":task.contract,"examples":&task.cases[..task.cases.len()-1],"purpose":"Create a parameterized routine; one additional recorded case is withheld."});
                let source =
                    self.propose_source(project, job, "create", packet, Some(&fingerprint))?;
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
            if let Err(error) = self.check_job(project, job) {
                self.db.execute("UPDATE learning_groups SET status='interrupted',report=?3 WHERE project=?1 AND fingerprint=?2",params![project,fingerprint,json!({"error":error.to_string()}).to_string()])?;
                return Err(error);
            }
            let (status, value) = match result {
                Ok(v) => ("created", v),
                Err(e) => {
                    let attempts: u32 = self.db.query_row(
                        "SELECT attempts FROM learning_groups WHERE project=?1 AND fingerprint=?2",
                        params![project, fingerprint],
                        |r| r.get(0),
                    )?;
                    (
                        if attempts == 0 { "deferred" } else { "failed" },
                        json!({"error":e.to_string(),"task":task_id}),
                    )
                }
            };
            self.db.execute("UPDATE learning_groups SET status=?3,report=?4 WHERE project=?1 AND fingerprint=?2",params![project,fingerprint,status,value.to_string()])?;
            return Ok(json!({"status":status,"result":value}));
        }
        Ok(json!({"status":"no_eligible_observations"}))
    }
    fn observation_groups(&self, project: &str) -> Result<BTreeMap<String, Group>> {
        let before: Option<i64> = self
            .db
            .query_row(
                "SELECT before_seq FROM learning_scan WHERE project=?1",
                [project],
                |r| r.get(0),
            )
            .optional()?
            .flatten();
        let mut contracts = self.db.prepare("SELECT json_extract(body,'$.observation.contract'),MAX(seq) FROM activity WHERE project=?1 AND json_extract(body,'$.observation.contract') IS NOT NULL GROUP BY json_extract(body,'$.observation.contract') HAVING (?2 IS NULL OR MAX(seq)<?2) ORDER BY MAX(seq) DESC LIMIT 501")?;
        let mut selected = contracts.query(params![project, before])?;
        let mut records = self.db.prepare("SELECT id,body FROM activity WHERE project=?1 AND json_extract(body,'$.observation.contract')=?2 ORDER BY seq DESC LIMIT 500")?;
        let mut groups: BTreeMap<String, Group> = BTreeMap::new();
        let mut last = None;
        let mut more = false;
        let mut bytes = 0;
        let mut count = 0;
        'contracts: while let Some(contract) = selected.next()? {
            if count == 500 {
                more = true;
                break;
            }
            let key: String = contract.get(0)?;
            let mut rows = records.query(params![project, key])?;
            let mut group_bytes = 0;
            while let Some(row) = rows.next()? {
                let body: String = row.get(1)?;
                if group_bytes + body.len() > 4 * 1024 * 1024 {
                    break;
                }
                if bytes + body.len() > 8 * 1024 * 1024 {
                    more = true;
                    break 'contracts;
                }
                group_bytes += body.len();
                bytes += body.len();
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
                    ));
            }
            last = Some(contract.get::<_, i64>(1)?);
            count += 1;
        }
        self.db.execute("INSERT INTO learning_scan(project,before_seq) VALUES(?1,?2) ON CONFLICT(project) DO UPDATE SET before_seq=excluded.before_seq",params![project,if more {last} else {None}])?;
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
        let task: Task = self.get("task", &v.task)?;
        ensure!(
            task.project.as_deref() == Some(&project.id),
            "candidate belongs to a different project"
        );
        // New candidates have a frozen learning record before their name is registered.
        if expected.is_some() {
            self.owns_task(&project.id, &v.task)?;
        } else {
            let frozen: bool = self.db.query_row(
                "SELECT EXISTS(SELECT 1 FROM learning_groups WHERE project=?1 AND task=?2)",
                params![project.id, v.task],
                |r| r.get(0),
            )?;
            ensure!(frozen, "candidate has no host-frozen learning record");
        }
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
