use crate::{IrString, OwnedValue, MAX_INTEGER};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Type {
    Null,
    Boolean,
    Integer,
    String,
    List(Box<Type>),
    Record(Vec<(IrString, Type)>),
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InputError {
    pub path: String,
    pub rule: &'static str,
}
fn error(path: &str, rule: &'static str) -> InputError {
    InputError {
        path: path.into(),
        rule,
    }
}

/// Validate owned arguments before metered import. Types come from the checked compiler.
/// JSON decoding must preserve UTF-16 units; no host JSON parser is implied by this ABI.
pub fn prepare_arguments(
    arguments: &[OwnedValue],
    types: &[Type],
) -> Result<Vec<OwnedValue>, InputError> {
    let (mut nodes, mut units) = (1u64, 1u64); // The positional argument array is a value too.
    fn bounded(
        value: &OwnedValue,
        depth: u64,
        nodes: &mut u64,
        units: &mut u64,
    ) -> Result<(), InputError> {
        *nodes += 1;
        *units += 1;
        if *nodes > 50_000 || depth > 64 {
            return Err(error("/arguments", "portability"));
        }
        match value {
            OwnedValue::String(text) => *units += text.len() as u64,
            OwnedValue::List(items) => {
                for item in items {
                    bounded(item, depth + 1, nodes, units)?;
                }
            }
            OwnedValue::Record(fields) => {
                for (name, value) in fields {
                    *units += name.len() as u64;
                    if *units > 1_000_000 {
                        return Err(error("/arguments", "input-limit"));
                    }
                    bounded(value, depth + 1, nodes, units)?;
                }
            }
            _ => (),
        }
        if *units > 1_000_000 {
            return Err(error("/arguments", "input-limit"));
        }
        Ok(())
    }
    // Match reference precedence: portability for the entire input before input-unit limits.
    fn portable(value: &OwnedValue, depth: u64, nodes: &mut u64) -> Result<(), InputError> {
        *nodes += 1;
        if *nodes > 50_000 || depth > 64 {
            return Err(error("/arguments", "portability"));
        }
        match value {
            OwnedValue::List(items) => {
                for value in items {
                    portable(value, depth + 1, nodes)?;
                }
            }
            OwnedValue::Record(fields) => {
                for (_, value) in fields {
                    portable(value, depth + 1, nodes)?;
                }
            }
            _ => (),
        }
        Ok(())
    }
    for value in arguments {
        portable(value, 1, &mut nodes)?;
    }
    nodes = 1;
    for value in arguments {
        bounded(value, 1, &mut nodes, &mut units)?;
    }
    if arguments.len() != types.len() {
        return Err(error("/arguments", "arity"));
    }
    fn check(value: &OwnedValue, ty: &Type, path: &str) -> Result<OwnedValue, InputError> {
        match (value, ty) {
            (OwnedValue::Null, Type::Null)
            | (OwnedValue::Boolean(_), Type::Boolean)
            | (OwnedValue::String(_), Type::String) => Ok(value.clone()),
            (OwnedValue::Integer(n), Type::Integer) if (-MAX_INTEGER..=MAX_INTEGER).contains(n) => {
                Ok(value.clone())
            }
            (OwnedValue::List(items), Type::List(element)) => Ok(OwnedValue::List(
                items
                    .iter()
                    .enumerate()
                    .map(|(i, value)| check(value, element, &format!("{path}/{i}")))
                    .collect::<Result<_, _>>()?,
            )),
            (OwnedValue::Record(fields), Type::Record(declarations)) => {
                let mut fields: Vec<_> = fields.iter().collect();
                fields.sort_by(|a, b| a.0.cmp(&b.0));
                if fields.len() != declarations.len()
                    || fields.windows(2).any(|pair| pair[0].0 == pair[1].0)
                {
                    return Err(error(path, "type"));
                }
                let mut declarations: Vec<_> = declarations.iter().collect();
                declarations.sort_by(|a, b| a.0.cmp(&b.0));
                if fields
                    .iter()
                    .zip(&declarations)
                    .any(|(field, declaration)| field.0 != declaration.0)
                {
                    return Err(error(path, "type"));
                }
                Ok(OwnedValue::Record(
                    fields
                        .into_iter()
                        .zip(declarations)
                        .map(|((name, value), (_, ty))| {
                            let key = String::from_utf16(name).map_err(|_| error(path, "type"))?;
                            Ok((name.clone(), check(value, ty, &format!("{path}/{key}"))?))
                        })
                        .collect::<Result<_, _>>()?,
                ))
            }
            _ => Err(error(path, "type")),
        }
    }
    arguments
        .iter()
        .zip(types)
        .enumerate()
        .map(|(i, (value, ty))| check(value, ty, &format!("/arguments/{i}")))
        .collect()
}
