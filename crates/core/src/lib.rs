//! Bounded host-independent scheduling. Application payloads stay in their host.
mod model;
mod scheduler;
pub use model::*;
pub use scheduler::Engine;
