//! Incremental, project-filtered JSONL imports with explicit usage provenance.
use crate::{
    contract::Contract,
    project::{Project, TraceSource},
    store::{Case, Store, digest},
};
use anyhow::{Context, Result, ensure};
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    fs::File,
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
        let (input_schema, output_schema) = self.contract.checked_schemas()?;
        self.case
            .validate(&self.contract, &input_schema, &output_schema)
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

#[cfg(unix)]
fn open_child(dir: &cap_std::fs::Dir, name: &Path, directory: bool) -> Result<File> {
    use cap_std::fs::{OpenOptions, OpenOptionsExt};
    let mut options = OpenOptions::new();
    options.read(true).custom_flags(
        libc::O_NOFOLLOW | libc::O_NONBLOCK | if directory { libc::O_DIRECTORY } else { 0 },
    );
    Ok(dir.open_with(name, &options)?.into_std())
}
#[cfg(not(unix))]
fn open_child(_dir: &cap_std::fs::Dir, _name: &Path, _directory: bool) -> Result<File> {
    anyhow::bail!("safe trace opening is unsupported on this platform")
}
fn open_absolute(path: &Path) -> Result<File> {
    use cap_std::{ambient_authority, fs::Dir};
    use std::path::Component;
    ensure!(path.is_absolute(), "authorized trace path must be absolute");
    let mut dir = Dir::open_ambient_dir("/", ambient_authority())?;
    let names: Vec<_> = path
        .components()
        .filter_map(|c| match c {
            Component::Normal(n) => Some(n),
            _ => None,
        })
        .collect();
    ensure!(!names.is_empty(), "select a narrower trace source");
    for name in &names[..names.len() - 1] {
        dir = Dir::from_std_file(open_child(&dir, Path::new(name), true)?);
    }
    open_child(&dir, Path::new(names.last().unwrap()), false)
}
fn files(source: &TraceSource) -> Result<Vec<(PathBuf, File)>> {
    fn visit(file: File, path: &Path, depth: usize, out: &mut Vec<(PathBuf, File)>) -> Result<()> {
        ensure!(
            depth <= 6 && out.len() < 256,
            "trace selection exceeds directory or file limit; select a narrower source"
        );
        let metadata = file.metadata()?;
        if metadata.is_file() {
            if path.extension().is_some_and(|e| e == "jsonl") {
                out.push((path.to_owned(), file));
            }
        } else if metadata.is_dir() {
            let dir = cap_std::fs::Dir::from_std_file(file);
            let mut children = dir
                .entries()?
                .take(257)
                .collect::<std::io::Result<Vec<_>>>()?;
            ensure!(children.len() <= 256, "trace directory exceeds entry limit");
            children.sort_by_key(|e| e.file_name());
            for child in children {
                let kind = child.file_type()?;
                if kind.is_symlink() || !(kind.is_dir() || kind.is_file()) {
                    continue;
                }
                let name = child.file_name();
                let file = open_child(&dir, Path::new(&name), kind.is_dir())?;
                visit(file, &path.join(name), depth + 1, out)?;
            }
        } else {
            anyhow::bail!("trace must be a regular file or directory");
        }
        Ok(())
    }
    let mut out = vec![];
    visit(open_absolute(&source.path)?, &source.path, 0, &mut out)?;
    Ok(out)
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
        (&value["message"]["usage"], false)
    } else {
        (&value["usage"], false)
    };
    let input = raw["input_tokens"].as_u64()?;
    let output = raw["output_tokens"].as_u64()?;
    if input > 1_000_000_000 || output > 1_000_000_000 {
        return None;
    }
    Some(
        json!({"input_tokens":input,"output_tokens":output,"cached_input_tokens":raw.get("cached_input_tokens").or_else(|| raw.get("cache_read_input_tokens")),"cache_creation_input_tokens":raw.get("cache_creation_input_tokens"),"reasoning_output_tokens":raw.get("reasoning_output_tokens"),"cumulative":cumulative,"provenance":"host_reported","adapter":adapter}),
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
                    for (path, file) in paths {
                        if remaining == 0 {
                            break;
                        }
                        match self.import_file(&project, source, &path, file, &mut remaining) {
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
        let expired = self.db.execute(
            "DELETE FROM activity WHERE project=?1 AND created_at < datetime('now', ?2)",
            params![
                project_id,
                format!("-{} days", project.settings.retention_days)
            ],
        )?;
        Ok(
            json!({"imported":imported,"expired":expired,"errors":errors,"bytes_remaining":remaining}),
        )
    }
    fn import_file(
        &mut self,
        project: &Project,
        source: &TraceSource,
        path: &Path,
        mut file: File,
        remaining: &mut usize,
    ) -> Result<usize> {
        let key = digest(&(
            path.to_str().context("trace path is not UTF-8")?,
            &source.adapter,
        ))?;
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
            if value["type"] == "clearings_workflow" {
                for field in ["session_id", "cwd", "event_id"] {
                    ensure!(
                        value[field].as_str().is_some_and(|s| !s.trim().is_empty()),
                        "workflow record requires nonempty {field}"
                    );
                }
                ensure!(
                    Path::new(value["cwd"].as_str().unwrap()).is_absolute(),
                    "workflow cwd must be absolute"
                );
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
            let event_key = value["uuid"]
                .as_str()
                .or_else(|| value["event_id"].as_str())
                .or_else(|| value["message"]["id"].as_str())
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
        ensure!(
            before.is_none_or(|id| id > 0),
            "before must be a positive activity ID"
        );
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
        self.performance_page(project, name, None)
    }
    pub fn performance_page(
        &self,
        project: &str,
        name: &str,
        after: Option<&str>,
    ) -> Result<Value> {
        ensure!(
            after.is_none_or(|s| s.len() == 64
                && s.bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))),
            "after must be a version ID"
        );
        let task = self.named_task(project, name, false)?;
        let mut stmt=self.db.prepare("SELECT runs.version, count(*), SUM(json_extract(report,'$.outcome.status')='completed'), SUM(json_extract(report,'$.elapsed_ms')), SUM(json_extract(report,'$.capability_calls')), SUM(json_extract(report,'$.outcome.status')='needs_agent'), SUM(json_extract(report,'$.outcome.status')='not_applicable'), SUM(json_extract(report,'$.outcome.status')='failed') FROM runs JOIN objects ON objects.id=runs.version WHERE json_extract(objects.body,'$.task')=?1 AND (?2 IS NULL OR runs.version>?2) GROUP BY runs.version ORDER BY runs.version LIMIT 101")?;
        let mut versions:Vec<Value>=stmt.query_map(params![task,after],|r|Ok(json!({"version":r.get::<_,String>(0)?,"runs":r.get::<_,u64>(1)?,"completed":r.get::<_,u64>(2)?,"elapsed_ms_total":r.get::<_,u64>(3)?,"capability_calls_total":r.get::<_,u64>(4)?,"needs_agent":r.get::<_,u64>(5)?,"not_applicable":r.get::<_,u64>(6)?,"failed":r.get::<_,u64>(7)?,"model_usage":null,"savings":null})))?.collect::<rusqlite::Result<_>>()?;
        let next_after = if versions.len() > 100 {
            versions.pop();
            versions.last().map(|v| v["version"].clone())
        } else {
            None
        };
        Ok(
            json!({"name":name,"versions":versions,"next_after":next_after,"usage_attribution":"Session usage is not automatically attributable to a routine invocation."}),
        )
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    #[test]
    fn trace_handles_do_not_follow_replaced_intermediate_directories() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().canonicalize().unwrap();
        let selected = root.join("selected");
        let outside = root.join("outside");
        std::fs::create_dir(&selected).unwrap();
        std::fs::create_dir(&outside).unwrap();
        std::fs::write(selected.join("event.jsonl"), "authorized").unwrap();
        std::fs::write(outside.join("event.jsonl"), "outside").unwrap();
        let held = cap_std::fs::Dir::from_std_file(open_absolute(&selected).unwrap());
        std::fs::rename(&selected, root.join("old")).unwrap();
        std::os::unix::fs::symlink(&outside, &selected).unwrap();
        assert!(open_absolute(&selected.join("event.jsonl")).is_err());
        let mut file = open_child(&held, Path::new("event.jsonl"), false).unwrap();
        let mut text = String::new();
        file.read_to_string(&mut text).unwrap();
        assert_eq!(text, "authorized");
    }
}
