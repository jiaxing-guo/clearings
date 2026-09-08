//! Fixed driver for freshly compiled Program IR. The input stream contains values, never code.
mod output;
mod program;
mod protocol;

use std::io::{Read, Write};

fn run() -> Result<(), String> {
    let mut bytes = Vec::new();
    std::io::stdin()
        .take(protocol::MAX_INPUT_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Cannot read native input.")?;
    let (args, limits) = protocol::decode(&bytes)?;
    let result = program::execute(&args, limits)
        .map_err(|error| format!("Native execution interface failure: {error:?}"))?;
    let encoded = output::execution(result.limits, result.usage, &result.completion)
        .map_err(|_| "Native result exceeds its transport bound.")?;
    std::io::stdout()
        .write_all(encoded.as_bytes())
        .map_err(|_| "Cannot write native result.")
        .map(|_| ())
        .map_err(String::from)
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
