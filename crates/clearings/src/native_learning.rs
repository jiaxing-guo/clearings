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
    pub work_revision: u64,
    pub model: Option<String>,
    pub learning_enabled: bool,
    pub service_enabled: bool,
    pub improve_enabled: bool,
    pub excluded_workflows: Vec<String>,
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
            work_revision: 1,
            model: None,
            learning_enabled: true,
            service_enabled: true,
            improve_enabled: true,
            excluded_workflows: vec![],
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
        self.excluded_projects.iter().any(|p| {
            (Path::new(p).is_absolute() && Path::new(root).starts_with(p))
                || digest(&root).is_ok_and(|id| p == &id)
        })
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
                && self.preferences()?.work_revision == revision
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
    ) -> Result<Value> {
        self.check_native_cycle(cycle)?;
        ensure!(
            serde_json::to_vec(&packet)?.len() <= 480 * 1024,
            "authoring packet exceeds limit"
        );
        let cached:Option<String>=self.db.query_row("SELECT response FROM native_requests WHERE fingerprint=?1 AND purpose=?2 AND status='completed' ORDER BY id DESC LIMIT 1",params![fingerprint,purpose],|r|r.get(0)).optional()?;
        if let Some(body) = cached {
            return Ok(serde_json::from_str::<Value>(&body)?);
        }
        self.ensure_integration()?;
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
        let repairs: u64 = tx.query_row(
            "SELECT count(*) FROM native_requests WHERE status!='unavailable' AND fingerprint=?1 AND purpose='repair_candidate'",
            [fingerprint], |row| row.get(0),
        )?;
        ensure!(
            purpose != "repair_candidate" || repairs == 0,
            "candidate repair already attempted"
        );
        let limit = if repairs > 0 { 3 } else { 2 };
        ensure!(
            group_count < limit,
            "candidate authoring attempts exhausted"
        );
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
            crate::model::author_client(client, packet, field, prefs.model.as_deref())
        };
        match result {
            Ok((value, usage)) => {
                self.db.execute("UPDATE native_requests SET status='completed',usage=?2,response=?3 WHERE id=?1",params![id,usage.map(|v|json!({"client":author,"provenance":if connection.is_some(){"provider_reported"}else{"client_reported"},"usage":v}).to_string()),value.to_string()])?;
                self.check_native_cycle(cycle)?;
                Ok(value)
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
        tx.execute("INSERT INTO native_cycles(project,started,status,revision,project_revision,scope,automatic) VALUES(?1,?2,'queued',?3,?4,?5,?6)",params![project,crate::background::now()?,prefs.work_revision,selected.revision,scope,automatic])?;
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
    fn pending_conversation_groups(
        &self,
        project: &str,
        scope: Scope,
    ) -> Result<Vec<(String, Vec<Value>)>> {
        let prefs = self.preferences()?;
        let since = crate::background::now()? - i64::from(prefs.lookback_days) * 86400;
        let mut fresh_query = self
            .db
            .prepare("SELECT id FROM conversations WHERE updated>=?1")?;
        let fresh = fresh_query
            .query_map([since], |r| r.get::<_, String>(0))?
            .collect::<rusqlite::Result<std::collections::BTreeSet<_>>>()?;
        drop(fresh_query);
        // Explicit project review may use its own pages from an automatic all-project
        // packet even when the shared scan cursor has already passed those messages.
        if scope == Scope::Project {
            let selected = self.project(project)?;
            let mut query=self.db.prepare("SELECT report FROM native_candidates WHERE status='pending' AND json_extract(report,'$.scope')='all'")?;
            let rows = query
                .query_map([], |r| r.get::<_, String>(0))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            drop(query);
            for body in rows {
                let body: Value = serde_json::from_str(&body)?;
                let pages: Vec<_> = body["packet"]
                    .as_array()
                    .context("pending candidate lacks packet")?
                    .iter()
                    .filter(|p| {
                        p["project"] == selected.root.to_string_lossy().as_ref()
                            && fresh.contains(p["conversation"].as_str().unwrap_or(""))
                            && !prefs.excludes(p["project"].as_str().unwrap_or(""))
                    })
                    .cloned()
                    .collect();
                if pages.is_empty() {
                    continue;
                }
                let ids: Vec<_> = pages
                    .iter()
                    .flat_map(|p| p["items"].as_array().unwrap())
                    .filter_map(|i| i["evidence_id"].as_str())
                    .collect();
                let key = digest(&(project, scope, &ids))?;
                self.db.execute("INSERT OR IGNORE INTO native_candidates(fingerprint,status,report) VALUES(?1,'pending',?2)",params![key,json!({"project":project,"scope":scope,"packet":pages}).to_string()])?;
            }
        }
        let mut excluded=self.db.prepare("SELECT fingerprint,report FROM native_candidates WHERE status='pending' AND json_extract(report,'$.project')=?1 AND json_extract(report,'$.scope')=?2")?;
        let rows = excluded
            .query_map(
                params![
                    project,
                    if scope == Scope::All {
                        "all"
                    } else {
                        "project"
                    }
                ],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
            )?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        drop(excluded);
        for (key, body) in rows {
            let mut body: Value = serde_json::from_str(&body)?;
            let prepared = body["prepared_task"].as_str().map(str::to_owned);
            let pages = body["packet"]
                .as_array_mut()
                .context("pending candidate lacks packet")?;
            let before = pages.len();
            let excluded = pages
                .iter()
                .any(|p| prefs.excludes(p["project"].as_str().unwrap_or("")));
            pages.retain(|p| {
                !prefs.excludes(p["project"].as_str().unwrap_or(""))
                    && fresh.contains(p["conversation"].as_str().unwrap_or(""))
            });
            if pages.len() == before {
                continue;
            }
            let tx = rusqlite::Transaction::new_unchecked(
                &self.db,
                rusqlite::TransactionBehavior::Immediate,
            )?;
            if let Some(task) = prepared {
                self.release_failed_binding(project, &task)?;
            }
            tx.execute(
                "UPDATE native_candidates SET status=?2,report='{}' WHERE fingerprint=?1",
                params![key, if excluded { "excluded" } else { "expired" }],
            )?;
            if !pages.is_empty() {
                let ids: Vec<_> = pages
                    .iter()
                    .flat_map(|p| p["items"].as_array().unwrap())
                    .filter_map(|i| i["evidence_id"].as_str())
                    .collect();
                let next = digest(&(project, scope, &ids))?;
                body.as_object_mut()
                    .context("pending record must be an object")?
                    .remove("prepared_task");
                tx.execute("INSERT OR IGNORE INTO native_candidates(fingerprint,status,report) VALUES(?1,'pending',?2)",params![next,body.to_string()])?;
            }
            tx.commit()?;
        }
        let mut statement=self.db.prepare("SELECT fingerprint,report,EXISTS(SELECT 1 FROM native_requests r WHERE r.fingerprint=c.fingerprint) FROM native_candidates c WHERE status='pending' AND json_extract(report,'$.project')=?1 AND json_extract(report,'$.scope')=?2 ORDER BY rowid LIMIT 24")?;
        let rows = statement
            .query_map(
                params![
                    project,
                    if scope == Scope::All {
                        "all"
                    } else {
                        "project"
                    }
                ],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, bool>(2)?,
                    ))
                },
            )?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        let mut groups = vec![];
        let mut packet = vec![];
        let mut originals = vec![];
        let mut count = 0;
        let flush = |packet: &mut Vec<Value>,
                     originals: &mut Vec<String>,
                     groups: &mut Vec<(String, Vec<Value>)>|
         -> Result<()> {
            if packet.is_empty() {
                return Ok(());
            }
            let ids: Vec<_> = packet
                .iter()
                .flat_map(|p| p["items"].as_array().unwrap())
                .filter_map(|i| i["evidence_id"].as_str())
                .collect();
            let key = digest(&(project, scope, &ids))?;
            let tx = rusqlite::Transaction::new_unchecked(
                &self.db,
                rusqlite::TransactionBehavior::Immediate,
            )?;
            tx.execute("INSERT OR IGNORE INTO native_candidates(fingerprint,status,report) VALUES(?1,'pending',?2)",params![key,json!({"project":project,"scope":scope,"packet":packet}).to_string()])?;
            for original in originals.drain(..).filter(|k| k != &key) {
                tx.execute("UPDATE native_candidates SET status='grouped',report=?2 WHERE fingerprint=?1 AND status='pending'",params![original,json!({"group":key}).to_string()])?;
            }
            tx.commit()?;
            groups.push((key, std::mem::take(packet)));
            Ok(())
        };
        for (id, body, requested) in rows {
            let mut pages = serde_json::from_str::<Value>(&body)?["packet"]
                .as_array()
                .context("invalid pending candidate")?
                .clone();
            let size = pages
                .iter()
                .map(|p| p["items"].as_array().map_or(0, Vec::len))
                .sum::<usize>();
            // Freeze already-requested packets so cached author replies remain usable.
            if requested || count + size > 20 || packet.len() + pages.len() > 4 {
                flush(&mut packet, &mut originals, &mut groups)?;
                count = 0;
            }
            if requested {
                groups.push((id, pages));
                continue;
            }
            count += size;
            packet.append(&mut pages);
            originals.push(id);
        }
        flush(&mut packet, &mut originals, &mut groups)?;
        Ok(groups)
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
        let mut coverage = vec![];
        // Refresh the head on every cycle, then continue the saved metadata backlog.
        for client in [Client::Codex, Client::Claude] {
            let key = format!(
                "history_listing:{}:{}:{}",
                client.name(),
                project,
                serde_json::to_string(&scope)?
            );
            let refresh_key = format!("{key}:refresh");
            let cutoff_key = format!("{key}:cutoff");
            let read = |key: &str| -> Result<Option<String>> {
                Ok(self
                    .db
                    .query_row("SELECT body FROM installation WHERE key=?1", [key], |r| {
                        r.get(0)
                    })
                    .optional()?)
            };
            let save = |key: &str, value: Option<String>| -> Result<()> {
                if let Some(value) = value {
                    self.db.execute("INSERT INTO installation(key,body) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET body=excluded.body",params![key,value])?;
                } else {
                    self.db
                        .execute("DELETE FROM installation WHERE key=?1", [key])?;
                }
                Ok(())
            };
            let mut backlog = read(&key)?;
            let mut refresh: Option<Value> = read(&refresh_key)?
                .map(|s| serde_json::from_str(&s))
                .transpose()?;
            let cutoff = read(&cutoff_key)?.map(|s| s.parse::<i64>()).transpose()?;
            let mut head = refresh.is_none();
            let mut cursor = refresh
                .as_ref()
                .and_then(|r| r["cursor"].as_str().map(str::to_owned));
            for _ in 0..4 {
                self.check_native_cycle(cycle)?;
                let page = self.recent_conversations(
                    project,
                    scope,
                    Some(client),
                    prefs.lookback_days,
                    cursor.as_deref(),
                )?;
                let errors = page["errors"].as_array().unwrap();
                coverage.extend(errors.iter().cloned());
                if errors.iter().any(|e| e.get("source").is_none()) {
                    save(&key, None)?;
                    save(&refresh_key, None)?;
                    break;
                }
                let entries = page["conversations"].as_array().unwrap();
                let next = page["continuations"][client.name()]
                    .as_str()
                    .map(str::to_owned);
                let newest = entries
                    .iter()
                    .filter_map(|v| v["updated_at"].as_i64())
                    .max()
                    .or(cutoff);
                let reached = |boundary: Option<i64>| {
                    boundary.is_some_and(|boundary| {
                        entries
                            .iter()
                            .any(|v| v["updated_at"].as_i64().is_some_and(|t| t <= boundary))
                    })
                };
                if head {
                    head = false;
                    if backlog.is_some() && !reached(cutoff) && next.is_some() {
                        refresh = Some(json!({"cursor":next,"stop":cutoff,"cutoff":newest}));
                        cursor = next;
                    } else {
                        save(&cutoff_key, newest.map(|v| v.to_string()))?;
                        if backlog.is_none() {
                            backlog = next;
                        }
                        cursor = backlog.clone();
                    }
                } else if let Some(progress) = &mut refresh {
                    if next.is_none() || reached(progress["stop"].as_i64()) {
                        save(
                            &cutoff_key,
                            progress["cutoff"].as_i64().map(|v| v.to_string()),
                        )?;
                        refresh = None;
                        cursor = backlog.clone();
                    } else {
                        progress["cursor"] = json!(next);
                        cursor = next;
                    }
                } else {
                    backlog = next.clone();
                    cursor = next;
                }
                save(&key, backlog.clone())?;
                save(&refresh_key, refresh.as_ref().map(Value::to_string))?;
                if cursor.is_none() {
                    break;
                }
            }
            if cursor.is_some() {
                coverage.push(json!({"client":client.name(),"status":"more_history_available"}));
            }
        }
        let selected = self.project(project)?;
        let mut statement = self.db.prepare("SELECT c.id,c.updated,c.root,COALESCE(p.head_updated,0),p.tail_cursor,COALESCE(p.tail_next,0),p.head_cursor,p.head_anchor FROM conversations c LEFT JOIN conversation_progress p ON p.conversation=c.id WHERE c.updated>=?1 AND (?2 OR c.root=?3) AND NOT EXISTS(SELECT 1 FROM json_each(?4) e WHERE c.root=rtrim(e.value,'/') OR substr(c.root,1,length(rtrim(e.value,'/'))+1)=rtrim(e.value,'/')||'/') AND (p.conversation IS NULL OR c.updated>p.head_updated OR p.tail_cursor IS NOT NULL OR p.head_cursor IS NOT NULL) ORDER BY COALESCE(p.reviewed_at,0),c.updated DESC,c.id LIMIT 96")?;
        let sessions = statement
            .query_map(
                params![
                    crate::background::now()? - i64::from(prefs.lookback_days) * 86400,
                    scope == Scope::All,
                    selected.root.to_string_lossy(),
                    serde_json::to_string(&prefs.excluded_projects)?
                ],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, i64>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, i64>(3)?,
                        r.get::<_, Option<String>>(4)?,
                        r.get::<_, bool>(5)?,
                        r.get::<_, Option<String>>(6)?,
                        r.get::<_, Option<String>>(7)?,
                    ))
                },
            )?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        drop(statement);
        let mut used_bytes = 0;
        // Give each eligible conversation a turn, then use spare page capacity
        // to continue long conversations within the same bounded cycle.
        let mut pages: std::collections::VecDeque<_> = sessions
            .iter()
            .filter(|s| !prefs.excludes(&s.2))
            .cloned()
            .collect();
        let mut pages_attempted = 0;
        while let Some((id, updated, root, head, tail, tail_next, refresh, anchor)) =
            pages.pop_front()
        {
            if pages_attempted == 12 {
                break;
            }
            pages_attempted += 1;
            self.check_native_cycle(cycle)?;
            let refresh: Option<Value> =
                refresh.as_deref().map(serde_json::from_str).transpose()?;
            let reading_refresh = refresh.is_some();
            let reading_tail = !reading_refresh && tail.is_some() && (tail_next || head >= updated);
            let cursor = if let Some(refresh) = &refresh {
                refresh["cursor"].as_str()
            } else if reading_tail {
                tail.as_deref()
            } else {
                None
            };
            match self.read_conversation(project, &id, scope, cursor) {
                Ok(page) => {
                    let size = page.to_string().len();
                    if used_bytes > 0 && used_bytes + size > 1024 * 1024 {
                        coverage.push(json!({"status":"evidence_byte_limit"}));
                        break;
                    }
                    used_bytes += size;
                    if !page["next_cursor"].is_null() || page["coverage"] != "page" {
                        coverage.push(json!({"conversation":id,"status":"partial_conversation","coverage":page["coverage"],"order":page["order"],"next_cursor":page["next_cursor"]}));
                    }
                    let items = page["items"]
                        .as_array()
                        .context("conversation page lacks items")?;
                    let tx = rusqlite::Transaction::new_unchecked(
                        &self.db,
                        rusqlite::TransactionBehavior::Immediate,
                    )?;
                    // Save every bounded packet before advancing its cursor. Budget exhaustion
                    // must not discard conversations which have already been read.
                    for chunk in items.chunks(20) {
                        let mut packet = page.clone();
                        packet["items"] = json!(chunk);
                        let ids: Vec<_> = chunk
                            .iter()
                            .filter_map(|i| i["evidence_id"].as_str())
                            .collect();
                        let fingerprint = digest(&(project, scope, &ids))?;
                        tx.execute("INSERT OR IGNORE INTO native_candidates(fingerprint,status,report) VALUES(?1,'pending',?2)",params![fingerprint,json!({"project":project,"scope":scope,"packet":[packet]}).to_string()])?;
                    }
                    let next = page["next_cursor"].as_str();
                    let stop = if let Some(refresh) = &refresh {
                        refresh["stop"].as_str()
                    } else {
                        anchor.as_deref()
                    };
                    let reached =
                        stop.is_some_and(|stop| items.iter().any(|i| i["evidence_id"] == stop));
                    let fresh_head = !reading_tail && !reading_refresh;
                    let next_refresh = if !reading_tail && (head > 0 || reading_refresh) && !reached
                    {
                        next.map(|cursor| json!({"cursor":cursor,"stop":stop}).to_string())
                    } else {
                        None
                    };
                    let next_tail = if reading_tail || (fresh_head && head == 0) {
                        next
                    } else {
                        tail.as_deref()
                    };
                    let next_anchor = if fresh_head {
                        items
                            .first()
                            .and_then(|i| i["evidence_id"].as_str())
                            .or(anchor.as_deref())
                    } else {
                        anchor.as_deref()
                    };
                    tx.execute("INSERT INTO conversation_progress(conversation,head_updated,tail_cursor,tail_next,reviewed_at,head_cursor,head_anchor) VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(conversation) DO UPDATE SET head_updated=excluded.head_updated,tail_cursor=excluded.tail_cursor,tail_next=excluded.tail_next,reviewed_at=excluded.reviewed_at,head_cursor=excluded.head_cursor,head_anchor=excluded.head_anchor",params![id,if fresh_head{updated}else{head},next_tail,!reading_tail,crate::background::now()?,next_refresh,next_anchor])?;
                    tx.commit()?;
                    if next_tail.is_some() || next_refresh.is_some() {
                        pages.push_back((
                            id,
                            updated,
                            root,
                            if fresh_head { updated } else { head },
                            next_tail.map(str::to_owned),
                            !reading_tail,
                            next_refresh,
                            next_anchor.map(str::to_owned),
                        ));
                    }
                }
                Err(e) => {
                    coverage.push(json!({"conversation":id,"error":e.to_string()}));
                    self.db.execute("INSERT INTO conversation_progress(conversation,reviewed_at) VALUES(?1,?2) ON CONFLICT(conversation) DO UPDATE SET reviewed_at=excluded.reviewed_at",params![id,crate::background::now()?])?;
                    // Retry an expired content cursor from the newest page next time.
                    if reading_tail || reading_refresh {
                        self.db.execute("UPDATE conversation_progress SET tail_cursor=NULL,head_cursor=NULL,head_anchor=NULL,head_updated=0 WHERE conversation=?1",[id])?;
                    }
                }
            }
        }
        let groups = self.pending_conversation_groups(project, scope)?;
        let improvement = if automatic && prefs.improve_enabled {
            self.select_native_improvement(project, scope, prefs)?
        } else {
            None
        };
        if groups.is_empty() && improvement.is_none() {
            return Ok(json!({"outcomes":[],"coverage":coverage,"status":"no_pending_work"}));
        }
        let client = if self.project(project)?.settings.model.is_some() {
            Client::Codex
        } else {
            self.default_client()?
        };
        let mut outcomes = vec![];
        let new_limit = prefs
            .max_candidates
            .saturating_sub(usize::from(improvement.is_some()));
        let mut attempts = 0;
        let mut author_unavailable = false;
        for (fingerprint, packet) in &groups {
            if attempts >= new_limit {
                break;
            }
            if packet
                .iter()
                .any(|p| prefs.excludes(p["project"].as_str().unwrap_or("")))
            {
                continue;
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
            let seen: bool = self.db.query_row(
                "SELECT EXISTS(SELECT 1 FROM native_candidates WHERE fingerprint=?1 AND status!='pending')",
                [&fingerprint],
                |r| r.get(0),
            )?;
            if seen {
                continue;
            }
            let meaningful = packet
                .iter()
                .flat_map(|p| p["items"].as_array().unwrap())
                .filter(|i| {
                    matches!(
                        i["kind"].as_str(),
                        Some("user" | "userMessage" | "commandExecution" | "mcpToolCall")
                    )
                })
                .count();
            if automatic && meaningful < 3 {
                coverage.push(json!({"status":"awaiting_repeated_evidence"}));
                continue;
            }
            attempts += 1;
            let mut prepared_task = None;
            let result = (|| -> Result<Value> {
                let extraction = json!({"instruction":crate::prompts::EXTRACT_WORKFLOW,"learning_mode":if automatic {"scheduled"} else {"explicit"},"sdk":crate::api::sdk_definition(),"response_schema":crate::proposal::response_schema("candidate"),"excluded_workflows":prefs.excluded_workflows,"conversations":packet});
                let extracted = self.native_request(
                    cycle,
                    client,
                    "extract",
                    extraction.clone(),
                    "candidate",
                    fingerprint,
                )?;
                let proposal = match crate::proposal::parse(extracted.clone()) {
                    Ok(candidate) => candidate,
                    Err(error) => {
                        let repair = crate::proposal::repair_packet(
                            extraction,
                            extracted,
                            &format!("{error:#}"),
                        )?;
                        let repaired = self.native_request(
                            cycle,
                            client,
                            "repair_candidate",
                            repair,
                            "candidate",
                            fingerprint,
                        )?;
                        crate::proposal::parse(repaired)
                            .context("candidate remains invalid after one repair")?
                    }
                };
                let Some(candidate) = proposal else {
                    return Ok(json!({"status":"no_candidate"}));
                };
                let task = candidate.task;
                let applicability = Some(candidate.applicability.as_str());
                let name = task.contract.name.clone();
                if prefs
                    .excluded_workflows
                    .iter()
                    .any(|n| n == &name || name.starts_with(&format!("{n}/")))
                {
                    return Ok(json!({"status":"excluded","name":name}));
                }
                for root in packet.iter().filter_map(|p| p["project"].as_str()) {
                    let source = digest(&root)?;
                    let controlled:bool=self.db.query_row("SELECT EXISTS(SELECT 1 FROM project_routines WHERE project=?1 AND name=?2 AND (paused=1 OR excluded=1))",params![source,name],|r|r.get(0))?;
                    if controlled
                        || self
                            .project(&source)
                            .is_ok_and(|p| p.settings.excludes(&name))
                    {
                        return Ok(json!({"status":"excluded","name":name}));
                    }
                }
                if self.project(project)?.settings.excludes(&name) {
                    return Ok(json!({"status":"excluded","name":name}));
                }
                let shared:bool=self.db.query_row("SELECT EXISTS(SELECT 1 FROM routine_library l JOIN objects o ON o.id=l.task WHERE json_extract(o.body,'$.contract.name')=?1)",[&name],|r|r.get(0))?;
                if shared {
                    return Ok(json!({"status":"existing_requirements","name":name}));
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
                self.db.execute("UPDATE native_candidates SET report=json_set(report,'$.prepared_task',?2) WHERE fingerprint=?1 AND status='pending'",params![fingerprint,task_id])?;
                let source=self.native_request(cycle,client,"source",json!({"instruction":crate::prompts::AUTHOR_ROUTINE,"sdk":include_str!("../../../sdk/clearings.d.ts"),"contract":task.contract,"cases":&task.cases[..task.cases.len()-1]}),"source",fingerprint)?;
                self.check_native_cycle(cycle)?;
                let version = self.submit(
                    executable,
                    task_id,
                    source["source"]
                        .as_str()
                        .context("missing source")?
                        .to_owned(),
                )?;
                ensure!(
                    self.evaluate(executable, &version)?["accepted"] == true,
                    "candidate failed acceptance"
                );
                self.promote_conversation(cycle, project, task_id, &version, applicability)?;
                Ok(
                    json!({"status":"created","name":name,"task":task_id,"version":version,"evidence":"conversation interpretation with a withheld case","savings":null}),
                )
            })();
            let unavailable = result.as_ref().is_err_and(|e| {
                e.is::<crate::model::ClientUnavailable>()
                    || e.is::<crate::service::IntegrationUnavailable>()
            });
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
                    self.release_failed_binding(project, task)?;
                }
                self.db.execute(
                    "UPDATE native_candidates SET status=?2,report=?3 WHERE fingerprint=?1",
                    params![fingerprint, report["status"].as_str(), report.to_string()],
                )?;
            }
            outcomes.push(report);
            if is_budget || interrupted || unavailable {
                author_unavailable = unavailable;
                break;
            }
        }
        if let Some((task, baseline, owner)) = improvement
            && !author_unavailable
        {
            self.check_native_cycle(cycle)?;
            outcomes
                .push(self.improve_native(cycle, client, executable, &task, &baseline, &owner)?);
        }
        Ok(
            json!({"outcomes":outcomes,"coverage":coverage,"scope":scope,"sessions_considered":sessions.len(),"status":"reviewed","savings":null}),
        )
    }
    fn release_failed_binding(&self, project: &str, task: &str) -> Result<()> {
        self.db.execute("DELETE FROM project_routines WHERE project=?1 AND task=?2 AND origin='conversation' AND paused=0 AND excluded=0 AND previous IS NULL AND NOT EXISTS(SELECT 1 FROM active WHERE task=?2) AND NOT EXISTS(SELECT 1 FROM component_changes WHERE task=?2)",params![project,task])?;
        Ok(())
    }
    fn select_native_improvement(
        &self,
        project: &str,
        scope: Scope,
        prefs: &Preferences,
    ) -> Result<Option<(String, String, String)>> {
        let mut statement=self.db.prepare("SELECT t.id,a.version,p.project,t.body FROM objects t JOIN active a ON a.task=t.id JOIN project_routines p ON p.task=t.id AND p.project=json_extract(t.body,'$.project') JOIN routine_usage u ON u.task=t.id AND u.version=a.version WHERE t.kind='task' AND p.paused=0 AND p.excluded=0 AND json_array_length(t.body,'$.cases') BETWEEN 3 AND 8 AND (?1 OR p.project=?2 OR (u.project=?2 AND EXISTS(SELECT 1 FROM routine_library WHERE task=t.id))) AND u.day>=date('now','-89 days') GROUP BY t.id,a.version,p.project HAVING sum(u.reuse_calls)>=3 ORDER BY sum(u.reuse_calls) DESC,t.id LIMIT 20")?;
        let rows = statement.query_map(params![scope == Scope::All, project], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
            ))
        })?;
        for row in rows {
            let (id, baseline, owner, body) = row?;
            let task: Task = serde_json::from_str(&body)?;
            if prefs.excludes(self.project(&owner)?.root.to_string_lossy().as_ref())
                || prefs.excluded_workflows.iter().any(|n| {
                    n == &task.contract.name || task.contract.name.starts_with(&format!("{n}/"))
                })
            {
                continue;
            }
            if task
                .evidence
                .as_ref()
                .and_then(|e| e["sources"].as_array())
                .is_some_and(|a| {
                    a.iter()
                        .any(|v| prefs.excludes(v["record"]["project"].as_str().unwrap_or("")))
                })
            {
                continue;
            }
            let key = digest(&("improve", &baseline))?;
            let done:bool=self.db.query_row("SELECT EXISTS(SELECT 1 FROM native_candidates WHERE fingerprint=?1 AND status!='pending')",[key],|r|r.get(0))?;
            if !done {
                return Ok(Some((id, baseline, owner)));
            }
        }
        Ok(None)
    }
    fn improve_native(
        &self,
        cycle: i64,
        client: Client,
        executable: &Path,
        task_id: &str,
        baseline: &str,
        owner: &str,
    ) -> Result<Value> {
        let task: Task = self.get("task", task_id)?;
        let version: crate::store::Version = self.get("version", baseline)?;
        let owner_revision = self.project(owner)?.revision;
        let fingerprint = digest(&("improve", baseline))?;
        self.db.execute("INSERT OR IGNORE INTO native_candidates(fingerprint,status,report) VALUES(?1,'pending',?2)",params![fingerprint,json!({"kind":"improvement","task":task_id,"baseline":baseline}).to_string()])?;
        let result = (|| -> Result<Value> {
            let source=self.native_request(cycle,client,"improve",json!({"instruction":crate::prompts::IMPROVE_ROUTINE,"sdk":include_str!("../../../sdk/clearings.d.ts"),"contract":task.contract,"source":version.source,"cases":&task.cases[..task.cases.len()-1]}),"source",&fingerprint)?;
            let candidate = self.submit(
                executable,
                task_id,
                source["source"]
                    .as_str()
                    .context("missing source")?
                    .to_owned(),
            )?;
            if candidate == baseline {
                return Ok(json!({"status":"no_benefit","routine":task_id}));
            }
            let guard = || -> Result<()> {
                self.check_native_cycle(cycle)?;
                ensure!(
                    self.project(owner)?.revision == owner_revision,
                    "routine owner settings changed"
                );
                Ok(())
            };
            let measurements = self.compare_versions(executable, baseline, &candidate, guard)?;
            if measurements["accepted"] != true {
                return Ok(
                    json!({"status":"no_benefit","routine":task_id,"measurements":measurements}),
                );
            }
            guard()?;
            self.ensure_integration()?;
            let tx = rusqlite::Transaction::new_unchecked(
                &self.db,
                rusqlite::TransactionBehavior::Immediate,
            )?;
            self.check_native_cycle(cycle)?;
            ensure!(tx.execute("UPDATE active SET version=?2 WHERE task=?1 AND version=?3 AND EXISTS(SELECT 1 FROM projects p JOIN project_routines r ON r.project=p.id WHERE p.id=?4 AND p.revision=?5 AND r.task=?1 AND r.paused=0 AND r.excluded=0)",params![task_id,candidate,baseline,owner,owner_revision])?==1,"routine changed during improvement");
            tx.execute(
                "UPDATE project_routines SET previous=?2 WHERE task=?1",
                params![task_id, baseline],
            )?;
            tx.execute("INSERT INTO component_changes(project,task,version,previous,reason) VALUES(?1,?2,?3,?4,'improved')",params![owner,task_id,candidate,baseline])?;
            tx.commit()?;
            Ok(
                json!({"status":"improved","routine":task_id,"version":candidate,"previous":baseline,"measurements":measurements}),
            )
        })();
        let retryable = result.as_ref().is_err_and(|e| {
            e.is::<crate::model::ClientUnavailable>()
                || e.is::<crate::service::IntegrationUnavailable>()
                || e.to_string().contains("allowance exhausted")
                || e.to_string().contains("budget exhausted")
        }) || self.check_native_cycle(cycle).is_err();
        let report = match result {
            Ok(v) => v,
            Err(e) => {
                json!({"status":"failed","error":e.to_string().chars().take(4096).collect::<String>()})
            }
        };
        if !retryable {
            self.db.execute(
                "UPDATE native_candidates SET status=?2,report=?3 WHERE fingerprint=?1",
                params![fingerprint, report["status"].as_str(), report.to_string()],
            )?;
        }
        Ok(report)
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
        self.ensure_integration()?;
        let tx = rusqlite::Transaction::new_unchecked(
            &self.db,
            rusqlite::TransactionBehavior::Immediate,
        )?;
        let valid:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM native_cycles n JOIN projects p ON p.id=n.project WHERE n.id=?1 AND n.status='running' AND p.revision=n.project_revision AND n.revision=COALESCE((SELECT json_extract(body,'$.work_revision') FROM installation WHERE key='preferences'),1) AND EXISTS(SELECT 1 FROM project_routines r WHERE r.project=n.project AND r.task=?2 AND r.paused=0 AND r.excluded=0))",params![cycle,task],|r|r.get(0))?;
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
            json!({"preferences":self.preferences()?,"service":self.service_health()?,"recent_cycles":cycles,"requests_today":count,"recent_requests":requests,"usage_kind":"client reported usage; request limits are not dollar guarantees"}),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scoped_groups_drop_stale_pages_and_keep_legacy_global_work_separate() {
        let temp = tempfile::tempdir().unwrap();
        let mut store = Store::open(&temp.path().join("state.db")).unwrap();
        let p = store
            .configure_project(temp.path(), "P", Default::default(), None)
            .unwrap();
        let now = crate::background::now().unwrap();
        for (id, time) in [("old", now - 8 * 86400), ("new", now)] {
            store.db.execute("INSERT INTO conversations(id,client,host_id,root,updated,body) VALUES(?1,'claude',?1,?2,?3,'{}')",params![id,p.root.to_string_lossy(),time]).unwrap();
        }
        let old =
            json!({"conversation":"old","project":p.root,"items":[{"evidence_id":"a".repeat(64)}]});
        let fresh =
            json!({"conversation":"new","project":p.root,"items":[{"evidence_id":"b".repeat(64)}]});
        let legacy = digest(&(&p.id, vec!["a".repeat(64), "b".repeat(64)])).unwrap();
        store
            .db
            .execute(
                "INSERT INTO native_candidates(fingerprint,status,report) VALUES(?1,'pending',?2)",
                params![
                    legacy,
                    json!({"project":p.id,"scope":"all","packet":[old,fresh]}).to_string()
                ],
            )
            .unwrap();
        let project = store
            .pending_conversation_groups(&p.id, Scope::Project)
            .unwrap();
        assert_eq!(project.len(), 1);
        assert_eq!(project[0].1.len(), 1);
        assert_eq!(project[0].1[0]["conversation"], "new");
        assert_eq!(
            store
                .db
                .query_row(
                    "SELECT status FROM native_candidates WHERE fingerprint=?1",
                    [&legacy],
                    |r| r.get::<_, String>(0)
                )
                .unwrap(),
            "pending"
        );
        let all = store
            .pending_conversation_groups(&p.id, Scope::All)
            .unwrap();
        assert_eq!(all.len(), 1);
        assert_ne!(project[0].0, all[0].0);
        assert_eq!(all[0].1.len(), 1);
        assert_eq!(all[0].1[0]["conversation"], "new");
        assert_eq!(
            store
                .db
                .query_row(
                    "SELECT status FROM native_candidates WHERE fingerprint=?1",
                    [legacy],
                    |r| r.get::<_, String>(0)
                )
                .unwrap(),
            "expired"
        );
    }
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

