use clearings_core::*;

fn value(id: u32) -> Node {
    Node {
        kind: Kind::Value,
        deps: vec![],
        binding: String::new(),
        source: "input".into(),
        value: Some(id),
    }
}
fn action(kind: Kind, deps: &[u32]) -> Node {
    Node {
        kind,
        deps: deps.to_vec(),
        binding: "test".into(),
        source: "test:operation".into(),
        value: None,
    }
}
fn plan(nodes: Vec<Node>) -> Plan {
    Plan {
        protocol: 1,
        flow: "test".into(),
        build: "fixture-v1".into(),
        root: nodes.len() as u32 - 1,
        nodes,
        timeout_ms: 100,
        max_in_flight: 2,
    }
}
fn engine(capacity: u32) -> Engine {
    Engine::new(Limits {
        max_runs: 4,
        max_nodes: 64,
        max_in_flight: capacity,
    })
    .unwrap()
}
fn drain(e: &mut Engine, now: u64) -> Vec<Command> {
    let mut commands = Vec::new();
    for _ in 0..1000 {
        let t = e.advance(vec![], now, 3).unwrap();
        assert!(t.steps <= 3);
        commands.extend(t.commands);
        if !t.has_work {
            return commands;
        }
    }
    panic!("scheduler did not quiesce")
}
fn dispatches(commands: &[Command]) -> Vec<(u32, u32, Vec<u32>)> {
    commands
        .iter()
        .filter_map(|c| {
            if let Command::Dispatch {
                command,
                node,
                inputs,
                ..
            } = c
            {
                Some((*command, *node, inputs.clone()))
            } else {
                None
            }
        })
        .collect()
}
fn complete(run: u32, command: u32, value: u32) -> Event {
    Event::Complete {
        run,
        command,
        value: Some(value),
        error: None,
    }
}

