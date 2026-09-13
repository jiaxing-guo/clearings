use clearings::{
    capabilities::{Broker, LocalBroker},
    contract::{Contract, HttpBinding, Policy},
};
use serde_json::json;
use std::{
    io::{Read, Write},
    net::TcpListener,
    time::Duration,
};
fn request(response: &str, schema: serde_json::Value) -> anyhow::Result<serde_json::Value> {
    let server = TcpListener::bind("127.0.0.1:0")?;
    let addr = server.local_addr()?;
    let response = response.to_owned();
    let t = std::thread::spawn(move || {
        let (mut socket, _) = server.accept().unwrap();
        let mut b = [0; 4096];
        let n = socket.read(&mut b).unwrap();
        let req = String::from_utf8_lossy(&b[..n]);
        assert!(req.starts_with("GET /data?q=hello+world "));
        socket.write_all(response.as_bytes()).unwrap();
    });
    let c: Contract = serde_json::from_value(
        json!({"abi":1,"name":"http","description":"test","input_schema":{},"output_schema":{},"capabilities":["data.get"]}),
    )?;
    let policy = Policy {
        http: [(
            "data.get".into(),
            HttpBinding {
                url: format!("http://{addr}/data"),
                query_keys: vec!["q".into()],
                output_schema: schema,
                bearer_token_env: None,
            },
        )]
        .into(),
        ..Policy::default()
    };
    let mut broker = LocalBroker::new(&c, &policy)?;
    assert!(
        broker
            .call(
                "data.get",
                json!({"url":"https://elsewhere"}),
                Duration::from_secs(2)
            )
            .is_err()
    );
    let result = broker.call(
        "data.get",
        json!({"q":"hello world"}),
        Duration::from_secs(2),
    );
    t.join().unwrap();
    result
}
#[test]
fn fixed_http_binding_validates_schema_and_does_not_follow_redirects() {
    assert_eq!(
        request(
            "HTTP/1.1 200 OK\r\nContent-Length: 7\r\nConnection: close\r\n\r\n{\"n\":1}",
            json!({"type":"object"})
        )
        .unwrap(),
        json!({"n":1})
    );
    assert!(
        request(
            "HTTP/1.1 200 OK\r\nContent-Length: 7\r\nConnection: close\r\n\r\n{\"n\":1}",
            json!({"type":"array"})
        )
        .is_err()
    );
    assert!(request("HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:1/secret\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",json!({})).is_err());
}

fn http_contract() -> Contract {
    serde_json::from_value(json!({"abi":1,"name":"http","description":"test","input_schema":{},"output_schema":{},"capabilities":["data.get"]})).unwrap()
}
fn policy_for(url: String) -> Policy {
    Policy {
        http: [(
            "data.get".into(),
            HttpBinding {
                url,
                query_keys: vec!["q".into()],
                output_schema: json!({}),
                bearer_token_env: None,
            },
        )]
        .into(),
        ..Policy::default()
    }
}
fn accept(server: &TcpListener) -> std::net::TcpStream {
    server.set_nonblocking(true).unwrap();
    let deadline = std::time::Instant::now() + Duration::from_secs(10);
    loop {
        match server.accept() {
            Ok((s, _)) => {
                s.set_nonblocking(false).unwrap();
                s.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
                return s;
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                assert!(
                    std::time::Instant::now() < deadline,
                    "HTTP request never arrived"
                );
                std::thread::sleep(Duration::from_millis(5));
            }
            Err(e) => panic!("{e}"),
        }
    }
}
fn headers(socket: &mut std::net::TcpStream) -> String {
    let mut request = Vec::new();
    while !request.ends_with(b"\r\n\r\n") {
        let mut byte = [0];
        socket.read_exact(&mut byte).unwrap();
        request.push(byte[0]);
        assert!(request.len() < 8192);
    }
    String::from_utf8(request).unwrap().to_ascii_lowercase()
}

