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
    handle.join().unwrap();
    assert!(store.named_task(&p.id, "double", true).is_err());
}

#[test]
fn measured_replacement_reduces_reads_and_live_regression_restores_previous_version() {
    use clearings::store::Task;
    let d = tempfile::tempdir().unwrap();
    let (url, handle) = model(
        "export default async x=>{if(x.path==='fresh')throw Error('regression');return {status:'completed',output:(await clearings.call('files.read',x)).text}}",
    );
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
    let result = store.background_tick(&p.id, exe()).unwrap();
    handle.join().unwrap();
    assert_eq!(
        result["report"]["improvement"]["status"], "improved",
        "{result}"
    );
    assert_ne!(
        store.active(&task_id).unwrap().as_deref(),
        Some(baseline.as_str())
    );
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
