//! Versioned authoring data. Validation precedes immutable task preparation.
use crate::store::Task;
use anyhow::{Context, Result, ensure};
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    schema_version: u32,
    candidate: Option<Candidate>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Candidate {
    pub task: Task,
    pub applicability: String,
}
pub(crate) fn parse(value: Value) -> Result<Option<Candidate>> {
    ensure!(
        value.get("candidate").is_some(),
        "candidate field is required (use null for no proposal)"
    );
    if let Some(cases) = value["candidate"]["task"]["cases"].as_array() {
        for (index, case) in cases.iter().enumerate().take(9) {
            let _: crate::store::Case = serde_json::from_value(case.clone())
                .with_context(|| format!("candidate.task.cases[{index}]"))?;
        }
    }
    let envelope: Envelope = serde_json::from_value(value).context("candidate response")?;
    ensure!(envelope.schema_version == 1, "schema_version must be 1");
    if let Some(candidate) = &envelope.candidate {
        ensure!(
            !candidate.applicability.trim().is_empty() && candidate.applicability.len() <= 4000,
            "candidate.applicability must contain 1 to 4000 bytes of plain text"
        );
        let task = &candidate.task;
        ensure!(
            task.evidence.is_none() && task.project.is_none(),
            "candidate.task must omit host-owned project and evidence"
        );
        ensure!(
            (3..=8).contains(&task.cases.len()),
            "candidate.task.cases must contain 3 to 8 varied cases"
        );
        ensure!(
            task.contract
                .capabilities
                .iter()
                .all(|c| matches!(c.as_str(), "files.read" | "files.list")),
            "candidate.task.contract.capabilities supports only files.read and files.list"
        );
        task.validate()?;
    }
    Ok(envelope.candidate)
}

/// Preserve extraction evidence and constraints, using repair-specific instructions.
/// The shorter instruction reserves room even at the native request byte boundary.
pub(crate) fn repair_packet(
    mut extraction: Value,
    invalid: Value,
    error: &str,
    connection: Option<&crate::project::ModelConnection>,
) -> Result<Value> {
    let fits = |packet: &Value| -> Result<bool> {
        if serde_json::to_vec(packet)?.len() > 480 * 1024 {
            return Ok(false);
        }
        if let Some(connection) = connection {
            match crate::model::configured_request(connection, packet, "candidate") {
                Ok(_) => {}
                Err(error) if error.is::<crate::model::RequestTooLarge>() => return Ok(false),
                Err(error) => return Err(error),
            }
        }
        Ok(true)
    };
    extraction["instruction"] = json!(crate::prompts::REPAIR_CANDIDATE);
    extraction["validation_error"] = json!(error.chars().take(128).collect::<String>());
    extraction["invalid_response"] = invalid.clone();
    if fits(&extraction)? {
        return Ok(extraction);
    }
    let text = invalid.to_string();
    extraction["invalid_response"] = json!({"excerpt":"","truncated":true});
    ensure!(fits(&extraction)?, "repair evidence exceeds request limit");
    // Bound the encoded JSON, including quotes, escapes and Unicode boundaries.
    let mut low = 0;
    let mut high = text.len();
    while low < high {
        let middle = low + (high - low).div_ceil(2);
        let mut end = middle;
        while !text.is_char_boundary(end) {
            end -= 1;
        }
        extraction["invalid_response"]["excerpt"] = json!(&text[..end]);
        if fits(&extraction)? {
            low = middle;
        } else {
            high = middle - 1;
        }
    }
    while !text.is_char_boundary(low) {
        low -= 1;
    }
    extraction["invalid_response"]["excerpt"] = json!(&text[..low]);
    Ok(extraction)
}

pub(crate) fn response_schema(field: &str) -> Value {
    if field != "candidate" {
        return json!({"type":"object","properties":{field:{"type":"string"}},"required":[field],"additionalProperties":false});
    }
    json!({"type":"object","properties":{
        "schema_version":{"type":"integer","const":1},
        "candidate":{"anyOf":[{"type":"null"},{"type":"object","properties":{
            "applicability":{"type":"string"},
            "task":{"type":"object","properties":{
                "contract":{"type":"object","properties":{
                    "abi":{"type":"integer","const":1},"name":{"type":"string"},"description":{"type":"string"},
                    "input_schema":{"type":"object"},"output_schema":{"type":"object"},
                    "capabilities":{"type":"array","items":{"enum":["files.read","files.list"]}}
                },"required":["abi","name","description","input_schema","output_schema","capabilities"],"additionalProperties":false},
                "cases":{"type":"array","minItems":3,"maxItems":8,"items":{"type":"object","properties":{
                    "name":{"type":"string"},"input":{},"expected":{"type":"object","properties":{"status":{"enum":["completed","needs_agent","not_applicable","failed"]},"output":{},"reason":{"type":"string"},"context":{},"code":{"type":"string"},"message":{"type":"string"}},"required":["status"],"additionalProperties":false},
                    "calls":{"type":"array","items":{"type":"object","properties":{"name":{"enum":["files.read","files.list"]},"input":{"type":"object"},"result":{}},"required":["name","input","result"],"additionalProperties":false}}
                },"required":["name","input","expected","calls"],"additionalProperties":false}},
                "evaluation":{"enum":["exact_calls","read_only_behavior"]}
            },"required":["contract","cases","evaluation"],"additionalProperties":false}
        },"required":["task","applicability"],"additionalProperties":false}]}
    },"required":["schema_version","candidate"],"additionalProperties":false})
}

