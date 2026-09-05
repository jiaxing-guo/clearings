# Dispatch an incoming request

Hono receives a request, finds matching handlers, and selects a response\. The selected path also determines how it handles missing responses and failures\.

**Recorded example · Support unreviewed.** Source excerpts are available below.

Scope: 3 selected files; 11 source excerpts. This is a partial view of the repository.

[Follow the flow](#flow) · [Explore a case](#cases) · [Scope and unknowns](#unknowns) · [Inspect evidence](#evidence)

Introduction support: [C1](#claim-be525e2a-9f68-4196-b67c-7bf670fbee39), [C5](#claim-8b0483bd-c519-497b-b081-d286863646b7), [C7](#claim-3c7751cc-3137-4636-a809-aa2a0ee43c9e), [C12](#claim-876a95e6-ca91-46c2-b831-60091068b69d), [C14](#claim-abe1d0e6-876f-40a3-b8e1-aac696dd56f5), [C15](#claim-2639197b-bb38-4ed2-9817-07e369a77759), [C19](#claim-7ce9d699-11e2-481a-866e-c1e4356ea24d), [C21](#claim-f5f65ad6-ca98-41d8-95dd-293ac83d5f15)

<a id="flow"></a>

## Follow the flow

These stages group related behavior. The conditions in each stage determine the path.

1. [Choose the request method](#stage-method) — For requests other than HEAD, Hono uses the supplied method\. For HEAD, it uses GET and returns a response without a body\.
2. [Find matching handlers](#stage-match) — Hono resolves the path, matches routes, and creates the request context\.
3. [Choose the handler path](#stage-handlers) — One matching handler runs directly\. Zero or multiple handlers use middleware composition\.
4. [Select the response](#stage-response) — Hono selects a response using the rules for the chosen handler path\.
5. [Handle a failure](#stage-failure) — The private error handler sends Error instances to the configured callback\. It rethrows other values\.

<a id="stage-method"></a>

### 1. Choose the request method

For requests other than HEAD, Hono uses the supplied method\. For HEAD, it uses GET and returns a response without a body\. (Support: [C1](#claim-be525e2a-9f68-4196-b67c-7bf670fbee39), [C2](#claim-085248c3-81b0-4cad-986d-05fee44fe506), [C3](#claim-f30ea83a-a386-4f3c-93af-21067f7f47cb))

**Watch for:** A failure from the HEAD wrapper is not guaranteed to reach the local error callback\. (Support: [Scope note 5](#unknown-4))

<details>
<summary>Explain this stage</summary>

The request enters through fetch\. Hono passes the request, environment, and execution context to its dispatcher\. (Support: [C1](#claim-be525e2a-9f68-4196-b67c-7bf670fbee39))

For HEAD, only the dispatch method argument changes to GET\. The original Request object stays the same\. (Support: [C2](#claim-085248c3-81b0-4cad-986d-05fee44fe506))

#### Exact branches

<a id="step-fdc5198f-dec9-4c31-a00f-59b930e9e076"></a>

**Select dispatch method**

Support: [C1](#claim-be525e2a-9f68-4196-b67c-7bf670fbee39), [C2](#claim-085248c3-81b0-4cad-986d-05fee44fe506), [C3](#claim-f30ea83a-a386-4f3c-93af-21067f7f47cb). [src/hono\-base\.ts:481](#evidence-d973f31095c0885ec6968e6dfe05b9be07c8109174fa09d64d9941765210c070), [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

- HEAD → [Dispatch GET and remove the response body](#step-c8e6ec4b-17bf-4637-8e47-40b6b7b992f7) [src/hono\-base\.ts:481](#evidence-d973f31095c0885ec6968e6dfe05b9be07c8109174fa09d64d9941765210c070), [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
- Other methods → [Resolve path, match routes, create context](#step-c9a85946-abf2-4a8e-9dec-59fa95a966f1) [src/hono\-base\.ts:481](#evidence-d973f31095c0885ec6968e6dfe05b9be07c8109174fa09d64d9941765210c070), [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="step-c8e6ec4b-17bf-4637-8e47-40b6b7b992f7"></a>

**Dispatch GET and remove the response body**

Support: [C2](#claim-085248c3-81b0-4cad-986d-05fee44fe506), [C3](#claim-f30ea83a-a386-4f3c-93af-21067f7f47cb). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

This branch ends within the recorded flow.

All claims for this stage: [C1](#claim-be525e2a-9f68-4196-b67c-7bf670fbee39), [C2](#claim-085248c3-81b0-4cad-986d-05fee44fe506), [C3](#claim-f30ea83a-a386-4f3c-93af-21067f7f47cb)

</details>

<a id="stage-match"></a>

### 2. Find matching handlers

Hono resolves the path, matches routes, and creates the request context\. (Support: [C4](#claim-889f741d-3df0-47f5-9e19-2a06a2a99445), [C5](#claim-8b0483bd-c519-497b-b081-d286863646b7), [C6](#claim-6ea34fc3-66d3-437b-a99c-f67c5043f6b6))

**Watch for:** These excerpts do not establish router internals or user handler behavior\. Failures during this setup occur before the shown handler catch blocks\. (Support: [Scope note 1](#unknown-0) · [Scope note 2](#unknown-1))

<details>
<summary>Explain this stage</summary>

The router receives the dispatch method and resolved path\. The context stores the match result and request data\. (Support: [C5](#claim-8b0483bd-c519-497b-b081-d286863646b7), [C6](#claim-6ea34fc3-66d3-437b-a99c-f67c5043f6b6))

#### Exact branches

<a id="step-c9a85946-abf2-4a8e-9dec-59fa95a966f1"></a>

**Resolve path, match routes, create context**

Support: [C4](#claim-889f741d-3df0-47f5-9e19-2a06a2a99445), [C5](#claim-8b0483bd-c519-497b-b081-d286863646b7), [C6](#claim-6ea34fc3-66d3-437b-a99c-f67c5043f6b6). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

- Then → [Choose handling path](#step-3301e9a4-0b62-40b9-bcc5-74652de3839a) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

All claims for this stage: [C4](#claim-889f741d-3df0-47f5-9e19-2a06a2a99445), [C5](#claim-8b0483bd-c519-497b-b081-d286863646b7), [C6](#claim-6ea34fc3-66d3-437b-a99c-f67c5043f6b6)

</details>

<a id="stage-handlers"></a>

### 3. Choose the handler path

One matching handler runs directly\. Zero or multiple handlers use middleware composition\. (Support: [C7](#claim-3c7751cc-3137-4636-a809-aa2a0ee43c9e), [C15](#claim-2639197b-bb38-4ed2-9817-07e369a77759))


<details>
<summary>Explain this stage</summary>

The direct path checks whether the result is a Promise\. This choice affects response selection\. (Support: [C10](#claim-3ebf7dad-d613-4994-9e9e-f59bb1d79317))

The composition path uses the configured error and not\-found handlers\. The dispatcher waits for the composed runner\. (Support: [C16](#claim-c3467e33-ffa9-47f6-8a0f-934dcdd6024c), [C17](#claim-f551142e-2ef8-4131-9da8-304f6a92329e))

The next callback supplied to a direct handler assigns the configured not\-found result to c\.res\. (Support: [C8](#claim-d4c7dc38-cdfc-4a47-b9f5-c3628df16210))

#### Exact branches

<a id="step-3301e9a4-0b62-40b9-bcc5-74652de3839a"></a>

**Choose handling path**

Support: [C7](#claim-3c7751cc-3137-4636-a809-aa2a0ee43c9e), [C15](#claim-2639197b-bb38-4ed2-9817-07e369a77759). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

- Exactly one handler → [Invoke the direct handler and classify its result](#step-cdf57463-13f7-4ae8-9709-ea1462e942d2) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
- Zero or multiple handlers → [Await middleware composition](#step-bd8c16b3-f9f9-4211-93a8-0cfd6fdef1f3) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="step-cdf57463-13f7-4ae8-9709-ea1462e942d2"></a>

**Invoke the direct handler and classify its result**

Support: [C8](#claim-d4c7dc38-cdfc-4a47-b9f5-c3628df16210), [C9](#claim-3a465dfd-a823-4297-a867-dc7b31edd393), [C10](#claim-3ebf7dad-d613-4994-9e9e-f59bb1d79317). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

- Returns a Promise → [Resolve the response or context/not\-found fallback](#step-7539d22f-ed85-48df-bba7-ca69334adb90) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
- Returns a non\-Promise value → [Use a non\-nullish result or invoke not\-found](#step-6f7b0430-e901-4ab6-9a3d-b088f2b012e8) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
- Throws synchronously → [Delegate Error values or rethrow other values](#step-6e269ade-b6c0-4442-8553-6445a5fbbb6e) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="step-bd8c16b3-f9f9-4211-93a8-0cfd6fdef1f3"></a>

**Await middleware composition**

Support: [C16](#claim-c3467e33-ffa9-47f6-8a0f-934dcdd6024c), [C17](#claim-f551142e-2ef8-4131-9da8-304f6a92329e). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

- Composition fulfills → [Require a finalized context](#step-4ccc4676-c52d-4d20-ab3d-7578bfedcda6) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
- Composition throws → [Delegate Error values or rethrow other values](#step-6e269ade-b6c0-4442-8553-6445a5fbbb6e) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

All claims for this stage: [C7](#claim-3c7751cc-3137-4636-a809-aa2a0ee43c9e), [C8](#claim-d4c7dc38-cdfc-4a47-b9f5-c3628df16210), [C9](#claim-3a465dfd-a823-4297-a867-dc7b31edd393), [C10](#claim-3ebf7dad-d613-4994-9e9e-f59bb1d79317), [C15](#claim-2639197b-bb38-4ed2-9817-07e369a77759), [C16](#claim-c3467e33-ffa9-47f6-8a0f-934dcdd6024c), [C17](#claim-f551142e-2ef8-4131-9da8-304f6a92329e)

</details>

<a id="stage-response"></a>

### 4. Select the response

Hono selects a response using the rules for the chosen handler path\. (Support: [C11](#claim-32832fda-23d3-411c-8392-6782b3634057), [C12](#claim-876a95e6-ca91-46c2-b831-60091068b69d), [C14](#claim-abe1d0e6-876f-40a3-b8e1-aac696dd56f5), [C18](#claim-b962178a-0e5d-4e27-a698-38b48e7fdd3a), [C19](#claim-7ce9d699-11e2-481a-866e-c1e4356ea24d))

**Watch for:** A missing direct result and a falsy Promise result use different fallback rules\. Only the Promise fallback checks finalized\. (Support: [C12](#claim-876a95e6-ca91-46c2-b831-60091068b69d), [C14](#claim-abe1d0e6-876f-40a3-b8e1-aac696dd56f5))

<details>
<summary>Explain this stage</summary>

If a Promise resolves to a truthy value, Hono returns that value\. Otherwise, Hono uses c\.res if finalized is true\. If finalized is false, Hono calls the not\-found handler\. (Support: [C11](#claim-32832fda-23d3-411c-8392-6782b3634057), [C12](#claim-876a95e6-ca91-46c2-b831-60091068b69d))

If a direct result is not a Promise, Hono returns it unless it is null or undefined\. For those two values, Hono calls the not\-found handler\. (Support: [C14](#claim-abe1d0e6-876f-40a3-b8e1-aac696dd56f5))

After composition, Hono requires a finalized context\. It then returns context\.res\. If the context is not finalized, Hono raises an Error\. (Support: [C18](#claim-b962178a-0e5d-4e27-a698-38b48e7fdd3a), [C19](#claim-7ce9d699-11e2-481a-866e-c1e4356ea24d))

The context starts with finalized set to false\. Reading res alone does not finalize it\. The res setter sets finalized to true, even for undefined\. (Support: [C25](#claim-6f5292fe-ce44-4891-9436-47ae3462ead0), [C26](#claim-161b91b9-a49b-44d3-a919-0758464c5af3), [C27](#claim-1d2eae5b-efd0-4237-8671-50d5055dafe0))

When old and new responses exist, the setter merges old headers except content\-type\. Old set\-cookie values replace the new cookie collection\. (Support: [C28](#claim-146991bd-ed7d-4ae1-8868-888a11dedf6e), [C29](#claim-0b57c11a-c767-4573-8888-f3d49cbdf5c6))

The supplied default not\-found handler returns a text response with status 404\. A custom handler can behave differently\. (Support: [C24](#claim-75a7f499-e2f0-4998-89a5-48c6456d3bab))

Context\.notFound installs a fallback callback only when its stored handler is null or undefined\. It then calls that handler with the context\. (Support: [C30](#claim-5e705c38-4dd9-4e55-be1b-2f016881b2bd))

#### Exact branches

<a id="step-7539d22f-ed85-48df-bba7-ca69334adb90"></a>

**Resolve the response or context/not\-found fallback**

Support: [C11](#claim-32832fda-23d3-411c-8392-6782b3634057), [C12](#claim-876a95e6-ca91-46c2-b831-60091068b69d), [C13](#claim-6b5a8b30-ea42-46e9-880d-53099dbe6c56). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

- Promise chain fulfills → [Return the selected response](#step-78c04a66-b80a-4358-8b55-58a8d1523e29) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
- Promise chain rejects → [Delegate Error values or rethrow other values](#step-6e269ade-b6c0-4442-8553-6445a5fbbb6e) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="step-6f7b0430-e901-4ab6-9a3d-b088f2b012e8"></a>

**Use a non\-nullish result or invoke not\-found**

Support: [C14](#claim-abe1d0e6-876f-40a3-b8e1-aac696dd56f5), [C31](#claim-bf2950af-c55d-401a-9691-50acf819a3f2). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

- Result or fallback completes → [Return the selected response](#step-78c04a66-b80a-4358-8b55-58a8d1523e29) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
- Synchronous not\-found fallback throws → [Propagate a synchronous fallback failure](#step-95622008-6e00-4397-9d3b-37cf7633368e) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="step-4ccc4676-c52d-4d20-ab3d-7578bfedcda6"></a>

**Require a finalized context**

Support: [C18](#claim-b962178a-0e5d-4e27-a698-38b48e7fdd3a), [C19](#claim-7ce9d699-11e2-481a-866e-c1e4356ea24d). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

- Context finalized → [Return the selected response](#step-78c04a66-b80a-4358-8b55-58a8d1523e29) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
- Context unfinalized: throw Error → [Delegate Error values or rethrow other values](#step-6e269ade-b6c0-4442-8553-6445a5fbbb6e) [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="step-78c04a66-b80a-4358-8b55-58a8d1523e29"></a>

**Return the selected response**

Support: [C11](#claim-32832fda-23d3-411c-8392-6782b3634057), [C14](#claim-abe1d0e6-876f-40a3-b8e1-aac696dd56f5), [C19](#claim-7ce9d699-11e2-481a-866e-c1e4356ea24d). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

This branch ends within the recorded flow.

All claims for this stage: [C11](#claim-32832fda-23d3-411c-8392-6782b3634057), [C12](#claim-876a95e6-ca91-46c2-b831-60091068b69d), [C13](#claim-6b5a8b30-ea42-46e9-880d-53099dbe6c56), [C14](#claim-abe1d0e6-876f-40a3-b8e1-aac696dd56f5), [C18](#claim-b962178a-0e5d-4e27-a698-38b48e7fdd3a), [C19](#claim-7ce9d699-11e2-481a-866e-c1e4356ea24d), [C24](#claim-75a7f499-e2f0-4998-89a5-48c6456d3bab), [C25](#claim-6f5292fe-ce44-4891-9436-47ae3462ead0), [C26](#claim-161b91b9-a49b-44d3-a919-0758464c5af3), [C27](#claim-1d2eae5b-efd0-4237-8671-50d5055dafe0), [C28](#claim-146991bd-ed7d-4ae1-8868-888a11dedf6e), [C29](#claim-0b57c11a-c767-4573-8888-f3d49cbdf5c6), [C30](#claim-5e705c38-4dd9-4e55-be1b-2f016881b2bd), [C31](#claim-bf2950af-c55d-401a-9691-50acf819a3f2)

</details>

<a id="stage-failure"></a>

### 5. Handle a failure

The private error handler sends Error instances to the configured callback\. It rethrows other values\. (Support: [C21](#claim-f5f65ad6-ca98-41d8-95dd-293ac83d5f15))

**Watch for:** The direct not\-found fallback runs outside the direct handler catch block\. A throw there can reach the caller\. (Support: [C31](#claim-bf2950af-c55d-401a-9691-50acf819a3f2))

<details>
<summary>Explain this stage</summary>

The direct handler catch, direct Promise rejection handler, and composed path catch call the private error handler\. (Support: [C9](#claim-3a465dfd-a823-4297-a867-dc7b31edd393), [C13](#claim-6b5a8b30-ea42-46e9-880d-53099dbe6c56), [C20](#claim-7af68846-ae57-44cd-8e06-49e5596a226b))

The default error handler can use getResponse\. Otherwise, it logs the error and creates a text response with status 500\. (Support: [C22](#claim-4a289f87-40be-45fa-90f8-f07a20dcafb8), [C23](#claim-4e81a050-0232-49a7-bf88-ebfbdc1e9576))

#### Exact branches

<a id="step-6e269ade-b6c0-4442-8553-6445a5fbbb6e"></a>

**Delegate Error values or rethrow other values**

Support: [C20](#claim-7af68846-ae57-44cd-8e06-49e5596a226b), [C21](#claim-f5f65ad6-ca98-41d8-95dd-293ac83d5f15), [C22](#claim-4a289f87-40be-45fa-90f8-f07a20dcafb8), [C23](#claim-4e81a050-0232-49a7-bf88-ebfbdc1e9576). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/hono\-base\.ts:401](#evidence-d19ca748f1302f0092f3bbbc30148d3c2d835f99f407db8e27802045d7c85b69), [src/hono\-base\.ts:35](#evidence-4634461b115dd4a1479717296128dc6517427f5529a42e3937146f069d9ac09a), [src/hono\-base\.ts:191](#evidence-e6e723339481e57866817eae505f437cf7cf9fcc9938197fc569fb0760769e2b)

This branch ends within the recorded flow.

<a id="step-95622008-6e00-4397-9d3b-37cf7633368e"></a>

**Propagate a synchronous fallback failure**

Support: [C31](#claim-bf2950af-c55d-401a-9691-50acf819a3f2). [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

This branch ends within the recorded flow.

All claims for this stage: [C9](#claim-3a465dfd-a823-4297-a867-dc7b31edd393), [C13](#claim-6b5a8b30-ea42-46e9-880d-53099dbe6c56), [C20](#claim-7af68846-ae57-44cd-8e06-49e5596a226b), [C21](#claim-f5f65ad6-ca98-41d8-95dd-293ac83d5f15), [C22](#claim-4a289f87-40be-45fa-90f8-f07a20dcafb8), [C23](#claim-4e81a050-0232-49a7-bf88-ebfbdc1e9576), [C31](#claim-bf2950af-c55d-401a-9691-50acf819a3f2)

</details>

<a id="cases"></a>

## Explore a case

<a id="case-head"></a>

### What happens for a HEAD request?

Hono dispatches with GET as the method argument, while it keeps the original request\. It then creates a response with a null body\. (Support: [C2](#claim-085248c3-81b0-4cad-986d-05fee44fe506), [C3](#claim-f30ea83a-a386-4f3c-93af-21067f7f47cb))

The shown wrapper does not guarantee local handling of every rejection\. (Support: [Scope note 5](#unknown-4))

Related stages: [Choose the request method](#stage-method), [Handle a failure](#stage-failure)

<a id="case-one-handler"></a>

### What happens with one matching handler?

Hono calls the handler directly\. It then selects the Promise or direct return path from the returned value\. (Support: [C7](#claim-3c7751cc-3137-4636-a809-aa2a0ee43c9e), [C10](#claim-3ebf7dad-d613-4994-9e9e-f59bb1d79317))

Related stages: [Choose the handler path](#stage-handlers), [Select the response](#stage-response)

<a id="case-many-handlers"></a>

### What happens with zero or multiple handlers?

Both cases use compose with the configured error and not\-found handlers\. Hono waits for the result, then requires a finalized context\. (Support: [C15](#claim-2639197b-bb38-4ed2-9817-07e369a77759), [C16](#claim-c3467e33-ffa9-47f6-8a0f-934dcdd6024c), [C17](#claim-f551142e-2ef8-4131-9da8-304f6a92329e), [C18](#claim-b962178a-0e5d-4e27-a698-38b48e7fdd3a))

If the context is finalized, Hono returns context\.res\. Otherwise, the finalization check raises an Error\. (Support: [C18](#claim-b962178a-0e5d-4e27-a698-38b48e7fdd3a), [C19](#claim-7ce9d699-11e2-481a-866e-c1e4356ea24d))

Related stages: [Choose the handler path](#stage-handlers), [Select the response](#stage-response), [Handle a failure](#stage-failure)

<a id="case-missing-response"></a>

### What if a handler returns no response?

For a direct null or undefined result, Hono calls the not\-found handler without checking finalized\. (Support: [C14](#claim-abe1d0e6-876f-40a3-b8e1-aac696dd56f5))

For a falsy Promise result, Hono first checks finalized\. It uses c\.res if finalized is true\. Otherwise, it calls the not\-found handler\. (Support: [C12](#claim-876a95e6-ca91-46c2-b831-60091068b69d))

After composition, an unfinalized context causes an Error\. (Support: [C18](#claim-b962178a-0e5d-4e27-a698-38b48e7fdd3a))

Related stages: [Select the response](#stage-response), [Handle a failure](#stage-failure)

<a id="case-fallback-error"></a>

### Can a not\-found failure escape the local catch?

Yes\. The direct not\-found fallback runs outside the direct handler catch block\. A synchronous throw there can reach the caller\. (Support: [C31](#claim-bf2950af-c55d-401a-9691-50acf819a3f2))

Caller handling is outside this source view\. (Support: [Scope note 5](#unknown-4))

Related stages: [Select the response](#stage-response), [Handle a failure](#stage-failure)

<a id="case-context"></a>

### Does reading context\.res finalize the response?

No\. The getter can create response storage, but it does not set finalized\. The setter sets finalized to true, even for undefined\. (Support: [C26](#claim-161b91b9-a49b-44d3-a919-0758464c5af3), [C27](#claim-1d2eae5b-efd0-4237-8671-50d5055dafe0))

Related stages: [Select the response](#stage-response)

<a id="unknowns"></a>

## Scope and unknowns

These limits remain part of the explanation. A source citation does not prove that a claim is correct.

<a id="unknown-0"></a>

- **Critical:** Router matching internals and the runtime behavior of user handlers are outside these excerpts\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="unknown-1"></a>

- **Critical:** Thrown failures from path resolution, router matching, or Context construction occur before the shown handler try/catch blocks; caller\-level handling is outside this request\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="unknown-2"></a>

- **Critical:** Recursive next returns a Promise; whether a user handler awaits it is determined by that handler, not established by compose alone\. The flow describes frame recursion, not a flat scheduler\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)

<a id="unknown-3"></a>

- **Critical:** An error that escapes a child dispatch may be caught by an awaiting parent handler frame or by the application dispatcher\. No claim is made that every repeated\-next error bypasses all error handlers\. [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370), [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="unknown-4"></a>

- **Critical:** The synchronous not\-found fallback lies outside the direct\-handler try/catch\. Caller handling of a throw there, or rejection from the HEAD wrapper, is not represented as a guaranteed local error callback\. [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)

<a id="claims"></a>

## Claim inventory (31)

Use this inventory to audit the explanation. The claim text is preserved from the semantic proposal.

<details>
<summary>Open all claims</summary>

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

</details>

<a id="evidence"></a>

## Evidence

Source text is preserved from the recorded request.

<a id="evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370"></a>

<details>
<summary>src/compose.ts:15–73</summary>

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

</details>

<a id="evidence-81a4d8ab57de79a1d20f794795058cd6a0ca7721a9a8c8d8f71e8f8f764e2dca"></a>

<details>
<summary>src/context.ts:317–317</summary>

Evidence: `evidence:81a4d8ab57de79a1d20f794795058cd6a0ca7721a9a8c8d8f71e8f8f764e2dca`. Blob: `d611cc504c7eaa59cc273daccafd1e3d56066a7a`. UTF-8 bytes [9645, 9671).

```typescript
finalized: boolean = false
```

</details>

<a id="evidence-efdc8a49582842d74bb72cf074179c4f18d4dc3a0f2d25c8ab366eb8630282b1"></a>

<details>
<summary>src/context.ts:403–407</summary>

Evidence: `evidence:efdc8a49582842d74bb72cf074179c4f18d4dc3a0f2d25c8ab366eb8630282b1`. Blob: `d611cc504c7eaa59cc273daccafd1e3d56066a7a`. UTF-8 bytes [12114, 12262).

```typescript
get res(): Response {
    return (this.#res ||= createResponseInstance(null, {
      headers: (this.#preparedHeaders ??= new Headers()),
    }))
  }
```

</details>

<a id="evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5"></a>

<details>
<summary>src/context.ts:414–434</summary>

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

</details>

<a id="evidence-3964d7755fbe93590183216380561fc4f6cf9eed1f24e7cd81b0943a88034107"></a>

<details>
<summary>src/context.ts:793–796</summary>

Evidence: `evidence:3964d7755fbe93590183216380561fc4f6cf9eed1f24e7cd81b0943a88034107`. Blob: `d611cc504c7eaa59cc273daccafd1e3d56066a7a`. UTF-8 bytes [22557, 22708).

```typescript
notFound = (): ReturnType<NotFoundHandler> => {
    this.#notFoundHandler ??= () => createResponseInstance()
    return this.#notFoundHandler(this)
  }
```

</details>

<a id="evidence-50e79ea172dc01947732e6a2fefd65b67b5c28d7dee03948f5ad30474ea840ab"></a>

<details>
<summary>src/hono-base.ts:31–33</summary>

Evidence: `evidence:50e79ea172dc01947732e6a2fefd65b67b5c28d7dee03948f5ad30474ea840ab`. Blob: `387fe89bf3cc95a2216251db919432ef7b0ddaeb`. UTF-8 bytes [751, 834).

```typescript
notFoundHandler: NotFoundHandler = (c) => {
  return c.text('404 Not Found', 404)
}
```

</details>

<a id="evidence-4634461b115dd4a1479717296128dc6517427f5529a42e3937146f069d9ac09a"></a>

<details>
<summary>src/hono-base.ts:35–42</summary>

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

</details>

<a id="evidence-e6e723339481e57866817eae505f437cf7cf9fcc9938197fc569fb0760769e2b"></a>

<details>
<summary>src/hono-base.ts:191–191</summary>

Evidence: `evidence:e6e723339481e57866817eae505f437cf7cf9fcc9938197fc569fb0760769e2b`. Blob: `387fe89bf3cc95a2216251db919432ef7b0ddaeb`. UTF-8 bytes [5882, 5931).

```typescript
private errorHandler: ErrorHandler = errorHandler
```

</details>

<a id="evidence-d19ca748f1302f0092f3bbbc30148d3c2d835f99f407db8e27802045d7c85b69"></a>

<details>
<summary>src/hono-base.ts:401–406</summary>

Evidence: `evidence:d19ca748f1302f0092f3bbbc30148d3c2d835f99f407db8e27802045d7c85b69`. Blob: `387fe89bf3cc95a2216251db919432ef7b0ddaeb`. UTF-8 bytes [12031, 12199).

```typescript
#handleError(err: unknown, c: Context<E>): Response | Promise<Response> {
    if (err instanceof Error) {
      return this.errorHandler(err, c)
    }
    throw err
  }
```

</details>

<a id="evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2"></a>

<details>
<summary>src/hono-base.ts:408–468</summary>

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

</details>

<a id="evidence-d973f31095c0885ec6968e6dfe05b9be07c8109174fa09d64d9941765210c070"></a>

<details>
<summary>src/hono-base.ts:481–487</summary>

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

</details>

<a id="report-details"></a>

## Report details

<details>
<summary>Source, coverage, and record details</summary>

Transport: **recorded-replay**. Producer: Codex source\-reading session. Model: not recorded.

Origin: model inference. Claim support: unreviewed. Acceptance: proposed.

Presentation: authored; unreviewed. Citation checks establish reference integrity, not English entailment.

Semantic artifact: `semantic:3b600ce62677cd56b9d3172a4cd2841f739dd41effc439a2d27acbb230142d56`. Snapshot: `sha256:830729e39b7bcef4322bb641057509cc302f2ab598f998f37c370bc883f14eb9`. Structural scan: `scan:fb8827cf671eeb148410a7e6967bb3025665851e64ae359a7bad515b72855f93`.

Scope: src/compose\.ts, src/context\.ts, src/hono\-base\.ts. 11 excerpts supplied; 1731 other structural evidence records omitted.

Source scan: 25/25 selected files parsed; 0 failed; 10 support files.

Flow entries: [Select dispatch method](#step-fdc5198f-dec9-4c31-a00f-59b930e9e076)

### Entry points

- fetch in src/hono\-base\.ts
- \#dispatch in src/hono\-base\.ts

### Related state and components

- Request dispatcher — implements → Dispatch an incoming request [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
- Dispatch an incoming request — invokes → Compose middleware [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/compose\.ts:15](#evidence-f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370)
- Dispatch an incoming request — reads → Response and finalization state [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2)
- Dispatch an incoming request — writes → Response and finalization state [src/hono\-base\.ts:408](#evidence-98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2), [src/context\.ts:414](#evidence-aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5)

### Source diagnostics

- EXTERNAL\_TYPES\_UNAVAILABLE: Source\-only mode does not load ambient type packages: node

</details>
