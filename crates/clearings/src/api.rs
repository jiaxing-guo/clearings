use crate::{
    contract::Policy,
    store::{Store, Task},
};
use anyhow::Result;
use serde::Deserialize;
use serde_json::{Value, json};
use std::path::PathBuf;

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum Operation {
    LearningPreferences {
        expected_revision: u64,
        changes: Value,
    },
    UndoLearning {
        expected_version: String,
        #[serde(default)]
        scope: crate::conversations::Scope,
    },
    LearnNow {
        #[serde(default)]
        scope: crate::conversations::Scope,
    },
    LearningStatus,
    PrepareConversationTask {
        task: Task,
        evidence_ids: Vec<String>,
        #[serde(default)]
        scope: crate::conversations::Scope,
    },
    Workbench,
    Library {
        after: Option<String>,
    },
    FindRoutines {
        query: String,
    },
    ShareRoutine {
        name: String,
        applicability: String,
    },
    LibraryRoutine {
        id: String,
        part: Option<String>,
    },
    RunRoutine {
        #[serde(default)]
        purpose: crate::store::RunPurpose,
        id: String,
        input: Value,
        expected_version: Option<String>,
        expected_capabilities: Option<Vec<String>>,
    },
    PauseShared {
        id: String,
        paused: bool,
    },
    RecentConversations {
        #[serde(default)]
        scope: crate::conversations::Scope,
        client: Option<crate::conversations::Client>,
        #[serde(default = "history_days")]
        days: u32,
        cursor: Option<String>,
    },
    ReadConversation {
        id: String,
        #[serde(default)]
        scope: crate::conversations::Scope,
        cursor: Option<String>,
    },
    ProjectStatus,
    Routine {
        name: String,
    },
    Manage {
        name: String,
        control: crate::management::Control,
        expected_active: Option<String>,
    },
    Digest {
        after: Option<i64>,
    },
    ModelUsage {
        before: Option<i64>,
    },
    Prune {
        #[serde(default)]
        apply: bool,
    },
    RecordObservation {
        session: String,
        observation: crate::activity::Observation,
    },
    BackgroundCancel,
    BackgroundJobs {
        before: Option<i64>,
    },
    Observe,
    Activity {
        before: Option<i64>,
    },
    Performance {
        name: String,
        after: Option<String>,
    },
    Discover {
        after: Option<String>,
    },
    Save {
        name: String,
        source: String,
        expected_active: Option<String>,
    },
    Reuse {
        name: String,
        input: Value,
    },
    List {
        after: Option<String>,
    },
    Inspect {
        id: String,
    },
    PrepareTask {
        task: Task,
    },
    Submit {
        task: String,
        source: String,
    },
    Evaluate {
        version: String,
    },
    Activate {
        version: String,
        expected_active: Option<String>,
    },
    Deactivate {
        task: String,
        expected_active: String,
    },
    Run {
        task: String,
        input: Value,
    },
    Runs {
        before: Option<i64>,
    },
    Sdk,
}
pub struct Api {
    pub store: Store,
    pub project: Option<String>,
    pub policy: Policy,
    pub executable: PathBuf,
}
fn history_days() -> u32 {
    7
}
impl Api {
    pub fn call(&mut self, op: Operation) -> Result<Value> {
        if let Some(project) = &self.project {
            let grants = self.store.project(project)?.settings.grants;
            if !matches!(
                op,
                Operation::ProjectStatus
                    | Operation::Sdk
                    | Operation::LearningStatus
                    | Operation::LearningPreferences { .. }
                    | Operation::UndoLearning { .. }
            ) {
                anyhow::ensure!(
                    serde_json::to_value(&self.policy)? == serde_json::to_value(grants)?,
                    "project grants changed; restart this session with the current policy"
                );
            }
        }
        match &op {
            Operation::Submit { task, .. }
            | Operation::Run { task, .. }
            | Operation::Deactivate { task, .. } => {
                self.store.check_task_scope(self.project.as_deref(), task)?
            }
            Operation::Evaluate { version } | Operation::Activate { version, .. } => self
                .store
                .check_version_scope(self.project.as_deref(), version)?,
            Operation::Inspect { id } => {
                let inspected = self.store.inspect(id)?;
                if inspected["kind"] == "version" {
                    self.store
                        .check_version_scope(self.project.as_deref(), id)?;
                } else {
                    self.store.check_task_scope(self.project.as_deref(), id)?;
                }
            }
            Operation::PrepareTask { task } => anyhow::ensure!(
                task.project.is_none(),
                "project ownership is host-assigned; omit project from task input"
            ),
            _ => {}
        }
        Ok(match op {
            Operation::LearningPreferences {
                expected_revision,
                changes,
            } => self.store.update_preferences(expected_revision, changes)?,
            Operation::UndoLearning {
                expected_version,
                scope,
            } => self.store.undo_learning(
                if scope == crate::conversations::Scope::Project {
                    Some(
                        self.project
                            .as_deref()
                            .ok_or_else(|| anyhow::anyhow!("select a project"))?,
                    )
                } else {
                    None
                },
                Some(&expected_version),
            )?,
            Operation::LearnNow { scope } => self.store.start_learning(
                self.project
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("select a project"))?,
                scope,
                &self.executable,
            )?,
            Operation::LearningStatus => self.store.learning_status()?,
            Operation::PrepareConversationTask {
                task,
                evidence_ids,
                scope,
            } => self.store.prepare_conversation_task(
                self.project
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("select a project"))?,
                task,
                &evidence_ids,
                scope,
            )?,
            Operation::Workbench => crate::workbench::launch(
                &self.store,
                self.project
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("select a project"))?,
                &self.executable,
            )?,
            Operation::Library { after } => self.store.routine_library_page(
                self.project
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("select a project"))?,
                after.as_deref(),
            )?,
            Operation::FindRoutines { query } => self.store.find_routines(
                self.project
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("select a project"))?,
                &query,
            )?,
            Operation::ShareRoutine {
                name,
                applicability,
            } => self.store.share_routine(
                self.project
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("select a project"))?,
                &name,
                &applicability,
            )?,
            Operation::LibraryRoutine { id, part } => self.store.library_part(
                self.project
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("select a project"))?,
                &id,
                part.as_deref(),
            )?,
            Operation::RunRoutine {
                purpose,
                id,
                input,
                expected_version,
                expected_capabilities,
            } => {
                let expected = match (
                    expected_version.as_deref(),
                    expected_capabilities.as_deref(),
                ) {
                    (Some(version), Some(capabilities)) => Some(crate::store::ExpectedRoutine {
                        version,
                        capabilities,
                    }),
                    (None, None) => None,
                    _ => {
                        anyhow::bail!("provide expected_version and expected_capabilities together")
                    }
                };
                self.store.run_selected(
                    &self.executable,
                    &id,
                    input,
                    &self.policy,
                    Some(
                        self.project
                            .as_deref()
                            .ok_or_else(|| anyhow::anyhow!("select a project"))?,
                    ),
                    crate::store::RunOptions { expected, purpose },
                )?
            }
            Operation::PauseShared { id, paused } => self.store.pause_shared(
                self.project
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("select a project"))?,
                &id,
                paused,
            )?,
            Operation::RecentConversations {
                scope,
                client,
                days,
                cursor,
            } => self.store.recent_conversations(
                self.project
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("select a project first"))?,
                scope,
                client,
                days,
                cursor.as_deref(),
            )?,
            Operation::ReadConversation { id, scope, cursor } => self.store.read_conversation(
                self.project
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("select a project first"))?,
                &id,
                scope,
                cursor.as_deref(),
            )?,
            Operation::Routine { name } => self.store.inspect_named(
                self.project
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("select --project"))?,
                &name,
            )?,
            Operation::Manage {
                name,
                control,
                expected_active,
            } => self.store.manage(
                self.project
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("select --project"))?,
                &name,
                control,
                expected_active.as_deref(),
            )?,
            Operation::Digest { after } => self.store.digest_page(
                self.project
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("select --project"))?,
                after,
            )?,
            Operation::ModelUsage { before } => self.store.model_usage(
                self.project
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("select --project"))?,
                before,
            )?,
            Operation::Prune { apply } => self.store.prune(
                self.project
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("select --project"))?,
                apply,
            )?,
            Operation::RecordObservation {
                session,
                observation,
            } => self.store.record_observation(
                self.project
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("select --project"))?,
                &session,
                observation,
            )?,
            Operation::BackgroundCancel => self.store.cancel_background(
                self.project
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("select --project"))?,
            )?,
            Operation::BackgroundJobs { before } => self.store.background_jobs(
                self.project
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("select --project"))?,
                before,
            )?,
            Operation::Observe => self.store.observe(
                self.project
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("select --project"))?,
            )?,
            Operation::Activity { before } => self.store.activity(
                self.project
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("select --project"))?,
                before,
            )?,
            Operation::Performance { name, after } => self.store.performance_page(
                self.project
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("select --project"))?,
                &name,
                after.as_deref(),
            )?,
            Operation::Discover { after } => self.store.named_list(
                self.project
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("select --project"))?,
                after.as_deref(),
            )?,
            Operation::Save {
                name,
                source,
                expected_active,
            } => self.store.save_named(
                &self.executable,
                self.project
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("select --project"))?,
                &name,
                source,
                expected_active.as_deref(),
            )?,
            Operation::Reuse { name, input } => self.store.reuse_named(
                &self.executable,
                self.project
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("select --project"))?,
                &name,
                input,
                &self.policy,
            )?,
            Operation::ProjectStatus => serde_json::to_value(
                self.store.project(
                    self.project
                        .as_deref()
                        .ok_or_else(|| anyhow::anyhow!("select --project"))?,
                )?,
            )?,
            Operation::List { after } => {
                if let Some(project) = &self.project {
                    self.store.named_list(project, after.as_deref())?
                } else {
                    self.store.list_page(after.as_deref())?
                }
            }
            Operation::Inspect { id } => self.store.inspect(&id)?,
            Operation::PrepareTask { task } => {
                json!({"task": if let Some(project) = &self.project { self.store.prepare_named(project, task, "user")? } else { self.store.prepare_task(&task)? }})
            }
            Operation::Submit { task, source } => {
                json!({"version":self.store.submit(&self.executable,&task,source)?})
            }
            Operation::Evaluate { version } => self.store.evaluate(&self.executable, &version)?,
            Operation::Activate {
                version,
                expected_active,
            } => {
                self.store.activate(&version, expected_active.as_deref())?;
                json!({"active":version})
            }
            Operation::Deactivate {
                task,
                expected_active,
            } => {
                self.store.deactivate(&task, &expected_active)?;
                json!({"active":null})
            }
            Operation::Run { task, input } => {
                self.store
                    .run(&self.executable, &task, input, &self.policy)?
            }
            Operation::Runs { before } => self
                .store
                .runs_page_for_project(self.project.as_deref(), before)?,
            Operation::Sdk => sdk_definition(),
        })
    }
}
pub fn failed(value: &Value) -> bool {
    value.get("status").and_then(Value::as_str) == Some("failed")
        || value.get("accepted") == Some(&Value::Bool(false))
        || value["run"]["outcome"]["status"] == "failed"
}

