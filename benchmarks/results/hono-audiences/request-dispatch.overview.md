# How a web request gets a response

Hono finds the code that should handle a web request\. It then uses that code to select a response\.

[Engineer version](request-dispatch.engineer.md)

## What happens

1. **Receive the request.** Read the request method and path\.
2. **Find the matching code.** Select the functions registered for that request\.
3. **Select a response.** Use the result, a fallback, or an error path\.

## A simple case

One matching function returns a response directly\. Hono returns that response to the caller\.

## What can happen next

### A response is returned

Hono selects the response from the chosen handling path\.

### No direct response

Hono can use a response already stored by a function\. Other paths call a fallback or raise an error\.

### The code fails

Some failures reach the configured error handler\. Others can pass back to the caller\.

## What this view cannot tell you

Your routes and application functions determine the actual behavior\. Their implementation is outside these excerpts\.

Some failures leave this part of Hono\. The excerpts do not show how the caller handles them\.

Recorded example · Partial repository view · Needs independent review

<a id="sources"></a>

<details>
<summary>Sources for this overview</summary>

Hono finds the code that should handle a web request\. It then uses that code to select a response\.

[src/hono\-base\.ts:481](#evidence-d973f31095c0885ec6968e6dfe05b9be07c8109174fa09d64d9941765210c070) · [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

Read the request method and path\.

[src/hono\-base\.ts:481](#evidence-d973f31095c0885ec6968e6dfe05b9be07c8109174fa09d64d9941765210c070) · [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

Select the functions registered for that request\.

[src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

Use the result, a fallback, or an error path\.

[src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2) · [src/hono\-base\.ts:401](#evidence-d19ca748f1302f0092f3bbbc30148d3c2d835f99f407db8e27802045d7c85b69)

One matching function returns a response directly\. Hono returns that response to the caller\.

[src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

Hono selects the response from the chosen handling path\.

[src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

Hono can use a response already stored by a function\. Other paths call a fallback or raise an error\.

[src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

Some failures reach the configured error handler\. Others can pass back to the caller\.

[src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2) · [src/hono\-base\.ts:401](#evidence-d19ca748f1302f0092f3bbbc30148d3c2d835f99f407db8e27802045d7c85b69)

Your routes and application functions determine the actual behavior\. Their implementation is outside these excerpts\.

[src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2) · [Scope note 1](#unknown-0)

Some failures leave this part of Hono\. The excerpts do not show how the caller handles them\.

[src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2) · [Scope note 2](#unknown-1) · [Scope note 5](#unknown-4)

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

<a id="claim-be525e2a-9f68-4196-b67c-7bf670fbee39"></a>

**C1 · behavior:** fetch forwards the original request, its method, the environment, and the execution context into the private dispatcher\. [src/hono\-base\.ts:481](#evidence-d973f31095c0885ec6968e6dfe05b9be07c8109174fa09d64d9941765210c070)

<a id="claim-085248c3-81b0-4cad-986d-05fee44fe506"></a>

**C2 · behavior:** HEAD dispatch recursively uses GET as the dispatch method argument while retaining the original Request object\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-f30ea83a-a386-4f3c-93af-21067f7f47cb"></a>

**C3 · behavior:** HEAD constructs a new Response with a null body and the awaited GET\-dispatch response as its initialization argument\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-889f741d-3df0-47f5-9e19-2a06a2a99445"></a>

**C4 · behavior:** For non\-HEAD dispatch, the configured path resolver receives the request and an object containing env\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-8b0483bd-c519-497b-b081-d286863646b7"></a>

**C5 · behavior:** Router matching receives the dispatch method and the resolved path\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-6ea34fc3-66d3-437b-a99c-f67c5043f6b6"></a>

**C6 · behavior:** Dispatch creates a Context with the request, path, match result, env, execution context, and configured not\-found handler\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-3c7751cc-3137-4636-a809-aa2a0ee43c9e"></a>

**C7 · behavior:** Exactly one matched handler takes a direct path that bypasses compose\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-d4c7dc38-cdfc-4a47-b9f5-c3628df16210"></a>

**C8 · behavior:** The direct handler receives an async next callback that assigns the configured not\-found result to c\.res\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-3a465dfd-a823-4297-a867-dc7b31edd393"></a>

**C9 · failure:** A synchronous throw from the direct handler is sent to the private error handler\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-3ebf7dad-d613-4994-9e9e-f59bb1d79317"></a>

**C10 · behavior:** The direct path distinguishes a returned Promise using instanceof Promise\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-32832fda-23d3-411c-8392-6782b3634057"></a>

**C11 · behavior:** A truthy resolved response from that Promise is returned before consulting finalized context state\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-876a95e6-ca91-46c2-b831-60091068b69d"></a>

**C12 · behavior:** A falsy resolved Promise value falls back to c\.res when finalized, otherwise to the configured not\-found handler\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-6b5a8b30-ea42-46e9-880d-53099dbe6c56"></a>

**C13 · failure:** Rejection in the direct Promise chain is sent to the private error handler\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-abe1d0e6-876f-40a3-b8e1-aac696dd56f5"></a>

**C14 · behavior:** A non\-Promise nullish direct result invokes the not\-found handler; this expression does not consult c\.finalized\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-2639197b-bb38-4ed2-9817-07e369a77759"></a>

**C15 · behavior:** Zero handlers and more than one handler both enter the composition path\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-c3467e33-ffa9-47f6-8a0f-934dcdd6024c"></a>

**C16 · behavior:** The dispatcher constructs compose with the matched middleware, configured error handler, and configured not\-found handler\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="claim-f551142e-2ef8-4131-9da8-304f6a92329e"></a>

**C17 · behavior:** The composition path awaits the composed runner with the newly constructed context\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-b962178a-0e5d-4e27-a698-38b48e7fdd3a"></a>

**C18 · failure:** An unfinalized context returned by composition causes an Error about returning a Response or awaiting next\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-7ce9d699-11e2-481a-866e-c1e4356ea24d"></a>

**C19 · behavior:** The composition path returns context\.res after checking finalized\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-7af68846-ae57-44cd-8e06-49e5596a226b"></a>

**C20 · failure:** A throw during the awaited composed path or its finalization check is passed to the private error handler\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claim-f5f65ad6-ca98-41d8-95dd-293ac83d5f15"></a>

**C21 · failure:** The private error handler delegates Error instances to the configured error callback and rethrows other values\. [src/hono\-base\.ts:401](#evidence-d19ca748f1302f0092f3bbbc30148d3c2d835f99f407db8e27802045d7c85b69)

<a id="claim-4a289f87-40be-45fa-90f8-f07a20dcafb8"></a>

**C22 · failure:** The initial error callback is the local default errorHandler; its getResponse branch forwards the response body and initialization data through c\.newResponse\. [src/hono\-base\.ts:191](#evidence-e6e723339481e57866817eae505f437cf7cf9fcc9938197fc569fb0760769e2b), [src/hono\-base\.ts:35](#evidence-4634461b115dd4a1479717296128dc6517427f5529a42e3937146f069d9ac09a)

<a id="claim-4e81a050-0232-49a7-bf88-ebfbdc1e9576"></a>

**C23 · effect:** Outside that getResponse branch, the default error handler logs the error and requests a text response with status 500\. [src/hono\-base\.ts:35](#evidence-4634461b115dd4a1479717296128dc6517427f5529a42e3937146f069d9ac09a)

<a id="claim-75a7f499-e2f0-4998-89a5-48c6456d3bab"></a>

**C24 · failure:** The supplied local notFoundHandler implementation requests a text response with status 404; custom handler behavior is not established by this excerpt\. [src/hono\-base\.ts:31](#evidence-50e79ea172dc01947732e6a2fefd65b67b5c28d7dee03948f5ad30474ea840ab)

<a id="claim-6f5292fe-ce44-4891-9436-47ae3462ead0"></a>

**C25 · state:** The Context finalized field is initialized to false\. [src/context\.ts:317](#evidence-81a4d8ab57de79a1d20f794795058cd6a0ca7721a9a8c8d8f71e8f8f764e2dca)

<a id="claim-161b91b9-a49b-44d3-a919-0758464c5af3"></a>

**C26 · state:** The res getter lazily creates response storage with prepared headers; the getter itself does not set finalized\. [src/context\.ts:403](#evidence-efdc8a49582842d74bb72cf074179c4f18d4dc3a0f2d25c8ab366eb8630282b1)

<a id="claim-1d2eae5b-efd0-4237-8671-50d5055dafe0"></a>

**C27 · state:** The res setter stores its argument and sets finalized to true, including when the argument is undefined\. [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

<a id="claim-146991bd-ed7d-4ae1-8868-888a11dedf6e"></a>

**C28 · state:** When both old and new responses exist, the res setter copies the new response before merging old headers, skipping the old content\-type\. [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

<a id="claim-0b57c11a-c767-4573-8888-f3d49cbdf5c6"></a>

**C29 · state:** The res setter replaces the new set\-cookie collection with cookies from the previous response when merging that header\. [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

<a id="claim-5e705c38-4dd9-4e55-be1b-2f016881b2bd"></a>

**C30 · behavior:** Context\.notFound installs a fallback callback only when its private handler is nullish, then invokes the handler with this context\. [src/context\.ts:793](#evidence-3964d7755fbe93590183216380561fc4f6cf9eed1f24e7cd81b0943a88034107)

<a id="claim-bf2950af-c55d-401a-9691-50acf819a3f2"></a>

**C31 · failure:** The synchronous direct\-result fallback invokes not\-found outside the direct handler try/catch, so a throw there can propagate to the caller\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

### Exact control flow

<a id="step-fdc5198f-dec9-4c31-a00f-59b930e9e076"></a>

**Select dispatch method**

- HEAD → [Dispatch GET and remove the response body](#step-c8e6ec4b-17bf-4637-8e47-40b6b7b992f7) [src/hono\-base\.ts:481](#evidence-d973f31095c0885ec6968e6dfe05b9be07c8109174fa09d64d9941765210c070), [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
- Other methods → [Resolve path, match routes, create context](#step-c9a85946-abf2-4a8e-9dec-59fa95a966f1) [src/hono\-base\.ts:481](#evidence-d973f31095c0885ec6968e6dfe05b9be07c8109174fa09d64d9941765210c070), [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
Claims: [C1](#claim-be525e2a-9f68-4196-b67c-7bf670fbee39), [C2](#claim-085248c3-81b0-4cad-986d-05fee44fe506), [C3](#claim-f30ea83a-a386-4f3c-93af-21067f7f47cb). [src/hono\-base\.ts:481](#evidence-d973f31095c0885ec6968e6dfe05b9be07c8109174fa09d64d9941765210c070), [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="step-c8e6ec4b-17bf-4637-8e47-40b6b7b992f7"></a>

**Dispatch GET and remove the response body**

Claims: [C2](#claim-085248c3-81b0-4cad-986d-05fee44fe506), [C3](#claim-f30ea83a-a386-4f3c-93af-21067f7f47cb). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="step-c9a85946-abf2-4a8e-9dec-59fa95a966f1"></a>

**Resolve path, match routes, create context**

- Then → [Choose handling path](#step-3301e9a4-0b62-40b9-bcc5-74652de3839a) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
Claims: [C4](#claim-889f741d-3df0-47f5-9e19-2a06a2a99445), [C5](#claim-8b0483bd-c519-497b-b081-d286863646b7), [C6](#claim-6ea34fc3-66d3-437b-a99c-f67c5043f6b6). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="step-3301e9a4-0b62-40b9-bcc5-74652de3839a"></a>

**Choose handling path**

- Exactly one handler → [Invoke the direct handler and classify its result](#step-cdf57463-13f7-4ae8-9709-ea1462e942d2) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
- Zero or multiple handlers → [Await middleware composition](#step-bd8c16b3-f9f9-4211-93a8-0cfd6fdef1f3) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
Claims: [C7](#claim-3c7751cc-3137-4636-a809-aa2a0ee43c9e), [C15](#claim-2639197b-bb38-4ed2-9817-07e369a77759). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="step-cdf57463-13f7-4ae8-9709-ea1462e942d2"></a>

**Invoke the direct handler and classify its result**

- Returns a Promise → [Resolve the response or context/not\-found fallback](#step-7539d22f-ed85-48df-bba7-ca69334adb90) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
- Returns a non\-Promise value → [Use a non\-nullish result or invoke not\-found](#step-6f7b0430-e901-4ab6-9a3d-b088f2b012e8) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
- Throws synchronously → [Delegate Error values or rethrow other values](#step-6e269ade-b6c0-4442-8553-6445a5fbbb6e) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
Claims: [C8](#claim-d4c7dc38-cdfc-4a47-b9f5-c3628df16210), [C9](#claim-3a465dfd-a823-4297-a867-dc7b31edd393), [C10](#claim-3ebf7dad-d613-4994-9e9e-f59bb1d79317). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="step-7539d22f-ed85-48df-bba7-ca69334adb90"></a>

**Resolve the response or context/not\-found fallback**

- Promise chain fulfills → [Return the selected response](#step-78c04a66-b80a-4358-8b55-58a8d1523e29) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
- Promise chain rejects → [Delegate Error values or rethrow other values](#step-6e269ade-b6c0-4442-8553-6445a5fbbb6e) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
Claims: [C11](#claim-32832fda-23d3-411c-8392-6782b3634057), [C12](#claim-876a95e6-ca91-46c2-b831-60091068b69d), [C13](#claim-6b5a8b30-ea42-46e9-880d-53099dbe6c56). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="step-6f7b0430-e901-4ab6-9a3d-b088f2b012e8"></a>

**Use a non\-nullish result or invoke not\-found**

- Result or fallback completes → [Return the selected response](#step-78c04a66-b80a-4358-8b55-58a8d1523e29) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
- Synchronous not\-found fallback throws → [Propagate a synchronous fallback failure](#step-95622008-6e00-4397-9d3b-37cf7633368e) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
Claims: [C14](#claim-abe1d0e6-876f-40a3-b8e1-aac696dd56f5), [C31](#claim-bf2950af-c55d-401a-9691-50acf819a3f2). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="step-bd8c16b3-f9f9-4211-93a8-0cfd6fdef1f3"></a>

**Await middleware composition**

- Composition fulfills → [Require a finalized context](#step-4ccc4676-c52d-4d20-ab3d-7578bfedcda6) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
- Composition throws → [Delegate Error values or rethrow other values](#step-6e269ade-b6c0-4442-8553-6445a5fbbb6e) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
Claims: [C16](#claim-c3467e33-ffa9-47f6-8a0f-934dcdd6024c), [C17](#claim-f551142e-2ef8-4131-9da8-304f6a92329e). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="step-4ccc4676-c52d-4d20-ab3d-7578bfedcda6"></a>

**Require a finalized context**

- Context finalized → [Return the selected response](#step-78c04a66-b80a-4358-8b55-58a8d1523e29) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
- Context unfinalized: throw Error → [Delegate Error values or rethrow other values](#step-6e269ade-b6c0-4442-8553-6445a5fbbb6e) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
Claims: [C18](#claim-b962178a-0e5d-4e27-a698-38b48e7fdd3a), [C19](#claim-7ce9d699-11e2-481a-866e-c1e4356ea24d). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="step-6e269ade-b6c0-4442-8553-6445a5fbbb6e"></a>

**Delegate Error values or rethrow other values**

Claims: [C20](#claim-7af68846-ae57-44cd-8e06-49e5596a226b), [C21](#claim-f5f65ad6-ca98-41d8-95dd-293ac83d5f15), [C22](#claim-4a289f87-40be-45fa-90f8-f07a20dcafb8), [C23](#claim-4e81a050-0232-49a7-bf88-ebfbdc1e9576). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/hono\-base\.ts:401](#evidence-d19ca748f1302f0092f3bbbc30148d3c2d835f99f407db8e27802045d7c85b69), [src/hono\-base\.ts:35](#evidence-4634461b115dd4a1479717296128dc6517427f5529a42e3937146f069d9ac09a), [src/hono\-base\.ts:191](#evidence-e6e723339481e57866817eae505f437cf7cf9fcc9938197fc569fb0760769e2b)

<a id="step-78c04a66-b80a-4358-8b55-58a8d1523e29"></a>

**Return the selected response**

Claims: [C11](#claim-32832fda-23d3-411c-8392-6782b3634057), [C14](#claim-abe1d0e6-876f-40a3-b8e1-aac696dd56f5), [C19](#claim-7ce9d699-11e2-481a-866e-c1e4356ea24d). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="step-95622008-6e00-4397-9d3b-37cf7633368e"></a>

**Propagate a synchronous fallback failure**

Claims: [C31](#claim-bf2950af-c55d-401a-9691-50acf819a3f2). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

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

Transport: recorded-replay. Producer: Codex source\-reading session. Model: not recorded.

Semantic artifact: `semantic:3b600ce62677cd56b9d3172a4cd2841f739dd41effc439a2d27acbb230142d56`. Snapshot: `sha256:830729e39b7bcef4322bb641057509cc302f2ab598f998f37c370bc883f14eb9`.

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
