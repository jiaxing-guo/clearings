use clearings_runtime::*;

fn runtime() -> Runtime {
    Runtime::new(Limits::default()).unwrap()
}
fn exhausted(error: RuntimeError, expected: Resource) -> Diagnostic {
    match error {
        RuntimeError::ResourceExhaustion {
            resource,
            diagnostic,
            ..
        } => {
            assert_eq!(resource, expected);
            diagnostic
        }
        other => panic!("Unexpected error: {other:?}"),
    }
}

#[test]
fn exact_limits_and_overflowing_charges_do_not_commit() {
    assert!(Runtime::new(Limits {
        work: 0,
        ..Limits::default()
    })
    .is_err());
    assert!(Runtime::new(Limits {
        value_units: 1_000_001,
        ..Limits::default()
    })
    .is_err());
    let mut r = Runtime::new(Limits {
        work: 3,
        ..Limits::default()
    })
    .unwrap();
    r.work(3).unwrap();
    exhausted(r.work(u64::MAX).unwrap_err(), Resource::Work);
    assert_eq!(r.usage().work, 3);
}

#[test]
fn integer_boundaries_and_fault_classification() {
    let mut r = runtime();
    let maximum = r.integer(MAX_INTEGER).unwrap();
    let one = r.integer(1).unwrap();
    let before = r.usage();
    assert!(matches!(
        r.arithmetic(&maximum, &one, false),
        Err(RuntimeError::RuntimeFault {
            code: FaultCode::IntegerOverflow,
            ..
        })
    ));
    assert_eq!(r.usage().work, before.work + 1);
    assert_eq!(r.usage().allocation_units, before.allocation_units);
    assert_eq!(
        r.arithmetic(&maximum, &one, true).unwrap().data(),
        &ValueData::Integer(MAX_INTEGER - 1)
    );
    let minimum = r.integer(-MAX_INTEGER).unwrap();
    assert!(matches!(
        r.arithmetic(&minimum, &one, true),
        Err(RuntimeError::RuntimeFault {
            code: FaultCode::IntegerOverflow,
            ..
        })
    ));
    assert!(matches!(
        r.integer(i64::MAX),
        Err(RuntimeError::InvalidAbi(_))
    ));
}

#[test]
fn utf16_order_surrogates_and_prefix_work() {
    let mut r = runtime();
    let astral = r.string(&[0xd800, 0xdc00]).unwrap();
    let bmp = r.string(&[0xe000]).unwrap();
    assert_eq!(r.compare(&astral, &bmp).unwrap(), std::cmp::Ordering::Less);
    let lone = r.string(&[0xd800]).unwrap();
    assert_eq!(r.export(&lone).unwrap(), OwnedValue::String(vec![0xd800]));
    let before = r.usage().work;
    assert_eq!(r.compare(&lone, &astral).unwrap(), std::cmp::Ordering::Less);
    assert_eq!(r.usage().work - before, 2); // begin + one compared code unit
    assert_eq!(astral.units(), 3);
}

#[test]
fn value_size_precedes_allocation_and_failed_reservation_does_not_raise_peak() {
    let mut r = Runtime::new(Limits {
        value_units: 2,
        allocation_units: 1,
        ..Limits::default()
    })
    .unwrap();
    exhausted(r.string(&[1, 2]).unwrap_err(), Resource::ValueUnits);
    assert_eq!(
        r.usage(),
        Usage {
            work: 3,
            ..Usage::default()
        }
    );
    exhausted(r.string(&[1]).unwrap_err(), Resource::AllocationUnits);
    assert_eq!(r.usage().value_units, 0);
    assert_eq!(r.usage().allocation_units, 0);
}