pub fn sdk_definition() -> Value {
    let mut wrapper: Value = serde_json::from_str(include_str!(
        "../../../examples/normalize-contact-file/task.json"
    ))
    .expect("bundled wrapper task is valid JSON");
    wrapper["cases"].as_array_mut().unwrap().truncate(3);
    json!({"typescript":include_str!("../../../sdk/clearings.d.ts"),"file_wrapper_example":{"task":wrapper,"source":include_str!("../../../examples/normalize-contact-file/routine.ts"),"guidance":"Pass a granted root alias and relative file path. File contents remain in the runtime; return only the result the user needs. These acceptance fixtures are illustrative, not grants."},"task_format":"cases is an array of JSON objects, not JSON-encoded strings. Each call fixture uses name, input, and result. Fixtures are constructed test data, not real capability grants.","file_task_example":serde_json::from_str::<Value>(include_str!("../../../examples/repository-context/task.json")).expect("bundled task example is valid JSON"),"task_example":{
        "contract":{"abi":1,"name":"double","description":"Double an integer","input_schema":{"type":"integer"},"output_schema":{"type":"integer"},"capabilities":[]},
        "cases":[{"name":"positive","input":3,"expected":{"status":"completed","output":6}},{"name":"negative","input":-2,"expected":{"status":"completed","output":-4}}]
    }})
}
