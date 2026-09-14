use clearings::{
    management::Control,
    project::Settings,
    store::{Store, Task},
};
use serde_json::json;
use std::path::Path;

#[test]
fn retirement_without_runs_keeps_source_discoverable_after_restart() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("state.db");
    let mut store = Store::open(&db).unwrap();
    let p = store
        .configure_project(d.path(), "P", Settings::default(), None)
        .unwrap();
    let task: Task = serde_json::from_value(json!({"contract":{"abi":1,"name":"identity","description":"Identity","input_schema":{},"output_schema":{}},"cases":[{"name":"one","input":1,"expected":{"status":"completed","output":1}}]})).unwrap();
    store.prepare_named(&p.id, task, "user").unwrap();
    let source = "export default async x=>({status:'completed',output:x})";
    let saved = store
        .save_named(
            Path::new(env!("CARGO_BIN_EXE_clearings")),
            &p.id,
            "identity",
            source.into(),
            None,
        )
        .unwrap();
    store
        .manage(
            &p.id,
            "identity",
            Control::Retire,
            saved["version"].as_str(),
        )
        .unwrap();
    drop(store);
    let store = Store::open(&db).unwrap();
    assert_eq!(
        store.runs_page_for_project(Some(&p.id), None).unwrap()["runs"],
        json!([])
    );
    let digest = store.digest_page(&p.id, None).unwrap();
    let retired = digest["changes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|entry| entry["reason"] == "retired")
        .unwrap();
    assert_eq!(retired["version"], saved["version"]);
    let inspected = store.inspect(retired["version"].as_str().unwrap()).unwrap();
    assert_eq!(inspected["object"]["source"], source);
    assert_eq!(inspected["evaluation"]["accepted"], true);
}