#[test]
fn invalid_http_policy_fails_before_request_and_is_recorded() {
    use clearings::store::{Store, Task};
    let server = TcpListener::bind("127.0.0.1:0").unwrap();
    server.set_nonblocking(true).unwrap();
    let url = format!("http://{}/data", server.local_addr().unwrap());
    let mut policy = policy_for(url);
    policy.http.get_mut("data.get").unwrap().output_schema = json!({"type":"not-a-type"});
    assert!(LocalBroker::new(&http_contract(), &policy).is_err());
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(&dir.path().join("state.db")).unwrap();
    let task: Task = serde_json::from_value(json!({"contract":http_contract(),"cases":[{"name":"one","input":null,"expected":{"status":"completed","output":1}}]})).unwrap();
    let task = store.prepare_task(&task).unwrap();
    let exe = std::path::Path::new(env!("CARGO_BIN_EXE_clearings"));
    let version = store
        .submit(
            exe,
            &task,
            "export default async function(){return {status:'completed',output:1};}".into(),
        )
        .unwrap();
    store.evaluate(exe, &version).unwrap();
    store.activate(&version, None).unwrap();
    let result = store.run(exe, &task, json!(null), &policy).unwrap();
    assert_eq!(result["run"]["outcome"]["code"], "POLICY");
    assert_eq!(
        store.runs().unwrap()["runs"][0]["run"]["outcome"]["code"],
        "POLICY"
    );
    for url in [
        "not a URL",
        "http://example.com",
        "https://user:secret@example.com",
        "https://example.com/#fragment",
    ] {
        assert!(LocalBroker::new(&http_contract(), &policy_for(url.into())).is_err());
    }
    assert_eq!(
        server.accept().unwrap_err().kind(),
        std::io::ErrorKind::WouldBlock
    );
}

#[test]
fn repeated_http_calls_reuse_the_connection() {
    let server = TcpListener::bind("127.0.0.1:0").unwrap();
    let policy = policy_for(format!("http://{}/data", server.local_addr().unwrap()));
    let reader = std::thread::spawn(move || {
        let mut socket = accept(&server);
        for _ in 0..2 {
            assert!(headers(&mut socket).starts_with("get /data "));
            socket
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 4\r\n\r\nnull")
                .unwrap();
        }
    });
    let mut broker = LocalBroker::new(&http_contract(), &policy).unwrap();
    for _ in 0..2 {
        assert_eq!(
            broker
                .call("data.get", json!({}), Duration::from_secs(2))
                .unwrap(),
            json!(null)
        );
    }
    reader.join().unwrap();
}

#[test]
fn host_credentials_cannot_be_overridden_or_forwarded_on_redirect() {
    let target = TcpListener::bind("127.0.0.1:0").unwrap();
    target.set_nonblocking(true).unwrap();
    for redirect in [false, true] {
        let server = TcpListener::bind("127.0.0.1:0").unwrap();
        let mut policy = policy_for(format!("http://{}/data", server.local_addr().unwrap()));
        policy.http.get_mut("data.get").unwrap().bearer_token_env =
            Some("CLEARINGS_TEST_HTTP_TOKEN".into());
        let temp = tempfile::tempdir().unwrap();
        for (name, value) in [
            ("contract.json", json!(http_contract())),
            ("policy.json", json!(policy)),
            ("input.json", json!({"Authorization":"attacker"})),
        ] {
            std::fs::write(temp.path().join(name), value.to_string()).unwrap();
        }
        std::fs::write(temp.path().join("routine.ts"),"export default async function(x){return {status:'completed',output:await clearings.call('data.get',x)};}").unwrap();
        let invoke = || {
            std::process::Command::new(env!("CARGO_BIN_EXE_clearings"))
                .env("CLEARINGS_TEST_HTTP_TOKEN", "host-test-token")
                .current_dir(temp.path())
                .args([
                    "run-source",
                    "--source",
                    "routine.ts",
                    "--contract",
                    "contract.json",
                    "--input",
                    "input.json",
                    "--policy",
                    "policy.json",
                ])
                .output()
                .unwrap()
        };
        assert!(!invoke().status.success());
        server.set_nonblocking(true).unwrap();
        assert_eq!(
            server.accept().unwrap_err().kind(),
            std::io::ErrorKind::WouldBlock
        );
        std::fs::write(temp.path().join("input.json"), "{}").unwrap();
        let target_addr = target.local_addr().unwrap();
        let reader = std::thread::spawn(move || {
            let mut socket = accept(&server);
            assert!(headers(&mut socket).contains("\r\nauthorization: bearer host-test-token\r\n"));
            let reply = if redirect {
                format!(
                    "HTTP/1.1 302 Found\r\nLocation: http://{target_addr}/secret\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                )
            } else {
                "HTTP/1.1 200 OK\r\nContent-Length: 4\r\nConnection: close\r\n\r\nnull".into()
            };
            socket.write_all(reply.as_bytes()).unwrap();
        });
        let output = invoke();
        assert_eq!(output.status.success(), !redirect);
        assert!(!String::from_utf8_lossy(&output.stdout).contains("host-test-token"));
        assert!(!String::from_utf8_lossy(&output.stderr).contains("host-test-token"));
        reader.join().unwrap();
    }
    assert_eq!(
        target.accept().unwrap_err().kind(),
        std::io::ErrorKind::WouldBlock
    );
}
