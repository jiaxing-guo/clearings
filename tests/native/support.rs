//! Output encoder for authored native test harnesses. This is not a public transport API.
use clearings_runtime::*;

fn text(units: &[u16]) -> String {
    let mut out = String::from("\"");
    for unit in units {
        out.push_str(&format!("\\u{unit:04x}"));
    }
    out.push('"');
    out
}
fn string(value: &str) -> String {
    text(&value.encode_utf16().collect::<Vec<_>>())
}
fn value(value: &OwnedValue) -> String {
    match value {
        OwnedValue::Null => "null".into(),
        OwnedValue::Boolean(v) => v.to_string(),
        OwnedValue::Integer(v) => v.to_string(),
        OwnedValue::String(v) => text(v),
        OwnedValue::List(items) => format!(
            "[{}]",
            items.iter().map(self::value).collect::<Vec<_>>().join(",")
        ),
        OwnedValue::Record(fields) => format!(
            "{{{}}}",
            fields
                .iter()
                .map(|(key, v)| format!("{}:{}", text(key), self::value(v)))
                .collect::<Vec<_>>()
                .join(",")
        ),
    }
}
fn diagnostic(d: &Diagnostic) -> String {
    let phase = match d.phase {
        Phase::Arguments => "arguments",
        Phase::Execution => "execution",
        Phase::Result => "result",
    };
    let frames = d
        .call_stack
        .iter()
        .map(|frame| {
            format!(
                "{{\"function_id\":{},\"call_path\":{}}}",
                string(&frame.function_id),
                string(&frame.call_path)
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    format!(
        "{{\"phase\":{},\"path\":{},\"call_stack\":[{}]}}",
        string(phase),
        string(&d.path),
        frames
    )
}
fn completion(c: &Completion) -> String {
    match c {
        Completion::Return { value: v } => {
            format!("{{\"kind\":\"return\",\"value\":{}}}", value(v))
        }
        Completion::ApplicationFailure {
            code,
            details,
            diagnostic: d,
        } => format!(
            "{{\"kind\":\"application-failure\",\"code\":{},\"details\":{},\"diagnostic\":{}}}",
            string(code),
            value(details),
            diagnostic(d)
        ),
        Completion::RuntimeFault {
            code,
            message,
            diagnostic: d,
        } => {
            let code = match code {
                FaultCode::IntegerOverflow => "INTEGER_OVERFLOW",
                FaultCode::IndexOutOfBounds => "INDEX_OUT_OF_BOUNDS",
            };
            format!(
                "{{\"kind\":\"runtime-fault\",\"code\":{},\"message\":{},\"diagnostic\":{}}}",
                string(code),
                string(message),
                diagnostic(d)
            )
        }
        Completion::ResourceExhaustion {
            resource,
            limit,
            diagnostic: d,
        } => {
            let resource = match resource {
                Resource::Work => "work",
                Resource::AllocationUnits => "allocation_units",
                Resource::ValueUnits => "value_units",
                Resource::EvaluationDepth => "evaluation_depth",
            };
            format!("{{\"kind\":\"resource-exhaustion\",\"resource\":{},\"limit\":{},\"diagnostic\":{}}}", string(resource), limit, diagnostic(d))
        }
    }
}
fn counters(work: u64, allocation_units: u64, value_units: u64, evaluation_depth: u64) -> String {
    format!("{{\"work\":{work},\"allocation_units\":{allocation_units},\"value_units\":{value_units},\"evaluation_depth\":{evaluation_depth}}}")
}
pub fn execution(limits: Limits, usage: Usage, result: &Completion) -> String {
    format!(
        "{{\"limits\":{},\"usage\":{},\"completion\":{}}}",
        counters(
            limits.work,
            limits.allocation_units,
            limits.value_units,
            limits.evaluation_depth
        ),
        counters(
            usage.work,
            usage.allocation_units,
            usage.value_units,
            usage.evaluation_depth
        ),
        completion(result)
    )
}
pub fn input_error(error: &InputError) -> String {
    format!(
        "{{\"error\":{{\"code\":\"INVALID_PROGRAM_EXECUTION\",\"path\":{},\"rule\":{}}}}}",
        string(&error.path),
        string(error.rule)
    )
}
