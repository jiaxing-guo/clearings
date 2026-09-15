use serde_json::{Value, json};
use std::{
    fs,
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
};
struct Fixture {
    _temp: tempfile::TempDir,
    root: PathBuf,
    data: PathBuf,
    tools: PathBuf,
    home: PathBuf,
    project: String,
}
impl Fixture {
    fn new() -> Self {
        use std::os::unix::fs::PermissionsExt;
        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().canonicalize().unwrap();
        let root = base.join("project");
        let data = base.join("data");
        let tools = base.join("bin");
        let home = base.join("home");
        for p in [&root, &tools, &home] {
            fs::create_dir(p).unwrap();
        }
        let script = tools.join("codex");
        fs::write(&script,r#"#!/usr/bin/env python3
import sys,json,os,time
root=os.environ['FIXTURE_ROOT']
def emit(v):print(json.dumps(v),flush=True)
if sys.argv[1]=='plugin':
 enabled=os.environ.get('PLUGIN_DISABLED')!='1'
 emit({'installed':[{'pluginId':'clearings@clearings','enabled':enabled}]} if os.path.basename(sys.argv[0])=='codex' else [{'id':'clearings@clearings','enabled':enabled}])
 sys.exit(0)
if sys.argv[1]=='app-server':
 for line in sys.stdin:
  v=json.loads(line)
  if 'id' not in v:continue
  method=v['method']
  if method=='initialize':r={}
  elif method=='thread/list':
   total=int(os.environ.get('HISTORY_SESSIONS','1'));start=int(v['params'].get('cursor') or 0);end=min(total,start+20)
   descending=os.environ.get('DESC_IDS')
   ids=range(total-start,total-end,-1) if descending else range(start,end)
   r={'data':[{'id':'fixture-session-'+str(i),'cwd':root,'updatedAt':int(os.environ['FIXTURE_TIME'])+i if descending else int(time.time())+int(os.environ.get('NEW_EVIDENCE','0')),'name':'Double integer values'} for i in ids],'nextCursor':str(end) if end<total else None}
  elif method=='thread/read':r={'thread':{'cwd':root,'historyMode':'paginated' if os.environ.get('PAGED_TOTAL') else 'full'}}
  elif method=='thread/items/list':
   end=int(v['params'].get('cursor') or os.environ['PAGED_TOTAL']);start=max(0,end-20)
   r={'data':[{'turnId':'turn','item':{'id':str(i),'type':'userMessage','content':[{'type':'text','text':'Double '+str(i)}]}} for i in range(end,start,-1)],'nextCursor':str(start) if start else None}
  elif method=='thread/turns/list':r={'data':[{'id':'turn','items':[{'id':'user'+str(i)+os.environ.get('NEW_EVIDENCE',''),'type':'userMessage','content':[{'type':'text','text':'Double the integer '+str(i)+' to get '+str(i*2)}]} for i in ([1] if os.environ.get('SHORT_SESSION') else [1,3,5])]}],'nextCursor':None}
  else:raise RuntimeError(method)
  emit({'id':v['id'],'result':r})
else:
 claude=os.path.basename(sys.argv[0])=='claude'
 if claude:
  assert sys.argv[sys.argv.index('--tools')+1]==''
  schema=json.loads(sys.argv[sys.argv.index('--json-schema')+1])
 else:
  assert '--ephemeral' in sys.argv and '--ignore-user-config' in sys.argv
  schema=json.load(open(sys.argv[sys.argv.index('--output-schema')+1]))
 assert os.getcwd()!=root
 prompt=sys.stdin.read()
 if os.environ.get('AUTHOR_DELAY'):time.sleep(.3)
 if claude and os.environ.get('AUTH_MISSING'):
  emit({'type':'result','is_error':True,'result':'Not logged in · Please run /login','usage':{'input_tokens':0,'output_tokens':0}})
  sys.exit(1)
 field=next(iter(schema['properties']))
 if field=='candidate_json':
  task={'contract':{'abi':1,'name':'double-integer','description':'Double any integer input','input_schema':{'type':'integer'},'output_schema':{'type':'integer'},'capabilities':[]},'cases':[{'name':str(i),'input':i,'expected':{'status':'completed','output':i*2}} for i in [1,3,5]]}
  answer=json.dumps({'task':task,'applicability':'X'*4001 if os.environ.get('INVALID_SHARING') else 'Double integer inputs in any project'})
 else:
  if os.environ.get('CHANGE_PREFS'):
   import sqlite3
   with sqlite3.connect(os.environ['FIXTURE_DB']) as db:
    db.execute("INSERT OR REPLACE INTO installation(key,body) VALUES('preferences','{\"revision\":2,\"work_revision\":2}')")
  assert '"input":5' not in prompt and '"output":10' not in prompt
  answer='export default async x=>({status:"completed",output:x*2})'
  if os.environ.get('BAD_SOURCE'):answer='export default async x=>({status:"completed",output:2})'
  if os.environ.get('IMPROVE_SOURCE'):answer=os.environ['IMPROVE_SOURCE']
 if claude:
  emit({'type':'result','is_error':False,'structured_output':{field:answer},'usage':{'input_tokens':100,'output_tokens':50}})
 else:
  emit({'type':'item.completed','item':{'type':'agent_message','text':json.dumps({field:answer})}})
  emit({'type':'turn.completed','usage':{'input_tokens':100,'output_tokens':50}})
"#).unwrap();
        fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();
        fs::copy(&script, tools.join("claude")).unwrap();
        let mut hook = Command::new(env!("CARGO_BIN_EXE_clearings"))
            .args(["plugin-register", "--all-projects", "--data-dir"])
            .arg(&data)
            .env("HOME", &home)
            .stdin(Stdio::piped())
            .spawn()
            .unwrap();
        writeln!(
            hook.stdin.take().unwrap(),
            "{}",
            json!({"hook_event_name":"SessionStart","cwd":root})
        )
        .unwrap();
        assert!(hook.wait().unwrap().success());
        let project = clearings::store::digest(&root).unwrap();
        Self {
            _temp: temp,
            root,
            data,
            tools,
            home,
            project,
        }
    }
    fn command(&self) -> Command {
        let mut c = Command::new(env!("CARGO_BIN_EXE_clearings"));
        c.env("FIXTURE_DB", self.data.join("state.db"));
        c.args([
            "--store",
            self.data.join("state.db").to_str().unwrap(),
            "--project",
            &self.project,
        ])
        .env("FIXTURE_ROOT", &self.root)
        .env("HOME", &self.home)
        .env("CLAUDE_CONFIG_DIR", self.home.join(".claude"))
        .env(
            "PATH",
            format!(
                "{}:{}",
                self.tools.display(),
                std::env::var("PATH").unwrap()
            ),
        );
        c
    }
    fn run(&self, args: &[&str]) -> Value {
        let out = self.command().args(args).output().unwrap();
        assert!(
            out.status.success(),
            "{}",
            String::from_utf8_lossy(&out.stderr)
        );
        serde_json::from_slice(&out.stdout).unwrap()
    }
}
#[test]
fn client_cycle_freezes_cases_creates_shared_routine_and_deduplicates() {
    let f = Fixture::new();
    let cycle = f.run(&["learn-now"]);
    assert_eq!(cycle["status"], "completed", "{cycle}");
    assert_eq!(
        cycle["report"]["outcomes"][0]["status"], "created",
        "{cycle}"
    );
    assert_eq!(f.run(&["learning-status"])["requests_today"], 2);
    let input = f.root.join("input.json");
    fs::write(&input, "21").unwrap();
    assert_eq!(
        f.run(&[
            "reuse",
            "double-integer",
            "--input",
            input.to_str().unwrap()
        ])["run"]["outcome"]["output"],
        42
    );
    f.run(&["learn-now"]);
    assert_eq!(f.run(&["learning-status"])["requests_today"], 2);
    let store = clearings::store::Store::open(&f.data.join("state.db")).unwrap();
    let id = cycle["report"]["outcomes"][0]["task"].as_str().unwrap();
    assert_eq!(
        store.inspect(id).unwrap()["object"]["evidence"]["kind"],
        "conversation_interpretation"
    );
    assert_eq!(
        store.find_routines(&f.project, "double integer").unwrap()["routines"][0]["routine"],
        id
    );
}
#[test]
fn failed_candidate_keeps_explicit_failure_and_is_not_activated() {
    let f = Fixture::new();
    let out = f
        .command()
        .arg("learn-now")
        .env("BAD_SOURCE", "1")
        .output()
        .unwrap();
    assert!(!out.status.success());
    let report: Value = serde_json::from_slice(&out.stdout).unwrap();
    assert_eq!(report["status"], "failed", "{report}");
    assert_eq!(f.run(&["discover"])["routines"], json!([]));
    let retry = f
        .command()
        .env("NEW_EVIDENCE", "1")
        .arg("learn-now")
        .output()
        .unwrap();
    let retry: Value = serde_json::from_slice(&retry.stdout).unwrap();
    assert_eq!(
        retry["report"]["outcomes"][0]["status"], "created",
        "{retry}"
    );
}

#[test]
fn completed_authoring_response_survives_settings_cancellation_without_respending() {
    let f = Fixture::new();
    let out = f
        .command()
        .arg("learn-now")
        .env("CHANGE_PREFS", "1")
        .output()
        .unwrap();
    assert!(!out.status.success());
    assert_eq!(f.run(&["learning-status"])["requests_today"], 2);
    let next = f.run(&["learn-now"]);
    assert_eq!(next["report"]["outcomes"][0]["status"], "created", "{next}");
    assert_eq!(f.run(&["learning-status"])["requests_today"], 2);
}

#[test]
fn mcp_learning_returns_before_completion_and_survives_connection_close() {
    use std::io::{BufRead, BufReader};
    let f = Fixture::new();
    let policy = f.root.join("policy.json");
    fs::write(
        &policy,
        json!({"roots":{"repo":f.root},"http":{}}).to_string(),
    )
    .unwrap();
    let mut child = f
        .command()
        .args(["mcp", "--policy", policy.to_str().unwrap()])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut input = child.stdin.take().unwrap();
    let mut output = BufReader::new(child.stdout.take().unwrap());
    writeln!(input,"{}",json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1"}}})).unwrap();
    let mut line = String::new();
    output.read_line(&mut line).unwrap();
    writeln!(
        input,
        "{}",
        json!({"jsonrpc":"2.0","method":"notifications/initialized"})
    )
    .unwrap();
    writeln!(input,"{}",json!({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"clearings_learn_now","arguments":{}}})).unwrap();
    line.clear();
    output.read_line(&mut line).unwrap();
    let reply: Value = serde_json::from_str(&line).unwrap();
    assert_eq!(reply["result"]["isError"], false, "{reply}");
    assert_eq!(reply["result"]["structuredContent"]["status"], "queued");
    child.kill().unwrap();
    child.wait().unwrap();
    drop(input);
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(15);
    loop {
        let status = f.run(&["learning-status"]);
        let state = status["recent_cycles"][0]["status"].as_str().unwrap();
        if state == "completed" {
            assert_eq!(status["requests_today"], 2);
            break;
        }
        assert!(
            state != "failed" && std::time::Instant::now() < deadline,
            "{status}"
        );
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
}

#[test]
fn claude_authentication_failure_can_resume_without_spending_an_authoring_attempt() {
    let f = Fixture::new();
    let db = rusqlite::Connection::open(f.data.join("state.db")).unwrap();
    db.execute("INSERT INTO installation(key,body) VALUES('preferences','{\"revision\":1,\"client\":\"claude\"}')",[]).unwrap();
    let out = f
        .command()
        .arg("learn-now")
        .env("AUTH_MISSING", "1")
        .output()
        .unwrap();
    assert!(!out.status.success());
    assert_eq!(f.run(&["learning-status"])["requests_today"], 0);
    let next = f.run(&["learn-now"]);
    assert_eq!(next["report"]["outcomes"][0]["status"], "created", "{next}");
    assert_eq!(f.run(&["learning-status"])["requests_today"], 2);
}

#[test]
fn explicit_http_connection_uses_the_same_learning_pipeline_and_reserves_its_budget() {
    use std::{
        io::{BufRead, BufReader, Read},
        net::TcpListener,
        time::{Duration, Instant},
    };
    let f = Fixture::new();
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    listener.set_nonblocking(true).unwrap();
    let server = std::thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(15);
        let mut handled = 0;
        while handled < 2 && Instant::now() < deadline {
            let (stream, _) = match listener.accept() {
                Ok(v) => v,
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(10));
                    continue;
                }
                Err(e) => panic!("{e}"),
            };
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut reader = BufReader::new(stream);
            let mut length = 0;
            loop {
                let mut line = String::new();
                reader.read_line(&mut line).unwrap();
                if line == "\r\n" {
                    break;
                }
                if let Some(v) = line.to_lowercase().strip_prefix("content-length:") {
                    length = v.trim().parse::<usize>().unwrap();
                }
            }
            let mut request = vec![0; length];
            reader.read_exact(&mut request).unwrap();
            let request: Value = serde_json::from_slice(&request).unwrap();
            assert_eq!(request["model"], "fixture");
            let content = if handled == 0 {
                let task = json!({"contract":{"abi":1,"name":"http-double","description":"Double integers","input_schema":{"type":"integer"},"output_schema":{"type":"integer"},"capabilities":[]},"cases":[{"name":"one","input":1,"expected":{"status":"completed","output":2}},{"name":"two","input":2,"expected":{"status":"completed","output":4}},{"name":"negative","input":-1,"expected":{"status":"completed","output":-2}}]});
                json!({"candidate_json":json!({"task":task,"applicability":"Double integers"}).to_string()})
            } else {
                json!({"source":"export default async x=>({status:'completed',output:x*2})"})
            };
            let response=json!({"choices":[{"message":{"content":content.to_string()}}],"usage":{"prompt_tokens":100,"completion_tokens":50}}).to_string();
            write!(reader.get_mut(),"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",response.len(),response).unwrap();
            handled += 1;
        }
        assert_eq!(handled, 2);
    });
    let settings = f.root.join("settings.json");
    fs::write(&settings,json!({"grants":{"roots":{"repo":f.root}},"model":{"url":format!("http://{address}/chat"),"model":"fixture","max_output_tokens":1024,"input_price":1,"output_price":1},"daily_budget_microusd":100}).to_string()).unwrap();
    f.run(&[
        "project-configure",
        "--root",
        f.root.to_str().unwrap(),
        "--name",
        "P",
        "--settings",
        settings.to_str().unwrap(),
        "--expected-revision",
        "1",
    ]);
    let result = f.run(&["learn-now"]);
    assert_eq!(
        result["report"]["outcomes"][0]["status"], "created",
        "{result}"
    );
    let status = f.run(&["learning-status"]);
    assert_eq!(status["recent_requests"][0]["client"], "configured_model");
    let db = rusqlite::Connection::open(f.data.join("state.db")).unwrap();
    let reserved: u64 = db
        .query_row(
            "SELECT sum(reserved_microusd) FROM native_requests",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert!(reserved > 0 && reserved <= 100);
    server.join().unwrap();
}

