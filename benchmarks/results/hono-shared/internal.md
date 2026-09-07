# Inspect the internal representation

Partial repository view. Recorded recorded-replay. Claim support needs independent review. Acceptance: proposed. Source rechecked in this walkthrough: true.

Artifact: `semantic:879ce0fdb5dee3f6f406bfa87e28f0d2f48b65fb58026479f9172bbd54b8c3f0`. Snapshot: `sha256:830729e39b7bcef4322bb641057509cc302f2ab598f998f37c370bc883f14eb9`.

## 1. Choose a capability

Match an incoming request, choose the single\-handler or composition path, and produce a response while preserving their different fallback and error behavior\.

```bash
node dist/cli/main.js inspect semantic.json
```

<details>
<summary>Open canonical record</summary>

```json
{
  "id": "concept:3dc48efa-feb5-4f6c-bd6a-4a954b6b8cc8",
  "title": "Dispatch an incoming request"
}
```

</details>

## 2. Inspect a behavior

Conditions select outcomes\. The function links below show participation, not observed call order\.

```bash
node dist/cli/main.js inspect semantic.json --id 'behavior:252223db-4880-4aca-b951-6070c8f7e4c6'
```

<details>
<summary>Open canonical record</summary>

```json
{
  "alias": "response-selection",
  "capability_id": "concept:3dc48efa-feb5-4f6c-bd6a-4a954b6b8cc8",
  "constraint_claim_ids": [
    "claim:5b606765-089d-4722-8213-b675dde66bf5",
    "claim:d543fd57-c7cb-4a8b-9078-fc6050980cf1",
    "claim:f360cf06-1fc5-4b71-891d-37fdddbfeaa4"
  ],
  "failures": [
    {
      "claim_ids": [
        "claim:3a465dfd-a823-4297-a867-dc7b31edd393",
        "claim:6b5a8b30-ea42-46e9-880d-53099dbe6c56"
      ],
      "condition": "The direct handler throws or its Promise chain rejects.",
      "destination_id": "function:0ae4f7fa-8fab-4114-b656-e0c4a210b97e"
    },
    {
      "claim_ids": [
        "claim:bf2950af-c55d-401a-9691-50acf819a3f2"
      ],
      "condition": "The direct nullish fallback throws synchronously.",
      "destination_id": null
    },
    {
      "claim_ids": [
        "claim:b962178a-0e5d-4e27-a698-38b48e7fdd3a",
        "claim:7af68846-ae57-44cd-8e06-49e5596a226b"
      ],
      "condition": "Composition fails or returns unfinalized context.",
      "destination_id": "function:0ae4f7fa-8fab-4114-b656-e0c4a210b97e"
    },
    {
      "claim_ids": [
        "claim:f5f65ad6-ca98-41d8-95dd-293ac83d5f15",
        "claim:fc07b7ac-e50a-4c46-8293-6c36dcbfbbdb"
      ],
      "condition": "The error callback fails or the error value is not an Error.",
      "destination_id": null
    }
  ],
  "flow_id": "flow:92594364-a09b-413c-8fed-145a8f64789c",
  "function_ids": [
    "function:066fbdc1-2b42-4637-b456-7e8f96224eb4",
    "function:05c0f3fe-c675-4fc7-a1ef-4028fad0ac09",
    "function:94ab9b66-e4ca-4f2d-83ce-ab7711ff65da",
    "function:c14693d1-3c79-4916-a155-6c5fd1f91121",
    "function:379c4b0e-13f0-4689-aa90-c2c2d12abb62",
    "function:e4635ca2-ec40-4091-ad54-7be94f4c32ba",
    "function:9cb45f6c-5651-4587-89b1-acc02a5e7fb3",
    "function:0ae4f7fa-8fab-4114-b656-e0c4a210b97e"
  ],
  "id": "behavior:252223db-4880-4aca-b951-6070c8f7e4c6",
  "outcomes": [
    {
      "claim_ids": [
        "claim:5b606765-089d-4722-8213-b675dde66bf5"
      ],
      "condition": "A direct non-Promise result is non-nullish."
    },
    {
      "claim_ids": [
        "claim:abe1d0e6-876f-40a3-b8e1-aac696dd56f5"
      ],
      "condition": "A direct non-Promise result is null or undefined."
    },
    {
      "claim_ids": [
        "claim:32832fda-23d3-411c-8392-6782b3634057"
      ],
      "condition": "A returned Promise resolves to a truthy value."
    },
    {
      "claim_ids": [
        "claim:876a95e6-ca91-46c2-b831-60091068b69d"
      ],
      "condition": "A returned Promise resolves to a falsy value and c.finalized is truthy."
    },
    {
      "claim_ids": [
        "claim:876a95e6-ca91-46c2-b831-60091068b69d"
      ],
      "condition": "A returned Promise resolves to a falsy value and c.finalized is falsy."
    },
    {
      "claim_ids": [
        "claim:7ce9d699-11e2-481a-866e-c1e4356ea24d"
      ],
      "condition": "The composed path completes with finalized context."
    },
    {
      "claim_ids": [
        "claim:6f5292fe-ce44-4891-9436-47ae3462ead0",
        "claim:161b91b9-a49b-44d3-a919-0758464c5af3"
      ],
      "condition": "The res getter creates storage before finalization."
    },
    {
      "claim_ids": [
        "claim:1d2eae5b-efd0-4237-8671-50d5055dafe0",
        "claim:d543fd57-c7cb-4a8b-9078-fc6050980cf1"
      ],
      "condition": "The setter receives undefined."
    }
  ],
  "state_ids": [
    "concept:15b53c40-cf7c-454c-bdab-3c1d77c4f3e3"
  ],
  "step_ids": [
    "step:cdf57463-13f7-4ae8-9709-ea1462e942d2",
    "step:7539d22f-ed85-48df-bba7-ca69334adb90",
    "step:6f7b0430-e901-4ab6-9a3d-b088f2b012e8",
    "step:bd8c16b3-f9f9-4211-93a8-0cfd6fdef1f3",
    "step:4ccc4676-c52d-4d20-ab3d-7578bfedcda6",
    "step:6e269ade-b6c0-4442-8553-6445a5fbbb6e",
    "step:78c04a66-b80a-4358-8b55-58a8d1523e29",
    "step:95622008-6e00-4397-9d3b-37cf7633368e"
  ],
  "title": "Select a direct, Promise, or composed response",
  "trigger_claim_ids": [
    "claim:3c7751cc-3137-4636-a809-aa2a0ee43c9e",
    "claim:3ebf7dad-d613-4994-9e9e-f59bb1d79317",
    "claim:2639197b-bb38-4ed2-9817-07e369a77759"
  ],
  "unknown_ids": [
    "unknown:eba96660-bcf1-4b91-9e5c-49c5d2765a07",
    "unknown:362e87d4-167a-44b9-ae6b-7bfa50ab3bc2",
    "unknown:a3c78386-5043-4a92-92dc-a230cd2fa4c4"
  ]
}
```

