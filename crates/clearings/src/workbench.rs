//! Loopback-only, token-authenticated UI over the existing project API.
use crate::{
    api::{Api, Operation},
    management::Control,
    store::{RunPurpose, Store},
};
use anyhow::{Context, Result, bail, ensure};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::{Duration, Instant},
};
const REQUEST_LIMIT: usize = 2 * 1024 * 1024;
const HEADER_LIMIT: usize = 16 * 1024;

pub fn launch(
    store: &Store,
    project: &str,
    executable: &Path,
    expected_revision: u64,
) -> Result<Value> {
    use std::os::unix::process::CommandExt;
    ensure!(
        store.project(project)?.revision == expected_revision,
        "project settings changed; open a fresh workbench link"
    );
    let database = store
        .db
        .path()
        .context("workbench requires a persistent store")?;
    let session = tempfile::Builder::new()
        .prefix("clearings-workbench-")
        .tempdir()?
        .keep();
    let mut child = std::process::Command::new(executable)
        .args([
            "--store",
            database,
            "--project",
            project,
            "workbench-serve",
            "--session-dir",
        ])
        .arg(&session)
        .arg("--expected-revision")
        .arg(expected_revision.to_string())
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .process_group(0)
        .spawn()?;
    let ready = session.join("ready.json");
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        if let Ok(bytes) = std::fs::read(&ready) {
            let value: Value = serde_json::from_slice(&bytes)?;
            std::thread::spawn(move || {
                let _ = child.wait();
            });
            return Ok(value);
        }
        if child.try_wait()?.is_some() {
            let _ = std::fs::remove_dir_all(&session);
            bail!("workbench did not start");
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            let _ = std::fs::remove_dir_all(&session);
            bail!("workbench startup timed out");
        }
        std::thread::sleep(Duration::from_millis(25));
    }
}
#[derive(Clone)]
pub struct Workbench {
    pub database: PathBuf,
    pub project: String,
    pub executable: PathBuf,
    token: String,
    origin: String,
    project_revision: u64,
}
impl Workbench {
    pub fn bind(
        database: PathBuf,
        project: String,
        executable: PathBuf,
        expected_revision: Option<u64>,
    ) -> Result<(Self, TcpListener)> {
        let project_revision = Store::open(&database)?.project(&project)?.revision;
        ensure!(
            expected_revision.is_none_or(|expected| expected == project_revision),
            "project settings changed before workbench startup; open a fresh link"
        );
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))?;
        let mut random = [0u8; 32];
        std::fs::File::open("/dev/urandom")?.read_exact(&mut random)?;
        let token = random.iter().map(|b| format!("{b:02x}")).collect();
        let origin = format!("http://{}", listener.local_addr()?);
        Ok((
            Self {
                database,
                project,
                executable,
                token,
                origin,
                project_revision,
            },
            listener,
        ))
    }
    pub fn url(&self) -> String {
        format!("{}/#{}", self.origin, self.token)
    }
    pub fn serve(self, listener: TcpListener, session: PathBuf) -> Result<()> {
        publish_ready(
            &session,
            &json!({"url":self.url(),"project":self.project,"scope":"local project workbench","expires":"after 30 minutes idle or 12 hours"}),
        )?;
        listener.set_nonblocking(true)?;
        let started = Instant::now();
        let mut activity = Instant::now();
        let active = Arc::new(AtomicUsize::new(0));
        loop {
            if started.elapsed() > Duration::from_secs(43200) {
                if active.load(Ordering::SeqCst) == 0 {
                    break;
                }
                std::thread::sleep(Duration::from_millis(50));
                continue;
            }
            match listener.accept() {
                Ok((mut socket, peer)) => {
                    if !peer.ip().is_loopback() {
                        continue;
                    }
                    activity = Instant::now();
                    if active.fetch_add(1, Ordering::SeqCst) >= 4 {
                        active.fetch_sub(1, Ordering::SeqCst);
                        let _ = respond(
                            &mut socket,
                            503,
                            "text/plain",
                            b"Workbench is busy. Try again shortly.",
                        );
                        continue;
                    }
                    let server = self.clone();
                    let count = active.clone();
                    std::thread::spawn(move || {
                        let _ = server.connection(&mut socket);
                        count.fetch_sub(1, Ordering::SeqCst);
                    });
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    if active.load(Ordering::SeqCst) == 0
                        && (activity.elapsed() > Duration::from_secs(1800)
                            || started.elapsed() > Duration::from_secs(43200))
                    {
                        break;
                    }
                    wait_for_connection(&listener)?;
                }
                Err(e) => return Err(e.into()),
            }
        }
        remove_session(&session)?;
        Ok(())
    }
    pub fn connection(&self, socket: &mut TcpStream) -> Result<()> {
        socket.set_nonblocking(false)?;
        socket.set_write_timeout(Some(Duration::from_secs(5)))?;
        let request = match read_request(socket) {
            Ok(r) => r,
            Err(_) => {
                return respond(socket, 400, "text/plain", b"Invalid or oversized request");
            }
        };
        let host = self.origin.strip_prefix("http://").unwrap();
        if request.headers.get("host").map(String::as_str) != Some(host) {
            return respond(socket, 403, "text/plain", b"Invalid host");
        }
        if request.method == "GET" {
            if request.path == "/favicon.ico" {
                return respond(socket, 204, "image/x-icon", b"");
            }
            let asset = match request.path.as_str() {
                "/" => Some((
                    "text/html; charset=utf-8",
                    include_bytes!("../workbench/index.html").as_slice(),
                )),
                "/app.js" => Some((
                    "text/javascript; charset=utf-8",
                    include_bytes!("../workbench/app.js").as_slice(),
                )),
                "/style.css" => Some((
                    "text/css; charset=utf-8",
                    include_bytes!("../workbench/style.css").as_slice(),
                )),
                _ => None,
            };
            if let Some((kind, bytes)) = asset {
                return respond(socket, 200, kind, bytes);
            }
        }
        let expected = format!("Bearer {}", self.token);
        let actual = request
            .headers
            .get("authorization")
            .map(String::as_bytes)
            .unwrap_or_default();
        let equal = actual.len() == expected.len()
            && actual
                .iter()
                .zip(expected.as_bytes())
                .fold(0u8, |a, (x, y)| a | (x ^ y))
                == 0;
        let origin = request.headers.get("origin");
        if !equal
            || origin.is_some_and(|o| o != &self.origin)
            || (request.method == "POST" && origin != Some(&self.origin))
        {
            return respond(socket,403,"application/json",br#"{"error":"Workbench access is not authorized. Open a fresh link from your coding client."}"#);
        }
        if request.method == "POST"
            && request.headers.get("content-type").map(String::as_str) != Some("application/json")
        {
            return respond(
                socket,
                415,
                "application/json",
                br#"{"error":"Use application/json"}"#,
            );
        }
        let result = self.api(&request.method, &request.path, &request.body);
        let (status, value) = match result {
            Ok(v) => (200, v),
            Err(e) => (
                400,
                json!({"error":format!("{e:#}").chars().take(4096).collect::<String>()}),
            ),
        };
        let bytes = serde_json::to_vec(&value)?;
        if bytes.len() > REQUEST_LIMIT {
            return respond(socket,413,"application/json",br#"{"error":"This result is too large for the workbench. Ask your agent for a compact view."}"#);
        }
        respond(socket, status, "application/json", &bytes)
    }
    fn api(&self, method: &str, path: &str, body: &[u8]) -> Result<Value> {
        let store = Store::open(&self.database)?;
        let project = store.project(&self.project)?;
        ensure!(
            project.revision == self.project_revision,
            "Project settings changed. Open a fresh workbench link from your coding client."
        );
        let mut api = Api {
            store,
            project: Some(self.project.clone()),
            policy: project.settings.grants,
            executable: self.executable.clone(),
        };
        match (method, path) {
            ("GET", "/api/library") => api.call(Operation::Library { after: None }),
            ("GET", p) if p.starts_with("/api/library?after=") => api.call(Operation::Library {
                after: Some(p[19..].to_owned()),
            }),
            ("GET", p) if p.starts_with("/api/routine/") => {
                let id = &p[13..];
                let mut value = api.store.library_part(&self.project, id, None)?;
                value["recent_calls"] = api.store.routine_recent_calls(&self.project, id)?;
                value["roots"] = json!(api.policy.roots.keys().collect::<Vec<_>>());
                if value["origin_project"] == self.project {
                    value["pending"] = json!(api.store.pending_revision(&self.project, id)?);
                }
                Ok(value)
            }
            ("POST", "/api/run") => {
                let input: RunInput = serde_json::from_slice(body)?;
                let detail = api.store.library_part(&self.project, &input.id, None)?;
                let capabilities: Vec<String> =
                    serde_json::from_value(detail["contract"]["capabilities"].clone())?;
                api.store.run_selected(
                    &self.executable,
                    &input.id,
                    input.input,
                    &api.policy,
                    Some(&self.project),
                    crate::store::RunOptions {
                        expected: Some(crate::store::ExpectedRoutine {
                            version: &input.expected_version,
                            capabilities: &capabilities,
                        }),
                        purpose: RunPurpose::Test,
                        capture_fixtures: true,
                    },
                )
            }
            ("POST", "/api/control") => {
                let input: ControlInput = serde_json::from_slice(body)?;
                let detail = api.store.library_part(&self.project, &input.id, None)?;
                ensure!(
                    detail["version"].as_str() == input.expected_version.as_deref(),
                    "routine changed; refresh before changing its controls"
                );
                if detail["origin_project"] != self.project {
                    ensure!(
                        matches!(input.action.as_str(), "pause" | "resume"),
                        "shared definitions can only be paused or resumed here"
                    );
                    return api.call(Operation::PauseShared {
                        id: input.id,
                        paused: input.action == "pause",
                    });
                }
                let name = detail["contract"]["name"]
                    .as_str()
                    .context("routine lacks a name")?
                    .to_owned();
                let control = match input.action.as_str() {
                    "pause" => Control::Pause,
                    "resume" => Control::Resume,
                    "include" => Control::Include,
                    "undo" => Control::Rollback,
                    _ => bail!("unsupported control"),
                };
                api.call(Operation::Manage {
                    name,
                    control,
                    expected_active: input.expected_version,
                })
            }
            ("POST", "/api/propose") => {
                let input: crate::revision::RevisionRequest = serde_json::from_slice(body)?;
                api.store.propose_revision(
                    &self.executable,
                    &self.project,
                    input,
                    self.project_revision,
                )
            }
            ("POST", "/api/apply") => {
                let input: ApplyInput = serde_json::from_slice(body)?;
                api.store
                    .apply_revision(&self.project, &input.task, &input.version)
            }
            _ => bail!("Unknown workbench operation"),
        }
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RunInput {
    id: String,
    expected_version: String,
    input: Value,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ControlInput {
    id: String,
    action: String,
    expected_version: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ApplyInput {
    task: String,
    version: String,
}
struct Request {
    method: String,
    path: String,
    headers: BTreeMap<String, String>,
    body: Vec<u8>,
}
fn read_request(socket: &mut TcpStream) -> Result<Request> {
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut bytes = Vec::new();
    let mut chunk = [0u8; 4096];
    let boundary = loop {
        let remaining = deadline
            .checked_duration_since(Instant::now())
            .context("request timed out")?;
        socket.set_read_timeout(Some(remaining))?;
        let n = socket.read(&mut chunk)?;
        ensure!(n > 0, "incomplete request");
        bytes.extend_from_slice(&chunk[..n]);
        if let Some(end) = bytes.windows(4).position(|s| s == b"\r\n\r\n") {
            ensure!(end <= HEADER_LIMIT, "headers too large");
            break end + 4;
        }
        ensure!(bytes.len() <= HEADER_LIMIT, "headers too large");
    };
    let text = std::str::from_utf8(&bytes[..boundary])?;
    let mut lines = text.split("\r\n");
    let line: Vec<_> = lines
        .next()
        .context("missing request line")?
        .split_whitespace()
        .collect();
    ensure!(
        line.len() == 3
            && line[2] == "HTTP/1.1"
            && matches!(line[0], "GET" | "POST")
            && line[1].starts_with('/')
            && line[1].len() <= 512,
        "unsupported request"
    );
    let method = line[0].to_owned();
    let path = line[1].to_owned();
    let mut headers = BTreeMap::new();
    for line in lines.filter(|l| !l.is_empty()) {
        let (key, value) = line.split_once(':').context("invalid header")?;
        let key = key.to_ascii_lowercase();
        ensure!(
            headers.insert(key, value.trim().to_owned()).is_none(),
            "duplicate header"
        );
    }
    ensure!(
        !headers.contains_key("transfer-encoding"),
        "chunked requests are unsupported"
    );
    let length = headers
        .get("content-length")
        .map(|n| n.parse::<usize>())
        .transpose()?
        .unwrap_or(0);
    ensure!(
        length <= REQUEST_LIMIT && (method != "GET" || length == 0),
        "invalid request length"
    );
    while bytes.len() - boundary < length {
        let remaining = deadline
            .checked_duration_since(Instant::now())
            .context("request timed out")?;
        socket.set_read_timeout(Some(remaining))?;
        let n = socket.read(&mut chunk)?;
        ensure!(n > 0, "incomplete request body");
        bytes.extend_from_slice(&chunk[..n]);
        ensure!(
            bytes.len() <= HEADER_LIMIT + REQUEST_LIMIT + 4096,
            "request too large"
        );
    }
    ensure!(
        bytes.len() - boundary == length,
        "unexpected trailing request data"
    );
    Ok(Request {
        method,
        path,
        headers,
        body: bytes[boundary..].to_vec(),
    })
}
fn publish_ready(session: &Path, value: &Value) -> Result<()> {
    let mut file = tempfile::NamedTempFile::new_in(session)?;
    file.write_all(&serde_json::to_vec(value)?)?;
    file.as_file().sync_all()?;
    file.persist_noclobber(session.join("ready.json"))?;
    Ok(())
}

fn wait_for_connection(listener: &TcpListener) -> Result<()> {
    use std::os::fd::AsRawFd;
    let mut descriptor = libc::pollfd {
        fd: listener.as_raw_fd(),
        events: libc::POLLIN,
        revents: 0,
    };
    // Wake immediately for a connection and periodically for idle/lifetime checks.
    let result = unsafe { libc::poll(&mut descriptor, 1, 500) };
    if result < 0 {
        let error = std::io::Error::last_os_error();
        if error.kind() != std::io::ErrorKind::Interrupted {
            return Err(error.into());
        }
    }
    Ok(())
}

fn remove_session(session: &Path) -> Result<()> {
    match std::fs::remove_file(session.join("ready.json")) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    // The hidden serve command may receive an operator-selected directory.
    // Never remove unrelated files from it.
    match std::fs::remove_dir(session) {
        Ok(()) => Ok(()),
        Err(error)
            if matches!(
                error.kind(),
                std::io::ErrorKind::DirectoryNotEmpty | std::io::ErrorKind::NotFound
            ) =>
        {
            Ok(())
        }
        Err(error) => Err(error.into()),
    }
}

fn respond(socket: &mut TcpStream, status: u16, kind: &str, body: &[u8]) -> Result<()> {
    write!(
        socket,
        "HTTP/1.1 {status} Response\r\nContent-Type: {kind}\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'\r\n\r\n",
        body.len()
    )?;
    socket.write_all(body)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn readiness_is_published_complete_and_never_overwrites_an_existing_file() {
        let temp = tempfile::tempdir().unwrap();
        let value = serde_json::json!({"url":"x".repeat(100000)});
        super::publish_ready(temp.path(), &value).unwrap();
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(
                &std::fs::read(temp.path().join("ready.json")).unwrap()
            )
            .unwrap(),
            value
        );
        assert!(super::publish_ready(temp.path(), &serde_json::json!({})).is_err());
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(
                &std::fs::read(temp.path().join("ready.json")).unwrap()
            )
            .unwrap(),
            value
        );
    }
    #[test]
    fn session_cleanup_preserves_unrelated_files() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::write(temp.path().join("ready.json"), "{}").unwrap();
        std::fs::write(temp.path().join("notes.txt"), "keep").unwrap();
        super::remove_session(temp.path()).unwrap();
        assert_eq!(
            std::fs::read_to_string(temp.path().join("notes.txt")).unwrap(),
            "keep"
        );
        assert!(!temp.path().join("ready.json").exists());
    }
}
