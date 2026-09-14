use clearings::{project::Settings, store::Store};

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
        2
    );
    conn.pragma_update(None, "user_version", 99).unwrap();
    assert!(Store::open(&db).is_err());
}