#[cfg(test)]
mod request_allowance_tests {
    use super::*;
    #[test]
    fn interrupted_source_does_not_gain_a_third_slot_and_repair_does_not_repeat() {
        let temp = tempfile::tempdir().unwrap();
        let mut store = Store::open(&temp.path().join("state.db")).unwrap();
        let p = store
            .configure_project(temp.path(), "P", crate::project::Settings::default(), None)
            .unwrap();
        store.db.execute("INSERT INTO native_cycles(project,started,status,revision,project_revision,scope) VALUES(?1,?2,'running',1,1,'project')",params![p.id,crate::background::now().unwrap()]).unwrap();
        let cycle = store.db.last_insert_rowid();
        for (purpose, status) in [("extract", "completed"), ("source", "interrupted")] {
            store.db.execute("INSERT INTO native_requests(cycle,started,client,purpose,status,fingerprint,response) VALUES(?1,?2,'codex',?3,?4,'plain','{}')",params![cycle,crate::background::now().unwrap(),purpose,status]).unwrap();
        }
        let error = store
            .native_request(cycle, Client::Codex, "source", json!({}), "source", "plain")
            .unwrap_err();
        assert!(error.to_string().contains("attempts exhausted"), "{error}");
        store.db.execute("INSERT INTO native_requests(cycle,started,client,purpose,status,fingerprint) VALUES(?1,?2,'codex','repair_candidate','interrupted','repair')",params![cycle,crate::background::now().unwrap()]).unwrap();
        let error = store
            .native_request(
                cycle,
                Client::Codex,
                "repair_candidate",
                json!({}),
                "candidate",
                "repair",
            )
            .unwrap_err();
        assert!(
            error.to_string().contains("repair already attempted"),
            "{error}"
        );
        assert_eq!(
            store
                .db
                .query_row("SELECT count(*) FROM native_requests", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            3
        );
    }
}
