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
        7
    );
    conn.pragma_update(None, "user_version", 99).unwrap();
    assert!(Store::open(&db).is_err());
}
