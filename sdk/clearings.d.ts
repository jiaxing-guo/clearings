/** Authoring declarations. Runtime schemas validate JSON; transpilation does not type-check. */
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Outcome<T extends Json = Json> =
  | { status: 'completed'; output: T }
  | { status: 'not_applicable'; reason: string }
  | { status: 'needs_agent'; reason: string; context: Json }
  | { status: 'failed'; code: string; message: string };

type CapabilityInput<Name extends string> = Name extends 'files.read' | 'files.list'
  ? { root: string; path: string }
  : Json;
type CapabilityOutput<Name extends string> = Name extends 'files.read'
  ? { text: string }
  : Name extends 'files.list'
    ? { entries: string[] }
    : Json;

declare const clearings: {
  /** A policy-bound operation. Requires TypeScript 5.4+ when type-checking source. */
  call<const Name extends string>(
    name: Name,
    input: NoInfer<CapabilityInput<Name>>,
  ): Promise<CapabilityOutput<Name>>;
};

// Each routine default-exports one async function accepting JSON and returning Outcome.
// Module imports, Node APIs, package installation, and ambient filesystem/network I/O
// are unavailable. Use only the capability bindings granted by the host.