#[test]
fn immutable_sharing_and_expanded_size() {
    let mut r = runtime();
    let n = r.integer(7).unwrap();
    let original = r.list(vec![n.clone()]).unwrap();
    let appended = r.append(&original, &n).unwrap();
    assert_eq!(original.units(), 2);
    assert_eq!(appended.units(), 3);
    let repeated = r.list(vec![original.clone(), original.clone()]).unwrap();
    assert_eq!(repeated.units(), 5);
    let mut output = r.export(&repeated).unwrap();
    if let OwnedValue::List(items) = &mut output {
        items[0] = OwnedValue::Null;
    }
    assert_eq!(
        r.export(&original).unwrap(),
        OwnedValue::List(vec![OwnedValue::Integer(7)])
    );
}

#[test]
fn equality_ignores_record_order_but_retains_traversal_cost() {
    let mut r = runtime();
    let one = r.integer(1).unwrap();
    let two = r.integer(2).unwrap();
    let a = r
        .record(vec![
            (ir_string("__proto__"), one.clone()),
            (ir_string("x"), two.clone()),
        ])
        .unwrap();
    let b = r
        .record(vec![(ir_string("x"), two), (ir_string("__proto__"), one)])
        .unwrap();
    let before = r.usage().work;
    assert!(r.equal(&a, &b).unwrap());
    assert_eq!(r.usage().work - before, 15); // pair + 10/2 field work + two scalar pairs
    let before = r.usage().work;
    assert!(r.equal(&a, &a).unwrap());
    assert_eq!(r.usage().work - before, 15); // no pointer-identity shortcut
    assert_eq!(
        r.field(&a, &ir_string("__proto__")).unwrap().data(),
        &ValueData::Integer(1)
    );
}

#[test]
fn membership_stops_at_first_equal_and_index_fault_is_distinct() {
    let mut r = runtime();
    let one = r.integer(1).unwrap();
    let two = r.integer(2).unwrap();
    let list = r.list(vec![one.clone(), two]).unwrap();
    let before = r.usage().work;
    assert!(r.contains(&list, &one).unwrap().boolean().unwrap());
    assert_eq!(r.usage().work - before, 2);
    let index = r.integer(-1).unwrap();
    assert!(matches!(
        r.index(&list, &index),
        Err(RuntimeError::RuntimeFault {
            code: FaultCode::IndexOutOfBounds,
            ..
        })
    ));
    assert_eq!(r.length(&list).unwrap().data(), &ValueData::Integer(2));
    let boolean = r.boolean(true).unwrap();
    assert!(!r.not(&boolean).unwrap().boolean().unwrap());
}

#[test]
fn stable_sort_has_independent_expected_charges() {
    let mut r = runtime();
    let two = r.integer(2).unwrap();
    let one = r.integer(1).unwrap();
    let list = r.list(vec![two, one.clone(), one]).unwrap();
    let before = r.usage();
    let sorted = r.sort(&list).unwrap();
    assert_eq!(r.usage().work - before.work, 16); // 4 copy + 3 scratch + 6 writes + 3 comparisons
    assert_eq!(r.usage().allocation_units - before.allocation_units, 7);
    assert_eq!(
        r.export(&sorted).unwrap(),
        OwnedValue::List(vec![
            OwnedValue::Integer(1),
            OwnedValue::Integer(1),
            OwnedValue::Integer(2)
        ])
    );
    assert_eq!(
        r.export(&list).unwrap(),
        OwnedValue::List(vec![
            OwnedValue::Integer(2),
            OwnedValue::Integer(1),
            OwnedValue::Integer(1)
        ])
    );
}

#[test]
fn import_export_charges_every_occurrence() {
    let mut r = runtime();
    let input = OwnedValue::List(vec![
        OwnedValue::Integer(1),
        OwnedValue::Integer(2),
        OwnedValue::Integer(3),
    ]);
    let value = r.import(&input, "/arguments/0").unwrap();
    assert_eq!(
        r.usage(),
        Usage {
            work: 7,
            allocation_units: 7,
            value_units: 4,
            evaluation_depth: 0
        }
    );
    assert_eq!(r.export(&value).unwrap(), input);
    assert_eq!(
        r.usage(),
        Usage {
            work: 14,
            allocation_units: 11,
            value_units: 4,
            evaluation_depth: 0
        }
    );
}

