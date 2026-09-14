//! Persistent, host-owned project authorization. Conversation tools cannot widen it.
use crate::{
    contract::Policy,
    store::{Store, digest},
};
use anyhow::{Context, Result, ensure};
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Normalize and validate grants identically at authorization and invocation.
pub fn normalize_grants(mut policy: Policy) -> Result<Policy> {
    for root in policy.roots.values_mut() {
        *root = root.canonicalize().context("granted root must exist")?;
        ensure!(root.is_dir(), "granted root must be a directory");
    }
    crate::capabilities::validate_http_policy(&policy)?;
    Ok(policy)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TraceSource {
    pub adapter: String,
    pub path: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ModelConnection {
    /// An explicitly selected OpenAI-compatible chat completion endpoint.
    pub url: String,
    pub model: String,
    pub bearer_token_env: Option<String>,
    pub max_output_tokens: u32,
    /// Conservative operator-supplied prices, in micro-USD per million tokens.
    pub input_price: u64,
    pub output_price: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Settings {
    pub automatic: bool,
    pub record_conversations: bool,
    pub improve: bool,
    pub trace_sources: Vec<TraceSource>,
    pub model: Option<ModelConnection>,
    pub daily_budget_microusd: u64,
    pub interval_seconds: u64,
    pub min_occurrences: usize,
    pub exclusions: Vec<String>,
    pub retention_days: u32,
    pub grants: Policy,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            automatic: false,
            record_conversations: false,
            improve: false,
            trace_sources: vec![],
            model: None,
            daily_budget_microusd: 0,
            interval_seconds: 900,
            min_occurrences: 3,
            exclusions: vec![],
            retention_days: 30,
            grants: Policy::default(),
        }
    }
}
impl Settings {
    fn validate(&mut self) -> Result<()> {
        ensure!(
            (10..=86400).contains(&self.interval_seconds),
            "interval must be 10 to 86400 seconds"
        );
        ensure!(
            (3..=100).contains(&self.min_occurrences),
            "at least three independent observations are required"
        );
        ensure!(
            (1..=3650).contains(&self.retention_days),
            "retention must be 1 to 3650 days"
        );
        ensure!(
            self.trace_sources.len() <= 32 && self.exclusions.len() <= 100,
            "too many sources or exclusions"
        );
        ensure!(
            self.exclusions
                .iter()
                .all(|s| !s.is_empty() && s.len() <= 80),
            "invalid excluded routine name"
        );
        for source in &mut self.trace_sources {
            ensure!(
                matches!(source.adapter.as_str(), "codex" | "claude" | "clearings"),
                "unsupported trace adapter"
            );
            source.path = source
                .path
                .canonicalize()
                .context("trace source must exist at authorization")?;
        }
        self.grants = normalize_grants(self.grants.clone())?;
        if let Some(model) = &self.model {
            let url = reqwest::Url::parse(&model.url)?;
            ensure!(
                url.scheme() == "https"
                    || (url.scheme() == "http"
                        && matches!(url.host_str(), Some("127.0.0.1" | "[::1]" | "localhost"))),
                "model endpoint requires HTTPS or explicit loopback"
            );
            ensure!(
                url.username().is_empty()
                    && url.password().is_none()
                    && url.query().is_none()
                    && url.fragment().is_none(),
                "model URL must not contain credentials, query or fragment"
            );
            ensure!(
                !model.model.is_empty() && model.model.len() <= 200,
                "invalid model name"
            );
            ensure!(
                (1..=32768).contains(&model.max_output_tokens),
                "invalid model output limit"
            );
            ensure!(
                model.input_price > 0
                    && model.output_price > 0
                    && model.input_price <= 1_000_000_000
                    && model.output_price <= 1_000_000_000,
                "supply conservative, bounded model prices"
            );
        }
        ensure!(
            self.daily_budget_microusd <= 1_000_000_000,
            "daily budget exceeds supported limit"
        );
        ensure!(
            !self.automatic
                || ((!self.trace_sources.is_empty() || self.record_conversations)
                    && self.model.is_some()
                    && self.daily_budget_microusd > 0),
            "automatic reuse requires selected traces or conversational observation, a model connection and a positive budget"
        );
        ensure!(
            !self.improve || self.automatic,
            "improvement requires automatic reuse"
        );
        ensure!(
            serde_json::to_vec(self)?.len() <= 65536,
            "project settings exceed byte limit"
        );
        Ok(())
    }
    pub fn excludes(&self, name: &str) -> bool {
        self.exclusions
            .iter()
            .any(|s| name == s || name.starts_with(&format!("{s}/")))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub root: PathBuf,
    pub revision: u64,
    pub settings: Settings,
}

impl Store {
    pub fn configure_project(
        &mut self,
        root: &Path,
        name: &str,
        mut settings: Settings,
        expected_revision: Option<u64>,
    ) -> Result<Project> {
        let root = root.canonicalize().context("project root is unavailable")?;
        ensure!(root.is_dir(), "project root must be a directory");
        ensure!(
            !name.trim().is_empty() && name.len() <= 80,
            "project name must contain 1 to 80 bytes"
        );
        settings.validate()?;
        let id = digest(&root)?;
        let tx = self
            .db
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let actual: Option<u64> = tx
            .query_row("SELECT revision FROM projects WHERE id=?1", [&id], |r| {
                r.get(0)
            })
            .optional()?;
        ensure!(
            actual == expected_revision,
            "project settings changed; inspect the current revision first"
        );
        let revision = actual.unwrap_or(0) + 1;
        let project = Project {
            id: id.clone(),
            name: name.to_owned(),
            root,
            revision,
            settings,
        };
        tx.execute("INSERT INTO projects(id,revision,body) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,body=excluded.body", params![id,revision,serde_json::to_string(&project)?])?;
        tx.execute("DELETE FROM schedule WHERE project=?1", [&id])?;
        tx.commit()?;
        Ok(project)
    }
    pub fn project(&self, id: &str) -> Result<Project> {
        let body: String = self
            .db
            .query_row(
                "SELECT body FROM projects WHERE id=?1 AND length(CAST(body AS BLOB)) <= 131072",
                [id],
                |r| r.get(0),
            )
            .context("project not found; configure it with the CLI")?;
        Ok(serde_json::from_str(&body)?)
    }
}
