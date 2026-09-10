fn main() {
    let schema = schemars::schema_for!(clearings_core::Protocol);
    println!(
        "{}",
        serde_json::to_string_pretty(&schema).expect("schema serialization")
    );
}
