# Native preparation feasibility

One Linux x64 run on 8 September 2026, using Rust 1.85.1, compiler 0.1.1, and the program/native identities in `measurement.json`. Reproduce with `npm run build` followed by `node scripts/measure-native-preparation.mjs` with rustup on PATH. The script prepares once, reopens the cache, and executes chains of 8, 32, 64, 128, and 256 records under the existing maximum logical limits. All five returned.

These timings include public frontend admission, binary verification, process startup, execution, and response decoding. They are a single-run feasibility observation, not a benchmark distribution or speedup claim. Logical allocation counters are recorded; physical child-process memory is not measured. Source/cache identifiers do not establish native-binary reproducibility across hosts.
