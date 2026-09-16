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
        Workbench::bind(f.db.clone(), f.project.clone(), exe().into(), None).unwrap();
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
    std::fs::write(f.root.join("data.txt"), "ok").unwrap();
    let compact = api
        .call(Operation::RunRoutine {
            id: id.clone(),
            input: json!("data.txt"),
            expected_version: None,
            expected_capabilities: None,
            purpose: RunPurpose::Test,
        })
        .unwrap();
    assert!(
        compact.get("fixtures").is_none(),
        "agent test calls must not return file fixtures"
    );
    let version = api.store.active(&id).unwrap().unwrap();
    let (server, listener) =
        Workbench::bind(f.db.clone(), f.project.clone(), exe().into(), None).unwrap();
    let url = server.url();
    let (origin, token) = url.split_once("/#").unwrap();
    let run = || -> Value {
        let body = json!({"id":id,"expected_version":version,"input":"data.txt"});
        let (status, response) = exchange(
            &server,
            &listener,
            request(&listener, token, "POST", "/api/run", Some(origin), &body),
        );
        assert_eq!(status, 200);
        serde_json::from_str(response.split_once("\r\n\r\n").unwrap().1).unwrap()
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
        Workbench::bind(f.db.clone(), f.project.clone(), exe().into(), None).unwrap();
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

#[test]
fn existing_workbench_tokens_do_not_inherit_changed_project_grants() {
    let f = Fixture::new();
    let (server, listener) =
        Workbench::bind(f.db.clone(), f.project.clone(), exe().into(), None).unwrap();
    let url = server.url();
    let (origin, token) = url.split_once("/#").unwrap();
    let mut store = Store::open(&f.db).unwrap();
    let mut settings = Settings::default();
    settings
        .grants
        .roots
        .insert("new-root".into(), f.root.clone());
    store
        .configure_project(&f.root, "My routines", settings, Some(1))
        .unwrap();
    let body = json!({"id":f.task,"expected_version":f.version,"input":{"value":7}});
    let (status, response) = exchange(
        &server,
        &listener,
        request(&listener, token, "POST", "/api/run", Some(origin), &body),
    );
    assert_eq!(status, 400);
    assert!(response.contains("Open a fresh workbench link"));
    assert_eq!(
        store.routine_usage(&f.project, &f.task).unwrap()["windows"]["30"]["calls"],
        0
    );
    let (fresh, next) =
        Workbench::bind(f.db.clone(), f.project.clone(), exe().into(), None).unwrap();
    let url = fresh.url();
    let (origin, token) = url.split_once("/#").unwrap();
    assert_eq!(
        exchange(
            &fresh,
            &next,
            request(&next, token, "POST", "/api/run", Some(origin), &body)
        )
        .0,
        200
    );
}

#[test]
fn paused_shared_routines_remain_inspectable_and_can_resume_without_owner_control() {
    let f = Fixture::new();
    let mut store = Store::open(&f.db).unwrap();
    let root = f.root.join("receiver");
    std::fs::create_dir(&root).unwrap();
    let receiver = store
        .configure_project(&root, "Receiver", Settings::default(), None)
        .unwrap();
    store
        .share_routine(&f.project, "multiply", "Double a number")
        .unwrap();
    store.pause_shared(&receiver.id, &f.task, true).unwrap();
    let (server, listener) =
        Workbench::bind(f.db.clone(), receiver.id.clone(), exe().into(), None).unwrap();
    let url = server.url();
    let (origin, token) = url.split_once("/#").unwrap();
    let detail = format!("/api/routine/{}", f.task);
    assert_eq!(
        exchange(
            &server,
            &listener,
            request(&listener, token, "GET", &detail, None, &json!({}))
        )
        .0,
        200
    );
    assert!(
        store
            .library_part(&receiver.id, &f.task, Some("task"))
            .is_ok()
    );
    let run = json!({"id":f.task,"expected_version":f.version,"input":{"value":7}});
    assert_eq!(
        exchange(
            &server,
            &listener,
            request(&listener, token, "POST", "/api/run", Some(origin), &run)
        )
        .0,
        400
    );
    let resume = json!({"id":f.task,"expected_version":f.version,"action":"resume"});
    assert_eq!(
        exchange(
            &server,
            &listener,
            request(
                &listener,
                token,
                "POST",
                "/api/control",
                Some(origin),
                &resume
            )
        )
        .0,
        200
    );
    assert_eq!(
        exchange(
            &server,
            &listener,
            request(&listener, token, "POST", "/api/run", Some(origin), &run)
        )
        .0,
        200
    );
    store
        .manage(&f.project, "multiply", Control::Pause, None)
        .unwrap();
    assert_eq!(
        exchange(
            &server,
            &listener,
            request(
                &listener,
                token,
                "POST",
                "/api/control",
                Some(origin),
                &resume
            )
        )
        .0,
        200
    );
    assert_eq!(
        exchange(
            &server,
            &listener,
            request(&listener, token, "POST", "/api/run", Some(origin), &run)
        )
        .0,
        400
    );
    rusqlite::Connection::open(&f.db)
        .unwrap()
        .execute("DELETE FROM routine_library WHERE task=?1", [&f.task])
        .unwrap();
    assert_eq!(
        exchange(
            &server,
            &listener,
            request(&listener, token, "GET", &detail, None, &json!({}))
        )
        .0,
        400
    );
}

#[test]
fn pending_revision_follows_preparation_order_even_when_timestamps_tie() {
    let f = Fixture::new();
    let store = Store::open(&f.db).unwrap();
    let first = f.request();
    let mut second = f.request();
    second.request.push_str(" Keep the same numeric result.");
    let source = "export default async x=>({status:'completed',output:x.value*(x.factor??2)})";
    let a = store.prepare_revision(&f.project, &first).unwrap();
    assert_eq!(
        store
            .evaluate_revision(exe(), &f.project, &a, source.into())
            .unwrap()["accepted"],
        true
    );
    let b = store.prepare_revision(&f.project, &second).unwrap();
    assert_ne!(a, b);
    assert_eq!(
        store
            .evaluate_revision(exe(), &f.project, &b, source.into())
            .unwrap()["accepted"],
        true
    );
    let same_timestamp = || {
        rusqlite::Connection::open(&f.db)
            .unwrap()
            .execute(
                "UPDATE workbench_drafts SET created_at='2026-01-01 00:00:00'",
                [],
            )
            .unwrap();
    };
    same_timestamp();
    assert_eq!(
        store
            .pending_revision(&f.project, &f.task)
            .unwrap()
            .unwrap()["task"],
        b
    );
    assert_eq!(store.prepare_revision(&f.project, &first).unwrap(), a);
    assert_eq!(
        store
            .evaluate_revision(exe(), &f.project, &a, source.into())
            .unwrap()["accepted"],
        true
    );
    same_timestamp();
    assert_eq!(
        store
            .pending_revision(&f.project, &f.task)
            .unwrap()
            .unwrap()["task"],
        a
    );
}

#[test]
fn early_revision_errors_restart_queued_learning() {
    use std::os::unix::fs::PermissionsExt;
    let f = Fixture::new();
    let mut store = Store::open(&f.db).unwrap();
    let db = rusqlite::Connection::open(&f.db).unwrap();
    db.execute("INSERT INTO native_cycles(project,started,status,revision,project_revision,scope,automatic) VALUES(?1,0,'queued',1,1,'project',0)", [&f.project]).unwrap();
    let cycle = db.last_insert_rowid();
    let launcher = f.root.join("learning-launcher");
    std::fs::write(
        &launcher,
        "#!/bin/sh\nprintf '%s' \"$4\" > \"$2.launched\"\n",
    )
    .unwrap();
    std::fs::set_permissions(&launcher, std::fs::Permissions::from_mode(0o700)).unwrap();
    let mut request = f.request();
    request.examples.clear();
    assert!(
        store
            .propose_revision(&launcher, &f.project, request, 1)
            .unwrap_err()
            .to_string()
            .contains("add 1 to 8 examples")
    );
    let marker = std::path::PathBuf::from(format!("{}.launched", f.db.display()));
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    while std::fs::read_to_string(&marker).ok().as_deref() != Some(cycle.to_string().as_str())
        && std::time::Instant::now() < deadline
    {
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    assert_eq!(std::fs::read_to_string(marker).unwrap(), cycle.to_string());
    assert_eq!(
        store.active(&f.task).unwrap().as_deref(),
        Some(f.version.as_str())
    );
}

#[test]
fn owner_resume_clears_its_shared_pause_without_resuming_receivers() {
    let f = Fixture::new();
    let mut store = Store::open(&f.db).unwrap();
    let root = f.root.join("receiver");
    std::fs::create_dir(&root).unwrap();
    let receiver = store
        .configure_project(&root, "Receiver", Settings::default(), None)
        .unwrap();
    store
        .share_routine(&f.project, "multiply", "Double a number")
        .unwrap();
    store.pause_shared(&f.project, &f.task, true).unwrap();
    store.pause_shared(&receiver.id, &f.task, true).unwrap();
    store
        .manage(&f.project, "multiply", Control::Pause, None)
        .unwrap();
    let (server, listener) =
        Workbench::bind(f.db.clone(), f.project.clone(), exe().into(), None).unwrap();
    let url = server.url();
    let (origin, token) = url.split_once("/#").unwrap();
    let resume = json!({"id":f.task,"expected_version":f.version,"action":"resume"});
    assert_eq!(
        exchange(
            &server,
            &listener,
            request(
                &listener,
                token,
                "POST",
                "/api/control",
                Some(origin),
                &resume
            )
        )
        .0,
        200
    );
    let owner = store.routine_library_page(&f.project, None).unwrap();
    assert_eq!(owner["routines"][0]["owner_paused"], false);
    assert_eq!(owner["routines"][0]["local_paused"], false);
    assert_eq!(
        store.routine_library_page(&receiver.id, None).unwrap()["routines"][0]["local_paused"],
        true
    );
}

#[test]
fn launch_and_child_binding_reject_an_outdated_permission_snapshot() {
    let f = Fixture::new();
    let mut store = Store::open(&f.db).unwrap();
    let original = store.project(&f.project).unwrap();
    let mut settings = original.settings;
    settings.grants.roots.insert("new".into(), f.root.clone());
    let current = store
        .configure_project(&f.root, "New grants", settings, Some(original.revision))
        .unwrap();
    assert!(clearings::workbench::launch(&store, &f.project, exe(), original.revision).is_err());
    assert!(
        Workbench::bind(
            f.db.clone(),
            f.project.clone(),
            exe().into(),
            Some(original.revision)
        )
        .is_err()
    );
    assert!(
        Workbench::bind(
            f.db.clone(),
            f.project.clone(),
            exe().into(),
            Some(current.revision)
        )
        .is_ok()
    );
}

#[test]
fn workbench_launch_rejects_grants_changed_inside_the_child_startup_window() {
    use std::os::unix::fs::PermissionsExt;
    let f = Fixture::new();
    let store = Store::open(&f.db).unwrap();
    let original = store.project(&f.project).unwrap();
    let mut changed = original.settings.clone();
    changed.grants.roots.insert("new".into(), f.root.clone());
    let settings = f.root.join("changed.json");
    std::fs::write(&settings, serde_json::to_vec(&changed).unwrap()).unwrap();
    let quote = |p: &Path| format!("'{}'", p.to_string_lossy().replace('\'', "'\\''"));
    let wrapper = f.root.join("startup-race");
    std::fs::write(&wrapper, format!("#!/bin/sh\nset -e\nprintf '%s' \"$$\" > \"$2.child-pid\"\n{} --store \"$2\" project-configure --root {} --name Changed --settings {} --expected-revision 1 >/dev/null\nexec {} \"$@\"\n",quote(exe()),quote(&f.root),quote(&settings),quote(exe()))).unwrap();
    std::fs::set_permissions(&wrapper, std::fs::Permissions::from_mode(0o700)).unwrap();
    let mut api = Api {
        store,
        project: Some(f.project.clone()),
        policy: original.settings.grants,
        executable: wrapper,
    };
    let result = api.call(Operation::Workbench);
    if result.is_ok() {
        // A regression would leave our test server running; stop only its own group.
        let pid: i32 = std::fs::read_to_string(format!("{}.child-pid", f.db.display()))
            .unwrap()
            .parse()
            .unwrap();
        unsafe {
            libc::kill(-pid, libc::SIGTERM);
        }
    }
    assert!(
        result.is_err(),
        "old client received a token after grants changed"
    );
    assert_eq!(
        api.store.project(&f.project).unwrap().revision,
        original.revision + 1
    );
}

#[test]
fn stale_workbench_proposals_cannot_use_new_model_settings_or_budget() {
    let f = Fixture::new();
    let mut store = Store::open(&f.db).unwrap();
    let original = store.project(&f.project).unwrap();
    let mut settings = original.settings;
    settings.model = Some(clearings::project::ModelConnection {
        url: "http://127.0.0.1:9/chat".into(),
        model: "new-model".into(),
        bearer_token_env: None,
        max_output_tokens: 1024,
        input_price: 1,
        output_price: 1,
    });
    settings.daily_budget_microusd = 100;
    store
        .configure_project(&f.root, "New model", settings, Some(original.revision))
        .unwrap();
    let error = store
        .propose_revision(exe(), &f.project, f.request(), original.revision)
        .unwrap_err();
    assert!(
        error.to_string().contains("project settings changed"),
        "{error:#}"
    );
    assert_eq!(store.learning_status().unwrap()["requests_today"], 0);
    assert_eq!(
        store.active(&f.task).unwrap().as_deref(),
        Some(f.version.as_str())
    );
}
