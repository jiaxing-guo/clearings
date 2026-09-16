use clearings::{
    contract::Policy,
    store::{Store, Task},
};
use serde_json::json;
use std::path::Path;
#[test]
fn user_defined_workflows_share_one_runtime_and_revisions_preserve_history() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let exe = Path::new(env!("CARGO_BIN_EXE_clearings"));
    let temp = tempfile::tempdir().unwrap();
    let mut store = Store::open(&temp.path().join("state.db")).unwrap();
    for name in [
        "repository-context",
        "group-logs",
        "normalize-contacts",
        "normalize-contact-file",
    ] {
        let folder = root.join("examples").join(name);
        let task: Task =
            serde_json::from_slice(&std::fs::read(folder.join("task.json")).unwrap()).unwrap();
        let id = store.prepare_task(&task).unwrap();
        let source = std::fs::read_to_string(folder.join("routine.ts")).unwrap();
        let version = store.submit(exe, &id, source.clone()).unwrap();
        assert_eq!(store.evaluate(exe, &version).unwrap()["accepted"], true);
        store.activate(&version, None).unwrap();
        let mut policy: Policy =
            serde_json::from_slice(&std::fs::read(folder.join("policy.json")).unwrap()).unwrap();
        for path in policy.roots.values_mut() {
            *path = root.join(&*path);
        }
        let input =
            serde_json::from_slice(&std::fs::read(folder.join("input.json")).unwrap()).unwrap();
        let run = store.run(exe, &id, input, &policy).unwrap();
        assert_eq!(run["run"]["outcome"]["status"], "completed");
        let revision = store
            .submit(exe, &id, format!("{source}\n// Reviewed revision.\n"))
            .unwrap();
        assert_ne!(revision, version);
        assert_eq!(
            store.active(&id).unwrap().as_deref(),
            Some(version.as_str())
        );
        assert!(store.activate(&revision, Some(&version)).is_err());
        assert_eq!(store.evaluate(exe, &revision).unwrap()["accepted"], true);
        store.activate(&revision, Some(&version)).unwrap();
        assert_eq!(store.inspect(&version).unwrap()["object"]["source"], source);
        store.activate(&version, Some(&revision)).unwrap();
        if name == "group-logs" {
            let path = temp.path().join("oversized.jsonl");
            let record = format!("{}\n", json!({"level":"info","message":"x".repeat(80)}));
            std::fs::write(&path, record.repeat(5001)).unwrap();
            policy.roots.insert("logs".into(), temp.path().into());
            let result = store
                .run(
                    exe,
                    &id,
                    json!({"root":"logs","path":"oversized.jsonl"}),
                    &policy,
                )
                .unwrap();
            assert_eq!(result["run"]["outcome"]["status"], "needs_agent");
            assert_eq!(result["run"]["capability_calls"], 1);
        }
        if name == "normalize-contacts" {
            assert_eq!(
                store.run(exe, &id, json!({"rows":[{}]}), &policy).unwrap()["run"]["outcome"]["status"],
                "needs_agent"
            );
        }
    }
}

#[test]
fn sdk_file_example_prepares_and_evaluates_without_external_docs() {
    let sdk = clearings::api::sdk_definition();
    let task: Task = serde_json::from_value(sdk["file_task_example"].clone()).unwrap();
    let temp = tempfile::tempdir().unwrap();
    let store = Store::open(&temp.path().join("state.db")).unwrap();
    let id = store.prepare_task(&task).unwrap();
    let exe = Path::new(env!("CARGO_BIN_EXE_clearings"));
    let version = store
        .submit(
            exe,
            &id,
            include_str!("../../../examples/repository-context/routine.ts").to_owned(),
        )
        .unwrap();
    assert_eq!(store.evaluate(exe, &version).unwrap()["accepted"], true);
}

#[test]
fn file_wrapper_reads_fresh_documents_and_never_needs_inline_contents() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let exe = Path::new(env!("CARGO_BIN_EXE_clearings"));
    let sdk = clearings::api::sdk_definition();
    let task: Task = serde_json::from_value(sdk["file_wrapper_example"]["task"].clone()).unwrap();
    let temp = tempfile::tempdir().unwrap();
    let mut store = Store::open(&temp.path().join("state.db")).unwrap();
    let id = store.prepare_task(&task).unwrap();
    let source =
        std::fs::read_to_string(root.join("examples/normalize-contact-file/routine.ts")).unwrap();
    let version = store.submit(exe, &id, source).unwrap();
    assert_eq!(store.evaluate(exe, &version).unwrap()["accepted"], true);
    store.activate(&version, None).unwrap();
    let mut policy = Policy::default();
    policy.roots.insert("contacts".into(), temp.path().into());
    let input = json!({"root":"contacts","path":"new.json"});
    // The input stays tiny while the runtime reads a larger document and deduplicates it.
    let rows = vec![json!({"name":" New ","email":" NEW@EXAMPLE.TEST "}); 2000];
    let file = temp.path().join("new.json");
    std::fs::write(&file, json!({"rows":rows}).to_string()).unwrap();
    assert_eq!(
        store.run(exe, &id, input.clone(), &policy).unwrap()["run"]["outcome"]["output"],
        json!([{"name":"New","email":"new@example.test"}])
    );
    std::fs::write(&file, "{\"rows\":[]}").unwrap();
    assert_eq!(
        store.run(exe, &id, input.clone(), &policy).unwrap()["run"]["outcome"]["output"],
        json!([])
    );
    std::fs::remove_file(&file).unwrap();
    assert_eq!(
        store.run(exe, &id, input, &policy).unwrap()["run"]["outcome"]["status"],
        "needs_agent"
    );
    assert!(
        serde_json::to_vec(&json!({"root":"contacts","path":"new.json"}))
            .unwrap()
            .len()
            < 100
    );
}
