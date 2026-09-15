use clearings::{
    project::Settings,
    store::{Store, Task},
};
use serde_json::json;
use std::{fs, path::Path};
fn exe() -> &'static Path {
    Path::new(env!("CARGO_BIN_EXE_clearings"))
}
#[test]
fn shared_definition_reads_receiving_project_and_keeps_history_and_counts_separate() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    let db = root.join("state.db");
    let mut store = Store::open(&db).unwrap();
    let a = root.join("a");
    let b = root.join("b");
    fs::create_dir(&a).unwrap();
    fs::create_dir(&b).unwrap();
    fs::write(a.join("value.txt"), "original").unwrap();
    fs::write(b.join("value.txt"), "current").unwrap();
    let mut settings = Settings::default();
    settings.grants.roots.insert("repo".into(), a.clone());
    let pa = store.configure_project(&a, "A", settings, None).unwrap();
    let mut settings = Settings::default();
    settings.grants.roots.insert("repo".into(), b.clone());
    let pb = store.configure_project(&b, "B", settings, None).unwrap();
    let task:Task=serde_json::from_value(json!({"contract":{"abi":1,"name":"read-value","description":"Read the value file","input_schema":{"type":"string"},"output_schema":{"type":"string"},"capabilities":["files.read"]},"cases":[{"name":"sample","input":"value.txt","expected":{"status":"completed","output":"original"},"calls":[{"name":"files.read","input":{"root":"repo","path":"value.txt"},"result":{"text":"original"}}]}]})).unwrap();
    let id = store.prepare_named(&pa.id, task, "user").unwrap();
    store.save_named(exe(),&pa.id,"read-value","export default async path=>({status:'completed',output:(await clearings.call('files.read',{root:'repo',path})).text})".into(),None).unwrap();
    assert!(
        store
            .run_routine(exe(), &pb.id, &id, json!("value.txt"), &pb.settings.grants)
            .is_err()
    );
    store
        .share_routine(
            &pa.id,
            "read-value",
            "Read a text file under the receiving project's repo root",
        )
        .unwrap();
    assert_eq!(
        store.find_routines(&pb.id, "read value file").unwrap()["routines"][0]["routine"],
        id
    );
    assert_eq!(
        store
            .run_routine(exe(), &pb.id, &id, json!("value.txt"), &pb.settings.grants)
            .unwrap()["run"]["outcome"]["output"],
        "current"
    );
    assert!(
        store
            .run_routine(exe(), &pb.id, &id, json!("value.txt"), &pa.settings.grants)
            .is_err()
    );
    assert_eq!(
        store.runs_page_for_project(Some(&pa.id), None).unwrap()["runs"],
        json!([])
    );
    assert_eq!(
        store.runs_page_for_project(Some(&pb.id), None).unwrap()["runs"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    let first = store.active(&id).unwrap().unwrap();
    let source = "export default async path=>({status:'completed',output:(await clearings.call('files.read',{root:'repo',path})).text}) /* second version */";
    let second = store.submit(exe(), &id, source.into()).unwrap();
    store.evaluate(exe(), &second).unwrap();
    store.activate(&second, Some(&first)).unwrap();
    let writer = rusqlite::Connection::open(&db).unwrap();
    writer
        .execute(
            "UPDATE project_routines SET previous=?1 WHERE task=?2",
            rusqlite::params![first, id],
        )
        .unwrap();
    let denied = store
        .run_routine(
            exe(),
            &pb.id,
            &id,
            json!("../a/value.txt"),
            &pb.settings.grants,
        )
        .unwrap();
    assert_eq!(denied["run"]["outcome"]["status"], "failed");
    assert_eq!(store.active(&id).unwrap().as_deref(), Some(second.as_str()));
    assert_eq!(denied["recovery"], serde_json::Value::Null);
    let writer = rusqlite::Connection::open(&db).unwrap();
    writer
        .execute("UPDATE runs SET created_at='2000-01-01'", [])
        .unwrap();
    assert_eq!(store.prune(&pa.id, true).unwrap()["run_records"], 0);
    assert_eq!(store.prune(&pb.id, true).unwrap()["run_records"], 2);
    drop(store);
    let store = Store::open(&db).unwrap();
    assert_eq!(
        store.routine_usage(&pb.id, &id).unwrap()["windows"]["30"]["calls"],
        2
    );
    store.pause_shared(&pb.id, &id, true).unwrap();
    assert!(
        store
            .run_routine(exe(), &pb.id, &id, json!("value.txt"), &pb.settings.grants)
            .is_err()
    );
    assert_eq!(
        store.find_routines(&pb.id, "read value").unwrap()["routines"],
        json!([])
    );
    store.pause_shared(&pb.id, &id, false).unwrap();
    let context = json!({"hook_event_name":"UserPromptSubmit","cwd":b,"session_id":"test-session","prompt":"read the value file"});
    assert!(
        store.suggest(&context).unwrap()["hookSpecificOutput"]["additionalContext"]
            .as_str()
            .unwrap()
            .contains(&id)
    );
    assert!(store.suggest(&context).unwrap().is_null());
    assert!(store.suggest(&json!({"hook_event_name":"UserPromptSubmit","cwd":b,"session_id":"other","prompt":"explain photosynthesis"})).unwrap().is_null());
}
