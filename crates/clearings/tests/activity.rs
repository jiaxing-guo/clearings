use clearings::{
    project::{Settings, TraceSource},
    store::Store,
};
use serde_json::json;
use std::io::Write;

#[test]
fn appended_headless_streams_require_fresh_project_metadata() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("headless.jsonl");
    std::fs::write(&path, "").unwrap();
    let append = |records: Vec<serde_json::Value>| {
        let mut file = std::fs::OpenOptions::new()
            .append(true)
            .open(&path)
            .unwrap();
        for record in records {
            writeln!(file, "{record}").unwrap();
        }
    };
    let meta = |session| json!({"type":"clearings_session","session_id":session,"cwd":d.path()});
    let start = |session| json!({"type":"thread.started","thread_id":session});
    let usage =
        |input| json!({"type":"turn.completed","usage":{"input_tokens":input,"output_tokens":1}});
    append(vec![
        meta("one"),
        start("one"),
        usage(10),
        start("two"),
        usage(20),
    ]);
    let mut store = Store::open(&d.path().join("state.db")).unwrap();
    let p = store
        .configure_project(
            d.path(),
            "P",
            Settings {
                trace_sources: vec![TraceSource {
                    adapter: "codex".into(),
                    path: path.clone(),
                }],
                ..Default::default()
            },
            None,
        )
        .unwrap();
    assert_eq!(store.observe(&p.id).unwrap()["imported"], 1);
    append(vec![meta("two"), usage(30)]);
    assert_eq!(store.observe(&p.id).unwrap()["imported"], 1);
    append(vec![start("two"), usage(40)]);
    assert_eq!(store.observe(&p.id).unwrap()["imported"], 0);
    append(vec![meta("three"), start("three"), usage(50)]);
    assert_eq!(store.observe(&p.id).unwrap()["imported"], 1);
    append(vec![start("five"), meta("wrong-thread"), usage(99)]);
    assert_eq!(store.observe(&p.id).unwrap()["imported"], 0);
    append(vec![meta("five"), usage(80)]);
    assert_eq!(store.observe(&p.id).unwrap()["imported"], 1);
    append(vec![
        json!({"type":"clearings_session","session_id":"four"}),
        usage(60),
    ]);
    assert_eq!(store.observe(&p.id).unwrap()["imported"], 0);
    assert_eq!(
        store.activity(&p.id, None).unwrap()["events"]
            .as_array()
            .unwrap()
            .len(),
        4
    );
}

