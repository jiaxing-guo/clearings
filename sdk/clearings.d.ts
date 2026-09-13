/** Authoring declarations. Runtime schemas validate JSON; transpilation does not type-check. */
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Outcome<T extends Json = Json> =
  | { status: 'completed'; output: T }
  | { status: 'not_applicable'; reason: string }
  | { status: 'needs_agent'; reason: string; context: Json }
  | { status: 'failed'; code: string; message: string };

declare const clearings: {
  call(name: 'files.read', input: { root: string; path: string }): Promise<{ text: string }>;
  call(name: 'files.list', input: { root: string; path: string }): Promise<{ entries: string[] }>;
};

// Each routine default-exports one async function accepting JSON and returning Outcome.
// Module imports, Node APIs, package installation, and ambient filesystem/network I/O
// are unavailable. Use only the capability bindings granted by the host.
