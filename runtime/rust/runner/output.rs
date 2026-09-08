//! Bounded JSON response encoding. UTF-16 code units are escaped without Unicode replacement.
use clearings_runtime::*;
use std::fmt::{self, Write};

struct Json(String);
impl Write for Json {
    fn write_str(&mut self, text: &str) -> fmt::Result {
        if self.0.len() + text.len() > 16 * 1024 * 1024 {
            return Err(fmt::Error);
        }
        self.0.push_str(text);
        Ok(())
    }
}
impl Json {
    fn text(&mut self, units: impl IntoIterator<Item = u16>) -> fmt::Result {
        self.write_char('"')?;
        for unit in units {
            write!(self, "\\u{unit:04x}")?;
        }
        self.write_char('"')
    }
    fn string(&mut self, text: &str) -> fmt::Result {
        self.text(text.encode_utf16())
    }
    fn value(&mut self, value: &OwnedValue) -> fmt::Result {
        match value {
            OwnedValue::Null => self.write_str("null"),
            OwnedValue::Boolean(v) => write!(self, "{v}"),
            OwnedValue::Integer(v) => write!(self, "{v}"),
            OwnedValue::String(v) => self.text(v.iter().copied()),
            OwnedValue::List(items) => {
                self.write_char('[')?;
                for (i, item) in items.iter().enumerate() {
                    if i > 0 {
                        self.write_char(',')?;
                    }
                    self.value(item)?;
                }
                self.write_char(']')
            }
            OwnedValue::Record(fields) => {
                self.write_char('{')?;
                for (i, (name, value)) in fields.iter().enumerate() {
                    if i > 0 {
                        self.write_char(',')?;
                    }
                    self.text(name.iter().copied())?;
                    self.write_char(':')?;
                    self.value(value)?;
                }
                self.write_char('}')
            }
        }
    }
    fn diagnostic(&mut self, d: &Diagnostic) -> fmt::Result {
        self.write_str(",\"diagnostic\":{\"phase\":")?;
        self.string(match d.phase {
            Phase::Arguments => "arguments",
            Phase::Execution => "execution",
            Phase::Result => "result",
        })?;
        self.write_str(",\"path\":")?;
        self.string(&d.path)?;
        self.write_str(",\"call_stack\":[")?;
        for (i, frame) in d.call_stack.iter().enumerate() {
            if i > 0 {
                self.write_char(',')?;
            }
            self.write_str("{\"function_id\":")?;
            self.string(&frame.function_id)?;
            self.write_str(",\"call_path\":")?;
            self.string(&frame.call_path)?;
            self.write_char('}')?;
        }
        self.write_str("]}")
    }
    fn completion(&mut self, completion: &Completion) -> fmt::Result {
        match completion {
            Completion::Return { value } => {
                self.write_str("{\"kind\":\"return\",\"value\":")?;
                self.value(value)?;
            }
            Completion::ApplicationFailure {
                code,
                details,
                diagnostic,
            } => {
                self.write_str("{\"kind\":\"application-failure\",\"code\":")?;
                self.string(code)?;
                self.write_str(",\"details\":")?;
                self.value(details)?;
                self.diagnostic(diagnostic)?;
            }
            Completion::RuntimeFault {
                code,
                message,
                diagnostic,
            } => {
                self.write_str("{\"kind\":\"runtime-fault\",\"code\":")?;
                self.string(match code {
                    FaultCode::IntegerOverflow => "INTEGER_OVERFLOW",
                    FaultCode::IndexOutOfBounds => "INDEX_OUT_OF_BOUNDS",
                })?;
                self.write_str(",\"message\":")?;
                self.string(message)?;
                self.diagnostic(diagnostic)?;
            }
            Completion::ResourceExhaustion {
                resource,
                limit,
                diagnostic,
            } => {
                self.write_str("{\"kind\":\"resource-exhaustion\",\"resource\":")?;
                self.string(match resource {
                    Resource::Work => "work",
                    Resource::AllocationUnits => "allocation_units",
                    Resource::ValueUnits => "value_units",
                    Resource::EvaluationDepth => "evaluation_depth",
                })?;
                write!(self, ",\"limit\":{limit}")?;
                self.diagnostic(diagnostic)?;
            }
        }
        self.write_char('}')
    }
    fn counters(&mut self, work: u64, allocation: u64, value: u64, depth: u64) -> fmt::Result {
        write!(self, "{{\"work\":{work},\"allocation_units\":{allocation},\"value_units\":{value},\"evaluation_depth\":{depth}}}")
    }
}
pub fn execution(
    limits: Limits,
    usage: Usage,
    completion: &Completion,
) -> Result<String, fmt::Error> {
    let mut json = Json(String::new());
    json.write_str("{\"limits\":")?;
    json.counters(
        limits.work,
        limits.allocation_units,
        limits.value_units,
        limits.evaluation_depth,
    )?;
    json.write_str(",\"usage\":")?;
    json.counters(
        usage.work,
        usage.allocation_units,
        usage.value_units,
        usage.evaluation_depth,
    )?;
    json.write_str(",\"completion\":")?;
    json.completion(completion)?;
    json.write_str("}\n")?;
    Ok(json.0)
}
