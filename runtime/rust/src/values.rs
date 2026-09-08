use crate::{Eval, FaultCode, Runtime, RuntimeError};
use std::{cmp::Ordering, rc::Rc};

pub const MAX_INTEGER: i64 = 9_007_199_254_740_991;

/// UTF-16 code units retain all IR strings, including unpaired surrogates.
pub type IrString = Vec<u16>;
pub fn ir_string(text: &str) -> IrString {
    text.encode_utf16().collect()
}

/// Owned boundary values. Wire decoding/encoding is a later runner responsibility.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum OwnedValue {
    Null,
    Boolean(bool),
    Integer(i64),
    String(IrString),
    List(Vec<OwnedValue>),
    Record(Vec<(IrString, OwnedValue)>),
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ValueData {
    Null,
    Boolean(bool),
    Integer(i64),
    String(IrString),
    List(Vec<Value>),
    Record(Vec<(IrString, Value)>),
}
/// Private shared storage is immutable; cloning a handle cannot mutate another value.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Value {
    data: Rc<ValueData>,
    units: u64,
}
impl Value {
    pub fn data(&self) -> &ValueData {
        &self.data
    }
    pub fn units(&self) -> u64 {
        self.units
    }
    pub fn boolean(&self) -> Eval<bool> {
        match self.data() {
            ValueData::Boolean(value) => Ok(*value),
            _ => Err(RuntimeError::InvalidAbi("Expected a Boolean.")),
        }
    }
    fn list(&self) -> Eval<&[Value]> {
        match self.data() {
            ValueData::List(items) => Ok(items),
            _ => Err(RuntimeError::InvalidAbi("Expected a list.")),
        }
    }
}

