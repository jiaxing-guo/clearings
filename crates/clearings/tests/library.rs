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
            .find_routines(
                &pb.id,
                "Explain in one sentence why chloroplasts matter for photosynthesis"
            )
            .unwrap()["routines"],
        json!([])
    );
    assert_eq!(
        store.find_routines(&pb.id, "already").unwrap()["routines"],
        json!([])
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

#[test]
fn large_shared_inspection_remains_readable_in_individual_parts() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    let mut store = Store::open(&root.join("state.db")).unwrap();
    let project = store
        .configure_project(&root, "P", Settings::default(), None)
        .unwrap();
    let text = "\\\"".repeat(120000);
    let task:Task=serde_json::from_value(json!({"contract":{"abi":1,"name":"echo","description":"Echo input","input_schema":{},"output_schema":{},"capabilities":[]},"cases":[{"name":"large","input":text,"expected":{"status":"completed","output":1}}]})).unwrap();
    let record = json!({"project":root,"content":"private-origin-conversation"});
    let evidence = clearings::store::digest(&record).unwrap();
    let conn = rusqlite::Connection::open(root.join("state.db")).unwrap();
    conn.execute(
        "INSERT INTO installation(key,body) VALUES('history_access','true')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO conversation_evidence(id,body) VALUES(?1,?2)",
        rusqlite::params![evidence, record.to_string()],
    )
    .unwrap();
    let prepared = store
        .prepare_conversation_task(
            &project.id,
            task,
            &[evidence],
            clearings::conversations::Scope::Project,
        )
        .unwrap();
    let id = prepared["task"].as_str().unwrap().to_owned();

    let source = format!(
        "export default async x=>({{status:'completed',output:1}}); /* {} */",
        "x".repeat(150000)
    );
    let version = store.submit(exe(), &id, source).unwrap();
    assert_eq!(store.evaluate(exe(), &version).unwrap()["accepted"], true);
    store.activate(&version, None).unwrap();
    let other = root.join("other");
    fs::create_dir(&other).unwrap();
    let receiving = store
        .configure_project(&other, "Receiving", Settings::default(), None)
        .unwrap();
    assert!(
        store
            .library_part(&receiving.id, &id, Some("version"))
            .is_err()
    );
    store
        .share_routine(&project.id, "echo", "Return a constant for the fixture")
        .unwrap();
    for part in [None, Some("task"), Some("version")] {
        let value = store.library_part(&receiving.id, &id, part).unwrap();
        assert!(!value.to_string().contains("private-origin-conversation"));
        let wire = json!({"result":{"content":[{"type":"text","text":value.to_string()}],"structuredContent":value}});
        assert!(serde_json::to_vec(&wire).unwrap().len() < clearings::contract::MAX_WIRE_BYTES);
    }
    assert!(
        store
            .library_part(&project.id, &id, Some("task"))
            .unwrap()
            .to_string()
            .contains("private-origin-conversation")
    );
    assert!(store.suggest(&json!({"hook_event_name":"UserPromptSubmit","cwd":root,"session_id":"s","prompt":"é".repeat(10000)})).unwrap().is_null());
}

#[test]
fn example_resource_names_do_not_hide_parameterized_routines_or_grant_access() {
    let temp = tempfile::tempdir().unwrap();
    let base = temp.path().canonicalize().unwrap();
    let origin = base.join("origin");
    let receiving = base.join("receiving");
    fs::create_dir(&origin).unwrap();
    fs::create_dir(&receiving).unwrap();
    fs::write(receiving.join("README.md"), "fresh receiving text").unwrap();
    let mut store = Store::open(&base.join("state.db")).unwrap();
    let a = store
        .configure_project(&origin, "Origin", Settings::default(), None)
        .unwrap();
    let mut settings = Settings::default();
    settings
        .grants
        .roots
        .insert("repo".into(), receiving.clone());
    let b = store
        .configure_project(&receiving, "Receiving", settings, None)
        .unwrap();
    let task: Task = serde_json::from_str(include_str!(
        "../../../examples/repository-context/task.json"
    ))
    .unwrap();
    let id = store.prepare_named(&a.id, task, "user").unwrap();
    assert_eq!(
        store
            .save_named(
                exe(),
                &a.id,
                "repository-context",
                include_str!("../../../examples/repository-context/routine.ts").into(),
                None
            )
            .unwrap()["accepted"],
        true
    );
    store
        .share_routine(
            &a.id,
            "repository-context",
            "Read selected files into a context packet",
        )
        .unwrap();
    assert_eq!(
        store
            .find_routines(&b.id, "Gather current file text into a JSON context packet")
            .unwrap()["routines"][0]["routine"],
        id
    );
    let run = store
        .run_routine(
            exe(),
            &b.id,
            &id,
            json!({"root":"repo","paths":["README.md"]}),
            &b.settings.grants,
        )
        .unwrap();
    assert_eq!(
        run["run"]["outcome"]["output"][0]["text"],
        "fresh receiving text"
    );
    let denied = store
        .run_routine(
            exe(),
            &b.id,
            &id,
            json!({"root":"docs","paths":["README.md"]}),
            &b.settings.grants,
        )
        .unwrap();
    assert_eq!(denied["run"]["outcome"]["status"], "failed");
}

