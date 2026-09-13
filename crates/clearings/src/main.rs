use anyhow::Result;
use clap::{Parser, Subcommand};
use clearings::{
    api::{Api, Operation},
    capabilities::LocalBroker,
    contract::{Contract, Outcome, Policy},
    execute,
    store::Store,
};
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::path::PathBuf;

#[derive(Parser)]
#[command(
    version,
    about = "Turn repeated agent work into reusable TypeScript routines"
)]
struct Cli {
    /// Local SQLite file. Use a private directory; MCP requires this flag explicitly.
    #[arg(long, global = true)]
    store: Option<PathBuf>,
    #[command(subcommand)]
    command: Action,
}
#[derive(Subcommand)]
enum Action {
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
    Sdk,
    List {
        /// Continue with next_after from the preceding task page.
        #[arg(long)]
        after: Option<String>,
    },
    Inspect {
        id: String,
    },
    PrepareTask {
        file: PathBuf,
    },
    Submit {
        #[arg(long)]
        task: String,
        #[arg(long)]
        source: PathBuf,
    },
    Evaluate {
        version: String,
    },
    Activate {
        version: String,
        #[arg(long)]
        expected_active: Option<String>,
    },
    Deactivate {
        task: String,
        #[arg(long)]
        expected_active: String,
    },
    Run {
        task: String,
        #[arg(long)]
        input: PathBuf,
        #[arg(long)]
        policy: PathBuf,
    },
    Runs {
        /// Continue with next_before from the preceding history page.
        #[arg(long)]
        before: Option<i64>,
    },
    /// Serve MCP over stdio with fixed grants. No background daemon or model calls.
    Mcp {
        #[arg(long)]
        policy: PathBuf,
    },
    #[command(name = "__worker", hide = true)]
    Worker,
    #[command(name = "__isolation-probe", hide = true)]
    IsolationProbe {
        path: PathBuf,
    },
}
fn read<T: DeserializeOwned>(path: PathBuf) -> Result<T> {
    Ok(serde_json::from_slice(&std::fs::read(path)?)?)
}
fn main() -> Result<()> {
    let cli = Cli::parse();
    let executable = std::env::current_exe()?;
    match cli.command {
        Action::Worker => clearings::worker_main(),
        Action::IsolationProbe { path } => clearings::isolation_probe(&path),
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
            let contract: Contract = read(contract)?;
            contract.validate()?;
            let policy: Policy = read(policy)?;
            let prepared = execute::prepare(&executable, &std::fs::read_to_string(source)?)?;
            let mut broker = LocalBroker::new(&contract, &policy)?;
            let run = execute::run(&executable, &contract, &prepared, read(input)?, &mut broker);
            println!("{}", serde_json::to_string_pretty(&run)?);
            anyhow::ensure!(
                !matches!(run.outcome, Outcome::Failed { .. }),
                "routine failed; see JSON result"
            );
            Ok(())
        }
        action => {
            let store =
                Store::open(&cli.store.ok_or_else(|| {
                    anyhow::anyhow!("provide --store /path/to/private/state.db")
                })?)?;
            let mut api = Api {
                store,
                policy: Policy::default(),
                executable,
            };
            let operation = match action {
                Action::Mcp { policy } => {
                    api.policy = read(policy)?;
                    return clearings::mcp::serve(api);
                }
                Action::List { after } => Operation::List { after },
                Action::Inspect { id } => Operation::Inspect { id },
                Action::PrepareTask { file } => Operation::PrepareTask { task: read(file)? },
                Action::Submit { task, source } => Operation::Submit {
                    task,
                    source: std::fs::read_to_string(source)?,
                },
                Action::Evaluate { version } => Operation::Evaluate { version },
                Action::Activate {
                    version,
                    expected_active,
                } => Operation::Activate {
                    version,
                    expected_active,
                },
                Action::Deactivate {
                    task,
                    expected_active,
                } => Operation::Deactivate {
                    task,
                    expected_active,
                },
                Action::Run {
                    task,
                    input,
                    policy,
                } => {
                    api.policy = read(policy)?;
                    Operation::Run {
                        task,
                        input: read::<Value>(input)?,
                    }
                }
                Action::Runs { before } => Operation::Runs { before },
                _ => unreachable!(),
            };
            let value = api.call(operation)?;
            println!("{}", serde_json::to_string_pretty(&value)?);
            anyhow::ensure!(
                !clearings::api::failed(&value),
                "operation failed; see JSON result"
            );
            Ok(())
        }
    }
}