impl Runtime {
    fn new_value(&mut self, data: ValueData, units: u64, work: u64) -> Eval<Value> {
        self.work(work)?;
        self.materialize(units)?;
        Ok(Value {
            data: Rc::new(data),
            units,
        })
    }
    pub fn null(&mut self) -> Eval<Value> {
        self.new_value(ValueData::Null, 1, 1)
    }
    pub fn boolean(&mut self, value: bool) -> Eval<Value> {
        self.new_value(ValueData::Boolean(value), 1, 1)
    }
    pub fn integer(&mut self, value: i64) -> Eval<Value> {
        if !(-MAX_INTEGER..=MAX_INTEGER).contains(&value) {
            return Err(RuntimeError::InvalidAbi(
                "Integer input is outside the IR domain.",
            ));
        }
        self.new_value(ValueData::Integer(value), 1, 1)
    }
    pub fn string(&mut self, value: &[u16]) -> Eval<Value> {
        let units = 1 + value.len() as u64;
        self.work(units)?;
        self.materialize(units)?;
        Ok(Value {
            data: Rc::new(ValueData::String(value.to_vec())),
            units,
        })
    }
    pub fn list(&mut self, items: Vec<Value>) -> Eval<Value> {
        let units = 1 + items.iter().map(Value::units).sum::<u64>();
        let work = 1 + items.len() as u64;
        self.new_value(ValueData::List(items), units, work)
    }
    pub fn record(&mut self, fields: Vec<(IrString, Value)>) -> Eval<Value> {
        let mut names = std::collections::BTreeSet::new();
        if fields.iter().any(|(name, _)| !names.insert(name)) {
            return Err(RuntimeError::InvalidAbi("Duplicate record field."));
        }
        let names = fields.iter().map(|(key, _)| key.len() as u64).sum::<u64>();
        let units = 1 + names + fields.iter().map(|(_, value)| value.units).sum::<u64>();
        let work = 1 + fields.len() as u64 + names;
        self.new_value(ValueData::Record(fields), units, work)
    }
    /// Boundary records must already be in canonical order. Constructors preserve field-array order.
    pub fn import(&mut self, value: &OwnedValue, path: &str) -> Eval<Value> {
        self.at(path, |runtime| match value {
            OwnedValue::Null => runtime.null(),
            OwnedValue::Boolean(value) => runtime.boolean(*value),
            OwnedValue::Integer(value) => runtime.integer(*value),
            OwnedValue::String(value) => runtime.string(value),
            OwnedValue::List(items) => {
                let imported = items
                    .iter()
                    .enumerate()
                    .map(|(i, item)| runtime.import(item, &format!("{path}/{i}")))
                    .collect::<Eval<Vec<_>>>()?;
                runtime.list(imported)
            }
            OwnedValue::Record(fields) => {
                let imported = fields
                    .iter()
                    .map(|(key, value)| {
                        // Program IR record names are ASCII identifiers, unlike arbitrary string values.
                        let name = String::from_utf16(key)
                            .map_err(|_| RuntimeError::InvalidAbi("Invalid record field name."))?;
                        Ok((
                            key.clone(),
                            runtime.import(value, &format!("{path}/{name}"))?,
                        ))
                    })
                    .collect::<Eval<Vec<_>>>()?;
                runtime.record(imported)
            }
        })
    }
    pub fn append(&mut self, list: &Value, item: &Value) -> Eval<Value> {
        let items = list.list()?;
        self.work(2 + items.len() as u64)?;
        let units = list.units + item.units;
        self.materialize(units)?;
        let mut result = items.to_vec();
        result.push(item.clone());
        Ok(Value {
            data: Rc::new(ValueData::List(result)),
            units,
        })
    }
    pub fn field(&mut self, record: &Value, name: &[u16]) -> Eval<Value> {
        self.work(1 + name.len() as u64)?;
        match record.data() {
            ValueData::Record(fields) => fields
                .iter()
                .find(|(key, _)| key == name)
                .map(|(_, value)| value.clone())
                .ok_or(RuntimeError::InvalidAbi(
                    "Missing statically declared field.",
                )),
            _ => Err(RuntimeError::InvalidAbi("Expected a record.")),
        }
    }
    pub fn index(&mut self, list: &Value, index: &Value) -> Eval<Value> {
        let items = list.list()?;
        let ValueData::Integer(index) = index.data() else {
            return Err(RuntimeError::InvalidAbi("Expected an integer index."));
        };
        self.work(1)?;
        if *index < 0 || *index as u64 >= items.len() as u64 {
            return Err(self.fault(
                FaultCode::IndexOutOfBounds,
                format!("Index {index} is outside a list of length {}.", items.len()),
            ));
        }
        Ok(items[*index as usize].clone())
    }
    pub fn length(&mut self, list: &Value) -> Eval<Value> {
        self.integer(list.list()?.len() as i64)
    }
    pub fn not(&mut self, value: &Value) -> Eval<Value> {
        self.boolean(!value.boolean()?)
    }
    pub fn arithmetic(&mut self, left: &Value, right: &Value, subtract: bool) -> Eval<Value> {
        let (ValueData::Integer(a), ValueData::Integer(b)) = (left.data(), right.data()) else {
            return Err(RuntimeError::InvalidAbi("Expected integer operands."));
        };
        self.work(1)?;
        // Both inputs are in the 53-bit domain, so the intermediate fits i64.
        let value = if subtract { a - b } else { a + b };
        if !(-MAX_INTEGER..=MAX_INTEGER).contains(&value) {
            return Err(self.fault(
                FaultCode::IntegerOverflow,
                "Arithmetic result is outside the safe-integer domain.".into(),
            ));
        }
        self.integer(value)
    }
    pub fn compare(&mut self, left: &Value, right: &Value) -> Eval<Ordering> {
        self.work(1)?;
        match (left.data(), right.data()) {
            (ValueData::Integer(a), ValueData::Integer(b)) => Ok(a.cmp(b)),
            (ValueData::String(a), ValueData::String(b)) => {
                for (a, b) in a.iter().zip(b) {
                    self.work(1)?;
                    if a != b {
                        return Ok(a.cmp(b));
                    }
                }
                Ok(a.len().cmp(&b.len()))
            }
            _ => Err(RuntimeError::InvalidAbi(
                "Expected compatible ordered operands.",
            )),
        }
    }
    pub fn equal(&mut self, left: &Value, right: &Value) -> Eval<bool> {
        self.work(1)?;
        match (left.data(), right.data()) {
            (ValueData::Null, ValueData::Null) => Ok(true),
            (ValueData::Boolean(a), ValueData::Boolean(b)) => Ok(a == b),
            (ValueData::Integer(a), ValueData::Integer(b)) => Ok(a == b),
            (ValueData::String(_), ValueData::String(_)) => {
                Ok(self.compare(left, right)? == Ordering::Equal)
            }
            (ValueData::List(a), ValueData::List(b)) => {
                if a.len() != b.len() {
                    return Ok(false);
                }
                for (a, b) in a.iter().zip(b) {
                    if !self.equal(a, b)? {
                        return Ok(false);
                    }
                }
                Ok(true)
            }
            (ValueData::Record(a), ValueData::Record(b)) => {
                if a.len() != b.len() {
                    return Ok(false);
                }
                for (key, value) in a {
                    self.work(1 + key.len() as u64)?;
                    let Some((_, other)) = b.iter().find(|(name, _)| name == key) else {
                        return Ok(false);
                    };
                    if !self.equal(value, other)? {
                        return Ok(false);
                    }
                }
                Ok(true)
            }
            _ => Err(RuntimeError::InvalidAbi(
                "Expected structurally compatible operands.",
            )),
        }
    }
    pub fn contains(&mut self, list: &Value, needle: &Value) -> Eval<Value> {
        for value in list.list()? {
            if self.equal(value, needle)? {
                return self.boolean(true);
            }
        }
        self.boolean(false)
    }
    pub fn sort(&mut self, list: &Value) -> Eval<Value> {
        let items = list.list()?;
        self.work(1 + items.len() as u64)?;
        self.materialize(list.units)?;
        let mut source = items.to_vec();
        if items.len() >= 2 {
            self.work(items.len() as u64)?;
            self.allocate(items.len() as u64)?;
            let mut target = source.clone();
            let mut width = 1;
            while width < items.len() {
                for start in (0..items.len()).step_by(2 * width) {
                    let middle = (start + width).min(items.len());
                    let end = (start + 2 * width).min(items.len());
                    let (mut left, mut right) = (start, middle);
                    for slot in &mut target[start..end] {
                        self.work(1)?;
                        if left < middle
                            && (right == end
                                || self.compare(&source[left], &source[right])?
                                    != Ordering::Greater)
                        {
                            *slot = source[left].clone();
                            left += 1;
                        } else {
                            *slot = source[right].clone();
                            right += 1;
                        }
                    }
                }
                std::mem::swap(&mut source, &mut target);
                width *= 2;
            }
        }
        Ok(Value {
            data: Rc::new(ValueData::List(source)),
            units: list.units,
        })
    }
    pub fn export(&mut self, value: &Value) -> Eval<OwnedValue> {
        self.materialize(value.units)?;
        self.copy_output(value)
    }
    fn copy_output(&mut self, value: &Value) -> Eval<OwnedValue> {
        Ok(match value.data() {
            ValueData::Null => {
                self.work(1)?;
                OwnedValue::Null
            }
            ValueData::Boolean(value) => {
                self.work(1)?;
                OwnedValue::Boolean(*value)
            }
            ValueData::Integer(value) => {
                self.work(1)?;
                OwnedValue::Integer(*value)
            }
            ValueData::String(value) => {
                self.work(1 + value.len() as u64)?;
                OwnedValue::String(value.clone())
            }
            ValueData::List(items) => {
                self.work(1 + items.len() as u64)?;
                OwnedValue::List(
                    items
                        .iter()
                        .map(|v| self.copy_output(v))
                        .collect::<Eval<_>>()?,
                )
            }
            ValueData::Record(fields) => {
                self.work(1 + fields.len() as u64)?;
                OwnedValue::Record(
                    fields
                        .iter()
                        .map(|(key, value)| {
                            self.work(key.len() as u64)?;
                            Ok((key.clone(), self.copy_output(value)?))
                        })
                        .collect::<Eval<_>>()?,
                )
            }
        })
    }
}