#[test]
fn substring_distractors_cannot_hide_a_later_exact_word_match() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    let db = root.join("state.db");
    let mut store = Store::open(&db).unwrap();
    let project = store
        .configure_project(&root, "Project", Settings::default(), None)
        .unwrap();
    let task:Task=serde_json::from_value(json!({"contract":{"abi":1,"name":"log-summary","description":"Summarize log entries","input_schema":{},"output_schema":{},"capabilities":[]},"cases":[{"name":"sample","input":1,"expected":{"status":"completed","output":1}}]})).unwrap();
    let target = store.prepare_named(&project.id, task, "user").unwrap();
    let saved = store
        .save_named(
            exe(),
            &project.id,
            "log-summary",
            "export default async x=>({status:'completed',output:x})".into(),
            None,
        )
        .unwrap();
    let writer = rusqlite::Connection::open(&db).unwrap();
    let template: String = writer
        .query_row("SELECT body FROM objects WHERE id=?1", [&target], |r| {
            r.get(0)
        })
        .unwrap();
    let template: serde_json::Value = serde_json::from_str(&template).unwrap();
    // Metadata-only distractors exercise search at scale; the target above is
    // prepared and accepted by the real lifecycle and remains executable.
    for n in 0..501 {
        let id = format!("{n:064x}");
        let name = format!("catalog-{n}");
        let mut body = template.clone();
        body["contract"]["name"] = json!(name);
        body["contract"]["description"] = json!("Catalog inventory");
        writer
            .execute(
                "INSERT INTO objects(id,kind,body) VALUES(?1,'task',?2)",
                rusqlite::params![id, body.to_string()],
            )
            .unwrap();
        writer
            .execute(
                "INSERT INTO project_routines(project,name,task,origin) VALUES(?1,?2,?3,'fixture')",
                rusqlite::params![project.id, name, id],
            )
            .unwrap();
        writer
            .execute(
                "INSERT INTO active(task,version) VALUES(?1,?2)",
                rusqlite::params![id, saved["version"].as_str()],
            )
            .unwrap();
    }
    let found = store.find_routines(&project.id, "log").unwrap();
    assert_eq!(found["routines"].as_array().unwrap().len(), 1);
    assert_eq!(found["routines"][0]["routine"], target);
}

#[test]
fn search_index_updates_sharing_and_backfills_existing_objects() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    let db = root.join("state.db");
    let mut store = Store::open(&db).unwrap();
    let project = store
        .configure_project(&root, "P", Settings::default(), None)
        .unwrap();
    let task:Task=serde_json::from_value(json!({"contract":{"abi":1,"name":"echo","description":"Echo input","input_schema":{},"output_schema":{},"capabilities":[]},"cases":[{"name":"one","input":1,"expected":{"status":"completed","output":1}}]})).unwrap();
    let id = store.prepare_named(&project.id, task, "user").unwrap();
    store
        .save_named(
            exe(),
            &project.id,
            "echo",
            "export default async x=>({status:'completed',output:x})".into(),
            None,
        )
        .unwrap();
    store
        .share_routine(&project.id, "echo", "Quasar transformations")
        .unwrap();
    assert_eq!(
        store.find_routines(&project.id, "QUASAR").unwrap()["routines"][0]["routine"],
        id
    );
    store
        .share_routine(&project.id, "echo", "Nebula transformations")
        .unwrap();
    assert_eq!(
        store.find_routines(&project.id, "quasar").unwrap()["routines"],
        json!([])
    );
    store
        .share_routine(&project.id, "echo", "İSTANBUL nebula transformations")
        .unwrap();
    assert_eq!(
        store.find_routines(&project.id, "İSTANBUL").unwrap()["routines"][0]["routine"],
        id
    );
    drop(store);
    let conn = rusqlite::Connection::open(&db).unwrap();
    conn.execute_batch("DROP TRIGGER routine_search_insert; DROP TRIGGER routine_search_delete; DROP TRIGGER routine_search_update; DROP TRIGGER routine_search_share; DROP TRIGGER routine_search_reshare; DROP TRIGGER routine_search_unshare; DROP TABLE routine_search; PRAGMA user_version=11;").unwrap();
    drop(conn);
    let store = Store::open(&db).unwrap();
    assert_eq!(
        store.find_routines(&project.id, "nebula").unwrap()["routines"][0]["routine"],
        id
    );
}

