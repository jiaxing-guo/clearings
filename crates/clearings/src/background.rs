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
pub(crate) struct ProjectLock {
    _file: File,
}
impl ProjectLock {
    pub(crate) fn acquire(store: &Store, project: &str) -> Result<Self> {
        use std::os::{fd::AsRawFd, unix::fs::OpenOptionsExt};
        let path = std::path::Path::new(
            store
                .db
                .path()
                .context("background work requires a persistent database")?,
        )
        .canonicalize()?;
        Store::check_database_links(&path)?;
        let identity = crate::store::digest(&(path.as_os_str().as_encoded_bytes(), project))?;
        let filename = format!(".clearings-{identity}.lock");
        let path = path.with_file_name(filename);
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
        self.project(project)?;
        let _lock = ProjectLock::acquire(self, project)?;
        self.db.execute("UPDATE model_requests SET status='interrupted' WHERE project=?1 AND status='reserved' AND job IN (SELECT id FROM background_jobs WHERE project=?1 AND status='running')", [project])?;
        self.db.execute("UPDATE background_jobs SET status='interrupted',report=?2 WHERE project=?1 AND status='running'",params![project,json!({"error":"worker interrupted before completion"}).to_string()])?;
        self.db.execute("UPDATE improvement_trials SET status='interrupted' WHERE project=?1 AND status='measuring'",[project])?;
        let settings = self.project(project)?;
        if !settings.settings.automatic {
            return Ok(json!({"status":"disabled"}));
        }
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
        self.db.execute("INSERT INTO background_jobs(project,revision,started,status) VALUES(?1,?2,?3,'running')",params![project,settings.revision,started])?;
        let job = self.db.last_insert_rowid();
        let result = self.background_cycle(project, job, executable);
        let (status, report) = match result {
            Ok(report) => {
                let status = if report["observation"]["errors"]
                    .as_array()
                    .is_some_and(|errors| !errors.is_empty())
                {
                    "failed"
                } else {
                    "completed"
                };
                (status, report)
            }
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
        let next = self.schedule_next(&settings)?;
        Ok(json!({"job":job,"status":status,"report":report,"next_due":next}))
    }
    fn schedule_next(&self, settings: &crate::project::Project) -> Result<Option<i64>> {
        let next = now()? + settings.settings.interval_seconds as i64;
        let scheduled = self.db.execute("INSERT INTO schedule(project,next_due) SELECT ?1,?2 WHERE EXISTS(SELECT 1 FROM projects WHERE id=?1 AND revision=?3) ON CONFLICT(project) DO UPDATE SET next_due=excluded.next_due",params![settings.id,next,settings.revision])?;
        Ok((scheduled == 1).then_some(next))
    }
    fn background_cycle(
        &mut self,
        project: &str,
        job: i64,
        executable: &std::path::Path,
    ) -> Result<Value> {
        self.check_job(project, job)?;
        let retention = self.prune(project, true)?;
        let observation = self.observe(project)?;
        self.check_job(project, job)?;
        if observation["errors"]
            .as_array()
            .is_some_and(|errors| !errors.is_empty())
        {
            return Ok(json!({"observation":observation,"retention":retention}));
        }
        let learning = self.learn(project, job, executable)?;
        let improvement = if learning["status"] == "no_eligible_observations" {
            self.improve(project, job, executable)?
        } else {
            json!({"status":"deferred_after_creation"})
        };
        self.check_job(project, job)?;
        Ok(
            json!({"observation":observation,"learning":learning,"improvement":improvement,"retention":retention}),
        )
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
        ensure!(
            before.is_none_or(|id| id > 0),
            "before must be a positive job ID"
        );
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
            let job_id: i64 = r.get(0)?;
            let mut requests=self.db.prepare("SELECT id,purpose,reserved,status,usage FROM model_requests WHERE project=?1 AND job=?2 ORDER BY id DESC LIMIT 101")?;
            let raw: Vec<(i64, String, u64, String, Option<String>)> = requests
                .query_map(params![project, job_id], |r| {
                    Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
                })?
                .collect::<rusqlite::Result<_>>()?;
            let truncated = raw.len() > 100;
            let requests:Vec<Value>=raw.into_iter().take(100).map(|(id,purpose,reserved,status,usage)|Ok(json!({"id":id,"purpose":purpose,"reserved_microusd":reserved,"status":status,"usage":usage.map(|s|serde_json::from_str::<Value>(&s)).transpose()?}))).collect::<Result<_>>()?;
            let entry = json!({"id":job_id,"status":r.get::<_,String>(1)?,"started":r.get::<_,i64>(2)?,"cancelled":r.get::<_,bool>(3)?,"report":serde_json::from_str::<Value>(&report)?,"requests":requests,"requests_truncated":truncated});
            let length = serde_json::to_vec(&entry)?.len();
            if bytes + length > 1024 * 1024 {
                ensure!(!jobs.is_empty(), "job report exceeds page byte limit");
                more = true;
                break;
            }
            bytes += length;
            jobs.push(entry);
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
        self.reserve_request_with_group(project, job, purpose, amount, None)
    }
    pub(crate) fn reserve_request_with_group(
        &mut self,
        project: &str,
        job: i64,
        purpose: &str,
        amount: u64,
        group: Option<&str>,
    ) -> Result<i64> {
        let tx = self
            .db
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let budget: u64=tx.query_row("SELECT json_extract(projects.body,'$.settings.daily_budget_microusd') FROM projects JOIN background_jobs ON projects.id=background_jobs.project WHERE projects.id=?1 AND background_jobs.id=?2 AND projects.revision=background_jobs.revision AND background_jobs.cancelled=0 AND background_jobs.status='running' AND json_extract(projects.body,'$.settings.automatic')=1 AND background_jobs.started+120>=?3",params![project,job,now()?],|r|r.get(0)).context("background job cancelled or project authorization changed before reservation")?;
        let day = now()? / 86400;
        tx.execute(
            "INSERT OR IGNORE INTO budgets(project,day,reserved) VALUES(?1,?2,0)",
            params![project, day],
        )?;
        ensure!(tx.execute("UPDATE budgets SET reserved=reserved+?3 WHERE project=?1 AND day=?2 AND reserved+?3<=?4",params![project,day,amount,budget])?==1,"optimizer budget exhausted; continue ordinary work");
        tx.execute("INSERT INTO model_requests(project,job,purpose,reserved,status) VALUES(?1,?2,?3,?4,'reserved')",params![project,job,purpose,amount])?;
        let id = tx.last_insert_rowid();
        if let Some(group) = group {
            ensure!(tx.execute("UPDATE learning_groups SET status='authoring',attempts=attempts+1 WHERE project=?1 AND fingerprint=?2 AND attempts<2 AND status!='created'",params![project,group])? == 1, "learning attempts are exhausted or the group changed");
        }
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
    fn hard_linked_databases_are_rejected_before_alias_sidecars_are_created() {
        let d = tempfile::tempdir().unwrap();
        let (mut store, project) = configured(d.path());
        let alias = d.path().join("alias.db");
        std::fs::hard_link(d.path().join("state.db"), &alias).unwrap();
        assert!(Store::open(&alias).is_err());
        assert!(!d.path().join("alias.db-wal").exists());
        assert!(!d.path().join("alias.db-shm").exists());
        assert!(
            store
                .background_tick(&project, Path::new("unused"))
                .is_err()
        );
        std::fs::remove_file(alias).unwrap();
        assert_eq!(
            store
                .background_tick(&project, Path::new("unused"))
                .unwrap()["status"],
            "completed"
        );
    }
    #[test]
    fn incomplete_imports_fail_jobs_and_preserve_source_errors() {
        for malformed in [false, true] {
            let d = tempfile::tempdir().unwrap();
            let (mut store, project) = configured(d.path());
            if malformed {
                std::fs::write(d.path().join("trace.jsonl"), "{malformed}\n").unwrap();
            } else {
                std::fs::remove_file(d.path().join("trace.jsonl")).unwrap();
            }
            let result = store
                .background_tick(&project, Path::new("unused"))
                .unwrap();
            assert_eq!(result["status"], "failed");
            assert_eq!(result["report"]["observation"]["imported"], 0);
            assert_eq!(
                result["report"]["observation"]["errors"]
                    .as_array()
                    .unwrap()
                    .len(),
                1
            );
            let history = store.background_jobs(&project, None).unwrap();
            assert_eq!(history["jobs"][0]["status"], "failed");
            assert_eq!(history["jobs"][0]["report"], result["report"]);
        }
    }
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
    #[test]
    fn reconfiguration_reschedules_and_disabled_ticks_reconcile_crashes() {
        let d = tempfile::tempdir().unwrap();
        let (mut s, p) = configured(d.path());
        assert_eq!(
            s.background_tick(&p, Path::new("unused")).unwrap()["status"],
            "completed"
        );
        let snapshot = s.project(&p).unwrap();
        let mut settings = snapshot.settings.clone();
        settings.interval_seconds = 10;
        s.configure_project(d.path(), "P", settings.clone(), Some(1))
            .unwrap();
        assert!(s.schedule_next(&snapshot).unwrap().is_none());
        assert_eq!(
            s.db.query_row(
                "SELECT count(*) FROM schedule WHERE project=?1",
                [&p],
                |r| r.get::<_, u64>(0)
            )
            .unwrap(),
            0
        );
        assert_eq!(
            s.background_tick(&p, Path::new("unused")).unwrap()["status"],
            "completed"
        );
        s.db.execute(
            "INSERT INTO background_jobs(project,revision,started,status) VALUES(?1,2,0,'running')",
            [&p],
        )
        .unwrap();
        settings.automatic = false;
        s.configure_project(d.path(), "P", settings, Some(2))
            .unwrap();
        assert_eq!(
            s.background_tick(&p, Path::new("unused")).unwrap()["status"],
            "disabled"
        );
        assert_eq!(
            s.background_jobs(&p, None).unwrap()["jobs"][0]["status"],
            "interrupted"
        );
    }
    #[test]
    fn lock_identity_preserves_full_filename_and_resolves_database_aliases() {
        let d = tempfile::tempdir().unwrap();
        let (s, p) = configured(d.path());
        let held = ProjectLock::acquire(&s, &p).unwrap();
        std::os::unix::fs::symlink(d.path().join("state.db"), d.path().join("alias.db")).unwrap();
        let alias = Store::open(&d.path().join("alias.db")).unwrap();
        assert!(ProjectLock::acquire(&alias, &p).is_err());
        let other = Store::open(&d.path().join("state.sqlite")).unwrap();
        assert!(ProjectLock::acquire(&other, &p).is_ok());
        let long = Store::open(&d.path().join(format!("{}.db", "x".repeat(200)))).unwrap();
        assert!(ProjectLock::acquire(&long, &p).is_ok());
        drop(held);
    }
    #[test]
    fn expired_jobs_fail_before_subsequent_work_or_reservation() {
        let d = tempfile::tempdir().unwrap();
        let (mut s, p) = configured(d.path());
        s.db.execute("INSERT INTO background_jobs(project,revision,started,status) VALUES(?1,1,?2,'running')",params![p,now().unwrap()-121]).unwrap();
        let job = s.db.last_insert_rowid();
        assert!(
            s.background_cycle(&p, job, Path::new("unused"))
                .unwrap_err()
                .to_string()
                .contains("time budget")
        );
        assert!(s.reserve_request(&p, job, "test", 1).is_err());
        assert_eq!(
            s.db.query_row("SELECT count(*) FROM model_requests", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
}
