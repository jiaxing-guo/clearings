# Clearings

Understand and maintain agent-built codebases through evidence-backed semantic representations.

**Status: prototype planning.** This starter contains the implementation plan, a pinned benchmark, candidate evaluation questions, and a repository creation helper. The TypeScript analyzer and CLI are not implemented yet.

## First prototype

Read an existing local repository and produce a compact overview, capability explanations, and inspectable source evidence. JSON is the machine interface; Markdown and focused Mermaid diagrams are the first human interface.

Start with Hono 4.13.7 at commit eebdf7be39abf0a872671835ccce0c4f03ea497a. Map the source inventory, then explain request dispatch, middleware composition, route registration, router selection, error behavior, and request/response context.

## Read in order

1. [Prototype plan](docs/PROTOTYPE_PLAN.md)
2. [First implementation task](docs/FIRST_IMPLEMENTATION_TASK.md)
3. [Pinned Hono target](benchmarks/targets/hono.json)
4. [Candidate evaluation questions](benchmarks/questions/hono.json)

The benchmark questions are not an adjudicated answer set. Keep evaluator assets outside analyzer input.

## Create the private repository

Requirements: Git, GitHub CLI, Git identity configured, and gh authenticated as jiaxing-guo. From the directory containing this extracted starter:

~~~bash
bash clearings-semantic/scripts/create-private-repo.sh
~~~

The helper creates **jiaxing-guo/clearings-semantic** privately, verifies visibility before pushing, and refuses to overwrite an existing repository. It leaves the existing clearings and clearings-cloud repositories untouched.

No remote repository has been created by downloading this package. Creation occurs only when the helper runs successfully.

## Development direction

TypeScript strict mode, Node.js 24 LTS, one package with internal modules, compiler-backed extraction behind an adapter, model proposals through file exchange, deterministic replay for tests, and JSON/JSONL storage initially. First implement milestones M0-M1; add semantic interpretation after source extraction is reviewable.

## Licensing

The repository starts private. Select the intended open-source license before any public distribution. The starter does not grant or apply a third-party project's license to Clearings.
