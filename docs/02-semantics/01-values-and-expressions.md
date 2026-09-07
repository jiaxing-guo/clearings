# Values and expressions

The v0.3 expression language is a closed, typed AST. [Expression definitions](../../src/specification/model.ts) specify its syntax; [the interpreter and type checker](../../src/specification/expressions.ts) implement evaluation and typing. No expression string, JavaScript function, or target source is executed.

## Value domains

| Type | Accepted values |
| --- | --- |
| `boolean` | `true` or `false` |
| `string` | JSON strings |
| `integer` | JavaScript safe integers, from `-(2^53 - 1)` through `2^53 - 1` |
| `number` | Finite JavaScript numbers |
| `null` | JSON `null` |
| `enum` | One of the declared string values |
| `list` | A homogeneous list matching its element type; an empty list is allowed |
| `record` | Exactly the declared own fields, each matching its type |

Records have no implicit optional fields, open extension fields, or nullable union type. Additional properties are invalid. Missing observation fields are handled by the observation protocol; they are not a value of a declared type. `undefined`, `NaN`, infinities, cyclic objects, sparse arrays, accessors, and non-JSON objects are not portable inputs.

The structural guard permits ordinary objects and null-prototype objects, but rejects symbol keys and hidden properties. Object cycles are invalid; cycles between operations use string references. See [validation limits](../03-reference/01-identity-and-validation.md).

## Evaluation result

`evaluateExpression(expression, environment, maxSteps?)` returns either `{ known: true, value }` or `{ known: false, reason }`. An unknown result is not Boolean false. Reasons include missing observations, an opaque predicate, or exhausted evaluation work.

Specification validation establishes expression types before operation checking. Direct callers of `evaluateExpression` are responsible for supplying valid typed expressions and environments. The evaluator is not a substitute for specification validation.

## Operators

| Kind | Semantics |
| --- | --- |
| `literal` | Return the supplied JSON value. |
| `ref` | Resolve a root and record-field path through own properties. An empty path returns the root value. Missing values return unknown; list indexing is not supported. |
| `not` | Boolean negation; unknown remains unknown. |
| `all` | Conjunction: a known false dominates unknown; otherwise unknown dominates true. Empty conjunction is true. |
| `any` | Disjunction: a known true dominates unknown; otherwise unknown dominates false. Empty disjunction is false. |
| `compare` with `eq`, `ne` | Compare canonical JSON values. Object-key order is irrelevant; array order matters. |
| `compare` with `lt`, `lte`, `gt`, `gte` | Compare numeric operands. |
| `length` | List length or JavaScript string length in UTF-16 code units; not UTF-8 byte length. |
| `unique` | Return whether a list has no duplicate canonical JSON values; it does not return a deduplicated list. |
| `contains` | Test whether `collection` contains the single `value`, using canonical equality. |
| `subset` | Test whether every element of the `value` list occurs in `collection`. Order and multiplicity do not affect membership. |
| `every` | Bind each list element to `local[variable]` and evaluate its Boolean predicate. Empty quantification is true. A false predicate dominates unknown. |
| `reachable` | Return unique IDs reachable from a string root through explicit `{ from, to }` edges, including the root, sorted in default JavaScript string order. |
| `opaque` | Return unknown with the supplied reason. The retained text is not evaluated. |

Boolean evaluation processes terms in array order and short-circuits on a decisive value. Resource limits are operational: an otherwise decidable expression can return unknown when evaluation exhausts its budget.

## References and scope

Roots are `input`, `before`, `after`, `output`, and quantified `local`. Outcome guards may reference inputs and initial state, but not `after` or `output`. Postconditions and update expressions may reference resulting values. Every state reference must name a declared state field in the operation's read or write set; a whole-state root reference is invalid.

`local` exists only inside an `every` predicate. The collection expression is evaluated before the new variable is bound. Nested predicates inherit outer bindings; a repeated variable name shadows that binding only in the nested predicate. A variable does not escape its predicate.

## Static typing

Predicates must have Boolean type. Numeric ordering requires numeric operands. Collection operators require compatible element types. Assignments must be assignable to the declared state type: an integer can enter a number domain, and an enum can enter a string domain; the reverse assignments are not generally valid.

Equality and collection validation reject literal values outside enum and safe-integer domains, including nested records/lists. Equality between disjoint enum domains is invalid. Integer ordering against a fractional bound remains meaningful and valid. These are local type/domain checks; validation does not solve arbitrary satisfiability, outcome exhaustiveness, or implications between predicates.

## Work bounds

The evaluator defaults to 100,000 work steps per call. `checkOperation` invokes it separately for individual guards, rules, and updates. The work count is an implementation budget, not a time bound or a whole-check complexity guarantee. Reachability performs bounded fixed-point expansion over supplied edges; it does not execute operation dependencies. Structural validation imposes additional [depth and node limits](../03-reference/01-identity-and-validation.md).

## Executable semantic distinctions

This trusted reference block checks unknown propagation, empty quantification, UTF-16 string length, subset direction, and cycle-safe reachability through the public evaluator.

```js runnable
import assert from 'node:assert/strict';
import { evaluateExpression } from './dist/index.js';
const literal = value => ({ kind: 'literal', value });
const missing = { kind: 'ref', root: 'output', path: [] };
const evaluate = expression => evaluateExpression(expression, {});
assert.deepEqual(evaluate({ kind: 'all', terms: [missing, literal(false)] }), { known: true, value: false });
assert.deepEqual(evaluate({ kind: 'any', terms: [missing, literal(true)] }), { known: true, value: true });
assert.equal(evaluate({ kind: 'all', terms: [missing, literal(true)] }).known, false);
assert.deepEqual(evaluate({ kind: 'every', collection: literal([]), variable: 'item', predicate: literal(false) }), { known: true, value: true });
assert.deepEqual(evaluate({ kind: 'length', value: literal('😀') }), { known: true, value: 2 });
assert.deepEqual(evaluate({ kind: 'subset', collection: literal([1, 2]), value: literal([2, 2]) }), { known: true, value: true });
assert.deepEqual(evaluate({ kind: 'reachable', root: literal('b'), edges: literal([
  { from: 'b', to: 'a' }, { from: 'a', to: 'b' }, { from: 'z', to: 'z' },
]) }), { known: true, value: ['a', 'b'] });
assert.equal(evaluateExpression(literal(true), {}, 0).known, false);
```
