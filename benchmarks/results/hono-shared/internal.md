# Select the response after handler execution

Keep the direct, Promise, and composed fallback rules distinct\. This operation models the response source selected after the relevant handler phase; it does not execute a callback\.

Proposed source interpretation. 4 operations. Source hashes checked; source authenticity and claim support are not established.

Specification: `specification:2a3da76d0f0748656e8441dd546469ae4120f0593a837cb8e2a8fb22e0d3d251`.

## A concrete case

### A direct missing result calls not\-found even after finalization

Operation: `response-selection`. Scenario check: **pass**.

<details>
<summary>Open inputs, outcome, and checks</summary>

```json
{
  "observation": {
    "input": {
      "path": "direct",
      "value": "nullish"
    },
    "before": {
      "finalized": true
    },
    "outcome": "outcome:direct-missing",
    "output": "not-found"
  },
  "result": {
    "artifact_id": "specification:2a3da76d0f0748656e8441dd546469ae4120f0593a837cb8e2a8fb22e0d3d251",
    "operation_id": "response-selection",
    "perspective": "observed",
    "verdict": "pass",
    "applicable_outcome_ids": [
      "outcome:direct-missing"
    ],
    "uncertain_outcome_ids": [],
    "checks": [
      {
        "id": "outcome-condition",
        "description": "Call the not-found handler without consulting finalized.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:direct-missing",
        "description": "The selected response source is not-found.",
        "verdict": "pass",
        "reason": null
      }
    ],
    "limitations": [
      "Checks apply only to the supplied observation and modeled rules. Source implementation is not executed or proved.",
      "Behavior outside the modeled cases remains unspecified.",
      "Unrecorded state changes are not excluded by this partial frame.",
      "Unrecorded external effects are not excluded.",
      "analysis-limit: What if a handler or fallback throws instead of producing a result?",
      "analysis-limit: How is a Promise recognized?",
      "analysis-limit: Can external code put a non-boolean value in finalized?"
    ]
  }
}
```

</details>

### A direct non\-nullish falsy value is returned

Operation: `response-selection`. Scenario check: **pass**.

<details>
<summary>Open inputs, outcome, and checks</summary>

```json
{
  "observation": {
    "input": {
      "path": "direct",
      "value": "non-nullish-falsy"
    },
    "before": {
      "finalized": true
    },
    "outcome": "outcome:direct-value",
    "output": "handler-result"
  },
  "result": {
    "artifact_id": "specification:2a3da76d0f0748656e8441dd546469ae4120f0593a837cb8e2a8fb22e0d3d251",
    "operation_id": "response-selection",
    "perspective": "observed",
    "verdict": "pass",
    "applicable_outcome_ids": [
      "outcome:direct-value"
    ],
    "uncertain_outcome_ids": [],
    "checks": [
      {
        "id": "outcome-condition",
        "description": "Use the direct non-nullish result, including a falsy value.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:direct-value",
        "description": "The selected response source is handler-result.",
        "verdict": "pass",
        "reason": null
      }
    ],
    "limitations": [
      "Checks apply only to the supplied observation and modeled rules. Source implementation is not executed or proved.",
      "Behavior outside the modeled cases remains unspecified.",
      "Unrecorded state changes are not excluded by this partial frame.",
      "Unrecorded external effects are not excluded.",
      "analysis-limit: What if a handler or fallback throws instead of producing a result?",
      "analysis-limit: How is a Promise recognized?",
      "analysis-limit: Can external code put a non-boolean value in finalized?"
    ]
  }
}
```

</details>

### A Promise with a falsy value can use the finalized context

Operation: `response-selection`. Scenario check: **pass**.

<details>
<summary>Open inputs, outcome, and checks</summary>

```json
{
  "observation": {
    "input": {
      "path": "promise",
      "value": "nullish"
    },
    "before": {
      "finalized": true
    },
    "outcome": "outcome:promise-context",
    "output": "context-response"
  },
  "result": {
    "artifact_id": "specification:2a3da76d0f0748656e8441dd546469ae4120f0593a837cb8e2a8fb22e0d3d251",
    "operation_id": "response-selection",
    "perspective": "observed",
    "verdict": "pass",
    "applicable_outcome_ids": [
      "outcome:promise-context"
    ],
    "uncertain_outcome_ids": [],
    "checks": [
      {
        "id": "outcome-condition",
        "description": "Read the context response after a falsy resolution when finalized is true.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:promise-context",
        "description": "The selected response source is context-response.",
        "verdict": "pass",
        "reason": null
      }
    ],
    "limitations": [
      "Checks apply only to the supplied observation and modeled rules. Source implementation is not executed or proved.",
      "Behavior outside the modeled cases remains unspecified.",
      "Unrecorded state changes are not excluded by this partial frame.",
      "Unrecorded external effects are not excluded.",
      "analysis-limit: What if a handler or fallback throws instead of producing a result?",
      "analysis-limit: How is a Promise recognized?",
      "analysis-limit: Can external code put a non-boolean value in finalized?"
    ]
  }
}
```

</details>

### A Promise without a value or finalized context calls not\-found

Operation: `response-selection`. Scenario check: **pass**.

<details>
<summary>Open inputs, outcome, and checks</summary>

