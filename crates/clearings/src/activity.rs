//! Incremental, project-filtered JSONL imports with explicit usage provenance.
use crate::{
    contract::Contract,
    project::{Project, TraceSource},
    store::{Case, Store, Task, digest},
};
use anyhow::{Context, Result, ensure};
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    fs::{File, OpenOptions},
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
};

const IMPORT_BYTES: usize = 1024 * 1024;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Observation {
    pub contract: Contract,
    pub case: Case,
}
impl Observation {
    pub fn validate(&self) -> Result<()> {
        let task = Task {
            evidence: None,
            project: None,
            evaluation: Default::default(),
            contract: self.contract.clone(),
            cases: vec![self.case.clone()],
        };
        task.validate()
    }
}
#[derive(Default, Clone, Serialize, Deserialize)]
struct Checkpoint {
    offset: u64,
    prefix: String,
    prefix_len: usize,
    session: String,
    cwd: String,
}

fn files(source: &TraceSource) -> Result<Vec<PathBuf>> {
    fn visit(path: &Path, depth: usize, out: &mut Vec<PathBuf>) -> Result<()> {
        ensure!(
            depth <= 6 && out.len() < 256,
            "trace selection exceeds directory or file limit; select a narrower source"
        );
        let meta = std::fs::symlink_metadata(path)?;
        if meta.file_type().is_symlink() {
            return Ok(());
        }
        if meta.is_file() {
            if path.extension().is_some_and(|e| e == "jsonl") {
                out.push(path.to_owned());
            }
        } else if meta.is_dir() {
            let mut children = std::fs::read_dir(path)?
                .take(257)
                .map(|r| r.map(|e| e.path()))
                .collect::<std::io::Result<Vec<_>>>()?;
            ensure!(children.len() <= 256, "trace directory exceeds entry limit");
            children.sort();
            for child in children {
                visit(&child, depth + 1, out)?;
            }
        }
        Ok(())
    }
    let mut out = vec![];
    visit(&source.path, 0, &mut out)?;
    Ok(out)
}
fn open(path: &Path) -> Result<File> {
    let mut opts = OpenOptions::new();
    opts.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.custom_flags(libc::O_NONBLOCK | libc::O_NOFOLLOW);
    }
    let file = opts.open(path)?;
    ensure!(file.metadata()?.is_file(), "trace must be a regular file");
    Ok(file)
}
fn prefix(file: &mut File, len: usize) -> Result<String> {
    file.seek(SeekFrom::Start(0))?;
    let mut bytes = vec![];
    file.take(len as u64).read_to_end(&mut bytes)?;
    digest(&bytes)
}
fn usage(adapter: &str, value: &Value) -> Option<Value> {
    let (raw, cumulative) = if adapter == "codex"
        && value["type"] == "event_msg"
        && value["payload"]["type"] == "token_count"
    {
        (&value["payload"]["info"]["total_token_usage"], true)
    } else if adapter == "claude" {
        if value["type"] == "result" {
            (&value["usage"], true)
        } else {
            (&value["message"]["usage"], false)
        }
    } else {
        (&value["usage"], false)
    };
    let input = raw["input_tokens"].as_u64()?;
    let output = raw["output_tokens"].as_u64()?;
    if input > 1_000_000_000 || output > 1_000_000_000 {
        return None;
    }
    Some(
        json!({"input_tokens":input,"output_tokens":output,"cached_input_tokens":raw.get("cached_input_tokens").or_else(|| raw.get("cache_read_input_tokens")),"cache_creation_input_tokens":raw.get("cache_creation_input_tokens"),"reasoning_output_tokens":raw.get("reasoning_output_tokens"),"cumulative":cumulative,"provenance":"host_reported","adapter":adapter,"reported_cost_usd":value.get("total_cost_usd"),"reported_cost_kind":if value.get("total_cost_usd").is_some(){Some("client_estimate")}else{None},"model_breakdown":value.get("modelUsage")}),
    )
}
impl Store {
    pub fn observe(&mut self, project_id: &str) -> Result<Value> {
        let project = self.project(project_id)?;
        let mut imported = 0;
        let mut errors = vec![];
        let mut remaining = 8 * IMPORT_BYTES;
        for source in &project.settings.trace_sources {
            match files(source) {
                Ok(paths) => {
                    for path in paths {
                        if remaining == 0 {
                            break;
                        }
                        match self.import_file(&project, source, &path, &mut remaining) {
                            Ok(n) => imported += n,
                            Err(e) => {
                                if errors.len() < 32 {
                                    errors.push(json!({"source":path,"error":e.to_string()}));
                                }
                            }
                        }
                    }
                }
                Err(e) => errors.push(json!({"source":source.path,"error":e.to_string()})),
            }
        }
        Ok(json!({"imported":imported,"errors":errors,"bytes_remaining":remaining}))
    }
    fn import_file(
        &mut self,
        project: &Project,
        source: &TraceSource,
        path: &Path,
        remaining: &mut usize,
    ) -> Result<usize> {
        let key = path.to_str().context("trace path is not UTF-8")?;
        ensure!(
            path.canonicalize()?.starts_with(&source.path),
            "trace moved outside selected source"
        );
        let mut file = open(path)?;
        let stored: Option<String> = self
            .db
            .query_row(
                "SELECT body FROM trace_checkpoints WHERE project=?1 AND path=?2",
                params![project.id, key],
                |r| r.get(0),
            )
            .optional()?;
        let mut cp: Checkpoint = stored
            .map(|s| serde_json::from_str(&s))
            .transpose()?
            .unwrap_or_default();
        if file.metadata()?.len() < cp.offset
            || (!cp.prefix.is_empty() && prefix(&mut file, cp.prefix_len)? != cp.prefix)
        {
            cp = Checkpoint::default();
        }
        file.seek(SeekFrom::Start(cp.offset))?;
        let mut bytes = vec![];
        let budget = IMPORT_BYTES.min(*remaining);
        (&mut file).take(budget as u64).read_to_end(&mut bytes)?;
        *remaining -= bytes.len();
        let Some(last) = bytes.iter().rposition(|b| *b == b'\n') else {
            ensure!(bytes.len() < budget, "trace line exceeds import limit");
            return Ok(0);
        };
        let mut events = vec![];
        for line in bytes[..=last]
            .split(|b| *b == b'\n')
            .filter(|l| !l.is_empty())
        {
            let value: Value = serde_json::from_slice(line)
                .context("malformed complete trace line; repair it before retrying")?;
            if value["type"] == "thread.started" {
                cp.session = value["thread_id"].as_str().unwrap_or_default().into();
            }
            if value["type"] == "session_meta" {
                cp.session = value["payload"]["id"].as_str().unwrap_or_default().into();
                cp.cwd = value["payload"]["cwd"].as_str().unwrap_or_default().into();
            }
            if let Some(s) = value["sessionId"]
                .as_str()
                .or_else(|| value["session_id"].as_str())
            {
                cp.session = s.into();
            }
            if let Some(s) = value["cwd"].as_str() {
                cp.cwd = s.into();
            }
            if cp.session.is_empty()
                || cp.cwd.is_empty()
                || Path::new(&cp.cwd).canonicalize().ok().as_ref() != Some(&project.root)
            {
                continue;
            }
            let observation = if value["type"] == "clearings_workflow" {
                let o: Observation = serde_json::from_value(value["observation"].clone())?;
                o.validate()?;
                if project.settings.excludes(&o.contract.name) {
                    None
                } else {
                    Some(o)
                }
            } else {
                None
            };
            let usage = usage(&source.adapter, &value);
            if observation.is_none() && usage.is_none() {
                continue;
            }
            let event_key = if source.adapter == "claude" {
                value["message"]["id"]
                    .as_str()
                    .or_else(|| value["uuid"].as_str())
            } else {
                value["uuid"]
                    .as_str()
                    .or_else(|| value["event_id"].as_str())
            }
            .map(str::to_owned)
            .unwrap_or(digest(&value)?);
            let id = digest(&(source.adapter.as_str(), &cp.session, event_key))?;
            let body = json!({"session":cp.session,"adapter":source.adapter,"observation":observation,"usage":usage,"provenance":"selected_session_record"});
            ensure!(
                serde_json::to_vec(&body)?.len() <= IMPORT_BYTES,
                "normalized event exceeds byte limit"
            );
            events.push((id, body));
        }
        cp.offset += last as u64 + 1;
        cp.prefix_len = (cp.offset as usize).min(4096);
        cp.prefix = prefix(&mut file, cp.prefix_len)?;
        let tx = self
            .db
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let mut inserted = 0;
        for (id, body) in events {
            inserted += tx.execute(
                "INSERT OR IGNORE INTO activity(project,id,body) VALUES(?1,?2,?3)",
                params![project.id, id, body.to_string()],
            )?;
        }
        tx.execute("INSERT INTO trace_checkpoints(project,path,body) VALUES(?1,?2,?3) ON CONFLICT(project,path) DO UPDATE SET body=excluded.body",params![project.id,key,serde_json::to_string(&cp)?])?;
        tx.commit()?;
        Ok(inserted)
    }
    pub fn activity(&self, project: &str, before: Option<i64>) -> Result<Value> {
        let mut stmt=self.db.prepare("SELECT seq,id,body,created_at FROM activity WHERE project=?1 AND (?2 IS NULL OR seq<?2) ORDER BY seq DESC LIMIT 101")?;
        let mut rows = stmt.query(params![project, before])?;
        let mut values = vec![];
        let mut size = 0;
        let mut more = false;
        while let Some(r) = rows.next()? {
            let body: String = r.get(2)?;
            if values.len() == 100 || size + body.len() > IMPORT_BYTES {
                more = true;
                break;
            }
            size += body.len();
            values.push(json!({"seq":r.get::<_,i64>(0)?,"id":r.get::<_,String>(1)?,"event":serde_json::from_str::<Value>(&body)?,"created_at":r.get::<_,String>(3)?}));
        }
        Ok(
            json!({"events":values,"next_before":if more { values.last().map(|v|v["seq"].clone()) } else {None}}),
        )
    }
    pub fn performance(&self, project: &str, name: &str) -> Result<Value> {
        let task = self.named_task(project, name, false)?;
        let mut stmt=self.db.prepare("SELECT runs.version, count(*), SUM(CASE WHEN json_extract(report,'$.outcome.status')='completed' THEN 1 ELSE 0 END), SUM(json_extract(report,'$.elapsed_ms')), SUM(json_extract(report,'$.capability_calls')) FROM runs JOIN objects ON objects.id=runs.version WHERE json_extract(objects.body,'$.task')=?1 GROUP BY runs.version ORDER BY runs.version LIMIT 100")?;
        let versions:Vec<Value>=stmt.query_map([task],|r|Ok(json!({"version":r.get::<_,String>(0)?,"runs":r.get::<_,u64>(1)?,"completed":r.get::<_,u64>(2)?,"elapsed_ms_total":r.get::<_,u64>(3)?,"capability_calls_total":r.get::<_,u64>(4)?,"model_usage":null,"savings":null})))?.collect::<rusqlite::Result<_>>()?;
        Ok(
            json!({"name":name,"versions":versions,"usage_attribution":"Session usage is not automatically attributable to a routine invocation."}),
        )
    }
}
