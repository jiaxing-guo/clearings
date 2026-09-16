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
// Prior real-use summaries survive pruning of their detailed run records.
fn qualify_active_reuse(db: &Path, project: &str) {
    rusqlite::Connection::open(db).unwrap().execute("INSERT OR REPLACE INTO routine_usage(task,version,project,day,calls,completed,handoffs,failed,elapsed_ms,capability_calls,last_used,reuse_calls,test_calls) SELECT p.task,a.version,p.project,date('now'),3,3,0,0,0,0,datetime('now'),3,0 FROM project_routines p JOIN active a ON a.task=p.task WHERE p.project=?1",[project]).unwrap();
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
fn measured_replacement_reduces_reads_and_live_regression_restores_previous_version() {
    check_candidate_regression("throw Error('regression')");
}

#[test]
fn invalid_candidate_output_restores_previous_version() {
    check_candidate_regression("return {status:'completed',output:7}");
}

#[test]
fn candidate_call_budget_exhaustion_restores_previous_version() {
    check_candidate_regression("{for(let i=0;i<65;i++)await clearings.call('files.read',x)}");
}

#[test]
fn candidate_undeclared_call_restores_previous_version() {
    check_candidate_regression("await clearings.call('files.list',x)");
}

#[test]
fn candidate_malformed_call_restores_previous_version() {
    check_candidate_regression("await clearings.call('files.read',{root:7,path:x.path})");
}

fn check_candidate_regression(fresh_failure: &str) {
    use clearings::store::Task;
    let d = tempfile::tempdir().unwrap();
    let source = String::from(
        "export default async x=>{if(x.path==='authored-failure')return {status:'failed',code:'EXECUTION',message:'expected domain failure'};if(x.path==='fresh')throw Error('regression');return {status:'completed',output:(await clearings.call('files.read',x)).text}}",
    );
    let source = source.replace("throw Error('regression')", fresh_failure);
    let (url, handle) = model(&source);
    let mut settings = settings(url);
    settings.improve = true;
    settings.grants.roots.insert("data".into(), d.path().into());
    let mut store = Store::open(&d.path().join("state.db")).unwrap();
    let p = store
        .configure_project(d.path(), "P", settings, None)
        .unwrap();
    let cases:Vec<Value>=(1..=3).map(|i|{let input=json!({"root":"data","path":i.to_string()});let call=json!({"name":"files.read","input":input,"result":{"text":i.to_string()}});json!({"name":i.to_string(),"input":input,"expected":{"status":"completed","output":i.to_string()},"calls":vec![call;32]})}).collect();
    let task:Task=serde_json::from_value(json!({"evaluation":"read_only_behavior","contract":{"abi":1,"name":"read","description":"Read the requested file","input_schema":{"type":"object"},"output_schema":{"type":"string"},"capabilities":["files.read"]},"cases":cases})).unwrap();
    let task_id = store.prepare_named(&p.id, task, "user").unwrap();
    // Make the fixture benefit large enough to distinguish it from worker startup noise.
    let baseline=store.save_named(exe(),&p.id,"read","export default async x=>{for(let i=0;i<31;i++)await clearings.call('files.read',x);return {status:'completed',output:(await clearings.call('files.read',x)).text}}".into(),None).unwrap()["version"].as_str().unwrap().to_owned();
    qualify_active_reuse(&d.path().join("state.db"), &p.id);
    let result = store.background_tick(&p.id, exe()).unwrap();
    handle.join().unwrap();
    let improvement = &result["report"]["improvement"];
    if improvement["status"] == "no_benefit" {
        // Runtime noise can legitimately reject a replacement. Check that gate,
        // then seed an accepted replacement to exercise recovery deterministically.
        assert_eq!(improvement["report"]["accepted"], false);
        assert_eq!(
            store.active(&task_id).unwrap().as_deref(),
            Some(baseline.as_str())
        );
        let saved = store
            .save_named(exe(), &p.id, "read", source, Some(&baseline))
            .unwrap();
        assert_eq!(saved["accepted"], true);
        let db = rusqlite::Connection::open(d.path().join("state.db")).unwrap();
        db.execute(
            "UPDATE project_routines SET previous=?1 WHERE task=?2",
            rusqlite::params![baseline, task_id],
        )
        .unwrap();
        db.execute("INSERT INTO component_changes(project,task,version,previous,reason) VALUES(?1,?2,?3,?4,'improved')",rusqlite::params![p.id,task_id,saved["version"].as_str(),baseline]).unwrap();
    } else {
        assert_eq!(improvement["status"], "improved", "{result}");
        assert_eq!(improvement["report"]["accepted"], true);
    }
    assert_ne!(
        store.active(&task_id).unwrap().as_deref(),
        Some(baseline.as_str())
    );
    let optimized = store.active(&task_id).unwrap();
    let authored = store
        .reuse_named(
            exe(),
            &p.id,
            "read",
            json!({"root":"data","path":"authored-failure"}),
            &p.settings.grants,
        )
        .unwrap();
    assert_eq!(authored["run"]["outcome"]["code"], "EXECUTION");
    assert!(authored["recovery"].is_null());
    assert_eq!(store.active(&task_id).unwrap(), optimized);
    let unavailable = store
        .reuse_named(
            exe(),
            &p.id,
            "read",
            json!({"root":"data","path":"missing-file"}),
            &p.settings.grants,
        )
        .unwrap();
    assert_eq!(unavailable["run"]["outcome"]["status"], "failed");
    assert!(unavailable["recovery"].is_null());
    assert_eq!(store.active(&task_id).unwrap(), optimized);
    let unavailable_worker = store
        .reuse_named(
            Path::new("/missing-clearings-worker"),
            &p.id,
            "read",
            json!({"root":"data","path":"missing-file"}),
            &p.settings.grants,
        )
        .unwrap();
    assert_eq!(unavailable_worker["run"]["outcome"]["status"], "failed");
    assert!(unavailable_worker["recovery"].is_null());
    assert_eq!(store.active(&task_id).unwrap(), optimized);
    std::fs::write(d.path().join("fresh"), "current data").unwrap();
    let failure = store
        .reuse_named(
            exe(),
            &p.id,
            "read",
            json!({"root":"data","path":"fresh"}),
            &p.settings.grants,
        )
        .unwrap();
    assert_eq!(failure["run"]["outcome"]["status"], "failed");
    assert_eq!(failure["recovery"]["restored_version"], baseline);
    assert_eq!(
        store
            .reuse_named(
                exe(),
                &p.id,
                "read",
                json!({"root":"data","path":"fresh"}),
                &p.settings.grants
            )
            .unwrap()["run"]["outcome"]["output"],
        "current data"
    );
}

#[test]
fn interrupted_measurement_resumes_past_excluded_routines_without_a_model_request() {
    use clearings::store::Task;
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("state.db");
    let mut store = Store::open(&db).unwrap();
    let mut options = settings("http://127.0.0.1:9/chat".into());
    options.improve = true;
    options.exclusions = vec!["a-hidden".into()];
    let p = store
        .configure_project(d.path(), "P", options, None)
        .unwrap();
    let cases:Vec<_>=(1..=3).map(|x|json!({"name":x.to_string(),"input":x,"expected":{"status":"completed","output":x*2}})).collect();
    let mut baseline = String::new();
    let mut task_id = String::new();
    let mut invalid_trial = None;
    for name in [
        "a-hidden",
        "b-too-few",
        "c-too-many",
        "y-invalid",
        "z-target",
    ] {
        let task_cases = match name {
            "b-too-few" => cases[..1].to_vec(),
            "c-too-many" => (1..=9).map(|x|json!({"name":x.to_string(),"input":x,"expected":{"status":"completed","output":x*2}})).collect(),
            _ => cases.clone(),
        };
        let task:Task=serde_json::from_value(json!({"contract":{"abi":1,"name":name,"description":"double","input_schema":{"type":"integer"},"output_schema":{"type":"integer"}},"cases":task_cases})).unwrap();
        let id = store.prepare_named(&p.id, task, "user").unwrap();
        let saved = store
            .save_named(
                exe(),
                &p.id,
                name,
                "export default async x=>({status:'completed',output:x*2})".into(),
                None,
            )
            .unwrap();
        if name == "y-invalid" {
            let candidate = store
                .submit(
                    exe(),
                    &id,
                    "export default async x=>({status:'completed',output:0})".into(),
                )
                .unwrap();
            invalid_trial = Some((saved["version"].as_str().unwrap().to_owned(), candidate));
        }
        if name == "z-target" {
            task_id = id;
            baseline = saved["version"].as_str().unwrap().into();
        }
    }
    let candidate = store
        .submit(
            exe(),
            &task_id,
            "export default async x=>({status:'completed',output:2*x})".into(),
        )
        .unwrap();
    let conn = rusqlite::Connection::open(&db).unwrap();
    let (invalid_baseline, invalid_candidate) = invalid_trial.unwrap();
    conn.execute("INSERT INTO improvement_trials(project,baseline,candidate,status) VALUES(?1,?2,?3,'measuring')",rusqlite::params![p.id,invalid_baseline,invalid_candidate]).unwrap();
    conn.execute("INSERT INTO improvement_trials(project,baseline,candidate,status) VALUES(?1,?2,?3,'measuring')",rusqlite::params![p.id,baseline,candidate]).unwrap();
    conn.execute(
        "INSERT INTO background_jobs(project,revision,started,status) VALUES(?1,1,0,'running')",
        [&p.id],
    )
    .unwrap();
    qualify_active_reuse(&db, &p.id);
    let rejected = store.background_tick(&p.id, exe()).unwrap();
    assert_eq!(
        rejected["report"]["improvement"]["status"], "failed",
        "{rejected}"
    );
    let status: String = conn
        .query_row(
            "SELECT status FROM improvement_trials WHERE baseline=?1",
            [&invalid_baseline],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(status, "failed");
    conn.execute("UPDATE schedule SET next_due=0", []).unwrap();
    let result = store.background_tick(&p.id, exe()).unwrap();
    assert_eq!(result["status"], "completed", "{result}");
    assert!(
        matches!(
            result["report"]["improvement"]["status"].as_str(),
            Some("improved" | "no_benefit")
        ),
        "{result}"
    );
    assert_eq!(
        conn.query_row("SELECT count(*) FROM model_requests", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        0
    );
    assert_eq!(
        conn.query_row("SELECT count(*) FROM improvement_trials", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        2
    );
}

#[test]
fn cancellation_during_model_request_preserves_usage_without_promoting() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("state.db");
    let cancel_db = db.clone();
    let (url, handle) = model_with(
        "export default async x=>({status:'completed',output:x*2})",
        move || {
            let conn = rusqlite::Connection::open(cancel_db).unwrap();
            conn.execute(
                "UPDATE background_jobs SET cancelled=1 WHERE status='running'",
                [],
            )
            .unwrap();
        },
    );
    let mut store = Store::open(&db).unwrap();
    let p = store
        .configure_project(d.path(), "P", settings(url), None)
        .unwrap();
    for i in 1..=3 {
        store
            .record_observation(&p.id, &format!("session-{i}"), observation(i))
            .unwrap();
    }
    let result = store.background_tick(&p.id, exe()).unwrap();
    handle.join().unwrap();
    assert_eq!(result["status"], "failed");
    assert!(store.named_task(&p.id, "double", false).is_err());
    let usage = store.model_usage(&p.id, None).unwrap();
    assert!(usage["reserved_microusd"].as_u64().unwrap() > 0);
    assert_eq!(
        usage["requests"][0]["usage"]["provenance"],
        "provider_reported"
    );
}

#[test]
fn stale_ungranted_group_does_not_block_learning_or_retention() {
    use clearings::store::digest;
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("state.db");
    let mut s = Store::open(&db).unwrap();
    let (url, handle) = model("export default async x=>({status:'completed',output:x*2})");
    let p = s
        .configure_project(d.path(), "P", settings(url), None)
        .unwrap();
    let valid_fingerprint = digest(&observation(1).contract).unwrap();
    let mut bad:Observation=serde_json::from_value(json!({"contract":{"abi":1,"name":"stale","description":"stale read","input_schema":{},"output_schema":{},"capabilities":["files.read"]},"case":{"name":"one","input":1,"expected":{"status":"completed","output":1},"calls":[{"name":"files.read","input":{"root":"removed","path":"file"},"result":{"text":"x"}}]}})).unwrap();
    for i in 0..10000 {
        bad.contract.name = format!("stale-{i}");
        if digest(&bad.contract).unwrap() < valid_fingerprint {
            break;
        }
    }
    assert!(digest(&bad.contract).unwrap() < valid_fingerprint);
    for i in 1..=3 {
        bad.case.input = json!(i);
        bad.case.expected =
            serde_json::from_value(json!({"status":"completed","output":i})).unwrap();
        s.record_observation(&p.id, &format!("bad{i}"), bad.clone())
            .unwrap();
        s.record_observation(&p.id, &format!("good{i}"), observation(i))
            .unwrap();
    }
    let conn = rusqlite::Connection::open(&db).unwrap();
    conn.execute(
        "INSERT INTO activity(project,id,body,created_at) VALUES(?1,'expired','{}','2000-01-01')",
        [&p.id],
    )
    .unwrap();
    let result = s.background_tick(&p.id, exe()).unwrap();
    assert_eq!(result["status"], "completed", "{result}");
    assert_eq!(result["report"]["learning"]["status"], "created");
    assert_eq!(result["report"]["learning"]["blocked_groups"], 1);
    handle.join().unwrap();
    assert_eq!(
        conn.query_row(
            "SELECT count(*) FROM activity WHERE id='expired'",
            [],
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        0
    );
    assert_eq!(
        conn.query_row(
            "SELECT attempts FROM learning_groups WHERE status='blocked'",
            [],
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        0
    );
}
#[test]
fn acceptance_provenance_matches_the_distinct_cases_actually_frozen() {
    let d = tempfile::tempdir().unwrap();
    let mut s = Store::open(&d.path().join("state.db")).unwrap();
    let (url, handle) = model("export default async x=>({status:'completed',output:x*2})");
    let p = s
        .configure_project(d.path(), "P", settings(url), None)
        .unwrap();
    for i in [2, 3] {
        s.record_observation(&p.id, &format!("older{i}"), observation(i))
            .unwrap();
    }
    for i in 0..6 {
        s.record_observation(&p.id, &format!("duplicate{i}"), observation(1))
            .unwrap();
    }
    let result = s.background_tick(&p.id, exe()).unwrap();
    assert_eq!(
        result["report"]["learning"]["status"], "created",
        "{result}"
    );
    handle.join().unwrap();
    let task = s.inspect_named(&p.id, "double").unwrap()["task"]["object"].clone();
    let cases = task["cases"].as_array().unwrap();
    let records = task["evidence"]["source_records"].as_array().unwrap();
    assert_eq!(cases.len(), 3);
    assert_eq!(records.len(), cases.len());
    for (case, record) in cases.iter().zip(records) {
        assert_eq!(record["case"], case["name"]);
        assert_eq!(
            case["name"],
            format!("observed-{}", &record["id"].as_str().unwrap()[..12])
        );
    }
}

#[test]
fn expired_improvement_trials_are_terminal_and_do_not_request_again() {
    use clearings::store::Task;
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("state.db");
    let expire_db = db.clone();
    let (url, handle) = model_with(
        "export default async x=>({status:'completed',output:x+x})",
        move || {
            rusqlite::Connection::open(expire_db)
                .unwrap()
                .execute(
                    "UPDATE background_jobs SET started=0 WHERE status='running'",
                    [],
                )
                .unwrap();
        },
    );
    let mut options = settings(url);
    options.improve = true;
    let mut store = Store::open(&db).unwrap();
    let p = store
        .configure_project(d.path(), "P", options, None)
        .unwrap();
    let task: Task = serde_json::from_value(json!({"evaluation":"read_only_behavior","contract":observation(1).contract,"cases":(1..=3).map(|i| { let mut case=observation(i).case; case.name=i.to_string(); case }).collect::<Vec<_>>()})).unwrap();
    store.prepare_named(&p.id, task, "user").unwrap();
    store
        .save_named(
            exe(),
            &p.id,
            "double",
            "export default async x=>({status:'completed',output:x*2})".into(),
            None,
        )
        .unwrap();
    qualify_active_reuse(&d.path().join("state.db"), &p.id);
    let result = store.background_tick(&p.id, exe()).unwrap();
    handle.join().unwrap();
    assert_eq!(result["status"], "failed");
    assert!(
        result["report"]["error"]
            .as_str()
            .unwrap()
            .contains("time budget")
    );
    let conn = rusqlite::Connection::open(&db).unwrap();
    assert_eq!(
        conn.query_row("SELECT status FROM improvement_trials", [], |r| r
            .get::<_, String>(0))
            .unwrap(),
        "failed"
    );
    conn.execute("UPDATE schedule SET next_due=0", []).unwrap();
    assert_eq!(
        store.background_tick(&p.id, exe()).unwrap()["report"]["improvement"]["status"],
        "no_candidate"
    );
    assert_eq!(
        conn.query_row("SELECT count(*) FROM model_requests", [], |r| r
            .get::<_, u64>(0))
            .unwrap(),
        1
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

#[test]
fn oversized_improvement_requests_do_not_starve_later_routines() {
    use clearings::store::Task;
    let d = tempfile::tempdir().unwrap();
    let (url, handle) = model("export default async x=>({status:'completed',output:x*2})");
    let db = d.path().join("state.db");
    let mut store = Store::open(&db).unwrap();
    let mut options = settings(url);
    options.improve = true;
    let p = store
        .configure_project(d.path(), "P", options, None)
        .unwrap();
    let cases: Vec<Value> = (1..=3).map(|i| json!({"name":i.to_string(),"input":format!("{}{i}","x".repeat(300 * 1024)),"expected":{"status":"completed","output":300 * 1024 + 1}})).collect();
    let task: Task = serde_json::from_value(json!({"contract":{"abi":1,"name":"a-large","description":"Length","input_schema":{"type":"string"},"output_schema":{"type":"integer"}},"cases":cases})).unwrap();
    store.prepare_named(&p.id, task, "user").unwrap();
    store
        .save_named(
            exe(),
            &p.id,
            "a-large",
            "export default async x=>({status:'completed',output:x.length})".into(),
            None,
        )
        .unwrap();
    let cases: Vec<_> = (1..=3)
        .map(|i| {
            let mut case = observation(i).case;
            case.name = i.to_string();
            case
        })
        .collect();
    let mut contract = observation(1).contract;
    contract.name = "z-small".into();
    let task: Task = serde_json::from_value(json!({"contract":contract,"cases":cases})).unwrap();
    store.prepare_named(&p.id, task, "user").unwrap();
    store
        .save_named(
            exe(),
            &p.id,
            "z-small",
            "export default async x=>({status:'completed',output:x+x})".into(),
            None,
        )
        .unwrap();
    qualify_active_reuse(&d.path().join("state.db"), &p.id);
    let result = store.background_tick(&p.id, exe()).unwrap();
    assert_eq!(
        result["report"]["improvement"]["status"], "failed",
        "{result}"
    );
    assert!(
        result["report"]["improvement"]["report"]["error"]
            .as_str()
            .unwrap()
            .contains("request exceeds byte limit")
    );
    let conn = rusqlite::Connection::open(&db).unwrap();
    assert_eq!(
        conn.query_row("SELECT count(*) FROM model_requests", [], |r| r
            .get::<_, u64>(0))
            .unwrap(),
        0
    );
    conn.execute("UPDATE schedule SET next_due=0", []).unwrap();
    store.background_tick(&p.id, exe()).unwrap();
    let prompt = handle.join().unwrap();
    assert!(prompt.to_string().contains("z-small"));
    assert_eq!(
        conn.query_row("SELECT count(*) FROM model_requests", [], |r| r
            .get::<_, u64>(0))
            .unwrap(),
        1
    );
}

#[test]
fn configured_improvement_requires_real_reuse_not_tests_or_unclassified_calls() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("state.db");
    let mut store = Store::open(&db).unwrap();
    let (url, handle) = model("export default async x=>({status:'completed',output:x+x})");
    let mut options = settings(url);
    options.improve = true;
    let p = store
        .configure_project(d.path(), "P", options, None)
        .unwrap();
    let task:clearings::store::Task=serde_json::from_value(json!({"contract":observation(1).contract,"cases":(1..=3).map(|i| { let mut c=observation(i).case;c.name=i.to_string();c }).collect::<Vec<_>>()})).unwrap();
    let id = store.prepare_named(&p.id, task, "user").unwrap();
    let v = store
        .save_named(
            exe(),
            &p.id,
            "double",
            "export default async x=>({status:'completed',output:x*2})".into(),
            None,
        )
        .unwrap()["version"]
        .as_str()
        .unwrap()
        .to_owned();
    let conn = rusqlite::Connection::open(&db).unwrap();
    for (calls, test_calls) in [(0, 0), (3, 3), (3, 0)] {
        conn.execute("INSERT OR REPLACE INTO routine_usage(task,version,project,day,calls,completed,handoffs,failed,elapsed_ms,capability_calls,last_used,reuse_calls,test_calls) VALUES(?1,?2,?3,date('now'),?5,?5,0,0,0,0,datetime('now'),0,?4)",rusqlite::params![id,v,p.id,test_calls,calls]).unwrap();
        conn.execute("UPDATE schedule SET next_due=0 WHERE project=?1", [&p.id])
            .unwrap();
        let result = store.background_tick(&p.id, exe()).unwrap();
        assert_eq!(
            result["report"]["improvement"]["status"], "no_candidate",
            "{result}"
        );
        assert_eq!(
            conn.query_row("SELECT count(*) FROM model_requests", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
    qualify_active_reuse(&db, &p.id);
    conn.execute("UPDATE schedule SET next_due=0 WHERE project=?1", [&p.id])
        .unwrap();
    let result = store.background_tick(&p.id, exe()).unwrap();
    assert!(
        matches!(
            result["report"]["improvement"]["status"].as_str(),
            Some("improved" | "no_benefit")
        ),
        "{result}"
    );
    handle.join().unwrap();
    assert_eq!(
        conn.query_row("SELECT count(*) FROM model_requests", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        1
    );
}