```json
{
  "observation": {
    "input": {
      "path": "promise",
      "value": "nullish"
    },
    "before": {
      "finalized": false
    },
    "outcome": "outcome:promise-missing",
    "output": "not-found"
  },
  "result": {
    "artifact_id": "specification:2a3da76d0f0748656e8441dd546469ae4120f0593a837cb8e2a8fb22e0d3d251",
    "operation_id": "response-selection",
    "perspective": "observed",
    "verdict": "pass",
    "applicable_outcome_ids": [
      "outcome:promise-missing"
    ],
    "uncertain_outcome_ids": [],
    "checks": [
      {
        "id": "outcome-condition",
        "description": "Call not-found after a falsy resolution when finalized is false.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:promise-missing",
        "description": "The selected response source is not-found.",
        "verdict": "pass",
        "reason": null
      }
    ],
    "limitations": [
      "Checks apply only to the supplied observation and modeled rules. Source implementation is not executed or proved.",
      "Behavior outside the modeled cases remains unspecified.",
      "Unrecorded state changes are not excluded by this partial frame.",
      "Unrecorded external effects are not excluded.",
      "analysis-limit: What if a handler or fallback throws instead of producing a result?",
      "analysis-limit: How is a Promise recognized?",
      "analysis-limit: Can external code put a non-boolean value in finalized?"
    ]
  }
}
```

</details>

### A truthy Promise value wins

Operation: `response-selection`. Scenario check: **pass**.

<details>
<summary>Open inputs, outcome, and checks</summary>

```json
{
  "observation": {
    "input": {
      "path": "promise",
      "value": "truthy"
    },
    "before": {
      "finalized": false
    },
    "outcome": "outcome:promise-value",
    "output": "handler-result"
  },
  "result": {
    "artifact_id": "specification:2a3da76d0f0748656e8441dd546469ae4120f0593a837cb8e2a8fb22e0d3d251",
    "operation_id": "response-selection",
    "perspective": "observed",
    "verdict": "pass",
    "applicable_outcome_ids": [
      "outcome:promise-value"
    ],
    "uncertain_outcome_ids": [],
    "checks": [
      {
        "id": "outcome-condition",
        "description": "Use the truthy resolved Promise value.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:promise-value",
        "description": "The selected response source is handler-result.",
        "verdict": "pass",
        "reason": null
      }
    ],
    "limitations": [
      "Checks apply only to the supplied observation and modeled rules. Source implementation is not executed or proved.",
      "Behavior outside the modeled cases remains unspecified.",
      "Unrecorded state changes are not excluded by this partial frame.",
      "Unrecorded external effects are not excluded.",
      "analysis-limit: What if a handler or fallback throws instead of producing a result?",
      "analysis-limit: How is a Promise recognized?",
      "analysis-limit: Can external code put a non-boolean value in finalized?"
    ]
  }
}
```

</details>

### Composed execution needs finalization

Operation: `response-selection`. Scenario check: **pass**.

<details>
<summary>Open inputs, outcome, and checks</summary>

```json
{
  "observation": {
    "input": {
      "path": "composed",
      "value": "truthy"
    },
    "before": {
      "finalized": false
    },
    "outcome": "outcome:composed-unfinalized",
    "output": "finalization-error"
  },
  "result": {
    "artifact_id": "specification:2a3da76d0f0748656e8441dd546469ae4120f0593a837cb8e2a8fb22e0d3d251",
    "operation_id": "response-selection",
    "perspective": "observed",
    "verdict": "pass",
    "applicable_outcome_ids": [
      "outcome:composed-unfinalized"
    ],
    "uncertain_outcome_ids": [],
    "checks": [
      {
        "id": "outcome-condition",
        "description": "Raise the finalization error inside the composed application catch boundary.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:composed-unfinalized",
        "description": "The selected response source is finalization-error.",
        "verdict": "pass",
        "reason": null
      }
    ],
    "limitations": [
      "Checks apply only to the supplied observation and modeled rules. Source implementation is not executed or proved.",
      "Behavior outside the modeled cases remains unspecified.",
      "Unrecorded state changes are not excluded by this partial frame.",
      "Unrecorded external effects are not excluded.",
      "analysis-limit: What if a handler or fallback throws instead of producing a result?",
      "analysis-limit: How is a Promise recognized?",
      "analysis-limit: Can external code put a non-boolean value in finalized?"
    ]
  }
}
```

</details>

### Reading missing response storage does not finalize the context

Operation: `read-response`. Scenario check: **pass**.

<details>
<summary>Open inputs, outcome, and checks</summary>

```json
{
  "observation": {
    "input": {},
    "before": {
      "finalized": false,
      "response-present": false
    },
    "after": {
      "finalized": false,
      "response-present": true
    },
    "outcome": "outcome:get-create",
    "output": "created-response"
  },
  "result": {
    "artifact_id": "specification:2a3da76d0f0748656e8441dd546469ae4120f0593a837cb8e2a8fb22e0d3d251",
    "operation_id": "read-response",
    "perspective": "observed",
    "verdict": "pass",
    "applicable_outcome_ids": [
      "outcome:get-create"
    ],
    "uncertain_outcome_ids": [],
    "checks": [
      {
        "id": "rule:get-finalized",
        "description": "The getter leaves finalized unchanged.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:get-storage",
        "description": "Successful reading leaves response storage present.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "outcome-condition",
        "description": "Initialize response storage and return it.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:get-create",
        "description": "Select the created response.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "update:response-present",
        "description": "Update response-present as specified.",
        "verdict": "pass",
        "reason": null
      }
    ],
    "limitations": [
      "Checks apply only to the supplied observation and modeled rules. Source implementation is not executed or proved.",
      "Behavior outside the modeled cases remains unspecified.",
      "Unrecorded state changes are not excluded by this partial frame.",
      "Unrecorded external effects are not excluded.",
      "analysis-limit: What happens inside unmodeled callbacks or platform helpers?"
    ]
  }
}
```

</details>

### An undefined setter assignment can finalize without response storage

Operation: `store-response`. Scenario check: **pass**.

<details>
<summary>Open inputs, outcome, and checks</summary>

