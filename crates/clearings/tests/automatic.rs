use clearings::{
    activity::Observation,
    project::{ModelConnection, Settings},
    store::Store,
};
use serde_json::{Value, json};
use std::{
    io::{Read, Write},
    net::TcpListener,
    path::Path,
};
fn exe() -> &'static Path {
    Path::new(env!("CARGO_BIN_EXE_clearings"))
}
fn model(source: &str) -> (String, std::thread::JoinHandle<Value>) {
    model_with(source, || {})
}
fn model_with(
    source: &str,
    before_response: impl FnOnce() + Send + 'static,
) -> (String, std::thread::JoinHandle<Value>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}/chat", listener.local_addr().unwrap());
    let source = source.to_owned();
    let handle = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        stream
            .set_read_timeout(Some(std::time::Duration::from_secs(10)))
            .unwrap();
        let mut bytes = vec![];
        let mut buf = [0; 4096];
        let (offset, size) = loop {
            let n = stream.read(&mut buf).unwrap();
            assert!(n > 0);
            bytes.extend_from_slice(&buf[..n]);
            if let Some(p) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                let header = String::from_utf8_lossy(&bytes[..p]);
                let size = header
                    .lines()
                    .find_map(|l| {
                        l.to_lowercase()
                            .strip_prefix("content-length:")
                            .map(|s| s.trim().parse::<usize>().unwrap())
                    })
                    .unwrap();
                break (p + 4, size);
            }
        };
        while bytes.len() < offset + size {
            let n = stream.read(&mut buf).unwrap();
            assert!(n > 0);
            bytes.extend_from_slice(&buf[..n]);
        }
        let request: Value = serde_json::from_slice(&bytes[offset..offset + size]).unwrap();
        before_response();
        let response=json!({"choices":[{"message":{"content":json!({"source":source}).to_string()}}],"usage":{"prompt_tokens":100,"completion_tokens":20}}).to_string();
        write!(stream,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",response.len(),response).unwrap();
        request
    });
    (url, handle)
}
fn settings(url: String) -> Settings {
    Settings {
        automatic: true,
        record_conversations: true,
        daily_budget_microusd: 10000,
        model: Some(ModelConnection {
            url,
            model: "fixture-model".into(),
            bearer_token_env: None,
            max_output_tokens: 1000,
            input_price: 1,
            output_price: 1,
        }),
        ..Default::default()
    }
}
fn observation(x: i64) -> Observation {
    serde_json::from_value(json!({"contract":{"abi":1,"name":"double","description":"Double integers","input_schema":{"type":"integer"},"output_schema":{"type":"integer"}},"case":{"name":"observed","input":x,"expected":{"status":"completed","output":x*2}}})).unwrap()
}

#[test]
fn oversized_groups_are_reported_without_blocking_valid_work() {
    let d = tempfile::tempdir().unwrap();
    let (url, handle) = model("export default async x=>({status:'completed',output:x*2})");
    let mut store = Store::open(&d.path().join("state.db")).unwrap();
    let p = store
        .configure_project(d.path(), "P", settings(url), None)
        .unwrap();
    let mut large = observation(1);
    large.contract.output_schema = json!({"type":"string"});
    large.contract.limits.output_bytes = 1024 * 1024;
    let valid_fingerprint = clearings::store::digest(&observation(1).contract).unwrap();
    let name = (0..100)
        .find_map(|i| {
            large.contract.name = format!("large-{i}");
            (clearings::store::digest(&large.contract).unwrap() < valid_fingerprint)
                .then(|| large.contract.name.clone())
        })
        .unwrap();
    for i in 1..=3 {
        large.case.input = json!(i);
        large.case.expected = clearings::contract::Outcome::Completed {
            output: json!("x".repeat(600 * 1024)),
        };
        store
            .record_observation(&p.id, &format!("large-{i}"), large.clone())
            .unwrap();
        store
            .record_observation(&p.id, &format!("valid-{i}"), observation(i))
            .unwrap();
    }
    let result = store.background_tick(&p.id, exe()).unwrap();
    assert_eq!(
        result["report"]["learning"]["status"], "created",
        "{result}"
    );
    assert_eq!(result["report"]["learning"]["rejected_groups"], 1);
    assert_eq!(result["report"]["learning"]["skipped"][0]["name"], name);
    handle.join().unwrap();
}

