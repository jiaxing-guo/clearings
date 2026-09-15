//! Friendly project names over immutable tasks and versions.
use crate::{
    contract::Policy,
    store::{Store, Task, Version},
};
use anyhow::{Context, Result, ensure};
use rusqlite::{OptionalExtension, params};
use serde_json::{Value, json};
use std::path::Path;

impl Store {
    pub fn check_task_scope(&self, project: Option<&str>, id: &str) -> Result<()> {
        if let Some(project) = project {
            return self.owns_task(project, id);
        }
        let task: Task = self.get("task", id)?;
        ensure!(
            task.project.is_none(),
            "select the owning --project for this task"
        );
        Ok(())
    }
    pub fn check_version_scope(&self, project: Option<&str>, id: &str) -> Result<()> {
        let version: Version = self.get("version", id)?;
        self.check_task_scope(project, &version.task)
    }
    pub fn prepare_named(&self, project: &str, task: Task, origin: &str) -> Result<String> {
        ensure!(
            task.evidence.is_none(),
            "observation evidence is host-owned"
        );
        self.prepare_named_evidence(project, task, origin)
    }
    pub(crate) fn prepare_named_evidence(
        &self,
        project: &str,
        mut task: Task,
        origin: &str,
    ) -> Result<String> {
        self.project(project)?;
        task.project = Some(project.to_owned());
        let id = self.prepare_host_task(&task)?;
        let tx = rusqlite::Transaction::new_unchecked(
            &self.db,
            rusqlite::TransactionBehavior::Immediate,
        )?;
        let current: Option<String> = tx
            .query_row(
                "SELECT task FROM project_routines WHERE project=?1 AND name=?2",
                params![project, task.contract.name],
                |r| r.get(0),
            )
            .optional()?;
        ensure!(
            current.as_deref().is_none_or(|v| v == id),
            "this name has different requirements; use a new name to preserve its existing behavior"
        );
        tx.execute(
            "INSERT OR IGNORE INTO project_routines(project,name,task,origin) VALUES(?1,?2,?3,?4)",
            params![project, task.contract.name, id, origin],
        )?;
        tx.commit()?;
        Ok(id)
    }
    pub fn owns_task(&self, project: &str, task: &str) -> Result<()> {
        let registered: bool = self.db.query_row(
            "SELECT EXISTS(SELECT 1 FROM project_routines WHERE project=?1 AND task=?2)",
            params![project, task],
            |r| r.get(0),
        )?;
        let task: Task = self.get("task", task)?;
        ensure!(
            registered && task.project.as_deref() == Some(project),
            "task belongs to a different project"
        );
        Ok(())
    }
    pub fn owns_version(&self, project: &str, version: &str) -> Result<()> {
        let version: Version = self.get("version", version)?;
        self.owns_task(project, &version.task)
    }
    pub fn named_task(&self, project: &str, name: &str, for_run: bool) -> Result<String> {
        let (task, paused, excluded): (String, bool, bool) = self
            .db
            .query_row(
                "SELECT task,paused,excluded FROM project_routines WHERE project=?1 AND name=?2",
                params![project, name],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .context("routine not found; continue with the agent or save this work first")?;
        self.owns_task(project, &task)?;
        if for_run {
            ensure!(
                !paused && !excluded,
                "routine is paused or excluded; continue with the agent"
            );
        }
        Ok(task)
    }
    pub fn named_list(&self, project: &str, after: Option<&str>) -> Result<Value> {
        let mut statement = self.db.prepare("SELECT name,project_routines.task,origin,paused,excluded,active.version FROM project_routines LEFT JOIN active ON active.task=project_routines.task WHERE project=?1 AND (?2 IS NULL OR name>?2) ORDER BY name LIMIT 101")?;
        let mut entries: Vec<Value> = statement.query_map(params![project,after], |r| Ok(json!({"name":r.get::<_,String>(0)?,"task":r.get::<_,String>(1)?,"origin":r.get::<_,String>(2)?,"paused":r.get::<_,bool>(3)?,"excluded":r.get::<_,bool>(4)?,"active":r.get::<_,Option<String>>(5)?})))?.collect::<rusqlite::Result<_>>()?;
        let next = if entries.len() > 100 {
            entries.pop();
            entries.last().map(|v| v["name"].clone())
        } else {
            None
        };
        Ok(json!({"routines":entries,"next_after":next}))
    }
    pub fn save_named(
        &mut self,
        executable: &Path,
        project: &str,
        name: &str,
        source: String,
        expected: Option<&str>,
    ) -> Result<Value> {
        let task = self.named_task(project, name, false)?;
        let version = self.submit(executable, &task, source)?;
        let report = self.evaluate(executable, &version)?;
        if report["accepted"] != true {
            return Ok(
                json!({"name":name,"version":version,"accepted":false,"evaluation":report,"recovery":"Revise the candidate; the previous routine remains active."}),
            );
        }
        self.activate(&version, expected)?;
        Ok(json!({"name":name,"task":task,"version":version,"accepted":true,"active":version}))
    }
    pub fn reuse_named(
        &self,
        executable: &Path,
        project: &str,
        name: &str,
        input: Value,
        policy: &Policy,
    ) -> Result<Value> {
        let task = self.named_task(project, name, true)?;
        self.run(executable, &task, input, policy)
    }
}