```json
{
  "observation": {
    "input": {
      "assigned": "undefined",
      "merge_succeeds": true
    },
    "before": {
      "finalized": false,
      "response-present": false
    },
    "after": {
      "finalized": true,
      "response-present": false
    },
    "outcome": "outcome:set-success",
    "output": "stored"
  },
  "result": {
    "artifact_id": "specification:2a3da76d0f0748656e8441dd546469ae4120f0593a837cb8e2a8fb22e0d3d251",
    "operation_id": "store-response",
    "perspective": "observed",
    "verdict": "pass",
    "applicable_outcome_ids": [
      "outcome:set-success"
    ],
    "uncertain_outcome_ids": [],
    "checks": [
      {
        "id": "outcome-condition",
        "description": "Store the assignment and finalize.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:set-result",
        "description": "The setter completes.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "update:finalized",
        "description": "Update finalized as specified.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "update:response-present",
        "description": "Update response-present as specified.",
        "verdict": "pass",
        "reason": null
      }
    ],
    "limitations": [
      "Checks apply only to the supplied observation and modeled rules. Source implementation is not executed or proved.",
      "Behavior outside the modeled cases remains unspecified.",
      "Unrecorded state changes are not excluded by this partial frame.",
      "Unrecorded external effects are not excluded.",
      "analysis-limit: What changes during header merging?"
    ]
  }
}
```

</details>

### An error\-handler result can replace a finalized response

Operation: `middleware-result`. Scenario check: **pass**.

<details>
<summary>Open inputs, outcome, and checks</summary>

```json
{
  "observation": {
    "input": {
      "truthy_result": true,
      "error_result": true
    },
    "before": {
      "finalized": true
    },
    "outcome": "outcome:middleware-assign",
    "output": "assign"
  },
  "result": {
    "artifact_id": "specification:2a3da76d0f0748656e8441dd546469ae4120f0593a837cb8e2a8fb22e0d3d251",
    "operation_id": "middleware-result",
    "perspective": "observed",
    "verdict": "pass",
    "applicable_outcome_ids": [
      "outcome:middleware-assign"
    ],
    "uncertain_outcome_ids": [],
    "checks": [
      {
        "id": "outcome-condition",
        "description": "Assign the result through Context.res.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:middleware-assign",
        "description": "Choose assignment.",
        "verdict": "pass",
        "reason": null
      }
    ],
    "limitations": [
      "Checks apply only to the supplied observation and modeled rules. Source implementation is not executed or proved.",
      "Behavior outside the modeled cases remains unspecified.",
      "Unrecorded state changes are not excluded by this partial frame.",
      "Unrecorded external effects are not excluded.",
      "analysis-limit: What happens inside unmodeled callbacks or platform helpers?"
    ]
  }
}
```

</details>

## State used by these rules

| State | Type | Meaning |
| --- | --- | --- |
| Context finalized flag | boolean | A separate boolean from response storage\. Getter initialization does not establish finalization\. |
| Response storage exists | boolean | Whether Context private response storage contains a response\. |

<a id="record-726573706f6e73652d73656c656374696f6e"></a>
## Select the response after handler execution

Keep the direct, Promise, and composed fallback rules distinct\. This operation models the response source selected after the relevant handler phase; it does not execute a callback\.

| Condition | Outcome | Required result |
| --- | --- | --- |
| \(input\.path = &quot;direct&quot;\) and \(not \(input\.value = &quot;nullish&quot;\)\) | Use the direct non\-nullish result, including a falsy value\. | The selected response source is handler\-result\. |
| \(input\.path = &quot;direct&quot;\) and \(input\.value = &quot;nullish&quot;\) | Call the not\-found handler without consulting finalized\. | The selected response source is not\-found\. |
| \(input\.path = &quot;promise&quot;\) and \(input\.value = &quot;truthy&quot;\) | Use the truthy resolved Promise value\. | The selected response source is handler\-result\. |
| \(input\.path = &quot;promise&quot;\) and \(not \(input\.value = &quot;truthy&quot;\)\) and \(before\.finalized\) | Read the context response after a falsy resolution when finalized is true\. | The selected response source is context\-response\. |
| \(input\.path = &quot;promise&quot;\) and \(not \(input\.value = &quot;truthy&quot;\)\) and \(not \(before\.finalized\)\) | Call not\-found after a falsy resolution when finalized is false\. | The selected response source is not\-found\. |
| \(input\.path = &quot;composed&quot;\) and \(before\.finalized\) | Read the context response after successful composed execution with finalized context\. | The selected response source is context\-response\. |
| \(input\.path = &quot;composed&quot;\) and \(not \(before\.finalized\)\) | Raise the finalization error inside the composed application catch boundary\. | The selected response source is finalization\-error\. |


| Implementation | Responsibility |
| --- | --- |
| \#dispatch | Choose the direct or composed path and apply that path’s response and failure rules\. |
| Direct Promise result callback | Choose the resolved value, finalized context response, or not\-found fallback\. |
| Composed result finalization | Require finalized context before returning Context\.res; the surrounding catch handles the finalization error\. |
| Direct handler next callback | Call not\-found and assign its awaited result through Context\.res\. |
| Direct Promise rejection callback | Pass rejection to \#handleError\. |
| \#handleError | Pass Error instances to the configured error handler and propagate other thrown values\. |

- **analysis-limit:** What if a handler or fallback throws instead of producing a result? The typed table starts after successful handler execution\. The direct not\-found call is outside the local handler catch\. Promise rejection and composed failures have different boundaries; see the attached source\.
- **analysis-limit:** How is a Promise recognized? The source uses instanceof Promise\. The path input represents that classification; this model does not classify arbitrary thenables\.
- **analysis-limit:** Can external code put a non\-boolean value in finalized? The scenarios model the declared boolean state\. Arbitrary external mutation is outside this scope\.

<details>
<summary>Types, state, effects, and exact rules</summary>

