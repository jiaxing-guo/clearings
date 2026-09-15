//! Bounded JSON-line communication with an installed coding client.
use anyhow::{Context, Result, ensure};
use serde_json::Value;
use std::{
    io::{BufRead, BufReader, Read, Write},
    path::PathBuf,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{Arc, Mutex, mpsc},
    time::{Duration, Instant},
};

pub(crate) fn executable(name: &str) -> Result<PathBuf> {
    let mut paths: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).map(|p| p.join(name)).collect())
        .unwrap_or_default();
    if let Some(home) = std::env::var_os("HOME") {
        paths.push(PathBuf::from(home).join(".local/bin").join(name));
    }
    for prefix in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"] {
        paths.push(PathBuf::from(prefix).join(name));
    }
    if name == "codex" {
        for app in ["Codex", "ChatGPT"] {
            paths.push(PathBuf::from(format!(
                "/Applications/{app}.app/Contents/Resources/codex"
            )));
        }
    }
    paths
        .into_iter()
        .find(|p| {
            use std::os::unix::fs::PermissionsExt;
            p.is_absolute()
                && p.metadata()
                    .is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        })
        .with_context(|| format!("{name} client executable is unavailable"))
}

pub(crate) struct JsonProcess {
    child: Child,
    input: Arc<Mutex<Option<ChildStdin>>>,
    output: mpsc::Receiver<Result<Value>>,
    deadline: Instant,
}
impl JsonProcess {
    pub(crate) fn start(command: &mut Command, timeout: Duration) -> Result<Self> {
        use std::os::unix::process::CommandExt;
        let mut child = command
            .process_group(0)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()?;
        let input = Arc::new(Mutex::new(child.stdin.take()));
        let mut reader = BufReader::new(child.stdout.take().unwrap());
        let (sender, output) = mpsc::sync_channel(8);
        std::thread::spawn(move || {
            let mut total = 0;
            loop {
                let result = (|| -> Result<Option<Value>> {
                    let mut line = vec![];
                    let n = Read::by_ref(&mut reader)
                        .take(4 * 1024 * 1024 + 1)
                        .read_until(b'\n', &mut line)?;
                    if n == 0 {
                        return Ok(None);
                    }
                    total += n;
                    ensure!(
                        n <= 4 * 1024 * 1024 && total <= 16 * 1024 * 1024,
                        "client output exceeds byte limit"
                    );
                    Ok(Some(
                        serde_json::from_slice(&line).context("client returned invalid JSON")?,
                    ))
                })();
                match result {
                    Ok(Some(value)) => {
                        if sender.send(Ok(value)).is_err() {
                            break;
                        }
                    }
                    Ok(None) => break,
                    Err(e) => {
                        let _ = sender.send(Err(e));
                        break;
                    }
                }
            }
        });
        Ok(Self {
            child,
            input,
            output,
            deadline: Instant::now() + timeout,
        })
    }
    fn remaining(&self) -> Result<Duration> {
        self.deadline
            .checked_duration_since(Instant::now())
            .context("coding client deadline exceeded")
    }
    pub(crate) fn send(&self, value: Value) -> Result<()> {
        let input = self.input.clone();
        let bytes = serde_json::to_vec(&value)?;
        ensure!(
            bytes.len() <= 512 * 1024,
            "client request exceeds byte limit"
        );
        crate::blocking_io::call(self.remaining()?, move || {
            let mut guard = input.lock().unwrap();
            let input = guard.as_mut().context("client input is closed")?;
            input.write_all(&bytes)?;
            input.write_all(b"\n")?;
            input.flush()?;
            Ok(Value::Null)
        })?;
        Ok(())
    }
    pub(crate) fn finish_text(&self, text: String) -> Result<()> {
        ensure!(text.len() <= 512 * 1024, "authoring input exceeds limit");
        let input = self.input.clone();
        crate::blocking_io::call(self.remaining()?, move || {
            let mut input = input
                .lock()
                .unwrap()
                .take()
                .context("client input already closed")?;
            input.write_all(text.as_bytes())?;
            input.flush()?;
            drop(input);
            Ok(Value::Null)
        })?;
        Ok(())
    }
    pub(crate) fn receive(&self) -> Result<Value> {
        self.output
            .recv_timeout(self.remaining()?)
            .context("coding client ended or timed out")?
    }
    pub(crate) fn call(&self, id: u64, method: &str, params: Value) -> Result<Value> {
        self.send(serde_json::json!({"jsonrpc":"2.0","id":id,"method":method,"params":params}))?;
        loop {
            let value = self.receive()?;
            if value["id"] == id {
                ensure!(
                    value.get("error").is_none(),
                    "coding client rejected {method}: {}",
                    value["error"]
                );
                return value
                    .get("result")
                    .cloned()
                    .context("client response lacks result");
            }
        }
    }
}
impl Drop for JsonProcess {
    fn drop(&mut self) {
        // Kill the process group as well as its leader, including on timeout.
        unsafe {
            libc::kill(-(self.child.id() as i32), libc::SIGKILL);
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn rpc_skips_notifications_and_reads_matching_response() {
        let mut command = Command::new("/bin/sh");
        command.args(["-c", "read request; printf '%s\\n' '{\"method\":\"notice\"}' '{\"id\":7,\"result\":{\"ok\":true}}'"]);
        let process = JsonProcess::start(&mut command, Duration::from_secs(2)).unwrap();
        assert_eq!(
            process.call(7, "test", json!({})).unwrap(),
            json!({"ok":true})
        );
    }
    #[test]
    fn silent_client_has_a_deadline_and_is_reaped() {
        let mut command = Command::new("/bin/sleep");
        command.arg("30");
        let process = JsonProcess::start(&mut command, Duration::from_millis(50)).unwrap();
        let id = process.child.id();
        assert!(process.receive().is_err());
        drop(process);
        assert_eq!(unsafe { libc::kill(id as i32, 0) }, -1);
    }
}