</details>

## 3. Follow a function and shared state

This contract links assertions to inputs, outputs, state access, effects, failures, and unknowns\.

```bash
node dist/cli/main.js inspect semantic.json --id 'function:e4635ca2-ec40-4091-ad54-7be94f4c32ba'
```

<details>
<summary>Open canonical record</summary>

```json
{
  "alias": "context-res-getter",
  "assumption_claim_ids": [
    "claim:a6cc6269-0179-4714-a6d7-a690685fd58b"
  ],
  "component_id": "concept:1059d122-27e1-4689-81d8-84ada5d0c552",
  "dependencies": [
    {
      "claim_ids": [
        "claim:161b91b9-a49b-44d3-a919-0758464c5af3"
      ],
      "target_id": "concept:c68fea43-9e8c-44d2-b4de-c811f639da91"
    }
  ],
  "effect_claim_ids": [],
  "failures": [],
  "id": "function:e4635ca2-ec40-4091-ad54-7be94f4c32ba",
  "implementation_id": "callable:4f44eeb5e2a1168be0972e63827737a9f729b7949b44f1ef37d5b61b5146ab13",
  "input_claim_ids": [
    "claim:8099fdae-3db1-47b0-b324-6d527a067dd6"
  ],
  "output_claim_ids": [
    "claim:161b91b9-a49b-44d3-a919-0758464c5af3"
  ],
  "role": "getter",
  "state_access": [
    {
      "claim_ids": [
        "claim:161b91b9-a49b-44d3-a919-0758464c5af3",
        "claim:8099fdae-3db1-47b0-b324-6d527a067dd6"
      ],
      "mode": "read-write",
      "state_id": "concept:15b53c40-cf7c-454c-bdab-3c1d77c4f3e3"
    }
  ],
  "title": "Context.res getter",
  "unknown_ids": [
    "unknown:f193b7f6-8caf-48c5-a3ef-a5b459f57a8e"
  ]
}
```