```json
{
  "alias": "response-selection",
  "coverage": "partial",
  "decisions": [
    {
      "blocking": false,
      "consequence": "The typed table starts after successful handler execution. The direct not-found call is outside the local handler catch. Promise rejection and composed failures have different boundaries; see the attached source.",
      "disposition": "analysis-limit",
      "evidence_ids": [],
      "id": "decision:dispatch-boundary",
      "question": "What if a handler or fallback throws instead of producing a result?"
    },
    {
      "blocking": false,
      "consequence": "The source uses instanceof Promise. The path input represents that classification; this model does not classify arbitrary thenables.",
      "disposition": "analysis-limit",
      "evidence_ids": [],
      "id": "decision:promise-classification",
      "question": "How is a Promise recognized?"
    },
    {
      "blocking": false,
      "consequence": "The scenarios model the declared boolean state. Arbitrary external mutation is outside this scope.",
      "disposition": "analysis-limit",
      "evidence_ids": [],
      "id": "decision:finalized-domain",
      "question": "Can external code put a non-boolean value in finalized?"
    }
  ],
  "dependencies": [
    {
      "kind": "uses-contract",
      "operation_id": "read-response",
      "requirement": "required",
      "role": "Read or initialize response storage only when the chosen path uses Context.res."
    },
    {
      "kind": "uses-contract",
      "operation_id": "store-response",
      "requirement": "required",
      "role": "Explain the setter that establishes finalization; it is supporting behavior, not an unconditional next call."
    },
    {
      "kind": "uses-contract",
      "operation_id": "middleware-result",
      "requirement": "required",
      "role": "Explain when composition assigns a handler or error result."
    }
  ],
  "effects": {
    "allowed": [],
    "completeness": "partial"
  },
  "evidence_ids": [
    "evidence:98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2",
    "source:hono-license"
  ],
  "frame": "partial",
  "guarantees": [],
  "id": "response-selection",
  "implementations": [
    {
      "evidence_ids": [
        "evidence:98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2"
      ],
      "name": "#dispatch",
      "responsibility": "Choose the direct or composed path and apply that path’s response and failure rules.",
      "symbol_id": null
    },
    {
      "evidence_ids": [
        "evidence:98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2"
      ],
      "name": "Direct Promise result callback",
      "responsibility": "Choose the resolved value, finalized context response, or not-found fallback.",
      "symbol_id": null
    },
    {
      "evidence_ids": [
        "evidence:98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2"
      ],
      "name": "Composed result finalization",
      "responsibility": "Require finalized context before returning Context.res; the surrounding catch handles the finalization error.",
      "symbol_id": null
    },
    {
      "evidence_ids": [
        "evidence:98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2"
      ],
      "name": "Direct handler next callback",
      "responsibility": "Call not-found and assign its awaited result through Context.res.",
      "symbol_id": null
    },
    {
      "evidence_ids": [
        "evidence:98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2"
      ],
      "name": "Direct Promise rejection callback",
      "responsibility": "Pass rejection to #handleError.",
      "symbol_id": null
    },
    {
      "evidence_ids": [
        "evidence:d19ca748f1302f0092f3bbbc30148d3c2d835f99f407db8e27802045d7c85b69"
      ],
      "name": "#handleError",
      "responsibility": "Pass Error instances to the configured error handler and propagate other thrown values.",
      "symbol_id": null
    }
  ],
  "inputs": {
    "path": {
      "kind": "enum",
      "values": [
        "direct",
        "promise",
        "composed"
      ]
    },
    "value": {
      "kind": "enum",
      "values": [
        "truthy",
        "non-nullish-falsy",
        "nullish"
      ]
    }
  },
  "name": "Select the response after handler execution",
  "outcome_policy": "exclusive",
  "outcomes": [
    {
      "description": "Use the direct non-nullish result, including a falsy value.",
      "effects": [],
      "ensures": [
        {
          "description": "The selected response source is handler-result.",
          "evidence_ids": [
            "evidence:98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2"
          ],
          "id": "rule:direct-value",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [],
              "root": "output"
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": "handler-result"
            }
          }
        }
      ],
      "evidence_ids": [
        "evidence:98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2"
      ],
      "id": "outcome:direct-value",
      "transitions": [],
      "updates": [],
      "when": {
        "kind": "all",
        "terms": [
          {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [
                "path"
              ],
              "root": "input"
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": "direct"
            }
          },
          {
            "kind": "not",
            "value": {
              "kind": "compare",
              "left": {
                "kind": "ref",
                "path": [
                  "value"
                ],
                "root": "input"
              },
              "op": "eq",
              "right": {
                "kind": "literal",
                "value": "nullish"
              }
            }
          }
        ]
      }
    },
    {
      "description": "Call the not-found handler without consulting finalized.",
      "effects": [],
      "ensures": [
        {
          "description": "The selected response source is not-found.",
          "evidence_ids": [
            "evidence:98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2"
          ],
          "id": "rule:direct-missing",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [],
              "root": "output"
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": "not-found"
            }
          }
        }
      ],
      "evidence_ids": [
        "evidence:98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2"
      ],
      "id": "outcome:direct-missing",
      "transitions": [],
      "updates": [],
      "when": {
        "kind": "all",
        "terms": [
          {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [
                "path"
              ],
              "root": "input"
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": "direct"
            }
          },
          {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [
                "value"
              ],
              "root": "input"
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": "nullish"
            }
          }
        ]
      }
    },
    {
      "description": "Use the truthy resolved Promise value.",
      "effects": [],
      "ensures": [
        {
          "description": "The selected response source is handler-result.",
          "evidence_ids": [
            "evidence:98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2"
          ],
          "id": "rule:promise-value",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [],
              "root": "output"
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": "handler-result"
            }
          }
        }
      ],
      "evidence_ids": [
        "evidence:98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2"
      ],
      "id": "outcome:promise-value",
      "transitions": [],
      "updates": [],
      "when": {
        "kind": "all",
        "terms": [
          {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [
                "path"
              ],
              "root": "input"
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": "promise"
            }
          },
          {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [
                "value"
              ],
              "root": "input"
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": "truthy"
            }
          }
        ]
      }
    },
    {
      "description": "Read the context response after a falsy resolution when finalized is true.",
      "effects": [],
      "ensures": [
        {
          "description": "The selected response source is context-response.",
          "evidence_ids": [
            "evidence:98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2"
          ],
          "id": "rule:promise-context",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [],
              "root": "output"
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": "context-response"
            }
          }
        }
      ],
      "evidence_ids": [
        "evidence:98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2"
      ],
      "id": "outcome:promise-context",
      "transitions": [
        {
          "description": "Read Context.res, which may create response storage.",
          "handoff": "invoke",
          "operation_id": "read-response"
        }
      ],
      "updates": [],
      "when": {
        "kind": "all",
        "terms": [
          {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [
                "path"
              ],
              "root": "input"
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": "promise"
            }
          },
          {
            "kind": "not",
            "value": {
              "kind": "compare",
              "left": {
                "kind": "ref",
                "path": [
                  "value"
                ],
                "root": "input"
              },
              "op": "eq",
              "right": {
                "kind": "literal",
                "value": "truthy"
              }
            }
          },
          {
            "kind": "ref",
            "path": [
              "finalized"
            ],
            "root": "before"
          }
        ]
      }
    },
    {
      "description": "Call not-found after a falsy resolution when finalized is false.",
      "effects": [],
      "ensures": [
        {
          "description": "The selected response source is not-found.",
          "evidence_ids": [
            "evidence:98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2"
          ],
          "id": "rule:promise-missing",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [],
              "root": "output"
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": "not-found"
            }
          }
        }
      ],
      "evidence_ids": [
        "evidence:98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2"
      ],
      "id": "outcome:promise-missing",
      "transitions": [],
      "updates": [],
      "when": {
        "kind": "all",
        "terms": [
          {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [
                "path"
              ],
              "root": "input"
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": "promise"
            }
          },
          {
            "kind": "not",
            "value": {
              "kind": "compare",
              "left": {
                "kind": "ref",
                "path": [
                  "value"
                ],
                "root": "input"
              },
              "op": "eq",
              "right": {
                "kind": "literal",
                "value": "truthy"
              }
            }
          },
          {
            "kind": "not",
            "value": {
              "kind": "ref",
              "path": [
                "finalized"
              ],
              "root": "before"
            }
          }
        ]
      }
    },
    {
      "description": "Read the context response after successful composed execution with finalized context.",
      "effects": [],
      "ensures": [
        {
          "description": "The selected response source is context-response.",
          "evidence_ids": [
            "evidence:98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2"
          ],
          "id": "rule:composed-context",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [],
              "root": "output"
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": "context-response"
            }
          }
        }
      ],
      "evidence_ids": [
        "evidence:98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2"
      ],
      "id": "outcome:composed-context",
      "transitions": [
        {
          "description": "Read Context.res, which may create response storage.",
          "handoff": "invoke",
          "operation_id": "read-response"
        }
      ],
      "updates": [],
      "when": {
        "kind": "all",
        "terms": [
          {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [
                "path"
              ],
              "root": "input"
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": "composed"
            }
          },
          {
            "kind": "ref",
            "path": [
              "finalized"
            ],
            "root": "before"
          }
        ]
      }
    },
    {
      "description": "Raise the finalization error inside the composed application catch boundary.",
      "effects": [],
      "ensures": [
        {
          "description": "The selected response source is finalization-error.",
          "evidence_ids": [
            "evidence:98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2"
          ],
          "id": "rule:composed-unfinalized",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [],
              "root": "output"
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": "finalization-error"
            }
          }
        }
      ],
      "evidence_ids": [
        "evidence:98377407be0e1d9f3dbe99143801820905c18a26f23561c9fcf9d38afe55dcd2"
      ],
      "id": "outcome:composed-unfinalized",
      "transitions": [],
      "updates": [],
      "when": {
        "kind": "all",
        "terms": [
          {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [
                "path"
              ],
              "root": "input"
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": "composed"
            }
          },
          {
            "kind": "not",
            "value": {
              "kind": "ref",
              "path": [
                "finalized"
              ],
              "root": "before"
            }
          }
        ]
      }
    }
  ],
  "output": {
    "kind": "enum",
    "values": [
      "handler-result",
      "context-response",
      "not-found",
      "finalization-error"
    ]
  },
  "purpose": "Keep the direct, Promise, and composed fallback rules distinct. This operation models the response source selected after the relevant handler phase; it does not execute a callback.",
  "reads": [
    "finalized"
  ],
  "writes": []
}
```

