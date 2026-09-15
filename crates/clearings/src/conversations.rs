//! Read local coding-client history as evidence, never as executable instructions.
use crate::{
    client_process::{self, JsonProcess},
    store::{Store, digest},
};
use anyhow::{Context, Result, ensure};
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    fs,
    io::{BufRead, BufReader, Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::Command,
    time::{Duration, UNIX_EPOCH},
};

#[derive(Clone, Copy, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Scope {
    #[default]
    Project,
    All,
}
#[derive(Clone, Copy, Deserialize, Serialize, clap::ValueEnum)]
#[serde(rename_all = "snake_case")]
pub enum Client {
    Codex,
    Claude,
}
impl Client {
    fn name(self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::Claude => "claude",
        }
    }
}
fn root(path: &str) -> Result<PathBuf> {
    crate::plugin::project_root(Path::new(path))
}
fn clipped(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}
fn codex() -> Result<JsonProcess> {
    let mut command = Command::new(client_process::executable("codex")?);
    command.args(["app-server", "--stdio"]);
    let process = JsonProcess::start(&mut command, Duration::from_secs(20))?;
    process.call(1,"initialize",json!({"clientInfo":{"name":"clearings-history","version":env!("CARGO_PKG_VERSION")},"capabilities":{"experimentalApi":true}}))?;
    process.send(json!({"method":"initialized"}))?;
    Ok(process)
}
impl Store {
    pub(crate) fn authorize_history(&self) -> Result<()> {
        self.db.execute(
            "INSERT OR IGNORE INTO installation(key,body) VALUES('history_access','true')",
            [],
        )?;
        Ok(())
    }
    fn history_access(&self) -> Result<()> {
        let allowed: Option<String> = self
            .db
            .query_row(
                "SELECT body FROM installation WHERE key='history_access'",
                [],
                |r| r.get(0),
            )
            .optional()?;
        ensure!(
            allowed.as_deref() == Some("true"),
            "conversation access is unavailable; use a trusted Clearings plugin session"
        );
        Ok(())
    }
    fn remember_conversation(
        &self,
        client: &str,
        host_id: &str,
        project: &Path,
        source: Option<&Path>,
        updated: i64,
        title: &str,
    ) -> Result<Value> {
        ensure!(
            !host_id.is_empty() && host_id.len() <= 200,
            "invalid conversation identity"
        );
        let id = digest(&(client, host_id, project))?;
        let body = json!({"id":id,"client":client,"session":host_id,"project":project,"updated_at":updated,"title":clipped(title,300)});
        self.db.execute("INSERT INTO conversations(id,client,host_id,root,source,updated,body) VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(id) DO UPDATE SET source=excluded.source,updated=excluded.updated,body=excluded.body",params![id,client,host_id,project.to_string_lossy(),source.map(|p|p.to_string_lossy().to_string()),updated,body.to_string()])?;
        Ok(body)
    }
    pub(crate) fn register_transcript(&self, context: &Value, project: &Path) -> Result<()> {
        self.authorize_history()?;
        let (Some(path), Some(session)) = (
            context["transcript_path"].as_str(),
            context["session_id"].as_str(),
        ) else {
            return Ok(());
        };
        let path = Path::new(path);
        if !path.is_absolute() || path.extension().is_none_or(|e| e != "jsonl") {
            return Ok(());
        }
        let client = if path
            .file_name()
            .is_some_and(|n| n.to_string_lossy().starts_with("rollout-"))
        {
            "codex"
        } else {
            "claude"
        };
        self.remember_conversation(
            client,
            session,
            project,
            Some(path),
            crate::background::now()?,
            "Current session",
        )?;
        Ok(())
    }
    pub fn recent_conversations(
        &self,
        project: &str,
        scope: Scope,
        client: Option<Client>,
        days: u32,
        cursor: Option<&str>,
    ) -> Result<Value> {
        self.history_access()?;
        let selected = self.project(project)?;
        ensure!(
            (1..=365).contains(&days),
            "history lookback must be 1 to 365 days"
        );
        ensure!(
            cursor.is_none_or(|s| s.len() <= 4096),
            "history cursor exceeds limit"
        );
        ensure!(
            cursor.is_none() || client.is_some(),
            "continuation requires its client"
        );
        let since = crate::background::now()? - i64::from(days) * 86400;
        let mut entries = vec![];
        let mut errors = vec![];
        let mut continuations = json!({});
        let clients = client.map_or_else(|| vec![Client::Codex, Client::Claude], |c| vec![c]);
        for client in clients {
            let result = match client {
                Client::Codex => self
                    .list_codex(&selected.root, scope, since, cursor)
                    .map(|(found, next)| (found, next, vec![])),
                Client::Claude => self.list_claude(&selected.root, scope, since, cursor),
            };
            match result {
                Ok((mut found, next, mut partial)) => {
                    errors.append(&mut partial);
                    entries.append(&mut found);
                    continuations[client.name()] = json!(next);
                }
                Err(e) => errors.push(json!({"client":client.name(),"error":e.to_string()})),
            }
        }
        entries.sort_by_key(|v| std::cmp::Reverse(v["updated_at"].as_i64().unwrap_or(0)));
        Ok(
            json!({"conversations":entries,"continuations":continuations,"errors":errors,"coverage":if errors.is_empty(){"page"}else{"partial"},"scope":scope,"untrusted_evidence":true}),
        )
    }
    pub fn prepare_conversation_task(
        &self,
        project: &str,
        mut task: crate::store::Task,
        ids: &[String],
        scope: Scope,
    ) -> Result<Value> {
        self.history_access()?;
        ensure!(
            task.evidence.is_none() && task.project.is_none(),
            "task evidence and ownership are host assigned"
        );
        ensure!(
            !ids.is_empty() && ids.len() <= 20,
            "provide 1 to 20 evidence IDs returned by conversation reading"
        );
        let selected = self.project(project)?;
        let mut sources = vec![];
        for id in ids {
            ensure!(id.len() == 64, "invalid evidence ID");
            let body: String = self
                .db
                .query_row(
                    "SELECT body FROM conversation_evidence WHERE id=?1",
                    [id],
                    |r| r.get(0),
                )
                .context("evidence not found; read its conversation first")?;
            let source: Value = serde_json::from_str(&body)?;
            ensure!(digest(&source)? == *id, "conversation evidence changed");
            ensure!(
                scope == Scope::All
                    || source["project"] == selected.root.to_string_lossy().as_ref(),
                "evidence belongs to another project"
            );
            sources.push(json!({"id":id,"record":source}));
        }
        task.evidence = Some(
            json!({"kind":"conversation_interpretation","sources":sources,"case_provenance":"agent_supplied_interpretation","claim":"Source records were read by Clearings; case interpretations and constructed examples are not authenticated observations."}),
        );
        Ok(json!({"task":self.prepare_named_evidence(project,task,"conversation")?}))
    }
    fn list_codex(
        &self,
        selected: &Path,
        scope: Scope,
        since: i64,
        cursor: Option<&str>,
    ) -> Result<(Vec<Value>, Option<String>)> {
        let process = codex()?;
        // Filter canonical repository roots after listing, so subdirectory sessions are included.
        let page = process.call(
            2,
            "thread/list",
            json!({"limit":20,"cursor":cursor,"sortKey":"updated_at","sourceKinds":[]}),
        )?;
        let threads = page["data"]
            .as_array()
            .context("Codex history listing lacks data")?;
        let mut found = vec![];
        for thread in threads {
            let updated = thread["updatedAt"].as_i64().unwrap_or(0);
            if updated < since {
                continue;
            }
            let Some(cwd) = thread["cwd"].as_str() else {
                continue;
            };
            let Ok(project) = crate::plugin::scoped_project_root(Path::new(cwd), selected) else {
                continue;
            };
            if scope == Scope::Project && project != selected {
                continue;
            }
            found.push(
                self.remember_conversation(
                    "codex",
                    thread["id"].as_str().context("Codex session lacks ID")?,
                    &project,
                    None,
                    updated,
                    thread["name"]
                        .as_str()
                        .or_else(|| thread["preview"].as_str())
                        .unwrap_or("Codex conversation"),
                )?,
            );
        }
        Ok((found, page["nextCursor"].as_str().map(str::to_owned)))
    }
    fn list_claude(
        &self,
        selected: &Path,
        scope: Scope,
        since: i64,
        cursor: Option<&str>,
    ) -> Result<(Vec<Value>, Option<String>, Vec<Value>)> {
        let home = std::env::var_os("HOME").context("home directory unavailable")?;
        let directory = std::env::var_os("CLAUDE_CONFIG_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(home).join(".claude"))
            .join("projects");
        ensure!(
            directory.is_dir(),
            "Claude conversation directory is unavailable"
        );
        let mut files = vec![];
        let mut visited = 0;
        claude_files(&directory.canonicalize()?, 0, &mut visited, &mut files)?;
        self.claude_page(files, selected, scope, since, cursor)
    }
    fn claude_page(
        &self,
        mut files: Vec<(i64, PathBuf)>,
        selected: &Path,
        scope: Scope,
        since: i64,
        cursor: Option<&str>,
    ) -> Result<(Vec<Value>, Option<String>, Vec<Value>)> {
        files.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
        let after: Option<(i64, PathBuf)> = cursor
            .map(serde_json::from_str)
            .transpose()
            .context("invalid Claude cursor; restart listing")?;
        files.retain(|(updated, path)| {
            *updated >= since
                && after
                    .as_ref()
                    .is_none_or(|(time, key)| updated < time || (updated == time && path > key))
        });
        let mut found = vec![];
        let mut errors = vec![];
        for (updated, path) in files.iter().take(20) {
            match claude_identity(path,Some(selected)) {
                Ok(Some((session,project,title))) => {
                    if scope==Scope::Project && project!=selected {continue;}
                    found.push(self.remember_conversation("claude",&session,&project,Some(path),*updated,&title)?);
                }
                Ok(None) => errors.push(json!({"client":"claude","source":path,"error":"transcript lacks readable session metadata"})),
                Err(e) => errors.push(json!({"client":"claude","source":path,"error":e.to_string()})),
            }
        }
        let next = if files.len() > 20 {
            Some(serde_json::to_string(&files[19])?)
        } else {
            None
        };
        Ok((found, next, errors))
    }
    pub fn read_conversation(
        &self,
        project: &str,
        id: &str,
        scope: Scope,
        cursor: Option<&str>,
    ) -> Result<Value> {
        self.history_access()?;
        ensure!(
            id.len() == 64 && cursor.is_none_or(|s| s.len() <= 4096),
            "invalid conversation identifier or cursor"
        );
        let selected = self.project(project)?;
        let (client, session, conversation_root, source): (String, String, String, Option<String>) =
            self.db
                .query_row(
                    "SELECT client,host_id,root,source FROM conversations WHERE id=?1",
                    [id],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
                )
                .context("conversation not found; list recent conversations first")?;
        ensure!(
            scope == Scope::All || Path::new(&conversation_root) == selected.root,
            "conversation belongs to another project; choose all scope explicitly"
        );
        let mut result = if client == "codex" {
            let process = codex()?;
            let meta = process.call(
                2,
                "thread/read",
                json!({"threadId":session,"includeTurns":false}),
            )?;
            ensure!(
                crate::plugin::scoped_project_root(
                    Path::new(
                        meta["thread"]["cwd"]
                            .as_str()
                            .context("session lacks project")?
                    ),
                    Path::new(&conversation_root)
                )? == Path::new(&conversation_root),
                "conversation project changed; refresh listing"
            );
            let page=process.call(3,"thread/turns/list",json!({"threadId":session,"limit":3,"sortDirection":"desc","itemsView":"full","cursor":cursor})).context("Codex recent-turn pagination is unavailable; update the coding client")?;
            let turns = page["data"]
                .as_array()
                .context("Codex history page lacks turns")?;
            let mut items = vec![];
            for turn in turns {
                if let Some(values) = turn["items"].as_array() {
                    for item in values {
                        if let Some(mut v) = codex_item(item) {
                            v["turn_id"] = turn["id"].clone();
                            items.push(v)
                        }
                    }
                }
            }
            json!({"items":items,"next_cursor":page["nextCursor"],"coverage":"page","order":"newest_turn_first"})
        } else {
            let path = source.context("conversation source is unavailable")?;
            let identity = claude_identity(Path::new(&path), Some(Path::new(&conversation_root)))?
                .context("Claude transcript lacks session metadata")?;
            ensure!(
                identity.0 == session && identity.1 == Path::new(&conversation_root),
                "transcript identity changed; refresh listing"
            );
            read_claude(Path::new(&path), cursor)?
        };
        if let Some(items) = result["items"].as_array_mut() {
            for item in items {
                let body = json!({"conversation":id,"project":conversation_root,"client":client,"item":item});
                let evidence_id = digest(&body)?;
                self.db.execute(
                    "INSERT OR IGNORE INTO conversation_evidence(id,body) VALUES(?1,?2)",
                    params![evidence_id, body.to_string()],
                )?;
                item["evidence_id"] = json!(evidence_id);
            }
        }
        result["conversation"] = json!(id);
        result["project"] = json!(conversation_root);
        result["client"] = json!(client);
        result["untrusted_evidence"] = json!(true);
        ensure!(
            serde_json::to_vec(&result)?.len() <= 1024 * 1024,
            "conversation page exceeds output limit"
        );
        Ok(result)
    }
}
fn open_transcript(path: &Path) -> Result<fs::File> {
    // Hold directory handles and reject symlink parents as well as symlink files.
    crate::activity::open_absolute(path)
}
fn claude_files(
    path: &Path,
    depth: usize,
    visited: &mut usize,
    out: &mut Vec<(i64, PathBuf)>,
) -> Result<()> {
    ensure!(depth <= 2, "Claude history nesting exceeds limit");
    let directory = cap_std::fs::Dir::from_std_file(open_transcript(path)?);
    for item in directory.entries()? {
        *visited += 1;
        ensure!(
            *visited <= 4096,
            "Claude history scan exceeds limit; selected transcript remains readable"
        );
        let item = item?;
        let kind = item.file_type()?;
        let next = path.join(item.file_name());
        if kind.is_symlink() {
            continue;
        }
        if kind.is_dir() && depth < 1 {
            claude_files(&next, depth + 1, visited, out)?
        }
        if kind.is_file() && next.extension().is_some_and(|e| e == "jsonl") {
            let modified = item
                .metadata()?
                .modified()?
                .into_std()
                .duration_since(UNIX_EPOCH)?
                .as_secs() as i64;
            out.push((modified, next));
        }
    }
    Ok(())
}
fn claude_identity(
    path: &Path,
    selected: Option<&Path>,
) -> Result<Option<(String, PathBuf, String)>> {
    let mut reader = BufReader::new(open_transcript(path)?);
    let mut read = 0;
    for _ in 0..64 {
        let mut line = vec![];
        read += Read::by_ref(&mut reader)
            .take(1024 * 1024 + 1)
            .read_until(b'\n', &mut line)?;
        ensure!(read <= 1024 * 1024, "Claude metadata exceeds read limit");
        if line.is_empty() {
            break;
        }
        if !line.ends_with(b"\n") {
            break;
        }
        let v: Value =
            serde_json::from_slice(&line).context("malformed Claude transcript metadata")?;
        if let (Some(id), Some(cwd)) = (v["sessionId"].as_str(), v["cwd"].as_str()) {
            let title = v["message"]["content"]
                .as_str()
                .unwrap_or("Claude conversation");
            let project = if let Some(selected) = selected {
                crate::plugin::scoped_project_root(Path::new(cwd), selected)?
            } else {
                root(cwd)?
            };
            return Ok(Some((id.into(), project, clipped(title, 300))));
        }
    }
    Ok(None)
}
fn codex_item(item: &Value) -> Option<Value> {
    let kind = item["type"].as_str()?;
    let body = match kind {
        "userMessage" => item["content"].clone(),
        "agentMessage" => item["text"].clone(),
        "commandExecution" => {
            json!({"command":item["command"],"output":item["aggregatedOutput"],"exit_code":item["exitCode"]})
        }
        "mcpToolCall" => {
            json!({"server":item["server"],"tool":item["tool"],"arguments":item["arguments"],"result":item["result"]})
        }
        "fileChange" => item["changes"].clone(),
        _ => return None,
    };
    let serialized = body.to_string();
    Some(
        json!({"id":item["id"],"kind":kind,"content":if serialized.len()>16000{json!(clipped(&serialized,4000))}else{body},"truncated":serialized.len()>16000}),
    )
}
fn read_claude(path: &Path, cursor: Option<&str>) -> Result<Value> {
    let mut file = open_transcript(path)?;
    let mut offset: u64 = cursor
        .map(str::parse)
        .transpose()
        .context("invalid transcript cursor")?
        .unwrap_or(0);
    ensure!(
        offset <= file.metadata()?.len(),
        "transcript rotated; restart reading"
    );
    file.seek(SeekFrom::Start(offset))?;
    let mut reader = BufReader::new(file);
    let mut items = vec![];
    let mut bytes = 0;
    let mut partial = false;
    for _ in 0..64 {
        let mut line = vec![];
        let n = Read::by_ref(&mut reader)
            .take(1024 * 1024 + 1)
            .read_until(b'\n', &mut line)?;
        if n == 0 {
            break;
        }
        ensure!(n <= 1024 * 1024, "conversation record exceeds byte limit");
        if !line.ends_with(b"\n") {
            partial = true;
            break;
        }
        if bytes + n > 1024 * 1024 {
            break;
        }
        let v: Value = serde_json::from_slice(&line).context("malformed conversation record")?;
        let kind = v["type"].as_str().unwrap_or("");
        if matches!(kind, "user" | "assistant") && v["isMeta"] != true {
            let body = match &v["message"]["content"] {
                Value::Array(parts) => Value::Array(
                    parts
                        .iter()
                        .filter(|p| {
                            matches!(
                                p["type"].as_str(),
                                Some("text" | "tool_use" | "tool_result")
                            )
                        })
                        .cloned()
                        .collect(),
                ),
                Value::String(s) => json!(s),
                _ => Value::Null,
            };
            let text = body.to_string();
            items.push(json!({"id":v["uuid"],"kind":kind,"offset":offset,"content":if text.len()>16000{json!(clipped(&text,4000))}else{body},"truncated":text.len()>16000}));
        }
        offset += n as u64;
        bytes += n;
    }
    let more = partial || offset < reader.get_ref().metadata()?.len();
    Ok(
        json!({"items":items,"next_cursor":more.then(||offset.to_string()),"coverage":if partial{"partial_final_record"}else{"page"},"order":"oldest_first"}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn claude_keyset_pages_survive_updates_and_report_individual_bad_sources() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        let store = Store::open(&root.join("state.db")).unwrap();
        let mut files = vec![];
        for i in 0..24 {
            let path = root.join(format!("{i}.jsonl"));
            fs::write(&path,format!("{}\n",json!({"sessionId":format!("s{i}"),"cwd":root,"type":"user","message":{"content":"work"}}))).unwrap();
            files.push((100 - i, path));
        }
        let (head, cursor, errors) = store
            .claude_page(files.clone(), &root, Scope::All, 0, None)
            .unwrap();
        assert_eq!(head.len(), 20);
        assert!(errors.is_empty());
        files.remove(0);
        files
            .iter_mut()
            .find(|(_, p)| p.ends_with("22.jsonl"))
            .unwrap()
            .0 = 200;
        fs::write(root.join("23.jsonl"), "not JSON\n").unwrap();
        let (tail, next, errors) = store
            .claude_page(files.clone(), &root, Scope::All, 0, cursor.as_deref())
            .unwrap();
        assert_eq!(
            tail.iter()
                .map(|v| v["session"].as_str().unwrap())
                .collect::<Vec<_>>(),
            vec!["s20", "s21"]
        );
        assert!(next.is_none());
        assert_eq!(errors.len(), 1);
        let (fresh, _, _) = store
            .claude_page(files, &root, Scope::All, 0, None)
            .unwrap();
        assert_eq!(fresh[0]["session"], "s22");
    }
    #[test]
    fn claude_reads_real_messages_and_tools_without_thinking_and_preserves_partial_cursor() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp
            .path()
            .canonicalize()
            .unwrap()
            .join("conversation.jsonl");
        let row = json!({"sessionId":"s","cwd":temp.path(),"type":"assistant","uuid":"message","message":{"content":[{"type":"text","text":"answer"},{"type":"thinking","thinking":"private reasoning"},{"type":"tool_use","name":"Read","input":{"file":"sample"}}]}});
        fs::write(&path, format!("{row}\n{{\"partial\":")).unwrap();
        assert_eq!(claude_identity(&path, None).unwrap().unwrap().0, "s");
        let page = read_claude(&path, None).unwrap();
        assert_eq!(page["items"][0]["content"].as_array().unwrap().len(), 2);
        assert_eq!(page["coverage"], "partial_final_record");
        assert_eq!(
            read_claude(&path, page["next_cursor"].as_str()).unwrap()["items"],
            json!([])
        );
    }
    #[test]
    fn exact_configured_subproject_is_preserved() {
        let temp = tempfile::tempdir().unwrap();
        let repo = temp.path().canonicalize().unwrap();
        fs::create_dir(repo.join(".git")).unwrap();
        let sub = repo.join("packages/foo");
        fs::create_dir_all(sub.join("src")).unwrap();
        assert_eq!(crate::plugin::scoped_project_root(&sub, &sub).unwrap(), sub);
        assert_eq!(
            crate::plugin::scoped_project_root(&sub.join("src"), &sub).unwrap(),
            sub
        );
        fs::create_dir(sub.join("src/.git")).unwrap();
        assert_ne!(
            crate::plugin::scoped_project_root(&sub.join("src"), &sub).unwrap(),
            sub
        );
    }
    #[test]
    fn conversation_preparation_attaches_read_evidence_and_rejects_forged_ids() {
        let temp = tempfile::tempdir().unwrap();
        let mut store = Store::open(&temp.path().join("s.db")).unwrap();
        let project = store
            .configure_project(temp.path(), "P", Default::default(), None)
            .unwrap();
        store.authorize_history().unwrap();
        let task:crate::store::Task=serde_json::from_value(json!({"contract":{"abi":1,"name":"identity","description":"Preserve numbers","input_schema":{},"output_schema":{}},"cases":[{"name":"one","input":1,"expected":{"status":"completed","output":1}}]})).unwrap();
        assert!(
            store
                .prepare_conversation_task(
                    &project.id,
                    task.clone(),
                    &["a".repeat(64)],
                    Scope::Project
                )
                .is_err()
        );
        let body = json!({"conversation":"session","project":project.root,"item":{"content":"Return the supplied number"}});
        let id = digest(&body).unwrap();
        store
            .db
            .execute(
                "INSERT INTO conversation_evidence VALUES(?1,?2)",
                params![id, body.to_string()],
            )
            .unwrap();
        let prepared = store
            .prepare_conversation_task(&project.id, task, &[id], Scope::Project)
            .unwrap();
        let inspected = store.inspect(prepared["task"].as_str().unwrap()).unwrap();
        assert_eq!(
            inspected["object"]["evidence"]["kind"],
            "conversation_interpretation"
        );
        assert_eq!(
            inspected["object"]["evidence"]["case_provenance"],
            "agent_supplied_interpretation"
        );
    }
    #[test]
    fn codex_omits_reasoning_and_bounds_large_tool_results() {
        assert!(codex_item(&json!({"type":"reasoning","text":"private"})).is_none());
        let item = codex_item(
            &json!({"type":"commandExecution","id":"c","aggregatedOutput":"a".repeat(20000)}),
        )
        .unwrap();
        assert_eq!(item["truncated"], true);
        assert!(item.to_string().len() < 5000);
    }
    #[test]
    fn history_requires_installation_and_explicit_cross_project_scope() {
        let temp = tempfile::tempdir().unwrap();
        let mut store = Store::open(&temp.path().join("state.db")).unwrap();
        let project = store
            .configure_project(temp.path(), "test", Default::default(), None)
            .unwrap();
        assert!(
            store
                .recent_conversations(&project.id, Scope::Project, Some(Client::Claude), 7, None)
                .is_err()
        );
        store.authorize_history().unwrap();
        let other = temp.path().join("other");
        fs::create_dir(&other).unwrap();
        let row = store
            .remember_conversation("claude", "session", &other, None, 1, "example")
            .unwrap();
        let error = store
            .read_conversation(
                &project.id,
                row["id"].as_str().unwrap(),
                Scope::Project,
                None,
            )
            .unwrap_err();
        assert!(error.to_string().contains("another project"));
    }
}