#[test]
fn replacement_with_a_shared_header_replays_records_before_the_old_offset() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("session.jsonl");
    let header = json!({"type":"session_meta","payload":{"id":"same-session","cwd":d.path()},"padding":"x".repeat(5000)}).to_string();
    let event = |input| {
        json!({"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":input,"output_tokens":2}}}}).to_string()
    };
    let original = format!("{header}\n{}\n", event(10));
    std::fs::write(&path, &original).unwrap();
    let mut store = Store::open(&d.path().join("state.db")).unwrap();
    let p = store
        .configure_project(
            d.path(),
            "P",
            Settings {
                trace_sources: vec![TraceSource {
                    adapter: "codex".into(),
                    path: path.clone(),
                }],
                ..Default::default()
            },
            None,
        )
        .unwrap();
    assert_eq!(store.observe(&p.id).unwrap()["imported"], 1);
    let replacement = format!("{header}\n{}\n{}\n", event(20), event(30));
    assert!(replacement.len() > original.len());
    assert_eq!(&replacement[..4096], &original[..4096]);
    let replacement_path = d.path().join("replacement.jsonl");
    std::fs::write(&replacement_path, replacement).unwrap();
    std::fs::rename(replacement_path, &path).unwrap();
    assert_eq!(store.observe(&p.id).unwrap()["imported"], 2);
    assert_eq!(
        store.activity(&p.id, None).unwrap()["events"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    // Copy-truncate keeps the inode and header but rewrites the consumed boundary.
    let rewritten = format!("{header}\n{}\n{}\n{}\n", event(40), event(50), event(60));
    std::fs::write(&path, rewritten).unwrap();
    let result = store.observe(&p.id).unwrap();
    assert_eq!(result["errors"], json!([]));
    assert_eq!(result["imported"], 3);
}

#[test]
fn observations_retain_all_outcomes_without_weakening_task_acceptance() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("outcomes.jsonl");
    let contract = json!({"abi":1,"name":"identity","description":"identity","input_schema":{"type":"integer"},"output_schema":{"type":"integer"}});
    let outcomes = [
        json!({"status":"completed","output":1}),
        json!({"status":"needs_agent","reason":"unknown format","context":{}}),
        json!({"status":"not_applicable","reason":"unsupported"}),
        json!({"status":"failed","code":"SOURCE","message":"unavailable"}),
    ];
    let records: Vec<_> = outcomes.iter().enumerate().map(|(i, expected)| json!({"type":"clearings_workflow","session_id":"s","cwd":d.path(),"event_id":format!("event-{i}"),"observation":{"contract":contract,"case":{"name":format!("case-{i}"),"input":1,"expected":expected}}}).to_string()).collect();
    let repeated: Vec<String> = records
        .iter()
        .map(|record| {
            let mut value: serde_json::Value = serde_json::from_str(record).unwrap();
            value["uuid"] = json!("another-envelope");
            value.to_string()
        })
        .collect();
    std::fs::write(
        &path,
        records.join("\n") + "\n" + &repeated.join("\n") + "\n",
    )
    .unwrap();
    let mut store = Store::open(&d.path().join("state.db")).unwrap();
    let p = store
        .configure_project(
            d.path(),
            "P",
            Settings {
                trace_sources: vec![TraceSource {
                    adapter: "clearings".into(),
                    path,
                }],
                ..Default::default()
            },
            None,
        )
        .unwrap();
    let imported = store.observe(&p.id).unwrap();
    assert_eq!(imported["imported"], 4);
    assert_eq!(imported["errors"], json!([]));
    let events = store.activity(&p.id, None).unwrap();
    for expected in outcomes {
        assert!(
            events["events"]
                .as_array()
                .unwrap()
                .iter()
                .any(|e| e["event"]["observation"]["case"]["expected"] == expected)
        );
    }
    let invalid: clearings::activity::Observation = serde_json::from_value(json!({"contract":contract,"case":{"name":"bad input","input":"wrong","expected":{"status":"failed","code":"SOURCE","message":"unavailable"}}})).unwrap();
    assert!(invalid.validate().is_err());
    let task: clearings::store::Task = serde_json::from_value(json!({"contract":contract,"cases":[{"name":"only handoff","input":1,"expected":{"status":"needs_agent","reason":"unsupported","context":{}}}]})).unwrap();
    assert!(store.prepare_task(&task).is_err());
}
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
    let event = json!({"uuid":"envelope-1","sessionId":"s","cwd":d.path(),"message":{"id":"msg1","usage":{"input_tokens":3,"output_tokens":4,"cache_read_input_tokens":10}}});
    let mut repeated = event.clone();
    repeated["uuid"] = json!("envelope-2");
    std::fs::write(
        &path,
        format!(
            "{event}\n{repeated}\n{}\n",
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
fn adapter_changes_replay_and_retention_and_cursors_are_scoped() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("trace.jsonl");
    let event = json!({"sessionId":"s","cwd":d.path(),"message":{"id":"m","usage":{"input_tokens":3,"output_tokens":4}}});
    std::fs::write(&path, format!("{event}\n")).unwrap();
    let mut s = Store::open(&d.path().join("state.db")).unwrap();
    let mut settings = Settings {
        trace_sources: vec![TraceSource {
            adapter: "codex".into(),
            path: path.clone(),
        }],
        ..Default::default()
    };
    let p = s
        .configure_project(d.path(), "P", settings.clone(), None)
        .unwrap();
    assert_eq!(s.observe(&p.id).unwrap()["imported"], 0);
    settings.trace_sources[0].adapter = "claude".into();
    s.configure_project(d.path(), "P", settings, Some(1))
        .unwrap();
    assert_eq!(s.observe(&p.id).unwrap()["imported"], 1);
    assert!(s.activity(&p.id, Some(0)).is_err());
    assert!(s.activity(&p.id, Some(-1)).is_err());
    let conn = rusqlite::Connection::open(d.path().join("state.db")).unwrap();
    conn.execute(
        "UPDATE activity SET created_at='2000-01-01' WHERE project=?1",
        [&p.id],
    )
    .unwrap();
    assert_eq!(s.activity(&p.id, None).unwrap()["events"], json!([]));
    assert_eq!(
        conn.query_row(
            "SELECT count(*) FROM activity WHERE project=?1",
            [&p.id],
            |r| r.get::<_, u64>(0)
        )
        .unwrap(),
        0
    );
    let observation = json!({"contract":{"abi":1,"name":"identity","description":"identity","input_schema":{},"output_schema":{}},"case":{"name":"case","input":1,"expected":{"status":"completed","output":1}}});
    for field in ["session_id", "cwd", "event_id"] {
        let mut workflow = json!({"type":"clearings_workflow","session_id":"s","cwd":d.path(),"event_id":"w","observation":observation});
        workflow.as_object_mut().unwrap().remove(field);
        std::fs::write(&path, format!("{event}\n{workflow}\n")).unwrap();
        assert!(
            !s.observe(&p.id).unwrap()["errors"]
                .as_array()
                .unwrap()
                .is_empty()
        );
    }
}

#[test]
fn performance_preserves_each_outcome_and_pages_all_versions() {
    use clearings::store::Task;
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("state.db");
    let mut s = Store::open(&db).unwrap();
    let p = s
        .configure_project(d.path(), "P", Settings::default(), None)
        .unwrap();
    let t:Task=serde_json::from_value(json!({"contract":{"abi":1,"name":"identity","description":"identity","input_schema":{},"output_schema":{}},"cases":[{"name":"case","input":1,"expected":{"status":"completed","output":1}}]})).unwrap();
    let task = s.prepare_named(&p.id, t, "user").unwrap();
    let conn = rusqlite::Connection::open(&db).unwrap();
    for i in 0..101 {
        let version = format!("{i:064x}");
        conn.execute(
            "INSERT INTO objects(id,kind,body) VALUES(?1,'version',?2)",
            rusqlite::params![version, json!({"task":task}).to_string()],
        )
        .unwrap();
        for status in ["completed", "needs_agent", "not_applicable", "failed"] {
            conn.execute(
                "INSERT INTO runs(version,input_digest,report) VALUES(?1,'input',?2)",
                rusqlite::params![
                    version,
                    json!({"outcome":{"status":status},"elapsed_ms":1,"capability_calls":2})
                        .to_string()
                ],
            )
            .unwrap();
        }
    }
    let page = s.performance(&p.id, "identity").unwrap();
    assert_eq!(page["versions"].as_array().unwrap().len(), 100);
    for status in ["completed", "needs_agent", "not_applicable", "failed"] {
        assert_eq!(page["versions"][0][status], 1);
    }
    let args = json!({"name":"identity","after":page["next_after"]});
    let tools = clearings::mcp::tools();
    let schema = &tools["tools"]
        .as_array()
        .unwrap()
        .iter()
        .find(|t| t["name"] == "clearings_performance")
        .unwrap()["inputSchema"];
    jsonschema::validator_for(schema)
        .unwrap()
        .validate(&args)
        .unwrap();
    let next = s
        .performance_page(&p.id, "identity", page["next_after"].as_str())
        .unwrap();
    assert_eq!(next["versions"].as_array().unwrap().len(), 1);
    assert!(next["next_after"].is_null());
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

#[test]
fn tiny_records_are_bounded_and_resume_without_skipping_usage() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("tiny.jsonl");
    let meta = json!({"type":"session_meta","payload":{"id":"one","cwd":d.path()}});
    let usage = json!({"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":10,"output_tokens":2}}}});
    std::fs::write(&path, format!("{meta}\n{}{usage}\n", "{}\n".repeat(1000))).unwrap();
    let mut store = Store::open(&d.path().join("state.db")).unwrap();
    let p = store
        .configure_project(
            d.path(),
            "P",
            Settings {
                trace_sources: vec![TraceSource {
                    adapter: "codex".into(),
                    path,
                }],
                ..Default::default()
            },
            None,
        )
        .unwrap();
    let first = store.observe(&p.id).unwrap();
    assert_eq!(first["records_remaining"], 0);
    assert_eq!(first["imported"], 0);
    assert_eq!(first["errors"], json!([]));
    assert_eq!(store.observe(&p.id).unwrap()["imported"], 1);
    assert_eq!(store.observe(&p.id).unwrap()["imported"], 0);
}