</details>

<a id="record-6d6964646c65776172652d726573756c74"></a>
## Decide whether middleware replaces the response

Assign a truthy result when finalized is exactly false or when it came from the error handler\. A falsy result skips assignment\.

| Condition | Outcome | Required result |
| --- | --- | --- |
| \(input\.truthy\_result\) and \(\(not \(before\.finalized\)\) or \(input\.error\_result\)\) | Assign the result through Context\.res\. | Choose assignment\. |
| not \(\(input\.truthy\_result\) and \(\(not \(before\.finalized\)\) or \(input\.error\_result\)\)\) | Skip result assignment\. | Choose preservation\. |


| Implementation | Responsibility |
| --- | --- |
| Nested middleware dispatch | Apply the exact result condition after awaiting the handler or processing an error\. |

- **analysis-limit:** What happens inside unmodeled callbacks or platform helpers? The model covers the stated decisions\. Callback effects, platform failures, and source outside these excerpts remain unknown\.

<details>
<summary>Types, state, effects, and exact rules</summary>

```json
{
  "alias": "middleware-result",
  "coverage": "partial",
  "decisions": [
    {
      "blocking": false,
      "consequence": "The model covers the stated decisions. Callback effects, platform failures, and source outside these excerpts remain unknown.",
      "disposition": "analysis-limit",
      "evidence_ids": [],
      "id": "decision:middleware-result-scope",
      "question": "What happens inside unmodeled callbacks or platform helpers?"
    }
  ],
  "dependencies": [
    {
      "kind": "uses-contract",
      "operation_id": "store-response",
      "requirement": "required",
      "role": "Apply an accepted result and establish finalization."
    }
  ],
  "effects": {
    "allowed": [],
    "completeness": "partial"
  },
  "evidence_ids": [
    "evidence:f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370",
    "source:hono-license"
  ],
  "frame": "partial",
  "guarantees": [],
  "id": "middleware-result",
  "implementations": [
    {
      "evidence_ids": [
        "evidence:f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370"
      ],
      "name": "Nested middleware dispatch",
      "responsibility": "Apply the exact result condition after awaiting the handler or processing an error.",
      "symbol_id": null
    }
  ],
  "inputs": {
    "error_result": {
      "kind": "boolean"
    },
    "truthy_result": {
      "kind": "boolean"
    }
  },
  "name": "Decide whether middleware replaces the response",
  "outcome_policy": "exclusive",
  "outcomes": [
    {
      "description": "Assign the result through Context.res.",
      "effects": [],
      "ensures": [
        {
          "description": "Choose assignment.",
          "evidence_ids": [
            "evidence:f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370"
          ],
          "id": "rule:middleware-assign",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [],
              "root": "output"
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": "assign"
            }
          }
        }
      ],
      "evidence_ids": [],
      "id": "outcome:middleware-assign",
      "transitions": [
        {
          "description": "Pass the selected result to the response setter.",
          "handoff": "invoke",
          "operation_id": "store-response"
        }
      ],
      "updates": [],
      "when": {
        "kind": "all",
        "terms": [
          {
            "kind": "ref",
            "path": [
              "truthy_result"
            ],
            "root": "input"
          },
          {
            "kind": "any",
            "terms": [
              {
                "kind": "not",
                "value": {
                  "kind": "ref",
                  "path": [
                    "finalized"
                  ],
                  "root": "before"
                }
              },
              {
                "kind": "ref",
                "path": [
                  "error_result"
                ],
                "root": "input"
              }
            ]
          }
        ]
      }
    },
    {
      "description": "Skip result assignment.",
      "effects": [],
      "ensures": [
        {
          "description": "Choose preservation.",
          "evidence_ids": [
            "evidence:f0fbf304d7f634b2604843eb1d434ace3bbc1661e737c3fd782fde7d77f7b370"
          ],
          "id": "rule:middleware-preserve",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [],
              "root": "output"
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": "preserve"
            }
          }
        }
      ],
      "evidence_ids": [],
      "id": "outcome:middleware-preserve",
      "transitions": [],
      "updates": [],
      "when": {
        "kind": "not",
        "value": {
          "kind": "all",
          "terms": [
            {
              "kind": "ref",
              "path": [
                "truthy_result"
              ],
              "root": "input"
            },
            {
              "kind": "any",
              "terms": [
                {
                  "kind": "not",
                  "value": {
                    "kind": "ref",
                    "path": [
                      "finalized"
                    ],
                    "root": "before"
                  }
                },
                {
                  "kind": "ref",
                  "path": [
                    "error_result"
                  ],
                  "root": "input"
                }
              ]
            }
          ]
        }
      }
    }
  ],
  "output": {
    "kind": "enum",
    "values": [
      "assign",
      "preserve"
    ]
  },
  "purpose": "Assign a truthy result when finalized is exactly false or when it came from the error handler. A falsy result skips assignment.",
  "reads": [
    "finalized"
  ],
  "writes": []
}
```