</details>

## 4. Check an assertion against source

The res getter lazily creates response storage with prepared headers; the getter itself does not set finalized\.

```bash
node dist/cli/main.js evidence scan.json --repository repo --id 'evidence:efdc8a49582842d74bb72cf074179c4f18d4dc3a0f2d25c8ab366eb8630282b1'
```

<details>
<summary>Open canonical record</summary>

```json
{
  "category": "state",
  "evidence_ids": [
    "evidence:efdc8a49582842d74bb72cf074179c4f18d4dc3a0f2d25c8ab366eb8630282b1"
  ],
  "id": "claim:161b91b9-a49b-44d3-a919-0758464c5af3",
  "subject_ids": [
    "concept:3dc48efa-feb5-4f6c-bd6a-4a954b6b8cc8"
  ],
  "text": "The res getter lazily creates response storage with prepared headers; the getter itself does not set finalized."
}
```

</details>

## 5. Export bounded context

91857 UTF\-8 bytes\. Required rules and critical unknowns remain in the selection\. Extra source text is retrieved separately\.

```bash
node dist/cli/main.js context semantic.json --behavior 'behavior:252223db-4880-4aca-b951-6070c8f7e4c6' --max-bytes 131072 --no-neighbors
```

<details>
<summary>Open canonical record</summary>

