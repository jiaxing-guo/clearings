use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader, Write},
    path::Path,
    process::{Command, Stdio},
};

fn cli(dir: &Path, args: &[&str]) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_clearings"))
        .current_dir(dir)
        .args(["--store", "state.db"])
        .args(args)
        .output()
        .unwrap()
}

#[test]
fn project_transport_normalizes_grants_and_rejects_scope_escape() {
    let d = tempfile::tempdir().unwrap();
    std::fs::create_dir(d.path().join("data")).unwrap();
    std::fs::write(
        d.path().join("settings.json"),
        r#"{"grants":{"roots":{"data":"data/../data"}}}"#,
    )
    .unwrap();
    std::fs::write(
        d.path().join("policy.json"),
        r#"{"roots":{"data":"data/../data"}}"#,
    )
    .unwrap();
    std::fs::write(d.path().join("wrong.json"), "{}").unwrap();
    std::fs::write(d.path().join("input.json"), "1").unwrap();
    let configured = cli(
        d.path(),
        &[
            "project-configure",
            "--root",
            ".",
            "--name",
            "Test",
            "--settings",
            "settings.json",
        ],
    );
    assert!(
        configured.status.success(),
        "{}",
        String::from_utf8_lossy(&configured.stderr)
    );
    let p: Value = serde_json::from_slice(&configured.stdout).unwrap();
    let id = p["id"].as_str().unwrap();
    assert!(
        cli(d.path(), &["--project", id, "project-status"])
            .status
            .success()
    );
    for action in [
        vec!["mcp", "--policy", "wrong.json"],
        vec![
            "run",
            "missing",
            "--input",
            "input.json",
            "--policy",
            "wrong.json",
        ],
    ] {
        let mut args = vec!["--project", id];
        args.extend(action);
        let rejected = cli(d.path(), &args);
        assert!(!rejected.status.success());
        assert!(String::from_utf8_lossy(&rejected.stderr).contains("project grants are fixed"));
    }
    let matching = cli(
        d.path(),
        &[
            "--project",
            id,
            "run",
            "missing",
            "--input",
            "input.json",
            "--policy",
            "policy.json",
        ],
    );
    assert!(!matching.status.success());
    assert!(!String::from_utf8_lossy(&matching.stderr).contains("project grants are fixed"));
    let mut child = Command::new(env!("CARGO_BIN_EXE_clearings"))
        .current_dir(d.path())
        .args([
            "--store",
            "state.db",
            "--project",
            id,
            "mcp",
            "--policy",
            "policy.json",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut input = child.stdin.take().unwrap();
    let mut output = BufReader::new(child.stdout.take().unwrap());
    writeln!(input, "{}", json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1"}}})).unwrap();
    let mut line = String::new();
    output.read_line(&mut line).unwrap();
    assert!(serde_json::from_str::<Value>(&line).unwrap()["result"].is_object());
    writeln!(
        input,
        "{}",
        json!({"jsonrpc":"2.0","method":"notifications/initialized"})
    )
    .unwrap();
    for (request_id, tool) in [(2, "clearings_project_status"), (3, "clearings_list")] {
        writeln!(input, "{}", json!({"jsonrpc":"2.0","id":request_id,"method":"tools/call","params":{"name":tool,"arguments":{}}})).unwrap();
        input.flush().unwrap();
        line.clear();
        output.read_line(&mut line).unwrap();
        let result: Value = serde_json::from_str(&line).unwrap();
        if request_id == 2 {
            assert_eq!(result["result"]["structuredContent"]["id"], id);
        } else {
            assert_eq!(result["result"]["structuredContent"]["routines"], json!([]));
        }
    }
    drop(input);
    assert!(child.wait().unwrap().success());
}

#[test]
fn invalid_http_authorization_is_rejected_before_persistence() {
    let d = tempfile::tempdir().unwrap();
    for binding in [
        json!({"url":"http://example.com","query_keys":[],"output_schema":{}}),
        json!({"url":"https://example.com","query_keys":[],"output_schema":{"type":"invalid"}}),
    ] {
        std::fs::write(
            d.path().join("settings.json"),
            json!({"grants":{"http":{"service":binding}}}).to_string(),
        )
        .unwrap();
        assert!(
            !cli(
                d.path(),
                &[
                    "project-configure",
                    "--root",
                    ".",
                    "--name",
                    "Invalid",
                    "--settings",
                    "settings.json"
                ]
            )
            .status
            .success()
        );
    }
    let conn = rusqlite::Connection::open(d.path().join("state.db")).unwrap();
    assert_eq!(
        conn.query_row("SELECT count(*) FROM projects", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        0
    );
}

#[test]
fn named_mcp_lifecycle_and_name_cursor_round_trip() {
    use clearings::{
        project::Settings,
        store::{Store, Task},
    };
    let d = tempfile::tempdir().unwrap();
    let mut store = Store::open(&d.path().join("state.db")).unwrap();
    let p = store
        .configure_project(d.path(), "P", Settings::default(), None)
        .unwrap();
    let other = tempfile::tempdir().unwrap();
    let foreign = store
        .configure_project(other.path(), "Other", Settings::default(), None)
        .unwrap();
    let example = clearings::mcp::tools();
    let task:Task=serde_json::from_value(json!({"contract":{"abi":1,"name":"Double","description":"Double integers","input_schema":{"type":"integer"},"output_schema":{"type":"integer"}},"cases":[{"name":"one","input":1,"expected":{"status":"completed","output":2}}]})).unwrap();
    let foreign_id = store
        .prepare_named(&foreign.id, task.clone(), "user")
        .unwrap();
    for i in 0..101 {
        let mut t = task.clone();
        t.contract.name = format!("routine-{i:03}");
        store.prepare_named(&p.id, t, "user").unwrap();
    }
    drop(store);
    std::fs::write(d.path().join("policy.json"), "{}").unwrap();
    let mut child = Command::new(env!("CARGO_BIN_EXE_clearings"))
        .current_dir(d.path())
        .args([
            "--store",
            "state.db",
            "--project",
            &p.id,
            "mcp",
            "--policy",
            "policy.json",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut input = child.stdin.take().unwrap();
    let mut output = BufReader::new(child.stdout.take().unwrap());
    writeln!(input,"{}",json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1"}}})).unwrap();
    let mut line = String::new();
    output.read_line(&mut line).unwrap();
    writeln!(
        input,
        "{}",
        json!({"jsonrpc":"2.0","method":"notifications/initialized"})
    )
    .unwrap();
    let mut id = 1;
    let mut call = |tool: &str, args: Value| -> Value {
        let schema = example["tools"]
            .as_array()
            .unwrap()
            .iter()
            .find(|t| t["name"] == tool)
            .unwrap()["inputSchema"]
            .clone();
        jsonschema::validator_for(&schema)
            .unwrap()
            .validate(&args)
            .unwrap();
        id += 1;
        writeln!(input,"{}",json!({"jsonrpc":"2.0","id":id,"method":"tools/call","params":{"name":tool,"arguments":args}})).unwrap();
        input.flush().unwrap();
        line.clear();
        output.read_line(&mut line).unwrap();
        serde_json::from_str::<Value>(&line).unwrap()["result"].clone()
    };
    let first = call("clearings_list", json!({}));
    assert_eq!(
        first["structuredContent"]["routines"]
            .as_array()
            .unwrap()
            .len(),
        100
    );
    let next = call(
        "clearings_list",
        json!({"after":first["structuredContent"]["next_after"]}),
    );
    assert_eq!(
        next["structuredContent"]["routines"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        call("clearings_inspect", json!({"id":foreign_id}))["isError"],
        true
    );
    let prepared = call("clearings_prepare_task", json!({"task":task}));
    let task_id = prepared["structuredContent"]["task"]
        .as_str()
        .unwrap()
        .to_owned();
    let saved = call(
        "clearings_save",
        json!({"name":"Double","source":"export default async x=>({status:'completed',output:x*2})","expected_active":null}),
    );
    assert_eq!(saved["structuredContent"]["accepted"], true);
    assert_eq!(
        call("clearings_reuse", json!({"name":"Double","input":7}))["structuredContent"]["run"]["outcome"]
            ["output"],
        14
    );
    assert!(call("clearings_discover", json!({}))["structuredContent"]["routines"].is_array());
    drop(input);
    assert!(child.wait().unwrap().success());
    assert!(!cli(d.path(), &["inspect", &task_id]).status.success());
    let unscoped = cli(d.path(), &["runs"]);
    assert_eq!(
        serde_json::from_slice::<Value>(&unscoped.stdout).unwrap()["runs"],
        json!([])
    );
    let mut forged = serde_json::to_value(task).unwrap();
    forged["project"] = json!(p.id);
    std::fs::write(d.path().join("forged.json"), forged.to_string()).unwrap();
    assert!(
        !cli(d.path(), &["prepare-task", "forged.json"])
            .status
            .success()
    );
}

#[test]
fn cancelled_background_once_prints_failure_and_exits_unsuccessfully() {
    let d = tempfile::tempdir().unwrap();
    let event =
        json!({"session_id":"host","cwd":d.path(),"usage":{"input_tokens":1,"output_tokens":1}});
    std::fs::write(d.path().join("trace.jsonl"), format!("{event}\n")).unwrap();
    let settings = json!({"automatic":true,"trace_sources":[{"adapter":"clearings","path":"trace.jsonl"}],"daily_budget_microusd":100,"model":{"url":"http://127.0.0.1:9/chat","model":"test","max_output_tokens":100,"input_price":1,"output_price":1}});
    std::fs::write(d.path().join("settings.json"), settings.to_string()).unwrap();
    let configured = cli(
        d.path(),
        &[
            "project-configure",
            "--root",
            ".",
            "--name",
            "P",
            "--settings",
            "settings.json",
        ],
    );
    assert!(
        configured.status.success(),
        "{}",
        String::from_utf8_lossy(&configured.stderr)
    );
    let p: Value = serde_json::from_slice(&configured.stdout).unwrap();
    let conn = rusqlite::Connection::open(d.path().join("state.db")).unwrap();
    conn.execute_batch("CREATE TRIGGER cancel_during_import AFTER INSERT ON activity BEGIN UPDATE background_jobs SET cancelled=1 WHERE project=NEW.project AND status='running'; END;").unwrap();
    let result = cli(
        d.path(),
        &[
            "--project",
            p["id"].as_str().unwrap(),
            "background",
            "--once",
        ],
    );
    assert!(!result.status.success());
    assert_eq!(
        serde_json::from_slice::<Value>(&result.stdout).unwrap()["status"],
        "failed"
    );
}