</details>

<a id="record-726561642d726573706f6e7365"></a>
## Read or initialize response storage

Return stored response state\. If storage is absent, initialize it\. Reading this accessor does not set finalized\.

| Condition | Outcome | Required result |
| --- | --- | --- |
| before\.response\-present | Return existing storage\. | Select the stored response\. |
| not \(before\.response\-present\) | Initialize response storage and return it\. | Select the created response\. |

- The getter leaves finalized unchanged\.
- Successful reading leaves response storage present\.

| Implementation | Responsibility |
| --- | --- |
| Context\.res getter | Lazily create response storage and prepared headers without finalizing the context\. |

- **analysis-limit:** What happens inside unmodeled callbacks or platform helpers? The model covers the stated decisions\. Callback effects, platform failures, and source outside these excerpts remain unknown\.

<details>
<summary>Types, state, effects, and exact rules</summary>

```json
{
  "alias": "read-response",
  "coverage": "partial",
  "decisions": [
    {
      "blocking": false,
      "consequence": "The model covers the stated decisions. Callback effects, platform failures, and source outside these excerpts remain unknown.",
      "disposition": "analysis-limit",
      "evidence_ids": [],
      "id": "decision:read-response-scope",
      "question": "What happens inside unmodeled callbacks or platform helpers?"
    }
  ],
  "dependencies": [],
  "effects": {
    "allowed": [],
    "completeness": "partial"
  },
  "evidence_ids": [
    "evidence:efdc8a49582842d74bb72cf074179c4f18d4dc3a0f2d25c8ab366eb8630282b1",
    "source:hono-license"
  ],
  "frame": "partial",
  "guarantees": [
    {
      "description": "The getter leaves finalized unchanged.",
      "evidence_ids": [
        "evidence:efdc8a49582842d74bb72cf074179c4f18d4dc3a0f2d25c8ab366eb8630282b1"
      ],
      "id": "rule:get-finalized",
      "predicate": {
        "kind": "compare",
        "left": {
          "kind": "ref",
          "path": [
            "finalized"
          ],
          "root": "after"
        },
        "op": "eq",
        "right": {
          "kind": "ref",
          "path": [
            "finalized"
          ],
          "root": "before"
        }
      }
    },
    {
      "description": "Successful reading leaves response storage present.",
      "evidence_ids": [
        "evidence:efdc8a49582842d74bb72cf074179c4f18d4dc3a0f2d25c8ab366eb8630282b1"
      ],
      "id": "rule:get-storage",
      "predicate": {
        "kind": "compare",
        "left": {
          "kind": "ref",
          "path": [
            "response-present"
          ],
          "root": "after"
        },
        "op": "eq",
        "right": {
          "kind": "literal",
          "value": true
        }
      }
    }
  ],
  "id": "read-response",
  "implementations": [
    {
      "evidence_ids": [
        "evidence:efdc8a49582842d74bb72cf074179c4f18d4dc3a0f2d25c8ab366eb8630282b1"
      ],
      "name": "Context.res getter",
      "responsibility": "Lazily create response storage and prepared headers without finalizing the context.",
      "symbol_id": null
    }
  ],
  "inputs": {},
  "name": "Read or initialize response storage",
  "outcome_policy": "exclusive",
  "outcomes": [
    {
      "description": "Return existing storage.",
      "effects": [],
      "ensures": [
        {
          "description": "Select the stored response.",
          "evidence_ids": [
            "evidence:efdc8a49582842d74bb72cf074179c4f18d4dc3a0f2d25c8ab366eb8630282b1"
          ],
          "id": "rule:get-existing",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [],
              "root": "output"
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": "stored-response"
            }
          }
        }
      ],
      "evidence_ids": [],
      "id": "outcome:get-existing",
      "transitions": [],
      "updates": [],
      "when": {
        "kind": "ref",
        "path": [
          "response-present"
        ],
        "root": "before"
      }
    },
    {
      "description": "Initialize response storage and return it.",
      "effects": [],
      "ensures": [
        {
          "description": "Select the created response.",
          "evidence_ids": [
            "evidence:efdc8a49582842d74bb72cf074179c4f18d4dc3a0f2d25c8ab366eb8630282b1"
          ],
          "id": "rule:get-create",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [],
              "root": "output"
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": "created-response"
            }
          }
        }
      ],
      "evidence_ids": [],
      "id": "outcome:get-create",
      "transitions": [],
      "updates": [
        {
          "state_id": "response-present",
          "value": {
            "kind": "literal",
            "value": true
          }
        }
      ],
      "when": {
        "kind": "not",
        "value": {
          "kind": "ref",
          "path": [
            "response-present"
          ],
          "root": "before"
        }
      }
    }
  ],
  "output": {
    "kind": "enum",
    "values": [
      "stored-response",
      "created-response"
    ]
  },
  "purpose": "Return stored response state. If storage is absent, initialize it. Reading this accessor does not set finalized.",
  "reads": [
    "response-present",
    "finalized"
  ],
  "writes": [
    "response-present"
  ]
}
```