```json
{
  "budget": {
    "max_bytes": 131072,
    "required_bytes": 91857,
    "serialization": "compact-json-utf8-with-newline",
    "used_bytes": 91857
  },
  "omissions": {
    "evidence_ids": [
      "evidence:3964d7755fbe93590183216380561fc4f6cf9eed1f24e7cd81b0943a88034107",
      "evidence:50e79ea172dc01947732e6a2fefd65b67b5c28d7dee03948f5ad30474ea840ab"
    ],
    "reason": "Outside the required selection or excluded by the optional-neighbor byte budget; retrieve by ID.",
    "record_ids": [
      "behavior:23db580d-4b14-4e4d-9176-ffaca2c65853",
      "behavior:42d63d87-e608-4e10-b671-fa0db39ad2f2",
      "behavior:ba3e06c3-f41a-40e3-9419-b871a1776622",
      "callable:0c92bfbcf577ee585a33b59ecfad20783424f010f2f66795807babd313346fd5",
      "callable:35916625b809eda56bed488242f4178abaa16b1b28818f568044429773ce4e4e",
      "callable:554aad78ea5cfa1e20c08ec22d85dfc77c782bdbb04a95db941ddfa73011244a",
      "callable:7b70f6f5a266109b236aed5d45ac943a832ab791df0ee3d4505bcb64c4801184",
      "callable:d99860f55b8279c297c6f5a9583e12385a287fc1ce3c8d4ee0f9004d5e6411ff",
      "claim:5e705c38-4dd9-4e55-be1b-2f016881b2bd",
      "claim:75a7f499-e2f0-4998-89a5-48c6456d3bab",
      "claim:d5dd3300-e498-4ec8-b548-9d8308c15576",
      "concept:adc95999-3d01-44d8-bf5e-72a3ca87c192",
      "flow:4c89dd94-0517-4c63-ab11-eb934e238885",
      "function:01860b94-d1f5-4de4-a585-e2c80ae4c52e",
      "function:49d6bd1e-9aaf-4234-8f34-2aa0011e86b4",
      "function:d4b105fc-0419-4a56-a19c-5d02dce157e5",
      "function:e8579b0c-8859-4dec-9c87-cf458c481a23",
      "function:f8b2cf93-7b1f-40fe-9098-9395af4a53ef",
      "symbol:02e7163508d54f0cb030fb14d19f1b3082d09c166ccf7209bdc05989c51079ae",
      "symbol:06cb4cba3d73d25c7103fcdf209c42d92a1ba002ccb6c9cc7708522f16c4934b",
      "symbol:0f5a21d1158bab8384d7af0cd4098ee4dd7880445fb421b05ba6c59df03cb79c",
      "symbol:0f631f92f0d828f41cba5b906d55efd96d1ffc130404c04adc8bb24bed21fca1",
      "symbol:10bac3c8f082994d95cf5952085076222011d57c25be4751d977cb8cd232d4e3",
      "symbol:131008e982adccb91b12f2111eb2e21c8be0e5d49f7e2df0e6ca82d4b260f5e5",
      "symbol:18844f066bb907a267ab3017c4bd49553515c81f19dd4af564ac98d810b3e270",
      "symbol:1a29b29a6a2c05a5c794068d529cb1b9732a6e01cb08f32b81733984bf464cd7",
      "symbol:1b5ae62c4d5b051c01302fab2290f90c32c9326dfa9ffc586e317bcffa713207",
      "symbol:1b98b2ea3163934bb5f756d371f7649304590f646a28bd56710e628694763484",
      "symbol:1bb82709f8b91f7424cbab6d809b861d4085d887af0b2a2390de788712cebe2c",
      "symbol:1cf5a416c6b80753e425702cfa69a03839267cfc0e50761285333697980b0b30",
      "symbol:24e015ab06f2a1efb01b9fae0f204bc5c9d37681c131763bbdd91f5127433ee1",
      "symbol:2efb0979ef1d8765c1da785752690db311c46da930a50f96bf96aecb2b4bf1b7",
      "symbol:31b1019f39b7f70f58796706a2ce0986b6fded7fc1e6084ee50dfc1dff295688",
      "symbol:39ee33f1c31752afc1dd96952e3e6addbc74731c2eae946811388d3421504be9",
      "symbol:42711e27cc9d4fc9c95be0e1690698f67604921c8aaa448d03605be0309c79a4",
      "symbol:4896f210bd8bfcc7630cea491f49b914b003a52d71f7cf089125d87fbf820329",
      "symbol:4cda572028bee7e52290fd7d407f490222185c7768d677b3e655b5657f0e5a7a",
      "symbol:51630fdf52afaf688b09659f7599a9e02d3aa3158aaeec5ae6e3666653fdc6b9",
      "symbol:52d37101cf13ae9bc73be5af92a02eae5cbf79154de9cdee1cd5f4cc830aa018",
      "symbol:566877bf311a3ace5a001af156c8575a9f4950ca8c969c60f49b3b201def2aa7",
      "symbol:577c848c3d6a36747eaf3a5f26319107bd68dde51b57e6b324f88a6fc20c2433",
      "symbol:61fec79007bf74399071fd055dc38905b37e9d474e196199f715f44340e276d2",
      "symbol:6525f76796afa4b4c68bb242a4cc66470db5449b385ad974df1ce69a79e8ecbe",
      "symbol:6d57ef3078b743016971a0136b5abc97c10628fbf540f31b1aa9da69a6011254",
      "symbol:703d3db77644daf2de263f3859823dfbf9f8195d8223b572af898fa1ca46d7c1",
      "symbol:75563077719290362cad3bd925cd086dddc6a2e1b054c708496963fe1ce95545",
      "symbol:92ba14707c073c014c511895f6932780c23efe1b34c4e57dc5b9a27cd784ec84",
      "symbol:945f5f1ed79c8ad06adda10b7955a7abef55c540f5b7b0feeab246ba699b9bcc",
      "symbol:9e6690bb5afbadb6d498b6bb5ef406f2e8b9d1501289689de297f6a06c51bec3",
      "symbol:9fbd49b25d65890d944d652439dc2b3441c67e41973b4636cb25c3be4393db31",
      "symbol:a5c17aa61819e4e2ff27553ed8209d931abfcc7e497c1cb64243b042cd1d9f62",
      "symbol:a6ba2d58ccf74498d35f109a4e21f7ca516891ddc6a26f8e996cfd8c4f7cf077",
      "symbol:b18c63a41ababc793bb941f30b7e6072d503cc171e8a3326d5161b346cbee2a1",
      "symbol:b57d4285d21a9194489f34671ab9c78fc087486926c110a870264e9cc0ffc207",
      "symbol:b9d94a6130f1a82b16c84d15c9c245cf1c6d66c2feb12ce9d9f469704a2a6abd",
      "symbol:ba310d9c9bf7a0c2d7e24e38027783f800bcfd048d6179888bd02d8bcadb17a3",
      "symbol:c28c73411f9365a90cb63f74e6faa3dd409532c557436621776aed31a8698160",
      "symbol:c40858a8d9e140049f60c8574835e6ff09dbc8984c6d8d288553b270df71c51e",
      "symbol:c7a7f04ea0f64a7d22bcb43f0ef67219d8f6d02fcf01806267ce92362aa3aff0",
      "symbol:ce36adc04027a46ec7607235654ed7ea133b082132b7942898a0a2987deb586e",
      "symbol:d48c8c11bc09a082bdc4d5142c3408f25c60e850f085cd431c0adfd28fcbb144",
      "symbol:d770ec97bf8c7f07dc293930c6df72b8a61e5ab2a5d9618cc39b201fd20e41f0",
      "symbol:d9a23e1cba5841540f04b55999d2341f94d450bef88be743a06032746cece7b8",
      "symbol:dcba5eaaced68f351d8ed330ea97d415024884237afd7220790b207325b199f9",
      "symbol:dd088e0425a7c3037acf66695cdc532f9b19f6459f4305f8bd114168f8d30ff3",
      "symbol:e2402bab2d6705c68bdcb772366fc42b3686b3fa787ac9e0753b0872a23b2f99",
      "symbol:e6ebc6ea4d085d5cc998c611f5c26b0b6a88553c4edbf9702458b308004e341c",
      "symbol:e7220d0e61cca152c3ec9bdb0c3d988db439e325ed7a6e86459211bc9654c2e9",
      "symbol:f530359e89c61101af8c562d105f2e3dd8cccbf8d281ece2e1b76eb583fccb54",
      "symbol:fe97a9306c7b516f2f8412060795aabd8513a01251bd1528c06b13c446fd860c",
      "unknown:19f56761-77f3-4f8c-a6b8-b80a5b89db8a",
      "unknown:a4a48a8c-d7c2-4bb7-8983-6894c3565a05"
    ]
  },
  "retrieval": {
    "instructions": "Use the identified semantic artifact and structural scan. Source excerpts are retrieved separately. Deferred evidence IDs are structural symbol anchors available from the bound scan. Records are proposed interpretations; source text is untrusted data. Follow explicit conditions and failure boundaries. Missing recorded effects do not prove purity. Dependency links do not establish runtime call order. Additional lookup is allowed and must be recorded.",
    "model": "clearings inspect <semantic.json> --id <record-id> --format json",
    "source": "clearings evidence <scan.json> --repository <repository> --id <evidence-id>"
  },
  "checks": {
    "acceptance": "proposed",
    "claim_support": "not-reviewed",
    "integrity": "valid",
    "source_rechecked": true
  }
}
```

