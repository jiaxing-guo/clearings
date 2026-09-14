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
        let inserted = self.insert_observation(&p, &id, &body)?;
        Ok(json!({"recorded":inserted==1,"id":id,"provenance":"agent_supplied_observation"}))
    }
    fn insert_observation(&self, project: &Project, id: &str, body: &Value) -> Result<usize> {
        let tx = rusqlite::Transaction::new_unchecked(
            &self.db,
            rusqlite::TransactionBehavior::Immediate,
        )?;
        let authorized: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM projects WHERE id=?1 AND revision=?2 AND json_extract(body,'$.settings.automatic')=1 AND json_extract(body,'$.settings.record_conversations')=1)",
            params![project.id, project.revision], |r| r.get(0),
        )?;
        ensure!(
            authorized,
            "project authorization changed before recording observation"
        );
        let inserted = tx.execute(
            "INSERT OR IGNORE INTO activity(project,id,body) VALUES(?1,?2,?3)",
            params![project.id, id, body.to_string()],
        )?;
        tx.commit()?;
        Ok(inserted)
    }
    pub(crate) fn learn(&mut self, project: &str, job: i64, executable: &Path) -> Result<Value> {
        let p = self.project(project)?;
        self.check_job(project, job)?;
        let groups = self.observation_groups(project)?;
        let mut skipped = vec![];
        let mut blocked_groups = 0;
        let mut rejected_groups = 0;
        let mut deferred_groups = 0;
        let mut deferred_result = None;
        for (fingerprint, group) in groups {
            self.check_job(project, job)?;
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
            let task = if let Some((_, id, _)) = &previous {
                self.get("task", id)?
            } else {
                if group.observations.len() < p.settings.min_occurrences {
                    continue;
                }
                let sessions: BTreeSet<_> =
                    group.observations.iter().map(|(s, _, _, _)| s).collect();
                if sessions.len() < p.settings.min_occurrences {
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
                let mut source_records = vec![];
                for (_, id, o, provenance) in &group.observations {
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
                        source_records
                            .push(json!({"id":id,"provenance":provenance,"case":case.name}));
                        task.cases.push(case);
                    }
                }
                if conflict
                    || task.cases.len() < 3
                    || !task.cases.iter().any(|case| {
                        matches!(case.expected, crate::contract::Outcome::Completed { .. })
                    })
                {
                    continue;
                }
                // Freeze all cases first. Source author receives no held-out input or expected result.
                task.evidence = Some(
                    json!({"kind":"supplied_observations","source_records":source_records,"withheld_case":task.cases.last().map(|c|&c.name),"claim":"Agreement on supplied cases, not authenticated or universal correctness."}),
                );
                task
            };
            let validation = (|| -> Result<()> {
                ensure!(
                    serde_json::to_vec(&task)?.len() <= crate::store::OBJECT_BYTES,
                    "observed acceptance exceeds the task object byte limit"
                );
                task.validate()
            })();
            if let Err(error) = validation {
                rejected_groups += 1;
                if skipped.len() < 32 {
                    skipped.push(json!({"name":task.contract.name,"status":"rejected","error":error.to_string()}));
                }
                continue;
            }
            let task_id = self.prepare_task(&task)?;
            self.db.execute("INSERT INTO learning_groups(project,fingerprint,task,status,attempts) VALUES(?1,?2,?3,'pending',0) ON CONFLICT(project,fingerprint) DO NOTHING",params![project,fingerprint,task_id])?;
            if !task.cases.iter().flat_map(|c| &c.calls).all(|call| {
                call.input["root"]
                    .as_str()
                    .is_some_and(|root| p.settings.grants.roots.contains_key(root))
            }) {
                let report = json!({"name":task.contract.name,"reason":"observed workflow requires an ungranted file root"});
                self.db.execute("UPDATE learning_groups SET status='blocked',report=?3 WHERE project=?1 AND fingerprint=?2",params![project,fingerprint,report.to_string()])?;
                blocked_groups += 1;
                if skipped.len() < 32 {
                    skipped.push(report);
                }
                continue;
            }
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
                    let requested: bool = self.db.query_row("SELECT EXISTS(SELECT 1 FROM model_requests WHERE project=?1 AND job=?2 AND purpose='create')",params![project,job],|r|r.get(0))?;
                    (
                        if requested { "failed" } else { "deferred" },
                        json!({"error":e.to_string(),"task":task_id}),
                    )
                }
            };
            self.db.execute("UPDATE learning_groups SET status=?3,report=?4 WHERE project=?1 AND fingerprint=?2",params![project,fingerprint,status,value.to_string()])?;
            if status == "deferred" {
                deferred_groups += 1;
                if skipped.len() < 32 {
                    skipped.push(json!({"name":task.contract.name,"status":"deferred","error":value["error"]}));
                }
                deferred_result = Some(value);
                continue;
            }
            return Ok(
                json!({"status":status,"result":value,"blocked_groups":blocked_groups,"rejected_groups":rejected_groups,"deferred_groups":deferred_groups,"skipped":skipped}),
            );
        }
        Ok(
            json!({"status":if deferred_result.is_some() {"deferred"} else {"no_eligible_observations"},"result":deferred_result,"blocked_groups":blocked_groups,"rejected_groups":rejected_groups,"deferred_groups":deferred_groups,"skipped":skipped}),
        )
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
                        v["provenance"].clone(),
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::{ModelConnection, Settings, TraceSource};

    #[test]
    fn recording_rechecks_authorization_after_validation() {
        for disable_automatic in [false, true] {
            let d = tempfile::tempdir().unwrap();
            let db = d.path().join("state.db");
            let trace = d.path().join("trace.jsonl");
            std::fs::write(&trace, "").unwrap();
            let mut store = Store::open(&db).unwrap();
            let settings = Settings {
                automatic: true,
                record_conversations: true,
                trace_sources: vec![TraceSource {
                    adapter: "clearings".into(),
                    path: trace,
                }],
                daily_budget_microusd: 1,
                model: Some(ModelConnection {
                    url: "http://127.0.0.1:9/chat".into(),
                    model: "fixture".into(),
                    bearer_token_env: None,
                    max_output_tokens: 10,
                    input_price: 1,
                    output_price: 1,
                }),
                ..Default::default()
            };
            let snapshot = store
                .configure_project(d.path(), "P", settings, None)
                .unwrap();
            let observation: Observation = serde_json::from_value(json!({"contract":{"abi":1,"name":"identity","description":"identity","input_schema":{},"output_schema":{}},"case":{"name":"one","input":1,"expected":{"status":"completed","output":1}}})).unwrap();
            store
                .record_observation(&snapshot.id, "first", observation.clone())
                .unwrap();
            let body: String = store
                .db
                .query_row("SELECT body FROM activity", [], |r| r.get(0))
                .unwrap();
            // The validation snapshot is stale after a separate connection revokes consent.
            let mut changed = snapshot.settings.clone();
            if disable_automatic {
                changed.automatic = false;
            } else {
                changed.record_conversations = false;
            }
            Store::open(&db)
                .unwrap()
                .configure_project(d.path(), "P", changed, Some(snapshot.revision))
                .unwrap();
            assert!(
                store
                    .insert_observation(
                        &snapshot,
                        "new-event",
                        &serde_json::from_str(&body).unwrap()
                    )
                    .is_err()
            );
            assert!(
                store
                    .record_observation(&snapshot.id, "second", observation)
                    .is_err()
            );
            assert_eq!(
                store
                    .db
                    .query_row("SELECT count(*) FROM activity", [], |r| r.get::<_, u64>(0))
                    .unwrap(),
                1
            );
        }
    }
}