</details>

<a id="record-73746f72652d726573706f6e7365"></a>
## Store a response and finalize context

After any required header merge succeeds, store the assigned response and set finalized to true\. An undefined assignment can finalize context without storing a response\.

| Condition | Outcome | Required result |
| --- | --- | --- |
| input\.merge\_succeeds | Store the assignment and finalize\. | The setter completes\. |
| not \(input\.merge\_succeeds\) | Propagate the merge failure before storage and finalization updates\. | The error propagates\. The finalization assignment has not run\. The storage assignment has not run\. |


| Implementation | Responsibility |
| --- | --- |
| Context\.res setter | Merge headers when old and new responses exist, then replace storage and set finalized\. |

- **analysis-limit:** What changes during header merging? Header copying, content\-type, and set\-cookie rules are retained in source\. This small model represents merge success as an input and does not claim to model intermediate mutations\.

<details>
<summary>Types, state, effects, and exact rules</summary>

```json
{
  "alias": "store-response",
  "coverage": "partial",
  "decisions": [
    {
      "blocking": false,
      "consequence": "Header copying, content-type, and set-cookie rules are retained in source. This small model represents merge success as an input and does not claim to model intermediate mutations.",
      "disposition": "analysis-limit",
      "evidence_ids": [],
      "id": "decision:setter-headers",
      "question": "What changes during header merging?"
    }
  ],
  "dependencies": [],
  "effects": {
    "allowed": [],
    "completeness": "partial"
  },
  "evidence_ids": [
    "evidence:aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5",
    "source:hono-license"
  ],
  "frame": "partial",
  "guarantees": [],
  "id": "store-response",
  "implementations": [
    {
      "evidence_ids": [
        "evidence:aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5"
      ],
      "name": "Context.res setter",
      "responsibility": "Merge headers when old and new responses exist, then replace storage and set finalized.",
      "symbol_id": null
    }
  ],
  "inputs": {
    "assigned": {
      "kind": "enum",
      "values": [
        "response",
        "undefined"
      ]
    },
    "merge_succeeds": {
      "kind": "boolean"
    }
  },
  "name": "Store a response and finalize context",
  "outcome_policy": "exclusive",
  "outcomes": [
    {
      "description": "Store the assignment and finalize.",
      "effects": [],
      "ensures": [
        {
          "description": "The setter completes.",
          "evidence_ids": [
            "evidence:aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5"
          ],
          "id": "rule:set-result",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [],
              "root": "output"
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": "stored"
            }
          }
        }
      ],
      "evidence_ids": [],
      "id": "outcome:set-success",
      "transitions": [],
      "updates": [
        {
          "state_id": "finalized",
          "value": {
            "kind": "literal",
            "value": true
          }
        },
        {
          "state_id": "response-present",
          "value": {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [
                "assigned"
              ],
              "root": "input"
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": "response"
            }
          }
        }
      ],
      "when": {
        "kind": "ref",
        "path": [
          "merge_succeeds"
        ],
        "root": "input"
      }
    },
    {
      "description": "Propagate the merge failure before storage and finalization updates.",
      "effects": [],
      "ensures": [
        {
          "description": "The error propagates.",
          "evidence_ids": [
            "evidence:aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5"
          ],
          "id": "rule:set-failure",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [],
              "root": "output"
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": "propagated-error"
            }
          }
        },
        {
          "description": "The finalization assignment has not run.",
          "evidence_ids": [
            "evidence:aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5"
          ],
          "id": "rule:set-no-finalize",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [
                "finalized"
              ],
              "root": "after"
            },
            "op": "eq",
            "right": {
              "kind": "ref",
              "path": [
                "finalized"
              ],
              "root": "before"
            }
          }
        },
        {
          "description": "The storage assignment has not run.",
          "evidence_ids": [
            "evidence:aa0addd05e633650f6021efd32879b188d53dccc86716ddf8bf71950476311e5"
          ],
          "id": "rule:set-no-replace",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [
                "response-present"
              ],
              "root": "after"
            },
            "op": "eq",
            "right": {
              "kind": "ref",
              "path": [
                "response-present"
              ],
              "root": "before"
            }
          }
        }
      ],
      "evidence_ids": [],
      "id": "outcome:set-failure",
      "transitions": [],
      "updates": [],
      "when": {
        "kind": "not",
        "value": {
          "kind": "ref",
          "path": [
            "merge_succeeds"
          ],
          "root": "input"
        }
      }
    }
  ],
  "output": {
    "kind": "enum",
    "values": [
      "stored",
      "propagated-error"
    ]
  },
  "purpose": "After any required header merge succeeds, store the assigned response and set finalized to true. An undefined assignment can finalize context without storing a response.",
  "reads": [
    "response-present",
    "finalized"
  ],
  "writes": [
    "response-present",
    "finalized"
  ]
}
```

