use anyhow::{Result, bail, ensure};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::path::PathBuf;

pub const ABI: u32 = 1;
pub const MAX_WIRE_BYTES: usize = 4 * 1024 * 1024;
pub const MAX_SOURCE_BYTES: usize = 256 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Limits {
    pub wall_ms: u64,
    pub heap_bytes: usize,
    pub output_bytes: usize,
    pub capability_calls: usize,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            wall_ms: 5_000,
            heap_bytes: 32 * 1024 * 1024,
            output_bytes: 256 * 1024,
            capability_calls: 64,
        }
    }
}

impl Limits {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            (10..=60_000).contains(&self.wall_ms),
            "wall_ms must be between 10 and 60000"
        );
        ensure!(
            (1024 * 1024..=128 * 1024 * 1024).contains(&self.heap_bytes),
            "heap_bytes outside supported range"
        );
        ensure!(
            (1..=1024 * 1024).contains(&self.output_bytes),
            "output_bytes outside supported range"
        );
        ensure!(self.capability_calls <= 1024, "too many capability calls");
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Contract {
    pub abi: u32,
    pub name: String,
    pub description: String,
    pub input_schema: Value,
    pub output_schema: Value,
    #[serde(default)]
    pub capabilities: Vec<String>,
    #[serde(default)]
    pub limits: Limits,
}

impl Contract {
    pub fn validate(&self) -> Result<()> {
        ensure!(self.abi == ABI, "unsupported routine ABI");
        ensure!(
            !self.name.is_empty()
                && self.name.len() <= 80
                && self
                    .name
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'),
            "invalid routine name"
        );
        ensure!(self.description.len() <= 4096, "description too long");
        ensure!(self.capabilities.len() <= 64, "too many capabilities");
        self.limits.validate()?;
        compile_schema(&self.input_schema)?;
        compile_schema(&self.output_schema)?;
        Ok(())
    }

    pub fn check_input(&self, value: &Value) -> Result<()> {
        check_json(value)?;
        validate_schema(&self.input_schema, value)
    }

    pub fn check_outcome(&self, outcome: &Outcome) -> Result<()> {
        if let Outcome::Completed { output } = outcome {
            check_json(output)?;
            validate_schema(&self.output_schema, output)?;
        }
        Ok(())
    }
}

// Schema references are local to this document. Validation must never fetch a URL.
fn compile_schema(schema: &Value) -> Result<jsonschema::Validator> {
    fn refs(value: &Value) -> Result<()> {
        match value {
            Value::Object(map) => {
                for (key, value) in map {
                    if key == "$ref" || key == "$dynamicRef" {
                        ensure!(
                            value.as_str().is_some_and(|s| s.starts_with('#')),
                            "only local schema references are supported"
                        );
                    }
                    refs(value)?;
                }
            }
            Value::Array(values) => {
                for value in values {
                    refs(value)?;
                }
            }
            _ => {}
        }
        Ok(())
    }
    refs(schema)?;
    jsonschema::validator_for(schema).map_err(|e| anyhow::anyhow!("invalid schema: {e}"))
}

pub fn validate_schema(schema: &Value, value: &Value) -> Result<()> {
    compile_schema(schema)?
        .validate(value)
        .map_err(|e| anyhow::anyhow!("schema mismatch: {e}"))
}

pub fn check_json(value: &Value) -> Result<()> {
    match value {
        Value::Number(n) => {
            let n = n
                .as_f64()
                .ok_or_else(|| anyhow::anyhow!("invalid number"))?;
            ensure!(
                n.is_finite() && n.abs() <= 9_007_199_254_740_991.0,
                "numbers must fit the JavaScript safe range; encode large IDs as strings"
            );
        }
        Value::Array(values) => {
            for v in values {
                check_json(v)?;
            }
        }
        Value::Object(values) => {
            for v in values.values() {
                check_json(v)?;
            }
        }
        _ => {}
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case", deny_unknown_fields)]
pub enum Outcome {
    Completed { output: Value },
    NotApplicable { reason: String },
    NeedsAgent { reason: String, context: Value },
    Failed { code: String, message: String },
}

impl Outcome {
    pub fn failed(code: &str, error: impl std::fmt::Display) -> Self {
        Self::Failed {
            code: code.into(),
            message: error.to_string(),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Policy {
    #[serde(default)]
    pub roots: BTreeMap<String, PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Prepared {
    pub abi: u32,
    pub javascript: String,
    pub source_map: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Request {
    Prepare {
        source: String,
    },
    Run {
        prepared: Prepared,
        input: Value,
        limits: Limits,
    },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Event {
    Prepared { prepared: Prepared },
    Call { name: String, input: Value },
    Finished { outcome: Outcome },
    Error { message: String },
}

pub fn require_source(source: &str) -> Result<()> {
    if source.len() > MAX_SOURCE_BYTES {
        bail!("routine source exceeds 256 KiB");
    }
    Ok(())
}
