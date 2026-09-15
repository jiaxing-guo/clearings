use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader, Write},
    path::Path,
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
};

struct Client {
    child: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
    id: u64,
}
impl Client {
    fn new(data: &Path, cwd: &Path) -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_clearings"))
            .args(["plugin-mcp", "--all-projects", "--data-dir"])
            .arg(data)
            .current_dir(cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        let input = child.stdin.take().unwrap();
        let output = BufReader::new(child.stdout.take().unwrap());
        let mut client = Self {
            child,
            input,
            output,
            id: 0,
        };
        let reply = client.request("initialize", json!({"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1"}}));
        assert!(
            reply["result"]["instructions"]
                .as_str()
                .unwrap()
                .contains("clearings_open_project")
        );
        writeln!(
            client.input,
            "{}",
            json!({"jsonrpc":"2.0","method":"notifications/initialized"})
        )
        .unwrap();
        client
    }
    fn request(&mut self, method: &str, params: Value) -> Value {
        self.id += 1;
        writeln!(
            self.input,
            "{}",
            json!({"jsonrpc":"2.0","id":self.id,"method":method,"params":params})
        )
        .unwrap();
        self.input.flush().unwrap();
        let mut line = String::new();
        self.output.read_line(&mut line).unwrap();
        serde_json::from_str(&line).unwrap()
    }
    fn call(&mut self, name: &str, arguments: Value) -> Value {
        self.request(
            "tools/call",
            json!({"name":format!("clearings_{name}"),"arguments":arguments}),
        )["result"]
            .clone()
    }
    fn ok(&mut self, name: &str, arguments: Value) -> Value {
        let result = self.call(name, arguments);
        assert_eq!(result["isError"], false, "{result}");
        result["structuredContent"].clone()
    }
}
impl Drop for Client {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn register(data: &Path, cwd: &Path) {
    let mut hook = Command::new(env!("CARGO_BIN_EXE_clearings"))
        .args(["plugin-register", "--all-projects", "--data-dir"])
        .arg(data)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    writeln!(
        hook.stdin.take().unwrap(),
        "{}",
        json!({"hook_event_name":"SessionStart", "cwd":cwd})
    )
    .unwrap();
    let output = hook.wait_with_output().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(output.stdout.is_empty());
}

fn prepare_reader(client: &mut Client) -> String {
    client.ok("prepare_task", json!({"task":{
        "contract":{"abi":1,"name":"read-value","description":"Read a project file","input_schema":{"type":"string"},"output_schema":{"type":"string"},"capabilities":["files.read"]},
        "cases":[{"name":"read","input":"value.txt","expected":{"status":"completed","output":"one"},"calls":[{"name":"files.read","input":{"root":"repo","path":"value.txt"},"result":{"text":"one"}}]}]
    }}));
    client.ok("save", json!({"name":"read-value","source":"export default async function(input: string) { const result = await clearings.call('files.read', {root: 'repo', path: input}); return {status: 'completed', output: result.text}; }","expected_active":null}))["version"].as_str().unwrap().to_owned()
}

#[test]
fn plugin_connects_projects_without_setup_and_preserves_isolation_and_history() {
    let temp = tempfile::tempdir().unwrap();
    let repo = temp.path().join("project one");
    std::fs::create_dir_all(repo.join("src")).unwrap();
    std::fs::create_dir(repo.join(".git")).unwrap();
    std::fs::write(repo.join("value.txt"), "one").unwrap();
    let other = temp.path().join("project two");
    std::fs::create_dir_all(&other).unwrap();
    // A Git worktree uses a file marker; no git executable is needed for discovery.
    std::fs::write(other.join(".git"), "gitdir: /unused").unwrap();
    std::fs::write(other.join("value.txt"), "other").unwrap();
    let data = temp.path().join("private");
    register(&data, &repo);
    let mut first = Client::new(&data, temp.path());
    assert_eq!(first.call("discover", json!({}))["isError"], true);
    let project = first.ok("open_project", json!({"path":repo.join("src")}))["project"].clone();
    assert_eq!(
        project["root"],
        repo.canonicalize().unwrap().to_str().unwrap()
    );
    assert_eq!(
        project["settings"]["grants"]["roots"]["repo"],
        project["root"]
    );
    assert_eq!(project["settings"]["automatic"], false);
    assert_eq!(project["settings"]["model"], Value::Null);
    let version = prepare_reader(&mut first);
    assert_eq!(
        first.ok("reuse", json!({"name":"read-value","input":"value.txt"}))["run"]["outcome"]["output"],
        "one"
    );
    std::fs::write(repo.join("value.txt"), "fresh").unwrap();
    assert_eq!(
        first.ok("reuse", json!({"name":"read-value","input":"value.txt"}))["run"]["outcome"]["output"],
        "fresh"
    );
    assert_eq!(
        first.call(
            "reuse",
            json!({"name":"read-value","input":"../project two/value.txt"})
        )["isError"],
        true
    );
    register(&data, &other);
    let mut second = Client::new(&data, temp.path());
    let second_project = second.ok("open_project", json!({"path":other}))["project"].clone();
    assert_ne!(project["id"], second_project["id"]);
    assert_eq!(second.ok("discover", json!({}))["routines"], json!([]));
    assert_eq!(
        second.call("inspect", json!({"id":version}))["isError"],
        true
    );
    // A concurrent connection does not retarget the first client's selected project.
    assert_eq!(first.ok("project_status", json!({}))["id"], project["id"]);
    drop(first);
    let mut restarted = Client::new(&data, temp.path());
    let again = restarted.ok("open_project", json!({"path":repo}))["project"].clone();
    assert_eq!(again["id"], project["id"]);
    assert_eq!(again["revision"], 1);
    assert_eq!(
        restarted.ok("discover", json!({}))["routines"][0]["active"],
        version
    );
    assert!(
        restarted.ok("runs", json!({}))["runs"]
            .as_array()
            .unwrap()
            .len()
            >= 2
    );
    assert_eq!(
        restarted.call("open_project", json!({"path":temp.path().join("missing")}))["isError"],
        true
    );
    assert_eq!(restarted.call("discover", json!({}))["isError"], true);
}

#[test]
fn plugin_connection_does_not_overwrite_settings_or_accept_grant_arguments() {
    let temp = tempfile::tempdir().unwrap();
    let repo = temp.path().join("project");
    std::fs::create_dir(&repo).unwrap();
    let data = temp.path().join("private");
    register(&data, &repo);
    let mut client = Client::new(&data, temp.path());
    let project = client.ok("open_project", json!({"path":repo}))["project"].clone();
    let settings = temp.path().join("restricted.json");
    std::fs::write(&settings, r#"{"grants":{},"exclusions":["blocked"]}"#).unwrap();
    let changed = Command::new(env!("CARGO_BIN_EXE_clearings"))
        .arg("--store")
        .arg(data.join("state.db"))
        .args(["project-configure", "--root"])
        .arg(&repo)
        .args(["--name", "Renamed", "--settings"])
        .arg(settings)
        .args(["--expected-revision", "1"])
        .output()
        .unwrap();
    assert!(
        changed.status.success(),
        "{}",
        String::from_utf8_lossy(&changed.stderr)
    );
    assert_eq!(client.call("discover", json!({}))["isError"], true);
    let reopened = client.ok("open_project", json!({"path":repo}))["project"].clone();
    assert_eq!(reopened["id"], project["id"]);
    assert_eq!(reopened["revision"], 2);
    assert_eq!(reopened["name"], "Renamed");
    assert_eq!(reopened["settings"]["grants"]["roots"], json!({}));
    assert_eq!(reopened["settings"]["exclusions"], json!(["blocked"]));
    assert_eq!(
        client.call(
            "open_project",
            json!({"path":repo,"grants":{"roots":{"all":"/"}}})
        )["isError"],
        true
    );
    assert_eq!(
        client.call("open_project", json!({"path":"/"}))["isError"],
        true
    );
    assert_eq!(
        client.call("open_project", json!({"path":"relative"}))["isError"],
        true
    );
}

#[test]
fn plugin_entrypoint_requires_installation_authorization_and_private_storage() {
    let temp = tempfile::tempdir().unwrap();
    assert!(
        !Command::new(env!("CARGO_BIN_EXE_clearings"))
            .arg("plugin-mcp")
            .output()
            .unwrap()
            .status
            .success()
    );
    let path = clearings::plugin::data_directory(Some(temp.path().join("data"))).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::{MetadataExt, PermissionsExt, symlink};
        assert_eq!(std::fs::metadata(&path).unwrap().mode() & 0o777, 0o700);
        let alias = temp.path().join("alias");
        symlink(&path, &alias).unwrap();
        assert!(clearings::plugin::data_directory(Some(alias)).is_err());
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        assert!(clearings::plugin::data_directory(Some(path)).is_err());
    }
}

#[test]
fn model_paths_cannot_register_unopened_directories() {
    let temp = tempfile::tempdir().unwrap();
    let working = temp.path().join("working");
    let private = temp.path().join("private-other");
    std::fs::create_dir(&working).unwrap();
    std::fs::create_dir(&private).unwrap();
    std::fs::write(private.join("secret"), "unrelated").unwrap();
    let data = temp.path().join("state");
    register(&data, &working);
    let mut client = Client::new(&data, temp.path());
    client.ok("open_project", json!({"path":working}));
    assert_eq!(
        client.call("open_project", json!({"path":private}))["isError"],
        true
    );
    assert_eq!(client.call("discover", json!({}))["isError"], true);
    assert!(
        clearings::store::Store::open(&data.join("state.db"))
            .unwrap()
            .project(&clearings::store::digest(&private.canonicalize().unwrap()).unwrap())
            .is_err()
    );
    let invalid = json!({"hook_event_name":"PreToolUse", "cwd":private}).to_string();
    assert!(
        clearings::plugin::register_session(
            &mut clearings::store::Store::open(&data.join("state.db")).unwrap(),
            invalid.as_bytes()
        )
        .is_err()
    );
    // A real host session can subsequently open a folder without Git, with no
    // per-project CLI setup for the user, and the existing MCP connection sees it.
    register(&data, &private);
    client.ok("open_project", json!({"path":private}));
}
