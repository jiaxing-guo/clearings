use clearings::{
    api::{Api, Operation},
    project::Settings,
    store::{RunPurpose, Store, Task},
};
use serde_json::{Value, json};
use std::path::Path;
fn exe() -> &'static Path {
    Path::new(env!("CARGO_BIN_EXE_clearings"))
}
fn fixture() -> (tempfile::TempDir, Api, String) {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    let mut store = Store::open(&root.join("state.db")).unwrap();
    let p = store
        .configure_project(&root, "Audit", Settings::default(), None)
        .unwrap();
    let task:Task=serde_json::from_value(json!({"contract":{"abi":1,"name":"double","description":"Double integers","input_schema":{"type":"integer"},"output_schema":{"type":"integer"},"capabilities":[]},"cases":[{"name":"two","input":2,"expected":{"status":"completed","output":4}}]})).unwrap();
    let id = store.prepare_named(&p.id, task, "user").unwrap();
    store
        .save_named(
            exe(),
            &p.id,
            "double",
            "export default async x=>({status:'completed',output:x*2})".into(),
            None,
        )
        .unwrap();
    (
        temp,
        Api {
            store,
            project: Some(p.id),
            policy: p.settings.grants,
            executable: exe().to_owned(),
        },
        id,
    )
}
fn call(api: &mut Api, id: &str, purpose: RunPurpose) -> Value {
    api.call(Operation::RunRoutine {
        id: id.into(),
        input: json!(7),
        expected_version: None,
        expected_capabilities: None,
        purpose,
    })
    .unwrap()
}
#[test]
fn catalog_separates_tests_reuse_and_frozen_acceptance() {
    let (_temp, mut api, id) = fixture();
    call(&mut api, &id, RunPurpose::Test);
    call(&mut api, &id, RunPurpose::Reuse);
    let page = api.call(Operation::Library { after: None }).unwrap();
    let r = &page["routines"][0];
    assert_eq!(r["name"], "double");
    assert_eq!(r["examples"][0]["input"], 2);
    assert_eq!(r["case_count"], 1);
    assert_eq!(r["usage"]["windows"]["30"]["test_calls"], 1);
    assert_eq!(r["usage"]["windows"]["30"]["reuse_calls"], 1);
    assert_eq!(r["usage"]["windows"]["30"]["unclassified_calls"], 0);
    assert_eq!(r["recent_calls"][0]["purpose"], "reuse");
    assert_eq!(r["recent_calls"][1]["purpose"], "test");
    api.store
        .manage(
            api.project.as_deref().unwrap(),
            "double",
            clearings::management::Control::Pause,
            None,
        )
        .unwrap();
    assert_eq!(
        api.call(Operation::Library { after: None }).unwrap()["routines"][0]["paused"],
        true
    );
    assert!(
        api.call(Operation::RunRoutine {
            id,
            input: json!(7),
            expected_version: None,
            expected_capabilities: None,
            purpose: RunPurpose::Test
        })
        .is_err()
    );
}
#[test]
fn old_counts_remain_unclassified_after_migration_and_pruning() {
    let (temp, mut api, id) = fixture();
    call(&mut api, &id, RunPurpose::Reuse);
    let project = api.project.clone().unwrap();
    drop(api);
    let db = temp.path().join("state.db");
    let conn = rusqlite::Connection::open(&db).unwrap();
    conn.execute_batch("ALTER TABLE runs DROP COLUMN purpose; ALTER TABLE routine_usage DROP COLUMN reuse_calls; ALTER TABLE routine_usage DROP COLUMN test_calls; PRAGMA user_version=12; UPDATE runs SET created_at='2000-01-01';").unwrap();
    drop(conn);
    let store = Store::open(&db).unwrap();
    let counts = store.routine_usage(&project, &id).unwrap();
    assert_eq!(counts["windows"]["30"]["unclassified_calls"], 1);
    assert_eq!(counts["windows"]["30"]["reuse_calls"], 0);
    assert_eq!(
        store.runs_page_for_project(Some(&project), None).unwrap()["runs"][0]["purpose"],
        "unknown"
    );
    store.prune(&project, true).unwrap();
    assert_eq!(
        store.routine_usage(&project, &id).unwrap()["windows"]["30"]["unclassified_calls"],
        1
    );
    drop(store);
    assert!(Store::open(&db).is_ok());
}
#[test]
fn catalog_only_exposes_owned_and_shared_definitions() {
    let (temp, mut api, id) = fixture();
    let other = temp.path().join("other");
    std::fs::create_dir(&other).unwrap();
    let p = api
        .store
        .configure_project(&other, "Other", Settings::default(), None)
        .unwrap();
    assert!(
        api.store.routine_library_page(&p.id, None).unwrap()["routines"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    api.store
        .share_routine(api.project.as_deref().unwrap(), "double", "Double numbers")
        .unwrap();
    let page = api.store.routine_library_page(&p.id, None).unwrap();
    assert_eq!(page["routines"][0]["id"], id);
    assert_eq!(page["routines"][0]["owned"], false);
    assert_eq!(page["routines"][0]["can_undo"], false);
    assert!(
        api.store
            .routine_library_page(&p.id, Some("invalid"))
            .is_err()
    );
}

#[test]
fn exploratory_failures_do_not_roll_back_the_active_version() {
    let (temp, mut api, id) = fixture();
    let old = api.store.active(&id).unwrap().unwrap();
    let source = "export default async x=>{if(x===7)throw new Error('unsupported');return {status:'completed',output:x*2}}";
    let new = api.store.submit(exe(), &id, source.into()).unwrap();
    assert_eq!(api.store.evaluate(exe(), &new).unwrap()["accepted"], true);
    api.store.activate(&new, Some(&old)).unwrap();
    let conn = rusqlite::Connection::open(temp.path().join("state.db")).unwrap();
    conn.execute(
        "UPDATE project_routines SET previous=?1 WHERE task=?2",
        rusqlite::params![old, id],
    )
    .unwrap();
    let result = call(&mut api, &id, RunPurpose::Test);
    assert_eq!(result["run"]["outcome"]["status"], "failed");
    assert!(result["recovery"].is_null());
    assert_eq!(api.store.active(&id).unwrap(), Some(new));
}
