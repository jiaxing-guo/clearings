//! The background model proposes source as data; only the isolated runtime executes it.
use crate::store::Store;
use anyhow::{Context, Result, ensure};
use rusqlite::params;
use serde_json::{Value, json};
use std::{io::Read, time::Duration};
#[derive(Debug)]
pub(crate) struct RequestTooLarge;
impl std::fmt::Display for RequestTooLarge {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("model request exceeds byte limit")
    }
}
impl std::error::Error for RequestTooLarge {}

#[derive(Debug)]
pub(crate) struct ClientUnavailable;
impl std::fmt::Display for ClientUnavailable {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("coding client is signed out; sign in through its normal interface")
    }
}
impl std::error::Error for ClientUnavailable {}

impl Store {
    pub(crate) fn propose_source(
        &mut self,
        project: &str,
        job: i64,
        purpose: &str,
        packet: Value,
        learning_group: Option<&str>,
    ) -> Result<String> {
        self.check_job(project, job)?;
        let connection = self
            .project(project)?
            .settings
            .model
            .context("no background model configured")?;
        let prompt = json!({"model":connection.model,"messages":[
            {"role":"system","content":crate::prompts::CONFIGURED_AUTHORING},
            {"role":"user","content":json!({"sdk":include_str!("../../../sdk/clearings.d.ts"),"packet":packet}).to_string()}
        ],"max_tokens":connection.max_output_tokens,"response_format":{"type":"json_object"}});
        let bytes = serde_json::to_vec(&prompt)?;
        ensure!(bytes.len() <= 512 * 1024, RequestTooLarge);
        // One token per UTF-8 byte plus framing is a conservative local bound, not a tokenizer measurement.
        let amount = ((bytes.len() as u64 + 2048) * connection.input_price
            + u64::from(connection.max_output_tokens) * connection.output_price)
            .div_ceil(1_000_000);
        let request_id =
            self.reserve_request_with_group(project, job, purpose, amount.max(1), learning_group)?;
        let result = (|| -> Result<(String, Option<Value>)> {
            let client = reqwest::blocking::Client::builder()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .connect_timeout(Duration::from_secs(5))
                .timeout(Duration::from_secs(30))
                .build()?;
            let mut request = client
                .post(&connection.url)
                .header("Content-Type", "application/json")
                .body(bytes);
            if let Some(env) = &connection.bearer_token_env {
                request = request.bearer_auth(
                    std::env::var(env).context("configured model credential is unavailable")?,
                );
            }
            self.check_job(project, job)?;
            let response = request
                .send()
                .map_err(|_| anyhow::anyhow!("model request failed"))?;
            ensure!(
                response.status().is_success(),
                "model endpoint returned status {}",
                response.status().as_u16()
            );
            let mut body = vec![];
            response
                .take(512 * 1024 + 1)
                .read_to_end(&mut body)
                .context("model response read failed")?;
            ensure!(
                body.len() <= 512 * 1024,
                "model response exceeds byte limit"
            );
            let value: Value =
                serde_json::from_slice(&body).context("model response is not JSON")?;
            if let Some(usage) = value.get("usage").filter(|v| v.is_object()) {
                self.db.execute("UPDATE model_requests SET usage=?2 WHERE id=?1",params![request_id,json!({"provenance":"provider_reported","model":connection.model,"usage":usage}).to_string()])?;
            }
            let content = value["choices"][0]["message"]["content"]
                .as_str()
                .context("model response lacks source content")?;
            let proposed: Value = serde_json::from_str(content)
                .context("model source proposal is not a JSON object")?;
            ensure!(
                proposed.as_object().is_some_and(|o| o.len() == 1),
                "proposal must contain only source"
            );
            let source = proposed["source"]
                .as_str()
                .context("proposal lacks source")?
                .to_owned();
            crate::contract::require_source(&source)?;
            let usage = value.get("usage").filter(|u| u.is_object()).cloned();
            Ok((source, usage))
        })();
        match result {
            Ok((source, usage)) => {
                self.db.execute("UPDATE model_requests SET status='completed',usage=?2 WHERE id=?1",params![request_id,usage.map(|u|json!({"provenance":"provider_reported","model":connection.model,"usage":u}).to_string())])?;
                self.check_job(project, job)?;
                Ok(source)
            }
            Err(e) => {
                self.db.execute(
                    "UPDATE model_requests SET status='failed' WHERE id=?1",
                    [request_id],
                )?;
                Err(e)
            }
        }
    }
}

