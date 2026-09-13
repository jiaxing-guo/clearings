use clearings::{store::{Store, Task}, contract::Policy};
use serde_json::{Value,json};
use std::path::Path;
fn exe()-> &'static Path { Path::new(env!("CARGO_BIN_EXE_clearings")) }
fn task()->Task { serde_json::from_value(json!({"contract":{"abi":1,"name":"double","description":"Double numbers","input_schema":{"type":"integer"},"output_schema":{"type":"integer"}},"cases":[{"name":"zero","input":0,"expected":{"status":"completed","output":0}},{"name":"positive","input":3,"expected":{"status":"completed","output":6}},{"name":"negative","input":-2,"expected":{"status":"completed","output":-4}}]})).unwrap() }
const GOOD:&str="export default async function(x:number){return {status:'completed',output:x*2};}";
#[test]
fn candidate_cannot_change_acceptance_and_activation_is_explicit() {
    let temp=tempfile::tempdir().unwrap(); let mut s=Store::open(&temp.path().join("state.db")).unwrap();
    let task=s.prepare_task(&task()).unwrap();
    let bad=s.submit(exe(),&task,"export default async function(){return {status:'completed',output:0};}".into()).unwrap();
    assert!(s.activate(&bad,None).is_err());
    assert_eq!(s.evaluate(exe(),&bad).unwrap()["accepted"],false);
    assert!(s.activate(&bad,None).is_err());
    let good=s.submit(exe(),&task,GOOD.into()).unwrap();
    assert_eq!(s.evaluate(exe(),&good).unwrap()["accepted"],true);
    assert_eq!(s.active(&task).unwrap(),None);
    s.activate(&good,None).unwrap();
    assert!(s.activate(&good,None).is_err());
    let record=s.run(exe(),&task,json!(19),&Policy::default()).unwrap();
    assert_eq!(record["run"]["outcome"]["output"],38);
    assert!(record["run"]["model_usage"].is_null());
    assert_eq!(s.inspect(&good).unwrap()["object"]["source"],GOOD);
    assert!(s.deactivate(&task,&bad).is_err());
    s.deactivate(&task,&good).unwrap();
    assert!(s.run(exe(),&task,json!(2),&Policy::default()).is_err());
}
#[test]
fn persisted_versions_survive_reopen_and_corruption_is_rejected() {
    let temp=tempfile::tempdir().unwrap();let path=temp.path().join("state.db");
    let mut s=Store::open(&path).unwrap();let task=s.prepare_task(&task()).unwrap();let v=s.submit(exe(),&task,GOOD.into()).unwrap();s.evaluate(exe(),&v).unwrap();s.activate(&v,None).unwrap();drop(s);
    let s=Store::open(&path).unwrap();assert_eq!(s.run(exe(),&task,json!(-9),&Policy::default()).unwrap()["run"]["outcome"]["output"],-18);
    assert_eq!(s.runs().unwrap()["runs"].as_array().unwrap().len(),1);
    let db=rusqlite::Connection::open(&path).unwrap();let body:String=db.query_row("SELECT body FROM objects WHERE id=?1",[&v],|r|r.get(0)).unwrap();let mut body:Value=serde_json::from_str(&body).unwrap();body["source"]=json!("changed");db.execute("UPDATE objects SET body=?1 WHERE id=?2",rusqlite::params![body.to_string(),v]).unwrap();
    assert!(s.run(exe(),&task,json!(2),&Policy::default()).is_err());
}
#[test]
fn fixture_mismatch_cannot_be_swallowed() {
    let temp=tempfile::tempdir().unwrap();let s=Store::open(&temp.path().join("state.db")).unwrap();let mut t=task();t.contract.capabilities=vec!["files.read".into()];
    let id=s.prepare_task(&t).unwrap();
    let v=s.submit(exe(),&id,"export default async function(x){try{await clearings.call('files.read',{root:'x',path:'y'});}catch{}return {status:'completed',output:x*2};}".into()).unwrap();
    assert_eq!(s.evaluate(exe(),&v).unwrap()["accepted"],false);
}
