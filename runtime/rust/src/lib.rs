//! Primitive runtime ABI for generated code, not an interpreter or a source-code loader.
//! Callers must type-check programs and prepare inputs before invoking generated functions.
mod execution;
mod inputs;
mod values;

pub use execution::*;
pub use inputs::*;
pub use values::*;

pub const RUNTIME_ABI_VERSION: &str = "0.1.0";
pub const EXECUTION_SEMANTICS_VERSION: &str = "0.1.0";
