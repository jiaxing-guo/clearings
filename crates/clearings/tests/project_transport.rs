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
            assert_eq!(result["result"]["isError"], true);
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