#[test]
fn incompatible_improvement_keeps_error_explicit_and_does_not_block_retention() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("state.db");
    let mut store = Store::open(&db).unwrap();
    let settings: Settings = serde_json::from_value(json!({"automatic":true,"improve":true,"record_conversations":true,"daily_budget_microusd":1000,"model":{"url":"http://127.0.0.1:9/chat","model":"unused","max_output_tokens":100,"input_price":1,"output_price":1}})).unwrap();
    let p = store
        .configure_project(d.path(), "P", settings, None)
        .unwrap();
    let cases: Vec<_> = (1..=3).map(|x|json!({"name":x.to_string(),"input":x,"expected":{"status":"completed","output":x}})).collect();
    let task: Task = serde_json::from_value(json!({"contract":{"abi":1,"name":"identity","description":"Identity","input_schema":{},"output_schema":{}},"cases":cases})).unwrap();
    let task_id = store.prepare_named(&p.id, task, "user").unwrap();
    let exe = Path::new(env!("CARGO_BIN_EXE_clearings"));
    let saved = store
        .save_named(
            exe,
            &p.id,
            "identity",
            "export default async x=>({status:'completed',output:x})".into(),
            None,
        )
        .unwrap();
    let mut old = store.inspect(saved["version"].as_str().unwrap()).unwrap()["object"].clone();
    old["engine"] = json!("obsolete-runtime");
    let old_id = clearings::store::digest(&old).unwrap();
    let conn = rusqlite::Connection::open(&db).unwrap();
    conn.execute(
        "INSERT INTO objects(id,kind,body) VALUES(?1,'version',?2)",
        rusqlite::params![old_id, old.to_string()],
    )
    .unwrap();
    conn.execute(
        "UPDATE active SET version=?2 WHERE task=?1",
        rusqlite::params![task_id, old_id],
    )
    .unwrap();
    conn.execute("INSERT INTO runs(version,input_digest,report,created_at) VALUES(?1,'input','{}','2000-01-01')", [&old_id]).unwrap();
    let result = store.background_tick(&p.id, exe).unwrap();
    assert_eq!(result["status"], "failed", "{result}");
    assert!(
        result["report"]["error"]
            .as_str()
            .unwrap()
            .contains("component runtime dependency changed")
    );
    assert_eq!(
        conn.query_row("SELECT count(*) FROM runs", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        0
    );
    assert_eq!(
        conn.query_row("SELECT count(*) FROM model_requests", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        0
    );
}
#[test]
fn controls_stop_reuse_and_retirement_preserves_evidence() {
    let d = tempfile::tempdir().unwrap();
    let mut store = Store::open(&d.path().join("state.db")).unwrap();
    let p = store
        .configure_project(d.path(), "P", Settings::default(), None)
        .unwrap();
    let task:Task=serde_json::from_value(json!({"contract":{"abi":1,"name":"identity","description":"Identity","input_schema":{},"output_schema":{}},"cases":[{"name":"one","input":1,"expected":{"status":"completed","output":1}}]})).unwrap();
    let id = store.prepare_named(&p.id, task, "user").unwrap();
    let exe = Path::new(env!("CARGO_BIN_EXE_clearings"));
    let version = store
        .save_named(
            exe,
            &p.id,
            "identity",
            "export default async x=>({status:'completed',output:x})".into(),
            None,
        )
        .unwrap()["version"]
        .as_str()
        .unwrap()
        .to_owned();
    store
        .manage(&p.id, "identity", Control::Pause, None)
        .unwrap();
    assert!(store.run(exe, &id, json!(2), &Default::default()).is_err());
    store
        .manage(&p.id, "identity", Control::Resume, None)
        .unwrap();
    assert!(store.run(exe, &id, json!(2), &Default::default()).is_ok());
    store
        .manage(&p.id, "identity", Control::Exclude, None)
        .unwrap();
    assert!(store.run(exe, &id, json!(2), &Default::default()).is_err());
    assert!(
        store
            .manage(&p.id, "identity", Control::Retire, Some("stale"))
            .is_err()
    );
    store
        .manage(&p.id, "identity", Control::Retire, Some(&version))
        .unwrap();
    assert!(store.active(&id).unwrap().is_none());
    assert!(store.inspect(&version).is_ok());
    assert_eq!(
        store.inspect_named(&p.id, "identity").unwrap()["controls"]["excluded"],
        true
    );
}
#[test]
fn retention_is_scoped_and_preserves_budget_accounting() {
    let d = tempfile::tempdir().unwrap();
    let other = tempfile::tempdir().unwrap();
    let db = d.path().join("state.db");
    let mut store = Store::open(&db).unwrap();
    let p = store
        .configure_project(d.path(), "P", Settings::default(), None)
        .unwrap();
    let q = store
        .configure_project(other.path(), "Q", Settings::default(), None)
        .unwrap();
    let conn = rusqlite::Connection::open(&db).unwrap();
    for project in [&p.id, &q.id] {
        conn.execute(
            "INSERT INTO activity(project,id,body,created_at) VALUES(?1,'event','{}','2000-01-01')",
            [project],
        )
        .unwrap();
    }
    assert_eq!(store.prune(&p.id, false).unwrap()["activity_records"], 1);
    assert_eq!(
        conn.query_row(
            "SELECT count(*) FROM activity WHERE project=?1",
            [&p.id],
            |r| r.get::<_, u64>(0)
        )
        .unwrap(),
        1
    );
    store.prune(&p.id, true).unwrap();
    assert!(
        store.activity(&p.id, None).unwrap()["events"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        conn.query_row(
            "SELECT count(*) FROM activity WHERE project=?1",
            [&q.id],
            |r| r.get::<_, u64>(0)
        )
        .unwrap(),
        1
    );
    assert_eq!(
        store.model_usage(&p.id, None).unwrap()["reserved_microusd"],
        0
    );
}

#[test]
fn manual_rollback_checks_active_version_clears_previous_and_records_change() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("state.db");
    let mut s = Store::open(&db).unwrap();
    let p = s
        .configure_project(d.path(), "P", Settings::default(), None)
        .unwrap();
    let task:Task=serde_json::from_value(json!({"contract":{"abi":1,"name":"identity","description":"identity","input_schema":{},"output_schema":{}},"cases":[{"name":"one","input":1,"expected":{"status":"completed","output":1}}]})).unwrap();
    let id = s.prepare_named(&p.id, task, "user").unwrap();
    let exe = Path::new(env!("CARGO_BIN_EXE_clearings"));
    let previous = s
        .save_named(
            exe,
            &p.id,
            "identity",
            "export default async x=>({status:'completed',output:x})".into(),
            None,
        )
        .unwrap()["version"]
        .as_str()
        .unwrap()
        .to_owned();
    let current = s
        .save_named(
            exe,
            &p.id,
            "identity",
            "export default async x=>({status:'completed',output:x}) // revision".into(),
            Some(&previous),
        )
        .unwrap()["version"]
        .as_str()
        .unwrap()
        .to_owned();
    let conn = rusqlite::Connection::open(&db).unwrap();
    conn.execute(
        "UPDATE project_routines SET previous=?1 WHERE project=?2",
        rusqlite::params![previous, p.id],
    )
    .unwrap();
    assert!(
        s.manage(&p.id, "identity", Control::Rollback, Some(&previous))
            .is_err()
    );
    assert_eq!(s.active(&id).unwrap().as_deref(), Some(current.as_str()));
    assert_eq!(
        s.inspect_named(&p.id, "identity").unwrap()["controls"]["previous"],
        previous
    );
    s.manage(&p.id, "identity", Control::Rollback, Some(&current))
        .unwrap();
    assert_eq!(s.active(&id).unwrap().as_deref(), Some(previous.as_str()));
    assert!(s.inspect_named(&p.id, "identity").unwrap()["controls"]["previous"].is_null());
    assert!(
        s.manage(&p.id, "identity", Control::Rollback, Some(&previous))
            .is_err()
    );
    assert_eq!(
        s.digest_page(&p.id, None).unwrap()["changes"][0]["reason"],
        "manual_rollback"
    );
}
#[test]
fn digest_exposes_a_structured_job_report() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("state.db");
    let mut s = Store::open(&db).unwrap();
    let p = s
        .configure_project(d.path(), "P", Settings::default(), None)
        .unwrap();
    rusqlite::Connection::open(&db).unwrap().execute("INSERT INTO background_jobs(project,revision,started,status,report) VALUES(?1,1,0,'completed',?2)",rusqlite::params![p.id,json!({"learning":{"status":"created"}}).to_string()]).unwrap();
    assert_eq!(
        s.digest_page(&p.id, None).unwrap()["latest_background_job"]["report"]["learning"]["status"],
        "created"
    );
}
