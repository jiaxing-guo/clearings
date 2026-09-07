# Follow a request through Hono

A request enters through fetch\. Hono matches its route, runs the selected handlers, and chooses a response\. A handler is a function that processes the request\.

[src/hono\-base\.ts:481](#evidence-d973f31095c0885ec6968e6dfe05b9be07c8109174fa09d64d9941765210c070) · [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

Recorded example · Partial repository view · Needs independent review

[Overview version](request-dispatch.overview.md)

<a id="example"></a>

## Start with one direct response

Assume the router finds exactly one handler\. If that handler returns a Response directly, Hono returns it\. No middleware composition is needed for this case\.

[src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="guide-route"></a>
<a id="stage-method"></a>
<a id="stage-match"></a>

## First, match the request

For a request other than HEAD, Hono resolves the path and asks the router for matching handlers\.

It then creates a Context\. This object carries the request, match result, environment, and response state through the selected path\.

HEAD is a special case: Hono dispatches with GET as the method argument, keeps the original Request, and creates a response without a body\.

Source excerpt: [src/hono\-base\.ts:420–429](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

Partial excerpt. Code before and after this range is omitted.

```typescript
    const path = this.getPath(request, { env })
    const matchResult = this.router.match(method, path)

    const c = new Context(request, {
      path,
      matchResult,
      env,
      executionCtx,
      notFoundHandler: this.#notFoundHandler,
    })
```

<details>
<summary>Show surrounding source · lines 408–468</summary>

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

</details>

Sources: [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2) · [src/context\.ts:317](#evidence-81a4d8ab57de79a1d20f794795058cd6a0ca7721a9a8c8d8f71e8f8f764e2dca) · [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

Implementation: [HEAD wrapper](#function-013cff1d-eca2-4834-a4b0-51726491bcf1), [\#dispatch](#function-066fbdc1-2b42-4637-b456-7e8f96224eb4), [fetch](#function-f8b2cf93-7b1f-40fe-9098-9395af4a53ef)

<a id="guide-handlers"></a>
<a id="stage-handlers"></a>

## Then, choose how to run the handlers

Exactly one handler uses the direct path\. Hono calls it with the context and a next callback\.

Zero or multiple handlers use compose\. Hono passes the matching middleware and configured error and not\-found handlers, then waits for the composed runner\.

This choice matters when a handler does not return a response\. The two paths use different rules\.

Source excerpt: [src/hono\-base\.ts:431–450](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

Partial excerpt. Code before and after this range is omitted.

```typescript
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
```

<details>
<summary>Show surrounding source · lines 408–468</summary>

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

</details>

Sources: [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2) · [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

Implementation: [Nested middleware dispatch](#function-03f326d3-1de0-4410-808f-b673a2c4cfb3), [Direct handler next callback](#function-05c0f3fe-c675-4fc7-a1ef-4028fad0ac09), [\#dispatch](#function-066fbdc1-2b42-4637-b456-7e8f96224eb4), [compose](#function-92019dfa-b10c-4b1a-8ba3-914084ae947c), [Recursive middleware continuation](#function-a30d9cc8-bde8-4f72-8469-44f9b1e91a23), [Returned composition runner](#function-bc6399ac-1a94-4541-b51b-4cc6cc66aea8), [Selected application handler](#function-d888d262-67d4-4c35-a3d3-b88a00f3deb6), [Supplied outer continuation](#function-e677a038-abee-4d92-8888-4b401adf7370)

<a id="guide-response"></a>
<a id="stage-response"></a>

## Now, select the response

The direct path first checks whether the returned value is a Promise\.

For a non\-Promise result, null or undefined triggers the not\-found handler\. This branch does not check c\.finalized\.

For a Promise, a truthy resolved value wins\. Otherwise, Hono uses c\.res if c\.finalized is true\. If it is false, Hono calls the not\-found handler\.

After composition, Hono requires a finalized context and returns context\.res\. An unfinalized context causes an Error\.

The res getter does not finalize the context\. The setter sets finalized to true, even when its argument is undefined\.

Source excerpt: [src/hono\-base\.ts:442–449](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

Partial excerpt. Code before and after this range is omitted.

```typescript
      return res instanceof Promise
        ? res
            .then(
              (resolved: Response | undefined) =>
                resolved || (c.finalized ? c.res : this.#notFoundHandler(c))
            )
            .catch((err: Error) => this.#handleError(err, c))
        : (res ?? this.#notFoundHandler(c))
```

<details>
<summary>Show surrounding source · lines 408–468</summary>

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

</details>

Sources: [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2) · [src/context\.ts:403](#evidence-efdc8a49582842d74bb72cf074179c4f18d4dc3a0f2d25c8ab366eb8630282b1) · [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

Implementation: [Context\.notFound](#function-01860b94-d1f5-4de4-a585-e2c80ae4c52e), [Nested middleware dispatch](#function-03f326d3-1de0-4410-808f-b673a2c4cfb3), [Direct handler next callback](#function-05c0f3fe-c675-4fc7-a1ef-4028fad0ac09), [\#dispatch](#function-066fbdc1-2b42-4637-b456-7e8f96224eb4), [Configured not\-found callback](#function-2ed115cb-3d2d-4d04-9657-d8829ba4ee56), [Composed result finalization](#function-379c4b0e-13f0-4689-aa90-c2c2d12abb62), [Context not\-found fallback arrow](#function-49d6bd1e-9aaf-4234-8f34-2aa0011e86b4), [Direct Promise result selection](#function-94ab9b66-e4ca-4f2d-83ce-ab7711ff65da), [Context\.res setter](#function-9cb45f6c-5651-4587-89b1-acc02a5e7fb3), [Default not\-found handler](#function-d4b105fc-0419-4a56-a19c-5d02dce157e5), [Context\.res getter](#function-e4635ca2-ec40-4091-ad54-7be94f4c32ba)

<a id="guide-failure"></a>
<a id="stage-failure"></a>

## Finally, follow any failure to its handler

The direct handler catch, Promise rejection handler, and composition catch call \#handleError\. It delegates Error instances to the configured callback and rethrows other values\.

The direct not\-found fallback is outside the direct handler catch block\. If it throws synchronously, that failure can reach the caller\.

The default not\-found handler uses status 404\. The default error handler can use getResponse; otherwise, it logs the error and uses status 500\.

Source excerpt: [src/hono\-base\.ts:401–406](#evidence-d19ca748f1302f0092f3bbbc30148d3c2d835f99f407db8e27802045d7c85b69)

```typescript
#handleError(err: unknown, c: Context<E>): Response | Promise<Response> {
    if (err instanceof Error) {
      return this.errorHandler(err, c)
    }
    throw err
  }
```

Sources: [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2) · [src/hono\-base\.ts:401](#evidence-d19ca748f1302f0092f3bbbc30148d3c2d835f99f407db8e27802045d7c85b69) · [src/hono\-base\.ts:191](#evidence-e6e723339481e57866817eae505f437cf7cf9fcc9938197fc569fb0760769e2b) · [src/hono\-base\.ts:35](#evidence-4634461b115dd4a1479717296128dc6517427f5529a42e3937146f069d9ac09a) · [src/hono\-base\.ts:31](#evidence-50e79ea172dc01947732e6a2fefd65b67b5c28d7dee03948f5ad30474ea840ab)

Implementation: [Nested middleware dispatch](#function-03f326d3-1de0-4410-808f-b673a2c4cfb3), [\#dispatch](#function-066fbdc1-2b42-4637-b456-7e8f96224eb4), [\#handleError](#function-0ae4f7fa-8fab-4114-b656-e0c4a210b97e), [Composed result finalization](#function-379c4b0e-13f0-4689-aa90-c2c2d12abb62), [Configured error callback](#function-98d308f3-506e-458a-9b99-bfe76154df29), [Direct Promise rejection callback](#function-c14693d1-3c79-4916-a155-6c5fd1f91121), [Default error handler](#function-e8579b0c-8859-4dec-9c87-cf458c481a23)

## Limits of this explanation

Your routes and application functions determine the actual behavior\. Their implementation is outside these excerpts\.

[src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2) · [Scope note 1](#unknown-0)

Some failures leave this part of Hono\. The excerpts do not show how the caller handles them\.

[src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2) · [Scope note 2](#unknown-1) · [Scope note 5](#unknown-4)

<a id="questions"></a>

## Specific questions

### What happens for a HEAD request?

Hono dispatches with GET as the method argument, while it keeps the original request\. It then creates a response with a null body\.

The shown wrapper does not guarantee local handling of every rejection\.

[src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
[src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2) · [Scope note 5](#unknown-4)

### What happens with one matching handler?

Hono calls the handler directly\. It then selects the Promise or direct return path from the returned value\.

[src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

### What happens with zero or multiple handlers?

Both cases use compose with the configured error and not\-found handlers\. Hono waits for the result, then requires a finalized context\.

If the context is finalized, Hono returns context\.res\. Otherwise, the finalization check raises an Error\.

[src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2) · [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
[src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

### What if a handler returns no response?

For a direct null or undefined result, Hono calls the not\-found handler without checking finalized\.

For a falsy Promise result, Hono first checks finalized\. It uses c\.res if finalized is true\. Otherwise, it calls the not\-found handler\.

After composition, an unfinalized context causes an Error\.

[src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
[src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
[src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

### Can a not\-found failure escape the local catch?

Yes\. The direct not\-found fallback runs outside the direct handler catch block\. A synchronous throw there can reach the caller\.

Caller handling is outside this source view\.

[src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
[src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2) · [Scope note 5](#unknown-4)

### Does reading context\.res finalize the response?

No\. The getter can create response storage, but it does not set finalized\. The setter sets finalized to true, even for undefined\.

[src/context\.ts:403](#evidence-efdc8a49582842d74bb72cf074179c4f18d4dc3a0f2d25c8ab366eb8630282b1) · [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

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

<a id="behavior-42d63d87-e608-4e10-b671-fa0db39ad2f2"></a>

#### Select the dispatch method and route

ID: `behavior:42d63d87-e608-4e10-b671-fa0db39ad2f2`.

**Triggers**

- [C54: fetch forwards the original request, its method, the environment, and the execution context into the private dispatcher\.](#claim-be525e2a-9f68-4196-b67c-7bf670fbee39)
- [C23: The private dispatcher accepts a Request, execution context, environment bindings, and a method argument\. The annotations do not validate runtime inputs\.](#claim-491da471-0962-4036-8623-5a924a379a28)

**Functions**

- [fetch](#function-f8b2cf93-7b1f-40fe-9098-9395af4a53ef)
- [\#dispatch](#function-066fbdc1-2b42-4637-b456-7e8f96224eb4)
- [HEAD wrapper](#function-013cff1d-eca2-4834-a4b0-51726491bcf1)

**State**

- Response and finalization state \(concept:15b53c40\-cf7c\-454c\-bdab\-3c1d77c4f3e3\)

**Flow steps**

- [Select dispatch method](#step-fdc5198f-dec9-4c31-a00f-59b930e9e076)
- [Dispatch GET and remove the response body](#step-c8e6ec4b-17bf-4637-8e47-40b6b7b992f7)
- [Resolve path, match routes, create context](#step-c9a85946-abf2-4a8e-9dec-59fa95a966f1)
- [Choose handling path](#step-3301e9a4-0b62-40b9-bcc5-74652de3839a)

**Outcome condition**: The dispatch method is HEAD\.

- [C3: HEAD dispatch recursively uses GET as the dispatch method argument while retaining the original Request object\.](#claim-085248c3-81b0-4cad-986d-05fee44fe506)
- [C66: HEAD constructs a new Response with a null body and the awaited GET\-dispatch response as its initialization argument\.](#claim-f30ea83a-a386-4f3c-93af-21067f7f47cb)

**Outcome condition**: The dispatch method is not HEAD\.

- [C44: For non\-HEAD dispatch, the configured path resolver receives the request and an object containing env\.](#claim-889f741d-3df0-47f5-9e19-2a06a2a99445)
- [C45: Router matching receives the dispatch method and the resolved path\.](#claim-8b0483bd-c519-497b-b081-d286863646b7)
- [C35: Dispatch creates a Context with the request, path, match result, env, execution context, and configured not\-found handler\.](#claim-6ea34fc3-66d3-437b-a99c-f67c5043f6b6)

**Outcome condition**: Exactly one handler is matched\.

- [C19: Exactly one matched handler takes a direct path that bypasses compose\.](#claim-3c7751cc-3137-4636-a809-aa2a0ee43c9e)

**Outcome condition**: Zero or more than one handler is matched\.

- [C11: Zero handlers and more than one handler both enter the composition path\.](#claim-2639197b-bb38-4ed2-9817-07e369a77759)

**Failure**: Request setup fails before handler catches\. → Outside the represented boundary

- [C57: Path resolution, route matching, and Context construction occur before the direct\-handler and composed\-runner try blocks\. A failure there does not enter those local catches\.](#claim-d3f7ed18-fd8d-44d4-b50d-11e2dc21e501)

**Failure**: The HEAD wrapper fails\. → Outside the represented boundary

- [C2: The HEAD wrapper awaits recursive GET dispatch and constructs a Response outside the other local handler catches\. A failure in that wrapper rejects its returned Promise\.](#claim-07e14fa8-6312-422f-920f-8de6ebf3639f)

**Constraints**

- [C23: The private dispatcher accepts a Request, execution context, environment bindings, and a method argument\. The annotations do not validate runtime inputs\.](#claim-491da471-0962-4036-8623-5a924a379a28)
- [C48: The selected source calls response constructors, header methods, and Context response helpers\. Their implementations and complete failure behavior are outside these excerpts\.](#claim-a6cc6269-0179-4714-a6d7-a690685fd58b)

**Unknowns**

- [Router matching internals and the runtime behavior of user handlers are outside these excerpts\.](#unknown-0)
- [Thrown failures from path resolution, router matching, or Context construction occur before the shown handler try/catch blocks; caller\-level handling is outside this request\.](#unknown-1)
- [The synchronous not\-found fallback lies outside the direct\-handler try/catch\. Caller handling of a throw there, or rejection from the HEAD wrapper, is not represented as a guaranteed local error callback\.](#unknown-4)

<a id="behavior-252223db-4880-4aca-b951-6070c8f7e4c6"></a>

#### Select a direct, Promise, or composed response

ID: `behavior:252223db-4880-4aca-b951-6070c8f7e4c6`.

**Triggers**

- [C19: Exactly one matched handler takes a direct path that bypasses compose\.](#claim-3c7751cc-3137-4636-a809-aa2a0ee43c9e)
- [C20: The direct path distinguishes a returned Promise using instanceof Promise\.](#claim-3ebf7dad-d613-4994-9e9e-f59bb1d79317)
- [C11: Zero handlers and more than one handler both enter the composition path\.](#claim-2639197b-bb38-4ed2-9817-07e369a77759)

**Functions**

- [\#dispatch](#function-066fbdc1-2b42-4637-b456-7e8f96224eb4)
- [Direct handler next callback](#function-05c0f3fe-c675-4fc7-a1ef-4028fad0ac09)
- [Direct Promise result selection](#function-94ab9b66-e4ca-4f2d-83ce-ab7711ff65da)
- [Direct Promise rejection callback](#function-c14693d1-3c79-4916-a155-6c5fd1f91121)
- [Composed result finalization](#function-379c4b0e-13f0-4689-aa90-c2c2d12abb62)
- [Context\.res getter](#function-e4635ca2-ec40-4091-ad54-7be94f4c32ba)
- [Context\.res setter](#function-9cb45f6c-5651-4587-89b1-acc02a5e7fb3)
- [\#handleError](#function-0ae4f7fa-8fab-4114-b656-e0c4a210b97e)

**State**

- Response and finalization state \(concept:15b53c40\-cf7c\-454c\-bdab\-3c1d77c4f3e3\)

**Flow steps**

- [Invoke the direct handler and classify its result](#step-cdf57463-13f7-4ae8-9709-ea1462e942d2)
- [Resolve the response or context/not\-found fallback](#step-7539d22f-ed85-48df-bba7-ca69334adb90)
- [Use a non\-nullish result or invoke not\-found](#step-6f7b0430-e901-4ab6-9a3d-b088f2b012e8)
- [Await middleware composition](#step-bd8c16b3-f9f9-4211-93a8-0cfd6fdef1f3)
- [Require a finalized context](#step-4ccc4676-c52d-4d20-ab3d-7578bfedcda6)
- [Delegate Error values or rethrow other values](#step-6e269ade-b6c0-4442-8553-6445a5fbbb6e)
- [Return the selected response](#step-78c04a66-b80a-4358-8b55-58a8d1523e29)
- [Propagate a synchronous fallback failure](#step-95622008-6e00-4397-9d3b-37cf7633368e)

**Outcome condition**: A direct non\-Promise result is non\-nullish\.

- [C29: A direct non\-Promise result that is neither null nor undefined is returned unchanged\. That expression does not check whether the value is a Response\.](#claim-5b606765-089d-4722-8213-b675dde66bf5)

**Outcome condition**: A direct non\-Promise result is null or undefined\.

- [C49: A non\-Promise nullish direct result invokes the not\-found handler; this expression does not consult c\.finalized\.](#claim-abe1d0e6-876f-40a3-b8e1-aac696dd56f5)

**Outcome condition**: A returned Promise resolves to a truthy value\.

- [C13: A truthy resolved response from that Promise is returned before consulting finalized context state\.](#claim-32832fda-23d3-411c-8392-6782b3634057)

**Outcome condition**: A returned Promise resolves to a falsy value and c\.finalized is truthy\.

- [C42: A falsy resolved Promise value falls back to c\.res when finalized, otherwise to the configured not\-found handler\.](#claim-876a95e6-ca91-46c2-b831-60091068b69d)

**Outcome condition**: A returned Promise resolves to a falsy value and c\.finalized is falsy\.

- [C42: A falsy resolved Promise value falls back to c\.res when finalized, otherwise to the configured not\-found handler\.](#claim-876a95e6-ca91-46c2-b831-60091068b69d)

**Outcome condition**: The composed path completes with finalized context\.

- [C39: The composition path returns context\.res after checking finalized\.](#claim-7ce9d699-11e2-481a-866e-c1e4356ea24d)

**Outcome condition**: The res getter creates storage before finalization\.

- [C36: The Context finalized field is initialized to false\.](#claim-6f5292fe-ce44-4891-9436-47ae3462ead0)
- [C7: The res getter lazily creates response storage with prepared headers; the getter itself does not set finalized\.](#claim-161b91b9-a49b-44d3-a919-0758464c5af3)

**Outcome condition**: The setter receives undefined\.

- [C9: The res setter stores its argument and sets finalized to true, including when the argument is undefined\.](#claim-1d2eae5b-efd0-4237-8671-50d5055dafe0)
- [C59: The res setter accepts Response or undefined by annotation and has no explicit return value\. It does not validate the argument type at runtime\.](#claim-d543fd57-c7cb-4a8b-9078-fc6050980cf1)

**Failure**: The direct handler throws or its Promise chain rejects\. → [\#handleError (function:0ae4f7fa-8fab-4114-b656-e0c4a210b97e)](#function-0ae4f7fa-8fab-4114-b656-e0c4a210b97e)

- [C18: A synchronous throw from the direct handler is sent to the private error handler\.](#claim-3a465dfd-a823-4297-a867-dc7b31edd393)
- [C34: Rejection in the direct Promise chain is sent to the private error handler\.](#claim-6b5a8b30-ea42-46e9-880d-53099dbe6c56)

**Failure**: The direct nullish fallback throws synchronously\. → Outside the represented boundary

- [C55: The synchronous direct\-result fallback invokes not\-found outside the direct handler try/catch, so a throw there can propagate to the caller\.](#claim-bf2950af-c55d-401a-9691-50acf819a3f2)

**Failure**: Composition fails or returns unfinalized context\. → [\#handleError (function:0ae4f7fa-8fab-4114-b656-e0c4a210b97e)](#function-0ae4f7fa-8fab-4114-b656-e0c4a210b97e)

- [C53: An unfinalized context returned by composition causes an Error about returning a Response or awaiting next\.](#claim-b962178a-0e5d-4e27-a698-38b48e7fdd3a)
- [C38: A throw during the awaited composed path or its finalization check is passed to the private error handler\.](#claim-7af68846-ae57-44cd-8e06-49e5596a226b)

**Failure**: The error callback fails or the error value is not an Error\. → Outside the represented boundary

- [C69: The private error handler delegates Error instances to the configured error callback and rethrows other values\.](#claim-f5f65ad6-ca98-41d8-95dd-293ac83d5f15)
- [C72: The private error handler calls the configured error callback without a local try block\. Its synchronous throw or returned rejection can pass to the caller\.](#claim-fc07b7ac-e50a-4c46-8293-6c36dcbfbbdb)

**Constraints**

- [C29: A direct non\-Promise result that is neither null nor undefined is returned unchanged\. That expression does not check whether the value is a Response\.](#claim-5b606765-089d-4722-8213-b675dde66bf5)
- [C59: The res setter accepts Response or undefined by annotation and has no explicit return value\. It does not validate the argument type at runtime\.](#claim-d543fd57-c7cb-4a8b-9078-fc6050980cf1)
- [C67: The shown call sites supply context and a continuation to selected handlers\. These excerpts do not establish their implementations, return values, failures, state changes, or use of await next\(\)\.](#claim-f360cf06-1fc5-4b71-891d-37fdddbfeaa4)

**Unknowns**

- [Router matching internals and the runtime behavior of user handlers are outside these excerpts\.](#unknown-0)
- [Thrown failures from path resolution, router matching, or Context construction occur before the shown handler try/catch blocks; caller\-level handling is outside this request\.](#unknown-1)
- [The synchronous not\-found fallback lies outside the direct\-handler try/catch\. Caller handling of a throw there, or rejection from the HEAD wrapper, is not represented as a guaranteed local error callback\.](#unknown-4)

<a id="function-013cff1d-eca2-4834-a4b0-51726491bcf1"></a>

#### HEAD wrapper

ID: `function:013cff1d-eca2-4834-a4b0-51726491bcf1`.

Role: arrow. [src/hono\-base\.ts](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2) · UTF-8 bytes [12449, 12544).

**Inputs**

- [C3: HEAD dispatch recursively uses GET as the dispatch method argument while retaining the original Request object\.](#claim-085248c3-81b0-4cad-986d-05fee44fe506)

**Outputs**

- [C66: HEAD constructs a new Response with a null body and the awaited GET\-dispatch response as its initialization argument\.](#claim-f30ea83a-a386-4f3c-93af-21067f7f47cb)

**Effects**

None recorded; this does not prove absence.

**Failure**: Recursive dispatch or Response construction fails\. → Outside the represented boundary

- [C2: The HEAD wrapper awaits recursive GET dispatch and constructs a Response outside the other local handler catches\. A failure in that wrapper rejects its returned Promise\.](#claim-07e14fa8-6312-422f-920f-8de6ebf3639f)

**Dependency**: [\#dispatch (function:066fbdc1-2b42-4637-b456-7e8f96224eb4)](#function-066fbdc1-2b42-4637-b456-7e8f96224eb4)

- [C3: HEAD dispatch recursively uses GET as the dispatch method argument while retaining the original Request object\.](#claim-085248c3-81b0-4cad-986d-05fee44fe506)

**Dependency**: Path resolution, router, Context construction, and response helpers \(concept:c68fea43\-9e8c\-44d2\-b4de\-c811f639da91\)

- [C66: HEAD constructs a new Response with a null body and the awaited GET\-dispatch response as its initialization argument\.](#claim-f30ea83a-a386-4f3c-93af-21067f7f47cb)

**Assumptions**

None recorded; this does not prove absence.

**Unknowns**

- [What failures and effects can the uninspected routing, construction, and response helpers produce?](#unknown-9)

<a id="function-01860b94-d1f5-4de4-a585-e2c80ae4c52e"></a>

#### Context\.notFound

ID: `function:01860b94-d1f5-4de4-a585-e2c80ae4c52e`.

Role: arrow. [src/context\.ts](#evidence-3964d7755fbe93590183216380561fc4f6cf9eed1f24e7cd81b0943a88034107) · UTF-8 bytes [22568, 22708).

**Inputs**

- [C30: Context\.notFound installs a fallback callback only when its private handler is nullish, then invokes the handler with this context\.](#claim-5e705c38-4dd9-4e55-be1b-2f016881b2bd)

**Outputs**

- [C30: Context\.notFound installs a fallback callback only when its private handler is nullish, then invokes the handler with this context\.](#claim-5e705c38-4dd9-4e55-be1b-2f016881b2bd)

**State: read\-write**: The Context private not\-found callback \(concept:adc95999\-3d01\-44d8\-bf5e\-72a3ca87c192\)

- [C30: Context\.notFound installs a fallback callback only when its private handler is nullish, then invokes the handler with this context\.](#claim-5e705c38-4dd9-4e55-be1b-2f016881b2bd)

**Effects**

- [C30: Context\.notFound installs a fallback callback only when its private handler is nullish, then invokes the handler with this context\.](#claim-5e705c38-4dd9-4e55-be1b-2f016881b2bd)

**Dependency**: [Context not\-found fallback arrow (function:49d6bd1e-9aaf-4234-8f34-2aa0011e86b4)](#function-49d6bd1e-9aaf-4234-8f34-2aa0011e86b4)

- [C30: Context\.notFound installs a fallback callback only when its private handler is nullish, then invokes the handler with this context\.](#claim-5e705c38-4dd9-4e55-be1b-2f016881b2bd)
- [C60: The fallback arrow installed by Context\.notFound calls createResponseInstance with no arguments and returns its result\.](#claim-d5dd3300-e498-4ec8-b548-9d8308c15576)

**Dependency**: [Configured not\-found callback (function:2ed115cb-3d2d-4d04-9657-d8829ba4ee56)](#function-2ed115cb-3d2d-4d04-9657-d8829ba4ee56)

- [C30: Context\.notFound installs a fallback callback only when its private handler is nullish, then invokes the handler with this context\.](#claim-5e705c38-4dd9-4e55-be1b-2f016881b2bd)

**Assumptions**

- [C48: The selected source calls response constructors, header methods, and Context response helpers\. Their implementations and complete failure behavior are outside these excerpts\.](#claim-a6cc6269-0179-4714-a6d7-a690685fd58b)

**Unknowns**

None recorded; this does not prove absence.

<a id="function-03f326d3-1de0-4410-808f-b673a2c4cfb3"></a>

#### Nested middleware dispatch

ID: `function:03f326d3-1de0-4410-808f-b673a2c4cfb3`.

Role: function. [src/compose\.ts](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370) · UTF-8 bytes [1196, 2196).

**Inputs**

- [C22: The nested dispatch function accepts an index and closes over the runner context, progression index, middleware array, and optional callbacks\.](#claim-45c03f43-ef8c-4a6b-9f8a-24b2237fb6ca)

**Outputs**

- [C70: A successfully completed dispatch frame returns the shared context object\.](#claim-f67de3f4-647c-4c67-86e3-ab561267bf22)

**State: read\-write**: Middleware progression \(concept:132172da\-47ee\-48c0\-93f3\-1fae3ee7800c\)

- [C10: Dispatch rejects an index less than or equal to the last dispatched index with the repeated\-next Error\.](#claim-25d1b193-56d5-4ad3-8be1-b7bb1bb30d2b)
- [C51: The progression index is updated before the current handler is selected or invoked\.](#claim-b35b5c02-3b31-46cd-b1ac-2845ca7d8424)
- [C46: Selecting a middleware entry also assigns i to context\.req\.routeIndex\.](#claim-957e5bca-529c-4b7b-85cd-d3ad15c57993)

**State: read\-write**: Response and finalization state \(concept:15b53c40\-cf7c\-454c\-bdab\-3c1d77c4f3e3\)

- [C64: Without a selected handler, onNotFound runs only when context\.finalized is exactly false and the callback exists\.](#claim-e8b03c7a-182a-46d4-aeb8-bf4295b82798)
- [C73: A truthy response result is assigned to context\.res only when context is not finalized or the result came through onError\.](#claim-fca39081-cbda-4fe7-8212-cf21fdc9a885)
- [C8: A normal returned response does not overwrite already finalized context through this assignment condition\.](#claim-1724bbd4-e936-42d3-a4cd-dabd7f2051aa)
- [C61: A truthy onError result may replace response state even when the context was already finalized\.](#claim-d5e3c85d-4a1d-4991-87d8-bd5369c091ab)
- [C40: A falsy result does not trigger the final response assignment\.](#claim-7f3aafe6-876f-4b5a-9bac-698144b2adfc)

**State: write**: The context\.error field \(concept:e9a65dde\-cd8f\-4731\-9dc6\-776d8d9216a8\)

- [C31: Before invoking onError, the handler catch writes the caught Error into context\.error\.](#claim-6a188938-736d-4970-a698-88df4b787329)

**Effects**

- [C46: Selecting a middleware entry also assigns i to context\.req\.routeIndex\.](#claim-957e5bca-529c-4b7b-85cd-d3ad15c57993)
- [C31: Before invoking onError, the handler catch writes the caught Error into context\.error\.](#claim-6a188938-736d-4970-a698-88df4b787329)

**Failure**: The progression index is repeated or moves backward\. → Outside the represented boundary

- [C10: Dispatch rejects an index less than or equal to the last dispatched index with the repeated\-next Error\.](#claim-25d1b193-56d5-4ad3-8be1-b7bb1bb30d2b)
- [C28: The repeated\-next guard throws before the current frame&\#39;s handler try/catch, so that frame does not process its own guard error through onError\.](#claim-5a6d5b53-546a-4ad0-bb93-b028876d1d12)
- [C62: If a parent handler awaits a child continuation and its rejection reaches the parent handler call, the parent frame catch can handle an Error through onError\. An unawaited continuation is not guaranteed to reach that catch\.](#claim-d8b4fcf8-5869-40ef-a225-ff4e3d13bb99)

**Failure**: A handler throws an Error and onError exists\. → [Configured error callback (function:98d308f3-506e-458a-9b99-bfe76154df29)](#function-98d308f3-506e-458a-9b99-bfe76154df29)

- [C26: The handler catch uses onError only when the thrown value is an Error and an onError callback exists\.](#claim-544dbd7e-acd1-4040-8b00-00b91c0e8f8d)
- [C31: Before invoking onError, the handler catch writes the caught Error into context\.error\.](#claim-6a188938-736d-4970-a698-88df4b787329)
- [C15: After awaiting onError, the dispatcher marks the result as an error response\.](#claim-3744e538-0f07-4ea4-a210-02d1a6c03781)

**Failure**: The thrown value is not an Error, or no onError exists\. → Outside the represented boundary

- [C16: A non\-Error throw or an Error without an onError callback is rethrown by that dispatch frame\.](#claim-37cba2c0-333b-4a16-b503-49cd1b020ffa)
- [C62: If a parent handler awaits a child continuation and its rejection reaches the parent handler call, the parent frame catch can handle an Error through onError\. An unawaited continuation is not guaranteed to reach that catch\.](#claim-d8b4fcf8-5869-40ef-a225-ff4e3d13bb99)

**Failure**: onError fails inside the catch block\. → Outside the represented boundary

- [C21: A failure inside the awaited onError callback escapes the current frame&\#39;s handler catch block\.](#claim-40001f0b-2785-462a-9244-1997813e69cd)
- [C62: If a parent handler awaits a child continuation and its rejection reaches the parent handler call, the parent frame catch can handle an Error through onError\. An unawaited continuation is not guaranteed to reach that catch\.](#claim-d8b4fcf8-5869-40ef-a225-ff4e3d13bb99)

**Failure**: onNotFound fails outside the handler try block\. → Outside the represented boundary

- [C33: The onNotFound invocation is awaited outside the current handler try/catch\.](#claim-6b252ce9-9a3f-4cdb-9248-b0e515420829)
- [C62: If a parent handler awaits a child continuation and its rejection reaches the parent handler call, the parent frame catch can handle an Error through onError\. An unawaited continuation is not guaranteed to reach that catch\.](#claim-d8b4fcf8-5869-40ef-a225-ff4e3d13bb99)

**Failure**: The response setter fails after the handler catch\. → Outside the represented boundary

- [C63: The composed frame assigns context\.res after the handler catch\. A failure from that assignment escapes the current handler catch and can reach an awaiting parent or application dispatcher\.](#claim-e1b56a2f-0a30-4965-865a-3ab75c96f399)
- [C62: If a parent handler awaits a child continuation and its rejection reaches the parent handler call, the parent frame catch can handle an Error through onError\. An unawaited continuation is not guaranteed to reach that catch\.](#claim-d8b4fcf8-5869-40ef-a225-ff4e3d13bb99)

**Dependency**: [Recursive middleware continuation (function:a30d9cc8-bde8-4f72-8469-44f9b1e91a23)](#function-a30d9cc8-bde8-4f72-8469-44f9b1e91a23)

- [C43: A handler receives a continuation that recursively dispatches i \+ 1 using the same context\.](#claim-87cd957c-bb51-49fe-b9a4-291c106e08c5)

**Dependency**: [Selected application handler (function:d888d262-67d4-4c35-a3d3-b88a00f3deb6)](#function-d888d262-67d4-4c35-a3d3-b88a00f3deb6)

- [C14: A present middleware entry supplies its handler from middleware\[i\]\[0\]\[0\]\.](#claim-36389804-ee71-4da7-bbdc-e77cb1d247b1)
- [C1: The dispatcher awaits each handler result, allowing synchronous return values and promises to feed the same response handling\.](#claim-005c1ad3-dcc5-4f77-b36f-7ee4a420f22c)

**Dependency**: [Supplied outer continuation (function:e677a038-abee-4d92-8888-4b401adf7370)](#function-e677a038-abee-4d92-8888-4b401adf7370)

- [C5: The supplied outer next callback is eligible only at exactly middleware\.length when no middleware entry exists\.](#claim-0df938c1-9773-4d05-84ba-5bcecf66fb6c)

**Dependency**: [Configured error callback (function:98d308f3-506e-458a-9b99-bfe76154df29)](#function-98d308f3-506e-458a-9b99-bfe76154df29)

- [C26: The handler catch uses onError only when the thrown value is an Error and an onError callback exists\.](#claim-544dbd7e-acd1-4040-8b00-00b91c0e8f8d)
- [C31: Before invoking onError, the handler catch writes the caught Error into context\.error\.](#claim-6a188938-736d-4970-a698-88df4b787329)
- [C15: After awaiting onError, the dispatcher marks the result as an error response\.](#claim-3744e538-0f07-4ea4-a210-02d1a6c03781)

**Dependency**: [Configured not\-found callback (function:2ed115cb-3d2d-4d04-9657-d8829ba4ee56)](#function-2ed115cb-3d2d-4d04-9657-d8829ba4ee56)

- [C64: Without a selected handler, onNotFound runs only when context\.finalized is exactly false and the callback exists\.](#claim-e8b03c7a-182a-46d4-aeb8-bf4295b82798)

**Dependency**: [Context\.res setter (function:9cb45f6c-5651-4587-89b1-acc02a5e7fb3)](#function-9cb45f6c-5651-4587-89b1-acc02a5e7fb3)

- [C73: A truthy response result is assigned to context\.res only when context is not finalized or the result came through onError\.](#claim-fca39081-cbda-4fe7-8212-cf21fdc9a885)

**Assumptions**

- [C62: If a parent handler awaits a child continuation and its rejection reaches the parent handler call, the parent frame catch can handle an Error through onError\. An unawaited continuation is not guaranteed to reach that catch\.](#claim-d8b4fcf8-5869-40ef-a225-ff4e3d13bb99)

**Unknowns**

None recorded; this does not prove absence.

<a id="function-05c0f3fe-c675-4fc7-a1ef-4028fad0ac09"></a>

#### Direct handler next callback

ID: `function:05c0f3fe-c675-4fc7-a1ef-4028fad0ac09`.

Role: arrow. [src/hono\-base\.ts](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2) · UTF-8 bytes [12985, 13057).

**Inputs**

- [C58: The direct handler receives an async next callback that assigns the configured not\-found result to c\.res\.](#claim-d4c7dc38-cdfc-4a47-b9f5-c3628df16210)

**Outputs**

- [C32: The direct\-path async next callback awaits not\-found, assigns the result to c\.res, and has no explicit return value\. It can reject if the awaited callback or assignment fails\.](#claim-6a9ded64-407c-492b-904d-328bc04d3373)

**State: write**: Response and finalization state \(concept:15b53c40\-cf7c\-454c\-bdab\-3c1d77c4f3e3\)

- [C58: The direct handler receives an async next callback that assigns the configured not\-found result to c\.res\.](#claim-d4c7dc38-cdfc-4a47-b9f5-c3628df16210)

**Effects**

None recorded; this does not prove absence.

**Failure**: Not\-found or response assignment fails\. → Outside the represented boundary

- [C32: The direct\-path async next callback awaits not\-found, assigns the result to c\.res, and has no explicit return value\. It can reject if the awaited callback or assignment fails\.](#claim-6a9ded64-407c-492b-904d-328bc04d3373)

**Dependency**: [Configured not\-found callback (function:2ed115cb-3d2d-4d04-9657-d8829ba4ee56)](#function-2ed115cb-3d2d-4d04-9657-d8829ba4ee56)

- [C58: The direct handler receives an async next callback that assigns the configured not\-found result to c\.res\.](#claim-d4c7dc38-cdfc-4a47-b9f5-c3628df16210)

**Dependency**: [Context\.res setter (function:9cb45f6c-5651-4587-89b1-acc02a5e7fb3)](#function-9cb45f6c-5651-4587-89b1-acc02a5e7fb3)

- [C58: The direct handler receives an async next callback that assigns the configured not\-found result to c\.res\.](#claim-d4c7dc38-cdfc-4a47-b9f5-c3628df16210)
- [C9: The res setter stores its argument and sets finalized to true, including when the argument is undefined\.](#claim-1d2eae5b-efd0-4237-8671-50d5055dafe0)

**Assumptions**

None recorded; this does not prove absence.

**Unknowns**

None recorded; this does not prove absence.

<a id="function-066fbdc1-2b42-4637-b456-7e8f96224eb4"></a>

#### \#dispatch

ID: `function:066fbdc1-2b42-4637-b456-7e8f96224eb4`.

Role: method. [src/hono\-base\.ts](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2) · UTF-8 bytes [12203, 13918).

**Inputs**

- [C23: The private dispatcher accepts a Request, execution context, environment bindings, and a method argument\. The annotations do not validate runtime inputs\.](#claim-491da471-0962-4036-8623-5a924a379a28)

**Outputs**

- [C66: HEAD constructs a new Response with a null body and the awaited GET\-dispatch response as its initialization argument\.](#claim-f30ea83a-a386-4f3c-93af-21067f7f47cb)
- [C13: A truthy resolved response from that Promise is returned before consulting finalized context state\.](#claim-32832fda-23d3-411c-8392-6782b3634057)
- [C42: A falsy resolved Promise value falls back to c\.res when finalized, otherwise to the configured not\-found handler\.](#claim-876a95e6-ca91-46c2-b831-60091068b69d)
- [C49: A non\-Promise nullish direct result invokes the not\-found handler; this expression does not consult c\.finalized\.](#claim-abe1d0e6-876f-40a3-b8e1-aac696dd56f5)
- [C39: The composition path returns context\.res after checking finalized\.](#claim-7ce9d699-11e2-481a-866e-c1e4356ea24d)
- [C29: A direct non\-Promise result that is neither null nor undefined is returned unchanged\. That expression does not check whether the value is a Response\.](#claim-5b606765-089d-4722-8213-b675dde66bf5)

**State: read\-write**: Response and finalization state \(concept:15b53c40\-cf7c\-454c\-bdab\-3c1d77c4f3e3\)

- [C35: Dispatch creates a Context with the request, path, match result, env, execution context, and configured not\-found handler\.](#claim-6ea34fc3-66d3-437b-a99c-f67c5043f6b6)
- [C58: The direct handler receives an async next callback that assigns the configured not\-found result to c\.res\.](#claim-d4c7dc38-cdfc-4a47-b9f5-c3628df16210)
- [C42: A falsy resolved Promise value falls back to c\.res when finalized, otherwise to the configured not\-found handler\.](#claim-876a95e6-ca91-46c2-b831-60091068b69d)
- [C53: An unfinalized context returned by composition causes an Error about returning a Response or awaiting next\.](#claim-b962178a-0e5d-4e27-a698-38b48e7fdd3a)
- [C39: The composition path returns context\.res after checking finalized\.](#claim-7ce9d699-11e2-481a-866e-c1e4356ea24d)

**Effects**

- [C35: Dispatch creates a Context with the request, path, match result, env, execution context, and configured not\-found handler\.](#claim-6ea34fc3-66d3-437b-a99c-f67c5043f6b6)

**Failure**: Path resolution, matching, or context construction fails\. → Outside the represented boundary

- [C57: Path resolution, route matching, and Context construction occur before the direct\-handler and composed\-runner try blocks\. A failure there does not enter those local catches\.](#claim-d3f7ed18-fd8d-44d4-b50d-11e2dc21e501)

**Failure**: The direct handler throws synchronously\. → [\#handleError (function:0ae4f7fa-8fab-4114-b656-e0c4a210b97e)](#function-0ae4f7fa-8fab-4114-b656-e0c4a210b97e)

- [C18: A synchronous throw from the direct handler is sent to the private error handler\.](#claim-3a465dfd-a823-4297-a867-dc7b31edd393)

**Failure**: A non\-Promise nullish fallback throws\. → Outside the represented boundary

- [C55: The synchronous direct\-result fallback invokes not\-found outside the direct handler try/catch, so a throw there can propagate to the caller\.](#claim-bf2950af-c55d-401a-9691-50acf819a3f2)

**Dependency**: [HEAD wrapper (function:013cff1d-eca2-4834-a4b0-51726491bcf1)](#function-013cff1d-eca2-4834-a4b0-51726491bcf1)

- [C3: HEAD dispatch recursively uses GET as the dispatch method argument while retaining the original Request object\.](#claim-085248c3-81b0-4cad-986d-05fee44fe506)
- [C66: HEAD constructs a new Response with a null body and the awaited GET\-dispatch response as its initialization argument\.](#claim-f30ea83a-a386-4f3c-93af-21067f7f47cb)

**Dependency**: [Selected application handler (function:d888d262-67d4-4c35-a3d3-b88a00f3deb6)](#function-d888d262-67d4-4c35-a3d3-b88a00f3deb6)

- [C19: Exactly one matched handler takes a direct path that bypasses compose\.](#claim-3c7751cc-3137-4636-a809-aa2a0ee43c9e)
- [C58: The direct handler receives an async next callback that assigns the configured not\-found result to c\.res\.](#claim-d4c7dc38-cdfc-4a47-b9f5-c3628df16210)

**Dependency**: [Direct handler next callback (function:05c0f3fe-c675-4fc7-a1ef-4028fad0ac09)](#function-05c0f3fe-c675-4fc7-a1ef-4028fad0ac09)

- [C58: The direct handler receives an async next callback that assigns the configured not\-found result to c\.res\.](#claim-d4c7dc38-cdfc-4a47-b9f5-c3628df16210)

**Dependency**: [Direct Promise result selection (function:94ab9b66-e4ca-4f2d-83ce-ab7711ff65da)](#function-94ab9b66-e4ca-4f2d-83ce-ab7711ff65da)

- [C20: The direct path distinguishes a returned Promise using instanceof Promise\.](#claim-3ebf7dad-d613-4994-9e9e-f59bb1d79317)
- [C13: A truthy resolved response from that Promise is returned before consulting finalized context state\.](#claim-32832fda-23d3-411c-8392-6782b3634057)
- [C42: A falsy resolved Promise value falls back to c\.res when finalized, otherwise to the configured not\-found handler\.](#claim-876a95e6-ca91-46c2-b831-60091068b69d)

**Dependency**: [Direct Promise rejection callback (function:c14693d1-3c79-4916-a155-6c5fd1f91121)](#function-c14693d1-3c79-4916-a155-6c5fd1f91121)

- [C34: Rejection in the direct Promise chain is sent to the private error handler\.](#claim-6b5a8b30-ea42-46e9-880d-53099dbe6c56)

**Dependency**: [Composed result finalization (function:379c4b0e-13f0-4689-aa90-c2c2d12abb62)](#function-379c4b0e-13f0-4689-aa90-c2c2d12abb62)

- [C68: The composition path awaits the composed runner with the newly constructed context\.](#claim-f551142e-2ef8-4131-9da8-304f6a92329e)

**Dependency**: [compose (function:92019dfa-b10c-4b1a-8ba3-914084ae947c)](#function-92019dfa-b10c-4b1a-8ba3-914084ae947c)

- [C56: The dispatcher constructs compose with the matched middleware, configured error handler, and configured not\-found handler\.](#claim-c3467e33-ffa9-47f6-8a0f-934dcdd6024c)

**Dependency**: [\#handleError (function:0ae4f7fa-8fab-4114-b656-e0c4a210b97e)](#function-0ae4f7fa-8fab-4114-b656-e0c4a210b97e)

- [C18: A synchronous throw from the direct handler is sent to the private error handler\.](#claim-3a465dfd-a823-4297-a867-dc7b31edd393)
- [C38: A throw during the awaited composed path or its finalization check is passed to the private error handler\.](#claim-7af68846-ae57-44cd-8e06-49e5596a226b)

**Dependency**: [Configured not\-found callback (function:2ed115cb-3d2d-4d04-9657-d8829ba4ee56)](#function-2ed115cb-3d2d-4d04-9657-d8829ba4ee56)

- [C42: A falsy resolved Promise value falls back to c\.res when finalized, otherwise to the configured not\-found handler\.](#claim-876a95e6-ca91-46c2-b831-60091068b69d)
- [C49: A non\-Promise nullish direct result invokes the not\-found handler; this expression does not consult c\.finalized\.](#claim-abe1d0e6-876f-40a3-b8e1-aac696dd56f5)

**Dependency**: Path resolution, router, Context construction, and response helpers \(concept:c68fea43\-9e8c\-44d2\-b4de\-c811f639da91\)

- [C44: For non\-HEAD dispatch, the configured path resolver receives the request and an object containing env\.](#claim-889f741d-3df0-47f5-9e19-2a06a2a99445)
- [C45: Router matching receives the dispatch method and the resolved path\.](#claim-8b0483bd-c519-497b-b081-d286863646b7)
- [C35: Dispatch creates a Context with the request, path, match result, env, execution context, and configured not\-found handler\.](#claim-6ea34fc3-66d3-437b-a99c-f67c5043f6b6)

**Assumptions**

- [C23: The private dispatcher accepts a Request, execution context, environment bindings, and a method argument\. The annotations do not validate runtime inputs\.](#claim-491da471-0962-4036-8623-5a924a379a28)

**Unknowns**

- [What failures and effects can the uninspected routing, construction, and response helpers produce?](#unknown-9)

<a id="function-0ae4f7fa-8fab-4114-b656-e0c4a210b97e"></a>

#### \#handleError

ID: `function:0ae4f7fa-8fab-4114-b656-e0c4a210b97e`.

Role: method. [src/hono\-base\.ts](#evidence-d19ca748f1302f0092f3bbbc30148d3c2d835f99f407db8e27802045d7c85b69) · UTF-8 bytes [12031, 12199).

**Inputs**

- [C69: The private error handler delegates Error instances to the configured error callback and rethrows other values\.](#claim-f5f65ad6-ca98-41d8-95dd-293ac83d5f15)

**Outputs**

- [C69: The private error handler delegates Error instances to the configured error callback and rethrows other values\.](#claim-f5f65ad6-ca98-41d8-95dd-293ac83d5f15)

**Effects**

None recorded; this does not prove absence.

**Failure**: The thrown value is not an Error\. → Outside the represented boundary

- [C69: The private error handler delegates Error instances to the configured error callback and rethrows other values\.](#claim-f5f65ad6-ca98-41d8-95dd-293ac83d5f15)

**Failure**: The configured error callback fails\. → Outside the represented boundary

- [C72: The private error handler calls the configured error callback without a local try block\. Its synchronous throw or returned rejection can pass to the caller\.](#claim-fc07b7ac-e50a-4c46-8293-6c36dcbfbbdb)

**Dependency**: [Configured error callback (function:98d308f3-506e-458a-9b99-bfe76154df29)](#function-98d308f3-506e-458a-9b99-bfe76154df29)

- [C69: The private error handler delegates Error instances to the configured error callback and rethrows other values\.](#claim-f5f65ad6-ca98-41d8-95dd-293ac83d5f15)

**Assumptions**

None recorded; this does not prove absence.

**Unknowns**

None recorded; this does not prove absence.

<a id="function-2ed115cb-3d2d-4d04-9657-d8829ba4ee56"></a>

#### Configured not\-found callback

ID: `function:2ed115cb-3d2d-4d04-9657-d8829ba4ee56`.

Role: external-callback. No implementation is supplied for this callback.

**Inputs**

- [C71: The configured not\-found callback receives the current context\. Its returned values and failures depend on the configured implementation\.](#claim-f984c4f5-e5e0-4ce9-a0fc-0b8884e34883)

**Outputs**

- [C71: The configured not\-found callback receives the current context\. Its returned values and failures depend on the configured implementation\.](#claim-f984c4f5-e5e0-4ce9-a0fc-0b8884e34883)

**Effects**

None recorded; this does not prove absence.

**Assumptions**

- [C71: The configured not\-found callback receives the current context\. Its returned values and failures depend on the configured implementation\.](#claim-f984c4f5-e5e0-4ce9-a0fc-0b8884e34883)

**Unknowns**

- [Which not\-found callback is configured, and what are its effects and failure behavior?](#unknown-7)

<a id="function-379c4b0e-13f0-4689-aa90-c2c2d12abb62"></a>

#### Composed result finalization

ID: `function:379c4b0e-13f0-4689-aa90-c2c2d12abb62`.

Role: arrow. [src/hono\-base\.ts](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2) · UTF-8 bytes [13554, 13911).

**Inputs**

- [C68: The composition path awaits the composed runner with the newly constructed context\.](#claim-f551142e-2ef8-4131-9da8-304f6a92329e)

**Outputs**

- [C39: The composition path returns context\.res after checking finalized\.](#claim-7ce9d699-11e2-481a-866e-c1e4356ea24d)

**State: read**: Response and finalization state \(concept:15b53c40\-cf7c\-454c\-bdab\-3c1d77c4f3e3\)

- [C53: An unfinalized context returned by composition causes an Error about returning a Response or awaiting next\.](#claim-b962178a-0e5d-4e27-a698-38b48e7fdd3a)
- [C39: The composition path returns context\.res after checking finalized\.](#claim-7ce9d699-11e2-481a-866e-c1e4356ea24d)

**Effects**

None recorded; this does not prove absence.

**Failure**: Composition fails or returns an unfinalized context\. → [\#handleError (function:0ae4f7fa-8fab-4114-b656-e0c4a210b97e)](#function-0ae4f7fa-8fab-4114-b656-e0c4a210b97e)

- [C53: An unfinalized context returned by composition causes an Error about returning a Response or awaiting next\.](#claim-b962178a-0e5d-4e27-a698-38b48e7fdd3a)
- [C38: A throw during the awaited composed path or its finalization check is passed to the private error handler\.](#claim-7af68846-ae57-44cd-8e06-49e5596a226b)

**Dependency**: [Returned composition runner (function:bc6399ac-1a94-4541-b51b-4cc6cc66aea8)](#function-bc6399ac-1a94-4541-b51b-4cc6cc66aea8)

- [C68: The composition path awaits the composed runner with the newly constructed context\.](#claim-f551142e-2ef8-4131-9da8-304f6a92329e)

**Dependency**: [Context\.res getter (function:e4635ca2-ec40-4091-ad54-7be94f4c32ba)](#function-e4635ca2-ec40-4091-ad54-7be94f4c32ba)

- [C39: The composition path returns context\.res after checking finalized\.](#claim-7ce9d699-11e2-481a-866e-c1e4356ea24d)

**Dependency**: [\#handleError (function:0ae4f7fa-8fab-4114-b656-e0c4a210b97e)](#function-0ae4f7fa-8fab-4114-b656-e0c4a210b97e)

- [C38: A throw during the awaited composed path or its finalization check is passed to the private error handler\.](#claim-7af68846-ae57-44cd-8e06-49e5596a226b)

**Assumptions**

None recorded; this does not prove absence.

**Unknowns**

None recorded; this does not prove absence.

<a id="function-49d6bd1e-9aaf-4234-8f34-2aa0011e86b4"></a>

#### Context not\-found fallback arrow

ID: `function:49d6bd1e-9aaf-4234-8f34-2aa0011e86b4`.

Role: arrow. [src/context\.ts](#evidence-3964d7755fbe93590183216380561fc4f6cf9eed1f24e7cd81b0943a88034107) · UTF-8 bytes [22635, 22665).

**Inputs**

- [C60: The fallback arrow installed by Context\.notFound calls createResponseInstance with no arguments and returns its result\.](#claim-d5dd3300-e498-4ec8-b548-9d8308c15576)

**Outputs**

- [C60: The fallback arrow installed by Context\.notFound calls createResponseInstance with no arguments and returns its result\.](#claim-d5dd3300-e498-4ec8-b548-9d8308c15576)

**Effects**

None recorded; this does not prove absence.

**Dependency**: Path resolution, router, Context construction, and response helpers \(concept:c68fea43\-9e8c\-44d2\-b4de\-c811f639da91\)

- [C60: The fallback arrow installed by Context\.notFound calls createResponseInstance with no arguments and returns its result\.](#claim-d5dd3300-e498-4ec8-b548-9d8308c15576)

**Assumptions**

- [C48: The selected source calls response constructors, header methods, and Context response helpers\. Their implementations and complete failure behavior are outside these excerpts\.](#claim-a6cc6269-0179-4714-a6d7-a690685fd58b)

**Unknowns**

- [What failures and effects can the uninspected routing, construction, and response helpers produce?](#unknown-9)

<a id="function-92019dfa-b10c-4b1a-8ba3-914084ae947c"></a>

#### compose

ID: `function:92019dfa-b10c-4b1a-8ba3-914084ae947c`.

Role: arrow. [src/compose\.ts](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370) · UTF-8 bytes [686, 2202).

**Inputs**

- [C17: compose accepts middleware entries and optional error and not\-found callbacks\. It returns a runner that accepts a Context and optional outer next callback\.](#claim-39cc9873-5187-41f4-8403-332e355f7db9)

**Outputs**

- [C17: compose accepts middleware entries and optional error and not\-found callbacks\. It returns a runner that accepts a Context and optional outer next callback\.](#claim-39cc9873-5187-41f4-8403-332e355f7db9)

**Effects**

None recorded; this does not prove absence.

**Dependency**: [Returned composition runner (function:bc6399ac-1a94-4541-b51b-4cc6cc66aea8)](#function-bc6399ac-1a94-4541-b51b-4cc6cc66aea8)

- [C17: compose accepts middleware entries and optional error and not\-found callbacks\. It returns a runner that accepts a Context and optional outer next callback\.](#claim-39cc9873-5187-41f4-8403-332e355f7db9)

**Assumptions**

None recorded; this does not prove absence.

**Unknowns**

None recorded; this does not prove absence.

<a id="function-94ab9b66-e4ca-4f2d-83ce-ab7711ff65da"></a>

#### Direct Promise result selection

ID: `function:94ab9b66-e4ca-4f2d-83ce-ab7711ff65da`.

Role: arrow. [src/hono\-base\.ts](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2) · UTF-8 bytes [13214, 13326).

**Inputs**

- [C20: The direct path distinguishes a returned Promise using instanceof Promise\.](#claim-3ebf7dad-d613-4994-9e9e-f59bb1d79317)

**Outputs**

- [C13: A truthy resolved response from that Promise is returned before consulting finalized context state\.](#claim-32832fda-23d3-411c-8392-6782b3634057)
- [C42: A falsy resolved Promise value falls back to c\.res when finalized, otherwise to the configured not\-found handler\.](#claim-876a95e6-ca91-46c2-b831-60091068b69d)

**State: read**: Response and finalization state \(concept:15b53c40\-cf7c\-454c\-bdab\-3c1d77c4f3e3\)

- [C42: A falsy resolved Promise value falls back to c\.res when finalized, otherwise to the configured not\-found handler\.](#claim-876a95e6-ca91-46c2-b831-60091068b69d)

**Effects**

None recorded; this does not prove absence.

**Failure**: Promise fallback or response access fails\. → [Direct Promise rejection callback (function:c14693d1-3c79-4916-a155-6c5fd1f91121)](#function-c14693d1-3c79-4916-a155-6c5fd1f91121)

- [C34: Rejection in the direct Promise chain is sent to the private error handler\.](#claim-6b5a8b30-ea42-46e9-880d-53099dbe6c56)

**Dependency**: [Context\.res getter (function:e4635ca2-ec40-4091-ad54-7be94f4c32ba)](#function-e4635ca2-ec40-4091-ad54-7be94f4c32ba)

- [C42: A falsy resolved Promise value falls back to c\.res when finalized, otherwise to the configured not\-found handler\.](#claim-876a95e6-ca91-46c2-b831-60091068b69d)

**Dependency**: [Configured not\-found callback (function:2ed115cb-3d2d-4d04-9657-d8829ba4ee56)](#function-2ed115cb-3d2d-4d04-9657-d8829ba4ee56)

- [C42: A falsy resolved Promise value falls back to c\.res when finalized, otherwise to the configured not\-found handler\.](#claim-876a95e6-ca91-46c2-b831-60091068b69d)

**Assumptions**

None recorded; this does not prove absence.

**Unknowns**

None recorded; this does not prove absence.

<a id="function-98d308f3-506e-458a-9b99-bfe76154df29"></a>

#### Configured error callback

ID: `function:98d308f3-506e-458a-9b99-bfe76154df29`.

Role: external-callback. No implementation is supplied for this callback.

**Inputs**

- [C65: Eligible error callbacks receive an Error and the current context\. Their returned values and failures depend on the configured implementation\.](#claim-eb4d17a9-fa20-4ecc-9768-52ed19a28dea)

**Outputs**

- [C65: Eligible error callbacks receive an Error and the current context\. Their returned values and failures depend on the configured implementation\.](#claim-eb4d17a9-fa20-4ecc-9768-52ed19a28dea)

**Effects**

None recorded; this does not prove absence.

**Assumptions**

- [C65: Eligible error callbacks receive an Error and the current context\. Their returned values and failures depend on the configured implementation\.](#claim-eb4d17a9-fa20-4ecc-9768-52ed19a28dea)

**Unknowns**

- [Which error callback is configured, and can it fail or change response state?](#unknown-6)

<a id="function-9cb45f6c-5651-4587-89b1-acc02a5e7fb3"></a>

#### Context\.res setter

ID: `function:9cb45f6c-5651-4587-89b1-acc02a5e7fb3`.

Role: setter. [src/context\.ts](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5) · UTF-8 bytes [12385, 12997).

**Inputs**

- [C59: The res setter accepts Response or undefined by annotation and has no explicit return value\. It does not validate the argument type at runtime\.](#claim-d543fd57-c7cb-4a8b-9078-fc6050980cf1)

**Outputs**

- [C59: The res setter accepts Response or undefined by annotation and has no explicit return value\. It does not validate the argument type at runtime\.](#claim-d543fd57-c7cb-4a8b-9078-fc6050980cf1)

**State: read\-write**: Response and finalization state \(concept:15b53c40\-cf7c\-454c\-bdab\-3c1d77c4f3e3\)

- [C9: The res setter stores its argument and sets finalized to true, including when the argument is undefined\.](#claim-1d2eae5b-efd0-4237-8671-50d5055dafe0)
- [C6: When both old and new responses exist, the res setter copies the new response before merging old headers, skipping the old content\-type\.](#claim-146991bd-ed7d-4ae1-8868-888a11dedf6e)
- [C4: The res setter replaces the new set\-cookie collection with cookies from the previous response when merging that header\.](#claim-0b57c11a-c767-4573-8888-f3d49cbdf5c6)

**Effects**

- [C9: The res setter stores its argument and sets finalized to true, including when the argument is undefined\.](#claim-1d2eae5b-efd0-4237-8671-50d5055dafe0)
- [C6: When both old and new responses exist, the res setter copies the new response before merging old headers, skipping the old content\-type\.](#claim-146991bd-ed7d-4ae1-8868-888a11dedf6e)
- [C4: The res setter replaces the new set\-cookie collection with cookies from the previous response when merging that header\.](#claim-0b57c11a-c767-4573-8888-f3d49cbdf5c6)

**Failure**: Header merging fails before storage is updated\. → Outside the represented boundary

- [C52: The res setter merges headers before its final storage assignment and finalized update\. An exception during that merge can prevent those final assignments\.](#claim-b3a42479-5499-4eed-8d21-09169deaf214)

**Dependency**: Path resolution, router, Context construction, and response helpers \(concept:c68fea43\-9e8c\-44d2\-b4de\-c811f639da91\)

- [C6: When both old and new responses exist, the res setter copies the new response before merging old headers, skipping the old content\-type\.](#claim-146991bd-ed7d-4ae1-8868-888a11dedf6e)
- [C4: The res setter replaces the new set\-cookie collection with cookies from the previous response when merging that header\.](#claim-0b57c11a-c767-4573-8888-f3d49cbdf5c6)

**Assumptions**

- [C59: The res setter accepts Response or undefined by annotation and has no explicit return value\. It does not validate the argument type at runtime\.](#claim-d543fd57-c7cb-4a8b-9078-fc6050980cf1)
- [C48: The selected source calls response constructors, header methods, and Context response helpers\. Their implementations and complete failure behavior are outside these excerpts\.](#claim-a6cc6269-0179-4714-a6d7-a690685fd58b)

**Unknowns**

- [What failures and effects can the uninspected routing, construction, and response helpers produce?](#unknown-9)

<a id="function-a30d9cc8-bde8-4f72-8469-44f9b1e91a23"></a>

#### Recursive middleware continuation

ID: `function:a30d9cc8-bde8-4f72-8469-44f9b1e91a23`.

Role: arrow. [src/compose\.ts](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370) · UTF-8 bytes [1678, 1699).

**Inputs**

- [C43: A handler receives a continuation that recursively dispatches i \+ 1 using the same context\.](#claim-87cd957c-bb51-49fe-b9a4-291c106e08c5)

**Outputs**

- [C43: A handler receives a continuation that recursively dispatches i \+ 1 using the same context\.](#claim-87cd957c-bb51-49fe-b9a4-291c106e08c5)
- [C12: The runner returns dispatch\(0\)\. This nested async function resolves to the shared context after successful completion and can reject on a propagated failure\.](#claim-2c55a0d3-2faf-413e-8173-4aa184a3094e)

**Effects**

None recorded; this does not prove absence.

**Dependency**: [Nested middleware dispatch (function:03f326d3-1de0-4410-808f-b673a2c4cfb3)](#function-03f326d3-1de0-4410-808f-b673a2c4cfb3)

- [C43: A handler receives a continuation that recursively dispatches i \+ 1 using the same context\.](#claim-87cd957c-bb51-49fe-b9a4-291c106e08c5)

**Assumptions**

- [C62: If a parent handler awaits a child continuation and its rejection reaches the parent handler call, the parent frame catch can handle an Error through onError\. An unawaited continuation is not guaranteed to reach that catch\.](#claim-d8b4fcf8-5869-40ef-a225-ff4e3d13bb99)

**Unknowns**

None recorded; this does not prove absence.

<a id="function-bc6399ac-1a94-4541-b51b-4cc6cc66aea8"></a>

#### Returned composition runner

ID: `function:bc6399ac-1a94-4541-b51b-4cc6cc66aea8`.

Role: arrow. [src/compose\.ts](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370) · UTF-8 bytes [908, 2200).

**Inputs**

- [C17: compose accepts middleware entries and optional error and not\-found callbacks\. It returns a runner that accepts a Context and optional outer next callback\.](#claim-39cc9873-5187-41f4-8403-332e355f7db9)

**Outputs**

- [C12: The runner returns dispatch\(0\)\. This nested async function resolves to the shared context after successful completion and can reject on a propagated failure\.](#claim-2c55a0d3-2faf-413e-8173-4aa184a3094e)

**State: write**: Middleware progression \(concept:132172da\-47ee\-48c0\-93f3\-1fae3ee7800c\)

- [C47: Each invocation of the runner returned by compose initializes its own progression index to \-1\.](#claim-a4808f91-eb8a-4a52-aed2-72effb4a139e)

**Effects**

None recorded; this does not prove absence.

**Failure**: Nested dispatch propagates a failure\. → Outside the represented boundary

- [C12: The runner returns dispatch\(0\)\. This nested async function resolves to the shared context after successful completion and can reject on a propagated failure\.](#claim-2c55a0d3-2faf-413e-8173-4aa184a3094e)

**Dependency**: [Nested middleware dispatch (function:03f326d3-1de0-4410-808f-b673a2c4cfb3)](#function-03f326d3-1de0-4410-808f-b673a2c4cfb3)

- [C50: The runner begins asynchronous dispatch at middleware index zero\.](#claim-b1c5caa4-d40d-4e99-a478-a0483a83437a)

**Assumptions**

None recorded; this does not prove absence.

**Unknowns**

None recorded; this does not prove absence.

<a id="function-c14693d1-3c79-4916-a155-6c5fd1f91121"></a>

#### Direct Promise rejection callback

ID: `function:c14693d1-3c79-4916-a155-6c5fd1f91121`.

Role: arrow. [src/hono\-base\.ts](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2) · UTF-8 bytes [13360, 13401).

**Inputs**

- [C34: Rejection in the direct Promise chain is sent to the private error handler\.](#claim-6b5a8b30-ea42-46e9-880d-53099dbe6c56)

**Outputs**

- [C69: The private error handler delegates Error instances to the configured error callback and rethrows other values\.](#claim-f5f65ad6-ca98-41d8-95dd-293ac83d5f15)

**Effects**

None recorded; this does not prove absence.

**Failure**: The configured error callback fails\. → Outside the represented boundary

- [C72: The private error handler calls the configured error callback without a local try block\. Its synchronous throw or returned rejection can pass to the caller\.](#claim-fc07b7ac-e50a-4c46-8293-6c36dcbfbbdb)

**Dependency**: [\#handleError (function:0ae4f7fa-8fab-4114-b656-e0c4a210b97e)](#function-0ae4f7fa-8fab-4114-b656-e0c4a210b97e)

- [C34: Rejection in the direct Promise chain is sent to the private error handler\.](#claim-6b5a8b30-ea42-46e9-880d-53099dbe6c56)

**Assumptions**

None recorded; this does not prove absence.

**Unknowns**

None recorded; this does not prove absence.

<a id="function-d4b105fc-0419-4a56-a19c-5d02dce157e5"></a>

#### Default not\-found handler

ID: `function:d4b105fc-0419-4a56-a19c-5d02dce157e5`.

Role: arrow. [src/hono\-base\.ts](#evidence-50e79ea172dc01947732e6a2fefd65b67b5c28d7dee03948f5ad30474ea840ab) · UTF-8 bytes [786, 834).

**Inputs**

- [C37: The supplied local notFoundHandler implementation requests a text response with status 404; custom handler behavior is not established by this excerpt\.](#claim-75a7f499-e2f0-4998-89a5-48c6456d3bab)

**Outputs**

- [C37: The supplied local notFoundHandler implementation requests a text response with status 404; custom handler behavior is not established by this excerpt\.](#claim-75a7f499-e2f0-4998-89a5-48c6456d3bab)

**Effects**

None recorded; this does not prove absence.

**Dependency**: Path resolution, router, Context construction, and response helpers \(concept:c68fea43\-9e8c\-44d2\-b4de\-c811f639da91\)

- [C37: The supplied local notFoundHandler implementation requests a text response with status 404; custom handler behavior is not established by this excerpt\.](#claim-75a7f499-e2f0-4998-89a5-48c6456d3bab)

**Assumptions**

- [C48: The selected source calls response constructors, header methods, and Context response helpers\. Their implementations and complete failure behavior are outside these excerpts\.](#claim-a6cc6269-0179-4714-a6d7-a690685fd58b)

**Unknowns**

- [What failures and effects can the uninspected routing, construction, and response helpers produce?](#unknown-9)

<a id="function-d888d262-67d4-4c35-a3d3-b88a00f3deb6"></a>

#### Selected application handler

ID: `function:d888d262-67d4-4c35-a3d3-b88a00f3deb6`.

Role: external-callback. No implementation is supplied for this callback.

**Inputs**

- [C67: The shown call sites supply context and a continuation to selected handlers\. These excerpts do not establish their implementations, return values, failures, state changes, or use of await next\(\)\.](#claim-f360cf06-1fc5-4b71-891d-37fdddbfeaa4)

**Outputs**

- [C67: The shown call sites supply context and a continuation to selected handlers\. These excerpts do not establish their implementations, return values, failures, state changes, or use of await next\(\)\.](#claim-f360cf06-1fc5-4b71-891d-37fdddbfeaa4)

**Effects**

None recorded; this does not prove absence.

**Assumptions**

- [C67: The shown call sites supply context and a continuation to selected handlers\. These excerpts do not establish their implementations, return values, failures, state changes, or use of await next\(\)\.](#claim-f360cf06-1fc5-4b71-891d-37fdddbfeaa4)

**Unknowns**

- [Which handler is selected at runtime, and what does it return, change, throw, or await?](#unknown-5)

<a id="function-e4635ca2-ec40-4091-ad54-7be94f4c32ba"></a>

#### Context\.res getter

ID: `function:e4635ca2-ec40-4091-ad54-7be94f4c32ba`.

Role: getter. [src/context\.ts](#evidence-efdc8a49582842d74bb72cf074179c4f18d4dc3a0f2d25c8ab366eb8630282b1) · UTF-8 bytes [12114, 12262).

**Inputs**

- [C41: The res getter takes no explicit argument\. It reads private response storage and can initialize both that storage and prepared headers\.](#claim-8099fdae-3db1-47b0-b324-6d527a067dd6)

**Outputs**

- [C7: The res getter lazily creates response storage with prepared headers; the getter itself does not set finalized\.](#claim-161b91b9-a49b-44d3-a919-0758464c5af3)

**State: read\-write**: Response and finalization state \(concept:15b53c40\-cf7c\-454c\-bdab\-3c1d77c4f3e3\)

- [C7: The res getter lazily creates response storage with prepared headers; the getter itself does not set finalized\.](#claim-161b91b9-a49b-44d3-a919-0758464c5af3)
- [C41: The res getter takes no explicit argument\. It reads private response storage and can initialize both that storage and prepared headers\.](#claim-8099fdae-3db1-47b0-b324-6d527a067dd6)

**Effects**

None recorded; this does not prove absence.

**Dependency**: Path resolution, router, Context construction, and response helpers \(concept:c68fea43\-9e8c\-44d2\-b4de\-c811f639da91\)

- [C7: The res getter lazily creates response storage with prepared headers; the getter itself does not set finalized\.](#claim-161b91b9-a49b-44d3-a919-0758464c5af3)

**Assumptions**

- [C48: The selected source calls response constructors, header methods, and Context response helpers\. Their implementations and complete failure behavior are outside these excerpts\.](#claim-a6cc6269-0179-4714-a6d7-a690685fd58b)

**Unknowns**

- [What failures and effects can the uninspected routing, construction, and response helpers produce?](#unknown-9)

<a id="function-e677a038-abee-4d92-8888-4b401adf7370"></a>

#### Supplied outer continuation

ID: `function:e677a038-abee-4d92-8888-4b401adf7370`.

Role: external-callback. No implementation is supplied for this callback.

**Inputs**

- [C27: At the terminal index, a supplied outer next is invoked through handler\(context, continuation\)\. Its runtime result and effects are not established here\.](#claim-56b29496-273a-4a7a-ba0e-f3b36aff76a3)

**Outputs**

- [C27: At the terminal index, a supplied outer next is invoked through handler\(context, continuation\)\. Its runtime result and effects are not established here\.](#claim-56b29496-273a-4a7a-ba0e-f3b36aff76a3)

**Effects**

None recorded; this does not prove absence.

**Assumptions**

- [C27: At the terminal index, a supplied outer next is invoked through handler\(context, continuation\)\. Its runtime result and effects are not established here\.](#claim-56b29496-273a-4a7a-ba0e-f3b36aff76a3)

**Unknowns**

- [Does the caller supply outer next, and what does that callback do?](#unknown-8)

<a id="function-e8579b0c-8859-4dec-9c87-cf458c481a23"></a>

#### Default error handler

ID: `function:e8579b0c-8859-4dec-9c87-cf458c481a23`.

Role: arrow. [src/hono\-base\.ts](#evidence-4634461b115dd4a1479717296128dc6517427f5529a42e3937146f069d9ac09a) · UTF-8 bytes [871, 1061).

**Inputs**

- [C24: The initial error callback is the local default errorHandler; its getResponse branch forwards the response body and initialization data through c\.newResponse\.](#claim-4a289f87-40be-45fa-90f8-f07a20dcafb8)

**Outputs**

- [C24: The initial error callback is the local default errorHandler; its getResponse branch forwards the response body and initialization data through c\.newResponse\.](#claim-4a289f87-40be-45fa-90f8-f07a20dcafb8)
- [C25: Outside that getResponse branch, the default error handler logs the error and requests a text response with status 500\.](#claim-4e81a050-0232-49a7-bf88-ebfbdc1e9576)

**Effects**

- [C25: Outside that getResponse branch, the default error handler logs the error and requests a text response with status 500\.](#claim-4e81a050-0232-49a7-bf88-ebfbdc1e9576)

**Dependency**: Path resolution, router, Context construction, and response helpers \(concept:c68fea43\-9e8c\-44d2\-b4de\-c811f639da91\)

- [C24: The initial error callback is the local default errorHandler; its getResponse branch forwards the response body and initialization data through c\.newResponse\.](#claim-4a289f87-40be-45fa-90f8-f07a20dcafb8)
- [C25: Outside that getResponse branch, the default error handler logs the error and requests a text response with status 500\.](#claim-4e81a050-0232-49a7-bf88-ebfbdc1e9576)

**Assumptions**

- [C48: The selected source calls response constructors, header methods, and Context response helpers\. Their implementations and complete failure behavior are outside these excerpts\.](#claim-a6cc6269-0179-4714-a6d7-a690685fd58b)

**Unknowns**

- [What failures and effects can the uninspected routing, construction, and response helpers produce?](#unknown-9)

<a id="function-f8b2cf93-7b1f-40fe-9098-9395af4a53ef"></a>

#### fetch

ID: `function:f8b2cf93-7b1f-40fe-9098-9395af4a53ef`.

Role: arrow. [src/hono\-base\.ts](#evidence-d973f31095c0885ec6968e6dfe05b9be07c8109174fa09d64d9941765210c070) · UTF-8 bytes [14413, 14509).

**Inputs**

- [C54: fetch forwards the original request, its method, the environment, and the execution context into the private dispatcher\.](#claim-be525e2a-9f68-4196-b67c-7bf670fbee39)

**Outputs**

- [C54: fetch forwards the original request, its method, the environment, and the execution context into the private dispatcher\.](#claim-be525e2a-9f68-4196-b67c-7bf670fbee39)

**Effects**

None recorded; this does not prove absence.

**Dependency**: [\#dispatch (function:066fbdc1-2b42-4637-b456-7e8f96224eb4)](#function-066fbdc1-2b42-4637-b456-7e8f96224eb4)

- [C54: fetch forwards the original request, its method, the environment, and the execution context into the private dispatcher\.](#claim-be525e2a-9f68-4196-b67c-7bf670fbee39)

**Assumptions**

None recorded; this does not prove absence.

**Unknowns**

None recorded; this does not prove absence.

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

<a id="claim-07e14fa8-6312-422f-920f-8de6ebf3639f"></a>

**C2 · failure:** The HEAD wrapper awaits recursive GET dispatch and constructs a Response outside the other local handler catches\. A failure in that wrapper rejects its returned Promise\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-085248c3-81b0-4cad-986d-05fee44fe506"></a>

**C3 · behavior:** HEAD dispatch recursively uses GET as the dispatch method argument while retaining the original Request object\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-0b57c11a-c767-4573-8888-f3d49cbdf5c6"></a>

**C4 · state:** The res setter replaces the new set\-cookie collection with cookies from the previous response when merging that header\. [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

<a id="claim-0df938c1-9773-4d05-84ba-5bcecf66fb6c"></a>

**C5 · behavior:** The supplied outer next callback is eligible only at exactly middleware\.length when no middleware entry exists\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-146991bd-ed7d-4ae1-8868-888a11dedf6e"></a>

**C6 · state:** When both old and new responses exist, the res setter copies the new response before merging old headers, skipping the old content\-type\. [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

<a id="claim-161b91b9-a49b-44d3-a919-0758464c5af3"></a>

**C7 · state:** The res getter lazily creates response storage with prepared headers; the getter itself does not set finalized\. [src/context\.ts:403](#evidence-efdc8a49582842d74bb72cf074179c4f18d4dc3a0f2d25c8ab366eb8630282b1)

<a id="claim-1724bbd4-e936-42d3-a4cd-dabd7f2051aa"></a>

**C8 · state:** A normal returned response does not overwrite already finalized context through this assignment condition\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-1d2eae5b-efd0-4237-8671-50d5055dafe0"></a>

**C9 · state:** The res setter stores its argument and sets finalized to true, including when the argument is undefined\. [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

<a id="claim-25d1b193-56d5-4ad3-8be1-b7bb1bb30d2b"></a>

**C10 · constraint:** Dispatch rejects an index less than or equal to the last dispatched index with the repeated\-next Error\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-2639197b-bb38-4ed2-9817-07e369a77759"></a>

**C11 · behavior:** Zero handlers and more than one handler both enter the composition path\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-2c55a0d3-2faf-413e-8173-4aa184a3094e"></a>

**C12 · behavior:** The runner returns dispatch\(0\)\. This nested async function resolves to the shared context after successful completion and can reject on a propagated failure\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-32832fda-23d3-411c-8392-6782b3634057"></a>

**C13 · behavior:** A truthy resolved response from that Promise is returned before consulting finalized context state\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-36389804-ee71-4da7-bbdc-e77cb1d247b1"></a>

**C14 · behavior:** A present middleware entry supplies its handler from middleware\[i\]\[0\]\[0\]\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-3744e538-0f07-4ea4-a210-02d1a6c03781"></a>

**C15 · failure:** After awaiting onError, the dispatcher marks the result as an error response\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-37cba2c0-333b-4a16-b503-49cd1b020ffa"></a>

**C16 · failure:** A non\-Error throw or an Error without an onError callback is rethrown by that dispatch frame\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-39cc9873-5187-41f4-8403-332e355f7db9"></a>

**C17 · behavior:** compose accepts middleware entries and optional error and not\-found callbacks\. It returns a runner that accepts a Context and optional outer next callback\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-3a465dfd-a823-4297-a867-dc7b31edd393"></a>

**C18 · failure:** A synchronous throw from the direct handler is sent to the private error handler\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-3c7751cc-3137-4636-a809-aa2a0ee43c9e"></a>

**C19 · behavior:** Exactly one matched handler takes a direct path that bypasses compose\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-3ebf7dad-d613-4994-9e9e-f59bb1d79317"></a>

**C20 · behavior:** The direct path distinguishes a returned Promise using instanceof Promise\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-40001f0b-2785-462a-9244-1997813e69cd"></a>

**C21 · failure:** A failure inside the awaited onError callback escapes the current frame&\#39;s handler catch block\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-45c03f43-ef8c-4a6b-9f8a-24b2237fb6ca"></a>

**C22 · behavior:** The nested dispatch function accepts an index and closes over the runner context, progression index, middleware array, and optional callbacks\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-491da471-0962-4036-8623-5a924a379a28"></a>

**C23 · constraint:** The private dispatcher accepts a Request, execution context, environment bindings, and a method argument\. The annotations do not validate runtime inputs\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-4a289f87-40be-45fa-90f8-f07a20dcafb8"></a>

**C24 · failure:** The initial error callback is the local default errorHandler; its getResponse branch forwards the response body and initialization data through c\.newResponse\. [src/hono\-base\.ts:191](#evidence-e6e723339481e57866817eae505f437cf7cf9fcc9938197fc569fb0760769e2b), [src/hono\-base\.ts:35](#evidence-4634461b115dd4a1479717296128dc6517427f5529a42e3937146f069d9ac09a)

<a id="claim-4e81a050-0232-49a7-bf88-ebfbdc1e9576"></a>

**C25 · effect:** Outside that getResponse branch, the default error handler logs the error and requests a text response with status 500\. [src/hono\-base\.ts:35](#evidence-4634461b115dd4a1479717296128dc6517427f5529a42e3937146f069d9ac09a)

<a id="claim-544dbd7e-acd1-4040-8b00-00b91c0e8f8d"></a>

**C26 · failure:** The handler catch uses onError only when the thrown value is an Error and an onError callback exists\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-56b29496-273a-4a7a-ba0e-f3b36aff76a3"></a>

**C27 · constraint:** At the terminal index, a supplied outer next is invoked through handler\(context, continuation\)\. Its runtime result and effects are not established here\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-5a6d5b53-546a-4ad0-bb93-b028876d1d12"></a>

**C28 · failure:** The repeated\-next guard throws before the current frame&\#39;s handler try/catch, so that frame does not process its own guard error through onError\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-5b606765-089d-4722-8213-b675dde66bf5"></a>

**C29 · constraint:** A direct non\-Promise result that is neither null nor undefined is returned unchanged\. That expression does not check whether the value is a Response\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-5e705c38-4dd9-4e55-be1b-2f016881b2bd"></a>

**C30 · behavior:** Context\.notFound installs a fallback callback only when its private handler is nullish, then invokes the handler with this context\. [src/context\.ts:793](#evidence-3964d7755fbe93590183216380561fc4f6cf9eed1f24e7cd81b0943a88034107)

<a id="claim-6a188938-736d-4970-a698-88df4b787329"></a>

**C31 · state:** Before invoking onError, the handler catch writes the caught Error into context\.error\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-6a9ded64-407c-492b-904d-328bc04d3373"></a>

**C32 · behavior:** The direct\-path async next callback awaits not\-found, assigns the result to c\.res, and has no explicit return value\. It can reject if the awaited callback or assignment fails\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-6b252ce9-9a3f-4cdb-9248-b0e515420829"></a>

**C33 · failure:** The onNotFound invocation is awaited outside the current handler try/catch\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-6b5a8b30-ea42-46e9-880d-53099dbe6c56"></a>

**C34 · failure:** Rejection in the direct Promise chain is sent to the private error handler\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-6ea34fc3-66d3-437b-a99c-f67c5043f6b6"></a>

**C35 · behavior:** Dispatch creates a Context with the request, path, match result, env, execution context, and configured not\-found handler\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-6f5292fe-ce44-4891-9436-47ae3462ead0"></a>

**C36 · state:** The Context finalized field is initialized to false\. [src/context\.ts:317](#evidence-81a4d8ab57de79a1d20f794795058cd6a0ca7721a9a8c8d8f71e8f8f764e2dca)

<a id="claim-75a7f499-e2f0-4998-89a5-48c6456d3bab"></a>

**C37 · failure:** The supplied local notFoundHandler implementation requests a text response with status 404; custom handler behavior is not established by this excerpt\. [src/hono\-base\.ts:31](#evidence-50e79ea172dc01947732e6a2fefd65b67b5c28d7dee03948f5ad30474ea840ab)

<a id="claim-7af68846-ae57-44cd-8e06-49e5596a226b"></a>

**C38 · failure:** A throw during the awaited composed path or its finalization check is passed to the private error handler\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-7ce9d699-11e2-481a-866e-c1e4356ea24d"></a>

**C39 · behavior:** The composition path returns context\.res after checking finalized\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-7f3aafe6-876f-4b5a-9bac-698144b2adfc"></a>

**C40 · state:** A falsy result does not trigger the final response assignment\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-8099fdae-3db1-47b0-b324-6d527a067dd6"></a>

**C41 · state:** The res getter takes no explicit argument\. It reads private response storage and can initialize both that storage and prepared headers\. [src/context\.ts:403](#evidence-efdc8a49582842d74bb72cf074179c4f18d4dc3a0f2d25c8ab366eb8630282b1)

<a id="claim-876a95e6-ca91-46c2-b831-60091068b69d"></a>

**C42 · behavior:** A falsy resolved Promise value falls back to c\.res when finalized, otherwise to the configured not\-found handler\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-87cd957c-bb51-49fe-b9a4-291c106e08c5"></a>

**C43 · behavior:** A handler receives a continuation that recursively dispatches i \+ 1 using the same context\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-889f741d-3df0-47f5-9e19-2a06a2a99445"></a>

**C44 · behavior:** For non\-HEAD dispatch, the configured path resolver receives the request and an object containing env\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-8b0483bd-c519-497b-b081-d286863646b7"></a>

**C45 · behavior:** Router matching receives the dispatch method and the resolved path\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-957e5bca-529c-4b7b-85cd-d3ad15c57993"></a>

**C46 · state:** Selecting a middleware entry also assigns i to context\.req\.routeIndex\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-a4808f91-eb8a-4a52-aed2-72effb4a139e"></a>

**C47 · state:** Each invocation of the runner returned by compose initializes its own progression index to \-1\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-a6cc6269-0179-4714-a6d7-a690685fd58b"></a>

**C48 · constraint:** The selected source calls response constructors, header methods, and Context response helpers\. Their implementations and complete failure behavior are outside these excerpts\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/context\.ts:403](#evidence-efdc8a49582842d74bb72cf074179c4f18d4dc3a0f2d25c8ab366eb8630282b1), [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5), [src/hono\-base\.ts:35](#evidence-4634461b115dd4a1479717296128dc6517427f5529a42e3937146f069d9ac09a)

<a id="claim-abe1d0e6-876f-40a3-b8e1-aac696dd56f5"></a>

**C49 · behavior:** A non\-Promise nullish direct result invokes the not\-found handler; this expression does not consult c\.finalized\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-b1c5caa4-d40d-4e99-a478-a0483a83437a"></a>

**C50 · behavior:** The runner begins asynchronous dispatch at middleware index zero\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-b35b5c02-3b31-46cd-b1ac-2845ca7d8424"></a>

**C51 · state:** The progression index is updated before the current handler is selected or invoked\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-b3a42479-5499-4eed-8d21-09169deaf214"></a>

**C52 · failure:** The res setter merges headers before its final storage assignment and finalized update\. An exception during that merge can prevent those final assignments\. [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

<a id="claim-b962178a-0e5d-4e27-a698-38b48e7fdd3a"></a>

**C53 · failure:** An unfinalized context returned by composition causes an Error about returning a Response or awaiting next\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-be525e2a-9f68-4196-b67c-7bf670fbee39"></a>

**C54 · behavior:** fetch forwards the original request, its method, the environment, and the execution context into the private dispatcher\. [src/hono\-base\.ts:481](#evidence-d973f31095c0885ec6968e6dfe05b9be07c8109174fa09d64d9941765210c070)

<a id="claim-bf2950af-c55d-401a-9691-50acf819a3f2"></a>

**C55 · failure:** The synchronous direct\-result fallback invokes not\-found outside the direct handler try/catch, so a throw there can propagate to the caller\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-c3467e33-ffa9-47f6-8a0f-934dcdd6024c"></a>

**C56 · behavior:** The dispatcher constructs compose with the matched middleware, configured error handler, and configured not\-found handler\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-d3f7ed18-fd8d-44d4-b50d-11e2dc21e501"></a>

**C57 · failure:** Path resolution, route matching, and Context construction occur before the direct\-handler and composed\-runner try blocks\. A failure there does not enter those local catches\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-d4c7dc38-cdfc-4a47-b9f5-c3628df16210"></a>

**C58 · behavior:** The direct handler receives an async next callback that assigns the configured not\-found result to c\.res\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-d543fd57-c7cb-4a8b-9078-fc6050980cf1"></a>

**C59 · constraint:** The res setter accepts Response or undefined by annotation and has no explicit return value\. It does not validate the argument type at runtime\. [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

<a id="claim-d5dd3300-e498-4ec8-b548-9d8308c15576"></a>

**C60 · behavior:** The fallback arrow installed by Context\.notFound calls createResponseInstance with no arguments and returns its result\. [src/context\.ts:793](#evidence-3964d7755fbe93590183216380561fc4f6cf9eed1f24e7cd81b0943a88034107)

<a id="claim-d5e3c85d-4a1d-4991-87d8-bd5369c091ab"></a>

**C61 · failure:** A truthy onError result may replace response state even when the context was already finalized\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370), [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

<a id="claim-d8b4fcf8-5869-40ef-a225-ff4e3d13bb99"></a>

**C62 · constraint:** If a parent handler awaits a child continuation and its rejection reaches the parent handler call, the parent frame catch can handle an Error through onError\. An unawaited continuation is not guaranteed to reach that catch\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-e1b56a2f-0a30-4965-865a-3ab75c96f399"></a>

**C63 · failure:** The composed frame assigns context\.res after the handler catch\. A failure from that assignment escapes the current handler catch and can reach an awaiting parent or application dispatcher\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370), [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

<a id="claim-e8b03c7a-182a-46d4-aeb8-bf4295b82798"></a>

**C64 · behavior:** Without a selected handler, onNotFound runs only when context\.finalized is exactly false and the callback exists\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-eb4d17a9-fa20-4ecc-9768-52ed19a28dea"></a>

**C65 · constraint:** Eligible error callbacks receive an Error and the current context\. Their returned values and failures depend on the configured implementation\. [src/hono\-base\.ts:401](#evidence-d19ca748f1302f0092f3bbbc30148d3c2d835f99f407db8e27802045d7c85b69), [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-f30ea83a-a386-4f3c-93af-21067f7f47cb"></a>

**C66 · behavior:** HEAD constructs a new Response with a null body and the awaited GET\-dispatch response as its initialization argument\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-f360cf06-1fc5-4b71-891d-37fdddbfeaa4"></a>

**C67 · constraint:** The shown call sites supply context and a continuation to selected handlers\. These excerpts do not establish their implementations, return values, failures, state changes, or use of await next\(\)\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-f551142e-2ef8-4131-9da8-304f6a92329e"></a>

**C68 · behavior:** The composition path awaits the composed runner with the newly constructed context\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-f5f65ad6-ca98-41d8-95dd-293ac83d5f15"></a>

**C69 · failure:** The private error handler delegates Error instances to the configured error callback and rethrows other values\. [src/hono\-base\.ts:401](#evidence-d19ca748f1302f0092f3bbbc30148d3c2d835f99f407db8e27802045d7c85b69)

<a id="claim-f67de3f4-647c-4c67-86e3-ab561267bf22"></a>

**C70 · behavior:** A successfully completed dispatch frame returns the shared context object\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-f984c4f5-e5e0-4ce9-a0fc-0b8884e34883"></a>

**C71 · constraint:** The configured not\-found callback receives the current context\. Its returned values and failures depend on the configured implementation\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-fc07b7ac-e50a-4c46-8293-6c36dcbfbbdb"></a>

**C72 · failure:** The private error handler calls the configured error callback without a local try block\. Its synchronous throw or returned rejection can pass to the caller\. [src/hono\-base\.ts:401](#evidence-d19ca748f1302f0092f3bbbc30148d3c2d835f99f407db8e27802045d7c85b69)

<a id="claim-fca39081-cbda-4fe7-8212-cf21fdc9a885"></a>

**C73 · state:** A truthy response result is assigned to context\.res only when context is not finalized or the result came through onError\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370), [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

### Exact control flow

<a id="step-fdc5198f-dec9-4c31-a00f-59b930e9e076"></a>

**Select dispatch method**

- HEAD → [Dispatch GET and remove the response body](#step-c8e6ec4b-17bf-4637-8e47-40b6b7b992f7) [src/hono\-base\.ts:481](#evidence-d973f31095c0885ec6968e6dfe05b9be07c8109174fa09d64d9941765210c070), [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
- Other methods → [Resolve path, match routes, create context](#step-c9a85946-abf2-4a8e-9dec-59fa95a966f1) [src/hono\-base\.ts:481](#evidence-d973f31095c0885ec6968e6dfe05b9be07c8109174fa09d64d9941765210c070), [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
Claims: [C54](#claim-be525e2a-9f68-4196-b67c-7bf670fbee39), [C3](#claim-085248c3-81b0-4cad-986d-05fee44fe506), [C66](#claim-f30ea83a-a386-4f3c-93af-21067f7f47cb). [src/hono\-base\.ts:481](#evidence-d973f31095c0885ec6968e6dfe05b9be07c8109174fa09d64d9941765210c070), [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="step-c8e6ec4b-17bf-4637-8e47-40b6b7b992f7"></a>

**Dispatch GET and remove the response body**

Claims: [C3](#claim-085248c3-81b0-4cad-986d-05fee44fe506), [C66](#claim-f30ea83a-a386-4f3c-93af-21067f7f47cb). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="step-c9a85946-abf2-4a8e-9dec-59fa95a966f1"></a>

**Resolve path, match routes, create context**

- Then → [Choose handling path](#step-3301e9a4-0b62-40b9-bcc5-74652de3839a) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
Claims: [C44](#claim-889f741d-3df0-47f5-9e19-2a06a2a99445), [C45](#claim-8b0483bd-c519-497b-b081-d286863646b7), [C35](#claim-6ea34fc3-66d3-437b-a99c-f67c5043f6b6). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="step-3301e9a4-0b62-40b9-bcc5-74652de3839a"></a>

**Choose handling path**

- Exactly one handler → [Invoke the direct handler and classify its result](#step-cdf57463-13f7-4ae8-9709-ea1462e942d2) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
- Zero or multiple handlers → [Await middleware composition](#step-bd8c16b3-f9f9-4211-93a8-0cfd6fdef1f3) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
Claims: [C19](#claim-3c7751cc-3137-4636-a809-aa2a0ee43c9e), [C11](#claim-2639197b-bb38-4ed2-9817-07e369a77759). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="step-cdf57463-13f7-4ae8-9709-ea1462e942d2"></a>

**Invoke the direct handler and classify its result**

- Returns a Promise → [Resolve the response or context/not\-found fallback](#step-7539d22f-ed85-48df-bba7-ca69334adb90) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
- Returns a non\-Promise value → [Use a non\-nullish result or invoke not\-found](#step-6f7b0430-e901-4ab6-9a3d-b088f2b012e8) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
- Throws synchronously → [Delegate Error values or rethrow other values](#step-6e269ade-b6c0-4442-8553-6445a5fbbb6e) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
Claims: [C58](#claim-d4c7dc38-cdfc-4a47-b9f5-c3628df16210), [C18](#claim-3a465dfd-a823-4297-a867-dc7b31edd393), [C20](#claim-3ebf7dad-d613-4994-9e9e-f59bb1d79317). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="step-7539d22f-ed85-48df-bba7-ca69334adb90"></a>

**Resolve the response or context/not\-found fallback**

- Promise chain fulfills → [Return the selected response](#step-78c04a66-b80a-4358-8b55-58a8d1523e29) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
- Promise chain rejects → [Delegate Error values or rethrow other values](#step-6e269ade-b6c0-4442-8553-6445a5fbbb6e) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
Claims: [C13](#claim-32832fda-23d3-411c-8392-6782b3634057), [C42](#claim-876a95e6-ca91-46c2-b831-60091068b69d), [C34](#claim-6b5a8b30-ea42-46e9-880d-53099dbe6c56). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="step-6f7b0430-e901-4ab6-9a3d-b088f2b012e8"></a>

**Use a non\-nullish result or invoke not\-found**

- Result or fallback completes → [Return the selected response](#step-78c04a66-b80a-4358-8b55-58a8d1523e29) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
- Synchronous not\-found fallback throws → [Propagate a synchronous fallback failure](#step-95622008-6e00-4397-9d3b-37cf7633368e) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
Claims: [C49](#claim-abe1d0e6-876f-40a3-b8e1-aac696dd56f5), [C55](#claim-bf2950af-c55d-401a-9691-50acf819a3f2). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="step-bd8c16b3-f9f9-4211-93a8-0cfd6fdef1f3"></a>

**Await middleware composition**

- Composition fulfills → [Require a finalized context](#step-4ccc4676-c52d-4d20-ab3d-7578bfedcda6) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
- Composition throws → [Delegate Error values or rethrow other values](#step-6e269ade-b6c0-4442-8553-6445a5fbbb6e) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
Claims: [C56](#claim-c3467e33-ffa9-47f6-8a0f-934dcdd6024c), [C68](#claim-f551142e-2ef8-4131-9da8-304f6a92329e). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="step-4ccc4676-c52d-4d20-ab3d-7578bfedcda6"></a>

**Require a finalized context**

- Context finalized → [Return the selected response](#step-78c04a66-b80a-4358-8b55-58a8d1523e29) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
- Context unfinalized: throw Error → [Delegate Error values or rethrow other values](#step-6e269ade-b6c0-4442-8553-6445a5fbbb6e) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
Claims: [C53](#claim-b962178a-0e5d-4e27-a698-38b48e7fdd3a), [C39](#claim-7ce9d699-11e2-481a-866e-c1e4356ea24d). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="step-6e269ade-b6c0-4442-8553-6445a5fbbb6e"></a>

**Delegate Error values or rethrow other values**

Claims: [C38](#claim-7af68846-ae57-44cd-8e06-49e5596a226b), [C69](#claim-f5f65ad6-ca98-41d8-95dd-293ac83d5f15), [C24](#claim-4a289f87-40be-45fa-90f8-f07a20dcafb8), [C25](#claim-4e81a050-0232-49a7-bf88-ebfbdc1e9576). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/hono\-base\.ts:401](#evidence-d19ca748f1302f0092f3bbbc30148d3c2d835f99f407db8e27802045d7c85b69), [src/hono\-base\.ts:35](#evidence-4634461b115dd4a1479717296128dc6517427f5529a42e3937146f069d9ac09a), [src/hono\-base\.ts:191](#evidence-e6e723339481e57866817eae505f437cf7cf9fcc9938197fc569fb0760769e2b)

<a id="step-78c04a66-b80a-4358-8b55-58a8d1523e29"></a>

**Return the selected response**

Claims: [C13](#claim-32832fda-23d3-411c-8392-6782b3634057), [C49](#claim-abe1d0e6-876f-40a3-b8e1-aac696dd56f5), [C39](#claim-7ce9d699-11e2-481a-866e-c1e4356ea24d). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="step-95622008-6e00-4397-9d3b-37cf7633368e"></a>

**Propagate a synchronous fallback failure**

Claims: [C55](#claim-bf2950af-c55d-401a-9691-50acf819a3f2). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

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

<a id="evidence-81a4d8ab57de79a1d20f794795058cd6a0ca7721a9a8c8d8f71e8f8f764e2dca"></a>

#### src/context\.ts:317–317

Evidence: `evidence:81a4d8ab57de79a1d20f794795058cd6a0ca7721a9a8c8d8f71e8f8f764e2dca`. Blob: `d611cc504c7eaa59cc273daccafd1e3d56066a7a`. UTF-8 bytes [9645, 9671).

```typescript
finalized: boolean = false
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

<a id="evidence-50e79ea172dc01947732e6a2fefd65b67b5c28d7dee03948f5ad30474ea840ab"></a>

#### src/hono\-base\.ts:31–33

Evidence: `evidence:50e79ea172dc01947732e6a2fefd65b67b5c28d7dee03948f5ad30474ea840ab`. Blob: `387fe89bf3cc95a2216251db919432ef7b0ddaeb`. UTF-8 bytes [751, 834).

```typescript
notFoundHandler: NotFoundHandler = (c) => {
  return c.text('404 Not Found', 404)
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

<a id="evidence-e6e723339481e57866817eae505f437cf7cf9fcc9938197fc569fb0760769e2b"></a>

#### src/hono\-base\.ts:191–191

Evidence: `evidence:e6e723339481e57866817eae505f437cf7cf9fcc9938197fc569fb0760769e2b`. Blob: `387fe89bf3cc95a2216251db919432ef7b0ddaeb`. UTF-8 bytes [5882, 5931).

```typescript
private errorHandler: ErrorHandler = errorHandler
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

<a id="evidence-d973f31095c0885ec6968e6dfe05b9be07c8109174fa09d64d9941765210c070"></a>

#### src/hono\-base\.ts:481–487

Evidence: `evidence:d973f31095c0885ec6968e6dfe05b9be07c8109174fa09d64d9941765210c070`. Blob: `387fe89bf3cc95a2216251db919432ef7b0ddaeb`. UTF-8 bytes [14278, 14509).

```typescript
fetch: (
    request: Request,
    env?: E['Bindings'] | {},
    executionCtx?: ExecutionContext
  ) => Response | Promise<Response> = (request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method)
  }
```

### Analysis details

Entry points: fetch in src/hono\-base\.ts, \#dispatch in src/hono\-base\.ts.

Flow entries: [Select dispatch method](#step-fdc5198f-dec9-4c31-a00f-59b930e9e076).

Transport: recorded-replay. Producer: Codex source\-reviewed contract authoring run. Model: not recorded.

Semantic artifact: `semantic:879ce0fdb5dee3f6f406bfa87e28f0d2f48b65fb58026479f9172bbd54b8c3f0`. Snapshot: `sha256:830729e39b7bcef4322bb641057509cc302f2ab598f998f37c370bc883f14eb9`.

Structural scan: `scan:fb8827cf671eeb148410a7e6967bb3025665851e64ae359a7bad515b72855f93`.

Claim support: unreviewed. Acceptance: proposed. Presentation: authored, unreviewed.

Scope: src/compose\.ts, src/context\.ts, src/hono\-base\.ts. 11 excerpts; 1731 other structural evidence records omitted.

Source scan: 25/25 selected files parsed; 0 failed; 10 support files.

### Related state and components

- Request dispatcher — implements → Dispatch an incoming request [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
- Dispatch an incoming request — invokes → Compose middleware [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
- Dispatch an incoming request — reads → Response and finalization state [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
- Dispatch an incoming request — writes → Response and finalization state [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

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
