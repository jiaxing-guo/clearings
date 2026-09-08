//! Private CLR1 request framing. All sizes are bounded before allocating nested values.
use clearings_runtime::{Limits, OwnedValue, MAX_INTEGER};

pub const MAX_INPUT_BYTES: u64 = 4 * 1024 * 1024;
type Result<T> = std::result::Result<T, &'static str>;

struct Reader<'a> {
    bytes: &'a [u8],
    offset: usize,
    nodes: usize,
}
impl Reader<'_> {
    fn take(&mut self, count: usize) -> Result<&[u8]> {
        let end = self
            .offset
            .checked_add(count)
            .ok_or("Invalid request length.")?;
        let bytes = self
            .bytes
            .get(self.offset..end)
            .ok_or("Truncated native request.")?;
        self.offset = end;
        Ok(bytes)
    }
    fn count(&mut self) -> Result<usize> {
        Ok(u32::from_le_bytes(self.take(4)?.try_into().unwrap()) as usize)
    }
    fn number(&mut self) -> Result<u64> {
        Ok(u64::from_le_bytes(self.take(8)?.try_into().unwrap()))
    }
    fn text(&mut self) -> Result<Vec<u16>> {
        let count = self.count()?;
        if count > 1_000_000 {
            return Err("Native string exceeds its bound.");
        }
        Ok(self
            .take(count * 2)?
            .chunks_exact(2)
            .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
            .collect())
    }
    fn value(&mut self, depth: usize) -> Result<OwnedValue> {
        self.nodes += 1;
        if self.nodes > 50_000 || depth > 64 {
            return Err("Native input exceeds its structural bound.");
        }
        match self.take(1)?[0] {
            0 => Ok(OwnedValue::Null),
            1 => Ok(OwnedValue::Boolean(false)),
            2 => Ok(OwnedValue::Boolean(true)),
            3 => {
                let n = i64::from_le_bytes(self.take(8)?.try_into().unwrap());
                if !(-MAX_INTEGER..=MAX_INTEGER).contains(&n) {
                    return Err("Invalid native integer.");
                }
                Ok(OwnedValue::Integer(n))
            }
            4 => Ok(OwnedValue::String(self.text()?)),
            tag @ (5 | 6) => {
                let count = self.count()?;
                if count > 50_000 - self.nodes {
                    return Err("Native collection exceeds its bound.");
                }
                if tag == 5 {
                    let mut values = Vec::new();
                    for _ in 0..count {
                        values.push(self.value(depth + 1)?);
                    }
                    Ok(OwnedValue::List(values))
                } else {
                    let mut fields = Vec::new();
                    for _ in 0..count {
                        fields.push((self.text()?, self.value(depth + 1)?));
                    }
                    Ok(OwnedValue::Record(fields))
                }
            }
            _ => Err("Unknown native value tag."),
        }
    }
}

pub fn decode(bytes: &[u8]) -> Result<(Vec<OwnedValue>, Limits)> {
    if bytes.len() as u64 > MAX_INPUT_BYTES {
        return Err("Native request exceeds 4 MiB.");
    }
    let mut reader = Reader {
        bytes,
        offset: 0,
        nodes: 0,
    };
    if reader.take(4)? != b"CLR1" {
        return Err("Unknown native request version.");
    }
    let limits = Limits {
        work: reader.number()?,
        allocation_units: reader.number()?,
        value_units: reader.number()?,
        evaluation_depth: reader.number()?,
    };
    let OwnedValue::List(args) = reader.value(0)? else {
        return Err("Expected native argument array.");
    };
    if reader.offset != bytes.len() {
        return Err("Trailing native request bytes.");
    }
    Ok((args, limits))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request() -> Vec<u8> {
        let mut bytes = b"CLR1".to_vec();
        for n in [1u64, 2, 3, 4] {
            bytes.extend(n.to_le_bytes());
        }
        bytes.extend([5, 0, 0, 0, 0]);
        bytes
    }
    #[test]
    fn framing_rejects_truncation_trailing_data_and_unbounded_lengths() {
        let bytes = request();
        assert!(decode(&bytes).is_ok());
        for end in 0..bytes.len() {
            assert!(decode(&bytes[..end]).is_err());
        }
        let mut bad = bytes.clone();
        bad.push(0);
        assert!(decode(&bad).is_err());
        bad = bytes.clone();
        bad[0] = 0;
        assert!(decode(&bad).is_err());
        bad = bytes.clone();
        bad[37..41].copy_from_slice(&u32::MAX.to_le_bytes());
        assert!(decode(&bad).is_err());
        bad = bytes;
        bad[36] = 99;
        assert!(decode(&bad).is_err());
    }
    #[test]
    fn utf16_preserves_unpaired_surrogates() {
        let mut bytes = request();
        bytes[37] = 1;
        bytes.extend([4, 1, 0, 0, 0, 0, 216]);
        assert_eq!(
            decode(&bytes).unwrap().0,
            vec![OwnedValue::String(vec![0xd800])]
        );
    }
}
