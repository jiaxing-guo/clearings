//! One bounded project cycle at a time, including across processes and restarts.
use crate::store::Store;
use anyhow::{Context, Result, ensure};
use rusqlite::{OptionalExtension, params};
use serde_json::{Value, json};
use std::{
    fs::{File, OpenOptions},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

pub(crate) fn now() -> Result<i64> {
    Ok(SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() as i64)
}
struct ProjectLock {
    _file: File,
}
impl ProjectLock {
    fn acquire(store: &Store, project: &str) -> Result<Self> {
        use std::os::{fd::AsRawFd, unix::fs::OpenOptionsExt};
        let path = std::path::Path::new(
            store
                .db
                .path()
                .context("background work requires a persistent database")?,
        )
        .with_extension(format!("{project}.lock"));
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
            .open(path)?;
        ensure!(
            file.metadata()?.is_file(),
            "background lock must be a regular file"
        );
        // The kernel releases the lock on crash; a stale database row cannot admit overlap.
        ensure!(
            unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } == 0,
            "background cycle already running"
        );
        Ok(Self { _file: file })
    }
}
impl Store {
    pub fn background_tick(
        &mut self,
        project: &str,
        executable: &std::path::Path,
    ) -> Result<Value> {
        let settings = self.project(project)?;
        if !settings.settings.automatic {
            return Ok(json!({"status":"disabled"}));
        }
        let _lock = ProjectLock::acquire(self, project)?;
        let started = now()?;
        let due: Option<i64> = self
            .db
            .query_row(
                "SELECT next_due FROM schedule WHERE project=?1",
                [project],
                |r| r.get(0),
            )
            .optional()?;
        if due.is_some_and(|n| n > started) {
            return Ok(json!({"status":"not_due","next_due":due}));
        }
        self.db.execute("UPDATE background_jobs SET status='interrupted',report='{}' WHERE project=?1 AND status='running'",[project])?;
        self.db.execute("INSERT INTO background_jobs(project,revision,started,status) VALUES(?1,?2,?3,'running')",params![project,settings.revision,started])?;
        let job = self.db.last_insert_rowid();
        let result = self.background_cycle(project, job, executable);
        let (status, report) = match result {
            Ok(report) => ("completed", report),
            Err(e) => (
                "failed",
                json!({"error":e.to_string(),"recovery":"Ordinary agent work remains available. Inspect the job and project settings."}),
            ),
        };
        self.db.execute(
            "UPDATE background_jobs SET status=?2,report=?3 WHERE id=?1",
            params![job, status, report.to_string()],
        )?;
        // Scheduling from completion coalesces missed periods into one catch-up cycle.
        let next = now()? + settings.settings.interval_seconds as i64;
        self.db.execute("INSERT INTO schedule(project,next_due) VALUES(?1,?2) ON CONFLICT(project) DO UPDATE SET next_due=excluded.next_due",params![project,next])?;
        Ok(json!({"job":job,"status":status,"report":report,"next_due":next}))
    }
    fn background_cycle(
        &mut self,
        project: &str,
        job: i64,
        executable: &std::path::Path,
    ) -> Result<Value> {
        self.check_job(project, job)?;
        let observation = self.observe(project)?;
        self.check_job(project, job)?;
        let learning = self.learn(project, job, executable)?;
        let improvement = if learning["status"] == "no_eligible_observations" {
            self.improve(project, job, executable)?
        } else {
            json!({"status":"deferred_after_creation"})
        };
        Ok(json!({"observation":observation,"learning":learning,"improvement":improvement}))
    }
    pub(crate) fn check_job(&self, project: &str, job: i64) -> Result<()> {
        let (revision, cancelled, status, started): (u64, bool, String, i64) = self.db.query_row(
            "SELECT revision,cancelled,status,started FROM background_jobs WHERE id=?1 AND project=?2",
            params![job, project],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )?;
        ensure!(
            now()? <= started + 120,
            "background cycle time budget exhausted"
        );
        let current = self.project(project)?;
        ensure!(
            !cancelled
                && status == "running"
                && current.settings.automatic
                && revision == current.revision,
            "background job cancelled or project authorization changed"
        );
        Ok(())
    }
    pub fn cancel_background(&self, project: &str) -> Result<Value> {
        let count = self.db.execute(
            "UPDATE background_jobs SET cancelled=1 WHERE project=?1 AND status='running'",
            [project],
        )?;
        Ok(
            json!({"cancelled_jobs":count,"effect":"Stops at the next phase boundary; bounded in-flight work may finish."}),
        )
    }
    pub fn background_jobs(&self, project: &str, before: Option<i64>) -> Result<Value> {
        let mut stmt=self.db.prepare("SELECT id,status,started,cancelled,report FROM background_jobs WHERE project=?1 AND (?2 IS NULL OR id<?2) ORDER BY id DESC LIMIT 101")?;
        let mut rows = stmt.query(params![project, before])?;
        let mut jobs = vec![];
        let mut bytes = 0;
        let mut more = false;
        while let Some(r) = rows.next()? {
            let report: String = r.get(4)?;
            if jobs.len() == 100 || bytes + report.len() > 1024 * 1024 {
                more = true;
                break;
            }
            bytes += report.len();
            jobs.push(json!({"id":r.get::<_,i64>(0)?,"status":r.get::<_,String>(1)?,"started":r.get::<_,i64>(2)?,"cancelled":r.get::<_,bool>(3)?,"report":serde_json::from_str::<Value>(&report)?}));
        }
        Ok(
            json!({"jobs":jobs,"next_before":if more {jobs.last().map(|j|j["id"].clone())} else {None}}),
        )
    }
    pub fn reserve_request(
        &mut self,
        project: &str,
        job: i64,
        purpose: &str,
        amount: u64,
    ) -> Result<i64> {
        self.check_job(project, job)?;
        let budget = self.project(project)?.settings.daily_budget_microusd;
        let day = now()? / 86400;
        let tx = self
            .db
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        tx.execute(
            "INSERT OR IGNORE INTO budgets(project,day,reserved) VALUES(?1,?2,0)",
            params![project, day],
        )?;
        ensure!(tx.execute("UPDATE budgets SET reserved=reserved+?3 WHERE project=?1 AND day=?2 AND reserved+?3<=?4",params![project,day,amount,budget])?==1,"optimizer budget exhausted; continue ordinary work");
        tx.execute("INSERT INTO model_requests(project,job,purpose,reserved,status) VALUES(?1,?2,?3,?4,'reserved')",params![project,job,purpose,amount])?;
        let id = tx.last_insert_rowid();
        tx.commit()?;
        Ok(id)
    }
}
/// An ordinary foreground process; use a service manager for unattended execution.
pub fn serve(mut store: Store, project: String, executable: std::path::PathBuf) -> Result<()> {
    loop {
        match store.background_tick(&project, &executable) {
            Ok(v) => println!("{}", v),
            Err(e) => eprintln!("background: {e}"),
        }
        let interval = store.project(&project)?.settings.interval_seconds;
        std::thread::sleep(Duration::from_secs(interval.min(60)));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::{ModelConnection, Settings, TraceSource};
    fn configured(d: &Path) -> (Store, String) {
        let trace = d.join("trace.jsonl");
        std::fs::write(&trace, "").unwrap();
        let mut store = Store::open(&d.join("state.db")).unwrap();
        let settings = Settings {
            automatic: true,
            trace_sources: vec![TraceSource {
                adapter: "clearings".into(),
                path: trace,
            }],
            model: Some(ModelConnection {
                url: "http://127.0.0.1:9/chat".into(),
                model: "test".into(),
                bearer_token_env: None,
                max_output_tokens: 100,
                input_price: 1,
                output_price: 1,
            }),
            daily_budget_microusd: 10,
            ..Default::default()
        };
        let p = store.configure_project(d, "P", settings, None).unwrap();
        (store, p.id)
    }
    use std::path::Path;
    #[test]
    fn kernel_lock_prevents_overlap_and_missed_periods_coalesce() {
        let d = tempfile::tempdir().unwrap();
        let (mut s, p) = configured(d.path());
        let held = ProjectLock::acquire(&s, &p).unwrap();
        assert!(s.background_tick(&p, Path::new("unused")).is_err());
        drop(held);
        assert_eq!(
            s.background_tick(&p, Path::new("unused")).unwrap()["status"],
            "completed"
        );
        assert_eq!(
            s.background_tick(&p, Path::new("unused")).unwrap()["status"],
            "not_due"
        );
        s.db.execute("UPDATE schedule SET next_due=0", []).unwrap();
        assert_eq!(
            s.background_tick(&p, Path::new("unused")).unwrap()["status"],
            "completed"
        );
        assert_eq!(
            s.background_jobs(&p, None).unwrap()["jobs"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
    }
    #[test]
    fn budgets_and_cancellation_survive_connection_restart() {
        let d = tempfile::tempdir().unwrap();
        let (mut s, p) = configured(d.path());
        s.db.execute(
            "INSERT INTO background_jobs(project,revision,started,status) VALUES(?1,1,CAST(strftime('%s','now') AS INTEGER),'running')",
            [&p],
        )
        .unwrap();
        let job = s.db.last_insert_rowid();
        s.reserve_request(&p, job, "test", 7).unwrap();
        assert!(s.reserve_request(&p, job, "test", 4).is_err());
        drop(s);
        let mut s = Store::open(&d.path().join("state.db")).unwrap();
        assert!(s.reserve_request(&p, job, "test", 4).is_err());
        s.cancel_background(&p).unwrap();
        assert!(s.reserve_request(&p, job, "test", 1).is_err());
    }
}