#[test]
fn polling_rotates_busy_sources_and_files_across_restart() {
    let d = tempfile::tempdir().unwrap();
    let busy = d.path().join("busy");
    std::fs::create_dir(&busy).unwrap();
    std::fs::write(busy.join("a.jsonl"), "{}\n".repeat(3000)).unwrap();
    let meta = json!({"type":"session_meta","payload":{"id":"one","cwd":d.path()}});
    let usage = json!({"event_id":"b","usage":{"input_tokens":10,"output_tokens":2}});
    std::fs::write(busy.join("b.jsonl"), format!("{meta}\n{usage}\n")).unwrap();
    let later = d.path().join("later.jsonl");
    let usage = json!({"event_id":"c","usage":{"input_tokens":20,"output_tokens":4}});
    std::fs::write(&later, format!("{meta}\n{usage}\n")).unwrap();
    let db = d.path().join("state.db");
    let mut store = Store::open(&db).unwrap();
    let p = store
        .configure_project(
            d.path(),
            "P",
            Settings {
                trace_sources: vec![busy, later]
                    .into_iter()
                    .map(|path| TraceSource {
                        adapter: "codex".into(),
                        path,
                    })
                    .collect(),
                ..Default::default()
            },
            None,
        )
        .unwrap();
    assert_eq!(store.observe(&p.id).unwrap()["imported"], 0);
    drop(store);
    let mut store = Store::open(&db).unwrap();
    let next = store.observe(&p.id).unwrap();
    assert_eq!(next["imported"], 2, "{next}");
    assert_eq!(next["errors"], json!([]));
    assert_eq!(store.observe(&p.id).unwrap()["imported"], 0);
}
