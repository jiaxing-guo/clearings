use anyhow::Result;
use clap::{Parser, Subcommand};
use clearings::{
    api::{Api, Operation},
    capabilities::LocalBroker,
    contract::{Contract, MAX_SOURCE_BYTES, MAX_WIRE_BYTES, Outcome, Policy},
    execute,
    store::Store,
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
            let policy: Policy = read(policy)?;
            let prepared = execute::prepare(
                &executable,
                &String::from_utf8(read_bytes(source, MAX_SOURCE_BYTES)?)?,
            )?;
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
                    source: String::from_utf8(read_bytes(source, MAX_SOURCE_BYTES)?)?,
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