</details>

## Relationships

These are declared dependencies. The labels state their purpose; they are not an execution trace.

| From | Target | Relationship | Role |
| --- | --- | --- | --- |
| Select the response after handler execution | Read or initialize response storage | uses\-contract | Read or initialize response storage only when the chosen path uses Context\.res\. |
| Select the response after handler execution | Store a response and finalize context | uses\-contract | Explain the setter that establishes finalization; it is supporting behavior, not an unconditional next call\. |
| Select the response after handler execution | Decide whether middleware replaces the response | uses\-contract | Explain when composition assigns a handler or error result\. |
| Decide whether middleware replaces the response | Store a response and finalize context | uses\-contract | Apply an accepted result and establish finalization\. |

## Source and design evidence

<a id="record-65766964656e63653a39383337373430376265306531643966336462653939313433383031383230393035633138613236663233353631633966636639643338616665353564636432"></a>
<details>
<summary>src/hono\-base\.ts:408\-468</summary>

Origin: source. SHA-256: `bc41d6377a15c14d04e3aeb7dddb8238ad06634533546314ca08bdb641170b0c`.

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

<a id="record-65766964656e63653a61613061646464303565363333363530663630323165666433323837396231383864353364636363383637313664646638626637313935303437363331316535"></a>
<details>
<summary>src/context\.ts:414\-434</summary>

Origin: source. SHA-256: `446bce24d72b2b797e38a4051c2d4bc4755c8c2433dd7c0bcdac20bcd899e663`.

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

<a id="record-65766964656e63653a64313963613734386631333032663030393266336262626333303134386433633264383335663939663430376462386532373830323034356437633835623639"></a>
<details>
<summary>src/hono\-base\.ts:401\-406</summary>

Origin: source. SHA-256: `3840f2d18684a9ec0c478231a050937549ef238baab2d6476fe48c7d3f3fbc5f`.

```typescript
#handleError(err: unknown, c: Context<E>): Response | Promise<Response> {
    if (err instanceof Error) {
      return this.errorHandler(err, c)
    }
    throw err
  }
```

</details>

<a id="record-65766964656e63653a65666463386134393538323834326437346262373263663037343137396334663138643464633361306632643235633861623336366562383633303238326231"></a>
<details>
<summary>src/context\.ts:403\-407</summary>

Origin: source. SHA-256: `99da45abc749d1f6dcf325ab9bcd4882ed5f6ef8831e0c1cd21f3188ab9517e6`.

```typescript
get res(): Response {
    return (this.#res ||= createResponseInstance(null, {
      headers: (this.#preparedHeaders ??= new Headers()),
    }))
  }
```

</details>

<a id="record-65766964656e63653a66306662663330346437663633346232363034383433656231643433346163653362626331363631653733376333666437383266646537643737663762333730"></a>
<details>
<summary>src/compose\.ts:15\-73</summary>

Origin: source. SHA-256: `1ec9329c504aaa41ba9e2c60370ac012c3909e4bafc1f8d6e673c4d4075222b4`.

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

<a id="record-736f757263653a686f6e6f2d6c6963656e7365"></a>
<details>
<summary>Hono MIT license</summary>

Origin: source. SHA-256: `a6ab98e5c77b9070c443eaff2ff81034a6f8cc05a7524d5098eb0f24defa0115`.

```typescript
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

## Context scope

30472 UTF-8 bytes in the canonical JSON package. Text rendering has a different size.

```json
{
  "deferred_dependencies": [],
  "operation_ids": []
}
```

Use inspect on this exact specification with \-\-operation &lt;id&gt;\. Source text is attached and hashed; hashes establish content integrity, not source authenticity\. Dependencies describe declared relationships, not an observed execution trace\.

Scenario checks evaluate supplied observations. They do not prove the implementation or authenticate requirements.