#[test]
fn unaffordable_groups_yield_to_smaller_requests_without_spending_attempts() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("state.db");
    let (url, handle) = model("export default async x=>({status:'completed',output:x*2})");
    let mut options = settings(url);
    options.daily_budget_microusd = 50;
    options.model.as_mut().unwrap().input_price = 1000;
    let mut store = Store::open(&db).unwrap();
    let p = store
        .configure_project(d.path(), "P", options, None)
        .unwrap();
    let mut expensive = observation(1);
    expensive.contract.input_schema = json!({"type":"object"});
    let valid_fingerprint = clearings::store::digest(&observation(1).contract).unwrap();
    let fingerprint = (0..100)
        .find_map(|i| {
            expensive.contract.name = format!("expensive-{i}");
            let fingerprint = clearings::store::digest(&expensive.contract).unwrap();
            (fingerprint < valid_fingerprint).then_some(fingerprint)
        })
        .unwrap();
    for i in 1..=3 {
        expensive.case.input = json!({"number":i,"padding":"x".repeat(100_000)});
        expensive.case.expected = clearings::contract::Outcome::Completed {
            output: json!(i * 2),
        };
        store
            .record_observation(&p.id, &format!("expensive-{i}"), expensive.clone())
            .unwrap();
        store
            .record_observation(&p.id, &format!("valid-{i}"), observation(i))
            .unwrap();
    }
    let result = store.background_tick(&p.id, exe()).unwrap();
    assert_eq!(
        result["report"]["learning"]["status"], "created",
        "{result}"
    );
    assert_eq!(result["report"]["learning"]["deferred_groups"], 1);
    let request = handle.join().unwrap();
    let packet: Value =
        serde_json::from_str(request["messages"][1]["content"].as_str().unwrap()).unwrap();
    assert_eq!(packet["packet"]["contract"]["name"], "double");
    let conn = rusqlite::Connection::open(&db).unwrap();
    let group: (String, i64) = conn
        .query_row(
            "SELECT status,attempts FROM learning_groups WHERE fingerprint=?1",
            [fingerprint],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(group, ("deferred".into(), 0));
    assert_eq!(
        conn.query_row("SELECT count(*) FROM model_requests", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        1
    );
}

#[test]
fn observations_separated_by_other_work_form_one_eligible_group() {
    let d = tempfile::tempdir().unwrap();
    let (url, handle) = model("export default async x=>({status:'completed',output:x*2})");
    let mut store = Store::open(&d.path().join("state.db")).unwrap();
    let p = store
        .configure_project(d.path(), "P", settings(url), None)
        .unwrap();
    for i in 1..=3 {
        store
            .record_observation(&p.id, &format!("work-{i}"), observation(i))
            .unwrap();
        if i < 3 {
            for j in 0..500 {
                let mut noise = observation(0);
                noise.contract.name = "noise".into();
                store
                    .record_observation(&p.id, &format!("noise-{i}-{j}"), noise)
                    .unwrap();
            }
        }
    }
    for i in 0..500 {
        store
            .record_observation(&p.id, &format!("duplicate-{i}"), observation(1))
            .unwrap();
    }
    let result = store.background_tick(&p.id, exe()).unwrap();
    assert_eq!(
        result["report"]["learning"]["status"], "created",
        "{result}"
    );
    handle.join().unwrap();
}

#[test]
fn handoff_only_groups_stay_observations_and_do_not_block_valid_work() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("state.db");
    let (url, handle) = model("export default async x=>({status:'completed',output:x*2})");
    let mut store = Store::open(&db).unwrap();
    let p = store
        .configure_project(d.path(), "P", settings(url), None)
        .unwrap();
    for i in 1..=3 {
        let mut o = observation(i);
        o.contract.name = "handoffs".into();
        o.case.expected = clearings::contract::Outcome::NeedsAgent {
            reason: "unsupported".into(),
            context: json!({}),
        };
        store
            .record_observation(&p.id, &format!("handoff-{i}"), o)
            .unwrap();
    }
    assert_eq!(
        store.background_tick(&p.id, exe()).unwrap()["report"]["learning"]["status"],
        "no_eligible_observations"
    );
    let conn = rusqlite::Connection::open(&db).unwrap();
    assert_eq!(
        conn.query_row("SELECT count(*) FROM model_requests", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        0
    );
    conn.execute("UPDATE schedule SET next_due=0", []).unwrap();
    for i in 1..=3 {
        store
            .record_observation(&p.id, &format!("work-{i}"), observation(i))
            .unwrap();
    }
    assert_eq!(
        store.background_tick(&p.id, exe()).unwrap()["report"]["learning"]["status"],
        "created"
    );
    handle.join().unwrap();
}
#[test]
fn enabled_once_creates_and_reuses_in_a_fresh_session_with_held_out_evidence() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("state.db");
    let (url, handle) = model("export default async x=>({status:'completed',output:x*2})");
    let mut store = Store::open(&db).unwrap();
    let project = store
        .configure_project(d.path(), "P", settings(url), None)
        .unwrap();
    for i in 1..=3 {
        store
            .record_observation(&project.id, &format!("session-{i}"), observation(i))
            .unwrap();
    }
    let result = store.background_tick(&project.id, exe()).unwrap();
    assert_eq!(
        result["report"]["learning"]["status"], "created",
        "{result}"
    );
    let req = handle.join().unwrap();
    let packet: Value =
        serde_json::from_str(req["messages"][1]["content"].as_str().unwrap()).unwrap();
    assert_eq!(packet["packet"]["examples"].as_array().unwrap().len(), 2);
    drop(store);
    let store = Store::open(&db).unwrap();
    assert_eq!(
        store
            .reuse_named(exe(), &project.id, "double", json!(19), &Default::default())
            .unwrap()["run"]["outcome"]["output"],
        38
    );
    let conn = rusqlite::Connection::open(&db).unwrap();
    let usage: String = conn
        .query_row("SELECT usage FROM model_requests", [], |r| r.get(0))
        .unwrap();
    assert!(usage.contains("provider_reported"));
}
#[test]
fn candidate_failure_leaves_ordinary_work_available_and_does_not_activate() {
    let d = tempfile::tempdir().unwrap();
    let (url, handle) = model("export default async x=>({status:'completed',output:0})");
    let mut store = Store::open(&d.path().join("state.db")).unwrap();
    let p = store
        .configure_project(d.path(), "P", settings(url), None)
        .unwrap();
    for i in 1..=3 {
        store
            .record_observation(&p.id, &format!("s{i}"), observation(i))
            .unwrap();
    }
    let result = store.background_tick(&p.id, exe()).unwrap();
    assert_eq!(result["report"]["learning"]["status"], "failed");
    let candidate = &result["report"]["learning"]["result"]["candidate"];
    assert!(candidate["version"].as_str().is_some());
    assert!(
        candidate["source_preview"]
            .as_str()
            .unwrap()
            .contains("output:0")
    );
    assert_eq!(candidate["source_truncated"], false);
    assert_eq!(candidate["evaluation"]["accepted"], false);
    assert!(
        candidate["evaluation"]["cases"]
            .as_array()
            .unwrap()
            .iter()
            .any(|case| case["accepted"] == false && case["outcome_preview"].as_str().is_some())
    );
    handle.join().unwrap();
    assert!(store.named_task(&p.id, "double", true).is_err());
}