#[test]
fn call_depth_diagnostics_restore_after_abrupt_completion() {
    let mut r = Runtime::new(Limits {
        evaluation_depth: 1,
        ..Limits::default()
    })
    .unwrap();
    r.set_phase(Phase::Execution);
    let error = r
        .call("entry", "/entry_function", "/functions/0", |r| {
            r.call(
                "callee",
                "/functions/0/body/0/value",
                "/functions/1",
                |_| Ok(()),
            )
        })
        .unwrap_err();
    let d = exhausted(error, Resource::EvaluationDepth);
    assert_eq!(d.path, "/functions/1");
    assert_eq!(d.call_stack.len(), 2);
    assert_eq!(d.call_stack[1].function_id, "callee");
    assert_eq!(r.usage().work, 7); // entry + id length + rejected callee entry
    assert!(r.diagnostic().call_stack.is_empty());
    r.enter("/next", |_| Ok(())).unwrap();
}

#[test]
fn failure_retains_origin_and_result_exhaustion_replaces_it() {
    let mut r = Runtime::new(Limits {
        allocation_units: 1,
        ..Limits::default()
    })
    .unwrap();
    r.set_phase(Phase::Execution);
    let result = r.call("f", "/entry_function", "/functions/0", |r| {
        let value = r.integer(9)?;
        r.at("/functions/0/body/0", |r| r.fail("FAIL", value))
    });
    match r.finish(result).unwrap() {
        Completion::ResourceExhaustion {
            resource,
            diagnostic,
            ..
        } => {
            assert_eq!(resource, Resource::AllocationUnits);
            assert_eq!(diagnostic.phase, Phase::Result);
            assert_eq!(diagnostic.path, "/result/details");
            assert!(diagnostic.call_stack.is_empty());
        }
        other => panic!("Unexpected completion: {other:?}"),
    }
    let mut r = runtime();
    let result = r.call("f", "/entry_function", "/functions/0", |r| {
        let v = r.null()?;
        r.fail("EMPTY", v)
    });
    match r.finish(result).unwrap() {
        Completion::ApplicationFailure {
            code,
            details,
            diagnostic,
        } => {
            assert_eq!(code, "EMPTY");
            assert_eq!(details, OwnedValue::Null);
            assert_eq!(diagnostic.call_stack.len(), 1);
        }
        other => panic!("Unexpected completion: {other:?}"),
    }
    assert!(matches!(
        r.finish(Err(RuntimeError::InvalidAbi("defect"))),
        Err(RuntimeError::InvalidAbi("defect"))
    ));
}

#[test]
fn lexical_lookup_charges_scopes_separately() {
    let mut r = Runtime::new(Limits {
        work: 4,
        ..Limits::default()
    })
    .unwrap();
    exhausted(r.lookup("abc", 2).unwrap_err(), Resource::Work);
    assert_eq!(r.usage().work, 4);
}

#[test]
fn boundary_arguments_are_typed_bounded_owned_and_canonical() {
    let args = vec![OwnedValue::Record(vec![
        (ir_string("z"), OwnedValue::String(vec![0xd800])),
        (ir_string("a"), OwnedValue::Integer(2)),
    ])];
    let types = vec![Type::Record(vec![
        (ir_string("z"), Type::String),
        (ir_string("a"), Type::Integer),
    ])];
    let prepared = prepare_arguments(&args, &types).unwrap();
    if let OwnedValue::Record(fields) = &prepared[0] {
        assert_eq!(fields[0].0, ir_string("a"));
    } else {
        panic!();
    }
    assert_ne!(prepared, args);
    assert_eq!(
        prepare_arguments(&[OwnedValue::Integer(MAX_INTEGER + 1)], &[Type::Integer])
            .unwrap_err()
            .rule,
        "type"
    );
    assert_eq!(prepare_arguments(&[], &types).unwrap_err().rule, "arity");
    assert_eq!(
        prepare_arguments(&[OwnedValue::String(vec![0; 1_000_000])], &[Type::String])
            .unwrap_err()
            .rule,
        "input-limit"
    );
    let mut deep = OwnedValue::Null;
    for _ in 0..64 {
        deep = OwnedValue::List(vec![deep]);
    }
    assert_eq!(
        prepare_arguments(&[deep], &[]).unwrap_err().rule,
        "portability"
    );
}

