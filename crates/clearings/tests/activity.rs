use clearings::{
    project::{Settings, TraceSource},
    store::Store,
};
use serde_json::json;
use std::io::Write;
#[test]
fn incremental_import_filters_projects_and_handles_partial_lines_and_rotation() {
    let d = tempfile::tempdir().unwrap();
    let foreign = tempfile::tempdir().unwrap();
    let path = d.path().join("session.jsonl");
    let meta = json!({"type":"session_meta","payload":{"id":"one","cwd":d.path()}});
    let event = json!({"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":10,"output_tokens":2}}}});
    std::fs::write(&path, format!("{meta}\n{event}")).unwrap();
    let mut s = Store::open(&d.path().join("state.db")).unwrap();
    let settings = Settings {
        trace_sources: vec![TraceSource {
            adapter: "codex".into(),
            path: path.clone(),
        }],
        ..Default::default()
    };
    let p = s.configure_project(d.path(), "P", settings, None).unwrap();
    assert_eq!(s.observe(&p.id).unwrap()["imported"], 0);
    std::fs::OpenOptions::new()
        .append(true)
        .open(&path)
        .unwrap()
        .write_all(b"\n")
        .unwrap();
    assert_eq!(s.observe(&p.id).unwrap()["imported"], 1);
    assert_eq!(s.observe(&p.id).unwrap()["imported"], 0);
    let page = s.activity(&p.id, None).unwrap();
    assert_eq!(page["events"][0]["event"]["usage"]["cumulative"], true);
    assert_eq!(page["events"][0]["event"]["usage"]["input_tokens"], 10);
    std::fs::write(
        &path,
        format!(
            "{}\n{event}\n",
            json!({"type":"session_meta","payload":{"id":"other","cwd":foreign.path()}})
        ),
    )
    .unwrap();
    assert_eq!(s.observe(&p.id).unwrap()["imported"], 0);
    std::fs::write(&path, format!("{meta}\n{event}\n")).unwrap();
    assert_eq!(s.observe(&p.id).unwrap()["imported"], 0);
}
#[test]
fn claude_message_usage_is_deduplicated_and_missing_usage_is_not_zero() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("claude.jsonl");
    let event = json!({"sessionId":"s","cwd":d.path(),"message":{"id":"msg1","usage":{"input_tokens":3,"output_tokens":4,"cache_read_input_tokens":10}}});
    std::fs::write(
        &path,
        format!(
            "{event}\n{event}\n{}\n",
            json!({"sessionId":"s","cwd":d.path(),"message":{"id":"msg2"}})
        ),
    )
    .unwrap();
    let mut s = Store::open(&d.path().join("state.db")).unwrap();
    let p = s
        .configure_project(
            d.path(),
            "P",
            Settings {
                trace_sources: vec![TraceSource {
                    adapter: "claude".into(),
                    path,
                }],
                ..Default::default()
            },
            None,
        )
        .unwrap();
    assert_eq!(s.observe(&p.id).unwrap()["imported"], 1);
    assert_eq!(
        s.activity(&p.id, None).unwrap()["events"][0]["event"]["usage"]["cached_input_tokens"],
        10
    );
}

#[test]
fn documented_headless_usage_requires_project_metadata_and_keeps_estimated_cost_separate() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("headless.jsonl");
    let meta = json!({"type":"clearings_session","session_id":"s","cwd":d.path()});
    let result = json!({"type":"result","session_id":"s","usage":{"input_tokens":100,"output_tokens":10},"total_cost_usd":0.02});
    std::fs::write(&path, format!("{result}\n{meta}\n{result}\n")).unwrap();
    let mut s = Store::open(&d.path().join("state.db")).unwrap();
    let p = s
        .configure_project(
            d.path(),
            "P",
            Settings {
                trace_sources: vec![TraceSource {
                    adapter: "claude".into(),
                    path,
                }],
                ..Default::default()
            },
            None,
        )
        .unwrap();
    assert_eq!(s.observe(&p.id).unwrap()["imported"], 1);
    let usage = s.activity(&p.id, None).unwrap()["events"][0]["event"]["usage"].clone();
    assert_eq!(usage["cumulative"], true);
    assert_eq!(usage["reported_cost_kind"], "client_estimate");
}
