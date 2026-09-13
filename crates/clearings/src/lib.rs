pub mod api;
pub mod capabilities;
pub mod contract;
pub mod execute;
mod file_io;
mod isolation;
pub mod mcp;
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
