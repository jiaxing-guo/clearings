use crate::{contract::{ABI, Event, MAX_WIRE_BYTES, Outcome, Request}, isolation, transform};
use anyhow::{Context as _, Result, bail, ensure};
use rquickjs::{Context, Function, Module, Promise, Runtime};
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::{Value, json};
use std::io::{BufRead, Write};
use std::time::{Duration, Instant};

pub(crate) fn read_message<T: DeserializeOwned>(reader: &mut impl BufRead) -> Result<T> {
    let mut line = Vec::new();
    loop {
        let buffer = reader.fill_buf()?;
        ensure!(!buffer.is_empty(), "worker channel closed before a complete message");
        let length = buffer.iter().position(|b| *b == b'\n').map_or(buffer.len(), |n| n + 1);
        ensure!(line.len() + length <= MAX_WIRE_BYTES, "message exceeds protocol byte limit");
        line.extend_from_slice(&buffer[..length]);
        reader.consume(length);
        if line.last() == Some(&b'\n') { break; }
    }
    Ok(serde_json::from_slice(&line)?)
}

pub(crate) fn write_message(writer: &mut impl Write, value: &impl Serialize) -> Result<()> {
    let bytes = serde_json::to_vec(value)?;
    ensure!(bytes.len() < MAX_WIRE_BYTES, "message exceeds protocol byte limit");
    writer.write_all(&bytes)?;
    writer.write_all(b"\n")?;
    writer.flush()?;
    Ok(())
}

pub fn worker_main() -> Result<()> {
    isolation::enter()?;
    let request: Request = read_message(&mut std::io::stdin().lock())?;
    let event = match work(request) {
        Ok(event) => event,
        Err(error) => Event::Error { message: format!("{error:#}") },
    };
    write_message(&mut std::io::stdout().lock(), &event)
}

fn work(request: Request) -> Result<Event> {
    match request {
        Request::Prepare { source } => Ok(Event::Prepared { prepared: transform::prepare(&source)? }),
        Request::Run { prepared, input, limits } => {
            ensure!(prepared.abi == ABI, "unsupported prepared routine ABI");
            limits.validate()?;
            let runtime = Runtime::new()?;
            runtime.set_memory_limit(limits.heap_bytes);
            runtime.set_max_stack_size(512 * 1024);
            let deadline = Instant::now() + Duration::from_millis(limits.wall_ms);
            runtime.set_interrupt_handler(Some(Box::new(move || Instant::now() >= deadline)));
            let context = Context::full(&runtime)?;
            let outcome = context.with(|ctx| -> Result<Outcome> {
                // The engine has no module loader and no OS/Node bindings. This one bridge
                // crosses to the parent, which independently applies actual grants.
                let call = Function::new(ctx.clone(), |request: String| -> String {
                    let result = (|| -> Result<Value> {
                        let v: Value = serde_json::from_str(&request)?;
                        let name = v.get("name").and_then(Value::as_str).context("missing capability name")?;
                        let input = v.get("input").cloned().context("missing capability input")?;
                        write_message(&mut std::io::stdout().lock(), &Event::Call { name: name.into(), input })?;
                        read_message(&mut std::io::stdin().lock())
                    })();
                    match result {
                        Ok(v) => v.to_string(),
                        Err(e) => json!({"ok":false,"error":e.to_string()}).to_string(),
                    }
                })?;
                ctx.globals().set("__clearingsBridge", call)?;
                ctx.eval::<(), _>(r#"
                    globalThis.clearings = Object.freeze({
                        call: async (name, input) => {
                            const result = JSON.parse(__clearingsBridge(JSON.stringify({name, input})));
                            if (!result.ok) throw new Error(result.error);
                            return result.value;
                        }
                    });
                "#)?;
                let module = Module::declare(ctx.clone(), "routine.js", prepared.javascript)?;
                let (module, evaluated) = module.eval()?;
                evaluated.finish::<()>().map_err(|e| anyhow::anyhow!("module evaluation: {e}; {:?}", ctx.catch()))?;
                let function: Function = module.get("default").context("routine must default-export an async function")?;
                let argument = ctx.json_parse(input.to_string())?;
                let result: Promise = function.call((argument,))?;
                let value: rquickjs::Value = result.finish().map_err(|e| anyhow::anyhow!("routine execution: {e}; {:?}", ctx.catch()))?;
                let encoded = ctx.json_stringify(value)?.context("routine returned a non-JSON value")?.to_string()?;
                ensure!(encoded.len() <= limits.output_bytes, "routine output exceeds byte limit");
                Ok(serde_json::from_str(&encoded)?)
            })?;
            if runtime.is_job_pending() { bail!("routine left unfinished jobs"); }
            Ok(Event::Finished { outcome })
        }
    }
}

