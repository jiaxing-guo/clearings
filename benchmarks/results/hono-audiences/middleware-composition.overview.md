# How request steps work together

Hono lets several functions work on the same request\. Each function can pass work to the next one and use the shared result\.

[Engineer version](middleware-composition.engineer.md)

## What happens

1. **Share the request.** Each function receives the same request context\.
2. **Pass work forward.** A function can call the next function\.
3. **Continue when work finishes.** If a function waits for later work, it resumes after that work completes\.

## A simple case

Two functions pass work forward and wait for it to finish\. The second completes before the first resumes\.

## What can happen next

### A response is available

Hono can keep a response already set by an earlier step\.

### No function is available

A configured fallback can run\. Its use depends on the response state\.

### A function fails

An error callback may handle the failure and replace the response\. Otherwise, the failure can pass to the caller\.

## What this view cannot tell you

Each application function chooses whether to pass work onward and wait\. These excerpts do not show those choices\.

An error can move back to an earlier function or to the application\. What happens there is outside this review\.

Recorded example · Partial repository view · Needs independent review

<a id="sources"></a>

<details>
<summary>Sources for this overview</summary>

Hono lets several functions work on the same request\. Each function can pass work to the next one and use the shared result\.

[src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370) · [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

Each function receives the same request context\.

[src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

A function can call the next function\.

[src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

If a function waits for later work, it resumes after that work completes\.

[src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

Two functions pass work forward and wait for it to finish\. The second completes before the first resumes\.

[src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

Hono can keep a response already set by an earlier step\.

[src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370) · [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

A configured fallback can run\. Its use depends on the response state\.

[src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

An error callback may handle the failure and replace the response\. Otherwise, the failure can pass to the caller\.

[src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370) · [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

Each application function chooses whether to pass work onward and wait\. These excerpts do not show those choices\.

[src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

An error can move back to an earlier function or to the application\. What happens there is outside this review\.

[src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370) · [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

</details>

<details>
<summary>Claims, exact flow, and source evidence</summary>

Source-based explanation. Claim support and the new explanations need independent review.

### Scope and unknowns

<a id="unknown-0"></a>

Router matching internals and the runtime behavior of user handlers are outside these excerpts\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="unknown-1"></a>

Thrown failures from path resolution, router matching, or Context construction occur before the shown handler try/catch blocks; caller\-level handling is outside this request\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="unknown-2"></a>

Recursive next returns a Promise; whether a user handler awaits it is determined by that handler, not established by compose alone\. The flow describes frame recursion, not a flat scheduler\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="unknown-3"></a>

An error that escapes a child dispatch may be caught by an awaiting parent handler frame or by the application dispatcher\. No claim is made that every repeated\-next error bypasses all error handlers\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370), [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="unknown-4"></a>

The synchronous not\-found fallback lies outside the direct\-handler try/catch\. Caller handling of a throw there, or rejection from the HEAD wrapper, is not represented as a guaranteed local error callback\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

### Claims

<a id="claim-a4808f91-eb8a-4a52-aed2-72effb4a139e"></a>

**C1 · state:** Each invocation of the runner returned by compose initializes its own progression index to \-1\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-b1c5caa4-d40d-4e99-a478-a0483a83437a"></a>

**C2 · behavior:** The runner begins asynchronous dispatch at middleware index zero\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-25d1b193-56d5-4ad3-8be1-b7bb1bb30d2b"></a>

**C3 · constraint:** Dispatch rejects an index less than or equal to the last dispatched index with the repeated\-next Error\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-b35b5c02-3b31-46cd-b1ac-2845ca7d8424"></a>

**C4 · state:** The progression index is updated before the current handler is selected or invoked\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-36389804-ee71-4da7-bbdc-e77cb1d247b1"></a>

**C5 · behavior:** A present middleware entry supplies its handler from middleware\[i\]\[0\]\[0\]\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-957e5bca-529c-4b7b-85cd-d3ad15c57993"></a>

**C6 · state:** Selecting a middleware entry also assigns i to context\.req\.routeIndex\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-0df938c1-9773-4d05-84ba-5bcecf66fb6c"></a>

**C7 · behavior:** The supplied outer next callback is eligible only at exactly middleware\.length when no middleware entry exists\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-87cd957c-bb51-49fe-b9a4-291c106e08c5"></a>

**C8 · behavior:** A handler receives a continuation that recursively dispatches i \+ 1 using the same context\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-005c1ad3-dcc5-4f77-b36f-7ee4a420f22c"></a>

**C9 · behavior:** The dispatcher awaits each handler result, allowing synchronous return values and promises to feed the same response handling\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-544dbd7e-acd1-4040-8b00-00b91c0e8f8d"></a>

**C10 · failure:** The handler catch uses onError only when the thrown value is an Error and an onError callback exists\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-6a188938-736d-4970-a698-88df4b787329"></a>

**C11 · state:** Before invoking onError, the handler catch writes the caught Error into context\.error\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-3744e538-0f07-4ea4-a210-02d1a6c03781"></a>

**C12 · failure:** After awaiting onError, the dispatcher marks the result as an error response\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-37cba2c0-333b-4a16-b503-49cd1b020ffa"></a>

**C13 · failure:** A non\-Error throw or an Error without an onError callback is rethrown by that dispatch frame\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-40001f0b-2785-462a-9244-1997813e69cd"></a>

**C14 · failure:** A failure inside the awaited onError callback escapes the current frame&\#39;s handler catch block\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-e8b03c7a-182a-46d4-aeb8-bf4295b82798"></a>

**C15 · behavior:** Without a selected handler, onNotFound runs only when context\.finalized is exactly false and the callback exists\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-6b252ce9-9a3f-4cdb-9248-b0e515420829"></a>

**C16 · failure:** The onNotFound invocation is awaited outside the current handler try/catch\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-fca39081-cbda-4fe7-8212-cf21fdc9a885"></a>

**C17 · state:** A truthy response result is assigned to context\.res only when context is not finalized or the result came through onError\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370), [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

<a id="claim-1724bbd4-e936-42d3-a4cd-dabd7f2051aa"></a>

**C18 · state:** A normal returned response does not overwrite already finalized context through this assignment condition\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-d5e3c85d-4a1d-4991-87d8-bd5369c091ab"></a>

**C19 · failure:** A truthy onError result may replace response state even when the context was already finalized\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370), [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

<a id="claim-7f3aafe6-876f-4b5a-9bac-698144b2adfc"></a>

**C20 · state:** A falsy result does not trigger the final response assignment\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-f67de3f4-647c-4c67-86e3-ab561267bf22"></a>

**C21 · behavior:** A successfully completed dispatch frame returns the shared context object\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-5a6d5b53-546a-4ad0-bb93-b028876d1d12"></a>

**C22 · failure:** The repeated\-next guard throws before the current frame&\#39;s handler try/catch, so that frame does not process its own guard error through onError\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

### Exact control flow

<a id="step-0927dcdd-b4e6-47dc-bb6e-67ec8e86ee7d"></a>

**Initialize invocation progression**

- Then → [Reject repeated or backward progression](#step-6b664680-e522-4784-922d-8f7b80992b82) [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
Claims: [C1](#claim-a4808f91-eb8a-4a52-aed2-72effb4a139e), [C2](#claim-b1c5caa4-d40d-4e99-a478-a0483a83437a). [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="step-6b664680-e522-4784-922d-8f7b80992b82"></a>

**Reject repeated or backward progression**

- Index is greater than previous index → [Select middleware or the terminal next callback](#step-a249dba7-bb8d-475a-a38d-a1a9cf7a9472) [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
- Index is less than or equal to previous index → [Propagate the failure from this frame](#step-2b229a25-c063-4a7c-ab4a-5b90f609670e) [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
Claims: [C3](#claim-25d1b193-56d5-4ad3-8be1-b7bb1bb30d2b), [C22](#claim-5a6d5b53-546a-4ad0-bb93-b028876d1d12). [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="step-a249dba7-bb8d-475a-a38d-a1a9cf7a9472"></a>

**Select middleware or the terminal next callback**

- A handler exists → [Await handler and its recursive next continuation](#step-6c021307-7902-43bc-9ed0-420de09fc078) [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
- No handler exists → [Invoke not\-found only if unfinalized](#step-d21a3bf3-b439-475c-9894-7cd0977c85ed) [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
Claims: [C4](#claim-b35b5c02-3b31-46cd-b1ac-2845ca7d8424), [C5](#claim-36389804-ee71-4da7-bbdc-e77cb1d247b1), [C6](#claim-957e5bca-529c-4b7b-85cd-d3ad15c57993), [C7](#claim-0df938c1-9773-4d05-84ba-5bcecf66fb6c). [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="step-6c021307-7902-43bc-9ed0-420de09fc078"></a>

**Await handler and its recursive next continuation**

- Handler invokes next: enter child frame at i \+ 1 → [Reject repeated or backward progression](#step-6b664680-e522-4784-922d-8f7b80992b82) [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
- Handler returns without another next, or resumes after child context returns → [Conditionally write response state](#step-9394aaf0-1e44-40f5-b32c-3af2d70a285f) [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
- Handler or its awaited child throws → [Handle eligible Error values](#step-6d99d430-1030-4bbe-8278-8707ffcc2e1f) [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
Claims: [C8](#claim-87cd957c-bb51-49fe-b9a4-291c106e08c5), [C9](#claim-005c1ad3-dcc5-4f77-b36f-7ee4a420f22c). [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="step-6d99d430-1030-4bbe-8278-8707ffcc2e1f"></a>

**Handle eligible Error values**

- onError succeeds for an Error value → [Conditionally write response state](#step-9394aaf0-1e44-40f5-b32c-3af2d70a285f) [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
- No eligible error handler, non\-Error throw, or onError fails → [Propagate the failure from this frame](#step-2b229a25-c063-4a7c-ab4a-5b90f609670e) [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
Claims: [C10](#claim-544dbd7e-acd1-4040-8b00-00b91c0e8f8d), [C11](#claim-6a188938-736d-4970-a698-88df4b787329), [C12](#claim-3744e538-0f07-4ea4-a210-02d1a6c03781), [C13](#claim-37cba2c0-333b-4a16-b503-49cd1b020ffa), [C14](#claim-40001f0b-2785-462a-9244-1997813e69cd). [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="step-d21a3bf3-b439-475c-9894-7cd0977c85ed"></a>

**Invoke not\-found only if unfinalized**

- Fallback completes or is not eligible → [Conditionally write response state](#step-9394aaf0-1e44-40f5-b32c-3af2d70a285f) [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
- Not\-found callback throws → [Propagate the failure from this frame](#step-2b229a25-c063-4a7c-ab4a-5b90f609670e) [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
Claims: [C15](#claim-e8b03c7a-182a-46d4-aeb8-bf4295b82798), [C16](#claim-6b252ce9-9a3f-4cdb-9248-b0e515420829). [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="step-9394aaf0-1e44-40f5-b32c-3af2d70a285f"></a>

**Conditionally write response state**

- Then → [Return shared context to the caller](#step-0f2e7303-9908-4bae-9695-1247c8ce948a) [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370), [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)
Claims: [C17](#claim-fca39081-cbda-4fe7-8212-cf21fdc9a885), [C18](#claim-1724bbd4-e936-42d3-a4cd-dabd7f2051aa), [C19](#claim-d5e3c85d-4a1d-4991-87d8-bd5369c091ab), [C20](#claim-7f3aafe6-876f-4b5a-9bac-698144b2adfc). [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370), [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

<a id="step-0f2e7303-9908-4bae-9695-1247c8ce948a"></a>

**Return shared context to the caller**

Claims: [C21](#claim-f67de3f4-647c-4c67-86e3-ab561267bf22). [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="step-2b229a25-c063-4a7c-ab4a-5b90f609670e"></a>

**Propagate the failure from this frame**

Claims: [C3](#claim-25d1b193-56d5-4ad3-8be1-b7bb1bb30d2b), [C13](#claim-37cba2c0-333b-4a16-b503-49cd1b020ffa), [C14](#claim-40001f0b-2785-462a-9244-1997813e69cd), [C16](#claim-6b252ce9-9a3f-4cdb-9248-b0e515420829), [C22](#claim-5a6d5b53-546a-4ad0-bb93-b028876d1d12). [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

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

Transport: recorded-replay. Producer: Codex source\-reading session. Model: not recorded.

Semantic artifact: `semantic:3b600ce62677cd56b9d3172a4cd2841f739dd41effc439a2d27acbb230142d56`. Snapshot: `sha256:830729e39b7bcef4322bb641057509cc302f2ab598f998f37c370bc883f14eb9`.

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
