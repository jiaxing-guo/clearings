//! One bounded library view for conversation tools and the local workbench.
use crate::store::{Store, Task};
use anyhow::{Result, ensure};
use rusqlite::params;
use serde_json::{Value, json};

impl Store {
    pub(crate) fn routine_recent_calls(&self, project: &str, id: &str) -> Result<Value> {
        let mut recent = self.db.prepare("SELECT r.id,r.purpose,json_extract(r.report,'$.outcome.status'),json_extract(r.report,'$.elapsed_ms'),r.created_at FROM runs r JOIN objects v ON v.id=r.version WHERE r.project=?1 AND json_extract(v.body,'$.task')=?2 ORDER BY r.id DESC LIMIT 5")?;
        Ok(json!(recent.query_map(params![project,id], |r| Ok(json!({"id":r.get::<_,i64>(0)?,"purpose":r.get::<_,String>(1)?,"status":r.get::<_,String>(2)?,"elapsed_ms":r.get::<_,u64>(3)?,"created_at":r.get::<_,String>(4)?})))?.collect::<rusqlite::Result<Vec<_>>>()?))
    }
    pub fn routine_library_page(&self, project: &str, after: Option<&str>) -> Result<Value> {
        let owner = self.project(project)?;
        ensure!(
            after.is_none_or(|s| s.len() == 64 && s.bytes().all(|c| c.is_ascii_hexdigit())),
            "invalid library cursor"
        );
        let mut statement = self.db.prepare("SELECT p.task,p.project,p.name,p.origin,p.paused,p.excluded,p.previous,a.version,COALESCE(c.paused,0),json_extract(owner.body,'$.name')
            FROM project_routines p JOIN projects owner ON owner.id=p.project LEFT JOIN active a ON a.task=p.task
            LEFT JOIN library_controls c ON c.task=p.task AND c.project=?1
            WHERE (p.project=?1 OR EXISTS(SELECT 1 FROM routine_library l WHERE l.task=p.task))
            AND (?2 IS NULL OR p.task>?2) ORDER BY p.task LIMIT 21")?;
        let entries: Vec<_> = statement.query_map(params![project,after], |r| Ok(json!({
            "id":r.get::<_,String>(0)?,"owner_project":r.get::<_,String>(1)?,"name":r.get::<_,String>(2)?,
            "origin":r.get::<_,String>(3)?,"owner_paused":r.get::<_,bool>(4)?,"excluded":r.get::<_,bool>(5)?,
            "previous":r.get::<_,Option<String>>(6)?,"active":r.get::<_,Option<String>>(7)?,"local_paused":r.get::<_,bool>(8)?,"owner_name":r.get::<_,String>(9)?
        })))?.collect::<rusqlite::Result<_>>()?;
        let more = entries.len() > 20;
        let mut routines = Vec::new();
        for mut entry in entries.into_iter().take(20) {
            let id = entry["id"].as_str().unwrap().to_owned();
            let task: Task = self.get("task", &id)?;
            let owned = entry["owner_project"] == project;
            entry["owned"] = json!(owned);
            entry["description"] = json!(
                task.contract
                    .description
                    .chars()
                    .take(1000)
                    .collect::<String>()
            );
            entry["paused"] = json!(entry["owner_paused"] == true || entry["local_paused"] == true);
            entry["can_undo"] =
                json!(owned && !entry["previous"].is_null() && !entry["active"].is_null());
            entry["usage"] = self.routine_usage(project, &id)?;
            let examples: Vec<_> = task
                .cases
                .iter()
                .take(2)
                .map(|c| json!({"name":c.name,"input":c.input,"expected":c.expected}))
                .collect();
            entry["examples"] = if serde_json::to_vec(&examples)?.len() <= 8192 {
                json!(examples)
            } else {
                Value::Null
            };
            entry["case_count"] = json!(task.cases.len());
            entry["recent_calls"] = self.routine_recent_calls(project, &id)?;
            routines.push(entry);
        }
        let next = if more {
            routines.last().map(|r| r["id"].clone())
        } else {
            None
        };
        Ok(
            json!({"schema_version":1,"project":{"id":owner.id,"name":owner.name},"routines":routines,"next_after":next,"usage_note":"Reuse and test counts are caller-labelled. Older unclassified calls are not evidence of real reuse. Acceptance evaluations are separate."}),
        )
    }
}
