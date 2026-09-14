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
    ProjectStatus,
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
impl Api {
    pub fn call(&mut self, op: Operation) -> Result<Value> {
        if let Some(project) = &self.project {
            let grants = self.store.project(project)?.settings.grants;
            if !matches!(op, Operation::ProjectStatus | Operation::Sdk) {
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
            Operation::Sdk => {
                json!({"typescript":include_str!("../../../sdk/clearings.d.ts"),"task_example":{
                    "contract":{"abi":1,"name":"double","description":"Double an integer","input_schema":{"type":"integer"},"output_schema":{"type":"integer"},"capabilities":[]},
                    "cases":[{"name":"positive","input":3,"expected":{"status":"completed","output":6}},{"name":"negative","input":-2,"expected":{"status":"completed","output":-4}}]
                }})
            }
        })
    }
}
pub fn failed(value: &Value) -> bool {
    value.get("accepted") == Some(&Value::Bool(false))
        || value["run"]["outcome"]["status"] == "failed"
}