/// Author JSON through an already installed coding client. No new credentials or provider fallback.
pub(crate) fn author_client(
    client: crate::conversations::Client,
    prompt: Value,
    field: &str,
    model: Option<&str>,
) -> Result<(Value, Option<Value>)> {
    use crate::{
        client_process::{self, JsonProcess},
        conversations::Client,
    };
    use std::process::Command;
    let directory = tempfile::tempdir()?;
    let schema = json!({"type":"object","properties":{field:{"type":"string"}},"required":[field],"additionalProperties":false});
    let mut command = Command::new(client_process::executable(client.name())?);
    command.current_dir(directory.path());
    match client {
        Client::Codex => {
            let path = directory.path().join("response-schema.json");
            std::fs::write(&path, serde_json::to_vec(&schema)?)?;
            command
                .args([
                    "exec",
                    "--ignore-user-config",
                    "--ephemeral",
                    "--json",
                    "--skip-git-repo-check",
                    "-s",
                    "read-only",
                    "--output-schema",
                ])
                .arg(path);
            for feature in [
                "hooks",
                "plugins",
                "apps",
                "shell_tool",
                "multi_agent",
                "computer_use",
                "browser_use",
                "image_generation",
                "in_app_browser",
                "code_mode_host",
                "view_image",
            ] {
                command.args(["--disable", feature]);
            }
            command.args([
                "--enable",
                "skip_host_skill_discovery",
                "-c",
                "web_search=\"disabled\"",
                "-",
            ]);
        }
        Client::Claude => {
            command
                .args([
                    "-p",
                    "--output-format",
                    "stream-json",
                    "--verbose",
                    "--json-schema",
                ])
                .arg(schema.to_string());
            command.args([
                "--tools",
                "",
                "--strict-mcp-config",
                "--mcp-config",
                "{\"mcpServers\":{}}",
                "--settings",
                "{\"disableAllHooks\":true}",
                "--disable-slash-commands",
                "--no-session-persistence",
                "--permission-mode",
                "dontAsk",
                "--max-budget-usd",
                "0.25",
            ]);
        }
    }
    if let Some(model) = model {
        command.args(["--model", model]);
    }
    let process = JsonProcess::start(&mut command, Duration::from_secs(90))?;
    process.finish_text(crate::prompts::client_request(&prompt))?;
    let mut output = None;
    loop {
        let event = process.receive()?;
        if event["type"] == "item.completed" && event["item"]["type"] == "agent_message" {
            output = event["item"]["text"].as_str().map(str::to_owned);
        }
        ensure!(
            !(event["type"] == "item.started"
                && event["item"]["type"] != "agent_message"
                && event["item"]["type"] != "reasoning"),
            "authoring client attempted a tool operation"
        );
        if event["type"] == "turn.completed" {
            let value: Value = serde_json::from_str(
                output
                    .as_deref()
                    .context("client did not return a final answer")?,
            )?;
            ensure!(
                value[field].is_string(),
                "client output does not match requested schema"
            );
            return Ok((value, event.get("usage").cloned()));
        }
        if event["type"] == "result" {
            if event["is_error"] == true
                && event["result"]
                    .as_str()
                    .is_some_and(|s| s.contains("Not logged in"))
            {
                anyhow::bail!(ClientUnavailable);
            }
            ensure!(
                event["is_error"] != true,
                "Claude authoring failed: {}",
                event["result"]
            );
            let value = event
                .get("structured_output")
                .cloned()
                .or_else(|| {
                    event["result"]
                        .as_str()
                        .and_then(|s| serde_json::from_str(s).ok())
                })
                .context("Claude did not return structured output")?;
            ensure!(
                value[field].is_string(),
                "client output does not match requested schema"
            );
            return Ok((value, event.get("usage").cloned()));
        }
        if matches!(event["type"].as_str(), Some("error" | "turn.failed"))
            && event.to_string().to_lowercase().contains("not logged in")
        {
            anyhow::bail!(ClientUnavailable);
        }
        ensure!(
            !matches!(event["type"].as_str(), Some("error" | "turn.failed")),
            "client authoring failed: {}",
            event
        );
    }
}

pub(crate) fn configured_request(
    connection: &crate::project::ModelConnection,
    packet: &Value,
    field: &str,
) -> Result<Vec<u8>> {
    let prompt = json!({"model":connection.model,"messages":[{"role":"system","content":crate::prompts::configured_response(field)},{"role":"user","content":packet.to_string()}],"max_tokens":connection.max_output_tokens,"response_format":{"type":"json_object"}});
    let bytes = serde_json::to_vec(&prompt)?;
    if bytes.len() > 512 * 1024 {
        anyhow::bail!(RequestTooLarge);
    }
    Ok(bytes)
}
pub(crate) fn author_configured(
    connection: &crate::project::ModelConnection,
    bytes: Vec<u8>,
    field: &str,
) -> Result<(Value, Option<Value>)> {
    let client = reqwest::blocking::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(30))
        .build()?;
    let mut request = client
        .post(&connection.url)
        .header("Content-Type", "application/json")
        .body(bytes);
    if let Some(name) = &connection.bearer_token_env {
        request = request
            .bearer_auth(std::env::var(name).context("configured credential is unavailable")?);
    }
    let response = request
        .send()
        .context("configured authoring request failed")?;
    ensure!(
        response.status().is_success(),
        "configured authoring returned status {}",
        response.status()
    );
    let mut body = vec![];
    response.take(512 * 1024 + 1).read_to_end(&mut body)?;
    ensure!(
        body.len() <= 512 * 1024,
        "configured response exceeds limit"
    );
    let response: Value = serde_json::from_slice(&body)?;
    let value: Value = serde_json::from_str(
        response["choices"][0]["message"]["content"]
            .as_str()
            .context("configured model lacks output")?,
    )?;
    ensure!(
        value[field].is_string(),
        "configured model output has the wrong shape"
    );
    Ok((value, response.get("usage").cloned()))
}
