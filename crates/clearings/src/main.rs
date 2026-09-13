use anyhow::Result;
use clap::{Parser, Subcommand};
use clearings::{capabilities::LocalBroker, contract::{Contract, Policy}, execute};
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::path::PathBuf;

#[derive(Parser)]
#[command(version, about = "Turn repeated agent work into reusable TypeScript routines")]
struct Cli { #[command(subcommand)] command: Action }

#[derive(Subcommand)]
enum Action {
    /// Execute source with explicit input, contract and host grants.
    RunSource { #[arg(long)] source: PathBuf, #[arg(long)] contract: PathBuf, #[arg(long)] input: PathBuf, #[arg(long)] policy: PathBuf },
    /// Print the authoring interface; it is bundled into the executable.
    Sdk,
    #[command(name = "__worker", hide = true)]
    Worker,
}

fn read<T: DeserializeOwned>(path: PathBuf) -> Result<T> { Ok(serde_json::from_slice(&std::fs::read(path)?)?) }

fn main() -> Result<()> {
    match Cli::parse().command {
        Action::Worker => clearings::worker_main(),
        Action::Sdk => { print!("{}", include_str!("../../../sdk/clearings.d.ts")); Ok(()) }
        Action::RunSource { source, contract, input, policy } => {
            let executable = std::env::current_exe()?;
            let contract: Contract = read(contract)?;
            contract.validate()?;
            let policy: Policy = read(policy)?;
            let input: Value = read(input)?;
            let prepared = execute::prepare(&executable, &std::fs::read_to_string(source)?)?;
            let mut broker = LocalBroker::new(&contract, &policy)?;
            let run = execute::run(&executable, &contract, &prepared, input, &mut broker);
            println!("{}", serde_json::to_string_pretty(&run)?);
            Ok(())
        }
    }
}

