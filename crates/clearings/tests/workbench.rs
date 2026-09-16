use clearings::{
    api::{Api, Operation},
    contract::Outcome,
    management::Control,
    project::Settings,
    revision::RevisionRequest,
    store::{Case, RunPurpose, Store, Task},
    workbench::Workbench,
};
use serde_json::{Value, json};
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
};
fn exe() -> &'static Path {
    Path::new(env!("CARGO_BIN_EXE_clearings"))
}
struct Fixture {
    _temp: tempfile::TempDir,
    root: PathBuf,
    db: PathBuf,
    project: String,
    task: String,
    version: String,
}
impl Fixture {
    fn new() -> Self {
        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().canonicalize().unwrap();
        let root = base.join("project");
        std::fs::create_dir(&root).unwrap();
        let db = base.join("state.db");
        let mut store = Store::open(&db).unwrap();
        let project = store
            .configure_project(&root, "My routines", Settings::default(), None)
            .unwrap()
            .id;
        let task:Task=serde_json::from_value(json!({"contract":{"abi":1,"name":"multiply","description":"Double the supplied value","input_schema":{"type":"object","properties":{"value":{"type":"integer"}},"required":["value"],"additionalProperties":false},"output_schema":{"type":"integer"},"capabilities":[]},"cases":[{"name":"two","input":{"value":2},"expected":{"status":"completed","output":4}},{"name":"zero","input":{"value":0},"expected":{"status":"completed","output":0}}]})).unwrap();
        let task = store.prepare_named(&project, task, "user").unwrap();
        let saved = store
            .save_named(
                exe(),
                &project,
                "multiply",
                "export default async x=>({status:'completed',output:x.value*2})".into(),
                None,
            )
            .unwrap();
        let version = saved["active"].as_str().unwrap().to_owned();
        Self {
            _temp: temp,
            root,
            db,
            project,
            task,
            version,
        }
    }
    fn request(&self) -> RevisionRequest {
        RevisionRequest {
            id: self.task.clone(),
            expected_version: self.version.clone(),
            request: "Use factor when supplied, otherwise keep doubling".into(),
            description: "Double the supplied value".into(),
            input_schema: json!({"type":"object","properties":{"value":{"type":"integer"},"factor":{"type":"integer"}},"required":["value"],"additionalProperties":false}),
            output_schema: json!({"type":"integer"}),
            examples: vec![Case {
                name: "with factor".into(),
                input: json!({"value":2,"factor":3}),
                expected: Outcome::Completed { output: json!(6) },
                calls: vec![],
            }],
        }
    }
    fn draft(&self, store: &Store) -> (String, String) {
        let id = store
            .prepare_revision(&self.project, &self.request())
            .unwrap();
        let result = store
            .evaluate_revision(
                exe(),
                &self.project,
                &id,
                "export default async x=>({status:'completed',output:x.value*(x.factor??2)})"
                    .into(),
            )
            .unwrap();
        assert_eq!(result["accepted"], true);
        (id, result["version"].as_str().unwrap().to_owned())
    }
}
#[test]
fn revised_requirements_are_frozen_staged_and_reversible() {
    let f = Fixture::new();
    let mut store = Store::open(&f.db).unwrap();
    let task = store.prepare_revision(&f.project, &f.request()).unwrap();
    assert_eq!(
        store.inspect(&f.task).unwrap()["object"]["cases"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert_eq!(
        store.inspect(&task).unwrap()["object"]["cases"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    let bad = store
        .evaluate_revision(
            exe(),
            &f.project,
            &task,
            "export default async x=>({status:'completed',output:x.value*2})".into(),
        )
        .unwrap();
    assert_eq!(bad["accepted"], false);
    assert!(
        store
            .apply_revision(&f.project, &task, bad["version"].as_str().unwrap())
            .is_err()
    );
    assert_eq!(store.active(&f.task).unwrap(), Some(f.version.clone()));
    let (task, version) = f.draft(&store);
    assert!(
        store
            .apply_revision(&f.project, &task, &"0".repeat(64))
            .is_err()
    );
    store.apply_revision(&f.project, &task, &version).unwrap();
    assert_eq!(
        store.named_task(&f.project, "multiply", false).unwrap(),
        task
    );
    assert_eq!(
        store
            .reuse_named(
                exe(),
                &f.project,
                "multiply",
                json!({"value":5,"factor":4}),
                &Default::default()
            )
            .unwrap()["run"]["outcome"]["output"],
        20
    );
    assert!(store.active(&f.task).unwrap().is_none());
    assert!(
        store
            .pending_revision(&f.project, &f.task)
            .unwrap()
            .is_none()
    );
    store
        .manage(&f.project, "multiply", Control::Rollback, Some(&version))
        .unwrap();
    assert_eq!(
        store.named_task(&f.project, "multiply", false).unwrap(),
        f.task
    );
    assert_eq!(store.active(&f.task).unwrap(), Some(f.version));
    assert_eq!(
        store.inspect(&task).unwrap()["object"]["cases"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
}
#[test]
fn revisions_preserve_shared_project_pause_and_owner_pause() {
    let f = Fixture::new();
    let mut store = Store::open(&f.db).unwrap();
    let other = f.root.join("other");
    std::fs::create_dir(&other).unwrap();
    let receiver = store
        .configure_project(&other, "Other", Settings::default(), None)
        .unwrap()
        .id;
    store
        .share_routine(&f.project, "multiply", "Numeric values")
        .unwrap();
    store.pause_shared(&receiver, &f.task, true).unwrap();
    store
        .manage(&f.project, "multiply", Control::Pause, None)
        .unwrap();
    let (task, version) = f.draft(&store);
    store.apply_revision(&f.project, &task, &version).unwrap();
    let row = &store.routine_library_page(&receiver, None).unwrap()["routines"][0];
    assert_eq!(row["id"], task);
    assert_eq!(row["local_paused"], true);
    assert_eq!(row["owner_paused"], true);
    assert!(store.prepare_revision(&receiver, &f.request()).is_err());
    store
        .manage(&f.project, "multiply", Control::Rollback, Some(&version))
        .unwrap();
    let row = &store.routine_library_page(&receiver, None).unwrap()["routines"][0];
    assert_eq!(row["id"], f.task);
    assert_eq!(row["local_paused"], true);
}
#[test]
fn stale_settings_or_versions_cannot_apply_a_draft() {
    let f = Fixture::new();
    let mut store = Store::open(&f.db).unwrap();
    let (task, version) = f.draft(&store);
    store
        .configure_project(&f.root, "Changed name", Settings::default(), Some(1))
        .unwrap();
    assert!(store.apply_revision(&f.project, &task, &version).is_err());
    assert_eq!(store.active(&f.task).unwrap(), Some(f.version.clone()));
    assert!(
        store
            .pending_revision(&f.project, &f.task)
            .unwrap()
            .is_some()
    );
    let request = f.request();
    let task = store.prepare_revision(&f.project, &request).unwrap();
    let accepted = store
        .evaluate_revision(
            exe(),
            &f.project,
            &task,
            "export default async x=>({status:'completed',output:x.value*(x.factor??2)})".into(),
        )
        .unwrap();
    let next = store
        .submit(
            exe(),
            &f.task,
            "export default async x=>({status:'completed',output:x.value*2}); /* new */".into(),
        )
        .unwrap();
    store.evaluate(exe(), &next).unwrap();
    store.activate(&next, Some(&f.version)).unwrap();
    assert!(
        store
            .apply_revision(&f.project, &task, accepted["version"].as_str().unwrap())
            .is_err()
    );
    assert_eq!(store.active(&f.task).unwrap(), Some(next));
}
fn exchange(server: &Workbench, listener: &TcpListener, request: String) -> (u16, String) {
    std::thread::scope(|scope| {
        scope.spawn(|| {
            let (mut socket, _) = listener.accept().unwrap();
            server.connection(&mut socket).unwrap();
        });
        let mut socket = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
        socket
            .set_read_timeout(Some(std::time::Duration::from_secs(10)))
            .unwrap();
        socket.write_all(request.as_bytes()).unwrap();
        socket.shutdown(std::net::Shutdown::Write).unwrap();
        let mut response = String::new();
        socket.read_to_string(&mut response).unwrap();
        let status = response.split_whitespace().nth(1).unwrap().parse().unwrap();
        (status, response)
    })
}
fn request(
    listener: &TcpListener,
    token: &str,
    method: &str,
    path: &str,
    origin: Option<&str>,
    body: &Value,
) -> String {
    let text = if method == "POST" {
        body.to_string()
    } else {
        String::new()
    };
    format!(
        "{method} {path} HTTP/1.1\r\nHost: {}\r\nAuthorization: Bearer {token}\r\n{}Content-Type: application/json\r\nContent-Length: {}\r\n\r\n{text}",
        listener.local_addr().unwrap(),
        origin
            .map(|o| format!("Origin: {o}\r\n"))
            .unwrap_or_default(),
        text.len()
    )
}
#[test]
fn loopback_api_checks_host_token_origin_and_keeps_runs_scoped() {
    let f = Fixture::new();
    let (server, listener) =
        Workbench::bind(f.db.clone(), f.project.clone(), exe().into()).unwrap();
    assert!(listener.local_addr().unwrap().ip().is_loopback());
    let url = server.url();
    let (origin, token) = url.split_once("/#").unwrap();
    assert_eq!(
        exchange(
            &server,
            &listener,
            request(
                &listener,
                "wrong",
                "GET",
                "/api/library",
                None,
                &Value::Null
            )
        )
        .0,
        403
    );
    assert_eq!(
        exchange(
            &server,
            &listener,
            request(
                &listener,
                token,
                "POST",
                "/api/run",
                Some("https://other.example"),
                &json!({})
            )
        )
        .0,
        403
    );
    assert_eq!(
        exchange(
            &server,
            &listener,
            request(&listener, token, "POST", "/api/run", None, &json!({}))
        )
        .0,
        403
    );
    let bad_host = request(&listener, token, "GET", "/api/library", None, &Value::Null).replace(
        &format!("Host: {}", listener.local_addr().unwrap()),
        "Host: hostile.example",
    );
    assert_eq!(exchange(&server, &listener, bad_host).0, 403);
    let (status, response) = exchange(
        &server,
        &listener,
        request(&listener, token, "GET", "/api/library", None, &Value::Null),
    );
    assert_eq!(status, 200);
    assert!(response.contains("frame-ancestors 'none'"));
    assert!(response.contains("multiply"));
    let body = json!({"id":f.task,"expected_version":f.version,"input":{"value":7}});
    let (status, response) = exchange(
        &server,
        &listener,
        request(&listener, token, "POST", "/api/run", Some(origin), &body),
    );
    assert_eq!(status, 200);
    let payload: Value = serde_json::from_str(response.split_once("\r\n\r\n").unwrap().1).unwrap();
    assert_eq!(payload["run"]["outcome"]["output"], 14);
    assert_eq!(payload["purpose"], "test");
    assert_eq!(payload["fixtures"]["available"], true);
    let forbidden = json!({"id":f.task,"expected_version":f.version,"input":{"value":7},"policy":{"roots":{"secret":"/"}}});
    assert_eq!(
        exchange(
            &server,
            &listener,
            request(
                &listener,
                token,
                "POST",
                "/api/run",
                Some(origin),
                &forbidden
            )
        )
        .0,
        400
    );
    assert_eq!(
        Store::open(&f.db)
            .unwrap()
            .routine_usage(&f.project, &f.task)
            .unwrap()["windows"]["30"]["test_calls"],
        1
    );
}
#[test]
fn recorded_file_fixtures_are_bounded_and_missing_reads_are_explicit() {
    let f = Fixture::new();
    let mut store = Store::open(&f.db).unwrap();
    let mut settings = Settings::default();
    settings.grants.roots.insert("repo".into(), f.root.clone());
    let project = store
        .configure_project(&f.root, "Files", settings, Some(1))
        .unwrap();
    let task:Task=serde_json::from_value(json!({"contract":{"abi":1,"name":"length","description":"Read file length","input_schema":{"type":"string"},"output_schema":{"type":"integer"},"capabilities":["files.read"]},"cases":[{"name":"small","input":"data.txt","expected":{"status":"completed","output":2},"calls":[{"name":"files.read","input":{"root":"repo","path":"data.txt"},"result":{"text":"ok"}}]}]})).unwrap();
    let id = store.prepare_named(&f.project, task, "user").unwrap();
    store.save_named(exe(),&f.project,"length","export default async path=>({status:'completed',output:(await clearings.call('files.read',{root:'repo',path})).text.length})".into(),None).unwrap();
    let mut api = Api {
        store,
        project: Some(f.project.clone()),
        policy: project.settings.grants,
        executable: exe().into(),
    };
    let mut run = || {
        api.call(Operation::RunRoutine {
            id: id.clone(),
            input: json!("data.txt"),
            expected_version: None,
            expected_capabilities: None,
            purpose: RunPurpose::Test,
        })
        .unwrap()
    };
    std::fs::write(f.root.join("data.txt"), "ok").unwrap();
    assert_eq!(run()["fixtures"]["calls"][0]["result"]["text"], "ok");
    std::fs::write(f.root.join("data.txt"), "a".repeat(200000)).unwrap();
    let result = run();
    assert_eq!(result["run"]["outcome"]["output"], 200000);
    assert_eq!(result["fixtures"]["available"], false);
    assert_eq!(result["fixtures"]["calls"], json!([]));
    std::fs::remove_file(f.root.join("data.txt")).unwrap();
    let result = run();
    assert_eq!(result["run"]["outcome"]["status"], "failed");
    assert_eq!(result["fixtures"]["available"], false);
}

#[test]
fn accepted_nonblocking_sockets_wait_for_the_browser_request() {
    let f = Fixture::new();
    let (server, listener) =
        Workbench::bind(f.db.clone(), f.project.clone(), exe().into()).unwrap();
    std::thread::scope(|scope| {
        scope.spawn(|| {
            let (mut socket, _) = listener.accept().unwrap();
            socket.set_nonblocking(true).unwrap();
            server.connection(&mut socket).unwrap();
        });
        let mut socket = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(30));
        let request = format!(
            "GET / HTTP/1.1\r\nHost: {}\r\n\r\n",
            listener.local_addr().unwrap()
        );
        let _ = socket.write_all(request.as_bytes());
        let mut response = String::new();
        socket.read_to_string(&mut response).unwrap();
        assert!(response.starts_with("HTTP/1.1 200"), "{response}");
    });
}

#[test]
fn prior_versions_remain_readable_without_becoming_mutable() {
    let f = Fixture::new();
    let store = Store::open(&f.db).unwrap();
    let (task, version) = f.draft(&store);
    store.apply_revision(&f.project, &task, &version).unwrap();
    let mut api = Api {
        store,
        project: Some(f.project.clone()),
        policy: Default::default(),
        executable: exe().into(),
    };
    assert!(
        api.call(Operation::Inspect {
            id: f.version.clone()
        })
        .is_ok()
    );
    assert!(
        api.call(Operation::Activate {
            version: f.version.clone(),
            expected_active: None
        })
        .is_err()
    );
    let other = f.root.join("other");
    std::fs::create_dir(&other).unwrap();
    let project = api
        .store
        .configure_project(&other, "Other", Settings::default(), None)
        .unwrap();
    api.project = Some(project.id);
    assert!(api.call(Operation::Inspect { id: f.version }).is_err());
}
