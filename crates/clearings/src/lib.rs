pub mod activity;
pub mod api;
pub mod background;
mod blocking_io;
pub mod capabilities;
mod client_process;
pub mod contract;
pub mod conversations;
pub mod execute;
mod improvement;
mod isolation;
mod learning;
pub mod management;
pub mod mcp;
mod model;
pub mod plugin;
pub mod project;
pub mod reuse;
pub mod store;
mod transform;
mod worker;

pub use worker::worker_main;

/// Exercise the native isolation boundary in a disposable process, without guest code.
pub fn isolation_probe(path: &std::path::Path) -> anyhow::Result<()> {
    isolation::enter()?;
    anyhow::ensure!(
        std::fs::read(path).is_err(),
        "native filesystem read escaped isolation"
    );
    anyhow::ensure!(
        std::fs::write(path, b"changed").is_err(),
        "native filesystem write escaped isolation"
    );
    anyhow::ensure!(
        std::net::TcpListener::bind("127.0.0.1:0").is_err(),
        "native socket escaped isolation"
    );
    anyhow::ensure!(
        std::process::Command::new("/bin/true").status().is_err(),
        "native process escaped isolation"
    );
    Ok(())
}
