use anyhow::Result;
use clap::{Parser, Subcommand};
use clearings::{
    capabilities::LocalBroker,
    contract::{Contract, MAX_SOURCE_BYTES, MAX_WIRE_BYTES, Policy},
    execute,
};
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::io::Read;
use std::path::PathBuf;

#[derive(Parser)]
#[command(
    version,
    about = "Turn repeated agent work into reusable TypeScript routines"
)]
struct Cli {
    #[command(subcommand)]
    command: Action,
}

#[derive(Subcommand)]
enum Action {
    /// Execute source with explicit input, contract and host grants.
    RunSource {
        #[arg(long)]
        source: PathBuf,
        #[arg(long)]
        contract: PathBuf,
        #[arg(long)]
        input: PathBuf,
        #[arg(long)]
        policy: PathBuf,
    },
    /// Print the authoring interface; it is bundled into the executable.
    Sdk,
    #[command(name = "__worker", hide = true)]
    Worker,
    #[command(name = "__isolation-probe", hide = true)]
    IsolationProbe { path: PathBuf },
}

fn read<T: DeserializeOwned>(path: PathBuf) -> Result<T> {
    Ok(serde_json::from_slice(&read_bytes(
        path,
        MAX_WIRE_BYTES - 1,
    )?)?)
}

fn read_bytes(path: PathBuf, limit: usize) -> Result<Vec<u8>> {
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NONBLOCK);
    }
    let file = options.open(path)?;
    anyhow::ensure!(file.metadata()?.is_file(), "input must be a regular file");
    let mut bytes = Vec::new();
    file.take(limit as u64 + 1).read_to_end(&mut bytes)?;
    anyhow::ensure!(bytes.len() <= limit, "input file exceeds byte limit");
    Ok(bytes)
}

fn main() -> Result<()> {
    match Cli::parse().command {
        Action::IsolationProbe { path } => clearings::isolation_probe(&path),
        Action::Worker => clearings::worker_main(),
        Action::Sdk => {
            print!("{}", include_str!("../../../sdk/clearings.d.ts"));
            Ok(())
        }
        Action::RunSource {
            source,
            contract,
            input,
            policy,
        } => {
            let executable = std::env::current_exe()?;
            let contract: Contract = read(contract)?;
            let policy: Policy = read(policy)?;
            let input: Value = read(input)?;
            let prepared = execute::prepare(
                &executable,
                &String::from_utf8(read_bytes(source, MAX_SOURCE_BYTES)?)?,
            )?;
            let mut broker = LocalBroker::new(&contract, &policy)?;
            let run = execute::run(&executable, &contract, &prepared, input, &mut broker);
            println!("{}", serde_json::to_string_pretty(&run)?);
            anyhow::ensure!(
                !matches!(run.outcome, clearings::contract::Outcome::Failed { .. }),
                "routine failed; see JSON result"
            );
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn input_files_are_bounded_before_deserialization() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("input.json");
        std::fs::write(&path, b"null").unwrap();
        assert_eq!(read::<Value>(path.clone()).unwrap(), Value::Null);
        let file = std::fs::File::create(&path).unwrap();
        file.set_len(2 * 1024 * 1024 * 1024).unwrap();
        assert!(
            read::<Value>(path)
                .unwrap_err()
                .to_string()
                .contains("byte limit")
        );
    }
}
