use clearings::{capabilities::LocalBroker, contract::{Contract, Outcome, Policy}, execute};
use serde_json::{Value, json};
use std::path::Path;

fn executable() -> &'static Path { Path::new(env!("CARGO_BIN_EXE_clearings")) }
fn contract() -> Contract {
    serde_json::from_value(json!({"abi":1,"name":"example","description":"test","capabilities":["files.read","files.list"],"input_schema":{"type":"object"},"output_schema":{}})).unwrap()
}
fn run(source: &str, input: Value, policy: Policy, c: Contract) -> execute::Run {
    let prepared = execute::prepare(executable(), source).unwrap();
    let mut broker = LocalBroker::new(&c, &policy).unwrap();
    execute::run(executable(), &c, &prepared, input, &mut broker)
}

#[test]
fn typescript_source_maps_and_new_inputs() {
    let source = "export default async function(x: {n: number}) { return {status:'completed', output:x.n*2}; }";
    let prepared = execute::prepare(executable(), source).unwrap();
    assert!(prepared.source_map.as_ref().is_some_and(|s| s.contains("routine.ts")));
    for n in [0, 7, -8] {
        assert_eq!(run(source, json!({"n":n}), Policy::default(), contract()).outcome, Outcome::Completed { output: json!(n*2) });
    }
}

#[test]
fn file_grants_and_fresh_reads() {
    let temp = tempfile::tempdir().unwrap();
    let policy = Policy { roots: [("data".into(),temp.path().into())].into(), ..Policy::default() };
    let source = "export default async function(x) { const r=await clearings.call('files.read',x); return {status:'completed',output:r.text}; }";
    for text in ["one", "新しい値"] {
        std::fs::write(temp.path().join("a.txt"), text).unwrap();
        assert_eq!(run(source, json!({"root":"data","path":"a.txt"}), policy.clone(), contract()).outcome, Outcome::Completed { output: json!(text) });
    }
    for path in ["../outside", "/etc/passwd"] {
        assert!(matches!(run(source,json!({"root":"data","path":path}),policy.clone(),contract()).outcome,Outcome::Failed{..}));
    }
    assert!(matches!(run(source,json!({"root":"missing","path":"a.txt"}),policy,contract()).outcome,Outcome::Failed{..}));
}

#[cfg(unix)]
#[test]
fn symlink_cannot_escape_root() {
    let temp = tempfile::tempdir().unwrap();
    std::os::unix::fs::symlink("/etc/passwd",temp.path().join("escape")).unwrap();
    let policy = Policy {roots:[("data".into(),temp.path().into())].into(), ..Policy::default()};
    let result=run("export default async function(){return {status:'completed',output:await clearings.call('files.read',{root:'data',path:'escape'})};}",json!({}),policy,contract());
    assert!(matches!(result.outcome,Outcome::Failed{..}));
}

#[test]
fn missing_capability_cannot_be_added_by_source() {
    let result=run("export default async function(){await clearings.call('process.exec',{command:'true'});return {status:'completed',output:true};}",json!({}),Policy::default(),contract());
    assert!(matches!(result.outcome,Outcome::Failed{..}));
}

#[test]
fn worker_has_no_node_globals_or_imports() {
    let result=run("export default async function(){return {status:'completed',output:[typeof process,typeof require,typeof fetch]};}",json!({}),Policy::default(),contract());
    assert_eq!(result.outcome,Outcome::Completed{output:json!(["undefined","undefined","undefined"])});
    let result=run("import fs from 'node:fs'; export default async function(){return {status:'completed',output:fs.readFileSync('/etc/passwd')};}",json!({}),Policy::default(),contract());
    assert!(matches!(result.outcome,Outcome::Failed{..}));
}

#[test]
fn infinite_loops_and_pending_promises_fail() {
    for source in ["export default async function(){while(true){}}", "export default async function(){await new Promise(()=>{});}"] {
        let mut c=contract(); c.limits.wall_ms=100;
        let result=run(source,json!({}),Policy::default(),c);
        assert!(matches!(result.outcome,Outcome::Failed{..}));
        assert!(result.elapsed_ms<3000);
    }
}

#[test]
fn output_schemas_and_limits_are_enforced() {
    let mut c=contract(); c.output_schema=json!({"type":"integer"});
    assert!(matches!(run("export default async function(){return {status:'completed',output:'wrong'};}",json!({}),Policy::default(),c).outcome,Outcome::Failed{..}));
    let mut c=contract();c.limits.output_bytes=100;
    assert!(matches!(run("export default async function(){return {status:'completed',output:'x'.repeat(10000)};}",json!({}),Policy::default(),c).outcome,Outcome::Failed{..}));
}

#[test]
fn handoff_is_preserved_and_usage_is_unknown() {
    let result=run("export default async function(x){return {status:'needs_agent',reason:'unfamiliar',context:x};}",json!({"format":"v2"}),Policy::default(),contract());
    assert_eq!(result.outcome,Outcome::NeedsAgent{reason:"unfamiliar".into(),context:json!({"format":"v2"})});
    assert!(result.model_usage.is_none());
}

#[test]
fn malformed_source_and_external_schema_references_are_rejected() {
    assert!(execute::prepare(executable(),"export default async function( { broken").is_err());
    let mut c=contract();c.input_schema=json!({"$ref":"https://example.com/schema"});
    assert!(c.validate().is_err());
}

#[test]
fn native_isolation_blocks_ambient_effects() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("secret");
    std::fs::write(&path, "unchanged").unwrap();
    let status = std::process::Command::new(executable()).arg("__isolation-probe").arg(&path).status().unwrap();
    assert!(status.success());
    assert_eq!(std::fs::read_to_string(path).unwrap(), "unchanged");
}

#[test]
fn failing_after_a_call_retains_accounting() {
    let temp = tempfile::tempdir().unwrap();
    std::fs::write(temp.path().join("a"), "ok").unwrap();
    let policy = Policy { roots: [("data".into(), temp.path().into())].into(), ..Policy::default() };
    let mut c = contract(); c.limits.wall_ms = 100;
    let result = run("export default async function(){await clearings.call('files.read',{root:'data',path:'a'});while(true){}}",json!({}),policy,c);
    assert!(matches!(result.outcome, Outcome::Failed { .. }));
    assert_eq!(result.capability_calls, 1);
}