#[test]
fn independent_work_and_shared_dependencies_preserve_handle_liveness() {
    for reverse in [false, true] {
        let mut e = engine(2);
        let r = e
            .submit(
                plan(vec![
                    value(1),
                    action(Kind::Call, &[0]),
                    action(Kind::Call, &[0]),
                    action(Kind::Join, &[1, 2]),
                ]),
                0,
            )
            .unwrap();
        let first = drain(&mut e, 0);
        let mut calls = dispatches(&first);
        assert_eq!(calls.len(), 2);
        assert!(calls.iter().all(|(_, _, v)| v == &[1]));
        // A shared input is released once, after both dispatch commands.
        assert_eq!(
            first
                .iter()
                .filter(|c| matches!(c, Command::Release { value: 1, .. }))
                .count(),
            1
        );
        let release = first
            .iter()
            .position(|c| matches!(c, Command::Release { value: 1, .. }))
            .unwrap();
        assert!(
            release
                > first
                    .iter()
                    .rposition(|c| matches!(c, Command::Dispatch { .. }))
                    .unwrap()
        );
        if reverse {
            calls.reverse();
        }
        let a = &calls[0];
        let b = &calls[1];
        let t = e.advance(vec![complete(r, a.0, 10 + a.1)], 1, 8).unwrap();
        assert!(dispatches(&t.commands).is_empty());
        let mut commands = e
            .advance(vec![complete(r, b.0, 10 + b.1)], 2, 8)
            .unwrap()
            .commands;
        commands.extend(drain(&mut e, 2));
        let joined = dispatches(&commands);
        assert_eq!(joined.len(), 1);
        assert_eq!(joined[0].2, vec![11, 12]);
        let mut done = e
            .advance(vec![complete(r, joined[0].0, 20)], 3, 8)
            .unwrap()
            .commands;
        done.extend(drain(&mut e, 3));
        assert!(done.iter().any(|c| matches!(c, Command::Finished { value: Some(20), error: None, record, .. } if record.dispatched_calls == 2)));
        assert_eq!(
            (
                e.snapshot().runs,
                e.snapshot().nodes,
                e.snapshot().in_flight
            ),
            (0, 0, 0)
        );
    }
}
#[test]
fn cancellation_keeps_capacity_until_an_action_settles_and_ignores_late_output() {
    let mut e = engine(2);
    let r = e
        .submit(
            plan(vec![
                value(1),
                action(Kind::Call, &[0]),
                action(Kind::Call, &[1]),
            ]),
            0,
        )
        .unwrap();
    let issued = dispatches(&drain(&mut e, 0))[0].0;
    let mut commands = e
        .advance(vec![Event::Cancel { run: r }], 1, 8)
        .unwrap()
        .commands;
    commands.extend(drain(&mut e, 1));
    assert!(
        commands
            .iter()
            .any(|c| matches!(c,Command::Cancel{command,..} if *command==issued))
    );
    assert!(commands.iter().any(|c| matches!(c,Command::Finished{error:Some(Failure{code:ErrorCode::Cancelled,..}),record,..} if record.uncertain_actions==1)));
    assert_eq!(e.snapshot().in_flight, 1);
    assert_eq!(e.snapshot().runs, 1);
    let mut late = e
        .advance(vec![complete(r, issued, 9)], 2, 8)
        .unwrap()
        .commands;
    late.extend(drain(&mut e, 2));
    assert!(dispatches(&late).is_empty());
    assert!(
        late.iter()
            .any(|c| matches!(c, Command::Release { value: 9, .. }))
    );
    assert_eq!(e.snapshot().runs, 0);
    e.advance(vec![complete(r, issued, 9)], 2, 8).unwrap();
    assert_eq!(e.snapshot().ignored_completions, 1);
}
#[test]
fn cancellation_wins_over_completion_in_the_same_turn() {
    let mut e = engine(2);
    let r = e
        .submit(plan(vec![value(1), action(Kind::Call, &[0])]), 0)
        .unwrap();
    let c = dispatches(&drain(&mut e, 0))[0].0;
    let mut t = e
        .advance(vec![complete(r, c, 2), Event::Cancel { run: r }], 1, 8)
        .unwrap()
        .commands;
    t.extend(drain(&mut e, 1));
    assert!(t.iter().any(|c| matches!(
        c,
        Command::Finished {
            error: Some(Failure {
                code: ErrorCode::Cancelled,
                ..
            }),
            ..
        }
    )));
}
#[test]
fn deadline_includes_preparation_and_never_dispatches_expired_work() {
    let mut e = engine(2);
    let r = e
        .submit(plan(vec![value(1), action(Kind::Call, &[0])]), 0)
        .unwrap();
    let t = e.advance(vec![], 100, 1).unwrap();
    assert!(dispatches(&t.commands).is_empty());
    assert!(t.commands.iter().any(|c|matches!(c,Command::Finished{run,error:Some(Failure{code:ErrorCode::Timeout,..}),..} if *run==r)));
    drain(&mut e, 100);
    assert_eq!(e.snapshot().nodes, 0);
}
#[test]
fn runtime_capacity_is_shared_across_runs() {
    let mut e = engine(1);
    let mut p = plan(vec![value(1), action(Kind::Call, &[0])]);
    p.max_in_flight = 1;
    let a = e.submit(p.clone(), 0).unwrap();
    let b = e.submit(p, 0).unwrap();
    let c = drain(&mut e, 0);
    assert_eq!(dispatches(&c).len(), 1);
    assert_eq!(e.snapshot().in_flight, 1);
    let (run, command) = c
        .iter()
        .find_map(|c| {
            if let Command::Dispatch { run, command, .. } = c {
                Some((*run, *command))
            } else {
                None
            }
        })
        .unwrap();
    let mut next = e
        .advance(vec![complete(run, command, 2)], 1, 8)
        .unwrap()
        .commands;
    next.extend(drain(&mut e, 1));
    assert_eq!(dispatches(&next).len(), 1);
    let other = if run == a { b } else { a };
    assert!(
        next.iter()
            .any(|c| matches!(c,Command::Dispatch{run,..} if *run==other))
    );
}
#[test]
fn invalid_plans_fail_before_any_dispatch() {
    let cases = vec![
        vec![value(1), action(Kind::Call, &[1])],
        vec![value(1), action(Kind::Call, &[8])],
        vec![value(1), value(1), action(Kind::Join, &[0, 1])],
        vec![value(1), value(2)],
        vec![value(0)],
        vec![value(1), action(Kind::Call, &[])],
    ];
    for nodes in cases {
        let mut e = engine(2);
        e.submit(plan(nodes), 0).unwrap();
        let t = drain(&mut e, 0);
        assert!(dispatches(&t).is_empty());
        assert!(t.iter().any(|c| matches!(
            c,
            Command::Finished {
                error: Some(Failure {
                    code: ErrorCode::InvalidPlan,
                    ..
                }),
                ..
            }
        )));
        assert_eq!(e.snapshot().runs, 0);
    }
}
#[test]
fn dispatch_failure_releases_resources_and_stops_dependents() {
    let mut e = engine(2);
    let r = e
        .submit(
            plan(vec![
                value(1),
                action(Kind::Call, &[0]),
                action(Kind::Transform, &[1]),
            ]),
            0,
        )
        .unwrap();
    let c = dispatches(&drain(&mut e, 0))[0].0;
    let mut commands = e
        .advance(
            vec![Event::Complete {
                run: r,
                command: c,
                value: None,
                error: Some(Failure::new(ErrorCode::OperationFailed)),
            }],
            1,
            8,
        )
        .unwrap()
        .commands;
    commands.extend(drain(&mut e, 1));
    assert!(dispatches(&commands).is_empty());
    assert_eq!((e.snapshot().nodes, e.snapshot().in_flight), (0, 0));
}
#[test]
fn ownership_ids_cannot_be_reused_for_results() {
    let mut e = engine(2);
    let r = e
        .submit(plan(vec![value(1), action(Kind::Call, &[0])]), 0)
        .unwrap();
    let c = dispatches(&drain(&mut e, 0))[0].0;
    let t = e.advance(vec![complete(r, c, 1)], 1, 8).unwrap();
    assert!(t.commands.iter().any(|c| matches!(
        c,
        Command::Finished {
            error: Some(Failure {
                code: ErrorCode::InvalidValue,
                ..
            }),
            ..
        }
    )));
}
#[test]
fn limits_time_version_and_close_are_explicit() {
    let mut e = engine(2);
    let p = plan(vec![value(1)]);
    for _ in 0..4 {
        e.submit(p.clone(), 0).unwrap();
    }
    assert_eq!(
        e.submit(p.clone(), 0).unwrap_err().code,
        ErrorCode::Capacity
    );
    drain(&mut e, 1);
    assert_eq!(
        e.advance(vec![], 0, 8).unwrap_err().code,
        ErrorCode::InvalidValue
    );
    assert_eq!(
        e.advance(vec![], 1, 0).unwrap_err().code,
        ErrorCode::Capacity
    );
    let mut bad = p.clone();
    bad.protocol = 99;
    assert_eq!(e.submit(bad, 1).unwrap_err().code, ErrorCode::Unsupported);
    e.close();
    assert_eq!(e.submit(p, 1).unwrap_err().code, ErrorCode::Closed);
}
#[test]
fn repeated_runs_release_all_owned_state() {
    let mut e = engine(2);
    for i in 0..1000 {
        e.submit(plan(vec![value(1)]), i).unwrap();
        drain(&mut e, i);
    }
    assert_eq!(
        (
            e.snapshot().runs,
            e.snapshot().nodes,
            e.snapshot().in_flight
        ),
        (0, 0, 0)
    );
}
#[test]
fn graph_setup_propagation_and_cleanup_respect_work_budget() {
    let mut e = engine(2);
    let mut nodes = vec![value(1)];
    for i in 0..30 {
        nodes.push(action(Kind::Transform, &[i]));
    }
    let r = e.submit(plan(nodes), 0).unwrap();
    let mut turns = 0;
    loop {
        let t = e.advance(vec![], 0, 1).unwrap();
        assert!(t.steps <= 1);
        turns += 1;
        if !dispatches(&t.commands).is_empty() {
            break;
        }
        assert!(turns < 200);
    }
    assert!(turns > 60);
    e.advance(vec![Event::Cancel { run: r }], 1, 1).unwrap();
    for _ in 0..50 {
        assert!(e.advance(vec![], 1, 1).unwrap().steps <= 1);
    }
}
#[test]
fn decoding_rejects_unknown_fields_and_oversized_control_messages() {
    assert!(
        decode::<Limits>(r#"{"max_runs":1,"max_nodes":2,"max_in_flight":1,"ignored":1}"#).is_err()
    );
    assert_eq!(
        decode::<Plan>(&" ".repeat(MAX_CONTROL_BYTES + 1))
            .unwrap_err()
            .code,
        ErrorCode::Capacity
    );
}