#[test]
fn oversized_invocation_contract_requires_inspection_instead_of_truncating() {
    for capabilities in [vec![], vec!["custom.".to_owned() + &"x".repeat(100_000)]] {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        let mut store = Store::open(&root.join("state.db")).unwrap();
        let project = store
            .configure_project(&root, "Example", Settings::default(), None)
            .unwrap();
        let task: Task = serde_json::from_value(json!({"contract":{"abi":1,"name":"large-schema","description":"Echo integer with a large schema","input_schema":{"type":"integer","description":"large schema details ".repeat(1500)},"output_schema":{"type":"integer"},"capabilities":capabilities},"cases":[{"name":"one","input":1,"expected":{"status":"completed","output":1}}]})).unwrap();
        store.prepare_named(&project.id, task, "user").unwrap();
        store
            .save_named(
                exe(),
                &project.id,
                "large-schema",
                "export default async input=>({status:'completed',output:input})".into(),
                None,
            )
            .unwrap();
        let value = store.suggest(&json!({"hook_event_name":"UserPromptSubmit","cwd":root,"session_id":"large","prompt":"echo integer large schema"})).unwrap();
        let content = value["hookSpecificOutput"]["additionalContext"]
            .as_str()
            .unwrap();
        assert!(content.len() < 16 * 1024);
        let hints: serde_json::Value =
            serde_json::from_str(content.split_once('\n').unwrap().1).unwrap();
        assert_eq!(hints["routines"][0]["inspection_required"], true);
        assert!(hints["routines"][0].get("contract").is_none());
        assert!(hints["routines"][0].get("capabilities").is_none());
        assert!(hints["routines"][0]["routine"].is_string());
        assert!(hints["routines"][0]["active"].is_string());
    }
}

#[test]
fn aggregate_hint_budget_includes_routines_resources_and_json_escaping() {
    for oversized_resources in [false, true] {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        let mut store = Store::open(&root.join("state.db")).unwrap();
        let mut settings = Settings::default();
        if oversized_resources {
            settings
                .grants
                .roots
                .insert("quoted-\"alias".repeat(3_000), root.clone());
        }
        let project = store
            .configure_project(&root, "Example", settings, None)
            .unwrap();
        for index in 0..3 {
            let name = format!("echo-integer-{index}");
            let task: Task = serde_json::from_value(json!({"contract":{"abi":1,"name":name,"description":"Echo integer","input_schema":{"type":"integer","description":if oversized_resources {String::new()} else {"schema ".repeat(1700)}},"output_schema":{"type":"integer"},"capabilities":[]},"cases":[{"name":"one","input":1,"expected":{"status":"completed","output":1}}]})).unwrap();
            store.prepare_named(&project.id, task, "user").unwrap();
            store
                .save_named(
                    exe(),
                    &project.id,
                    &name,
                    "export default async input=>({status:'completed',output:input})".into(),
                    None,
                )
                .unwrap();
        }
        let request = json!({"hook_event_name":"UserPromptSubmit","cwd":root,"session_id":"aggregate","prompt":"echo integer"});
        let response = store.suggest(&request).unwrap();
        assert!(serde_json::to_vec(&response).unwrap().len() <= 16 * 1024);
        let content = response["hookSpecificOutput"]["additionalContext"]
            .as_str()
            .unwrap();
        let hints: serde_json::Value =
            serde_json::from_str(content.split_once('\n').unwrap().1).unwrap();
        assert_eq!(hints["routines"].as_array().unwrap().len(), 3);
        assert_eq!(hints["resources"], json!({}));
        for routine in hints["routines"].as_array().unwrap() {
            assert_eq!(routine["inspection_required"], true);
            assert!(routine.get("contract").is_none());
        }
        assert!(store.suggest(&request).unwrap().is_null());
    }
}
