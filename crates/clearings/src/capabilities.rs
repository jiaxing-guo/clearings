use crate::contract::{Contract, Policy};
use anyhow::{Context, Result, bail, ensure};
use cap_std::{ambient_authority, fs::Dir};
use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::io::Read;
use std::path::{Component, Path};
use std::time::Duration;

pub trait Broker {
    fn call(&mut self, name: &str, input: Value, remaining: Duration) -> Result<Value>;
}

pub struct LocalBroker {
    capabilities: Vec<String>,
    roots: BTreeMap<String, Dir>,
    max_bytes: usize,
}

impl LocalBroker {
    pub fn new(contract: &Contract, policy: &Policy) -> Result<Self> {
        let roots = policy
            .roots
            .iter()
            .map(|(name, root)| {
                Ok((
                    name.clone(),
                    Dir::open_ambient_dir(root, ambient_authority())
                        .with_context(|| format!("cannot open granted root {name}"))?,
                ))
            })
            .collect::<Result<_>>()?;
        Ok(Self {
            capabilities: contract.capabilities.clone(),
            roots,
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
    fn call(&mut self, name: &str, input: Value, _remaining: Duration) -> Result<Value> {
        ensure!(
            self.capabilities.iter().any(|c| c == name),
            "capability was not declared: {name}"
        );
        let args: FileInput = serde_json::from_value(input)?;
        let path = Path::new(&args.path);
        ensure!(
            !path.is_absolute()
                && path
                    .components()
                    .all(|c| matches!(c, Component::Normal(_) | Component::CurDir)),
            "only relative paths within a granted root are allowed"
        );
        let dir = self.roots.get(&args.root).context("root is not granted")?;
        match name {
            "files.read" => {
                let mut options = cap_std::fs::OpenOptions::new();
                options.read(true);
                #[cfg(unix)]
                {
                    use cap_std::fs::OpenOptionsExt;
                    options.custom_flags(libc::O_NONBLOCK);
                }
                let file = dir.open_with(path, &options)?;
                ensure!(file.metadata()?.is_file(), "only regular files can be read");
                let mut bytes = Vec::new();
                file.take(self.max_bytes as u64 + 1)
                    .read_to_end(&mut bytes)?;
                ensure!(bytes.len() <= self.max_bytes, "file exceeds read limit");
                Ok(json!({"text": String::from_utf8(bytes)?}))
            }
            "files.list" => {
                let mut entries = Vec::new();
                for entry in dir.read_dir(path)? {
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
                    serde_json::to_vec(&value)?.len() <= self.max_bytes,
                    "listing exceeds byte limit"
                );
                Ok(value)
            }
            _ => bail!("unsupported capability: {name}"),
        }
    }
}