#[test]
fn observation_scans_reach_older_groups_after_a_full_unlearnable_page() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("state.db");
    let mut s = Store::open(&db).unwrap();
    let (url, handle) = model("export default async x=>({status:'completed',output:x*2})");
    let p = s
        .configure_project(d.path(), "P", settings(url), None)
        .unwrap();
    for i in 1..=3 {
        s.record_observation(&p.id, &format!("old-{i}"), observation(i))
            .unwrap();
    }
    for i in 0..500 {
        let mut o = observation(0);
        o.contract.name = format!("noise-{i}");
        s.record_observation(&p.id, &format!("new-{i}"), o).unwrap();
    }
    assert_eq!(
        s.background_tick(&p.id, exe()).unwrap()["report"]["learning"]["status"],
        "no_eligible_observations"
    );
    rusqlite::Connection::open(&db)
        .unwrap()
        .execute("UPDATE schedule SET next_due=0", [])
        .unwrap();
    let result = s.background_tick(&p.id, exe()).unwrap();
    assert_eq!(
        result["report"]["learning"]["status"], "created",
        "{result}"
    );
    handle.join().unwrap();
}
#[test]
fn budget_refusal_preserves_attempts_until_an_authorized_request_is_reserved() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("state.db");
    let mut s = Store::open(&db).unwrap();
    let (url, handle) = model("export default async x=>({status:'completed',output:x*2})");
    let mut options = settings(url);
    options.daily_budget_microusd = 1;
    options.model.as_mut().unwrap().input_price = 1000;
    let p = s
        .configure_project(d.path(), "P", options.clone(), None)
        .unwrap();
    for i in 1..=3 {
        s.record_observation(&p.id, &format!("s{i}"), observation(i))
            .unwrap();
    }
    let conn = rusqlite::Connection::open(&db).unwrap();
    for _ in 0..2 {
        assert_eq!(
            s.background_tick(&p.id, exe()).unwrap()["report"]["learning"]["status"],
            "deferred"
        );
        conn.execute("UPDATE schedule SET next_due=0", []).unwrap();
    }
    assert_eq!(
        conn.query_row("SELECT attempts FROM learning_groups", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        0
    );
    assert_eq!(
        conn.query_row("SELECT count(*) FROM model_requests", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        0
    );
    let frozen: String = conn
        .query_row("SELECT task FROM learning_groups", [], |r| r.get(0))
        .unwrap();
    // New duplicate inputs displace the original cases from the bounded live sample.
    for i in 0..500 {
        s.record_observation(&p.id, &format!("duplicate-{i}"), observation(1))
            .unwrap();
    }
    options.daily_budget_microusd = 10000;
    s.configure_project(d.path(), "P", options, Some(1))
        .unwrap();
    let result = s.background_tick(&p.id, exe()).unwrap();
    assert_eq!(
        result["report"]["learning"]["status"], "created",
        "{result}"
    );
    assert_eq!(
        conn.query_row("SELECT task FROM learning_groups", [], |r| r
            .get::<_, String>(0))
            .unwrap(),
        frozen
    );
    handle.join().unwrap();
    assert_eq!(
        conn.query_row("SELECT attempts FROM learning_groups", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        1
    );
    assert_eq!(
        s.background_jobs(&p.id, None).unwrap()["jobs"][0]["requests"][0]["usage"]["provenance"],
        "provider_reported"
    );
}
#[test]
fn cancellation_propagates_to_job_and_preserves_request_usage() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("state.db");
    let cancel_db = db.clone();
    let (url, handle) = model_with(
        "export default async x=>({status:'completed',output:x*2})",
        move || {
            rusqlite::Connection::open(cancel_db)
                .unwrap()
                .execute(
                    "UPDATE background_jobs SET cancelled=1 WHERE status='running'",
                    [],
                )
                .unwrap();
        },
    );
    let mut s = Store::open(&db).unwrap();
    let p = s
        .configure_project(d.path(), "P", settings(url), None)
        .unwrap();
    for i in 1..=3 {
        s.record_observation(&p.id, &format!("s{i}"), observation(i))
            .unwrap();
    }
    let result = s.background_tick(&p.id, exe()).unwrap();
    assert_eq!(result["status"], "failed", "{result}");
    handle.join().unwrap();
    assert!(s.named_task(&p.id, "double", false).is_err());
    let jobs = s.background_jobs(&p.id, None).unwrap();
    assert_eq!(
        jobs["jobs"][0]["requests"][0]["usage"]["provenance"],
        "provider_reported"
    );
    assert!(
        jobs["jobs"][0]["requests"][0]["reserved_microusd"]
            .as_u64()
            .unwrap()
            > 0
    );
}

#[test]
fn invalid_proposals_keep_source_diagnostics_without_a_version() {
    let d = tempfile::tempdir().unwrap();
    let source = "export default async ( => {";
    let (url, handle) = model(source);
    let mut store = Store::open(&d.path().join("state.db")).unwrap();
    let p = store
        .configure_project(d.path(), "P", settings(url), None)
        .unwrap();
    for i in 1..=3 {
        store
            .record_observation(&p.id, &format!("s{i}"), observation(i))
            .unwrap();
    }
    let result = store.background_tick(&p.id, exe()).unwrap();
    handle.join().unwrap();
    assert_eq!(result["report"]["learning"]["status"], "failed");
    let candidate = &result["report"]["learning"]["result"]["candidate"];
    assert_eq!(candidate["source_preview"], source);
    assert_eq!(candidate["source_truncated"], false);
    assert!(candidate["version"].is_null());
    assert!(store.named_task(&p.id, "double", true).is_err());
}

#[test]
fn oversized_creation_requests_are_terminal_without_spending_attempts() {
    let d = tempfile::tempdir().unwrap();
    let (url, handle) = model("export default async x=>({status:'completed',output:x*2})");
    let db = d.path().join("state.db");
    let mut store = Store::open(&db).unwrap();
    let p = store
        .configure_project(d.path(), "P", settings(url), None)
        .unwrap();
    let mut large = observation(1);
    large.contract.name = "oversized".into();
    large.contract.output_schema = json!({"type":"string"});
    large.contract.limits.output_bytes = 1024 * 1024;
    for i in 1..=3 {
        large.case.input = json!(i);
        large.case.expected = clearings::contract::Outcome::Completed {
            output: json!("x".repeat(300 * 1024)),
        };
        store
            .record_observation(&p.id, &format!("large-{i}"), large.clone())
            .unwrap();
    }
    let result = store.background_tick(&p.id, exe()).unwrap();
    assert_eq!(
        result["report"]["learning"]["status"], "rejected",
        "{result}"
    );
    assert!(
        result["report"]["learning"]["result"]["error"]
            .as_str()
            .unwrap()
            .contains("request exceeds byte limit")
    );
    let conn = rusqlite::Connection::open(&db).unwrap();
    assert_eq!(
        conn.query_row("SELECT attempts FROM learning_groups", [], |r| r
            .get::<_, u64>(0))
            .unwrap(),
        0
    );
    assert_eq!(
        conn.query_row("SELECT count(*) FROM model_requests", [], |r| r
            .get::<_, u64>(0))
            .unwrap(),
        0
    );
    for i in 1..=3 {
        store
            .record_observation(&p.id, &format!("valid-{i}"), observation(i))
            .unwrap();
    }
    conn.execute("UPDATE schedule SET next_due=0", []).unwrap();
    let next = store.background_tick(&p.id, exe()).unwrap();
    handle.join().unwrap();
    assert_eq!(next["report"]["learning"]["status"], "created", "{next}");
    assert_eq!(
        conn.query_row("SELECT count(*) FROM model_requests", [], |r| r
            .get::<_, u64>(0))
            .unwrap(),
        1
    );
}
