use clearings::{store::{Store,Task},contract::Policy};
use serde_json::json;
use std::path::Path;
#[test]
fn user_defined_workflows_share_one_runtime_and_revisions_preserve_history(){
    let root=Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");let exe=Path::new(env!("CARGO_BIN_EXE_clearings"));
    let temp=tempfile::tempdir().unwrap();let mut store=Store::open(&temp.path().join("state.db")).unwrap();
    for name in ["repository-context","group-logs","normalize-contacts"]{
        let folder=root.join("examples").join(name);let task:Task=serde_json::from_slice(&std::fs::read(folder.join("task.json")).unwrap()).unwrap();
        let id=store.prepare_task(&task).unwrap();let source=std::fs::read_to_string(folder.join("routine.ts")).unwrap();
        let version=store.submit(exe,&id,source.clone()).unwrap();assert_eq!(store.evaluate(exe,&version).unwrap()["accepted"],true);store.activate(&version,None).unwrap();
        let mut policy:Policy=serde_json::from_slice(&std::fs::read(folder.join("policy.json")).unwrap()).unwrap();for path in policy.roots.values_mut(){*path=root.join(&*path);}
        let input=serde_json::from_slice(&std::fs::read(folder.join("input.json")).unwrap()).unwrap();let run=store.run(exe,&id,input,&policy).unwrap();assert_eq!(run["run"]["outcome"]["status"],"completed");
        let revision=store.submit(exe,&id,format!("{source}\n// Reviewed revision.\n")).unwrap();assert_ne!(revision,version);assert_eq!(store.active(&id).unwrap().as_deref(),Some(version.as_str()));
        assert!(store.activate(&revision,Some(&version)).is_err());assert_eq!(store.evaluate(exe,&revision).unwrap()["accepted"],true);store.activate(&revision,Some(&version)).unwrap();
        assert_eq!(store.inspect(&version).unwrap()["object"]["source"],source);
        store.activate(&version,Some(&revision)).unwrap();
        if name=="normalize-contacts"{assert_eq!(store.run(exe,&id,json!({"rows":[{}]}),&policy).unwrap()["run"]["outcome"]["status"],"needs_agent");}
    }
}
