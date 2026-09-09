# Improve ordered dependency closure in Program IR

Implement a more efficient ordered required dependency-closure algorithm in the existing Program IR v0.1. The committed baseline is statically valid and executes correctly on small inputs, but uses substantial logical work and allocation on larger graphs.

Read the supplied operation contract, language semantics, and execution-accounting reference. Preserve returned values, breadth-first discovery with UTF-16 target ordering, root order, first-duplicate failure precedence, missing-record failure order, and input ownership. The algorithm must remain executable IR. Authoring JavaScript may construct syntax; it must not accept invocation graphs or compute the result. Do not change the language, runtime, compiler, accounting rules, or limits. Diagnostic paths and function names may change with the implementation.

Performance requirements use the existing maximum execution limits. Chains of 512 records must return, including reversed declaration order. Reduce work on a 256-record chain by at least 25% relative to the baseline. Other workloads cover stars, cycles, duplicate edges, and a small reached closure in a larger record inventory. Existing bounded semantic tests must continue to pass. Exact evaluation instances are withheld.

Work only inside the supplied candidate workspace. Do not read sibling directories, repository history, benchmark archives, evaluation files, or network resources. No conversation history or evaluator feedback is supplied. Shared-filesystem separation is by protocol, not an operating-system security boundary.

Only modify `programs/clearings/required-dependency-closure.mjs` and its generated `.json`. You may create your own local development tests and notes. Use the supplied `scripts/build-required-closure-program.mjs` to reproduce the JSON. Import the supplied package's `clearings/program` for validation and reference execution. Rust is available at `/root/.cargo/bin`; native checks are permitted through the supplied package.

Submit one final candidate after your own development checks. Do not access withheld evaluation after submission or revise the candidate from its results. Record your algorithm, checks, known limitations, and changed files in `SUBMISSION.md`. Report the exact program identity. Completion means delivering a candidate; independent evaluation determines acceptance.
