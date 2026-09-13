use crate::{
    contract::{ABI, Event, MAX_WIRE_BYTES, Outcome, Request, Validation},
    isolation, transform,
};
use anyhow::{Context as _, Result, bail, ensure};
use rquickjs::{Context, Function, Module, Object, Promise, Runtime};
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use std::io::{BufRead, Write};
use std::time::{Duration, Instant};

pub(crate) fn read_message<T: DeserializeOwned>(reader: &mut impl BufRead) -> Result<T> {
    let mut line = Vec::new();
    loop {
        let buffer = reader.fill_buf()?;
        ensure!(
            !buffer.is_empty(),
            "worker channel closed before a complete message"
        );
        let length = buffer
            .iter()
            .position(|b| *b == b'\n')
            .map_or(buffer.len(), |n| n + 1);
        ensure!(
            line.len() + length <= MAX_WIRE_BYTES,
            "message exceeds protocol byte limit"
        );
        line.extend_from_slice(&buffer[..length]);
        reader.consume(length);
        if line.last() == Some(&b'\n') {
            break;
        }
    }
    Ok(serde_json::from_slice(&line)?)
}

pub(crate) fn write_message(writer: &mut impl Write, value: &impl Serialize) -> Result<()> {
    let bytes = serde_json::to_vec(value)?;
    ensure!(
        bytes.len() < MAX_WIRE_BYTES,
        "message exceeds protocol byte limit"
    );
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
        Err(error) => Event::Error {
            message: format!("{error:#}"),
        },
    };
    write_message(&mut std::io::stdout().lock(), &event)
}

fn work(request: Request) -> Result<Event> {
    match request {
        Request::Prepare { source } => Ok(Event::Prepared {
            prepared: transform::prepare(&source)?,
        }),
        Request::Validate { contract, boundary } => {
            match boundary {
                Validation::Input(value) => {
                    contract.validate()?;
                    contract.check_input(&value)?;
                }
                Validation::Outcome(outcome) => contract.check_outcome(&outcome)?,
            }
            Ok(Event::Validated)
        }
        Request::Run {
            prepared,
            input,
            limits,
        } => {
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
                let object_prototype: Object = ctx.eval("Object.prototype")?;
                let bridge_failed = std::rc::Rc::new(std::cell::Cell::new(false));
                let call = bridge(ctx.clone(), object_prototype.clone(), bridge_failed.clone())?;
                // Capture the bridge and parser before generated code can replace globals.
                let factory: Function = ctx.eval(
                    r#"(bridge => {
                    const parse = JSON.parse;
                    const Failure = Error;
                    return Object.freeze({ call: async (name, input) => {
                        const result = parse(bridge(name, input));
                        if (!result.ok) throw new Failure(result.error);
                        return result.value;
                    }});
                })"#,
                )?;
                let api: Object = factory.call((call,))?;
                ctx.globals().set("clearings", api)?;
                let module = Module::declare(ctx.clone(), "routine.js", prepared.javascript)?;
                let (module, evaluated) = module.eval()?;
                evaluated
                    .finish::<()>()
                    .map_err(|e| anyhow::anyhow!("module evaluation: {e}; {:?}", ctx.catch()))?;
                let function: Function = module
                    .get("default")
                    .context("routine must default-export an async function")?;
                let argument = ctx.json_parse(input.to_string())?;
                let result: Promise = function.call((argument,))?;
                let value: rquickjs::Value = result
                    .finish()
                    .map_err(|e| anyhow::anyhow!("routine execution: {e}; {:?}", ctx.catch()))?;
                let mut bytes = MAX_WIRE_BYTES;
                let value = json_value(value, &object_prototype, 0, &mut bytes)?;
                let encoded = serde_json::to_string(&value)?;
                ensure!(
                    encoded.len() <= limits.output_bytes,
                    "routine output exceeds byte limit"
                );
                let outcome: Outcome = serde_json::from_str(&encoded)?;
                ensure!(
                    !bridge_failed.get() || !matches!(outcome, Outcome::Completed { .. }),
                    "worker bridge failed"
                );
                Ok(outcome)
            })?;
            if runtime.is_job_pending() {
                bail!("routine left unfinished jobs");
            }
            Ok(Event::Finished { outcome })
        }
    }
}

// Convert JSON data directly: JavaScript stringification would turn NaN into null,
// omit undefined fields, and invoke user-defined toJSON hooks.
fn json_value<'js>(
    value: rquickjs::Value<'js>,
    plain: &Object<'js>,
    depth: usize,
    bytes: &mut usize,
) -> Result<Value> {
    ensure!(depth < 128, "JSON nesting limit exceeded");
    ensure!(*bytes > 0, "JSON value exceeds byte limit");
    *bytes -= 1;
    if value.is_null() {
        return Ok(Value::Null);
    }
    if let Some(v) = value.as_bool() {
        return Ok(Value::Bool(v));
    }
    if let Some(v) = value.as_number() {
        ensure!(
            v.is_finite() && v.abs() <= 9_007_199_254_740_991.0,
            "numbers must fit the JavaScript safe range"
        );
        return Ok(if v.fract() == 0.0 {
            json!(v as i64)
        } else {
            json!(v)
        });
    }
    if let Some(v) = value.as_string() {
        let v = v.to_string()?;
        ensure!(v.len() <= *bytes, "JSON value exceeds byte limit");
        *bytes -= v.len();
        return Ok(Value::String(v));
    }
    if let Some(array) = value.as_array() {
        ensure!(array.len() <= *bytes, "JSON array exceeds byte limit");
        let mut values = Vec::new();
        for v in array.iter::<rquickjs::Value>() {
            values.push(json_value(v?, plain, depth + 1, bytes)?);
        }
        return Ok(Value::Array(values));
    }
    if let Some(object) = value.as_object() {
        ensure!(
            object.get_prototype().is_none_or(|p| p == *plain),
            "only plain JSON objects are supported"
        );
        let mut values = serde_json::Map::new();
        for property in object.props::<String, rquickjs::Value>() {
            let (key, v) = property?;
            ensure!(key.len() <= *bytes, "JSON object exceeds byte limit");
            *bytes -= key.len();
            values.insert(key, json_value(v, plain, depth + 1, bytes)?);
        }
        return Ok(Value::Object(values));
    }
    bail!("unsupported non-JSON value")
}

fn bridge<'js>(ctx: rquickjs::Ctx<'js>, input_prototype: Object<'js>, failed: std::rc::Rc<std::cell::Cell<bool>>) -> Result<Function<'js>> {
Ok(Function::new(
                    ctx,
                    move |name: rquickjs::Value<'js>, input: rquickjs::Value<'js>| -> String {
                        let event = (|| -> Result<Event> {
                            let name = name
                                .as_string()
                                .context("capability name must be a string")?
                                .to_string()?;
                            let mut bytes = MAX_WIRE_BYTES;
                            let input = json_value(input, &input_prototype, 0, &mut bytes)?;
                            Ok(Event::Call { name, input })
                        })();
                        let event = event.unwrap_or_else(|e| Event::CallError {
                            message: e.to_string(),
                        });
                        let result = (|| -> Result<Value> {
                            write_message(&mut std::io::stdout().lock(), &event)?;
                            read_message(&mut std::io::stdin().lock())
                        })();
                        match result {
                            Ok(v) => v.to_string(),
                            Err(e) => {
                                failed.set(true);
                                json!({"ok":false,"error":e.to_string()}).to_string()
                            }
                        }
                    },
                )?)
}
