//! Inspectable, reversible routine controls and bounded reporting.
use crate::store::{Store, Version};
use anyhow::{Context, Result, ensure};
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
#[derive(Debug, Clone, Deserialize, Serialize, clap::ValueEnum)]
#[serde(rename_all = "snake_case")]
pub enum Control {
    Pause,
    Resume,
    Exclude,
    Include,
    Retire,
    Rollback,
}
impl Store {
    pub fn inspect_named(&self, project: &str, name: &str) -> Result<Value> {
        let task = self.named_task(project, name, false)?;
        let active = self.active(&task)?;
        let flags=self.db.query_row("SELECT paused,excluded,previous,origin FROM project_routines WHERE project=?1 AND name=?2",params![project,name],|r|Ok(json!({"paused":r.get::<_,bool>(0)?,"excluded":r.get::<_,bool>(1)?,"previous":r.get::<_,Option<String>>(2)?,"origin":r.get::<_,String>(3)?})))?;
        let result = json!({"name":name,"task":self.inspect(&task)?,"version":active.map(|v|self.inspect(&v)).transpose()?,"controls":flags});
        ensure!(
            serde_json::to_vec(&result)?.len() <= crate::contract::MAX_WIRE_BYTES / 2,
            "combined inspection is too large; inspect the task and version IDs separately"
        );
        Ok(result)
    }
    pub fn manage(
        &mut self,
        project: &str,
        name: &str,
        action: Control,
        expected_active: Option<&str>,
    ) -> Result<Value> {
        let task = self.named_task(project, name, false)?;
        match action {
            Control::Pause => {
                self.db.execute(
                    "UPDATE project_routines SET paused=1 WHERE project=?1 AND name=?2",
                    params![project, name],
                )?;
            }
            Control::Resume => {
                self.db.execute(
                    "UPDATE project_routines SET paused=0 WHERE project=?1 AND name=?2",
                    params![project, name],
                )?;
            }
            Control::Exclude => {
                self.db.execute(
                    "UPDATE project_routines SET excluded=1 WHERE project=?1 AND name=?2",
                    params![project, name],
                )?;
            }
            Control::Include => {
                self.db.execute(
                    "UPDATE project_routines SET excluded=0 WHERE project=?1 AND name=?2",
                    params![project, name],
                )?;
            }
            Control::Retire => {
                let tx = self
                    .db
                    .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
                let actual: Option<String> = tx
                    .query_row("SELECT version FROM active WHERE task=?1", [&task], |r| {
                        r.get(0)
                    })
                    .optional()?;
                ensure!(
                    actual.as_deref() == expected_active,
                    "active version changed; inspect before retiring"
                );
                tx.execute("UPDATE project_routines SET paused=1,excluded=1,previous=NULL WHERE project=?1 AND name=?2",params![project,name])?;
                if let Some(version) = actual {
                    tx.execute("INSERT INTO component_changes(project,task,version,reason) VALUES(?1,?2,?3,'retired')", params![project,task,version])?;
                }
                tx.execute("DELETE FROM active WHERE task=?1", [&task])?;
                tx.commit()?;
            }
            Control::Rollback => {
                let previous: String = self
                    .db
                    .query_row(
                        "SELECT previous FROM project_routines WHERE project=?1 AND name=?2",
                        params![project, name],
                        |r| r.get(0),
                    )
                    .context("no previous automatic version is available")?;
                let version: Version = self.get("version", &previous)?;
                ensure!(version.task == task, "rollback belongs to another task");
                ensure!(
                    version.engine == crate::store::ENGINE
                        && self.inspect(&previous)?["evaluation"]["accepted"] == true,
                    "previous version requires a current passing evaluation"
                );
                let expected =
                    expected_active.context("supply the current active version before rollback")?;
                let tx = self
                    .db
                    .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
                ensure!(tx.execute("UPDATE active SET version=?2 WHERE task=?1 AND version=?3 AND EXISTS(SELECT 1 FROM project_routines WHERE project=?4 AND task=?1 AND previous=?2)",params![task,previous,expected,project])? == 1, "active or previous version changed; inspect before rollback");
                tx.execute(
                    "UPDATE project_routines SET previous=NULL WHERE project=?1 AND task=?2",
                    params![project, task],
                )?;
                tx.execute("INSERT INTO component_changes(project,task,version,previous,reason) VALUES(?1,?2,?3,?4,'manual_rollback')",params![project,task,previous,expected])?;
                tx.commit()?;
            }
        }
        Ok(json!({"name":name,"action":action,"active":self.active(&task)?}))
    }
    pub fn digest_page(&self, project: &str, after: Option<i64>) -> Result<Value> {
        ensure!(
            after.is_none_or(|id| id > 0),
            "after must be a positive change ID"
        );
        let mut stmt=self.db.prepare("SELECT id,task,version,previous,reason,created_at FROM component_changes WHERE project=?1 AND (?2 IS NULL OR id>?2) ORDER BY id LIMIT 101")?;
        let mut changes:Vec<Value>=stmt.query_map(params![project,after],|r|Ok(json!({"id":r.get::<_,i64>(0)?,"task":r.get::<_,String>(1)?,"version":r.get::<_,String>(2)?,"previous":r.get::<_,Option<String>>(3)?,"reason":r.get::<_,String>(4)?,"created_at":r.get::<_,String>(5)?})))?.collect::<rusqlite::Result<_>>()?;
        let more = changes.len() > 100;
        if more {
            changes.pop();
        }
        let next = changes.last().map(|c| c["id"].clone());
        let job:Option<(i64,String,String)>=self.db.query_row("SELECT id,status,report FROM background_jobs WHERE project=?1 ORDER BY id DESC LIMIT 1",[project],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional()?;
        let job=job.map(|(id,status,report)|->Result<Value>{Ok(json!({"job":id,"status":status,"report":serde_json::from_str::<Value>(&report)?}))}).transpose()?;
        Ok(
            json!({"changes":changes,"next_after":next,"has_more":more,"latest_background_job":job,"savings":null}),
        )
    }
    pub fn model_usage(&self, project: &str, before: Option<i64>) -> Result<Value> {
        ensure!(
            before.is_none_or(|id| id > 0),
            "before must be a positive request ID"
        );
        let p = self.project(project)?;
        let day = crate::background::now()? / 86400;
        let reserved: u64 = self
            .db
            .query_row(
                "SELECT reserved FROM budgets WHERE project=?1 AND day=?2",
                params![project, day],
                |r| r.get(0),
            )
            .optional()?
            .unwrap_or(0);
        let mut stmt=self.db.prepare("SELECT id,job,purpose,reserved,status,usage FROM model_requests WHERE project=?1 AND (?2 IS NULL OR id<?2) ORDER BY id DESC LIMIT 101")?;
        let mut rows = stmt.query(params![project, before])?;
        let mut requests = vec![];
        let mut bytes = 0;
        let mut more = false;
        while let Some(r) = rows.next()? {
            let raw: Option<String> = r.get(5)?;
            if requests.len() == 100 || bytes + raw.as_ref().map_or(0, String::len) > 1024 * 1024 {
                more = true;
                break;
            }
            bytes += raw.as_ref().map_or(0, String::len);
            requests.push(json!({"id":r.get::<_,i64>(0)?,"job":r.get::<_,i64>(1)?,"purpose":r.get::<_,String>(2)?,"reserved_microusd":r.get::<_,u64>(3)?,"status":r.get::<_,String>(4)?,"usage":raw.map(|s|serde_json::from_str::<Value>(&s)).transpose().map_err(|e|rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?}));
        }
        let connection=p.settings.model.map(|m|json!({"model":m.model,"credential_available":m.bearer_token_env.as_ref().map(|name|std::env::var_os(name).is_some()),"usage_source":"provider response when available"}));
        Ok(
            json!({"connection":connection,"utc_day":day,"reserved_microusd":reserved,"daily_budget_microusd":p.settings.daily_budget_microusd,"requests":requests,"next_before":if more {requests.last().map(|r|r["id"].clone())}else{None},"host_usage":"See activity records. Session counters are not routine-attributed savings."}),
        )
    }
    pub fn prune(&self, project: &str, apply: bool) -> Result<Value> {
        let days = self.project(project)?.settings.retention_days;
        let cutoff = format!("-{days} days");
        let activity: u64 = self.db.query_row(
            "SELECT count(*) FROM activity WHERE project=?1 AND created_at<datetime('now',?2)",
            params![project, cutoff],
            |r| r.get(0),
        )?;
        let runs:u64=self.db.query_row("SELECT count(*) FROM runs WHERE created_at<datetime('now',?2) AND version IN (SELECT id FROM objects WHERE kind='version' AND json_extract(body,'$.task') IN (SELECT task FROM project_routines WHERE project=?1))",params![project,cutoff],|r|r.get(0))?;
        if apply {
            let tx = self.db.unchecked_transaction()?;
            tx.execute(
                "DELETE FROM activity WHERE project=?1 AND created_at<datetime('now',?2)",
                params![project, cutoff],
            )?;
            tx.execute("DELETE FROM runs WHERE created_at<datetime('now',?2) AND version IN (SELECT id FROM objects WHERE kind='version' AND json_extract(body,'$.task') IN (SELECT task FROM project_routines WHERE project=?1))",params![project,cutoff])?;
            tx.commit()?;
        }
        Ok(
            json!({"applied":apply,"activity_records":activity,"run_records":runs,"retention_days":days,"preserved":"Immutable requirements, source, evaluations, budget reservations and component change history."}),
        )
    }
}