#[test]
fn import_exhaustion_retains_the_first_rejected_child() {
    let mut r = Runtime::new(Limits {
        work: 3,
        ..Limits::default()
    })
    .unwrap();
    let value = OwnedValue::List(vec![
        OwnedValue::Boolean(true),
        OwnedValue::String(vec![1, 2, 3]),
    ]);
    let diagnostic = exhausted(
        r.import(&value, "/arguments/0").unwrap_err(),
        Resource::Work,
    );
    assert_eq!(diagnostic.phase, Phase::Arguments);
    assert_eq!(diagnostic.path, "/arguments/0/1");
    assert!(diagnostic.call_stack.is_empty());
    assert_eq!(r.usage().work, 1);
    assert_eq!(r.usage().allocation_units, 1);
}

#[test]
fn resource_exhaustion_precedes_a_fault_when_its_check_cannot_be_charged() {
    let mut r = Runtime::new(Limits {
        work: 10,
        ..Limits::default()
    })
    .unwrap();
    let list = r.list(vec![]).unwrap();
    let negative = r.integer(-1).unwrap();
    r.work(8).unwrap();
    exhausted(r.index(&list, &negative).unwrap_err(), Resource::Work);
    assert_eq!(r.usage().work, 10);
}

#[test]
fn sort_scratch_reservation_is_separate_from_output_size() {
    let mut r = Runtime::new(Limits {
        allocation_units: 12,
        ..Limits::default()
    })
    .unwrap();
    let input = OwnedValue::List(vec![
        OwnedValue::Integer(3),
        OwnedValue::Integer(1),
        OwnedValue::Integer(2),
    ]);
    let value = r.import(&input, "/arguments/0").unwrap();
    exhausted(r.sort(&value).unwrap_err(), Resource::AllocationUnits);
    assert_eq!(r.usage().allocation_units, 11); // Seven import units plus four output units.
    assert_eq!(r.usage().value_units, 4); // Scratch does not increase expanded value size.
    assert_eq!(r.usage().work, 14); // Import, shallow copy, then scratch construction.
}

#[test]
fn output_copy_exhaustion_discards_the_return_value() {
    let mut r = Runtime::new(Limits {
        work: 3,
        ..Limits::default()
    })
    .unwrap();
    let value = r.string(&[1, 2]).unwrap();
    match r.finish(Ok(value)).unwrap() {
        Completion::ResourceExhaustion {
            resource,
            diagnostic,
            ..
        } => {
            assert_eq!(resource, Resource::Work);
            assert_eq!(diagnostic.path, "/result/value");
            assert_eq!(diagnostic.phase, Phase::Result);
        }
        other => panic!("Unexpected completion: {other:?}"),
    }
    assert_eq!(r.usage().allocation_units, 6); // Result reservation succeeded before copying.
    assert_eq!(r.usage().work, 3);
}

#[test]
fn exact_record_arguments_reject_missing_extra_and_duplicate_fields() {
    let declared = vec![Type::Record(vec![(ir_string("x"), Type::Integer)])];
    let x = (ir_string("x"), OwnedValue::Integer(1));
    for fields in [
        vec![],
        vec![x.clone(), (ir_string("y"), OwnedValue::Null)],
        vec![x.clone(), x],
    ] {
        let error = prepare_arguments(&[OwnedValue::Record(fields)], &declared).unwrap_err();
        assert_eq!(error.path, "/arguments/0");
        assert_eq!(error.rule, "type");
    }
    assert!(prepare_arguments(&[OwnedValue::Boolean(true)], &[Type::Integer]).is_err());
}