pub(crate) fn decode(text: &str, field: &str) -> Result<Value> {
    match serde_json::from_str(text) {
        Ok(value) => Ok(value),
        Err(error) if field == "candidate" => {
            Ok(json!({"invalid_json":text,"parse_error":error.to_string()}))
        }
        Err(error) => Err(error.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn repair_preserves_boundary_sized_evidence_and_bounds_escaped_diagnostics() {
        let mut extraction = json!({"instruction":crate::prompts::EXTRACT_WORKFLOW,"conversations":"","sdk":{"kept":true},"learning_mode":"explicit"});
        let overhead = serde_json::to_vec(&extraction).unwrap().len();
        extraction["conversations"] = json!("x".repeat(480 * 1024 - overhead));
        assert_eq!(serde_json::to_vec(&extraction).unwrap().len(), 480 * 1024);
        let invalid = json!({"bad":"\\\"\n雪".repeat(100_000)});
        let repair = repair_packet(extraction.clone(), invalid, &"\n".repeat(2048), None).unwrap();
        assert!(serde_json::to_vec(&repair).unwrap().len() <= 480 * 1024);
        assert_eq!(repair["conversations"], extraction["conversations"]);
        assert_eq!(repair["sdk"], extraction["sdk"]);
        assert_eq!(repair["learning_mode"], "explicit");
        assert_eq!(repair["invalid_response"]["truncated"], true);
        assert!(
            !repair["invalid_response"]["excerpt"]
                .as_str()
                .unwrap()
                .is_empty()
        );
    }
    #[test]
    fn repair_bounds_the_final_configured_body_after_double_escaping() {
        let connection = crate::project::ModelConnection {
            url: "http://127.0.0.1/chat".into(),
            model: "test".into(),
            bearer_token_env: None,
            max_output_tokens: 1024,
            input_price: 1,
            output_price: 1,
        };
        let extraction = json!({"instruction":crate::prompts::EXTRACT_WORKFLOW,"conversations":"x".repeat(400 * 1024)});
        let invalid = json!({"bad":"\"\\".repeat(100_000)});
        let native = repair_packet(
            extraction.clone(),
            invalid.clone(),
            "Invalid candidate",
            None,
        )
        .unwrap();
        assert!(crate::model::configured_request(&connection, &native, "candidate").is_err());
        let configured = repair_packet(
            extraction.clone(),
            invalid,
            "Invalid candidate",
            Some(&connection),
        )
        .unwrap();
        assert_eq!(configured["conversations"], extraction["conversations"]);
        assert!(serde_json::to_vec(&configured).unwrap().len() <= 480 * 1024);
        assert!(
            crate::model::configured_request(&connection, &configured, "candidate")
                .unwrap()
                .len()
                <= 512 * 1024
        );
    }
    #[test]
    fn no_candidate_requires_an_explicit_version_and_field() {
        assert!(
            parse(json!({"schema_version":1,"candidate":null}))
                .unwrap()
                .is_none()
        );
        assert!(parse(json!({"schema_version":1})).is_err());
        assert!(parse(json!({"schema_version":2,"candidate":null})).is_err());
        assert!(parse(json!({"schema_version":1,"candidate":"null"})).is_err());
    }
    #[test]
    fn malformed_json_is_retained_only_for_candidate_repair() {
        let value = decode("{broken", "candidate").unwrap();
        assert_eq!(value["invalid_json"], "{broken");
        assert!(value["parse_error"].is_string());
        assert!(parse(value).is_err());
        assert!(decode("{broken", "source").is_err());
    }
    #[test]
    fn host_owned_fields_cannot_be_proposed() {
        let task = json!({"project":"forged","contract":{"abi":1,"name":"echo","description":"Echo","input_schema":{},"output_schema":{},"capabilities":[]},"cases":[{"name":"one","input":1,"expected":{"status":"completed","output":1}},{"name":"two","input":2,"expected":{"status":"completed","output":2}},{"name":"three","input":3,"expected":{"status":"completed","output":3}}]});
        assert!(
            parse(
                json!({"schema_version":1,"candidate":{"task":task,"applicability":"Any number"}})
            )
            .err()
            .unwrap()
            .to_string()
            .contains("host-owned")
        );
    }
}
