use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader, Write},
    process::{Command, Stdio},
};
#[test]
fn stdio_teach_reuse_and_handoff_with_fixed_grants() {
    let temp = tempfile::tempdir().unwrap();
    let policy = temp.path().join("policy.json");
    std::fs::write(&policy, "{}").unwrap();
    let mut child = Command::new(env!("CARGO_BIN_EXE_clearings"))
        .arg("--store")
        .arg(temp.path().join("state.db"))
        .arg("mcp")
        .arg("--policy")
        .arg(policy)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut input = child.stdin.take().unwrap();
    let mut output = BufReader::new(child.stdout.take().unwrap());
    let mut id = 0;
    {
        let mut request = |method: &str, params: Value| -> Value {
            id += 1;
            writeln!(
                input,
                "{}",
                json!({"jsonrpc":"2.0","id":id,"method":method,"params":params})
            )
            .unwrap();
            input.flush().unwrap();
            let mut line = String::new();
            output.read_line(&mut line).unwrap();
            let v: Value = serde_json::from_str(&line).unwrap();
            assert_eq!(v["id"], id);
            v
        };
        assert_eq!(request("tools/list", json!({}))["error"]["code"], -32002);
        assert_eq!(
            request(
                "initialize",
                json!({"protocolVersion":"2099-01-01","capabilities":{},"clientInfo":{"name":"test","version":"1"}})
            )["result"]["protocolVersion"],
            "2025-06-18"
        );
    }
    writeln!(
        input,
        "{}",
        json!({"jsonrpc":"2.0","method":"notifications/initialized"})
    )
    .unwrap();
    {
        let mut request = |name: &str, args: Value| -> Value {
            id += 1;
            writeln!(input,"{}",json!({"jsonrpc":"2.0","id":id,"method":"tools/call","params":{"name":name,"arguments":args}})).unwrap();
            input.flush().unwrap();
            let mut line = String::new();
            output.read_line(&mut line).unwrap();
            let v: Value = serde_json::from_str(&line).unwrap();
            assert_eq!(v["id"], id);
            v
        };
        let sdk = request("clearings_sdk", json!({}));
        let task = request(
            "clearings_prepare_task",
            json!({"task":sdk["result"]["structuredContent"]["task_example"]}),
        )["result"]["structuredContent"]["task"]
            .clone();
        assert!(task.is_string());
        let source = "export default async function(n:number){if(n>100)return {status:'needs_agent',reason:'large input needs review',context:{n}};return {status:'completed',output:n*2};}";
        let version=request("clearings_submit",json!({"task":task,"source":source}))["result"]["structuredContent"]["version"].clone();
        assert_eq!(
            request(
                "clearings_activate",
                json!({"version":version,"expected_active":null})
            )["result"]["isError"],
            true
        );
        assert_eq!(
            request("clearings_evaluate", json!({"version":version}))["result"]["structuredContent"]
                ["accepted"],
            true
        );
        assert_eq!(
            request(
                "clearings_activate",
                json!({"version":version,"expected_active":null})
            )["result"]["isError"],
            false
        );
        assert_eq!(
            request("clearings_run", json!({"task":task,"input":17}))["result"]["structuredContent"]
                ["run"]["outcome"]["output"],
            34
        );
        assert_eq!(
            request("clearings_run", json!({"task":task,"input":101}))["result"]["structuredContent"]
                ["run"]["outcome"]["status"],
            "needs_agent"
        );
        assert_eq!(
            request(
                "clearings_run",
                json!({"task":task,"input":3,"policy":{"roots":{"all":"/"}}})
            )["result"]["isError"],
            true
        );
        assert_eq!(
            request("clearings_list", json!({"action":"runs"}))["result"]["isError"],
            true
        );
        let page = request("clearings_runs", json!({}));
        assert_eq!(
            page["result"]["structuredContent"]["runs"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        assert!(page["result"]["structuredContent"]["next_before"].is_null());
        let page = request("clearings_runs", json!({"before":2}));
        assert_eq!(page["result"]["structuredContent"]["runs"][0]["id"], 1);
        assert_eq!(
            request("clearings_runs", json!({"before":0}))["result"]["isError"],
            true
        );
    }
    drop(input);
    assert!(child.wait().unwrap().success());
}
#[test]
fn failed_cli_runs_exit_unsuccessfully() {
    let temp = tempfile::tempdir().unwrap();
    let task = temp.path().join("task.json");
    std::fs::write(&task, "{}").unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_clearings"))
        .arg("--store")
        .arg(temp.path().join("state.db"))
        .arg("prepare-task")
        .arg(task)
        .output()
        .unwrap();
    assert!(!output.status.success());
}

#[test]
fn run_source_preserves_top_level_run_and_failed_exit_status() {
    let temp = tempfile::tempdir().unwrap();
    std::fs::write(
        temp.path().join("contract.json"),
        json!({"abi":1,"name":"shape","description":"shape","input_schema":{},"output_schema":{}})
            .to_string(),
    )
    .unwrap();
    std::fs::write(temp.path().join("input.json"), "null").unwrap();
    std::fs::write(temp.path().join("policy.json"), "{}").unwrap();
    for status in ["completed", "failed"] {
        let outcome = if status == "completed" {
            json!({"status":status,"output":42})
        } else {
            json!({"status":status,"code":"EXPECTED","message":"test failure"})
        };
        std::fs::write(
            temp.path().join("routine.ts"),
            format!("export default async function(){{return {outcome};}}"),
        )
        .unwrap();
        let output = Command::new(env!("CARGO_BIN_EXE_clearings"))
            .current_dir(temp.path())
            .args([
                "run-source",
                "--source",
                "routine.ts",
                "--contract",
                "contract.json",
                "--input",
                "input.json",
                "--policy",
                "policy.json",
            ])
            .output()
            .unwrap();
        assert_eq!(output.status.success(), status == "completed");
        let result: Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(result["outcome"]["status"], status);
        assert!(result.get("run").is_none());
        assert!(result["elapsed_ms"].is_number());
        assert_eq!(result["capability_calls"], 0);
    }
}
