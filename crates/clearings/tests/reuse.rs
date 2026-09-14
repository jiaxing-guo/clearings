use clearings::{
    contract::Policy,
    project::Settings,
    store::{Store, Task},
};
use serde_json::json;
use std::path::Path;
fn exe() -> &'static Path {
    Path::new(env!("CARGO_BIN_EXE_clearings"))
}
fn task() -> Task {
    serde_json::from_value(json!({"contract":{"abi":1,"name":"Double","description":"Double a number","input_schema":{"type":"integer"},"output_schema":{"type":"integer"}},"cases":[{"name":"one","input":1,"expected":{"status":"completed","output":2}},{"name":"two","input":2,"expected":{"status":"completed","output":4}}]})).unwrap()
}
#[test]
fn named_save_revision_and_project_isolation() {
    let a = tempfile::tempdir().unwrap();
    let b = tempfile::tempdir().unwrap();
    let mut s = Store::open(&a.path().join("state.db")).unwrap();
    let pa = s
        .configure_project(a.path(), "A", Settings::default(), None)
        .unwrap();
    let pb = s
        .configure_project(b.path(), "B", Settings::default(), None)
        .unwrap();
    let ta = s.prepare_named(&pa.id, task(), "user").unwrap();
    let tb = s.prepare_named(&pb.id, task(), "user").unwrap();
    assert_ne!(ta, tb);
    assert!(s.owns_task(&pb.id, &ta).is_err());
    let result = s
        .save_named(
            exe(),
            &pa.id,
            "Double",
            "export default async x=>({status:'completed',output:x*2})".into(),
            None,
        )
        .unwrap();
    assert_eq!(result["accepted"], true);
    let listed = s.named_list(&pa.id, None).unwrap();
    assert_eq!(listed["routines"].as_array().unwrap().len(), 1);
    assert_eq!(listed["routines"][0]["task"], ta);
    assert_eq!(listed["routines"][0]["active"], result["version"]);
    assert!(s.named_list(&pb.id, None).unwrap()["routines"][0]["active"].is_null());
    assert!(
        s.named_list(&pa.id, Some("Double")).unwrap()["routines"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        s.reuse_named(exe(), &pa.id, "Double", json!(21), &Policy::default())
            .unwrap()["run"]["outcome"]["output"],
        42
    );
    assert!(
        s.reuse_named(exe(), &pb.id, "Double", json!(21), &Policy::default())
            .is_err()
    );
    let bad = s
        .save_named(
            exe(),
            &pa.id,
            "Double",
            "export default async x=>({status:'completed',output:0})".into(),
            result["version"].as_str(),
        )
        .unwrap();
    assert_eq!(bad["accepted"], false);
    assert_eq!(
        s.active(&ta).unwrap().as_deref(),
        result["version"].as_str()
    );
}
#[test]
fn behavior_evaluation_allows_fewer_reads_but_rejects_unrecorded_reads() {
    let d = tempfile::tempdir().unwrap();
    let s = Store::open(&d.path().join("state.db")).unwrap();
    let mut t:Task=serde_json::from_value(json!({"evaluation":"read_only_behavior","contract":{"abi":1,"name":"read","description":"read","input_schema":{},"output_schema":{},"capabilities":["files.read"]},"cases":[{"name":"read","input":{},"expected":{"status":"completed","output":"hello"},"calls":[{"name":"files.read","input":{"root":"r","path":"x"},"result":{"text":"hello"}},{"name":"files.read","input":{"root":"r","path":"x"},"result":{"text":"hello"}}]}]})).unwrap();
    let id = s.prepare_task(&t).unwrap();
    let good=s.submit(exe(),&id,"export default async ()=>({status:'completed',output:(await clearings.call('files.read',{root:'r',path:'x'})).text})".into()).unwrap();
    assert_eq!(s.evaluate(exe(), &good).unwrap()["accepted"], true);
    let bad=s.submit(exe(),&id,"export default async ()=>{try{await clearings.call('files.read',{root:'r',path:'secret'})}catch{}return {status:'completed',output:'hello'}}".into()).unwrap();
    assert_eq!(s.evaluate(exe(), &bad).unwrap()["accepted"], false);
    t.cases[0].calls[1].result = json!({"text":"changed"});
    assert!(s.prepare_task(&t).is_err());
}

#[test]
fn concurrent_registration_returns_only_the_registered_requirements() {
    let d = tempfile::tempdir().unwrap();
    let db = d.path().join("state.db");
    let mut s = Store::open(&db).unwrap();
    let p = s
        .configure_project(d.path(), "P", Settings::default(), None)
        .unwrap();
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let handles: Vec<_> = (0..2)
        .map(|i| {
            let db = db.clone();
            let id = p.id.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                let s = Store::open(&db).unwrap();
                let mut t = task();
                t.contract.description = format!("requirements {i}");
                barrier.wait();
                s.prepare_named(&id, t, "user")
            })
        })
        .collect();
    let results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    assert_eq!(results.iter().filter(|r| r.is_ok()).count(), 1);
    let winner = results.into_iter().find_map(Result::ok).unwrap();
    assert_eq!(s.named_task(&p.id, "Double", false).unwrap(), winner);
    let mut forged = task();
    forged.project = Some(p.id.clone());
    forged.contract.description = "forged".into();
    let id = s.prepare_task(&forged).unwrap();
    assert!(s.owns_task(&p.id, &id).is_err());
    assert!(s.check_task_scope(None, &winner).is_err());
    assert_eq!(s.list().unwrap()["tasks"], json!([]));
}
