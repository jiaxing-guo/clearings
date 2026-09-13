//! Bound waiting and outstanding read-only filesystem work, including stalled mounts.
use anyhow::{Context, Result, ensure};
use serde_json::Value;
use std::sync::{Arc, Mutex, OnceLock, mpsc};
use std::time::{Duration, Instant};

type Job = Box<dyn FnOnce() + Send>;
struct Pool {
    sender: mpsc::SyncSender<Job>,
}
impl Pool {
    fn new(workers: usize, queued: usize) -> Result<Self> {
        let (sender, receiver) = mpsc::sync_channel::<Job>(queued);
        let receiver = Arc::new(Mutex::new(receiver));
        for _ in 0..workers {
            let receiver = receiver.clone();
            std::thread::Builder::new()
                .name("clearings-file-io".into())
                .spawn(move || loop {
                    let job = receiver.lock().unwrap().recv();
                    match job {
                        Ok(job) => job(),
                        Err(_) => break,
                    }
                })?;
        }
        Ok(Self { sender })
    }

    fn call(&self, remaining: Duration, operation: impl FnOnce() -> Result<Value> + Send + 'static) -> Result<Value> {
        ensure!(!remaining.is_zero(), "file I/O deadline exceeded");
        let deadline = Instant::now() + remaining;
        let (sender, receiver) = mpsc::sync_channel(1);
        self.sender.try_send(Box::new(move || {
            if Instant::now() < deadline {
                let _ = sender.send(operation());
            }
        })).map_err(|_| anyhow::anyhow!("file I/O capacity exhausted"))?;
        let remaining = deadline.checked_duration_since(Instant::now()).context("file I/O deadline exceeded")?;
        receiver.recv_timeout(remaining).context("file I/O deadline exceeded")?
    }
}

pub(crate) fn call(remaining: Duration, operation: impl FnOnce() -> Result<Value> + Send + 'static) -> Result<Value> {
    static POOL: OnceLock<std::result::Result<Pool, String>> = OnceLock::new();
    POOL.get_or_init(|| Pool::new(4, 4).map_err(|e| e.to_string()))
        .as_ref().map_err(|e| anyhow::anyhow!("file I/O pool unavailable: {e}"))?
        .call(remaining, operation)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn blocked_io_times_out_without_unbounded_work_and_expired_jobs_are_skipped() {
        let pool = Arc::new(Pool::new(1, 1).unwrap());
        let (started_tx, started_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let caller = pool.clone();
        let first = std::thread::spawn(move || {
            let start = Instant::now();
            let result = caller.call(Duration::from_millis(100), move || {
                started_tx.send(()).unwrap();
                release_rx.recv().unwrap();
                Ok(json!("late"))
            });
            assert!(result.is_err());
            assert!(start.elapsed() < Duration::from_secs(2));
        });
        started_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        first.join().unwrap();
        let (ran_tx, ran_rx) = mpsc::channel();
        assert!(pool.call(Duration::from_millis(20), move || {
            ran_tx.send(()).unwrap();
            Ok(json!("expired"))
        }).is_err());
        assert!(pool.call(Duration::from_secs(1), || Ok(json!("overflow")))
            .unwrap_err().to_string().contains("capacity"));
        release_tx.send(()).unwrap();
        // Disconnection proves the expired queued closure was discarded without invocation.
        assert!(matches!(ran_rx.recv_timeout(Duration::from_secs(2)), Err(mpsc::RecvTimeoutError::Disconnected)));
        assert_eq!(pool.call(Duration::from_secs(1), || Ok(json!("recovered"))).unwrap(), json!("recovered"));
    }
}
