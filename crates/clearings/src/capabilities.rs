use crate::contract::{Contract, Policy, check_json, compile_schema};
use anyhow::{Context, Result, bail, ensure};
use cap_std::{ambient_authority, fs::Dir};
use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::io::Read;
use std::path::{Component, Path};
use std::time::Duration;
use std::sync::Arc;

pub trait Broker {
    fn call(&mut self, name: &str, input: Value, remaining: Duration) -> Result<Value>;
}

pub struct LocalBroker {
    capabilities: Vec<String>,
    roots: BTreeMap<String, Arc<Dir>>,
    max_bytes: usize,
    http: BTreeMap<String, ValidatedHttpBinding>,
    client: Option<reqwest::blocking::Client>,
}

struct ValidatedHttpBinding {
    url: reqwest::Url,
    query_keys: Vec<String>,
    output: jsonschema::Validator,
    bearer_token_env: Option<String>,
}

impl LocalBroker {
    pub fn new(contract: &Contract, policy: &Policy) -> Result<Self> {
        let mut http = BTreeMap::new();
        for (name, binding) in &policy.http {
            ensure!(!name.starts_with("files."), "reserved capability name");
            let url = reqwest::Url::parse(&binding.url)?;
            ensure!(url.host_str().is_some(), "HTTP endpoint requires a host");
            ensure!(
                url.scheme() == "https"
                    || (url.scheme() == "http"
                        && matches!(url.host_str(), Some("127.0.0.1" | "[::1]" | "localhost"))),
                "HTTP bindings require HTTPS except explicit loopback endpoints"
            );
            ensure!(
                url.username().is_empty() && url.password().is_none() && url.fragment().is_none(),
                "credentials and fragments do not belong in the URL"
            );
            http.insert(name.clone(), ValidatedHttpBinding {
                url,
                query_keys: binding.query_keys.clone(),
                output: compile_schema(&binding.output_schema)?,
                bearer_token_env: binding.bearer_token_env.clone(),
            });
        }
        let client = if http.is_empty() { None } else {
            Some(reqwest::blocking::Client::builder()
                .redirect(reqwest::redirect::Policy::none()).build()?)
        };
        let roots = policy
            .roots
            .iter()
            .map(|(name, root)| {
                Ok((
                    name.clone(),
                    Arc::new(Dir::open_ambient_dir(root, ambient_authority())
                        .with_context(|| format!("cannot open granted root {name}"))?),
                ))
            })
            .collect::<Result<_>>()?;
        Ok(Self {
            capabilities: contract.capabilities.clone(),
            roots,
            http,
            client,
            max_bytes: contract.limits.output_bytes,
        })
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FileInput {
    root: String,
    path: String,
}

impl Broker for LocalBroker {
    fn call(&mut self, name: &str, input: Value, remaining: Duration) -> Result<Value> {
        ensure!(
            self.capabilities.iter().any(|c| c == name),
            "capability was not declared: {name}"
        );
        if let Some(binding) = self.http.get(name) {
            let mut url = binding.url.clone();
            let args = input
                .as_object()
                .context("HTTP input must be an object of query strings")?;
            for (key, value) in args {
                ensure!(binding.query_keys.contains(key), "query key is not granted");
                url.query_pairs_mut()
                    .append_pair(key, value.as_str().context("query values must be strings")?);
            }
            let mut request = self.client.as_ref().context("HTTP client unavailable")?
                .get(url).timeout(remaining);
            if let Some(env) = &binding.bearer_token_env {
                request = request.bearer_auth(
                    std::env::var(env).context("configured credential is unavailable")?,
                );
            }
            // Errors deliberately exclude URLs and headers; credentials never enter the worker protocol.
            let response = request
                .send()
                .map_err(|_| anyhow::anyhow!("HTTP request failed"))?;
            ensure!(
                response.status().is_success(),
                "HTTP endpoint returned status {}",
                response.status().as_u16()
            );
            let mut body = Vec::new();
            response
                .take(self.max_bytes as u64 + 1)
                .read_to_end(&mut body)
                .map_err(|_| anyhow::anyhow!("HTTP body read failed"))?;
            ensure!(
                body.len() <= self.max_bytes,
                "HTTP response exceeds byte limit"
            );
            let value: Value = serde_json::from_slice(&body)?;
            check_json(&value)?;
            binding.output.validate(&value).map_err(|e| anyhow::anyhow!("schema mismatch: {e}"))?;
            return Ok(value);
        }
        let args: FileInput = serde_json::from_value(input)?;
        let path = Path::new(&args.path);
        ensure!(
            !path.is_absolute()
                && path
                    .components()
                    .all(|c| matches!(c, Component::Normal(_) | Component::CurDir)),
            "only relative paths within a granted root are allowed"
        );
        let dir = self.roots.get(&args.root).context("root is not granted")?.clone();
        let name = name.to_owned();
        let path = path.to_owned();
        let max_bytes = self.max_bytes;
        crate::file_io::call(remaining, move || match name.as_str() {
            "files.read" => {
                let mut options = cap_std::fs::OpenOptions::new();
                options.read(true);
                #[cfg(unix)]
                {
                    use cap_std::fs::OpenOptionsExt;
                    options.custom_flags(libc::O_NONBLOCK);
                }
                let file = dir.open_with(&path, &options)?;
                ensure!(file.metadata()?.is_file(), "only regular files can be read");
                let mut bytes = Vec::new();
                file.take(max_bytes as u64 + 1)
                    .read_to_end(&mut bytes)?;
                ensure!(bytes.len() <= max_bytes, "file exceeds read limit");
                Ok(json!({"text": String::from_utf8(bytes)?}))
            }
            "files.list" => {
                let mut entries = Vec::new();
                for entry in dir.read_dir(&path)? {
                    ensure!(entries.len() < 1000, "directory exceeds entry limit");
                    let entry = entry?;
                    entries.push(
                        entry
                            .file_name()
                            .into_string()
                            .map_err(|_| anyhow::anyhow!("non-UTF-8 filename"))?,
                    );
                }
                entries.sort();
                let value = json!({"entries": entries});
                ensure!(
                    serde_json::to_vec(&value)?.len() <= max_bytes,
                    "listing exceeds byte limit"
                );
                Ok(value)
            }
            _ => bail!("unsupported capability: {name}"),
        })
    }
}
