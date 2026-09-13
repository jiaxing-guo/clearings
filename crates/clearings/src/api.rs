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
    List,
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
    Runs { before: Option<i64> },
    Sdk,
}
pub struct Api {
    pub store: Store,
    pub policy: Policy,
    pub executable: PathBuf,
}
impl Api {
    pub fn call(&mut self, op: Operation) -> Result<Value> {
        Ok(match op {
            Operation::List => self.store.list()?,
            Operation::Inspect { id } => self.store.inspect(&id)?,
            Operation::PrepareTask { task } => json!({"task":self.store.prepare_task(&task)?}),
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
            Operation::Runs { before } => self.store.runs_page(before)?,
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
