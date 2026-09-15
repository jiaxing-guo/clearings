//! Bounded conversation learning through the user's existing coding client.
use crate::{
    conversations::{Client, Scope},
    store::{Store, Task, digest},
};
use anyhow::{Context, Result, ensure};
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::path::Path;

#[derive(Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Preferences {
    pub revision: u64,
    pub learning_enabled: bool,
    pub suggestions_enabled: bool,
    pub interval_seconds: u64,
    pub lookback_days: u32,
    pub max_candidates: usize,
    pub max_requests_per_day: u64,
    pub client: Option<Client>,
    pub excluded_projects: Vec<String>,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            revision: 1,
            learning_enabled: true,
            suggestions_enabled: true,
            interval_seconds: 86400,
            lookback_days: 7,
            max_candidates: 3,
            max_requests_per_day: 6,
            client: None,
            excluded_projects: vec![],
        }
    }
}
impl Preferences {
    pub(crate) fn excludes(&self, root: &str) -> bool {
        self.excluded_projects
            .iter()
            .any(|p| p == root || digest(&root).is_ok_and(|id| p == &id))
    }
}
impl Store {
    pub fn preferences(&self) -> Result<Preferences> {
        let body: Option<String> = self
            .db
            .query_row(
                "SELECT body FROM installation WHERE key='preferences'",
                [],
                |r| r.get(0),
            )
            .optional()?;
        body.map(|s| serde_json::from_str(&s).map_err(Into::into))
            .unwrap_or_else(|| Ok(Preferences::default()))
    }
    pub(crate) fn default_client(&self) -> Result<Client> {
        if let Some(client) = self.preferences()?.client {
            return Ok(client);
        }
        let remembered: Option<String> = self
            .db
            .query_row(
                "SELECT body FROM installation WHERE key='last_client'",
                [],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(client) = remembered
            .map(|s| serde_json::from_str::<Client>(&s))
            .transpose()?
            && crate::client_process::executable(client.name()).is_ok()
        {
            return Ok(client);
        }
        if crate::client_process::executable("codex").is_ok() {
            return Ok(Client::Codex);
        }
        crate::client_process::executable("claude")?;
        Ok(Client::Claude)
    }
    pub(crate) fn remember_client(&self, name: &str) -> Result<()> {
        let client = if name.to_lowercase().contains("claude") {
            Some(Client::Claude)
        } else if name.to_lowercase().contains("codex") {
            Some(Client::Codex)
        } else {
            None
        };
        if let Some(client) = client {
            self.db.execute("INSERT INTO installation(key,body) VALUES('last_client',?1) ON CONFLICT(key) DO UPDATE SET body=excluded.body",[serde_json::to_string(&client)?])?;
        }
        Ok(())
    }
    fn check_native_cycle(&self, cycle: i64) -> Result<()> {
        let (project,started,status,revision,project_revision):(String,i64,String,u64,u64)=self.db.query_row("SELECT project,started,status,revision,project_revision FROM native_cycles WHERE id=?1",[cycle],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?)))?;
        ensure!(
            status == "running"
                && self.preferences()?.revision == revision
                && self.project(&project)?.revision == project_revision,
            "learning was cancelled or settings changed"
        );
        ensure!(
            crate::background::now()? < started + 600,
            "learning cycle deadline exceeded"
        );
        Ok(())
    }
    fn native_request(
        &self,
        cycle: i64,
        client: Client,
        purpose: &str,
        packet: Value,
        field: &str,
        fingerprint: &str,
    ) -> Result<String> {
        self.check_native_cycle(cycle)?;
        ensure!(
            serde_json::to_vec(&packet)?.len() <= 480 * 1024,
            "authoring packet exceeds limit"
        );
        let cached:Option<String>=self.db.query_row("SELECT response FROM native_requests WHERE fingerprint=?1 AND purpose=?2 AND status='completed' ORDER BY id DESC LIMIT 1",params![fingerprint,purpose],|r|r.get(0)).optional()?;
        if let Some(body) = cached {
            return serde_json::from_str::<Value>(&body)?[field]
                .as_str()
                .map(str::to_owned)
                .context("cached response lacks requested field");
        }
        let now = crate::background::now()?;
        let prefs = self.preferences()?;
        let project_id: String = self.db.query_row(
            "SELECT project FROM native_cycles WHERE id=?1",
            [cycle],
            |r| r.get(0),
        )?;
        let settings = self.project(&project_id)?.settings;
        let connection = settings.model;
        let author = if connection.is_some() {
            "configured_model"
        } else {
            client.name()
        };
        let body = connection
            .as_ref()
            .map(|m| crate::model::configured_request(m, &packet, field))
            .transpose()?;
        let amount = connection.as_ref().map_or(0, |m| {
            (((body.as_ref().map_or(0, Vec::len) as u64 + 8192) * m.input_price
                + u64::from(m.max_output_tokens) * m.output_price)
                .div_ceil(1_000_000))
            .max(1)
        });
        let tx = rusqlite::Transaction::new_unchecked(
            &self.db,
            rusqlite::TransactionBehavior::Immediate,
        )?;
        self.check_native_cycle(cycle)?;
        let count: u64 = tx.query_row(
            "SELECT count(*) FROM native_requests WHERE status!='unavailable' AND started>=?1",
            [now / 86400 * 86400],
            |r| r.get(0),
        )?;
        let group_count: u64 = tx.query_row(
            "SELECT count(*) FROM native_requests WHERE status!='unavailable' AND fingerprint=?1",
            [fingerprint],
            |r| r.get(0),
        )?;
        ensure!(group_count < 2, "candidate authoring attempts exhausted");
        ensure!(
            count < prefs.max_requests_per_day,
            "daily authoring request allowance exhausted"
        );
        if connection.is_some() {
            let day = now / 86400;
            tx.execute(
                "INSERT OR IGNORE INTO budgets(project,day,reserved) VALUES(?1,?2,0)",
                params![project_id, day],
            )?;
            ensure!(tx.execute("UPDATE budgets SET reserved=reserved+?3 WHERE project=?1 AND day=?2 AND reserved+?3<=?4",params![project_id,day,amount,settings.daily_budget_microusd])?==1,"configured model budget exhausted");
        }
        tx.execute("INSERT INTO native_requests(cycle,started,client,purpose,status,fingerprint,reserved_microusd) VALUES(?1,?2,?3,?4,'reserved',?5,?6)",params![cycle,now,author,purpose,fingerprint,amount])?;
        let id = tx.last_insert_rowid();
        tx.commit()?;
        let result = if let Some(connection) = &connection {
            crate::model::author_configured(
                connection,
                body.context("configured request missing")?,
                field,
            )
        } else {
            crate::model::author_client(client, packet, field)
        };
        match result {
            Ok((value, usage)) => {
                self.db.execute("UPDATE native_requests SET status='completed',usage=?2,response=?3 WHERE id=?1",params![id,usage.map(|v|json!({"client":author,"provenance":if connection.is_some(){"provider_reported"}else{"client_reported"},"usage":v}).to_string()),value.to_string()])?;
                self.check_native_cycle(cycle)?;
                Ok(value[field]
                    .as_str()
                    .context("missing authoring field")?
                    .to_owned())
            }
            Err(e) => {
                self.db.execute(
                    "UPDATE native_requests SET status=?2 WHERE id=?1",
                    params![
                        id,
                        if e.is::<crate::model::ClientUnavailable>() {
                            "unavailable"
                        } else {
                            "failed"
                        }
                    ],
                )?;
                Err(e)
            }
        }
    }
    fn queue_learning(&self, project: &str, scope: Scope, automatic: bool) -> Result<i64> {
        let prefs = self.preferences()?;
        let selected = self.project(project)?;
        ensure!(!automatic || prefs.learning_enabled, "learning is paused");
        ensure!(
            scope == Scope::All || !prefs.excludes(selected.root.to_string_lossy().as_ref()),
            "project is excluded"
        );
        let tx = rusqlite::Transaction::new_unchecked(
            &self.db,
            rusqlite::TransactionBehavior::Immediate,
        )?;
        let scope = if scope == Scope::All {
            "all"
        } else {
            "project"
        };
        let current:Option<i64>=tx.query_row("SELECT id FROM native_cycles WHERE project=?1 AND scope=?2 AND status IN ('queued','running') AND started>?3 ORDER BY id DESC LIMIT 1",params![project,scope,crate::background::now()?-600],|r|r.get(0)).optional()?;
        if let Some(id) = current {
            return Ok(id);
        }
        let count: u64 = tx.query_row(
            "SELECT count(*) FROM native_cycles WHERE status='queued'",
            [],
            |r| r.get(0),
        )?;
        ensure!(count < 8, "learning queue is full");
        tx.execute("INSERT INTO native_cycles(project,started,status,revision,project_revision,scope,automatic) VALUES(?1,?2,'queued',?3,?4,?5,?6)",params![project,crate::background::now()?,prefs.revision,selected.revision,scope,automatic])?;
        let id = tx.last_insert_rowid();
        tx.commit()?;
        Ok(id)
    }
    fn launch_learning(&self, cycle: i64, executable: &Path) -> Result<()> {
        use std::os::unix::process::CommandExt;
        let path = self
            .db
            .path()
            .context("learning requires a persistent store")?;
        let mut child = std::process::Command::new(executable)
            .args(["--store", path, "learning-job", &cycle.to_string()])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .process_group(0)
            .spawn()?;
        std::thread::spawn(move || {
            let _ = child.wait();
        });
        Ok(())
    }
    pub fn start_learning(&self, project: &str, scope: Scope, executable: &Path) -> Result<Value> {
        let cycle = self.queue_learning(project, scope, false)?;
        let status: String = self.db.query_row(
            "SELECT status FROM native_cycles WHERE id=?1",
            [cycle],
            |r| r.get(0),
        )?;
        if status == "queued" {
            self.launch_learning(cycle, executable)?;
        }
        Ok(
            json!({"cycle":cycle,"status":status,"next":"Use learning_status to inspect completion; ordinary work can continue."}),
        )
    }
    pub fn learn_now(&mut self, project: &str, scope: Scope, executable: &Path) -> Result<Value> {
        let mut result = self.learn_cycle(project, scope, executable, false)?;
        let cycle = result["cycle"]
            .as_i64()
            .context("learning result lacks cycle")?;
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(610);
        loop {
            if !matches!(result["status"].as_str(), Some("queued" | "running")) {
                // Another worker may have finished the reused cycle.
                let report: String = self.db.query_row(
                    "SELECT report FROM native_cycles WHERE id=?1",
                    [cycle],
                    |r| r.get(0),
                )?;
                return Ok(
                    json!({"cycle":cycle,"status":result["status"],"report":serde_json::from_str::<Value>(&report)?}),
                );
            }
            ensure!(
                std::time::Instant::now() < deadline,
                "learning is still queued or running; inspect learning-status"
            );
            std::thread::sleep(std::time::Duration::from_millis(100));
            result = self.execute_learning(cycle, executable)?;
        }
    }
    pub(crate) fn learn_cycle(
        &mut self,
        project: &str,
        scope: Scope,
        executable: &Path,
        automatic: bool,
    ) -> Result<Value> {
        let cycle = self.queue_learning(project, scope, automatic)?;
        self.execute_learning(cycle, executable)
    }
    pub fn execute_learning(&mut self, cycle: i64, executable: &Path) -> Result<Value> {
        let lock = match crate::background::ProjectLock::acquire(self, "user-conversation-learning")
        {
            Ok(lock) => lock,
            Err(e) if e.to_string().contains("already running") => {
                return Ok(json!({"cycle":cycle,"status":"queued"}));
            }
            Err(e) => return Err(e),
        };
        let (project, scope, automatic, status): (String, String, bool, String) =
            self.db.query_row(
                "SELECT project,scope,automatic,status FROM native_cycles WHERE id=?1",
                [cycle],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )?;
        if status != "queued" {
            return Ok(json!({"cycle":cycle,"status":status}));
        }
        self.db.execute(
            "UPDATE native_requests SET status='interrupted' WHERE status='reserved'",
            [],
        )?;
        self.db.execute(
            "UPDATE native_cycles SET status='interrupted' WHERE status='running'",
            [],
        )?;
        self.db.execute(
            "UPDATE native_cycles SET status='running',started=?2 WHERE id=?1",
            params![cycle, crate::background::now()?],
        )?;
        let scope = if scope == "all" {
            Scope::All
        } else {
            Scope::Project
        };
        let prefs = self.preferences()?;
        let result = self.check_native_cycle(cycle).and_then(|()| {
            self.conversation_cycle(&project, scope, executable, automatic, cycle, &prefs)
        });
        let (status, report) = match result {
            Ok(v) => (
                if v["outcomes"]
                    .as_array()
                    .is_some_and(|a| a.iter().any(|o| o["status"] == "failed"))
                {
                    "failed"
                } else {
                    "completed"
                },
                v,
            ),
            Err(e) => (
                "failed",
                json!({"error":e.to_string().chars().take(4096).collect::<String>()}),
            ),
        };
        self.db.execute(
            "UPDATE native_cycles SET status=?2,report=?3 WHERE id=?1",
            params![cycle, status, report.to_string()],
        )?;
        drop(lock);
        let next: Option<i64> = self
            .db
            .query_row(
                "SELECT id FROM native_cycles WHERE status='queued' ORDER BY id LIMIT 1",
                [],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(next) = next {
            self.launch_learning(next, executable)?;
        }
        Ok(json!({"cycle":cycle,"status":status,"report":report}))
    }
    fn conversation_cycle(
        &mut self,
        project: &str,
        scope: Scope,
        executable: &Path,
        automatic: bool,
        cycle: i64,
        prefs: &Preferences,
    ) -> Result<Value> {
        let mut sessions = vec![];
        let mut coverage = vec![];
        for client in [Client::Codex, Client::Claude] {
            let mut cursor = None;
            for _ in 0..4 {
                self.check_native_cycle(cycle)?;
                let page = self.recent_conversations(
                    project,
                    scope,
                    Some(client),
                    prefs.lookback_days,
                    cursor.as_deref(),
                )?;
                coverage.extend(page["errors"].as_array().unwrap().iter().cloned());
                sessions.extend(
                    page["conversations"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .filter(|v| !prefs.excludes(v["project"].as_str().unwrap_or("")))
                        .cloned(),
                );
                cursor = page["continuations"][client.name()]
                    .as_str()
                    .map(str::to_owned);
                if cursor.is_none() {
                    break;
                }
            }
            if cursor.is_some() {
                coverage.push(json!({"client":client.name(),"status":"more_history_available"}));
            }
        }
        sessions.sort_by_key(|v| std::cmp::Reverse(v["updated_at"].as_i64().unwrap_or(0)));
        sessions.dedup_by(|a, b| a["id"] == b["id"]);
        let mut packets = vec![];
        let mut used_bytes = 0;
        for session in sessions.iter().take(12) {
            self.check_native_cycle(cycle)?;
            let id = session["id"].as_str().context("conversation lacks ID")?;
            match self.read_conversation(project, id, scope, None) {
                Ok(page) => {
                    let items = page["items"].as_array().unwrap();
                    if items.is_empty() {
                        continue;
                    }
                    let size = page.to_string().len();
                    if used_bytes + size > 384 * 1024 {
                        coverage.push(json!({"status":"evidence_byte_limit"}));
                        break;
                    }
                    used_bytes += size;
                    if !page["next_cursor"].is_null() || page["coverage"] != "page" {
                        coverage.push(json!({"conversation":id,"status":"partial_conversation","coverage":page["coverage"],"order":page["order"],"next_cursor":page["next_cursor"]}));
                    }
                    packets.push(page);
                }
                Err(e) => coverage.push(json!({"conversation":id,"error":e.to_string()})),
            }
        }
        let mut pending=self.db.prepare("SELECT report FROM native_candidates WHERE status='pending' AND json_extract(report,'$.project')=?1 AND json_extract(report,'$.scope')=?2 ORDER BY rowid LIMIT 3")?;
        let pending: Vec<String> = pending
            .query_map(
                params![
                    project,
                    if scope == Scope::All {
                        "all"
                    } else {
                        "project"
                    }
                ],
                |r| r.get(0),
            )?
            .collect::<rusqlite::Result<_>>()?;
        let mut groups: Vec<Vec<Value>> = pending
            .into_iter()
            .map(|s| -> Result<Vec<Value>> {
                Ok(serde_json::from_str::<Value>(&s)?["packet"]
                    .as_array()
                    .context("invalid pending candidate")?
                    .clone())
            })
            .collect::<Result<_>>()?;
        let has_pending = !groups.is_empty();
        if packets.is_empty() && !has_pending {
            return Ok(
                json!({"outcomes":[],"coverage":coverage,"status":"no_readable_conversations"}),
            );
        }
        // Background candidates require repeated user work before spending on interpretation.
        let users = packets
            .iter()
            .flat_map(|p| p["items"].as_array().unwrap())
            .filter(|i| matches!(i["kind"].as_str(), Some("user" | "userMessage")))
            .count();
        if automatic && users < 3 && !has_pending {
            return Ok(
                json!({"outcomes":[],"coverage":coverage,"status":"insufficient_repeated_work"}),
            );
        }
        let client = if self.project(project)?.settings.model.is_some() {
            Client::Codex
        } else {
            self.default_client()?
        };
        let mut outcomes = vec![];
        groups.extend(packets.chunks(4).map(|p| p.to_vec()));
        for packet in groups.iter().take(prefs.max_candidates) {
            if packet
                .iter()
                .any(|p| prefs.excludes(p["project"].as_str().unwrap_or("")))
            {
                continue;
            }
            let mut packet = packet.clone();
            let mut remaining = 20;
            for page in &mut packet {
                let items = page["items"]
                    .as_array_mut()
                    .context("candidate page lacks items")?;
                items.truncate(remaining);
                remaining -= items.len();
            }
            self.check_native_cycle(cycle)?;
            let ids: Vec<String> = packet
                .iter()
                .flat_map(|p| p["items"].as_array().unwrap())
                .filter_map(|v| v["evidence_id"].as_str().map(str::to_owned))
                .take(20)
                .collect();
            if ids.is_empty() {
                continue;
            }
            let fingerprint = digest(&(project, &ids))?;
            let seen: bool = self.db.query_row(
                "SELECT EXISTS(SELECT 1 FROM native_candidates WHERE fingerprint=?1 AND status!='pending')",
                [&fingerprint],
                |r| r.get(0),
            )?;
            if seen {
                continue;
            }
            self.db.execute("INSERT OR IGNORE INTO native_candidates(fingerprint,status,report) VALUES(?1,'pending',?2)",params![fingerprint,json!({"project":project,"scope":scope,"packet":packet}).to_string()])?;
            let mut prepared_task = None;
            let result = (|| -> Result<Value> {
                let extracted=self.native_request(cycle,client,"extract",json!({"instruction":"Find one repeated read/transform workflow that can become reusable TypeScript. Return candidate_json containing JSON null when evidence is insufficient, otherwise an object with task (contract,cases,optional evaluation) and applicability. Use actual transcript evidence where available. Cases are interpretations: distinguish inferred rules in the contract description. Provide at least three varied cases, including a boundary or handoff. Do not put evidence or project in task. Do not invent observed results. Existing generated Clearings work is not new learning material. Select behavior that generalizes; do not hardcode outputs. Routine capabilities are files.read/files.list only or no capabilities. No shell or write effects.","sdk":include_str!("../../../sdk/clearings.d.ts"),"task_shape":{"contract":{"abi":1,"name":"short-name","description":"Precise behavior and limits","input_schema":{},"output_schema":{},"capabilities":[]},"cases":[{"name":"example","input":{},"expected":{"status":"completed","output":{}}}]},"conversations":packet}),"candidate_json",&fingerprint)?;
                let proposed: Value =
                    serde_json::from_str(&extracted).context("candidate extraction is not JSON")?;
                if proposed.is_null() {
                    return Ok(json!({"status":"no_candidate"}));
                }
                let task: Task = serde_json::from_value(proposed["task"].clone())?;
                ensure!(
                    task.cases.len() >= 3 && task.cases.len() <= 8,
                    "candidate needs 3 to 8 varied acceptance cases"
                );
                ensure!(
                    task.contract
                        .capabilities
                        .iter()
                        .all(|c| matches!(c.as_str(), "files.read" | "files.list")),
                    "automatic candidate requests unsupported effects"
                );
                let applicability = proposed["applicability"]
                    .as_str()
                    .filter(|s| !s.trim().is_empty());
                ensure!(
                    applicability.is_none_or(|s| s.len() <= 4000),
                    "routine applicability exceeds 4000 bytes"
                );
                let name = task.contract.name.clone();
                if self.project(project)?.settings.excludes(&name) {
                    return Ok(json!({"status":"excluded","name":name}));
                }
                if let Ok(existing) = self.named_task(project, &name, false) {
                    let was_active: bool = self.db.query_row(
                        "SELECT EXISTS(SELECT 1 FROM component_changes WHERE task=?1)",
                        [&existing],
                        |r| r.get(0),
                    )?;
                    if self.active(&existing)?.is_some() || was_active {
                        return Ok(json!({"status":"existing_requirements","name":name}));
                    }
                }
                let prepared =
                    self.prepare_conversation_task(project, task.clone(), &ids, scope)?;
                let task_id = prepared["task"].as_str().context("task not prepared")?;
                prepared_task = Some(task_id.to_owned());
                let source=self.native_request(cycle,client,"source",json!({"instruction":"Return source: a default-exported async TypeScript function implementing this frozen contract. Use fresh inputs and SDK capabilities. One acceptance case is withheld. Never hardcode examples. Return needs_agent or not_applicable for unsupported cases. No imports, ambient Node APIs, shell, or direct network.","sdk":include_str!("../../../sdk/clearings.d.ts"),"contract":task.contract,"cases":&task.cases[..task.cases.len()-1]}),"source",&fingerprint)?;
                self.check_native_cycle(cycle)?;
                let version = self.submit(executable, task_id, source)?;
                ensure!(
                    self.evaluate(executable, &version)?["accepted"] == true,
                    "candidate failed acceptance"
                );
                self.promote_conversation(cycle, project, task_id, &version, applicability)?;
                Ok(
                    json!({"status":"created","name":name,"task":task_id,"version":version,"evidence":"conversation interpretation with a withheld case","savings":null}),
                )
            })();
            let unavailable = result
                .as_ref()
                .is_err_and(|e| e.is::<crate::model::ClientUnavailable>());
            let report = match result {
                Ok(v) => v,
                Err(e) => {
                    json!({"status":"failed","task":prepared_task,"error":e.to_string().chars().take(4096).collect::<String>()})
                }
            };
            let is_budget = report["error"].as_str().is_some_and(|s| {
                s.contains("allowance exhausted") || s.contains("budget exhausted")
            });
            let interrupted = self.check_native_cycle(cycle).is_err();
            if !is_budget && !interrupted && !unavailable {
                if report["status"] == "failed"
                    && let Some(task) = &prepared_task
                {
                    self.db.execute("DELETE FROM project_routines WHERE project=?1 AND task=?2 AND origin='conversation' AND paused=0 AND excluded=0 AND previous IS NULL AND NOT EXISTS(SELECT 1 FROM active WHERE task=?2) AND NOT EXISTS(SELECT 1 FROM component_changes WHERE task=?2)",params![project,task])?;
                }
                self.db.execute(
                    "UPDATE native_candidates SET status=?2,report=?3 WHERE fingerprint=?1",
                    params![fingerprint, report["status"].as_str(), report.to_string()],
                )?;
            }
            outcomes.push(report);
            if is_budget || interrupted || unavailable {
                break;
            }
        }
        Ok(
            json!({"outcomes":outcomes,"coverage":coverage,"scope":scope,"sessions_considered":sessions.len(),"status":"reviewed","savings":null}),
        )
    }
    fn promote_conversation(
        &self,
        cycle: i64,
        project: &str,
        task: &str,
        version: &str,
        applicability: Option<&str>,
    ) -> Result<()> {
        self.check_native_cycle(cycle)?;
        let tx = rusqlite::Transaction::new_unchecked(
            &self.db,
            rusqlite::TransactionBehavior::Immediate,
        )?;
        let valid:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM native_cycles n JOIN projects p ON p.id=n.project WHERE n.id=?1 AND n.status='running' AND p.revision=n.project_revision AND n.revision=COALESCE((SELECT json_extract(body,'$.revision') FROM installation WHERE key='preferences'),1) AND EXISTS(SELECT 1 FROM project_routines r WHERE r.project=n.project AND r.task=?2 AND r.paused=0 AND r.excluded=0))",params![cycle,task],|r|r.get(0))?;
        ensure!(
            valid,
            "learning was cancelled or settings changed before promotion"
        );
        ensure!(tx.execute("INSERT INTO active(task,version) SELECT ?1,?2 WHERE NOT EXISTS(SELECT 1 FROM active WHERE task=?1)",params![task,version])?==1,"routine changed during authoring");
        tx.execute("INSERT INTO component_changes(project,task,version,reason) VALUES(?1,?2,?3,'conversation_created')",params![project,task,version])?;
        if let Some(applicability) = applicability {
            tx.execute("INSERT INTO routine_library(task,applicability) VALUES(?1,?2) ON CONFLICT(task) DO UPDATE SET applicability=excluded.applicability",params![task,applicability])?;
        }
        tx.commit()?;
        Ok(())
    }
    pub fn learning_status(&self) -> Result<Value> {
        let mut stmt = self.db.prepare(
            "SELECT id,started,status,report FROM native_cycles ORDER BY id DESC LIMIT 10",
        )?;
        let cycles:Vec<Value>=stmt.query_map([],|r|Ok(json!({"id":r.get::<_,i64>(0)?,"started":r.get::<_,i64>(1)?,"status":r.get::<_,String>(2)?,"report":serde_json::from_str::<Value>(&r.get::<_,String>(3)?).map_err(|e|rusqlite::Error::FromSqlConversionFailure(3,rusqlite::types::Type::Text,Box::new(e)))?})))?.collect::<rusqlite::Result<_>>()?;
        let count: u64 = self.db.query_row(
            "SELECT count(*) FROM native_requests WHERE status!='unavailable' AND started>=?1",
            [crate::background::now()? / 86400 * 86400],
            |r| r.get(0),
        )?;
        let mut statement = self.db.prepare(
            "SELECT id,client,purpose,status,usage FROM native_requests ORDER BY id DESC LIMIT 20",
        )?;
        let requests:Vec<Value>=statement.query_map([],|r|Ok(json!({"id":r.get::<_,i64>(0)?,"client":r.get::<_,String>(1)?,"purpose":r.get::<_,String>(2)?,"status":r.get::<_,String>(3)?,"usage":r.get::<_,Option<String>>(4)?.and_then(|s|serde_json::from_str::<Value>(&s).ok())})))?.collect::<rusqlite::Result<_>>()?;
        Ok(
            json!({"preferences":self.preferences()?,"recent_cycles":cycles,"requests_today":count,"recent_requests":requests,"usage_kind":"client reported usage; request limits are not dollar guarantees"}),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn escaped_http_body_is_rejected_before_reservation() {
        let temp = tempfile::tempdir().unwrap();
        let mut store = Store::open(&temp.path().join("state.db")).unwrap();
        let settings=serde_json::from_value(json!({"model":{"url":"http://127.0.0.1:9/chat","model":"fixture","max_output_tokens":1024,"input_price":1,"output_price":1},"daily_budget_microusd":100})).unwrap();
        let p = store
            .configure_project(temp.path(), "P", settings, None)
            .unwrap();
        let cycle = store.queue_learning(&p.id, Scope::Project, false).unwrap();
        store
            .db
            .execute(
                "UPDATE native_cycles SET status='running' WHERE id=?1",
                [cycle],
            )
            .unwrap();
        let packet = json!({"text":"\\".repeat(180000)});
        assert!(packet.to_string().len() < 480 * 1024);
        let err = store
            .native_request(
                cycle,
                Client::Codex,
                "extract",
                packet,
                "candidate_json",
                "fixture",
            )
            .unwrap_err();
        assert!(err.is::<crate::model::RequestTooLarge>(), "{err}");
        for table in ["native_requests", "budgets"] {
            assert_eq!(
                store
                    .db
                    .query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r
                        .get::<_, i64>(0))
                    .unwrap(),
                0
            );
        }
    }
    #[test]
    fn connected_client_does_not_overwrite_explicit_client_preference() {
        let temp = tempfile::tempdir().unwrap();
        let store = Store::open(&temp.path().join("state.db")).unwrap();
        store
            .db
            .execute(
                "INSERT INTO installation(key,body) VALUES('preferences','{\"client\":null}')",
                [],
            )
            .unwrap();
        store.remember_client("claude").unwrap();
        assert_eq!(
            store
                .db
                .query_row(
                    "SELECT body FROM installation WHERE key='last_client'",
                    [],
                    |r| r.get::<_, String>(0)
                )
                .unwrap(),
            "\"claude\""
        );
        store
            .db
            .execute(
                "UPDATE installation SET body='{\"client\":\"codex\"}' WHERE key='preferences'",
                [],
            )
            .unwrap();
        store.remember_client("claude").unwrap();
        assert!(matches!(
            store.preferences().unwrap().client,
            Some(Client::Codex)
        ));
    }
}
