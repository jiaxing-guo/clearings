//! User-directed requirement revisions create new immutable tasks before authoring.
use crate::{
    contract::Contract,
    store::{Case, ENGINE, Store, Task, Version, digest},
};
use anyhow::{Context, Result, ensure};
use rusqlite::{OptionalExtension, params};
use serde::Deserialize;
use serde_json::{Value, json};
use std::path::Path;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RevisionRequest {
    pub id: String,
    pub expected_version: String,
    pub request: String,
    pub description: String,
    pub input_schema: Value,
    pub output_schema: Value,
    pub examples: Vec<Case>,
}
struct DefinitionChange<'a> {
    old_task: &'a str,
    old_version: &'a str,
    task: &'a str,
    version: &'a str,
    previous: Option<&'a str>,
    reason: &'a str,
    project_revision: u64,
}
impl Store {
    pub fn prepare_revision(&self, project: &str, request: &RevisionRequest) -> Result<String> {
        self.owns_task(project, &request.id)?;
        ensure!(
            self.active(&request.id)?.as_deref() == Some(&request.expected_version),
            "routine changed; refresh before proposing an update"
        );
        ensure!(
            !request.request.trim().is_empty() && request.request.len() <= 4000,
            "describe the change in 1 to 4000 bytes"
        );
        ensure!(
            !request.examples.is_empty() && request.examples.len() <= 8,
            "add 1 to 8 examples for this change"
        );
        let original: Task = self.get("task", &request.id)?;
        let description = if request.description == original.contract.description {
            format!("{}\n\nExtension: {}", request.description, request.request)
        } else {
            request.description.clone()
        };
        ensure!(
            description.len() <= 4096,
            "shorten the routine description and requested change to 4096 bytes combined"
        );
        let contract = Contract {
            description,
            input_schema: request.input_schema.clone(),
            output_schema: request.output_schema.clone(),
            ..original.contract
        };
        let mut cases = original.cases;
        cases.extend(request.examples.clone());
        let task = Task {
            project: Some(project.to_owned()),
            evidence: None,
            evaluation: original.evaluation,
            contract,
            cases,
        };
        let id = self.prepare_host_task(&task)?;
        let project_revision = self.project(project)?.revision;
        let body = json!({"base_task":request.id,"base_version":request.expected_version,"request":request.request,"project_revision":project_revision,"status":"prepared"});
        let tx = rusqlite::Transaction::new_unchecked(
            &self.db,
            rusqlite::TransactionBehavior::Immediate,
        )?;
        self.owns_task(project, &request.id)?;
        ensure!(
            self.active(&request.id)?.as_deref() == Some(&request.expected_version),
            "routine changed; refresh before proposing an update"
        );
        tx.execute("INSERT INTO workbench_drafts(task,project,body) VALUES(?1,?2,?3) ON CONFLICT(task) DO UPDATE SET rowid=(SELECT COALESCE(MAX(rowid),0)+1 FROM workbench_drafts),body=excluded.body,created_at=CURRENT_TIMESTAMP WHERE project=excluded.project",params![id,project,body.to_string()])?;
        tx.commit()?;
        Ok(id)
    }
    fn draft(&self, project: &str, task: &str) -> Result<Value> {
        let body: String = self
            .db
            .query_row(
                "SELECT body FROM workbench_drafts WHERE project=?1 AND task=?2",
                params![project, task],
                |r| r.get(0),
            )
            .context("update draft not found in this project")?;
        Ok(serde_json::from_str(&body)?)
    }
    pub fn pending_revision(&self, project: &str, task: &str) -> Result<Option<Value>> {
        let row:Option<(String,String)>=self.db.query_row("SELECT task,body FROM workbench_drafts WHERE project=?1 AND json_extract(body,'$.base_task')=?2 AND json_extract(body,'$.status')='accepted' ORDER BY rowid DESC LIMIT 1",params![project,task],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
        row.map(|(id, body)| -> Result<Value> {
            let mut value: Value = serde_json::from_str(&body)?;
            value["task"] = json!(id);
            Ok(value)
        })
        .transpose()
    }
    pub fn evaluate_revision(
        &self,
        executable: &Path,
        project: &str,
        task: &str,
        source: String,
    ) -> Result<Value> {
        let mut draft = self.draft(project, task)?;
        self.owns_task(
            project,
            draft["base_task"]
                .as_str()
                .context("draft lacks base task")?,
        )?;
        let version = self.submit(executable, task, source)?;
        let evaluation = self.evaluate(executable, &version)?;
        draft["version"] = json!(version);
        draft["status"] = json!(if evaluation["accepted"] == true {
            "accepted"
        } else {
            "rejected"
        });
        self.db.execute(
            "UPDATE workbench_drafts SET body=?3 WHERE project=?1 AND task=?2",
            params![project, task, draft.to_string()],
        )?;
        let cases:Vec<_>=evaluation["cases"].as_array().into_iter().flatten().map(|case|json!({"name":case["name"],"accepted":case["accepted"],"outcome":case["run"]["outcome"]})).collect();
        Ok(
            json!({"task":task,"version":version,"accepted":evaluation["accepted"],"cases":cases,"active_changed":false}),
        )
    }
    pub fn propose_revision(
        &mut self,
        executable: &Path,
        project: &str,
        request: RevisionRequest,
        expected_project_revision: u64,
    ) -> Result<Value> {
        let lock = crate::background::ProjectLock::acquire(self, "user-conversation-learning")?;
        let result = (|| -> Result<Value> {
            let prefs = self.preferences()?;
            let owner = self.project(project)?;
            ensure!(
                owner.revision == expected_project_revision,
                "project settings changed; open a fresh workbench link"
            );
            ensure!(
                !prefs.excludes(owner.root.to_string_lossy().as_ref()),
                "project is excluded from learning"
            );
            let task_id = self.prepare_revision(project, &request)?;
            let task: Task = self.get("task", &task_id)?;
            let previous: Version = self.get("version", &request.expected_version)?;
            let fingerprint = digest(&(
                "user-revision",
                &task_id,
                &request.expected_version,
                &request.request,
            ))?;
            let client = if owner.settings.model.is_some() {
                crate::conversations::Client::Codex
            } else {
                self.default_client()?
            };
            self.db.execute("INSERT INTO native_cycles(project,started,status,revision,project_revision,scope,automatic,report) VALUES(?1,?2,'running',?3,?4,'project',0,?5)",params![project,crate::background::now()?,prefs.work_revision,owner.revision,json!({"kind":"user_revision","task":task_id}).to_string()])?;
            let cycle = self.db.last_insert_rowid();
            let result = (|| -> Result<Value> {
                let packet = json!({"instruction":crate::prompts::REVISE_ROUTINE,"request":request.request,"sdk":include_str!("../../../sdk/clearings.d.ts"),"contract":task.contract,"source":previous.source,"cases":&task.cases[..task.cases.len()-1]});
                let response = self.native_request(
                    cycle,
                    client,
                    "user_revision",
                    packet,
                    "source",
                    &fingerprint,
                )?;
                self.check_native_cycle(cycle)?;
                self.evaluate_revision(
                    executable,
                    project,
                    &task_id,
                    response["source"]
                        .as_str()
                        .context("missing revised source")?
                        .to_owned(),
                )
            })();
            let report = match &result {
                Ok(v) => v.clone(),
                Err(e) => json!({"error":format!("{e:#}"),"task":task_id}),
            };
            let status = if result.is_ok() && report["accepted"] == true {
                "completed"
            } else {
                "failed"
            };
            self.db.execute(
                "UPDATE native_cycles SET status=?2,report=?3 WHERE id=?1",
                params![
                    cycle,
                    status,
                    json!({"kind":"user_revision","result":report}).to_string()
                ],
            )?;
            result
        })();
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
        result
    }
    pub fn apply_revision(
        &self,
        project: &str,
        task: &str,
        expected_version: &str,
    ) -> Result<Value> {
        let draft = self.draft(project, task)?;
        ensure!(
            draft["status"] == "accepted",
            "the update needs a passing evaluation"
        );
        let base = draft["base_task"]
            .as_str()
            .context("draft lacks base task")?;
        let expected = draft["base_version"]
            .as_str()
            .context("draft lacks base version")?;
        let version = draft["version"].as_str().context("draft lacks version")?;
        ensure!(
            version == expected_version,
            "update draft changed; inspect it before applying"
        );
        self.replace_definition(
            project,
            DefinitionChange {
                old_task: base,
                old_version: expected,
                task,
                version,
                previous: Some(expected),
                reason: "user_revision",
                project_revision: draft["project_revision"]
                    .as_u64()
                    .context("draft lacks project revision")?,
            },
        )?;
        let result = json!({"task":task,"active":version,"previous":expected});
        Ok(result)
    }
    pub(crate) fn undo_requirement_revision(
        &self,
        project: &str,
        task: &str,
        expected: &str,
        previous: &str,
    ) -> Result<Value> {
        let version: Version = self.get("version", previous)?;
        self.replace_definition(
            project,
            DefinitionChange {
                old_task: task,
                old_version: expected,
                task: &version.task,
                version: previous,
                previous: None,
                reason: "manual_rollback",
                project_revision: self.project(project)?.revision,
            },
        )?;
        Ok(json!({"task":version.task,"active":previous,"undone_version":expected}))
    }
    fn replace_definition(&self, project: &str, change: DefinitionChange<'_>) -> Result<()> {
        self.owns_task(project, change.old_task)?;
        let old: Task = self.get("task", change.old_task)?;
        let new: Task = self.get("task", change.task)?;
        let version: Version = self.get("version", change.version)?;
        ensure!(
            new.project.as_deref() == Some(project)
                && new.contract.name == old.contract.name
                && version.task == change.task,
            "update belongs to a different routine"
        );
        ensure!(
            version.engine == ENGINE
                && self.inspect(change.version)?["evaluation"]["accepted"] == true,
            "update requires a current passing evaluation"
        );
        let tx = rusqlite::Transaction::new_unchecked(
            &self.db,
            rusqlite::TransactionBehavior::Immediate,
        )?;
        if change.reason == "user_revision" {
            ensure!(tx.execute("UPDATE workbench_drafts SET body=json_set(body,'$.status','applied') WHERE project=?1 AND task=?2 AND json_extract(body,'$.version')=?3 AND json_extract(body,'$.status')='accepted'",params![project,change.task,change.version])?==1,"update draft changed; inspect it before applying");
        }
        ensure!(
            self.project(project)?.revision == change.project_revision,
            "project settings changed; prepare a fresh update"
        );
        ensure!(tx.execute("UPDATE project_routines SET task=?3,previous=?4 WHERE project=?1 AND task=?2 AND EXISTS(SELECT 1 FROM active WHERE task=?2 AND version=?5)",params![project,change.old_task,change.task,change.previous,change.old_version])?==1,"routine changed; refresh before applying an update");
        tx.execute("INSERT INTO active(task,version) VALUES(?1,?2) ON CONFLICT(task) DO UPDATE SET version=excluded.version",params![change.task,change.version])?;
        tx.execute("DELETE FROM active WHERE task=?1", [change.old_task])?;
        tx.execute("INSERT INTO routine_library(task,applicability) SELECT ?2,applicability FROM routine_library WHERE task=?1 ON CONFLICT(task) DO UPDATE SET applicability=excluded.applicability",params![change.old_task,change.task])?;
        tx.execute(
            "DELETE FROM routine_library WHERE task=?1",
            [change.old_task],
        )?;
        tx.execute("INSERT INTO library_controls(project,task,paused) SELECT project,?2,paused FROM library_controls WHERE task=?1 ON CONFLICT(project,task) DO UPDATE SET paused=excluded.paused",params![change.old_task,change.task])?;
        tx.execute(
            "DELETE FROM library_controls WHERE task=?1",
            [change.old_task],
        )?;
        tx.execute("INSERT INTO component_changes(project,task,version,previous,reason) VALUES(?1,?2,?3,?4,?5)",params![project,change.task,change.version,change.old_version,change.reason])?;
        tx.commit()?;
        Ok(())
    }
}