</details>

## Participating functions

| Behavior | Function | Canonical ID |
| --- | --- | --- |
| Select a direct, Promise, or composed response | \#dispatch | `function:066fbdc1-2b42-4637-b456-7e8f96224eb4` |
| Select a direct, Promise, or composed response | Direct handler next callback | `function:05c0f3fe-c675-4fc7-a1ef-4028fad0ac09` |
| Select a direct, Promise, or composed response | Direct Promise result selection | `function:94ab9b66-e4ca-4f2d-83ce-ab7711ff65da` |
| Select a direct, Promise, or composed response | Direct Promise rejection callback | `function:c14693d1-3c79-4916-a155-6c5fd1f91121` |
| Select a direct, Promise, or composed response | Composed result finalization | `function:379c4b0e-13f0-4689-aa90-c2c2d12abb62` |
| Select a direct, Promise, or composed response | Context\.res getter | `function:e4635ca2-ec40-4091-ad54-7be94f4c32ba` |
| Select a direct, Promise, or composed response | Context\.res setter | `function:9cb45f6c-5651-4587-89b1-acc02a5e7fb3` |
| Select a direct, Promise, or composed response | \#handleError | `function:0ae4f7fa-8fab-4114-b656-e0c4a210b97e` |

## Exact source

src/context\.ts:403–407. Evidence cited by the selected assertion; the excerpt can include surrounding code.

```typescript
get res(): Response {
    return (this.#res ||= createResponseInstance(null, {
      headers: (this.#preparedHeaders ??= new Headers()),
    }))
  }
```

## Reproduce the inspection

The adjacent walkthrough.json contains the actual query output and context selection. Commands assume model and scan files plus the pinned repository.

## Source license

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
