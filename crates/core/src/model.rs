use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub const PROTOCOL_VERSION: u32 = 1;
pub const CORE_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const STRATEGY: &str = "individual-v1";
pub const MAX_CONTROL_BYTES: usize = 2_097_152;
pub const MAX_DEPENDENCIES: usize = 128;
pub const MAX_EVENTS: usize = 128;
pub const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Limits {
    pub max_runs: u32,
    pub max_nodes: u32,
    pub max_in_flight: u32,
}
impl Default for Limits {
    fn default() -> Self {
        Self {
            max_runs: 64,
            max_nodes: 4096,
            max_in_flight: 32,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Plan {
    pub protocol: u32,
    pub flow: String,
    pub build: String,
    pub nodes: Vec<Node>,
    pub root: u32,
    pub timeout_ms: u32,
    pub max_in_flight: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Node {
    pub kind: Kind,
    pub deps: Vec<u32>,
    pub binding: String,
    pub source: String,
    pub value: Option<u32>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Value,
    Call,
    Transform,
    Join,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    InvalidPlan,
    InvalidValue,
    Unsupported,
    Capacity,
    OperationFailed,
    TransformFailed,
    Cancelled,
    Timeout,
    Closed,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Failure {
    pub code: ErrorCode,
    pub source: Option<String>,
}
impl Failure {
    pub fn new(code: ErrorCode) -> Self {
        Self { code, source: None }
    }
}
impl std::fmt::Display for Failure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}",
            serde_json::to_string(self).map_err(|_| std::fmt::Error)?
        )
    }
}
impl std::error::Error for Failure {}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum Event {
    Complete {
        run: u32,
        command: u32,
        value: Option<u32>,
        error: Option<Failure>,
    },
    Cancel {
        run: u32,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Command {
    Dispatch {
        run: u32,
        command: u32,
        node: u32,
        kind: Kind,
        binding: String,
        source: String,
        inputs: Vec<u32>,
    },
    Release {
        run: u32,
        value: u32,
    },
    Cancel {
        run: u32,
        command: u32,
    },
    Finished {
        run: u32,
        value: Option<u32>,
        error: Option<Failure>,
        record: Record,
    },
    Dropped {
        run: u32,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct Record {
    pub protocol: u32,
    pub core_version: String,
    pub strategy: String,
    pub flow: String,
    pub build: String,
    pub started_ms: u64,
    pub finished_ms: u64,
    pub logical_calls: u32,
    pub dispatched_calls: u32,
    pub completed_calls: u32,
    pub queue_ms: u64,
    pub uncertain_actions: u32,
    pub effective_max_in_flight: u32,
    pub limit_origin: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct Turn {
    pub commands: Vec<Command>,
    pub has_work: bool,
    pub next_wakeup_ms: Option<u64>,
    pub steps: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct Snapshot {
    pub runs: u32,
    pub nodes: u32,
    pub in_flight: u32,
    pub ignored_completions: u64,
    pub closed: bool,
}
/// Schema root for both native bindings and generated SDK projections.
#[derive(JsonSchema)]
#[allow(dead_code)]
pub struct Protocol {
    pub limits: Limits,
    pub plan: Plan,
    pub event: Event,
    pub command: Command,
    pub turn: Turn,
    pub snapshot: Snapshot,
    pub failure: Failure,
}

pub fn decode<T: serde::de::DeserializeOwned>(json: &str) -> Result<T, Failure> {
    if json.len() > MAX_CONTROL_BYTES {
        return Err(Failure::new(ErrorCode::Capacity));
    }
    serde_json::from_str(json).map_err(|_| Failure::new(ErrorCode::InvalidPlan))
}