#[test]
fn invalid_sharing_metadata_cannot_leave_a_failed_candidate_active() {
    let f = Fixture::new();
    let output = f
        .command()
        .env("INVALID_SHARING", "1")
        .arg("learn-now")
        .output()
        .unwrap();
    let result: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(result["status"], "failed");
    assert_eq!(f.run(&["learning-status"])["requests_today"], 1);
    let db = rusqlite::Connection::open(f.data.join("state.db")).unwrap();
    assert_eq!(
        db.query_row("SELECT count(*) FROM active", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        0
    );
    assert_eq!(
        db.query_row("SELECT count(*) FROM component_changes", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        0
    );
}

#[test]
fn concurrent_synchronous_callers_wait_for_the_same_terminal_cycle() {
    let f = Fixture::new();
    let first = f
        .command()
        .env("AUTHOR_DELAY", "1")
        .arg("learn-now")
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    loop {
        let db = rusqlite::Connection::open(f.data.join("state.db")).unwrap();
        let running: bool = db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM native_cycles WHERE status='running')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        if running {
            break;
        }
        assert!(std::time::Instant::now() < deadline);
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    let second = f.run(&["learn-now"]);
    let first = first.wait_with_output().unwrap();
    let first: Value = serde_json::from_slice(&first.stdout).unwrap();
    assert_eq!(first["status"], "completed", "{first}");
    assert_eq!(second["status"], "completed", "{second}");
    assert_eq!(first["cycle"], second["cycle"]);
    assert_eq!(second["report"]["outcomes"][0]["status"], "created");
    assert_eq!(f.run(&["learning-status"])["requests_today"], 2);
}

#[test]
fn default_schedule_waits_then_coalesces_and_global_controls_preserve_reuse() {
    let f = Fixture::new();
    let tick = || f.run(&["learning-service", "--data-dir", f.data.to_str().unwrap()]);
    assert_eq!(tick()["status"], "scheduled");
    assert_eq!(tick()["status"], "not_due");
    let store = clearings::store::Store::open(&f.data.join("state.db")).unwrap();
    assert_eq!(store.preferences().unwrap().interval_seconds, 86400);
    store
        .update_preferences(1, json!({"suggestions_enabled":false}))
        .unwrap();
    assert!(store.preferences().unwrap().learning_enabled);
    assert_eq!(store.preferences().unwrap().work_revision, 1);
    store
        .update_preferences(2, json!({"learning_enabled":false}))
        .unwrap();
    assert_eq!(tick()["status"], "paused");
    assert!(
        store
            .update_preferences(2, json!({"learning_enabled":true}))
            .is_err()
    );
    store
        .update_preferences(3, json!({"learning_enabled":true}))
        .unwrap();
    let cycle = tick();
    assert_eq!(cycle["report"]["scope"], "all", "{cycle}");
    assert_eq!(
        cycle["report"]["outcomes"][0]["status"], "created",
        "{cycle}"
    );
    assert_eq!(tick()["status"], "not_due");
    let status = store.learning_status().unwrap();
    assert_eq!(status["requests_today"], 2);
    let version = status["service"]["latest_automatic_change"]["version"]
        .as_str()
        .unwrap();
    assert!(store.undo_learning(None, Some("stale")).is_err());
    let undone = store.undo_learning(None, Some(version)).unwrap();
    assert!(undone["active"].is_null());
    assert!(store.inspect(version).is_ok());
    assert!(store.undo_learning(None, None).is_err());
    store.update_preferences(4,json!({"interval_seconds":604800,"excluded_projects":[f.root.file_name().unwrap().to_str().unwrap()]})).unwrap();
    assert_eq!(store.preferences().unwrap().interval_seconds, 604800);
    assert_eq!(
        store.preferences().unwrap().excluded_projects,
        vec![f.root.to_string_lossy()]
    );
}

#[test]
fn disabled_plugin_stops_learning_without_touching_os_services_in_fixture_stores() {
    let f = Fixture::new();
    let store = clearings::store::Store::open(&f.data.join("state.db")).unwrap();
    store.bind_plugin_service(true).unwrap();
    let output = f
        .command()
        .env("PLUGIN_DISABLED", "1")
        .args(["learning-service", "--data-dir", f.data.to_str().unwrap()])
        .output()
        .unwrap();
    let result: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(result["status"], "integration_unavailable", "{result}");
    assert_eq!(store.learning_status().unwrap()["requests_today"], 0);
    assert!(!f.home.join("Library/LaunchAgents").exists());
    assert!(!f.home.join(".config/systemd").exists());
    let output = f
        .command()
        .args(["learning-service", "--data-dir", f.data.to_str().unwrap()])
        .output()
        .unwrap();
    assert_eq!(
        serde_json::from_slice::<Value>(&output.stdout).unwrap()["status"],
        "scheduled"
    );
}

#[test]
fn history_backlog_survives_request_limits_and_progresses_beyond_first_listing() {
    let f = Fixture::new();
    let store = clearings::store::Store::open(&f.data.join("state.db")).unwrap();
    store
        .update_preferences(1, json!({"max_requests_per_day":0}))
        .unwrap();
    for _ in 0..9 {
        let output = f
            .command()
            .env("HISTORY_SESSIONS", "100")
            .arg("learn-now")
            .output()
            .unwrap();
        assert_eq!(
            serde_json::from_slice::<Value>(&output.stdout).unwrap()["status"],
            "failed"
        );
    }
    let db = rusqlite::Connection::open(f.data.join("state.db")).unwrap();
    let count: i64 = db
        .query_row("SELECT count(*) FROM conversation_progress", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(count, 100);
    let pending: i64 = db
        .query_row(
            "SELECT count(*) FROM native_candidates WHERE status='pending'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert!(pending > 0 && pending <= 100);
    assert_eq!(store.learning_status().unwrap()["requests_today"], 0);
}

#[test]
fn usage_selects_improvement_and_undo_restores_the_previous_accepted_version() {
    use clearings::store::Task;
    let f = Fixture::new();
    let mut store = clearings::store::Store::open(&f.data.join("state.db")).unwrap();
    fs::write(f.root.join("value.txt"), "fresh").unwrap();
    let task:Task=serde_json::from_value(json!({"evaluation":"read_only_behavior","contract":{"abi":1,"name":"read-value","description":"Read the current value","input_schema":{"type":"integer"},"output_schema":{"type":"string"},"capabilities":["files.read"]},"cases":(0..3).map(|i|json!({"name":i.to_string(),"input":i,"expected":{"status":"completed","output":"example"},"calls":[{"name":"files.read","input":{"root":"repo","path":"value.txt"},"result":{"text":"example"}},{"name":"files.read","input":{"root":"repo","path":"value.txt"},"result":{"text":"example"}}]})).collect::<Vec<_>>() })).unwrap();
    let id = store.prepare_named(&f.project, task, "user").unwrap();
    let bin = std::path::Path::new(env!("CARGO_BIN_EXE_clearings"));
    let old=store.save_named(bin,&f.project,"read-value","export default async()=>{await clearings.call('files.read',{root:'repo',path:'value.txt'});const r=await clearings.call('files.read',{root:'repo',path:'value.txt'});return {status:'completed',output:r.text}}".into(),None).unwrap();
    let old = old["version"].as_str().unwrap();
    for _ in 0..3 {
        store
            .run_routine(
                bin,
                &f.project,
                &id,
                json!(1),
                &store.project(&f.project).unwrap().settings.grants,
            )
            .unwrap();
    }
    let db = rusqlite::Connection::open(f.data.join("state.db")).unwrap();
    db.execute(
        "INSERT INTO installation(key,body) VALUES('next_learning_due','0')",
        [],
    )
    .unwrap();
    store
        .update_preferences(1, json!({"client":"claude"}))
        .unwrap();
    let missing = f
        .command()
        .env("AUTH_MISSING", "1")
        .args(["learning-service", "--data-dir", f.data.to_str().unwrap()])
        .output()
        .unwrap();
    assert!(!missing.status.success());
    assert_eq!(
        db.query_row(
            "SELECT count(*) FROM native_requests WHERE status='unavailable'",
            [],
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        1
    );
    assert_eq!(store.active(&id).unwrap().as_deref(), Some(old));
    store
        .update_preferences(2, json!({"client":"codex"}))
        .unwrap();
    db.execute(
        "UPDATE installation SET body='0' WHERE key='next_learning_due'",
        [],
    )
    .unwrap();
    let output=f.command().env("IMPROVE_SOURCE","export default async()=>{const r=await clearings.call('files.read',{root:'repo',path:'value.txt'});return {status:'completed',output:r.text}}").args(["learning-service","--data-dir",f.data.to_str().unwrap()]).output().unwrap();
    let result: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert!(
        result["report"]["outcomes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|o| o["status"] == "improved"),
        "{result}"
    );
    let current = store.active(&id).unwrap().unwrap();
    assert_ne!(current, old);
    store.undo_learning(None, Some(&current)).unwrap();
    assert_eq!(store.active(&id).unwrap().unwrap(), old);
    let usage = store.learning_status().unwrap();
    assert_eq!(
        usage["service"]["recent_routine_usage"][0]["usage"]["windows"]["7"]["calls"],
        3
    );
}

#[test]
fn short_conversations_form_one_repeated_work_candidate() {
    let f = Fixture::new();
    let store = clearings::store::Store::open(&f.data.join("state.db")).unwrap();
    let db = rusqlite::Connection::open(f.data.join("state.db")).unwrap();
    for total in ["1", "2"] {
        db.execute(
            "INSERT OR REPLACE INTO installation(key,body) VALUES('next_learning_due','0')",
            [],
        )
        .unwrap();
        let output = f
            .command()
            .env("HISTORY_SESSIONS", total)
            .env("SHORT_SESSION", "1")
            .args(["learning-service", "--data-dir", f.data.to_str().unwrap()])
            .output()
            .unwrap();
        let result: Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(result["report"]["outcomes"], json!([]), "{result}");
        assert_eq!(store.learning_status().unwrap()["requests_today"], 0);
    }
    db.execute(
        "INSERT OR REPLACE INTO installation(key,body) VALUES('next_learning_due','0')",
        [],
    )
    .unwrap();
    let output = f
        .command()
        .env("HISTORY_SESSIONS", "3")
        .env("SHORT_SESSION", "1")
        .args(["learning-service", "--data-dir", f.data.to_str().unwrap()])
        .output()
        .unwrap();
    let result: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(
        result["report"]["outcomes"][0]["status"], "created",
        "{result}"
    );
    let task = result["report"]["outcomes"][0]["task"].as_str().unwrap();
    let inspected = store.inspect(task).unwrap();
    let sources = inspected["object"]["evidence"]["sources"]
        .as_array()
        .unwrap();
    assert_eq!(sources.len(), 3);
    assert_eq!(
        sources
            .iter()
            .map(|s| s["record"]["conversation"].as_str().unwrap())
            .collect::<std::collections::BTreeSet<_>>()
            .len(),
        3
    );
}

#[test]
fn on_request_installation_cannot_silently_install_a_service_later() {
    let f = Fixture::new();
    f.run(&[
        "install",
        "--data-dir",
        f.data.to_str().unwrap(),
        "--no-client",
        "--no-service",
    ]);
    let store = clearings::store::Store::open(&f.data.join("state.db")).unwrap();
    assert!(!store.preferences().unwrap().service_enabled);
    let result = clearings::service::install_service(
        &store,
        &f.data,
        std::path::Path::new("/missing-binary"),
    )
    .unwrap();
    assert_eq!(result["status"], "disabled");
    assert_eq!(
        f.run(&["learning-service", "--data-dir", f.data.to_str().unwrap()])["status"],
        "disabled"
    );
    assert!(!f.home.join("Library/LaunchAgents").exists());
}

#[test]
fn refreshed_head_pages_do_not_skip_the_gap_before_an_existing_tail() {
    let f = Fixture::new();
    let store = clearings::store::Store::open(&f.data.join("state.db")).unwrap();
    store
        .update_preferences(1, json!({"max_requests_per_day":0}))
        .unwrap();
    let call = |total: &str, new: &str| {
        let r = f
            .command()
            .env("PAGED_TOTAL", total)
            .env("NEW_EVIDENCE", new)
            .arg("learn-now")
            .output()
            .unwrap();
        assert!(
            !r.stdout.is_empty(),
            "{}",
            String::from_utf8_lossy(&r.stderr)
        );
    };
    call("60", "0");
    for _ in 0..9 {
        call("120", "1");
    }
    let db = rusqlite::Connection::open(f.data.join("state.db")).unwrap();
    assert_eq!(
        db.query_row("SELECT count(*) FROM conversation_evidence", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        120
    );
    assert_eq!(db.query_row("SELECT count(*) FROM conversation_progress WHERE tail_cursor IS NOT NULL OR head_cursor IS NOT NULL",[],|r|r.get::<_,i64>(0)).unwrap(),0);
}

#[test]
fn excluded_packets_do_not_block_the_pending_queue_or_its_allowed_parts() {
    let f = Fixture::new();
    let store = clearings::store::Store::open(&f.data.join("state.db")).unwrap();
    let excluded = f.root.parent().unwrap().join("excluded");
    fs::create_dir(&excluded).unwrap();
    store
        .update_preferences(
            1,
            json!({"excluded_projects":[excluded],"max_requests_per_day":0}),
        )
        .unwrap();
    let db = rusqlite::Connection::open(f.data.join("state.db")).unwrap();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    for (id, root) in [("bad", &excluded), ("good", &f.root)] {
        db.execute("INSERT INTO conversations(id,client,host_id,root,updated,body) VALUES(?1,'claude',?1,?2,?3,'{}')",rusqlite::params![id,root.to_str(),now]).unwrap();
    }
    let allowed = json!({"conversation":"good","project":f.root,"items":[{"evidence_id":"a".repeat(64),"kind":"user","content":"allowed"}]});
    for i in 0..27 {
        let denied = json!({"conversation":"bad","project":excluded,"items":[{"evidence_id":format!("{i:064x}"),"kind":"user","content":"excluded"}]});
        db.execute(
            "INSERT INTO native_candidates(fingerprint,status,report) VALUES(?1,'pending',?2)",
            rusqlite::params![
                format!("bad-{i}"),
                json!({"project":f.project,"scope":"all","packet":[denied,allowed]}).to_string()
            ],
        )
        .unwrap();
    }
    let _ = f.command().args(["learn-now", "--all"]).output().unwrap();
    assert_eq!(
        db.query_row(
            "SELECT count(*) FROM native_candidates WHERE status='excluded'",
            [],
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        27
    );
    let unsafe_pending:i64=db.query_row("SELECT count(*) FROM native_candidates c,json_each(c.report,'$.packet') p WHERE c.status='pending' AND json_extract(p.value,'$.project')=?1",[excluded.to_str()],|r|r.get(0)).unwrap();
    assert_eq!(unsafe_pending, 0);
    assert!(db.query_row("SELECT EXISTS(SELECT 1 FROM native_candidates WHERE status='pending' AND instr(report,'allowed')>0)",[],|r|r.get::<_,bool>(0)).unwrap());
}

#[test]
fn refreshed_metadata_lists_reach_new_conversations_before_old_backlogs() {
    let f = Fixture::new();
    let store = clearings::store::Store::open(&f.data.join("state.db")).unwrap();
    store
        .update_preferences(1, json!({"max_requests_per_day":0}))
        .unwrap();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
        - 1000;
    let scan = |total: &str| {
        let r = f
            .command()
            .env("HISTORY_SESSIONS", total)
            .env("DESC_IDS", "1")
            .env("FIXTURE_TIME", now.to_string())
            .arg("learn-now")
            .output()
            .unwrap();
        assert!(
            !r.stdout.is_empty(),
            "{}",
            String::from_utf8_lossy(&r.stderr)
        );
    };
    scan("100");
    scan("200");
    scan("200");
    let db = rusqlite::Connection::open(f.data.join("state.db")).unwrap();
    assert_eq!(
        db.query_row(
            "SELECT count(*) FROM conversations WHERE updated>?1",
            [now + 100],
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        100
    );
}

#[test]
fn explicit_project_review_can_use_short_pending_global_work() {
    let f = Fixture::new();
    let db = rusqlite::Connection::open(f.data.join("state.db")).unwrap();
    db.execute(
        "INSERT INTO installation(key,body) VALUES('next_learning_due','0')",
        [],
    )
    .unwrap();
    let automatic = f
        .command()
        .env("SHORT_SESSION", "1")
        .args(["learning-service", "--data-dir", f.data.to_str().unwrap()])
        .output()
        .unwrap();
    let automatic: Value = serde_json::from_slice(&automatic.stdout).unwrap();
    assert_eq!(automatic["report"]["outcomes"], json!([]));
    let manual = f
        .command()
        .env("SHORT_SESSION", "1")
        .arg("learn-now")
        .output()
        .unwrap();
    let manual: Value = serde_json::from_slice(&manual.stdout).unwrap();
    assert_eq!(
        manual["report"]["outcomes"][0]["status"], "created",
        "{manual}"
    );
}

#[test]
fn one_long_conversation_uses_the_available_page_budget() {
    let f = Fixture::new();
    let store = clearings::store::Store::open(&f.data.join("state.db")).unwrap();
    store
        .update_preferences(1, json!({"max_requests_per_day":0}))
        .unwrap();
    let updated = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
        .to_string();
    let run = || {
        let out = f
            .command()
            .env("PAGED_TOTAL", "500")
            .env("DESC_IDS", "1")
            .env("FIXTURE_TIME", &updated)
            .arg("learn-now")
            .output()
            .unwrap();
        assert!(!out.stdout.is_empty());
    };
    run();
    let db = rusqlite::Connection::open(f.data.join("state.db")).unwrap();
    let count = || {
        db.query_row("SELECT count(*) FROM conversation_evidence", [], |r| {
            r.get::<_, i64>(0)
        })
        .unwrap()
    };
    assert_eq!(
        count(),
        240,
        "one conversation can use all 12 bounded pages"
    );
    run();
    assert_eq!(
        count(),
        480,
        "the next cycle continues rather than rereading its head"
    );
    run();
    assert_eq!(count(), 500);
    assert_eq!(db.query_row("SELECT count(*) FROM conversation_progress WHERE tail_cursor IS NOT NULL OR head_cursor IS NOT NULL", [], |r| r.get::<_,i64>(0)).unwrap(), 0);
}

#[test]
fn long_conversations_share_the_page_budget_before_repeating() {
    let f = Fixture::new();
    let store = clearings::store::Store::open(&f.data.join("state.db")).unwrap();
    store
        .update_preferences(1, json!({"max_requests_per_day":0}))
        .unwrap();
    let out = f
        .command()
        .env("PAGED_TOTAL", "200")
        .env("HISTORY_SESSIONS", "3")
        .arg("learn-now")
        .output()
        .unwrap();
    assert!(!out.stdout.is_empty());
    let db = rusqlite::Connection::open(f.data.join("state.db")).unwrap();
    let counts:Vec<i64> = db.prepare("SELECT count(*) FROM conversation_evidence GROUP BY json_extract(body,'$.conversation') ORDER BY json_extract(body,'$.conversation')").unwrap().query_map([], |r| r.get(0)).unwrap().map(Result::unwrap).collect();
    assert_eq!(counts, vec![80, 80, 80]);
}
