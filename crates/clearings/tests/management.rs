use clearings::{
    management::Control,
    project::Settings,
    store::{Store, Task},
};
use serde_json::json;
use std::path::Path;
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
        store.activity(&p.id, None).unwrap()["events"]
            .as_array()
            .unwrap()
            .len(),
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
        store.activity(&q.id, None).unwrap()["events"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        store.model_usage(&p.id, None).unwrap()["reserved_microusd"],
        0
    );
}
