use clearings::{project::Settings, store::Store};

#[test]
fn ipv6_loopback_model_authorization_preserves_url_host_syntax() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(&dir.path().join("state.db")).unwrap();
    let url = reqwest::Url::parse("http://[::1]:8080").unwrap();
    assert_eq!(url.host_str(), Some("[::1]"));
    let settings: Settings = serde_json::from_value(serde_json::json!({"model":{"url":url.as_str(),"model":"local","max_output_tokens":128,"input_price":1,"output_price":1}})).unwrap();
    assert!(
        store
            .configure_project(dir.path(), "IPv6", settings.clone(), None)
            .is_ok()
    );
    let mut remote = settings;
    remote.model.as_mut().unwrap().url = "http://[2001:db8::1]:8080".into();
    assert!(
        store
            .configure_project(dir.path(), "Remote IPv6", remote, Some(1))
            .is_err()
    );
}

#[test]
fn authorization_survives_restart_and_updates_require_current_revision() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("state.db");
    let mut store = Store::open(&db).unwrap();
    let project = store
        .configure_project(dir.path(), "My project", Settings::default(), None)
        .unwrap();
    assert_eq!(project.revision, 1);
    assert!(
        store
            .configure_project(dir.path(), "My project", Settings::default(), None)
            .is_err()
    );
    drop(store);
    let mut store = Store::open(&db).unwrap();
    assert_eq!(store.project(&project.id).unwrap().name, "My project");
    let updated = store
        .configure_project(dir.path(), "Renamed", Settings::default(), Some(1))
        .unwrap();
    assert_eq!(updated.id, project.id);
    assert_eq!(updated.revision, 2);
    assert!(
        store
            .configure_project(dir.path(), "Stale", Settings::default(), Some(1))
            .is_err()
    );
}

#[test]
fn incomplete_background_authorization_is_rejected_and_legacy_database_migrates() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("state.db");
    let conn = rusqlite::Connection::open(&db).unwrap();
    conn.pragma_update(None, "user_version", 1).unwrap();
    drop(conn);
    let mut store = Store::open(&db).unwrap();
    let settings = Settings {
        automatic: true,
        ..Settings::default()
    };
    assert!(
        store
            .configure_project(dir.path(), "Project", settings, None)
            .is_err()
    );
    assert!(
        store
            .configure_project(dir.path(), "Project", Settings::default(), None)
            .is_ok()
    );
    let conn = rusqlite::Connection::open(&db).unwrap();
    assert_eq!(
        conn.pragma_query_value(None, "user_version", |r| r.get::<_, i32>(0))
            .unwrap(),
        14
    );
    conn.pragma_update(None, "user_version", 99).unwrap();
    assert!(Store::open(&db).is_err());
}

#[test]
fn populated_v7_runs_backfill_ownership_and_daily_usage_once() {
    use serde_json::json;
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("state.db");
    let db = rusqlite::Connection::open(&path).unwrap();
    db.execute_batch("CREATE TABLE objects(id TEXT PRIMARY KEY,kind TEXT NOT NULL,body TEXT NOT NULL); CREATE TABLE projects(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,body TEXT NOT NULL); CREATE TABLE runs(id INTEGER PRIMARY KEY,version TEXT NOT NULL,input_digest TEXT NOT NULL,report TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); PRAGMA user_version=7;").unwrap();
    db.execute("INSERT INTO projects VALUES('p',1,'{}')", [])
        .unwrap();
    db.execute(
        "INSERT INTO objects VALUES('task','task',?1)",
        [json!({"project":"p"}).to_string()],
    )
    .unwrap();
    db.execute(
        "INSERT INTO objects VALUES('version','version',?1)",
        [json!({"task":"task"}).to_string()],
    )
    .unwrap();
    for (status, ms, calls) in [("completed", 4, 2), ("needs_agent", 6, 1), ("failed", 3, 0)] {
        db.execute("INSERT INTO runs(version,input_digest,report,created_at) VALUES('version','input',?1,'2026-09-15 12:00:00')",[json!({"outcome":{"status":status},"elapsed_ms":ms,"capability_calls":calls}).to_string()]).unwrap();
    }
    drop(db);
    for _ in 0..2 {
        drop(Store::open(&path).unwrap());
        let db = rusqlite::Connection::open(&path).unwrap();
        assert_eq!(
            db.query_row("SELECT count(*) FROM runs WHERE project='p'", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            3
        );
        let totals=db.query_row("SELECT calls,completed,handoffs,failed,elapsed_ms,capability_calls FROM routine_usage WHERE task='task' AND project='p' AND day='2026-09-15'",[],|r|Ok((r.get::<_,i64>(0)?,r.get::<_,i64>(1)?,r.get::<_,i64>(2)?,r.get::<_,i64>(3)?,r.get::<_,i64>(4)?,r.get::<_,i64>(5)?))).unwrap();
        assert_eq!(totals, (3, 1, 1, 1, 13, 3));
    }
}
