//! Bounded, sequential MCP stdio transport. No model calls or configuration writes.
use crate::{
    api::{Api, Operation, failed},
    worker::{read_message, write_message},
};
use anyhow::Result;
use serde_json::{Value, json};
use std::io::{BufRead, BufReader};
const PROTOCOL: &str = "2025-06-18";
fn error(id: Value, code: i32, message: &str) -> Value {
    json!({"jsonrpc":"2.0","id":id,"error":{"code":code,"message":message}})
}
fn tool(
    name: &str,
    description: &str,
    properties: Value,
    required: Value,
    read_only: bool,
) -> Value {
    json!({"name":format!("clearings_{name}"),"description":description,"inputSchema":{"type":"object","properties":properties,"required":required,"additionalProperties":false},"annotations":{"readOnlyHint":read_only,"destructiveHint":false,"openWorldHint":name=="run"}})
}
pub fn tools() -> Value {
    let id = json!({"type":"string","pattern":"^[a-f0-9]{64}$"});
    json!({"tools":[
        tool("list","List user-defined tasks and their active versions.",json!({}),json!([]),true),
        tool("inspect","Inspect a task or version, source and recorded evaluation.",json!({"id":id}),json!(["id"]),true),
        tool("sdk","Read the bundled TypeScript interface and a task document example before authoring.",json!({}),json!([]),true),
        tool("prepare_task","Record requirements and independent acceptance cases before writing source. task contains contract and cases; use sdk for its shape.",json!({"task":{"type":"object","required":["contract","cases"],"properties":{"contract":{"type":"object"},"cases":{"type":"array","minItems":1,"maxItems":100}},"additionalProperties":false}}),json!(["task"]),false),
        tool("submit","Prepare a candidate for an existing task. Does not change requirements or activate it.",json!({"task":id,"source":{"type":"string","maxLength":262144}}),json!(["task","source"]),false),
        tool("evaluate","Evaluate a candidate against the task's recorded fixture cases, without live grants.",json!({"version":id}),json!(["version"]),false),
        tool("activate","Activate a passing candidate after reviewing its scope. Supply null for first activation or the previous active version to replace it.",json!({"version":id,"expected_active":{"type":["string","null"]}}),json!(["version","expected_active"]),false),
        tool("deactivate","Stop reusing the currently active version; preserve its source and history.",json!({"task":id,"expected_active":id}),json!(["task","expected_active"]),false),
        tool("run","Execute the active routine on fresh input using this server's fixed grants. needs_agent and not_applicable return control to you.",json!({"task":id,"input":{}}),json!(["task","input"]),false),
        tool("runs","Inspect the last 100 local execution records. Unknown model usage is not zero.",json!({}),json!([]),true)
    ]})
}

pub fn serve(mut api: Api) -> Result<()> {
    let mut input = BufReader::new(std::io::stdin().lock());
    let mut output = std::io::stdout().lock();
    let mut initialized = false;
    let mut ready = false;
    while !input.fill_buf()?.is_empty() {
        let message: Value = match read_message(&mut input) {
            Ok(v) => v,
            Err(e) => {
                write_message(
                    &mut output,
                    &error(Value::Null, -32700, "Invalid or oversized JSON message"),
                )?;
                return Err(e);
            }
        };
        if !message.is_object() || message["jsonrpc"] != "2.0" || !message["method"].is_string() {
            write_message(
                &mut output,
                &error(Value::Null, -32600, "Invalid JSON-RPC request"),
            )?;
            continue;
        }
        let method = message["method"].as_str().unwrap();
        if message.get("id").is_none() {
            if initialized && method == "notifications/initialized" {
                ready = true;
            }
            continue;
        }
        let id = message["id"].clone();
        if !id.is_string() && !id.is_i64() && !id.is_u64() {
            write_message(
                &mut output,
                &error(Value::Null, -32600, "Invalid request ID"),
            )?;
            continue;
        }
        let result = match method {
            "ping" => Ok(json!({})),
            "initialize" if !initialized => {
                if !message["params"]["protocolVersion"].is_string()
                    || !message["params"]["capabilities"].is_object()
                    || !message["params"]["clientInfo"].is_object()
                {
                    Err((
                        -32602,
                        "Initialization requires protocolVersion, capabilities and clientInfo",
                    ))
                } else {
                    initialized = true;
                    Ok(
                        json!({"protocolVersion":PROTOCOL,"capabilities":{"tools":{"listChanged":false}},"serverInfo":{"name":"clearings","version":env!("CARGO_PKG_VERSION")},"instructions":"Use sdk before authoring. Record user-selected task criteria, submit, evaluate, then explicitly activate. Handoffs require your judgment; never silently broaden grants."}),
                    )
                }
            }
            _ if !ready => Err((-32002, "Initialize this connection first")),
            "tools/list" => Ok(tools()),
            "tools/call" => {
                let name = message["params"]["name"].as_str().unwrap_or("");
                let known = tools()["tools"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|t| t["name"] == name);
                if !known {
                    Err((-32602, "Unknown tool"))
                } else {
                    let mut args = message["params"]
                        .get("arguments")
                        .cloned()
                        .unwrap_or(json!({}));
                    let operation = if let Some(object) = args.as_object_mut() {
                        if object.contains_key("action") {
                            Err(anyhow::anyhow!("action is not a tool argument"))
                        } else {
                            object.insert(
                                "action".into(),
                                json!(name.trim_start_matches("clearings_")),
                            );
                            serde_json::from_value::<Operation>(args).map_err(Into::into)
                        }
                    } else {
                        Err(anyhow::anyhow!("arguments must be an object"))
                    };
                    let schema = tools()["tools"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .find(|t| t["name"] == name)
                        .unwrap()["inputSchema"]
                        .clone();
                    let original_args = message["params"]
                        .get("arguments")
                        .cloned()
                        .unwrap_or(json!({}));
                    let called = crate::contract::validate_schema(&schema, &original_args)
                        .and(operation)
                        .and_then(|op| api.call(op));
                    let (value, is_error) = match called {
                        Ok(v) => {
                            let e = failed(&v);
                            (v, e)
                        }
                        Err(e) => (json!({"error":e.to_string()}), true),
                    };
                    Ok(
                        json!({"content":[{"type":"text","text":serde_json::to_string(&value)?}],"structuredContent":value,"isError":is_error}),
                    )
                }
            }
            _ => Err((-32601, "Method not found")),
        };
        let response = match result {
            Ok(result) => json!({"jsonrpc":"2.0","id":id,"result":result}),
            Err((code, message)) => error(id, code, message),
        };
        // Oversized inspection results become an explicit tool error, never a partial message.
        if serde_json::to_vec(&response)?.len() > crate::contract::MAX_WIRE_BYTES {
            write_message(
                &mut output,
                &error(
                    response["id"].clone(),
                    -32000,
                    "Response exceeds transport limit; inspect through the CLI",
                ),
            )?;
        } else {
            write_message(&mut output, &response)?;
        }
    }
    Ok(())
}
