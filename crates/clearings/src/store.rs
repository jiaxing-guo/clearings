use crate::{
    capabilities::{Broker, LocalBroker},
    contract::{Contract, MAX_WIRE_BYTES, Outcome, Policy, Prepared},
    execute::{self, Run},
};
use anyhow::{Context, Result, ensure};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{path::Path, time::Duration};

// Change this when preparation or execution semantics change. Old versions require re-submission.
const REPORT_BYTES: usize = (MAX_WIRE_BYTES - 4096) / 3;
pub(crate) const OBJECT_BYTES: usize = REPORT_BYTES - 4096;

pub(crate) struct ExpectedRoutine<'a> {
    pub version: &'a str,
    pub capabilities: &'a [String],
}

pub const ENGINE: &str = "clearings-0.1/abi-1/oxc-0.140/rquickjs-0.13/execution-8";

pub fn digest(value: &impl Serialize) -> Result<String> {
    Ok(format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&serde_json::to_value(value)?)?)
    ))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FixtureCall {
    pub name: String,
    pub input: Value,
    pub result: Value,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Case {
    pub name: String,
    pub input: Value,
    pub expected: Outcome,
    #[serde(default)]
    pub calls: Vec<FixtureCall>,
}
impl Case {
    pub(crate) fn validate(
        &self,
        contract: &Contract,
        input_schema: &jsonschema::Validator,
        output_schema: &jsonschema::Validator,
    ) -> Result<()> {
        ensure!(!self.name.is_empty(), "case names must be nonempty");
        crate::contract::check_json(&self.input)?;
        input_schema
            .validate(&self.input)
            .map_err(|e| anyhow::anyhow!("schema mismatch: {e}"))?;
        match &self.expected {
            Outcome::Completed { output } => {
                crate::contract::check_json(output)?;
                output_schema
                    .validate(output)
                    .map_err(|e| anyhow::anyhow!("schema mismatch: {e}"))?;
            }
            Outcome::NeedsAgent { context, .. } => crate::contract::check_json(context)?,
            _ => {}
        }
        ensure!(
            serde_json::to_vec(&self.expected)?.len() <= contract.limits.output_bytes,
            "expected outcome exceeds run output byte limit"
        );
        ensure!(
            self.calls.len() <= contract.limits.capability_calls,
            "fixture exceeds call budget"
        );
        for call in &self.calls {
            ensure!(
                contract.capabilities.contains(&call.name),
                "fixture capability was not declared"
            );
            crate::contract::check_json(&call.input)?;
            crate::contract::check_json(&call.result)?;
            crate::capabilities::validate_fixture(
                &call.name,
                &call.input,
                &call.result,
                contract.limits.output_bytes,
            )?;
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Task {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub evidence: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project: Option<String>,
    #[serde(default, skip_serializing_if = "EvaluationMode::is_exact")]
    pub evaluation: EvaluationMode,
    pub contract: Contract,
    pub cases: Vec<Case>,
}
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EvaluationMode {
    #[default]
    ExactCalls,
    ReadOnlyBehavior,
}
impl EvaluationMode {
    fn is_exact(&self) -> bool {
        *self == Self::ExactCalls
    }
}
impl Task {
    pub(crate) fn validate(&self) -> Result<()> {
        let (input_schema, output_schema) = self.contract.checked_schemas()?;
        if self.evaluation == EvaluationMode::ReadOnlyBehavior {
            ensure!(
                self.contract
                    .capabilities
                    .iter()
                    .all(|c| matches!(c.as_str(), "files.read" | "files.list")),
                "behavior evaluation only supports read-only file operations"
            );
            for case in &self.cases {
                for (index, call) in case.calls.iter().enumerate() {
                    ensure!(
                        !case.calls[..index]
                            .iter()
                            .any(|other| other.name == call.name
                                && other.input == call.input
                                && other.result != call.result),
                        "behavior fixtures require stable results for identical reads"
                    );
                }
            }
        }
        ensure!(
            !self.cases.is_empty() && self.cases.len() <= 100,
            "a task needs 1 to 100 acceptance cases"
        );
        ensure!(
            self.cases
                .iter()
                .any(|c| matches!(c.expected, Outcome::Completed { .. })),
            "include a completed acceptance case"
        );
        let mut names = std::collections::BTreeSet::new();
        for case in &self.cases {
            ensure!(
                !case.name.is_empty() && names.insert(&case.name),
                "case names must be nonempty and unique"
            );
            case.validate(&self.contract, &input_schema, &output_schema)?;
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Version {
    pub task: String,
    pub engine: String,
    pub source: String,
    pub prepared: Prepared,
}

struct Fixtures<'a> {
    calls: &'a [FixtureCall],
    mode: &'a EvaluationMode,
    position: usize,
    mismatch: bool,
}
impl Broker for Fixtures<'_> {
    fn call(&mut self, name: &str, input: Value, _: Duration) -> Result<Value> {
        let call = if *self.mode == EvaluationMode::ReadOnlyBehavior {
            self.calls
                .iter()
                .find(|c| c.name == name && c.input == input)
        } else {
            self.calls.get(self.position)
        };
        self.position += 1;
        let matched = call.is_some_and(|c| c.name == name && c.input == input);
        self.mismatch |= !matched;
        ensure!(
            matched,
            "call does not match the recorded acceptance fixture"
        );
        Ok(call.unwrap().result.clone())
    }
}

struct FailureTrackingBroker {
    inner: LocalBroker,
    environment_failed: bool,
    candidate_failed: bool,
}
impl Broker for FailureTrackingBroker {
    fn call(&mut self, name: &str, input: Value, remaining: Duration) -> Result<Value> {
        let result = self.inner.call(name, input, remaining);
        if let Err(error) = &result {
            let invalid_call = error.is::<crate::capabilities::InvalidCall>();
            self.candidate_failed |= invalid_call;
            self.environment_failed |= !invalid_call;
        }
        result
    }
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, clap::ValueEnum, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RunPurpose {
    #[default]
    Reuse,
    Test,
}
impl RunPurpose {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Reuse => "reuse",
            Self::Test => "test",
        }
    }
}
pub(crate) struct RunOptions<'a> {
    pub expected: Option<ExpectedRoutine<'a>>,
    pub purpose: RunPurpose,
}

pub struct Store {
    pub(crate) db: Connection,
}
impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        Self::check_database_links(path)?;
        let db = Connection::open(path)?;
        db.busy_timeout(Duration::from_secs(5))?;
        db.pragma_update(None, "foreign_keys", true)?;
        let schema: i32 = db.pragma_query_value(None, "user_version", |r| r.get(0))?;
        ensure!(schema <= 13, "store was created by a newer version");
        db.execute_batch("PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS objects (id TEXT PRIMARY KEY, kind TEXT NOT NULL, body TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS evaluations (version TEXT NOT NULL, engine TEXT NOT NULL, report TEXT NOT NULL, PRIMARY KEY(version, engine), FOREIGN KEY(version) REFERENCES objects(id));
            CREATE TABLE IF NOT EXISTS active (task TEXT PRIMARY KEY, version TEXT NOT NULL, FOREIGN KEY(task) REFERENCES objects(id), FOREIGN KEY(version) REFERENCES objects(id));
            CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY, version TEXT NOT NULL, input_digest TEXT NOT NULL, report TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(version) REFERENCES objects(id));
            CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS project_routines (project TEXT NOT NULL REFERENCES projects(id), name TEXT NOT NULL, task TEXT NOT NULL REFERENCES objects(id), origin TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0, excluded INTEGER NOT NULL DEFAULT 0, previous TEXT, PRIMARY KEY(project,name), UNIQUE(project,task));
            CREATE TABLE IF NOT EXISTS trace_checkpoints(project TEXT NOT NULL REFERENCES projects(id), path TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(project,path));
            CREATE TABLE IF NOT EXISTS activity(seq INTEGER PRIMARY KEY, project TEXT NOT NULL REFERENCES projects(id), id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(project,id));
            CREATE TABLE IF NOT EXISTS trace_scan(project TEXT NOT NULL REFERENCES projects(id), source TEXT NOT NULL, next INTEGER NOT NULL, PRIMARY KEY(project,source));
            CREATE INDEX IF NOT EXISTS activity_page ON activity(project,seq DESC);
            CREATE INDEX IF NOT EXISTS activity_expiration ON activity(project,created_at);
            CREATE TABLE IF NOT EXISTS schedule(project TEXT PRIMARY KEY REFERENCES projects(id),next_due INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS background_jobs(id INTEGER PRIMARY KEY,project TEXT NOT NULL REFERENCES projects(id),revision INTEGER NOT NULL,started INTEGER NOT NULL,status TEXT NOT NULL,cancelled INTEGER NOT NULL DEFAULT 0,report TEXT NOT NULL DEFAULT '{}');
            CREATE TABLE IF NOT EXISTS budgets(project TEXT NOT NULL REFERENCES projects(id),day INTEGER NOT NULL,reserved INTEGER NOT NULL,PRIMARY KEY(project,day));
            CREATE TABLE IF NOT EXISTS model_requests(id INTEGER PRIMARY KEY,project TEXT NOT NULL REFERENCES projects(id),job INTEGER NOT NULL REFERENCES background_jobs(id),purpose TEXT NOT NULL,reserved INTEGER NOT NULL,status TEXT NOT NULL,usage TEXT);
            CREATE INDEX IF NOT EXISTS activity_contract ON activity(project,json_extract(body,'$.observation.contract'));
            CREATE TABLE IF NOT EXISTS learning_scan(project TEXT PRIMARY KEY REFERENCES projects(id),before_seq INTEGER);
            CREATE TABLE IF NOT EXISTS learning_groups(project TEXT NOT NULL REFERENCES projects(id),fingerprint TEXT NOT NULL,task TEXT NOT NULL REFERENCES objects(id),status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,report TEXT NOT NULL DEFAULT '{}',PRIMARY KEY(project,fingerprint));
            CREATE TABLE IF NOT EXISTS component_changes(id INTEGER PRIMARY KEY,project TEXT NOT NULL REFERENCES projects(id),task TEXT NOT NULL REFERENCES objects(id),version TEXT NOT NULL REFERENCES objects(id),previous TEXT,reason TEXT NOT NULL,job INTEGER REFERENCES background_jobs(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS improvement_trials(project TEXT NOT NULL REFERENCES projects(id),baseline TEXT NOT NULL REFERENCES objects(id),candidate TEXT,status TEXT NOT NULL,report TEXT NOT NULL DEFAULT '{}',PRIMARY KEY(project,baseline));
            CREATE TABLE IF NOT EXISTS installation(key TEXT PRIMARY KEY,body TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,client TEXT NOT NULL,host_id TEXT NOT NULL,root TEXT NOT NULL,source TEXT,updated INTEGER NOT NULL,body TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS conversations_recent ON conversations(updated DESC,id);
            CREATE TABLE IF NOT EXISTS conversation_progress(conversation TEXT PRIMARY KEY,head_updated INTEGER NOT NULL DEFAULT 0,tail_cursor TEXT,tail_next INTEGER NOT NULL DEFAULT 0,reviewed_at INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS conversation_evidence(id TEXT PRIMARY KEY,body TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS native_cycles(id INTEGER PRIMARY KEY,project TEXT NOT NULL,started INTEGER NOT NULL,status TEXT NOT NULL,revision INTEGER NOT NULL,project_revision INTEGER NOT NULL,scope TEXT NOT NULL DEFAULT 'project',automatic INTEGER NOT NULL DEFAULT 0,report TEXT NOT NULL DEFAULT '{}');
            CREATE TABLE IF NOT EXISTS native_requests(id INTEGER PRIMARY KEY,cycle INTEGER NOT NULL REFERENCES native_cycles(id),started INTEGER NOT NULL,client TEXT NOT NULL,purpose TEXT NOT NULL,status TEXT NOT NULL,usage TEXT,fingerprint TEXT NOT NULL,response TEXT,reserved_microusd INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS native_candidates(fingerprint TEXT PRIMARY KEY,status TEXT NOT NULL,report TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS routine_library(task TEXT PRIMARY KEY REFERENCES objects(id),applicability TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS library_controls(project TEXT NOT NULL REFERENCES projects(id),task TEXT NOT NULL REFERENCES objects(id),paused INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(project,task));
            CREATE TABLE IF NOT EXISTS routine_usage(task TEXT NOT NULL,version TEXT NOT NULL,project TEXT NOT NULL,day TEXT NOT NULL,calls INTEGER NOT NULL,completed INTEGER NOT NULL,handoffs INTEGER NOT NULL,failed INTEGER NOT NULL,elapsed_ms INTEGER NOT NULL,capability_calls INTEGER NOT NULL,last_used TEXT NOT NULL,PRIMARY KEY(task,version,project,day));
            CREATE TABLE IF NOT EXISTS routine_offers(session TEXT NOT NULL,project TEXT NOT NULL,task TEXT NOT NULL,version TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(session,project,task,version));")?;
        if schema < 8 {
            let tx = rusqlite::Transaction::new_unchecked(
                &db,
                rusqlite::TransactionBehavior::Immediate,
            )?;
            let current: i32 = tx.pragma_query_value(None, "user_version", |r| r.get(0))?;
            if current < 8 {
                let has_project: bool = tx.query_row(
                    "SELECT EXISTS(SELECT 1 FROM pragma_table_info('runs') WHERE name='project')",
                    [],
                    |r| r.get(0),
                )?;
                if !has_project {
                    tx.execute_batch(
                        "ALTER TABLE runs ADD COLUMN project TEXT REFERENCES projects(id);",
                    )?;
                }
                tx.execute_batch("
                UPDATE runs SET project=(SELECT json_extract(t.body,'$.project') FROM objects v JOIN objects t ON t.id=json_extract(v.body,'$.task') WHERE v.id=runs.version);
                INSERT OR IGNORE INTO routine_usage SELECT json_extract(v.body,'$.task'),r.version,COALESCE(r.project,''),date(r.created_at),count(*),sum(json_extract(r.report,'$.outcome.status')='completed'),sum(json_extract(r.report,'$.outcome.status') IN ('needs_agent','not_applicable')),sum(json_extract(r.report,'$.outcome.status')='failed'),sum(json_extract(r.report,'$.elapsed_ms')),sum(json_extract(r.report,'$.capability_calls')),max(r.created_at) FROM runs r JOIN objects v ON v.id=r.version GROUP BY 1,2,3,4;
                PRAGMA user_version=8;")?;
            }
            tx.commit()?;
        }
        db.execute_batch("CREATE INDEX IF NOT EXISTS runs_project_expiration ON runs(project,created_at); CREATE INDEX IF NOT EXISTS runs_project_page ON runs(project,id); CREATE INDEX IF NOT EXISTS offers_expiration ON routine_offers(created_at);")?;
        let tx =
            rusqlite::Transaction::new_unchecked(&db, rusqlite::TransactionBehavior::Immediate)?;
        for column in ["head_cursor", "head_anchor"] {
            let exists:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM pragma_table_info('conversation_progress') WHERE name=?1)",[column],|r|r.get(0))?;
            if !exists {
                tx.execute_batch(&format!(
                    "ALTER TABLE conversation_progress ADD COLUMN {column} TEXT;"
                ))?;
            }
        }
        tx.commit()?;
        let tx =
            rusqlite::Transaction::new_unchecked(&db, rusqlite::TransactionBehavior::Immediate)?;
        let current: i32 = tx.pragma_query_value(None, "user_version", |r| r.get(0))?;
        if current < 12 {
            tx.execute_batch(r#"
CREATE VIRTUAL TABLE routine_search USING fts5(name,description,applicability,tokenize='unicode61 remove_diacritics 0');
INSERT INTO routine_search(routine_search,rank) VALUES('rank','bm25(3.0,1.0,1.0)');
INSERT INTO routine_search(rowid,name,description,applicability)
 SELECT o.rowid,json_extract(o.body,'$.contract.name'),json_extract(o.body,'$.contract.description'),COALESCE(l.applicability,'')
 FROM objects o LEFT JOIN routine_library l ON l.task=o.id WHERE o.kind='task' AND json_extract(o.body,'$.project') IS NOT NULL;
CREATE TRIGGER routine_search_insert AFTER INSERT ON objects WHEN NEW.kind='task' BEGIN
 INSERT INTO routine_search(rowid,name,description,applicability)
 SELECT NEW.rowid,json_extract(NEW.body,'$.contract.name'),json_extract(NEW.body,'$.contract.description'),COALESCE((SELECT applicability FROM routine_library WHERE task=NEW.id),'')
 WHERE json_extract(NEW.body,'$.project') IS NOT NULL;
END;
CREATE TRIGGER routine_search_delete AFTER DELETE ON objects WHEN OLD.kind='task' BEGIN
 DELETE FROM routine_search WHERE rowid=OLD.rowid;
END;
CREATE TRIGGER routine_search_update AFTER UPDATE OF body,kind ON objects BEGIN
 DELETE FROM routine_search WHERE rowid=OLD.rowid;
 INSERT INTO routine_search(rowid,name,description,applicability)
 SELECT NEW.rowid,json_extract(NEW.body,'$.contract.name'),json_extract(NEW.body,'$.contract.description'),COALESCE((SELECT applicability FROM routine_library WHERE task=NEW.id),'')
 WHERE NEW.kind='task' AND json_extract(NEW.body,'$.project') IS NOT NULL;
END;
CREATE TRIGGER routine_search_share AFTER INSERT ON routine_library BEGIN
 UPDATE routine_search SET applicability=NEW.applicability WHERE rowid=(SELECT rowid FROM objects WHERE id=NEW.task);
END;
CREATE TRIGGER routine_search_reshare AFTER UPDATE OF applicability ON routine_library BEGIN
 UPDATE routine_search SET applicability=NEW.applicability WHERE rowid=(SELECT rowid FROM objects WHERE id=NEW.task);
END;
CREATE TRIGGER routine_search_unshare AFTER DELETE ON routine_library BEGIN
 UPDATE routine_search SET applicability='' WHERE rowid=(SELECT rowid FROM objects WHERE id=OLD.task);
END;
PRAGMA user_version=12;
"#)?;
        }
        tx.commit()?;
        let tx =
            rusqlite::Transaction::new_unchecked(&db, rusqlite::TransactionBehavior::Immediate)?;
        let current: i32 = tx.pragma_query_value(None, "user_version", |r| r.get(0))?;
        if current < 13 {
            for (table, column, definition) in [
                ("runs", "purpose", "TEXT NOT NULL DEFAULT 'unknown'"),
                ("routine_usage", "reuse_calls", "INTEGER NOT NULL DEFAULT 0"),
                ("routine_usage", "test_calls", "INTEGER NOT NULL DEFAULT 0"),
            ] {
                let exists: bool = tx.query_row(
                    "SELECT EXISTS(SELECT 1 FROM pragma_table_info(?1) WHERE name=?2)",
                    params![table, column],
                    |r| r.get(0),
                )?;
                if !exists {
                    tx.execute_batch(&format!(
                        "ALTER TABLE {table} ADD COLUMN {column} {definition};"
                    ))?;
                }
            }
            tx.pragma_update(None, "user_version", 13)?;
        }
        tx.commit()?;
        Ok(Self { db })
    }
    pub(crate) fn check_database_links(path: &Path) -> Result<()> {
        #[cfg(unix)]
        match std::fs::metadata(path) {
            Ok(metadata) => {
                use std::os::unix::fs::MetadataExt;
                ensure!(
                    metadata.nlink() == 1,
                    "hard-linked databases are unsupported; use one database file path"
                );
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
        Ok(())
    }
    fn put(&self, kind: &str, value: &impl Serialize) -> Result<String> {
        let body = serde_json::to_string(value)?;
        ensure!(
            body.len() <= OBJECT_BYTES,
            "stored object exceeds inspect byte limit"
        );
        let id = digest(value)?;
        self.db.execute(
            "INSERT OR IGNORE INTO objects(id,kind,body) VALUES(?1,?2,?3)",
            params![id, kind, body],
        )?;
        Ok(id)
    }
    pub fn get<T: DeserializeOwned + Serialize>(&self, kind: &str, id: &str) -> Result<T> {
        let (bytes, body): (usize, Option<String>) = self.db.query_row(
            "SELECT length(CAST(body AS BLOB)),CASE WHEN length(CAST(body AS BLOB)) <= ?3 THEN body END FROM objects WHERE id=?1 AND kind=?2",
            params![id, kind, OBJECT_BYTES], |r| Ok((r.get(0)?,r.get(1)?)),
        ).context("object not found")?;
        ensure!(
            bytes <= OBJECT_BYTES,
            "stored object exceeds inspect byte limit"
        );
        let body = body.context("missing stored object")?;
        let value: T = serde_json::from_str(&body)?;
        ensure!(digest(&value)? == id, "stored object digest mismatch");
        Ok(value)
    }
    pub fn prepare_task(&self, task: &Task) -> Result<String> {
        ensure!(
            task.evidence.is_none(),
            "observation evidence is host-owned"
        );
        self.prepare_host_task(task)
    }
    pub(crate) fn prepare_host_task(&self, task: &Task) -> Result<String> {
        task.validate()?;
        self.put("task", task)
    }
    pub fn submit(&self, executable: &Path, task: &str, source: String) -> Result<String> {
        let _: Task = self.get("task", task)?;
        let prepared = execute::prepare(executable, &source)?;
        self.put(
            "version",
            &Version {
                task: task.into(),
                engine: ENGINE.into(),
                source,
                prepared,
            },
        )
    }
    fn version(&self, id: &str) -> Result<Version> {
        let version: Version = self.get("version", id)?;
        ensure!(
            version.engine == ENGINE,
            "runtime changed; submit and evaluate the source again"
        );
        Ok(version)
    }
    pub fn evaluate(&self, executable: &Path, id: &str) -> Result<Value> {
        self.version(id)?;
        if let Some(report) = self.evaluation(id)? {
            return Ok(report);
        }
        let report = self.evaluate_fresh(executable, id, || Ok(()))?;
        // First evaluation is immutable. A fresh candidate gets a fresh version if source changes.
        self.db.execute(
            "INSERT OR IGNORE INTO evaluations(version,engine,report) VALUES(?1,?2,?3)",
            params![id, ENGINE, serde_json::to_string(&report)?],
        )?;
        self.evaluation(id)?.context("evaluation was not recorded")
    }

    pub(crate) fn evaluate_fresh(
        &self,
        executable: &Path,
        id: &str,
        guard: impl Fn() -> Result<()>,
    ) -> Result<Value> {
        let version = self.version(id)?;
        let task: Task = self.get("task", &version.task)?;
        task.validate()?;
        let mut cases = Vec::new();
        let mut report_bytes = 1024;
        for case in task.cases {
            guard()?;
            let mut fixture = Fixtures {
                calls: &case.calls,
                mode: &task.evaluation,
                position: 0,
                mismatch: false,
            };
            let run = execute::run(
                executable,
                &task.contract,
                &version.prepared,
                case.input,
                &mut fixture,
            );
            let accepted = run.outcome == case.expected
                && run.capability_calls == fixture.position
                && (task.evaluation == EvaluationMode::ReadOnlyBehavior
                    || fixture.position == fixture.calls.len())
                && !fixture.mismatch;
            let result = json!({"name":case.name,"accepted":accepted,"run":run});
            report_bytes += serde_json::to_vec(&result)?.len() + 1;
            ensure!(
                report_bytes <= REPORT_BYTES,
                "evaluation report exceeds byte limit; no evaluation was recorded"
            );
            cases.push(result);
        }
        let accepted = cases.iter().all(|c| c["accepted"] == true);
        let report = json!({"version":id,"task":version.task,"engine":ENGINE,"accepted":accepted,"cases":cases});
        ensure!(
            serde_json::to_vec(&report)?.len() <= REPORT_BYTES,
            "evaluation report exceeds byte limit"
        );
        Ok(report)
    }

    fn evaluation(&self, id: &str) -> Result<Option<Value>> {
        let row: Option<(usize, Option<String>)> = self.db.query_row(
            "SELECT length(CAST(report AS BLOB)), CASE WHEN length(CAST(report AS BLOB)) <= ?3 THEN report END FROM evaluations WHERE version=?1 AND engine=?2",
            params![id, ENGINE, REPORT_BYTES], |r| Ok((r.get(0)?,r.get(1)?)),
        ).optional()?;
        row.map(|(bytes, body)| {
            ensure!(
                bytes <= REPORT_BYTES,
                "stored evaluation exceeds byte limit"
            );
            Ok(serde_json::from_str(
                &body.context("missing evaluation body")?,
            )?)
        })
        .transpose()
    }
    pub fn active(&self, task: &str) -> Result<Option<String>> {
        Ok(self
            .db
            .query_row("SELECT version FROM active WHERE task=?1", [task], |r| {
                r.get(0)
            })
            .optional()?)
    }
    pub fn activate(&mut self, id: &str, expected_active: Option<&str>) -> Result<()> {
        let version = self.version(id)?;
        let report: String = self
            .db
            .query_row(
                "SELECT report FROM evaluations WHERE version=?1 AND engine=?2",
                params![id, ENGINE],
                |r| r.get(0),
            )
            .context("evaluate before activation")?;
        ensure!(
            serde_json::from_str::<Value>(&report)?["accepted"] == true,
            "candidate failed acceptance"
        );
        let tx = self
            .db
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let actual: Option<String> = tx
            .query_row(
                "SELECT version FROM active WHERE task=?1",
                [&version.task],
                |r| r.get(0),
            )
            .optional()?;
        ensure!(
            actual.as_deref() == expected_active,
            "active version changed; inspect it before replacing it"
        );
        tx.execute("INSERT INTO active(task,version) VALUES(?1,?2) ON CONFLICT(task) DO UPDATE SET version=excluded.version",params![version.task,id])?;
        tx.execute(
            "UPDATE project_routines SET previous=NULL WHERE task=?1",
            [&version.task],
        )?;
        tx.commit()?;
        Ok(())
    }
    pub fn deactivate(&self, task: &str, expected: &str) -> Result<()> {
        ensure!(
            self.db.execute(
                "DELETE FROM active WHERE task=?1 AND version=?2",
                params![task, expected]
            )? == 1,
            "active version changed or is absent"
        );
        Ok(())
    }
    pub fn run(
        &self,
        executable: &Path,
        task_id: &str,
        input: Value,
        policy: &Policy,
    ) -> Result<Value> {
        let task: Task = self.get("task", task_id)?;
        self.run_in_project(
            executable,
            task_id,
            input,
            policy,
            task.project.as_deref(),
            None,
        )
    }
    pub(crate) fn run_in_project(
        &self,
        executable: &Path,
        task_id: &str,
        input: Value,
        policy: &Policy,
        execution_project: Option<&str>,
        expected: Option<ExpectedRoutine<'_>>,
    ) -> Result<Value> {
        self.run_selected(
            executable,
            task_id,
            input,
            policy,
            execution_project,
            RunOptions {
                expected,
                purpose: RunPurpose::Reuse,
            },
        )
    }
    pub(crate) fn run_selected(
        &self,
        executable: &Path,
        task_id: &str,
        input: Value,
        policy: &Policy,
        execution_project: Option<&str>,
        options: RunOptions<'_>,
    ) -> Result<Value> {
        let RunOptions { expected, purpose } = options;
        let id = self
            .active(task_id)?
            .context("task has no active version")?;
        ensure!(
            expected
                .as_ref()
                .is_none_or(|expected| expected.version == id),
            "active version changed; inspect the current routine before running"
        );
        let version = self.version(&id)?;
        ensure!(
            version.task == task_id,
            "active version belongs to a different task"
        );
        let task: Task = self.get("task", task_id)?;
        if let Some(expected) = expected {
            let actual: std::collections::BTreeSet<_> = task.contract.capabilities.iter().collect();
            ensure!(
                actual == expected.capabilities.iter().collect(),
                "routine capabilities differ from the invocation hint"
            );
        }
        if let Some(project) = &task.project {
            ensure!(
                self.named_task(project, &task.contract.name, true)? == task_id,
                "task is not the registered routine"
            );
        }
        if let Some(project) = execution_project {
            let paused:bool=self.db.query_row("SELECT EXISTS(SELECT 1 FROM library_controls WHERE project=?1 AND task=?2 AND paused=1)",params![project,task_id],|r|r.get(0))?;
            ensure!(!paused, "routine is paused in this project");
            ensure!(
                serde_json::to_value(crate::project::normalize_grants(policy.clone())?)?
                    == serde_json::to_value(self.project(project)?.settings.grants)?,
                "project grants are fixed"
            );
            if task.project.as_deref() != Some(project) {
                self.require_shared(project, task_id)?;
            }
        } else {
            ensure!(task.project.is_none(), "select an execution project");
        }
        let input_digest = digest(&input)?;
        let (run, candidate_failure) = match LocalBroker::new(&task.contract, policy) {
            Ok(inner) => {
                let mut broker = FailureTrackingBroker {
                    inner,
                    environment_failed: false,
                    candidate_failed: false,
                };
                let (run, execution_failure) = execute::run_with_candidate_failure(
                    executable,
                    &task.contract,
                    &version.prepared,
                    input,
                    &mut broker,
                );
                let candidate_failure =
                    !broker.environment_failed && (execution_failure || broker.candidate_failed);
                (run, candidate_failure)
            }
            Err(error) => (
                Run {
                    outcome: Outcome::failed("POLICY", error),
                    elapsed_ms: 0,
                    capability_calls: 0,
                    model_usage: None,
                },
                false,
            ),
        };
        let tx = rusqlite::Transaction::new_unchecked(
            &self.db,
            rusqlite::TransactionBehavior::Immediate,
        )?;
        tx.execute(
            "INSERT INTO runs(version,input_digest,report,project,purpose) VALUES(?1,?2,?3,?4,?5)",
            params![
                id,
                input_digest,
                serde_json::to_string(&run)?,
                execution_project,
                purpose.as_str()
            ],
        )?;
        let run_id = tx.last_insert_rowid();
        let status = serde_json::to_value(&run.outcome)?["status"]
            .as_str()
            .unwrap_or("failed")
            .to_owned();
        tx.execute("INSERT INTO routine_usage(task,version,project,day,calls,completed,handoffs,failed,elapsed_ms,capability_calls,last_used,reuse_calls,test_calls) VALUES(?1,?2,?3,date('now'),1,?4,?5,?6,?7,?8,datetime('now'),?9,?10) ON CONFLICT(task,version,project,day) DO UPDATE SET calls=calls+1,completed=completed+excluded.completed,handoffs=handoffs+excluded.handoffs,failed=failed+excluded.failed,elapsed_ms=elapsed_ms+excluded.elapsed_ms,capability_calls=capability_calls+excluded.capability_calls,last_used=excluded.last_used,reuse_calls=reuse_calls+excluded.reuse_calls,test_calls=test_calls+excluded.test_calls",params![task_id,id,execution_project.unwrap_or(""),status=="completed",matches!(status.as_str(),"needs_agent"|"not_applicable"),status=="failed",i64::try_from(run.elapsed_ms)?,run.capability_calls,purpose==RunPurpose::Reuse,purpose==RunPurpose::Test])?;
        tx.commit()?;
        // A receiving project's narrower grants must not roll back the owner's
        // shared definition. Only owner executions can trigger global recovery.
        let recovery = if purpose == RunPurpose::Reuse
            && candidate_failure
            && execution_project == task.project.as_deref()
        {
            self.recover_regression(task_id, &id)?
        } else {
            None
        };
        Ok(
            json!({"id":run_id,"version":id,"input_digest":input_digest,"run":run,"recovery":recovery,"purpose":purpose.as_str()}),
        )
    }
    pub fn list(&self) -> Result<Value> {
        self.list_page(None)
    }
    pub fn list_page(&self, after: Option<&str>) -> Result<Value> {
        ensure!(
            after.is_none_or(|s| s.len() == 64
                && s.bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))),
            "after must be a task ID"
        );
        let mut stmt = self.db.prepare(
            "SELECT objects.id,json_extract(body,'$.contract.name'),json_extract(body,'$.contract.description'),active.version
             FROM objects LEFT JOIN active ON active.task=objects.id
             WHERE kind='task' AND json_extract(body,'$.project') IS NULL AND (?1 IS NULL OR objects.id > ?1) ORDER BY objects.id LIMIT 101",
        )?;
        let mut rows = stmt.query([after])?;
        let mut tasks = Vec::new();
        let mut bytes = 1024;
        let mut next_after = None;
        while let Some(row) = rows.next()? {
            if tasks.len() == 100 {
                next_after = tasks
                    .last()
                    .and_then(|v: &Value| v["task"].as_str())
                    .map(str::to_owned);
                break;
            }
            let task = json!({"task":row.get::<_,String>(0)?,"name":row.get::<_,String>(1)?,"description":row.get::<_,String>(2)?,"active":row.get::<_,Option<String>>(3)?});
            bytes += serde_json::to_vec(&task)?.len() + 1;
            ensure!(bytes <= REPORT_BYTES, "task page exceeds byte limit");
            tasks.push(task);
        }
        Ok(json!({"tasks":tasks,"next_after":next_after}))
    }
    pub fn inspect(&self, id: &str) -> Result<Value> {
        let kind: String =
            self.db
                .query_row("SELECT kind FROM objects WHERE id=?1", [id], |r| r.get(0))?;
        let value: Value = self.get(&kind, id)?;
        let evaluation = self.evaluation(id)?.map(|report| {
            json!({
                "version":id,"engine":ENGINE,"accepted":report["accepted"],
                "case_count":report["cases"].as_array().map(Vec::len),
            })
        });
        Ok(
            json!({"id":id,"kind":kind,"object":value,"evaluation":evaluation,"active":self.active(id)?}),
        )
    }

    pub fn runs(&self) -> Result<Value> {
        self.runs_page(None)
    }

    pub fn runs_page(&self, before: Option<i64>) -> Result<Value> {
        self.runs_page_for_project(None, before)
    }

    pub fn runs_page_for_project(
        &self,
        project: Option<&str>,
        before: Option<i64>,
    ) -> Result<Value> {
        const PAGE_BYTES: usize = (MAX_WIRE_BYTES - 4096) / 3;
        ensure!(
            before.is_none_or(|id| id > 0),
            "before must be a positive run ID"
        );
        let mut stmt = self.db.prepare(
            "SELECT id,version,input_digest,length(CAST(report AS BLOB)),
             CASE WHEN length(CAST(report AS BLOB)) <= ?2 THEN report END,created_at,purpose
             FROM runs WHERE project IS ?3 AND (?1 IS NULL OR id < ?1) ORDER BY id DESC LIMIT 101",
        )?;
        let mut rows = stmt.query(params![before, PAGE_BYTES, project])?;
        let mut runs = Vec::new();
        let mut bytes = 64;
        let mut next_before = None;
        while let Some(row) = rows.next()? {
            let id: i64 = row.get(0)?;
            let length: usize = row.get(3)?;
            if runs.len() == 100 || bytes + length + 256 > PAGE_BYTES {
                ensure!(!runs.is_empty(), "run {id} exceeds the history page limit");
                next_before = runs.last().and_then(|v: &Value| v["id"].as_i64());
                break;
            }
            let report: String = row.get(4)?;
            let entry = json!({"id":id,"version":row.get::<_,String>(1)?,"input_digest":row.get::<_,String>(2)?,"run":serde_json::from_str::<Value>(&report)?,"created_at":row.get::<_,String>(5)?,"purpose":row.get::<_,String>(6)?});
            bytes += serde_json::to_vec(&entry)?.len() + 1;
            ensure!(bytes <= PAGE_BYTES, "history page exceeds byte limit");
            runs.push(entry);
        }
        Ok(json!({"runs":runs,"next_before":next_before}))
    }
}
