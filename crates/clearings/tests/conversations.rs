use serde_json::{Value, json};
use std::{
    fs,
    io::Write,
    path::Path,
    process::{Command, Stdio},
};
fn run(data: &Path, home: &Path, args: &[&str]) -> Value {
    let result = Command::new(env!("CARGO_BIN_EXE_clearings"))
        .args(["--store", data.join("state.db").to_str().unwrap()])
        .args(args)
        .env("HOME", home)
        .env("CLAUDE_CONFIG_DIR", home.join(".claude"))
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    serde_json::from_slice(&result.stdout).unwrap()
}
#[test]
fn existing_claude_history_from_subdirectory_becomes_a_reusable_task() {
    let temp = tempfile::tempdir().unwrap();
    let base = temp.path().canonicalize().unwrap();
    let home = base.join("home");
    let project = base.join("repo");
    let data = base.join("state");
    fs::create_dir_all(project.join("src")).unwrap();
    fs::create_dir(project.join(".git")).unwrap();
    fs::create_dir_all(home.join(".claude/projects/example")).unwrap();
    let transcript = home.join(".claude/projects/example/older.jsonl");
    let task = json!({"contract":{"abi":1,"name":"double","description":"Double integer inputs","input_schema":{"type":"integer"},"output_schema":{"type":"integer"},"capabilities":[]},"cases":[{"name":"one","input":1,"expected":{"status":"completed","output":2}},{"name":"negative","input":-4,"expected":{"status":"completed","output":-8}}]});
    fs::write(&transcript,format!("{}\n",json!({"sessionId":"old-session","cwd":project.join("src"),"type":"user","uuid":"input","message":{"content":format!("Make this task reusable: {task}")}}))).unwrap();
    let mut hook = Command::new(env!("CARGO_BIN_EXE_clearings"))
        .args(["plugin-register", "--all-projects", "--data-dir"])
        .arg(&data)
        .env("HOME", &home)
        .stdin(Stdio::piped())
        .spawn()
        .unwrap();
    writeln!(
        hook.stdin.take().unwrap(),
        "{}",
        json!({"hook_event_name":"SessionStart","cwd":project,"session_id":"current"})
    )
    .unwrap();
    assert!(hook.wait().unwrap().success());
    let id = clearings::store::digest(&project).unwrap();
    let list = run(
        &data,
        &home,
        &[
            "--project",
            &id,
            "recent-conversations",
            "--client",
            "claude",
        ],
    );
    assert_eq!(list["conversations"].as_array().unwrap().len(), 1);
    assert_eq!(
        list["conversations"][0]["project"],
        project.to_str().unwrap()
    );
    let conversation = list["conversations"][0]["id"].as_str().unwrap();
    let history = run(
        &data,
        &home,
        &["--project", &id, "read-conversation", conversation],
    );
    assert!(
        history["items"][0]["content"]
            .as_str()
            .unwrap()
            .contains("Double integer inputs")
    );
    let path = base.join("task.json");
    fs::write(&path, task.to_string()).unwrap();
    run(
        &data,
        &home,
        &[
            "--project",
            &id,
            "prepare-conversation-task",
            path.to_str().unwrap(),
            "--evidence-ids",
            history["items"][0]["evidence_id"].as_str().unwrap(),
        ],
    );
    let source = base.join("routine.ts");
    fs::write(
        &source,
        "export default async x=>({status:'completed',output:x*2})",
    )
    .unwrap();
    let saved = run(
        &data,
        &home,
        &[
            "--project",
            &id,
            "save",
            "double",
            "--source",
            source.to_str().unwrap(),
        ],
    );
    assert_eq!(saved["accepted"], true);
    let input = base.join("input.json");
    fs::write(&input, "21").unwrap();
    assert_eq!(
        run(
            &data,
            &home,
            &[
                "--project",
                &id,
                "reuse",
                "double",
                "--input",
                input.to_str().unwrap()
            ]
        )["run"]["outcome"]["output"],
        42
    );
    let again = run(
        &data,
        &home,
        &[
            "--project",
            &id,
            "recent-conversations",
            "--client",
            "claude",
        ],
    );
    assert_eq!(again["conversations"][0]["id"], conversation);
}
