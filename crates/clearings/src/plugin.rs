//! User-wide plugin setup. Project selection is automatic agent work, never a guest capability.
use crate::api::Api;
use anyhow::{Context, Result, ensure};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
};

pub fn data_directory(selected: Option<PathBuf>) -> Result<PathBuf> {
    let path = match selected.or_else(|| std::env::var_os("CLEARINGS_DATA_DIR").map(PathBuf::from))
    {
        Some(path) => path,
        None => {
            let home = std::env::var_os("HOME")
                .map(PathBuf::from)
                .context("home directory is unavailable")?;
            #[cfg(target_os = "macos")]
            let path = home.join("Library/Application Support/Clearings");
            #[cfg(not(target_os = "macos"))]
            let path = match std::env::var_os("XDG_DATA_HOME") {
                Some(value) => PathBuf::from(value).join("clearings"),
                None => home.join(".local/share/clearings"),
            };
            path
        }
    };
    ensure!(
        path.is_absolute(),
        "Clearings data directory must be absolute"
    );
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(&path)?;
    let metadata = fs::symlink_metadata(&path)?;
    ensure!(
        metadata.is_dir() && !metadata.file_type().is_symlink(),
        "Clearings data directory must be a regular directory"
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        ensure!(
            metadata.uid() == unsafe { libc::geteuid() } && metadata.mode() & 0o077 == 0,
            "Clearings data directory must be owned by you with permissions 0700"
        );
    }
    Ok(path.canonicalize()?)
}

pub fn project_root(path: &Path) -> Result<PathBuf> {
    ensure!(
        path.is_absolute(),
        "provide the host session's absolute working directory"
    );
    let directory = path
        .canonicalize()
        .context("project directory is unavailable")?;
    ensure!(directory.is_dir(), "project path must be a directory");
    let home = std::env::var_os("HOME").and_then(|value| PathBuf::from(value).canonicalize().ok());
    let mut root = directory.clone();
    for ancestor in directory.ancestors() {
        // Do not treat an enclosing home or filesystem root as an implicit project.
        if ancestor.parent().is_none() || home.as_deref() == Some(ancestor) {
            break;
        }
        if let Ok(marker) = fs::symlink_metadata(ancestor.join(".git"))
            && (marker.is_dir() || marker.is_file())
            && !marker.file_type().is_symlink()
        {
            root = ancestor.to_owned();
            break;
        }
    }
    ensure!(
        root.parent().is_some() && home.as_deref() != Some(root.as_path()),
        "select a project directory rather than the home or filesystem root"
    );
    Ok(root)
}

pub fn connect(api: &mut Api, path: &Path) -> Result<Value> {
    // A failed switch must not leave tools silently operating on the previous project.
    api.project = None;
    api.policy = Default::default();
    let root = project_root(path)?;
    let project = api.store.ensure_plugin_project(&root)?;
    api.policy = project.settings.grants.clone();
    api.project = Some(project.id.clone());
    Ok(
        json!({"project": project, "authorization": "plugin installation: project read access", "scope": "this connection", "background_started": false}),
    )
}
