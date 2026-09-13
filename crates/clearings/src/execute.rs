use crate::capabilities::Broker;
use crate::contract::{Contract, Event, Limits, Outcome, Prepared, Request, require_source};
use crate::worker::{read_message, write_message};
use anyhow::{Context, Result, bail, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::io::BufReader;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

struct Guard(Child);
impl Drop for Guard {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Run {
    pub outcome: Outcome,
    pub elapsed_ms: u128,
    pub capability_calls: usize,
    pub model_usage: Option<Value>,
}

fn exchange(
    executable: &Path,
    request: &Request,
    limits: &Limits,
    mut broker: Option<&mut dyn Broker>,
    calls: &mut usize,
) -> Result<Event> {
    let mut child = Guard(
        Command::new(executable)
            .arg("__worker")
            .env_clear()
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .context("start isolated worker")?,
    );
    let mut input = child.0.stdin.take().context("worker stdin")?;
    let output = child.0.stdout.take().context("worker stdout")?;
    let (sender, receiver) = mpsc::sync_channel(1);
    let reader = std::thread::spawn(move || {
        let mut output = BufReader::new(output);
        loop {
            let message = read_message::<Event>(&mut output).map_err(|e| e.to_string());
            let terminal = !matches!(message, Ok(Event::Call { .. }));
            if sender.send(message).is_err() || terminal {
                break;
            }
        }
    });
    let deadline = Instant::now() + Duration::from_millis(limits.wall_ms);
    let mut capability_failure = None;
    let result = (|| -> Result<Event> {
        write_message(&mut input, request)?;
        loop {
            let remaining = deadline
                .checked_duration_since(Instant::now())
                .context("worker deadline exceeded")?;
            let message = receiver
                .recv_timeout(remaining)
                .context("worker deadline or channel failure")?
                .map_err(|e| anyhow::anyhow!(e))?;
            match message {
                Event::Call {
                    name,
                    input: arguments,
                } => {
                    *calls += 1;
                    ensure!(
                        *calls <= limits.capability_calls,
                        "capability call budget exhausted"
                    );
                    let broker = broker
                        .as_deref_mut()
                        .context("capabilities are unavailable during preparation")?;
                    let remaining = deadline
                        .checked_duration_since(Instant::now())
                        .context("worker deadline exceeded")?;
                    let response = match broker.call(&name, arguments, remaining) {
                        Ok(value) => json!({"ok":true,"value":value}),
                        Err(error) => {
                            let message = error.to_string();
                            capability_failure.get_or_insert_with(|| message.clone());
                            json!({"ok":false,"error":message})
                        }
                    };
                    write_message(&mut input, &response)?;
                }
                Event::Finished {
                    outcome: Outcome::Completed { .. },
                } if capability_failure.is_some() => {
                    bail!(
                        "capability failed: {}",
                        capability_failure.as_ref().unwrap()
                    );
                }
                terminal => return Ok(terminal),
            }
        }
    })();
    drop(input);
    drop(receiver);
    drop(child);
    let _ = reader.join();
    result
}

pub fn prepare(executable: &Path, source: &str) -> Result<Prepared> {
    require_source(source)?;
    let event = exchange(
        executable,
        &Request::Prepare {
            source: source.into(),
        },
        &Limits::default(),
        None,
        &mut 0,
    )?;
    match event {
        Event::Prepared { prepared } => Ok(prepared),
        Event::Error { message } => bail!("{message}"),
        _ => bail!("invalid preparation result"),
    }
}

pub fn run(
    executable: &Path,
    contract: &Contract,
    prepared: &Prepared,
    input: Value,
    broker: &mut dyn Broker,
) -> Run {
    let start = Instant::now();
    let mut capability_calls = 0;
    let result = (|| -> Result<Outcome> {
        contract.validate()?;
        contract.check_input(&input)?;
        let request = Request::Run {
            prepared: prepared.clone(),
            input,
            limits: contract.limits.clone(),
        };
        let event = exchange(
            executable,
            &request,
            &contract.limits,
            Some(broker),
            &mut capability_calls,
        )?;
        match event {
            Event::Finished { outcome } => {
                contract.check_outcome(&outcome)?;
                Ok(outcome)
            }
            Event::Error { message } => Ok(Outcome::failed("EXECUTION", message)),
            _ => bail!("invalid execution result"),
        }
    })();
    let outcome = match result {
        Ok(v) => v,
        Err(error) => Outcome::failed("RUNTIME", error),
    };
    Run {
        outcome,
        elapsed_ms: start.elapsed().as_millis(),
        capability_calls,
        model_usage: None,
    }
}
