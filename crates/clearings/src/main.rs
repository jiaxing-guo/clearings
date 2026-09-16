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
    /// Select a project configured with project-configure.
    #[arg(long, global = true)]
    project: Option<String>,
    #[command(subcommand)]
    command: Action,
}
#[derive(Subcommand)]
enum Action {
    Install {
        #[arg(long)]
        data_dir: Option<PathBuf>,
        #[arg(long)]
        no_service: bool,
        #[arg(long)]
        no_client: bool,
    },
    LearningService {
        #[arg(long)]
        data_dir: Option<PathBuf>,
    },
    PauseLearning,
    ResumeLearning,
    LearningSchedule {
        #[arg(value_enum)]
        frequency: Frequency,
    },
    ExcludeLearning {
        project: String,
    },
    IncludeLearning {
        project: String,
    },
    UndoLearning,
    #[command(hide = true)]
    LearningJob {
        id: i64,
    },
    LearnNow {
        #[arg(long)]
        all: bool,
    },
    LearningStatus,
    PrepareConversationTask {
        file: PathBuf,
        #[arg(long, num_args=1.., value_name="EVIDENCE_ID")]
        evidence_ids: Vec<String>,
        #[arg(long)]
        all: bool,
    },
    Workbench,
    #[command(hide = true)]
    WorkbenchServe {
        #[arg(long)]
        session_dir: PathBuf,
    },
    Library {
        #[arg(long)]
        after: Option<String>,
    },
    FindRoutines {
        query: String,
    },
    ShareRoutine {
        name: String,
        #[arg(long)]
        applicability: String,
    },
    LibraryRoutine {
        id: String,
        #[arg(long,value_parser=["task","version"])]
        part: Option<String>,
    },
    RunRoutine {
        #[arg(long, value_enum, default_value = "reuse")]
        purpose: clearings::store::RunPurpose,
        id: String,
        #[arg(long)]
        input: PathBuf,
    },
    PauseShared {
        id: String,
        #[arg(long)]
        resume: bool,
    },
    PluginSuggest {
        #[arg(long, required = true)]
        all_projects: bool,
        #[arg(long)]
        data_dir: Option<PathBuf>,
    },
    RecentConversations {
        #[arg(long)]
        all: bool,
        #[arg(long)]
        client: Option<clearings::conversations::Client>,
        #[arg(long, default_value_t = 7)]
        days: u32,
        #[arg(long)]
        cursor: Option<String>,
    },
    ReadConversation {
        id: String,
        #[arg(long)]
        all: bool,
        #[arg(long)]
        cursor: Option<String>,
    },
    /// Host SessionStart hook: register the working directory supplied on stdin.
    PluginRegister {
        #[arg(long, required = true)]
        all_projects: bool,
        #[arg(long)]
        data_dir: Option<PathBuf>,
    },
    /// Plugin entry point: automatically provision the projects selected by the host agent.
    PluginMcp {
        /// Installation-wide permission to read projects opened with this plugin.
        #[arg(long, required = true)]
        all_projects: bool,
        /// Override the private user data directory (normally chosen automatically).
        #[arg(long)]
        data_dir: Option<PathBuf>,
    },
    ProjectConfigure {
        #[arg(long)]
        root: PathBuf,
        #[arg(long)]
        name: String,
        #[arg(long)]
        settings: PathBuf,
        #[arg(long)]
        expected_revision: Option<u64>,
    },
    ProjectStatus,
    Routine {
        name: String,
    },
    Manage {
        name: String,
        #[arg(value_enum)]
        control: clearings::management::Control,
        #[arg(long)]
        expected_active: Option<String>,
    },
    Digest {
        #[arg(long)]
        after: Option<i64>,
    },
    ModelUsage {
        #[arg(long)]
        before: Option<i64>,
    },
    Prune {
        #[arg(long)]
        apply: bool,
    },
    RecordObservation {
        #[arg(long)]
        session: String,
        #[arg(long)]
        file: PathBuf,
    },
    Background {
        #[arg(long)]
        once: bool,
    },
    BackgroundCancel,
    BackgroundJobs {
        #[arg(long)]
        before: Option<i64>,
    },
    Observe,
    Activity {
        #[arg(long)]
        before: Option<i64>,
    },
    Performance {
        name: String,
        #[arg(long)]
        after: Option<String>,
    },
    Discover {
        #[arg(long)]
        after: Option<String>,
    },
    Save {
        name: String,
        #[arg(long)]
        source: PathBuf,
        #[arg(long)]
        expected_active: Option<String>,
    },
    Reuse {
        name: String,
        #[arg(long)]
        input: PathBuf,
    },
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
    Sdk {
        #[arg(long)]
        json: bool,
    },
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
#[derive(Clone, clap::ValueEnum)]
enum Frequency {
    Daily,
    TwiceDaily,
    EveryTwoDays,
    Weekly,
}
impl Frequency {
    fn seconds(&self) -> u64 {
        match self {
            Self::Daily => 86400,
            Self::TwiceDaily => 43200,
            Self::EveryTwoDays => 172800,
            Self::Weekly => 604800,
        }
    }
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
    let register_session = matches!(&cli.command, Action::PluginRegister { .. });
    match cli.command {
        Action::WorkbenchServe { session_dir } => {
            let database = cli
                .store
                .ok_or_else(|| anyhow::anyhow!("workbench requires a store"))?;
            let project = cli
                .project
                .ok_or_else(|| anyhow::anyhow!("workbench requires a project"))?;
            let (server, listener) =
                clearings::workbench::Workbench::bind(database, project, executable)?;
            server.serve(listener, session_dir)
        }
        Action::Install {
            data_dir,
            no_service,
            no_client,
        } => {
            let directory = clearings::plugin::data_directory(data_dir)?;
            let store = Store::open(&directory.join("state.db"))?;
            store.enable_default_history()?;
            if no_service {
                store.update_preferences(
                    store.preferences()?.revision,
                    serde_json::json!({"service_enabled":false}),
                )?;
            }
            store.bind_plugin_service(!no_client)?;
            let client = if no_client {
                Value::Null
            } else {
                clearings::service::register_client(&store, &executable)?
            };
            let service = if no_service {
                Value::Null
            } else {
                clearings::service::install_service(&store, &directory, &executable)?
            };
            println!(
                "{}",
                serde_json::json!({"status":"installed","client":client,"service":service,"defaults":store.preferences()?})
            );
            Ok(())
        }
        Action::LearningService { data_dir } => {
            let directory = clearings::plugin::data_directory(data_dir)?;
            let mut store = Store::open(&directory.join("state.db"))?;
            let result = store.default_tick(&directory, &executable)?;
            println!("{result}");
            anyhow::ensure!(
                !clearings::api::failed(&result),
                "learning cycle failed; inspect learning-status"
            );
            Ok(())
        }
        Action::PluginSuggest {
            all_projects,
            data_dir,
        } => {
            anyhow::ensure!(all_projects, "plugin authorization required");
            let directory = clearings::plugin::data_directory(data_dir)?;
            let store = Store::open(&directory.join("state.db"))?;
            let mut input = vec![];
            std::io::stdin()
                .lock()
                .take(65537)
                .read_to_end(&mut input)?;
            anyhow::ensure!(input.len() <= 65536, "hook input exceeds limit");
            let value = store.suggest(&serde_json::from_slice(&input)?)?;
            if !value.is_null() {
                println!("{value}");
            }
            Ok(())
        }
        Action::PluginMcp {
            all_projects,
            data_dir,
        }
        | Action::PluginRegister {
            all_projects,
            data_dir,
        } => {
            anyhow::ensure!(
                all_projects,
                "plugin installation must authorize project access"
            );
            anyhow::ensure!(
                cli.store.is_none() && cli.project.is_none(),
                "plugin mode manages its own store and project selection"
            );
            let default_install =
                data_dir.is_none() && std::env::var_os("CLEARINGS_DATA_DIR").is_none();
            let directory = clearings::plugin::data_directory(data_dir)?;
            let mut store = Store::open(&directory.join("state.db"))?;
            if register_session {
                clearings::plugin::register_session(&mut store, std::io::stdin().lock())?;
                if default_install {
                    store.bind_plugin_service(true)?;
                    if let Err(error) = store.check_service_integration().and_then(|()| {
                        clearings::service::install_service(&store, &directory, &executable)
                    }) {
                        store.record_service_error(&error.to_string())?;
                    }
                    let notice = store.learning_notice()?;
                    if !notice.is_null() {
                        println!("{notice}");
                    }
                }
                return Ok(());
            }
            let api = Api {
                store,
                policy: Policy::default(),
                project: None,
                executable,
            };
            clearings::mcp::serve_plugin(api)
        }
        Action::Worker => clearings::worker_main(),
        Action::IsolationProbe { path } => clearings::isolation_probe(&path),
        Action::Sdk { json } => {
            if json {
                println!("{}", clearings::api::sdk_definition());
            } else {
                print!("{}", include_str!("../../../sdk/clearings.d.ts"));
            }
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
            let defaults = cli.store.is_none();
            let path = match cli.store {
                Some(path) => path,
                None => clearings::plugin::data_directory(None)?.join("state.db"),
            };
            let mut store = Store::open(&path)?;
            if defaults
                && matches!(
                    action,
                    Action::LearnNow { .. } | Action::RecentConversations { .. }
                )
            {
                store.enable_default_history()?;
            }
            if matches!(action, Action::LearningStatus) {
                println!("{}", store.learning_status()?);
                return Ok(());
            }
            if matches!(action, Action::UndoLearning) {
                println!("{}", store.undo_learning(None, None)?);
                return Ok(());
            }
            if matches!(
                action,
                Action::PauseLearning
                    | Action::ResumeLearning
                    | Action::LearningSchedule { .. }
                    | Action::ExcludeLearning { .. }
                    | Action::IncludeLearning { .. }
            ) {
                let prefs = store.preferences()?;
                let patch = match action {
                    Action::PauseLearning => serde_json::json!({"learning_enabled":false}),
                    Action::ResumeLearning => serde_json::json!({"learning_enabled":true}),
                    Action::LearningSchedule { frequency } => {
                        serde_json::json!({"interval_seconds":frequency.seconds()})
                    }
                    Action::ExcludeLearning { project } => {
                        let mut values = prefs.excluded_projects.clone();
                        values.push(project);
                        serde_json::json!({"excluded_projects":values})
                    }
                    Action::IncludeLearning { project } => {
                        let root = store.resolve_project_name(&project)?;
                        serde_json::json!({"excluded_projects":prefs.excluded_projects.iter().filter(|p|**p!=root).collect::<Vec<_>>()})
                    }
                    _ => unreachable!(),
                };
                println!("{}", store.update_preferences(prefs.revision, patch)?);
                return Ok(());
            }
            if let Action::LearningJob { id } = action {
                let value = store.execute_learning(id, &executable)?;
                println!("{value}");
                anyhow::ensure!(
                    !clearings::api::failed(&value),
                    "learning failed; inspect learning-status"
                );
                return Ok(());
            }
            if let Action::LearnNow { all } = action {
                let project = match &cli.project {
                    Some(id) => id.clone(),
                    None if defaults => store.open_cli_project(&std::env::current_dir()?)?,
                    None => anyhow::bail!("select --project"),
                };
                let value = store.learn_now(
                    &project,
                    if all {
                        clearings::conversations::Scope::All
                    } else {
                        clearings::conversations::Scope::Project
                    },
                    &executable,
                )?;
                println!("{value}");
                anyhow::ensure!(
                    !clearings::api::failed(&value),
                    "learning failed; inspect learning-status"
                );
                return Ok(());
            }
            if let Action::ProjectConfigure {
                root,
                name,
                settings,
                expected_revision,
            } = action
            {
                let result =
                    store.configure_project(&root, &name, read(settings)?, expected_revision)?;
                println!("{}", serde_json::to_string_pretty(&result)?);
                return Ok(());
            }
            if let Action::Background { once } = action {
                let project = cli
                    .project
                    .ok_or_else(|| anyhow::anyhow!("select --project"))?;
                if once {
                    let result = store.background_tick(&project, &executable)?;
                    println!("{}", result);
                    anyhow::ensure!(
                        result["status"] != "failed",
                        "background job failed; see JSON result"
                    );
                    return Ok(());
                }
                return clearings::background::serve(store, project, executable);
            }
            let selected_id = match cli.project {
                Some(id) => Some(id),
                None if defaults => Some(store.open_cli_project(&std::env::current_dir()?)?),
                None => None,
            };
            let selected = selected_id
                .as_deref()
                .map(|id| store.project(id))
                .transpose()?;
            let mut api = Api {
                store,
                policy: selected
                    .as_ref()
                    .map(|p| p.settings.grants.clone())
                    .unwrap_or_default(),
                project: selected_id,
                executable,
            };
            let operation = match action {
                Action::LearnNow { all } => Operation::LearnNow {
                    scope: if all {
                        clearings::conversations::Scope::All
                    } else {
                        clearings::conversations::Scope::Project
                    },
                },
                Action::LearningStatus => Operation::LearningStatus,
                Action::PrepareConversationTask {
                    file,
                    evidence_ids,
                    all,
                } => Operation::PrepareConversationTask {
                    task: read(file)?,
                    evidence_ids,
                    scope: if all {
                        clearings::conversations::Scope::All
                    } else {
                        clearings::conversations::Scope::Project
                    },
                },
                Action::Workbench => Operation::Workbench,
                Action::Library { after } => Operation::Library { after },
                Action::FindRoutines { query } => Operation::FindRoutines { query },
                Action::ShareRoutine {
                    name,
                    applicability,
                } => Operation::ShareRoutine {
                    name,
                    applicability,
                },
                Action::LibraryRoutine { id, part } => Operation::LibraryRoutine { id, part },
                Action::RunRoutine { id, input, purpose } => Operation::RunRoutine {
                    purpose,
                    id,
                    input: read(input)?,
                    expected_version: None,
                    expected_capabilities: None,
                },
                Action::PauseShared { id, resume } => Operation::PauseShared {
                    id,
                    paused: !resume,
                },
                Action::RecentConversations {
                    all,
                    client,
                    days,
                    cursor,
                } => Operation::RecentConversations {
                    scope: if all {
                        clearings::conversations::Scope::All
                    } else {
                        clearings::conversations::Scope::Project
                    },
                    client,
                    days,
                    cursor,
                },
                Action::ReadConversation { id, all, cursor } => Operation::ReadConversation {
                    id,
                    scope: if all {
                        clearings::conversations::Scope::All
                    } else {
                        clearings::conversations::Scope::Project
                    },
                    cursor,
                },
                Action::Mcp { policy } => {
                    let supplied: Policy = read(policy)?;
                    if selected.is_some() {
                        anyhow::ensure!(
                            serde_json::to_value(clearings::project::normalize_grants(
                                supplied.clone()
                            )?)? == serde_json::to_value(&api.policy)?,
                            "project grants are fixed; use the configured grants file"
                        );
                    } else {
                        api.policy = supplied;
                    }
                    return clearings::mcp::serve(api);
                }
                Action::Discover { after } => Operation::Discover { after },
                Action::Save {
                    name,
                    source,
                    expected_active,
                } => Operation::Save {
                    name,
                    source: String::from_utf8(read_bytes(source, MAX_SOURCE_BYTES)?)?,
                    expected_active,
                },
                Action::Reuse { name, input } => Operation::Reuse {
                    name,
                    input: read(input)?,
                },
                Action::Observe => Operation::Observe,
                Action::Activity { before } => Operation::Activity { before },
                Action::Performance { name, after } => Operation::Performance { name, after },
                Action::BackgroundCancel => Operation::BackgroundCancel,
                Action::BackgroundJobs { before } => Operation::BackgroundJobs { before },
                Action::RecordObservation { session, file } => Operation::RecordObservation {
                    session,
                    observation: read(file)?,
                },
                Action::Routine { name } => Operation::Routine { name },
                Action::Manage {
                    name,
                    control,
                    expected_active,
                } => Operation::Manage {
                    name,
                    control,
                    expected_active,
                },
                Action::Digest { after } => Operation::Digest { after },
                Action::ModelUsage { before } => Operation::ModelUsage { before },
                Action::Prune { apply } => Operation::Prune { apply },
                Action::ProjectStatus => Operation::ProjectStatus,
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
                    let supplied: Policy = read(policy)?;
                    if selected.is_some() {
                        anyhow::ensure!(
                            serde_json::to_value(clearings::project::normalize_grants(
                                supplied.clone()
                            )?)? == serde_json::to_value(&api.policy)?,
                            "project grants are fixed; use the configured grants file"
                        );
                    } else {
                        api.policy = supplied;
                    }
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
