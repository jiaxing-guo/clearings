# Follow a request through middleware

Middleware functions share one Context\. Each function can call next\(\) to enter the next function\. This guide follows that call and the return path\.

[src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

Recorded example · Partial repository view · Needs independent review

[Overview version](middleware-composition.overview.md)

<a id="example"></a>

## Start with two functions that wait

Assume both middleware functions use await next\(\), and later work returns normally\. The second function resumes before the first\. This is an example, not an observed execution\.

[src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370) · [Scope note 3](#unknown-2)

<a id="guide-start"></a>
<a id="stage-start"></a>
<a id="stage-guard"></a>

## First, start a fresh run

compose returns a runner\. Each runner call creates its own index, sets it to \-1, and starts dispatch at index zero\.

Before selecting a handler, dispatch requires its index to be greater than the previous one\. A repeated or backward index raises an Error\.

Source excerpt: [src/compose\.ts:21–23](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

Partial excerpt. Code before and after this range is omitted.

```typescript
    let index = -1

    return dispatch(0)
```

<details>
<summary>Show surrounding source · lines 15–73</summary>

```typescript
compose = <E extends Env = Env>(
  middleware: [[Function, unknown], unknown][] | [[Function]][],
  onError?: ErrorHandler<E>,
  onNotFound?: NotFoundHandler<E>
): ((context: Context, next?: Next) => Promise<Context>) => {
  return (context, next) => {
    let index = -1

    return dispatch(0)

    /**
     * Dispatch the middleware functions.
     *
     * @param {number} i - The current index in the middleware array.
     *
     * @returns {Promise<Context>} - A promise that resolves to the context.
     */
    async function dispatch(i: number): Promise<Context> {
      if (i <= index) {
        throw new Error('next() called multiple times')
      }
      index = i

      let res
      let isError = false
      let handler

      if (middleware[i]) {
        handler = middleware[i][0][0]
        context.req.routeIndex = i
      } else {
        handler = (i === middleware.length && next) || undefined
      }

      if (handler) {
        try {
          res = await handler(context, () => dispatch(i + 1))
        } catch (err) {
          if (err instanceof Error && onError) {
            context.error = err
            res = await onError(err, context)
            isError = true
          } else {
            throw err
          }
        }
      } else {
        if (context.finalized === false && onNotFound) {
          res = await onNotFound(context)
        }
      }

      if (res && (context.finalized === false || isError)) {
        context.res = res
      }
      return context
    }
  }
}
```

</details>

Sources: [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

Implementation: [Nested middleware dispatch](#function-03f326d3-1de0-4410-808f-b673a2c4cfb3), [compose](#function-92019dfa-b10c-4b1a-8ba3-914084ae947c), [Returned composition runner](#function-bc6399ac-1a94-4541-b51b-4cc6cc66aea8)

<a id="guide-next"></a>
<a id="stage-call"></a>

## Then, follow next\(\) into the next function

dispatch selects the middleware handler and updates context\.req\.routeIndex\. At exactly middleware\.length, it can select the supplied outer next callback\.

The callback passed to the handler calls dispatch\(i \+ 1\)\. It uses the same context, so later work can update shared response state\.

The dispatcher waits for the handler result\. If the handler uses await next\(\), it waits for the child dispatch before continuing\.

Source excerpt: [src/compose\.ts:51–51](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

Partial excerpt. Code before and after this range is omitted.

```typescript
          res = await handler(context, () => dispatch(i + 1))
```

<details>
<summary>Show surrounding source · lines 15–73</summary>

```typescript
compose = <E extends Env = Env>(
  middleware: [[Function, unknown], unknown][] | [[Function]][],
  onError?: ErrorHandler<E>,
  onNotFound?: NotFoundHandler<E>
): ((context: Context, next?: Next) => Promise<Context>) => {
  return (context, next) => {
    let index = -1

    return dispatch(0)

    /**
     * Dispatch the middleware functions.
     *
     * @param {number} i - The current index in the middleware array.
     *
     * @returns {Promise<Context>} - A promise that resolves to the context.
     */
    async function dispatch(i: number): Promise<Context> {
      if (i <= index) {
        throw new Error('next() called multiple times')
      }
      index = i

      let res
      let isError = false
      let handler

      if (middleware[i]) {
        handler = middleware[i][0][0]
        context.req.routeIndex = i
      } else {
        handler = (i === middleware.length && next) || undefined
      }

      if (handler) {
        try {
          res = await handler(context, () => dispatch(i + 1))
        } catch (err) {
          if (err instanceof Error && onError) {
            context.error = err
            res = await onError(err, context)
            isError = true
          } else {
            throw err
          }
        }
      } else {
        if (context.finalized === false && onNotFound) {
          res = await onNotFound(context)
        }
      }

      if (res && (context.finalized === false || isError)) {
        context.res = res
      }
      return context
    }
  }
}
```

</details>

Sources: [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370) · [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5) · [Scope note 3](#unknown-2)

Implementation: [Nested middleware dispatch](#function-03f326d3-1de0-4410-808f-b673a2c4cfb3), [Recursive middleware continuation](#function-a30d9cc8-bde8-4f72-8469-44f9b1e91a23), [Selected application handler](#function-d888d262-67d4-4c35-a3d3-b88a00f3deb6), [Supplied outer continuation](#function-e677a038-abee-4d92-8888-4b401adf7370)

<a id="guide-response"></a>
<a id="stage-response"></a>

## As calls complete, select the response state

A truthy result updates context\.res only when the context is not finalized or the result came from onError\.

A normal result therefore keeps an already finalized response\. A truthy onError result can replace it\. A falsy result makes no assignment\.

If no handler is selected, onNotFound runs only when finalized is false and the callback exists\. A completed dispatch call returns the shared context\.

Source excerpt: [src/compose\.ts:67–70](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

Partial excerpt. Code before and after this range is omitted.

```typescript
      if (res && (context.finalized === false || isError)) {
        context.res = res
      }
      return context
```

<details>
<summary>Show surrounding source · lines 15–73</summary>

```typescript
compose = <E extends Env = Env>(
  middleware: [[Function, unknown], unknown][] | [[Function]][],
  onError?: ErrorHandler<E>,
  onNotFound?: NotFoundHandler<E>
): ((context: Context, next?: Next) => Promise<Context>) => {
  return (context, next) => {
    let index = -1

    return dispatch(0)

    /**
     * Dispatch the middleware functions.
     *
     * @param {number} i - The current index in the middleware array.
     *
     * @returns {Promise<Context>} - A promise that resolves to the context.
     */
    async function dispatch(i: number): Promise<Context> {
      if (i <= index) {
        throw new Error('next() called multiple times')
      }
      index = i

      let res
      let isError = false
      let handler

      if (middleware[i]) {
        handler = middleware[i][0][0]
        context.req.routeIndex = i
      } else {
        handler = (i === middleware.length && next) || undefined
      }

      if (handler) {
        try {
          res = await handler(context, () => dispatch(i + 1))
        } catch (err) {
          if (err instanceof Error && onError) {
            context.error = err
            res = await onError(err, context)
            isError = true
          } else {
            throw err
          }
        }
      } else {
        if (context.finalized === false && onNotFound) {
          res = await onNotFound(context)
        }
      }

      if (res && (context.finalized === false || isError)) {
        context.res = res
      }
      return context
    }
  }
}
```

</details>

Sources: [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370) · [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

Implementation: [Context\.notFound](#function-01860b94-d1f5-4de4-a585-e2c80ae4c52e), [Nested middleware dispatch](#function-03f326d3-1de0-4410-808f-b673a2c4cfb3), [Configured not\-found callback](#function-2ed115cb-3d2d-4d04-9657-d8829ba4ee56), [Context not\-found fallback arrow](#function-49d6bd1e-9aaf-4234-8f34-2aa0011e86b4), [Context\.res setter](#function-9cb45f6c-5651-4587-89b1-acc02a5e7fb3), [Context\.res getter](#function-e4635ca2-ec40-4091-ad54-7be94f4c32ba)

<a id="guide-errors"></a>
<a id="stage-failure"></a>

## If a call fails, check which frame can catch it

The handler catch invokes onError only for an Error instance when that callback exists\. It first stores the Error in context\.error\.

Other thrown values are rethrown\. A failure inside onError also escapes the current catch\.

The repeated\-next guard and not\-found callback are outside the current handler catch block\. An awaiting parent may still catch a child failure\.

Source excerpt: [src/compose\.ts:50–60](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

Partial excerpt. Code before and after this range is omitted.

```typescript
        try {
          res = await handler(context, () => dispatch(i + 1))
        } catch (err) {
          if (err instanceof Error && onError) {
            context.error = err
            res = await onError(err, context)
            isError = true
          } else {
            throw err
          }
        }
```

<details>
<summary>Show surrounding source · lines 15–73</summary>

```typescript
compose = <E extends Env = Env>(
  middleware: [[Function, unknown], unknown][] | [[Function]][],
  onError?: ErrorHandler<E>,
  onNotFound?: NotFoundHandler<E>
): ((context: Context, next?: Next) => Promise<Context>) => {
  return (context, next) => {
    let index = -1

    return dispatch(0)

    /**
     * Dispatch the middleware functions.
     *
     * @param {number} i - The current index in the middleware array.
     *
     * @returns {Promise<Context>} - A promise that resolves to the context.
     */
    async function dispatch(i: number): Promise<Context> {
      if (i <= index) {
        throw new Error('next() called multiple times')
      }
      index = i

      let res
      let isError = false
      let handler

      if (middleware[i]) {
        handler = middleware[i][0][0]
        context.req.routeIndex = i
      } else {
        handler = (i === middleware.length && next) || undefined
      }

      if (handler) {
        try {
          res = await handler(context, () => dispatch(i + 1))
        } catch (err) {
          if (err instanceof Error && onError) {
            context.error = err
            res = await onError(err, context)
            isError = true
          } else {
            throw err
          }
        }
      } else {
        if (context.finalized === false && onNotFound) {
          res = await onNotFound(context)
        }
      }

      if (res && (context.finalized === false || isError)) {
        context.res = res
      }
      return context
    }
  }
}
```

</details>

Sources: [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370) · [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2) · [Scope note 4](#unknown-3)

Implementation: [Nested middleware dispatch](#function-03f326d3-1de0-4410-808f-b673a2c4cfb3), [Configured error callback](#function-98d308f3-506e-458a-9b99-bfe76154df29)

## Follow a call into the next middleware and back

Example: two middleware handlers use await next\(\), and the last handler returns normally\. This is a possible sequence, not an observed execution\.

| Order | From | To | Action | Kind | Claims |
| --- | --- | --- | --- | --- | --- |
| 1 | First middleware | Second middleware | await next\(\) | call | [C24](#claim-87cd957c-bb51-49fe-b9a4-291c106e08c5), [C1](#claim-005c1ad3-dcc5-4f77-b36f-7ee4a420f22c) |
| 2 | Second middleware | Last handler | await next\(\) | call | [C24](#claim-87cd957c-bb51-49fe-b9a4-291c106e08c5), [C1](#claim-005c1ad3-dcc5-4f77-b36f-7ee4a420f22c) |
| 3 | Last handler | Second middleware | Child dispatch completes | return | [C1](#claim-005c1ad3-dcc5-4f77-b36f-7ee4a420f22c), [C39](#claim-f67de3f4-647c-4c67-86e3-ab561267bf22) |
| 4 | Second middleware | First middleware | Parent dispatch completes | return | [C1](#claim-005c1ad3-dcc5-4f77-b36f-7ee4a420f22c), [C39](#claim-f67de3f4-647c-4c67-86e3-ab561267bf22) |

[src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370) · [Scope note 3](#unknown-2)

## Limits of this explanation

Each application function chooses whether to pass work onward and wait\. These excerpts do not show those choices\.

[src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370) · [Scope note 3](#unknown-2)

An error can move back to an earlier function or to the application\. What happens there is outside this review\.

[src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370) · [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2) · [Scope note 4](#unknown-3)

<a id="questions"></a>

## Specific questions

### Why does code after await next\(\) run later?

next\(\) enters the next dispatch call\. If the middleware waits with await next\(\), it resumes after that child call completes\.

The diagram assumes this waiting behavior\. User handlers can choose a different behavior\.

[src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370) · [Scope note 3](#unknown-2)
[src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370) · [Scope note 3](#unknown-2)

### What happens if next\(\) is called twice?

The progress guard rejects a repeated index\. Its Error occurs before that call enters its own handler catch block\.

An awaiting parent can still handle the failure\. The source does not establish that all error callbacks are bypassed\.

[src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
[src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370) · [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2) · [Scope note 4](#unknown-3)

### Can a returned response replace an existing response?

A normal result does not overwrite a finalized response through this assignment\. A truthy result from onError can replace it\.

A falsy result causes no response assignment\.

[src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370) · [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)
[src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

### What happens when there is no handler?

At exactly middleware\.length, dispatch can use the supplied outer next callback\.

If no handler is selected, onNotFound runs only when finalized is false and that callback exists\. Its invocation is outside the current handler catch block\.

[src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
[src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

### What if the error handler also throws?

That failure escapes the current handler catch block\. An awaiting parent or application dispatcher may handle it\.

[src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370) · [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2) · [Scope note 4](#unknown-3)

<a id="sources"></a>

<details>
<summary>Claims, exact flow, and source evidence</summary>

Source-based explanation. Claim support and the new explanations need independent review.

<a id="contracts"></a>

### Canonical contracts

Fields from the semantic model. References include required functions and related component functions. Proposed interpretations; these links do not establish runtime callees or execution order.

<details>
<summary>Open behavior and function contracts</summary>

<a id="functions"></a>

<a id="behavior-23db580d-4b14-4e4d-9176-ffaca2c65853"></a>

#### Invoke middleware and its continuations

ID: `behavior:23db580d-4b14-4e4d-9176-ffaca2c65853`.

**Triggers**

- [C13: compose accepts middleware entries and optional error and not\-found callbacks\. It returns a runner that accepts a Context and optional outer next callback\.](#claim-39cc9873-5187-41f4-8403-332e355f7db9)
- [C26: Each invocation of the runner returned by compose initializes its own progression index to \-1\.](#claim-a4808f91-eb8a-4a52-aed2-72effb4a139e)
- [C28: The runner begins asynchronous dispatch at middleware index zero\.](#claim-b1c5caa4-d40d-4e99-a478-a0483a83437a)

**Functions**

- [compose](#function-92019dfa-b10c-4b1a-8ba3-914084ae947c)
- [Returned composition runner](#function-bc6399ac-1a94-4541-b51b-4cc6cc66aea8)
- [Nested middleware dispatch](#function-03f326d3-1de0-4410-808f-b673a2c4cfb3)
- [Recursive middleware continuation](#function-a30d9cc8-bde8-4f72-8469-44f9b1e91a23)
- [Selected application handler](#function-d888d262-67d4-4c35-a3d3-b88a00f3deb6)
- [Supplied outer continuation](#function-e677a038-abee-4d92-8888-4b401adf7370)

**State**

- Middleware progression \(concept:132172da\-47ee\-48c0\-93f3\-1fae3ee7800c\)
- Response and finalization state \(concept:15b53c40\-cf7c\-454c\-bdab\-3c1d77c4f3e3\)
- The context\.error field \(concept:e9a65dde\-cd8f\-4731\-9dc6\-776d8d9216a8\)

**Flow steps**

- [Initialize invocation progression](#step-0927dcdd-b4e6-47dc-bb6e-67ec8e86ee7d)
- [Reject repeated or backward progression](#step-6b664680-e522-4784-922d-8f7b80992b82)
- [Select middleware or the terminal next callback](#step-a249dba7-bb8d-475a-a38d-a1a9cf7a9472)
- [Await handler and its recursive next continuation](#step-6c021307-7902-43bc-9ed0-420de09fc078)
- [Handle eligible Error values](#step-6d99d430-1030-4bbe-8278-8707ffcc2e1f)
- [Invoke not\-found only if unfinalized](#step-d21a3bf3-b439-475c-9894-7cd0977c85ed)
- [Propagate the failure from this frame](#step-2b229a25-c063-4a7c-ab4a-5b90f609670e)

**Outcome condition**: A middleware entry exists\.

- [C10: A present middleware entry supplies its handler from middleware\[i\]\[0\]\[0\]\.](#claim-36389804-ee71-4da7-bbdc-e77cb1d247b1)
- [C25: Selecting a middleware entry also assigns i to context\.req\.routeIndex\.](#claim-957e5bca-529c-4b7b-85cd-d3ad15c57993)
- [C1: The dispatcher awaits each handler result, allowing synchronous return values and promises to feed the same response handling\.](#claim-005c1ad3-dcc5-4f77-b36f-7ee4a420f22c)

**Outcome condition**: The index equals middleware\.length and outer next exists\.

- [C3: The supplied outer next callback is eligible only at exactly middleware\.length when no middleware entry exists\.](#claim-0df938c1-9773-4d05-84ba-5bcecf66fb6c)

**Outcome condition**: The handler invokes its continuation\.

- [C24: A handler receives a continuation that recursively dispatches i \+ 1 using the same context\.](#claim-87cd957c-bb51-49fe-b9a4-291c106e08c5)

**Outcome condition**: No handler exists, context\.finalized is exactly false, and onNotFound exists\.

- [C36: Without a selected handler, onNotFound runs only when context\.finalized is exactly false and the callback exists\.](#claim-e8b03c7a-182a-46d4-aeb8-bf4295b82798)

**Outcome condition**: The dispatch frame completes successfully\.

- [C39: A successfully completed dispatch frame returns the shared context object\.](#claim-f67de3f4-647c-4c67-86e3-ab561267bf22)

**Failure**: The progression index is repeated or moves backward\. → Outside the represented boundary

- [C8: Dispatch rejects an index less than or equal to the last dispatched index with the repeated\-next Error\.](#claim-25d1b193-56d5-4ad3-8be1-b7bb1bb30d2b)
- [C18: The repeated\-next guard throws before the current frame&\#39;s handler try/catch, so that frame does not process its own guard error through onError\.](#claim-5a6d5b53-546a-4ad0-bb93-b028876d1d12)
- [C34: If a parent handler awaits a child continuation and its rejection reaches the parent handler call, the parent frame catch can handle an Error through onError\. An unawaited continuation is not guaranteed to reach that catch\.](#claim-d8b4fcf8-5869-40ef-a225-ff4e3d13bb99)

**Failure**: A handler throws an Error and onError exists\. → [Configured error callback (function:98d308f3-506e-458a-9b99-bfe76154df29)](#function-98d308f3-506e-458a-9b99-bfe76154df29)

- [C16: The handler catch uses onError only when the thrown value is an Error and an onError callback exists\.](#claim-544dbd7e-acd1-4040-8b00-00b91c0e8f8d)
- [C20: Before invoking onError, the handler catch writes the caught Error into context\.error\.](#claim-6a188938-736d-4970-a698-88df4b787329)
- [C11: After awaiting onError, the dispatcher marks the result as an error response\.](#claim-3744e538-0f07-4ea4-a210-02d1a6c03781)

**Failure**: The thrown value is not an Error, or no onError exists\. → Outside the represented boundary

- [C12: A non\-Error throw or an Error without an onError callback is rethrown by that dispatch frame\.](#claim-37cba2c0-333b-4a16-b503-49cd1b020ffa)
- [C34: If a parent handler awaits a child continuation and its rejection reaches the parent handler call, the parent frame catch can handle an Error through onError\. An unawaited continuation is not guaranteed to reach that catch\.](#claim-d8b4fcf8-5869-40ef-a225-ff4e3d13bb99)

**Failure**: onError fails inside the catch block\. → Outside the represented boundary

- [C14: A failure inside the awaited onError callback escapes the current frame&\#39;s handler catch block\.](#claim-40001f0b-2785-462a-9244-1997813e69cd)
- [C34: If a parent handler awaits a child continuation and its rejection reaches the parent handler call, the parent frame catch can handle an Error through onError\. An unawaited continuation is not guaranteed to reach that catch\.](#claim-d8b4fcf8-5869-40ef-a225-ff4e3d13bb99)

**Failure**: onNotFound fails outside the handler try block\. → Outside the represented boundary

- [C21: The onNotFound invocation is awaited outside the current handler try/catch\.](#claim-6b252ce9-9a3f-4cdb-9248-b0e515420829)
- [C34: If a parent handler awaits a child continuation and its rejection reaches the parent handler call, the parent frame catch can handle an Error through onError\. An unawaited continuation is not guaranteed to reach that catch\.](#claim-d8b4fcf8-5869-40ef-a225-ff4e3d13bb99)

**Failure**: The response setter fails after the handler catch\. → Outside the represented boundary

- [C35: The composed frame assigns context\.res after the handler catch\. A failure from that assignment escapes the current handler catch and can reach an awaiting parent or application dispatcher\.](#claim-e1b56a2f-0a30-4965-865a-3ab75c96f399)
- [C34: If a parent handler awaits a child continuation and its rejection reaches the parent handler call, the parent frame catch can handle an Error through onError\. An unawaited continuation is not guaranteed to reach that catch\.](#claim-d8b4fcf8-5869-40ef-a225-ff4e3d13bb99)

**Constraints**

- [C34: If a parent handler awaits a child continuation and its rejection reaches the parent handler call, the parent frame catch can handle an Error through onError\. An unawaited continuation is not guaranteed to reach that catch\.](#claim-d8b4fcf8-5869-40ef-a225-ff4e3d13bb99)
- [C38: The shown call sites supply context and a continuation to selected handlers\. These excerpts do not establish their implementations, return values, failures, state changes, or use of await next\(\)\.](#claim-f360cf06-1fc5-4b71-891d-37fdddbfeaa4)

**Unknowns**

- [Recursive next returns a Promise; whether a user handler awaits it is determined by that handler, not established by compose alone\. The flow describes frame recursion, not a flat scheduler\.](#unknown-2)
- [An error that escapes a child dispatch may be caught by an awaiting parent handler frame or by the application dispatcher\. No claim is made that every repeated\-next error bypasses all error handlers\.](#unknown-3)
- [Which handler is selected at runtime, and what does it return, change, throw, or await?](#unknown-5)
- [Does the caller supply outer next, and what does that callback do?](#unknown-8)

<a id="behavior-ba3e06c3-f41a-40e3-9419-b871a1776622"></a>

#### Apply middleware response and error results

ID: `behavior:ba3e06c3-f41a-40e3-9419-b871a1776622`.

**Triggers**

- [C1: The dispatcher awaits each handler result, allowing synchronous return values and promises to feed the same response handling\.](#claim-005c1ad3-dcc5-4f77-b36f-7ee4a420f22c)
- [C16: The handler catch uses onError only when the thrown value is an Error and an onError callback exists\.](#claim-544dbd7e-acd1-4040-8b00-00b91c0e8f8d)
- [C36: Without a selected handler, onNotFound runs only when context\.finalized is exactly false and the callback exists\.](#claim-e8b03c7a-182a-46d4-aeb8-bf4295b82798)

**Functions**

- [Nested middleware dispatch](#function-03f326d3-1de0-4410-808f-b673a2c4cfb3)
- [Context\.res getter](#function-e4635ca2-ec40-4091-ad54-7be94f4c32ba)
- [Context\.res setter](#function-9cb45f6c-5651-4587-89b1-acc02a5e7fb3)
- [Configured error callback](#function-98d308f3-506e-458a-9b99-bfe76154df29)
- [Configured not\-found callback](#function-2ed115cb-3d2d-4d04-9657-d8829ba4ee56)

**State**

- Response and finalization state \(concept:15b53c40\-cf7c\-454c\-bdab\-3c1d77c4f3e3\)
- The context\.error field \(concept:e9a65dde\-cd8f\-4731\-9dc6\-776d8d9216a8\)

**Flow steps**

- [Handle eligible Error values](#step-6d99d430-1030-4bbe-8278-8707ffcc2e1f)
- [Invoke not\-found only if unfinalized](#step-d21a3bf3-b439-475c-9894-7cd0977c85ed)
- [Conditionally write response state](#step-9394aaf0-1e44-40f5-b32c-3af2d70a285f)
- [Return shared context to the caller](#step-0f2e7303-9908-4bae-9695-1247c8ce948a)
- [Propagate the failure from this frame](#step-2b229a25-c063-4a7c-ab4a-5b90f609670e)

**Outcome condition**: The result is truthy and context\.finalized is exactly false\.

- [C41: A truthy response result is assigned to context\.res only when context is not finalized or the result came through onError\.](#claim-fca39081-cbda-4fe7-8212-cf21fdc9a885)

**Outcome condition**: The result is truthy from onError, including finalized context\.

- [C33: A truthy onError result may replace response state even when the context was already finalized\.](#claim-d5e3c85d-4a1d-4991-87d8-bd5369c091ab)

**Outcome condition**: A normal result reaches already finalized context\.

- [C6: A normal returned response does not overwrite already finalized context through this assignment condition\.](#claim-1724bbd4-e936-42d3-a4cd-dabd7f2051aa)

**Outcome condition**: The result is falsy\.

- [C22: A falsy result does not trigger the final response assignment\.](#claim-7f3aafe6-876f-4b5a-9bac-698144b2adfc)

**Outcome condition**: Both previous and replacement responses exist in the setter\.

- [C4: When both old and new responses exist, the res setter copies the new response before merging old headers, skipping the old content\-type\.](#claim-146991bd-ed7d-4ae1-8868-888a11dedf6e)
- [C2: The res setter replaces the new set\-cookie collection with cookies from the previous response when merging that header\.](#claim-0b57c11a-c767-4573-8888-f3d49cbdf5c6)

**Outcome condition**: The setter completes its storage update\.

- [C7: The res setter stores its argument and sets finalized to true, including when the argument is undefined\.](#claim-1d2eae5b-efd0-4237-8671-50d5055dafe0)

**Failure**: The progression index is repeated or moves backward\. → Outside the represented boundary

- [C8: Dispatch rejects an index less than or equal to the last dispatched index with the repeated\-next Error\.](#claim-25d1b193-56d5-4ad3-8be1-b7bb1bb30d2b)
- [C18: The repeated\-next guard throws before the current frame&\#39;s handler try/catch, so that frame does not process its own guard error through onError\.](#claim-5a6d5b53-546a-4ad0-bb93-b028876d1d12)
- [C34: If a parent handler awaits a child continuation and its rejection reaches the parent handler call, the parent frame catch can handle an Error through onError\. An unawaited continuation is not guaranteed to reach that catch\.](#claim-d8b4fcf8-5869-40ef-a225-ff4e3d13bb99)

**Failure**: A handler throws an Error and onError exists\. → [Configured error callback (function:98d308f3-506e-458a-9b99-bfe76154df29)](#function-98d308f3-506e-458a-9b99-bfe76154df29)

- [C16: The handler catch uses onError only when the thrown value is an Error and an onError callback exists\.](#claim-544dbd7e-acd1-4040-8b00-00b91c0e8f8d)
- [C20: Before invoking onError, the handler catch writes the caught Error into context\.error\.](#claim-6a188938-736d-4970-a698-88df4b787329)
- [C11: After awaiting onError, the dispatcher marks the result as an error response\.](#claim-3744e538-0f07-4ea4-a210-02d1a6c03781)

**Failure**: The thrown value is not an Error, or no onError exists\. → Outside the represented boundary

- [C12: A non\-Error throw or an Error without an onError callback is rethrown by that dispatch frame\.](#claim-37cba2c0-333b-4a16-b503-49cd1b020ffa)
- [C34: If a parent handler awaits a child continuation and its rejection reaches the parent handler call, the parent frame catch can handle an Error through onError\. An unawaited continuation is not guaranteed to reach that catch\.](#claim-d8b4fcf8-5869-40ef-a225-ff4e3d13bb99)

**Failure**: onError fails inside the catch block\. → Outside the represented boundary

- [C14: A failure inside the awaited onError callback escapes the current frame&\#39;s handler catch block\.](#claim-40001f0b-2785-462a-9244-1997813e69cd)
- [C34: If a parent handler awaits a child continuation and its rejection reaches the parent handler call, the parent frame catch can handle an Error through onError\. An unawaited continuation is not guaranteed to reach that catch\.](#claim-d8b4fcf8-5869-40ef-a225-ff4e3d13bb99)

**Failure**: onNotFound fails outside the handler try block\. → Outside the represented boundary

- [C21: The onNotFound invocation is awaited outside the current handler try/catch\.](#claim-6b252ce9-9a3f-4cdb-9248-b0e515420829)
- [C34: If a parent handler awaits a child continuation and its rejection reaches the parent handler call, the parent frame catch can handle an Error through onError\. An unawaited continuation is not guaranteed to reach that catch\.](#claim-d8b4fcf8-5869-40ef-a225-ff4e3d13bb99)

**Failure**: The response setter fails after the handler catch\. → Outside the represented boundary

- [C35: The composed frame assigns context\.res after the handler catch\. A failure from that assignment escapes the current handler catch and can reach an awaiting parent or application dispatcher\.](#claim-e1b56a2f-0a30-4965-865a-3ab75c96f399)
- [C34: If a parent handler awaits a child continuation and its rejection reaches the parent handler call, the parent frame catch can handle an Error through onError\. An unawaited continuation is not guaranteed to reach that catch\.](#claim-d8b4fcf8-5869-40ef-a225-ff4e3d13bb99)

**Failure**: Header merging fails before final assignments\. → Outside the represented boundary

- [C30: The res setter merges headers before its final storage assignment and finalized update\. An exception during that merge can prevent those final assignments\.](#claim-b3a42479-5499-4eed-8d21-09169deaf214)

**Constraints**

- [C34: If a parent handler awaits a child continuation and its rejection reaches the parent handler call, the parent frame catch can handle an Error through onError\. An unawaited continuation is not guaranteed to reach that catch\.](#claim-d8b4fcf8-5869-40ef-a225-ff4e3d13bb99)
- [C31: The res setter accepts Response or undefined by annotation and has no explicit return value\. It does not validate the argument type at runtime\.](#claim-d543fd57-c7cb-4a8b-9078-fc6050980cf1)
- [C27: The selected source calls response constructors, header methods, and Context response helpers\. Their implementations and complete failure behavior are outside these excerpts\.](#claim-a6cc6269-0179-4714-a6d7-a690685fd58b)

**Unknowns**

- [Recursive next returns a Promise; whether a user handler awaits it is determined by that handler, not established by compose alone\. The flow describes frame recursion, not a flat scheduler\.](#unknown-2)
- [An error that escapes a child dispatch may be caught by an awaiting parent handler frame or by the application dispatcher\. No claim is made that every repeated\-next error bypasses all error handlers\.](#unknown-3)
- [Which error callback is configured, and can it fail or change response state?](#unknown-6)
- [Which not\-found callback is configured, and what are its effects and failure behavior?](#unknown-7)

<a id="function-01860b94-d1f5-4de4-a585-e2c80ae4c52e"></a>

#### Context\.notFound

ID: `function:01860b94-d1f5-4de4-a585-e2c80ae4c52e`.

Role: arrow. [src/context\.ts](#evidence-3964d7755fbe93590183216380561fc4f6cf9eed1f24e7cd81b0943a88034107) · UTF-8 bytes [22568, 22708).

**Inputs**

- [C19: Context\.notFound installs a fallback callback only when its private handler is nullish, then invokes the handler with this context\.](#claim-5e705c38-4dd9-4e55-be1b-2f016881b2bd)

**Outputs**

- [C19: Context\.notFound installs a fallback callback only when its private handler is nullish, then invokes the handler with this context\.](#claim-5e705c38-4dd9-4e55-be1b-2f016881b2bd)

**State: read\-write**: The Context private not\-found callback \(concept:adc95999\-3d01\-44d8\-bf5e\-72a3ca87c192\)

- [C19: Context\.notFound installs a fallback callback only when its private handler is nullish, then invokes the handler with this context\.](#claim-5e705c38-4dd9-4e55-be1b-2f016881b2bd)

**Effects**

- [C19: Context\.notFound installs a fallback callback only when its private handler is nullish, then invokes the handler with this context\.](#claim-5e705c38-4dd9-4e55-be1b-2f016881b2bd)

**Dependency**: [Context not\-found fallback arrow (function:49d6bd1e-9aaf-4234-8f34-2aa0011e86b4)](#function-49d6bd1e-9aaf-4234-8f34-2aa0011e86b4)

- [C19: Context\.notFound installs a fallback callback only when its private handler is nullish, then invokes the handler with this context\.](#claim-5e705c38-4dd9-4e55-be1b-2f016881b2bd)
- [C32: The fallback arrow installed by Context\.notFound calls createResponseInstance with no arguments and returns its result\.](#claim-d5dd3300-e498-4ec8-b548-9d8308c15576)

**Dependency**: [Configured not\-found callback (function:2ed115cb-3d2d-4d04-9657-d8829ba4ee56)](#function-2ed115cb-3d2d-4d04-9657-d8829ba4ee56)

- [C19: Context\.notFound installs a fallback callback only when its private handler is nullish, then invokes the handler with this context\.](#claim-5e705c38-4dd9-4e55-be1b-2f016881b2bd)

**Assumptions**

- [C27: The selected source calls response constructors, header methods, and Context response helpers\. Their implementations and complete failure behavior are outside these excerpts\.](#claim-a6cc6269-0179-4714-a6d7-a690685fd58b)

**Unknowns**

None recorded; this does not prove absence.

<a id="function-03f326d3-1de0-4410-808f-b673a2c4cfb3"></a>

#### Nested middleware dispatch

ID: `function:03f326d3-1de0-4410-808f-b673a2c4cfb3`.

Role: function. [src/compose\.ts](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370) · UTF-8 bytes [1196, 2196).

**Inputs**

- [C15: The nested dispatch function accepts an index and closes over the runner context, progression index, middleware array, and optional callbacks\.](#claim-45c03f43-ef8c-4a6b-9f8a-24b2237fb6ca)

**Outputs**

- [C39: A successfully completed dispatch frame returns the shared context object\.](#claim-f67de3f4-647c-4c67-86e3-ab561267bf22)

**State: read\-write**: Middleware progression \(concept:132172da\-47ee\-48c0\-93f3\-1fae3ee7800c\)

- [C8: Dispatch rejects an index less than or equal to the last dispatched index with the repeated\-next Error\.](#claim-25d1b193-56d5-4ad3-8be1-b7bb1bb30d2b)
- [C29: The progression index is updated before the current handler is selected or invoked\.](#claim-b35b5c02-3b31-46cd-b1ac-2845ca7d8424)
- [C25: Selecting a middleware entry also assigns i to context\.req\.routeIndex\.](#claim-957e5bca-529c-4b7b-85cd-d3ad15c57993)

**State: read\-write**: Response and finalization state \(concept:15b53c40\-cf7c\-454c\-bdab\-3c1d77c4f3e3\)

- [C36: Without a selected handler, onNotFound runs only when context\.finalized is exactly false and the callback exists\.](#claim-e8b03c7a-182a-46d4-aeb8-bf4295b82798)
- [C41: A truthy response result is assigned to context\.res only when context is not finalized or the result came through onError\.](#claim-fca39081-cbda-4fe7-8212-cf21fdc9a885)
- [C6: A normal returned response does not overwrite already finalized context through this assignment condition\.](#claim-1724bbd4-e936-42d3-a4cd-dabd7f2051aa)
- [C33: A truthy onError result may replace response state even when the context was already finalized\.](#claim-d5e3c85d-4a1d-4991-87d8-bd5369c091ab)
- [C22: A falsy result does not trigger the final response assignment\.](#claim-7f3aafe6-876f-4b5a-9bac-698144b2adfc)

**State: write**: The context\.error field \(concept:e9a65dde\-cd8f\-4731\-9dc6\-776d8d9216a8\)

- [C20: Before invoking onError, the handler catch writes the caught Error into context\.error\.](#claim-6a188938-736d-4970-a698-88df4b787329)

**Effects**

- [C25: Selecting a middleware entry also assigns i to context\.req\.routeIndex\.](#claim-957e5bca-529c-4b7b-85cd-d3ad15c57993)
- [C20: Before invoking onError, the handler catch writes the caught Error into context\.error\.](#claim-6a188938-736d-4970-a698-88df4b787329)

**Failure**: The progression index is repeated or moves backward\. → Outside the represented boundary

- [C8: Dispatch rejects an index less than or equal to the last dispatched index with the repeated\-next Error\.](#claim-25d1b193-56d5-4ad3-8be1-b7bb1bb30d2b)
- [C18: The repeated\-next guard throws before the current frame&\#39;s handler try/catch, so that frame does not process its own guard error through onError\.](#claim-5a6d5b53-546a-4ad0-bb93-b028876d1d12)
- [C34: If a parent handler awaits a child continuation and its rejection reaches the parent handler call, the parent frame catch can handle an Error through onError\. An unawaited continuation is not guaranteed to reach that catch\.](#claim-d8b4fcf8-5869-40ef-a225-ff4e3d13bb99)

**Failure**: A handler throws an Error and onError exists\. → [Configured error callback (function:98d308f3-506e-458a-9b99-bfe76154df29)](#function-98d308f3-506e-458a-9b99-bfe76154df29)

- [C16: The handler catch uses onError only when the thrown value is an Error and an onError callback exists\.](#claim-544dbd7e-acd1-4040-8b00-00b91c0e8f8d)
- [C20: Before invoking onError, the handler catch writes the caught Error into context\.error\.](#claim-6a188938-736d-4970-a698-88df4b787329)
- [C11: After awaiting onError, the dispatcher marks the result as an error response\.](#claim-3744e538-0f07-4ea4-a210-02d1a6c03781)

**Failure**: The thrown value is not an Error, or no onError exists\. → Outside the represented boundary

- [C12: A non\-Error throw or an Error without an onError callback is rethrown by that dispatch frame\.](#claim-37cba2c0-333b-4a16-b503-49cd1b020ffa)
- [C34: If a parent handler awaits a child continuation and its rejection reaches the parent handler call, the parent frame catch can handle an Error through onError\. An unawaited continuation is not guaranteed to reach that catch\.](#claim-d8b4fcf8-5869-40ef-a225-ff4e3d13bb99)

**Failure**: onError fails inside the catch block\. → Outside the represented boundary

- [C14: A failure inside the awaited onError callback escapes the current frame&\#39;s handler catch block\.](#claim-40001f0b-2785-462a-9244-1997813e69cd)
- [C34: If a parent handler awaits a child continuation and its rejection reaches the parent handler call, the parent frame catch can handle an Error through onError\. An unawaited continuation is not guaranteed to reach that catch\.](#claim-d8b4fcf8-5869-40ef-a225-ff4e3d13bb99)

**Failure**: onNotFound fails outside the handler try block\. → Outside the represented boundary

- [C21: The onNotFound invocation is awaited outside the current handler try/catch\.](#claim-6b252ce9-9a3f-4cdb-9248-b0e515420829)
- [C34: If a parent handler awaits a child continuation and its rejection reaches the parent handler call, the parent frame catch can handle an Error through onError\. An unawaited continuation is not guaranteed to reach that catch\.](#claim-d8b4fcf8-5869-40ef-a225-ff4e3d13bb99)

**Failure**: The response setter fails after the handler catch\. → Outside the represented boundary

- [C35: The composed frame assigns context\.res after the handler catch\. A failure from that assignment escapes the current handler catch and can reach an awaiting parent or application dispatcher\.](#claim-e1b56a2f-0a30-4965-865a-3ab75c96f399)
- [C34: If a parent handler awaits a child continuation and its rejection reaches the parent handler call, the parent frame catch can handle an Error through onError\. An unawaited continuation is not guaranteed to reach that catch\.](#claim-d8b4fcf8-5869-40ef-a225-ff4e3d13bb99)

**Dependency**: [Recursive middleware continuation (function:a30d9cc8-bde8-4f72-8469-44f9b1e91a23)](#function-a30d9cc8-bde8-4f72-8469-44f9b1e91a23)

- [C24: A handler receives a continuation that recursively dispatches i \+ 1 using the same context\.](#claim-87cd957c-bb51-49fe-b9a4-291c106e08c5)

**Dependency**: [Selected application handler (function:d888d262-67d4-4c35-a3d3-b88a00f3deb6)](#function-d888d262-67d4-4c35-a3d3-b88a00f3deb6)

- [C10: A present middleware entry supplies its handler from middleware\[i\]\[0\]\[0\]\.](#claim-36389804-ee71-4da7-bbdc-e77cb1d247b1)
- [C1: The dispatcher awaits each handler result, allowing synchronous return values and promises to feed the same response handling\.](#claim-005c1ad3-dcc5-4f77-b36f-7ee4a420f22c)

**Dependency**: [Supplied outer continuation (function:e677a038-abee-4d92-8888-4b401adf7370)](#function-e677a038-abee-4d92-8888-4b401adf7370)

- [C3: The supplied outer next callback is eligible only at exactly middleware\.length when no middleware entry exists\.](#claim-0df938c1-9773-4d05-84ba-5bcecf66fb6c)

**Dependency**: [Configured error callback (function:98d308f3-506e-458a-9b99-bfe76154df29)](#function-98d308f3-506e-458a-9b99-bfe76154df29)

- [C16: The handler catch uses onError only when the thrown value is an Error and an onError callback exists\.](#claim-544dbd7e-acd1-4040-8b00-00b91c0e8f8d)
- [C20: Before invoking onError, the handler catch writes the caught Error into context\.error\.](#claim-6a188938-736d-4970-a698-88df4b787329)
- [C11: After awaiting onError, the dispatcher marks the result as an error response\.](#claim-3744e538-0f07-4ea4-a210-02d1a6c03781)

**Dependency**: [Configured not\-found callback (function:2ed115cb-3d2d-4d04-9657-d8829ba4ee56)](#function-2ed115cb-3d2d-4d04-9657-d8829ba4ee56)

- [C36: Without a selected handler, onNotFound runs only when context\.finalized is exactly false and the callback exists\.](#claim-e8b03c7a-182a-46d4-aeb8-bf4295b82798)

**Dependency**: [Context\.res setter (function:9cb45f6c-5651-4587-89b1-acc02a5e7fb3)](#function-9cb45f6c-5651-4587-89b1-acc02a5e7fb3)

- [C41: A truthy response result is assigned to context\.res only when context is not finalized or the result came through onError\.](#claim-fca39081-cbda-4fe7-8212-cf21fdc9a885)

**Assumptions**

- [C34: If a parent handler awaits a child continuation and its rejection reaches the parent handler call, the parent frame catch can handle an Error through onError\. An unawaited continuation is not guaranteed to reach that catch\.](#claim-d8b4fcf8-5869-40ef-a225-ff4e3d13bb99)

**Unknowns**

None recorded; this does not prove absence.

<a id="function-2ed115cb-3d2d-4d04-9657-d8829ba4ee56"></a>

#### Configured not\-found callback

ID: `function:2ed115cb-3d2d-4d04-9657-d8829ba4ee56`.

Role: external-callback. No implementation is supplied for this callback.

**Inputs**

- [C40: The configured not\-found callback receives the current context\. Its returned values and failures depend on the configured implementation\.](#claim-f984c4f5-e5e0-4ce9-a0fc-0b8884e34883)

**Outputs**

- [C40: The configured not\-found callback receives the current context\. Its returned values and failures depend on the configured implementation\.](#claim-f984c4f5-e5e0-4ce9-a0fc-0b8884e34883)

**Effects**

None recorded; this does not prove absence.

**Assumptions**

- [C40: The configured not\-found callback receives the current context\. Its returned values and failures depend on the configured implementation\.](#claim-f984c4f5-e5e0-4ce9-a0fc-0b8884e34883)

**Unknowns**

- [Which not\-found callback is configured, and what are its effects and failure behavior?](#unknown-7)

<a id="function-49d6bd1e-9aaf-4234-8f34-2aa0011e86b4"></a>

#### Context not\-found fallback arrow

ID: `function:49d6bd1e-9aaf-4234-8f34-2aa0011e86b4`.

Role: arrow. [src/context\.ts](#evidence-3964d7755fbe93590183216380561fc4f6cf9eed1f24e7cd81b0943a88034107) · UTF-8 bytes [22635, 22665).

**Inputs**

- [C32: The fallback arrow installed by Context\.notFound calls createResponseInstance with no arguments and returns its result\.](#claim-d5dd3300-e498-4ec8-b548-9d8308c15576)

**Outputs**

- [C32: The fallback arrow installed by Context\.notFound calls createResponseInstance with no arguments and returns its result\.](#claim-d5dd3300-e498-4ec8-b548-9d8308c15576)

**Effects**

None recorded; this does not prove absence.

**Dependency**: Path resolution, router, Context construction, and response helpers \(concept:c68fea43\-9e8c\-44d2\-b4de\-c811f639da91\)

- [C32: The fallback arrow installed by Context\.notFound calls createResponseInstance with no arguments and returns its result\.](#claim-d5dd3300-e498-4ec8-b548-9d8308c15576)

**Assumptions**

- [C27: The selected source calls response constructors, header methods, and Context response helpers\. Their implementations and complete failure behavior are outside these excerpts\.](#claim-a6cc6269-0179-4714-a6d7-a690685fd58b)

**Unknowns**

- [What failures and effects can the uninspected routing, construction, and response helpers produce?](#unknown-9)

<a id="function-92019dfa-b10c-4b1a-8ba3-914084ae947c"></a>

#### compose

ID: `function:92019dfa-b10c-4b1a-8ba3-914084ae947c`.

Role: arrow. [src/compose\.ts](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370) · UTF-8 bytes [686, 2202).

**Inputs**

- [C13: compose accepts middleware entries and optional error and not\-found callbacks\. It returns a runner that accepts a Context and optional outer next callback\.](#claim-39cc9873-5187-41f4-8403-332e355f7db9)

**Outputs**

- [C13: compose accepts middleware entries and optional error and not\-found callbacks\. It returns a runner that accepts a Context and optional outer next callback\.](#claim-39cc9873-5187-41f4-8403-332e355f7db9)

**Effects**

None recorded; this does not prove absence.

**Dependency**: [Returned composition runner (function:bc6399ac-1a94-4541-b51b-4cc6cc66aea8)](#function-bc6399ac-1a94-4541-b51b-4cc6cc66aea8)

- [C13: compose accepts middleware entries and optional error and not\-found callbacks\. It returns a runner that accepts a Context and optional outer next callback\.](#claim-39cc9873-5187-41f4-8403-332e355f7db9)

**Assumptions**

None recorded; this does not prove absence.

**Unknowns**

None recorded; this does not prove absence.

<a id="function-98d308f3-506e-458a-9b99-bfe76154df29"></a>

#### Configured error callback

ID: `function:98d308f3-506e-458a-9b99-bfe76154df29`.

Role: external-callback. No implementation is supplied for this callback.

**Inputs**

- [C37: Eligible error callbacks receive an Error and the current context\. Their returned values and failures depend on the configured implementation\.](#claim-eb4d17a9-fa20-4ecc-9768-52ed19a28dea)

**Outputs**

- [C37: Eligible error callbacks receive an Error and the current context\. Their returned values and failures depend on the configured implementation\.](#claim-eb4d17a9-fa20-4ecc-9768-52ed19a28dea)

**Effects**

None recorded; this does not prove absence.

**Assumptions**

- [C37: Eligible error callbacks receive an Error and the current context\. Their returned values and failures depend on the configured implementation\.](#claim-eb4d17a9-fa20-4ecc-9768-52ed19a28dea)

**Unknowns**

- [Which error callback is configured, and can it fail or change response state?](#unknown-6)

<a id="function-9cb45f6c-5651-4587-89b1-acc02a5e7fb3"></a>

#### Context\.res setter

ID: `function:9cb45f6c-5651-4587-89b1-acc02a5e7fb3`.

Role: setter. [src/context\.ts](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5) · UTF-8 bytes [12385, 12997).

**Inputs**

- [C31: The res setter accepts Response or undefined by annotation and has no explicit return value\. It does not validate the argument type at runtime\.](#claim-d543fd57-c7cb-4a8b-9078-fc6050980cf1)

**Outputs**

- [C31: The res setter accepts Response or undefined by annotation and has no explicit return value\. It does not validate the argument type at runtime\.](#claim-d543fd57-c7cb-4a8b-9078-fc6050980cf1)

**State: read\-write**: Response and finalization state \(concept:15b53c40\-cf7c\-454c\-bdab\-3c1d77c4f3e3\)

- [C7: The res setter stores its argument and sets finalized to true, including when the argument is undefined\.](#claim-1d2eae5b-efd0-4237-8671-50d5055dafe0)
- [C4: When both old and new responses exist, the res setter copies the new response before merging old headers, skipping the old content\-type\.](#claim-146991bd-ed7d-4ae1-8868-888a11dedf6e)
- [C2: The res setter replaces the new set\-cookie collection with cookies from the previous response when merging that header\.](#claim-0b57c11a-c767-4573-8888-f3d49cbdf5c6)

**Effects**

- [C7: The res setter stores its argument and sets finalized to true, including when the argument is undefined\.](#claim-1d2eae5b-efd0-4237-8671-50d5055dafe0)
- [C4: When both old and new responses exist, the res setter copies the new response before merging old headers, skipping the old content\-type\.](#claim-146991bd-ed7d-4ae1-8868-888a11dedf6e)
- [C2: The res setter replaces the new set\-cookie collection with cookies from the previous response when merging that header\.](#claim-0b57c11a-c767-4573-8888-f3d49cbdf5c6)

**Failure**: Header merging fails before storage is updated\. → Outside the represented boundary

- [C30: The res setter merges headers before its final storage assignment and finalized update\. An exception during that merge can prevent those final assignments\.](#claim-b3a42479-5499-4eed-8d21-09169deaf214)

**Dependency**: Path resolution, router, Context construction, and response helpers \(concept:c68fea43\-9e8c\-44d2\-b4de\-c811f639da91\)

- [C4: When both old and new responses exist, the res setter copies the new response before merging old headers, skipping the old content\-type\.](#claim-146991bd-ed7d-4ae1-8868-888a11dedf6e)
- [C2: The res setter replaces the new set\-cookie collection with cookies from the previous response when merging that header\.](#claim-0b57c11a-c767-4573-8888-f3d49cbdf5c6)

**Assumptions**

- [C31: The res setter accepts Response or undefined by annotation and has no explicit return value\. It does not validate the argument type at runtime\.](#claim-d543fd57-c7cb-4a8b-9078-fc6050980cf1)
- [C27: The selected source calls response constructors, header methods, and Context response helpers\. Their implementations and complete failure behavior are outside these excerpts\.](#claim-a6cc6269-0179-4714-a6d7-a690685fd58b)

**Unknowns**

- [What failures and effects can the uninspected routing, construction, and response helpers produce?](#unknown-9)

<a id="function-a30d9cc8-bde8-4f72-8469-44f9b1e91a23"></a>

#### Recursive middleware continuation

ID: `function:a30d9cc8-bde8-4f72-8469-44f9b1e91a23`.

Role: arrow. [src/compose\.ts](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370) · UTF-8 bytes [1678, 1699).

**Inputs**

- [C24: A handler receives a continuation that recursively dispatches i \+ 1 using the same context\.](#claim-87cd957c-bb51-49fe-b9a4-291c106e08c5)

**Outputs**

- [C24: A handler receives a continuation that recursively dispatches i \+ 1 using the same context\.](#claim-87cd957c-bb51-49fe-b9a4-291c106e08c5)
- [C9: The runner returns dispatch\(0\)\. This nested async function resolves to the shared context after successful completion and can reject on a propagated failure\.](#claim-2c55a0d3-2faf-413e-8173-4aa184a3094e)

**Effects**

None recorded; this does not prove absence.

**Dependency**: [Nested middleware dispatch (function:03f326d3-1de0-4410-808f-b673a2c4cfb3)](#function-03f326d3-1de0-4410-808f-b673a2c4cfb3)

- [C24: A handler receives a continuation that recursively dispatches i \+ 1 using the same context\.](#claim-87cd957c-bb51-49fe-b9a4-291c106e08c5)

**Assumptions**

- [C34: If a parent handler awaits a child continuation and its rejection reaches the parent handler call, the parent frame catch can handle an Error through onError\. An unawaited continuation is not guaranteed to reach that catch\.](#claim-d8b4fcf8-5869-40ef-a225-ff4e3d13bb99)

**Unknowns**

None recorded; this does not prove absence.

<a id="function-bc6399ac-1a94-4541-b51b-4cc6cc66aea8"></a>

#### Returned composition runner

ID: `function:bc6399ac-1a94-4541-b51b-4cc6cc66aea8`.

Role: arrow. [src/compose\.ts](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370) · UTF-8 bytes [908, 2200).

**Inputs**

- [C13: compose accepts middleware entries and optional error and not\-found callbacks\. It returns a runner that accepts a Context and optional outer next callback\.](#claim-39cc9873-5187-41f4-8403-332e355f7db9)

**Outputs**

- [C9: The runner returns dispatch\(0\)\. This nested async function resolves to the shared context after successful completion and can reject on a propagated failure\.](#claim-2c55a0d3-2faf-413e-8173-4aa184a3094e)

**State: write**: Middleware progression \(concept:132172da\-47ee\-48c0\-93f3\-1fae3ee7800c\)

- [C26: Each invocation of the runner returned by compose initializes its own progression index to \-1\.](#claim-a4808f91-eb8a-4a52-aed2-72effb4a139e)

**Effects**

None recorded; this does not prove absence.

**Failure**: Nested dispatch propagates a failure\. → Outside the represented boundary

- [C9: The runner returns dispatch\(0\)\. This nested async function resolves to the shared context after successful completion and can reject on a propagated failure\.](#claim-2c55a0d3-2faf-413e-8173-4aa184a3094e)

**Dependency**: [Nested middleware dispatch (function:03f326d3-1de0-4410-808f-b673a2c4cfb3)](#function-03f326d3-1de0-4410-808f-b673a2c4cfb3)

- [C28: The runner begins asynchronous dispatch at middleware index zero\.](#claim-b1c5caa4-d40d-4e99-a478-a0483a83437a)

**Assumptions**

None recorded; this does not prove absence.

**Unknowns**

None recorded; this does not prove absence.

<a id="function-d888d262-67d4-4c35-a3d3-b88a00f3deb6"></a>

#### Selected application handler

ID: `function:d888d262-67d4-4c35-a3d3-b88a00f3deb6`.

Role: external-callback. No implementation is supplied for this callback.

**Inputs**

- [C38: The shown call sites supply context and a continuation to selected handlers\. These excerpts do not establish their implementations, return values, failures, state changes, or use of await next\(\)\.](#claim-f360cf06-1fc5-4b71-891d-37fdddbfeaa4)

**Outputs**

- [C38: The shown call sites supply context and a continuation to selected handlers\. These excerpts do not establish their implementations, return values, failures, state changes, or use of await next\(\)\.](#claim-f360cf06-1fc5-4b71-891d-37fdddbfeaa4)

**Effects**

None recorded; this does not prove absence.

**Assumptions**

- [C38: The shown call sites supply context and a continuation to selected handlers\. These excerpts do not establish their implementations, return values, failures, state changes, or use of await next\(\)\.](#claim-f360cf06-1fc5-4b71-891d-37fdddbfeaa4)

**Unknowns**

- [Which handler is selected at runtime, and what does it return, change, throw, or await?](#unknown-5)

<a id="function-e4635ca2-ec40-4091-ad54-7be94f4c32ba"></a>

#### Context\.res getter

ID: `function:e4635ca2-ec40-4091-ad54-7be94f4c32ba`.

Role: getter. [src/context\.ts](#evidence-efdc8a49582842d74bb72cf074179c4f18d4dc3a0f2d25c8ab366eb8630282b1) · UTF-8 bytes [12114, 12262).

**Inputs**

- [C23: The res getter takes no explicit argument\. It reads private response storage and can initialize both that storage and prepared headers\.](#claim-8099fdae-3db1-47b0-b324-6d527a067dd6)

**Outputs**

- [C5: The res getter lazily creates response storage with prepared headers; the getter itself does not set finalized\.](#claim-161b91b9-a49b-44d3-a919-0758464c5af3)

**State: read\-write**: Response and finalization state \(concept:15b53c40\-cf7c\-454c\-bdab\-3c1d77c4f3e3\)

- [C5: The res getter lazily creates response storage with prepared headers; the getter itself does not set finalized\.](#claim-161b91b9-a49b-44d3-a919-0758464c5af3)
- [C23: The res getter takes no explicit argument\. It reads private response storage and can initialize both that storage and prepared headers\.](#claim-8099fdae-3db1-47b0-b324-6d527a067dd6)

**Effects**

None recorded; this does not prove absence.

**Dependency**: Path resolution, router, Context construction, and response helpers \(concept:c68fea43\-9e8c\-44d2\-b4de\-c811f639da91\)

- [C5: The res getter lazily creates response storage with prepared headers; the getter itself does not set finalized\.](#claim-161b91b9-a49b-44d3-a919-0758464c5af3)

**Assumptions**

- [C27: The selected source calls response constructors, header methods, and Context response helpers\. Their implementations and complete failure behavior are outside these excerpts\.](#claim-a6cc6269-0179-4714-a6d7-a690685fd58b)

**Unknowns**

- [What failures and effects can the uninspected routing, construction, and response helpers produce?](#unknown-9)

<a id="function-e677a038-abee-4d92-8888-4b401adf7370"></a>

#### Supplied outer continuation

ID: `function:e677a038-abee-4d92-8888-4b401adf7370`.

Role: external-callback. No implementation is supplied for this callback.

**Inputs**

- [C17: At the terminal index, a supplied outer next is invoked through handler\(context, continuation\)\. Its runtime result and effects are not established here\.](#claim-56b29496-273a-4a7a-ba0e-f3b36aff76a3)

**Outputs**

- [C17: At the terminal index, a supplied outer next is invoked through handler\(context, continuation\)\. Its runtime result and effects are not established here\.](#claim-56b29496-273a-4a7a-ba0e-f3b36aff76a3)

**Effects**

None recorded; this does not prove absence.

**Assumptions**

- [C17: At the terminal index, a supplied outer next is invoked through handler\(context, continuation\)\. Its runtime result and effects are not established here\.](#claim-56b29496-273a-4a7a-ba0e-f3b36aff76a3)

**Unknowns**

- [Does the caller supply outer next, and what does that callback do?](#unknown-8)

</details>

### Scope and unknowns

<a id="unknown-0"></a>

<a id="unknown-eba96660-bcf1-4b91-9e5c-49c5d2765a07"></a>

ID: `unknown:eba96660-bcf1-4b91-9e5c-49c5d2765a07`.

Router matching internals and the runtime behavior of user handlers are outside these excerpts\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="unknown-1"></a>

<a id="unknown-362e87d4-167a-44b9-ae6b-7bfa50ab3bc2"></a>

ID: `unknown:362e87d4-167a-44b9-ae6b-7bfa50ab3bc2`.

Thrown failures from path resolution, router matching, or Context construction occur before the shown handler try/catch blocks; caller\-level handling is outside this request\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="unknown-2"></a>

<a id="unknown-19f56761-77f3-4f8c-a6b8-b80a5b89db8a"></a>

ID: `unknown:19f56761-77f3-4f8c-a6b8-b80a5b89db8a`.

Recursive next returns a Promise; whether a user handler awaits it is determined by that handler, not established by compose alone\. The flow describes frame recursion, not a flat scheduler\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="unknown-3"></a>

<a id="unknown-a4a48a8c-d7c2-4bb7-8983-6894c3565a05"></a>

ID: `unknown:a4a48a8c-d7c2-4bb7-8983-6894c3565a05`.

An error that escapes a child dispatch may be caught by an awaiting parent handler frame or by the application dispatcher\. No claim is made that every repeated\-next error bypasses all error handlers\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370), [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="unknown-4"></a>

<a id="unknown-a3c78386-5043-4a92-92dc-a230cd2fa4c4"></a>

ID: `unknown:a3c78386-5043-4a92-92dc-a230cd2fa4c4`.

The synchronous not\-found fallback lies outside the direct\-handler try/catch\. Caller handling of a throw there, or rejection from the HEAD wrapper, is not represented as a guaranteed local error callback\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="unknown-5"></a>

<a id="unknown-c5b36898-0d54-4362-a89b-09549b8feed4"></a>

ID: `unknown:c5b36898-0d54-4362-a89b-09549b8feed4`.

Which handler is selected at runtime, and what does it return, change, throw, or await? [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="unknown-6"></a>

<a id="unknown-103c40c5-62e1-4e74-95ec-43efdf897f20"></a>

ID: `unknown:103c40c5-62e1-4e74-95ec-43efdf897f20`.

Which error callback is configured, and can it fail or change response state? [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="unknown-7"></a>

<a id="unknown-e636a574-910c-4417-9f46-31ea8e287929"></a>

ID: `unknown:e636a574-910c-4417-9f46-31ea8e287929`.

Which not\-found callback is configured, and what are its effects and failure behavior? [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="unknown-8"></a>

<a id="unknown-81934ba3-ea7d-4e75-93b3-64dcc42a5c7e"></a>

ID: `unknown:81934ba3-ea7d-4e75-93b3-64dcc42a5c7e`.

Does the caller supply outer next, and what does that callback do? [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="unknown-9"></a>

<a id="unknown-f193b7f6-8caf-48c5-a3ef-a5b459f57a8e"></a>

ID: `unknown:f193b7f6-8caf-48c5-a3ef-a5b459f57a8e`.

What failures and effects can the uninspected routing, construction, and response helpers produce? [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/context\.ts:403](#evidence-efdc8a49582842d74bb72cf074179c4f18d4dc3a0f2d25c8ab366eb8630282b1), [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

### Claims

<a id="claim-005c1ad3-dcc5-4f77-b36f-7ee4a420f22c"></a>

**C1 · behavior:** The dispatcher awaits each handler result, allowing synchronous return values and promises to feed the same response handling\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-0b57c11a-c767-4573-8888-f3d49cbdf5c6"></a>

**C2 · state:** The res setter replaces the new set\-cookie collection with cookies from the previous response when merging that header\. [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

<a id="claim-0df938c1-9773-4d05-84ba-5bcecf66fb6c"></a>

**C3 · behavior:** The supplied outer next callback is eligible only at exactly middleware\.length when no middleware entry exists\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-146991bd-ed7d-4ae1-8868-888a11dedf6e"></a>

**C4 · state:** When both old and new responses exist, the res setter copies the new response before merging old headers, skipping the old content\-type\. [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

<a id="claim-161b91b9-a49b-44d3-a919-0758464c5af3"></a>

**C5 · state:** The res getter lazily creates response storage with prepared headers; the getter itself does not set finalized\. [src/context\.ts:403](#evidence-efdc8a49582842d74bb72cf074179c4f18d4dc3a0f2d25c8ab366eb8630282b1)

<a id="claim-1724bbd4-e936-42d3-a4cd-dabd7f2051aa"></a>

**C6 · state:** A normal returned response does not overwrite already finalized context through this assignment condition\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-1d2eae5b-efd0-4237-8671-50d5055dafe0"></a>

**C7 · state:** The res setter stores its argument and sets finalized to true, including when the argument is undefined\. [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

<a id="claim-25d1b193-56d5-4ad3-8be1-b7bb1bb30d2b"></a>

**C8 · constraint:** Dispatch rejects an index less than or equal to the last dispatched index with the repeated\-next Error\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-2c55a0d3-2faf-413e-8173-4aa184a3094e"></a>

**C9 · behavior:** The runner returns dispatch\(0\)\. This nested async function resolves to the shared context after successful completion and can reject on a propagated failure\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-36389804-ee71-4da7-bbdc-e77cb1d247b1"></a>

**C10 · behavior:** A present middleware entry supplies its handler from middleware\[i\]\[0\]\[0\]\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-3744e538-0f07-4ea4-a210-02d1a6c03781"></a>

**C11 · failure:** After awaiting onError, the dispatcher marks the result as an error response\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-37cba2c0-333b-4a16-b503-49cd1b020ffa"></a>

**C12 · failure:** A non\-Error throw or an Error without an onError callback is rethrown by that dispatch frame\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-39cc9873-5187-41f4-8403-332e355f7db9"></a>

**C13 · behavior:** compose accepts middleware entries and optional error and not\-found callbacks\. It returns a runner that accepts a Context and optional outer next callback\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-40001f0b-2785-462a-9244-1997813e69cd"></a>

**C14 · failure:** A failure inside the awaited onError callback escapes the current frame&\#39;s handler catch block\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-45c03f43-ef8c-4a6b-9f8a-24b2237fb6ca"></a>

**C15 · behavior:** The nested dispatch function accepts an index and closes over the runner context, progression index, middleware array, and optional callbacks\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-544dbd7e-acd1-4040-8b00-00b91c0e8f8d"></a>

**C16 · failure:** The handler catch uses onError only when the thrown value is an Error and an onError callback exists\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-56b29496-273a-4a7a-ba0e-f3b36aff76a3"></a>

**C17 · constraint:** At the terminal index, a supplied outer next is invoked through handler\(context, continuation\)\. Its runtime result and effects are not established here\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-5a6d5b53-546a-4ad0-bb93-b028876d1d12"></a>

**C18 · failure:** The repeated\-next guard throws before the current frame&\#39;s handler try/catch, so that frame does not process its own guard error through onError\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-5e705c38-4dd9-4e55-be1b-2f016881b2bd"></a>

**C19 · behavior:** Context\.notFound installs a fallback callback only when its private handler is nullish, then invokes the handler with this context\. [src/context\.ts:793](#evidence-3964d7755fbe93590183216380561fc4f6cf9eed1f24e7cd81b0943a88034107)

<a id="claim-6a188938-736d-4970-a698-88df4b787329"></a>

**C20 · state:** Before invoking onError, the handler catch writes the caught Error into context\.error\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-6b252ce9-9a3f-4cdb-9248-b0e515420829"></a>

**C21 · failure:** The onNotFound invocation is awaited outside the current handler try/catch\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-7f3aafe6-876f-4b5a-9bac-698144b2adfc"></a>

**C22 · state:** A falsy result does not trigger the final response assignment\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-8099fdae-3db1-47b0-b324-6d527a067dd6"></a>

**C23 · state:** The res getter takes no explicit argument\. It reads private response storage and can initialize both that storage and prepared headers\. [src/context\.ts:403](#evidence-efdc8a49582842d74bb72cf074179c4f18d4dc3a0f2d25c8ab366eb8630282b1)

<a id="claim-87cd957c-bb51-49fe-b9a4-291c106e08c5"></a>

**C24 · behavior:** A handler receives a continuation that recursively dispatches i \+ 1 using the same context\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-957e5bca-529c-4b7b-85cd-d3ad15c57993"></a>

**C25 · state:** Selecting a middleware entry also assigns i to context\.req\.routeIndex\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-a4808f91-eb8a-4a52-aed2-72effb4a139e"></a>

**C26 · state:** Each invocation of the runner returned by compose initializes its own progression index to \-1\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-a6cc6269-0179-4714-a6d7-a690685fd58b"></a>

**C27 · constraint:** The selected source calls response constructors, header methods, and Context response helpers\. Their implementations and complete failure behavior are outside these excerpts\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/context\.ts:403](#evidence-efdc8a49582842d74bb72cf074179c4f18d4dc3a0f2d25c8ab366eb8630282b1), [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5), [src/hono\-base\.ts:35](#evidence-4634461b115dd4a1479717296128dc6517427f5529a42e3937146f069d9ac09a)

<a id="claim-b1c5caa4-d40d-4e99-a478-a0483a83437a"></a>

**C28 · behavior:** The runner begins asynchronous dispatch at middleware index zero\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-b35b5c02-3b31-46cd-b1ac-2845ca7d8424"></a>

**C29 · state:** The progression index is updated before the current handler is selected or invoked\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-b3a42479-5499-4eed-8d21-09169deaf214"></a>

**C30 · failure:** The res setter merges headers before its final storage assignment and finalized update\. An exception during that merge can prevent those final assignments\. [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

<a id="claim-d543fd57-c7cb-4a8b-9078-fc6050980cf1"></a>

**C31 · constraint:** The res setter accepts Response or undefined by annotation and has no explicit return value\. It does not validate the argument type at runtime\. [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

<a id="claim-d5dd3300-e498-4ec8-b548-9d8308c15576"></a>

**C32 · behavior:** The fallback arrow installed by Context\.notFound calls createResponseInstance with no arguments and returns its result\. [src/context\.ts:793](#evidence-3964d7755fbe93590183216380561fc4f6cf9eed1f24e7cd81b0943a88034107)

<a id="claim-d5e3c85d-4a1d-4991-87d8-bd5369c091ab"></a>

**C33 · failure:** A truthy onError result may replace response state even when the context was already finalized\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370), [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

<a id="claim-d8b4fcf8-5869-40ef-a225-ff4e3d13bb99"></a>

**C34 · constraint:** If a parent handler awaits a child continuation and its rejection reaches the parent handler call, the parent frame catch can handle an Error through onError\. An unawaited continuation is not guaranteed to reach that catch\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-e1b56a2f-0a30-4965-865a-3ab75c96f399"></a>

**C35 · failure:** The composed frame assigns context\.res after the handler catch\. A failure from that assignment escapes the current handler catch and can reach an awaiting parent or application dispatcher\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370), [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

<a id="claim-e8b03c7a-182a-46d4-aeb8-bf4295b82798"></a>

**C36 · behavior:** Without a selected handler, onNotFound runs only when context\.finalized is exactly false and the callback exists\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-eb4d17a9-fa20-4ecc-9768-52ed19a28dea"></a>

**C37 · constraint:** Eligible error callbacks receive an Error and the current context\. Their returned values and failures depend on the configured implementation\. [src/hono\-base\.ts:401](#evidence-d19ca748f1302f0092f3bbbc30148d3c2d835f99f407db8e27802045d7c85b69), [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-f360cf06-1fc5-4b71-891d-37fdddbfeaa4"></a>

**C38 · constraint:** The shown call sites supply context and a continuation to selected handlers\. These excerpts do not establish their implementations, return values, failures, state changes, or use of await next\(\)\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-f67de3f4-647c-4c67-86e3-ab561267bf22"></a>

**C39 · behavior:** A successfully completed dispatch frame returns the shared context object\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-f984c4f5-e5e0-4ce9-a0fc-0b8884e34883"></a>

**C40 · constraint:** The configured not\-found callback receives the current context\. Its returned values and failures depend on the configured implementation\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-fca39081-cbda-4fe7-8212-cf21fdc9a885"></a>

**C41 · state:** A truthy response result is assigned to context\.res only when context is not finalized or the result came through onError\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370), [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

### Exact control flow

<a id="step-0927dcdd-b4e6-47dc-bb6e-67ec8e86ee7d"></a>

**Initialize invocation progression**

- Then → [Reject repeated or backward progression](#step-6b664680-e522-4784-922d-8f7b80992b82) [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
Claims: [C26](#claim-a4808f91-eb8a-4a52-aed2-72effb4a139e), [C28](#claim-b1c5caa4-d40d-4e99-a478-a0483a83437a). [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="step-6b664680-e522-4784-922d-8f7b80992b82"></a>

**Reject repeated or backward progression**

- Index is greater than previous index → [Select middleware or the terminal next callback](#step-a249dba7-bb8d-475a-a38d-a1a9cf7a9472) [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
- Index is less than or equal to previous index → [Propagate the failure from this frame](#step-2b229a25-c063-4a7c-ab4a-5b90f609670e) [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
Claims: [C8](#claim-25d1b193-56d5-4ad3-8be1-b7bb1bb30d2b), [C18](#claim-5a6d5b53-546a-4ad0-bb93-b028876d1d12). [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="step-a249dba7-bb8d-475a-a38d-a1a9cf7a9472"></a>

**Select middleware or the terminal next callback**

- A handler exists → [Await handler and its recursive next continuation](#step-6c021307-7902-43bc-9ed0-420de09fc078) [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
- No handler exists → [Invoke not\-found only if unfinalized](#step-d21a3bf3-b439-475c-9894-7cd0977c85ed) [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
Claims: [C29](#claim-b35b5c02-3b31-46cd-b1ac-2845ca7d8424), [C10](#claim-36389804-ee71-4da7-bbdc-e77cb1d247b1), [C25](#claim-957e5bca-529c-4b7b-85cd-d3ad15c57993), [C3](#claim-0df938c1-9773-4d05-84ba-5bcecf66fb6c). [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="step-6c021307-7902-43bc-9ed0-420de09fc078"></a>

**Await handler and its recursive next continuation**

- Handler invokes next: enter child frame at i \+ 1 → [Reject repeated or backward progression](#step-6b664680-e522-4784-922d-8f7b80992b82) [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
- Handler returns without another next, or resumes after child context returns → [Conditionally write response state](#step-9394aaf0-1e44-40f5-b32c-3af2d70a285f) [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
- Handler or its awaited child throws → [Handle eligible Error values](#step-6d99d430-1030-4bbe-8278-8707ffcc2e1f) [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
Claims: [C24](#claim-87cd957c-bb51-49fe-b9a4-291c106e08c5), [C1](#claim-005c1ad3-dcc5-4f77-b36f-7ee4a420f22c). [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="step-6d99d430-1030-4bbe-8278-8707ffcc2e1f"></a>

**Handle eligible Error values**

- onError succeeds for an Error value → [Conditionally write response state](#step-9394aaf0-1e44-40f5-b32c-3af2d70a285f) [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
- No eligible error handler, non\-Error throw, or onError fails → [Propagate the failure from this frame](#step-2b229a25-c063-4a7c-ab4a-5b90f609670e) [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
Claims: [C16](#claim-544dbd7e-acd1-4040-8b00-00b91c0e8f8d), [C20](#claim-6a188938-736d-4970-a698-88df4b787329), [C11](#claim-3744e538-0f07-4ea4-a210-02d1a6c03781), [C12](#claim-37cba2c0-333b-4a16-b503-49cd1b020ffa), [C14](#claim-40001f0b-2785-462a-9244-1997813e69cd). [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="step-d21a3bf3-b439-475c-9894-7cd0977c85ed"></a>

**Invoke not\-found only if unfinalized**

- Fallback completes or is not eligible → [Conditionally write response state](#step-9394aaf0-1e44-40f5-b32c-3af2d70a285f) [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
- Not\-found callback throws → [Propagate the failure from this frame](#step-2b229a25-c063-4a7c-ab4a-5b90f609670e) [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
Claims: [C36](#claim-e8b03c7a-182a-46d4-aeb8-bf4295b82798), [C21](#claim-6b252ce9-9a3f-4cdb-9248-b0e515420829). [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="step-9394aaf0-1e44-40f5-b32c-3af2d70a285f"></a>

**Conditionally write response state**

- Then → [Return shared context to the caller](#step-0f2e7303-9908-4bae-9695-1247c8ce948a) [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370), [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)
Claims: [C41](#claim-fca39081-cbda-4fe7-8212-cf21fdc9a885), [C6](#claim-1724bbd4-e936-42d3-a4cd-dabd7f2051aa), [C33](#claim-d5e3c85d-4a1d-4991-87d8-bd5369c091ab), [C22](#claim-7f3aafe6-876f-4b5a-9bac-698144b2adfc). [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370), [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

<a id="step-0f2e7303-9908-4bae-9695-1247c8ce948a"></a>

**Return shared context to the caller**

Claims: [C39](#claim-f67de3f4-647c-4c67-86e3-ab561267bf22). [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="step-2b229a25-c063-4a7c-ab4a-5b90f609670e"></a>

**Propagate the failure from this frame**

Claims: [C8](#claim-25d1b193-56d5-4ad3-8be1-b7bb1bb30d2b), [C12](#claim-37cba2c0-333b-4a16-b503-49cd1b020ffa), [C14](#claim-40001f0b-2785-462a-9244-1997813e69cd), [C21](#claim-6b252ce9-9a3f-4cdb-9248-b0e515420829), [C18](#claim-5a6d5b53-546a-4ad0-bb93-b028876d1d12). [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

### Evidence

<a id="evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370"></a>

#### src/compose\.ts:15–73

Evidence: `evidence:f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370`. Blob: `b1d4508ffe490fe4eaf1fa25a182c95f486685e5`. UTF-8 bytes [676, 2202).

```typescript
compose = <E extends Env = Env>(
  middleware: [[Function, unknown], unknown][] | [[Function]][],
  onError?: ErrorHandler<E>,
  onNotFound?: NotFoundHandler<E>
): ((context: Context, next?: Next) => Promise<Context>) => {
  return (context, next) => {
    let index = -1

    return dispatch(0)

    /**
     * Dispatch the middleware functions.
     *
     * @param {number} i - The current index in the middleware array.
     *
     * @returns {Promise<Context>} - A promise that resolves to the context.
     */
    async function dispatch(i: number): Promise<Context> {
      if (i <= index) {
        throw new Error('next() called multiple times')
      }
      index = i

      let res
      let isError = false
      let handler

      if (middleware[i]) {
        handler = middleware[i][0][0]
        context.req.routeIndex = i
      } else {
        handler = (i === middleware.length && next) || undefined
      }

      if (handler) {
        try {
          res = await handler(context, () => dispatch(i + 1))
        } catch (err) {
          if (err instanceof Error && onError) {
            context.error = err
            res = await onError(err, context)
            isError = true
          } else {
            throw err
          }
        }
      } else {
        if (context.finalized === false && onNotFound) {
          res = await onNotFound(context)
        }
      }

      if (res && (context.finalized === false || isError)) {
        context.res = res
      }
      return context
    }
  }
}
```

<a id="evidence-efdc8a49582842d74bb72cf074179c4f18d4dc3a0f2d25c8ab366eb8630282b1"></a>

#### src/context\.ts:403–407

Evidence: `evidence:efdc8a49582842d74bb72cf074179c4f18d4dc3a0f2d25c8ab366eb8630282b1`. Blob: `d611cc504c7eaa59cc273daccafd1e3d56066a7a`. UTF-8 bytes [12114, 12262).

```typescript
get res(): Response {
    return (this.#res ||= createResponseInstance(null, {
      headers: (this.#preparedHeaders ??= new Headers()),
    }))
  }
```

<a id="evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5"></a>

#### src/context\.ts:414–434

Evidence: `evidence:aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5`. Blob: `d611cc504c7eaa59cc273daccafd1e3d56066a7a`. UTF-8 bytes [12385, 12997).

```typescript
set res(_res: Response | undefined) {
    if (this.#res && _res) {
      _res = createResponseInstance(_res.body, _res)
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === 'content-type') {
          continue
        }
        if (k === 'set-cookie') {
          const cookies = this.#res.headers.getSetCookie()
          _res.headers.delete('set-cookie')
          for (const cookie of cookies) {
            _res.headers.append('set-cookie', cookie)
          }
        } else {
          _res.headers.set(k, v)
        }
      }
    }
    this.#res = _res
    this.finalized = true
  }
```

<a id="evidence-3964d7755fbe93590183216380561fc4f6cf9eed1f24e7cd81b0943a88034107"></a>

#### src/context\.ts:793–796

Evidence: `evidence:3964d7755fbe93590183216380561fc4f6cf9eed1f24e7cd81b0943a88034107`. Blob: `d611cc504c7eaa59cc273daccafd1e3d56066a7a`. UTF-8 bytes [22557, 22708).

```typescript
notFound = (): ReturnType<NotFoundHandler> => {
    this.#notFoundHandler ??= () => createResponseInstance()
    return this.#notFoundHandler(this)
  }
```

<a id="evidence-4634461b115dd4a1479717296128dc6517427f5529a42e3937146f069d9ac09a"></a>

#### src/hono\-base\.ts:35–42

Evidence: `evidence:4634461b115dd4a1479717296128dc6517427f5529a42e3937146f069d9ac09a`. Blob: `387fe89bf3cc95a2216251db919432ef7b0ddaeb`. UTF-8 bytes [842, 1061).

```typescript
errorHandler: ErrorHandler = (err, c) => {
  if ('getResponse' in err) {
    const res = err.getResponse()
    return c.newResponse(res.body, res)
  }
  console.error(err)
  return c.text('Internal Server Error', 500)
}
```

<a id="evidence-d19ca748f1302f0092f3bbbc30148d3c2d835f99f407db8e27802045d7c85b69"></a>

#### src/hono\-base\.ts:401–406

Evidence: `evidence:d19ca748f1302f0092f3bbbc30148d3c2d835f99f407db8e27802045d7c85b69`. Blob: `387fe89bf3cc95a2216251db919432ef7b0ddaeb`. UTF-8 bytes [12031, 12199).

```typescript
#handleError(err: unknown, c: Context<E>): Response | Promise<Response> {
    if (err instanceof Error) {
      return this.errorHandler(err, c)
    }
    throw err
  }
```

<a id="evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2"></a>

#### src/hono\-base\.ts:408–468

Evidence: `evidence:98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2`. Blob: `387fe89bf3cc95a2216251db919432ef7b0ddaeb`. UTF-8 bytes [12203, 13918).

```typescript
#dispatch(
    request: Request,
    executionCtx: ExecutionContext | FetchEventLike | undefined,
    env: E['Bindings'],
    method: string
  ): Response | Promise<Response> {
    // Handle HEAD method
    if (method === 'HEAD') {
      return (async () =>
        new Response(null, await this.#dispatch(request, executionCtx, env, 'GET')))()
    }

    const path = this.getPath(request, { env })
    const matchResult = this.router.match(method, path)

    const c = new Context(request, {
      path,
      matchResult,
      env,
      executionCtx,
      notFoundHandler: this.#notFoundHandler,
    })

    // Do not `compose` if it has only one handler
    if (matchResult[0].length === 1) {
      let res: ReturnType<H>
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c)
        })
      } catch (err) {
        return this.#handleError(err, c)
      }

      return res instanceof Promise
        ? res
            .then(
              (resolved: Response | undefined) =>
                resolved || (c.finalized ? c.res : this.#notFoundHandler(c))
            )
            .catch((err: Error) => this.#handleError(err, c))
        : (res ?? this.#notFoundHandler(c))
    }

    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler)

    return (async () => {
      try {
        const context = await composed(c)
        if (!context.finalized) {
          throw new Error(
            'Context is not finalized. Did you forget to return a Response object or `await next()`?'
          )
        }

        return context.res
      } catch (err) {
        return this.#handleError(err, c)
      }
    })()
  }
```

### Analysis details

Entry points: compose in src/compose\.ts.

Flow entries: [Initialize invocation progression](#step-0927dcdd-b4e6-47dc-bb6e-67ec8e86ee7d).

Transport: recorded-replay. Producer: Codex source\-reviewed contract authoring run. Model: not recorded.

Semantic artifact: `semantic:879ce0fdb5dee3f6f406bfa87e28f0d2f48b65fb58026479f9172bbd54b8c3f0`. Snapshot: `sha256:830729e39b7bcef4322bb641057509cc302f2ab598f998f37c370bc883f14eb9`.

Structural scan: `scan:fb8827cf671eeb148410a7e6967bb3025665851e64ae359a7bad515b72855f93`.

Claim support: unreviewed. Acceptance: proposed. Presentation: authored, unreviewed.

Scope: src/compose\.ts, src/context\.ts, src/hono\-base\.ts. 11 excerpts; 1731 other structural evidence records omitted.

Source scan: 25/25 selected files parsed; 0 failed; 10 support files.

### Related state and components

- Middleware composer — implements → Compose middleware [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
- Dispatch an incoming request — invokes → Compose middleware [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
- Compose middleware — writes → Response and finalization state [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370), [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)
- Compose middleware — writes → Middleware progression [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

### Source diagnostics

- EXTERNAL\_TYPES\_UNAVAILABLE: Source\-only mode does not load ambient type packages: node

### Source license

```text
MIT License

Copyright (c) 2021 - present, Yusuke Wada and Hono contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

</details>
