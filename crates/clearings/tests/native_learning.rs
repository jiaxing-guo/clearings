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
if sys.argv[1]=='app-server':
 for line in sys.stdin:
  v=json.loads(line)
  if 'id' not in v:continue
  method=v['method']
  if method=='initialize':r={}
  elif method=='thread/list':r={'data':[{'id':'fixture-session','cwd':root,'updatedAt':int(time.time())+int(os.environ.get('NEW_EVIDENCE','0')),'name':'Double integer values'}],'nextCursor':None}
  elif method=='thread/read':r={'thread':{'cwd':root}}
  elif method=='thread/turns/list':r={'data':[{'id':'turn','items':[{'id':'user'+str(i)+os.environ.get('NEW_EVIDENCE',''),'type':'userMessage','content':[{'type':'text','text':'Double the integer '+str(i)+' to get '+str(i*2)}]} for i in [1,3,5]]}],'nextCursor':None}
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
    db.execute("INSERT OR REPLACE INTO installation(key,body) VALUES('preferences','{\"revision\":2}')")
  assert '"input":5' not in prompt and '"output":10' not in prompt
  answer='export default async x=>({status:"completed",output:x*2})'
  if os.environ.get('BAD_SOURCE'):answer='export default async x=>({status:"completed",output:2})'
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
