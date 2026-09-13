use crate::{capabilities::{Broker, LocalBroker}, contract::{Contract, Outcome, Policy, Prepared, MAX_WIRE_BYTES}, execute::{self, Run}};
use anyhow::{Context, Result, ensure};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{path::Path, time::Duration};

// Change this when preparation or execution semantics change. Old versions require re-submission.
pub const ENGINE: &str = "clearings-0.1/abi-1/oxc-0.140/rquickjs-0.13";

pub fn digest(value: &impl Serialize) -> Result<String> {
    Ok(format!("{:x}", Sha256::digest(serde_json::to_vec(&serde_json::to_value(value)?)?)))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FixtureCall { pub name: String, pub input: Value, pub result: Value }
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Case { pub name: String, pub input: Value, pub expected: Outcome, #[serde(default)] pub calls: Vec<FixtureCall> }
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Task { pub contract: Contract, pub cases: Vec<Case> }
impl Task {
    fn validate(&self) -> Result<()> {
        self.contract.validate()?;
        ensure!(!self.cases.is_empty() && self.cases.len() <= 100, "a task needs 1 to 100 acceptance cases");
        ensure!(self.cases.iter().any(|c| matches!(c.expected, Outcome::Completed { .. })), "include a completed acceptance case");
        let mut names = std::collections::BTreeSet::new();
        for case in &self.cases {
            ensure!(!case.name.is_empty() && names.insert(&case.name), "case names must be nonempty and unique");
            self.contract.check_input(&case.input)?;
            self.contract.check_outcome(&case.expected)?;
            ensure!(case.calls.len() <= self.contract.limits.capability_calls, "fixture exceeds call budget");
            for call in &case.calls {
                ensure!(self.contract.capabilities.contains(&call.name), "fixture capability was not declared");
                crate::contract::check_json(&call.result)?;
            }
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Version { pub task: String, pub engine: String, pub source: String, pub prepared: Prepared }

struct Fixtures<'a> { calls: &'a [FixtureCall], position: usize, mismatch: bool }
impl Broker for Fixtures<'_> {
    fn call(&mut self, name: &str, input: Value, _: Duration) -> Result<Value> {
        let call = self.calls.get(self.position);
        self.position += 1;
        let matched = call.is_some_and(|c| c.name == name && c.input == input);
        self.mismatch |= !matched;
        ensure!(matched, "call does not match the recorded acceptance fixture");
        Ok(call.unwrap().result.clone())
    }
}

pub struct Store { db: Connection }
impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        let db = Connection::open(path)?;
        db.busy_timeout(Duration::from_secs(5))?;
        db.pragma_update(None, "foreign_keys", true)?;
        let schema: i32 = db.pragma_query_value(None, "user_version", |r| r.get(0))?;
        ensure!(schema <= 1, "store was created by a newer version");
        db.execute_batch("PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS objects (id TEXT PRIMARY KEY, kind TEXT NOT NULL, body TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS evaluations (version TEXT NOT NULL, engine TEXT NOT NULL, report TEXT NOT NULL, PRIMARY KEY(version, engine), FOREIGN KEY(version) REFERENCES objects(id));
            CREATE TABLE IF NOT EXISTS active (task TEXT PRIMARY KEY, version TEXT NOT NULL, FOREIGN KEY(task) REFERENCES objects(id), FOREIGN KEY(version) REFERENCES objects(id));
            CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY, version TEXT NOT NULL, input_digest TEXT NOT NULL, report TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(version) REFERENCES objects(id));
            PRAGMA user_version=1;")?;
        Ok(Self { db })
    }
    fn put(&self, kind: &str, value: &impl Serialize) -> Result<String> {
        let body = serde_json::to_string(value)?;
        ensure!(body.len() <= MAX_WIRE_BYTES, "stored object exceeds 4 MiB");
        let id = digest(value)?;
        self.db.execute("INSERT OR IGNORE INTO objects(id,kind,body) VALUES(?1,?2,?3)", params![id, kind, body])?;
        Ok(id)
    }
    pub fn get<T: DeserializeOwned + Serialize>(&self, kind: &str, id: &str) -> Result<T> {
        let body: String = self.db.query_row("SELECT body FROM objects WHERE id=?1 AND kind=?2", params![id, kind], |r| r.get(0)).context("object not found")?;
        let value: T = serde_json::from_str(&body)?;
        ensure!(digest(&value)? == id, "stored object digest mismatch");
        Ok(value)
    }
    pub fn prepare_task(&self, task: &Task) -> Result<String> {
        task.validate()?;
        self.put("task", task)
    }
    pub fn submit(&self, executable: &Path, task: &str, source: String) -> Result<String> {
        let _: Task = self.get("task", task)?;
        let prepared = execute::prepare(executable, &source)?;
        self.put("version", &Version { task: task.into(), engine: ENGINE.into(), source, prepared })
    }
    fn version(&self, id: &str) -> Result<Version> {
        let version: Version = self.get("version", id)?;
        ensure!(version.engine == ENGINE, "runtime changed; submit and evaluate the source again");
        Ok(version)
    }
    pub fn evaluate(&self, executable: &Path, id: &str) -> Result<Value> {
        let version = self.version(id)?;
        let task: Task = self.get("task", &version.task)?;
        task.validate()?;
        let mut cases = Vec::new();
        for case in task.cases {
            let mut fixture = Fixtures { calls: &case.calls, position: 0, mismatch: false };
            let run = execute::run(executable, &task.contract, &version.prepared, case.input, &mut fixture);
            let accepted = run.outcome == case.expected && fixture.position == fixture.calls.len() && !fixture.mismatch;
            cases.push(json!({"name":case.name,"accepted":accepted,"run":run}));
        }
        let accepted = cases.iter().all(|c| c["accepted"] == true);
        let report = json!({"version":id,"task":version.task,"engine":ENGINE,"accepted":accepted,"cases":cases});
        // First evaluation is immutable. A fresh candidate gets a fresh version if source changes.
        self.db.execute("INSERT OR IGNORE INTO evaluations(version,engine,report) VALUES(?1,?2,?3)",params![id,ENGINE,serde_json::to_string(&report)?])?;
        let recorded: String = self.db.query_row("SELECT report FROM evaluations WHERE version=?1 AND engine=?2",params![id,ENGINE],|r|r.get(0))?;
        Ok(serde_json::from_str(&recorded)?)
    }
    pub fn active(&self, task: &str) -> Result<Option<String>> {
        Ok(self.db.query_row("SELECT version FROM active WHERE task=?1", [task], |r|r.get(0)).optional()?)
    }
    pub fn activate(&mut self, id: &str, expected_active: Option<&str>) -> Result<()> {
        let version = self.version(id)?;
        let report: String = self.db.query_row("SELECT report FROM evaluations WHERE version=?1 AND engine=?2",params![id,ENGINE],|r|r.get(0)).context("evaluate before activation")?;
        ensure!(serde_json::from_str::<Value>(&report)?["accepted"] == true, "candidate failed acceptance");
        let tx = self.db.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let actual: Option<String> = tx.query_row("SELECT version FROM active WHERE task=?1",[&version.task],|r|r.get(0)).optional()?;
        ensure!(actual.as_deref() == expected_active, "active version changed; inspect it before replacing it");
        tx.execute("INSERT INTO active(task,version) VALUES(?1,?2) ON CONFLICT(task) DO UPDATE SET version=excluded.version",params![version.task,id])?;
        tx.commit()?;
        Ok(())
    }
    pub fn deactivate(&self, task: &str, expected: &str) -> Result<()> {
        ensure!(self.db.execute("DELETE FROM active WHERE task=?1 AND version=?2", params![task,expected])? == 1, "active version changed or is absent");
        Ok(())
    }
    pub fn run(&self, executable: &Path, task_id: &str, input: Value, policy: &Policy) -> Result<Value> {
        let id = self.active(task_id)?.context("task has no active version")?;
        let version = self.version(&id)?;
        ensure!(version.task == task_id, "active version belongs to a different task");
        let task: Task = self.get("task", task_id)?;
        let input_digest = digest(&input)?;
        let run = match LocalBroker::new(&task.contract, policy) {
            Ok(mut broker) => execute::run(executable, &task.contract, &version.prepared, input, &mut broker),
            Err(error) => Run { outcome: Outcome::failed("POLICY",error),elapsed_ms:0,capability_calls:0,model_usage:None },
        };
        self.db.execute("INSERT INTO runs(version,input_digest,report) VALUES(?1,?2,?3)",params![id,input_digest,serde_json::to_string(&run)?])?;
        Ok(json!({"id":self.db.last_insert_rowid(),"version":id,"input_digest":input_digest,"run":run}))
    }
    pub fn list(&self) -> Result<Value> {
        let mut stmt = self.db.prepare("SELECT id,body FROM objects WHERE kind='task' ORDER BY id")?;
        let rows = stmt.query_map([],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?)))?;
        let mut tasks = Vec::new();
        for row in rows { let (id,body)=row?; let task:Task=serde_json::from_str(&body)?; tasks.push(json!({"task":id,"name":task.contract.name,"description":task.contract.description,"active":self.active(&id)?})); }
        Ok(json!({"tasks":tasks}))
    }
    pub fn inspect(&self, id: &str) -> Result<Value> {
        let (kind,body):(String,String)=self.db.query_row("SELECT kind,body FROM objects WHERE id=?1",[id],|r|Ok((r.get(0)?,r.get(1)?)))?;
        let value:Value=serde_json::from_str(&body)?;
        ensure!(digest(&value)?==id,"stored object digest mismatch");
        let evaluation:Option<String>=self.db.query_row("SELECT report FROM evaluations WHERE version=?1 AND engine=?2",params![id,ENGINE],|r|r.get(0)).optional()?;
        Ok(json!({"id":id,"kind":kind,"object":value,"evaluation":evaluation.map(|s|serde_json::from_str::<Value>(&s)).transpose()?,"active":self.active(id)?}))
    }
    pub fn runs(&self) -> Result<Value> {
        let mut stmt=self.db.prepare("SELECT id,version,input_digest,report,created_at FROM runs ORDER BY id DESC LIMIT 100")?;
        let rows=stmt.query_map([],|r|Ok((r.get::<_,i64>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?,r.get::<_,String>(4)?)))?;
        let mut runs=Vec::new();
        for row in rows { let(id,version,input_digest,report,created_at)=row?;runs.push(json!({"id":id,"version":version,"input_digest":input_digest,"run":serde_json::from_str::<Value>(&report)?,"created_at":created_at})); }
        Ok(json!({"runs":runs}))
    }
}
