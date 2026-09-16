//! Host-owned instructions, embedded at build time. Structured task data stays with callers.

pub(crate) const EXTRACT_WORKFLOW: &str = include_str!("../prompts/learning/extract-workflow.txt");
pub(crate) const REPAIR_CANDIDATE: &str = include_str!("../prompts/learning/repair-candidate.txt");
pub(crate) const CANDIDATE_RESPONSE: &str = include_str!("../prompts/model/candidate-response.txt");
pub(crate) const REVISE_ROUTINE: &str = include_str!("../prompts/learning/revise-routine.txt");
pub(crate) const AUTHOR_ROUTINE: &str = include_str!("../prompts/learning/author-routine.txt");
pub(crate) const IMPROVE_ROUTINE: &str = include_str!("../prompts/learning/improve-routine.txt");
pub(crate) const CONFIGURED_AUTHORING: &str =
    include_str!("../prompts/model/configured-authoring.txt");
pub(crate) const RUN_ROUTINE: &str = include_str!("../prompts/agent/run-routine.txt");
pub(crate) const OPEN_PROJECT: &str = include_str!("../prompts/agent/open-project.txt");
pub(crate) const PLUGIN_INSTRUCTIONS: &str =
    include_str!("../prompts/agent/plugin-instructions.txt");
pub(crate) const INVOCATION_HINT: &str = include_str!("../prompts/agent/invocation-hint.txt");
const CLIENT_ENVELOPE: &str = include_str!("../prompts/model/client-envelope.txt");
const CONFIGURED_RESPONSE: &str = include_str!("../prompts/model/configured-response.txt");

pub(crate) fn client_request(packet: &serde_json::Value) -> String {
    format!("{CLIENT_ENVELOPE} {packet}")
}

pub(crate) fn configured_response(field: &str) -> String {
    CONFIGURED_RESPONSE.replace("{field}", field)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn client_packet_is_appended_verbatim() {
        let packet = r#"{"source":"雪\n{field} {}"}"#;
        assert_eq!(
            client_request(&serde_json::from_str(packet).unwrap()),
            format!("{CLIENT_ENVELOPE} {packet}")
        );
    }

    #[test]
    fn configured_response_substitutes_only_the_field() {
        assert_eq!(CONFIGURED_RESPONSE.matches("{field}").count(), 1);
        for field in ["source", "candidate_json", "{field}"] {
            let (before, after) = CONFIGURED_RESPONSE.split_once("{field}").unwrap();
            assert_eq!(
                configured_response(field),
                format!("{before}{field}{after}")
            );
        }
    }
}
