# Assemble context for a coding agent

Give an agent the selected operation and its required rules together\. Preserve open decisions and explain deferred lookups\. Return an explicit error when the required package cannot be produced\.

Proposed intended behavior. 4 operations. Source hashes checked; source authenticity and claim support are not established.

Specification: `specification:03e94a4d33af12456ea816c0ffa1ffc8482d3fd93ff6f46b4e3fbd752b2d2aa6`.

## A concrete case

### One operation keeps its complete meaning

Operation: `assemble-context`. Scenario check: **pass**.

<details>
<summary>Open inputs, outcome, and checks</summary>

```json
{
  "observation": {
    "input": {
      "root_id": "root",
      "available_ids": [
        "root"
      ],
      "required_edges": [],
      "applicable_decisions": [],
      "artifact_id": "specification:6a2320449b0782c87903d959db3f29803103c52d80fccc5c830a400ec5d2bc0a",
      "max_bytes": 65536
    },
    "before": {
      "model-digest": "402fd29a87ea0fa62e6e5ecd5373aa6d6cc9fc83a0eb9d68099c50c55c2341c9"
    },
    "after": {
      "model-digest": "402fd29a87ea0fa62e6e5ecd5373aa6d6cc9fc83a0eb9d68099c50c55c2341c9"
    },
    "effects": [],
    "outcome": "outcome:ready",
    "output": {
      "kind": "ready",
      "included_ids": [
        "root"
      ],
      "omitted_ids": [],
      "decision_ids": [],
      "artifact_id": "specification:6a2320449b0782c87903d959db3f29803103c52d80fccc5c830a400ec5d2bc0a",
      "used_bytes": 1687,
      "required_bytes": 1687
    }
  },
  "result": {
    "artifact_id": "specification:03e94a4d33af12456ea816c0ffa1ffc8482d3fd93ff6f46b4e3fbd752b2d2aa6",
    "operation_id": "assemble-context",
    "perspective": "intended",
    "verdict": "pass",
    "applicable_outcome_ids": [
      "outcome:ready",
      "outcome:budget"
    ],
    "uncertain_outcome_ids": [],
    "checks": [
      {
        "id": "outcome-condition",
        "description": "Return the complete required context package.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:ready-tag",
        "description": "The result identifies a ready package.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:root-present",
        "description": "The selected operation is present.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:no-duplicates",
        "description": "Each operation appears once, including in cycles.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:known-records",
        "description": "Every included operation comes from this specification.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:dependency-closure",
        "description": "Every required dependency of an included operation is included.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:minimal-closure",
        "description": "Every included operation is reachable from the selected root through required edges.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:retain-decisions",
        "description": "Every open decision on an included operation remains available.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:omissions",
        "description": "Every available operation is included or explicitly omitted.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:disjoint-omissions",
        "description": "An included operation is never listed as omitted.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:identity",
        "description": "The package identifies the input specification.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:within-budget",
        "description": "The exact serialized output fits its byte budget.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:required-size",
        "description": "This required-only package reports its full size as required.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "effects:allowed",
        "description": "Only effects allowed for this outcome occur.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "frame:model-digest",
        "description": "Preserve Input model content digest.",
        "verdict": "pass",
        "reason": null
      }
    ],
    "limitations": [
      "Checks apply only to the supplied observation and modeled rules. Source implementation is not executed or proved.",
      "analysis-limit: Does this context improve a fresh agent coding task?",
      "analysis-limit: Does the implementation select the least required closure?",
      "analysis-limit: Does used_bytes equal actual UTF-8 serialization?"
    ]
  }
}
```

</details>

### A shared dependency appears once

Operation: `assemble-context`. Scenario check: **pass**.

<details>
<summary>Open inputs, outcome, and checks</summary>

```json
{
  "observation": {
    "input": {
      "root_id": "root",
      "available_ids": [
        "root",
        "left",
        "right",
        "shared"
      ],
      "required_edges": [
        {
          "from": "root",
          "to": "left"
        },
        {
          "from": "root",
          "to": "right"
        },
        {
          "from": "left",
          "to": "shared"
        },
        {
          "from": "right",
          "to": "shared"
        }
      ],
      "applicable_decisions": [],
      "artifact_id": "specification:dbe3374d01fe2de245be2986596b0b5dc4cbdc34efd5d07d5f718d7b7a8bb69e",
      "max_bytes": 65536
    },
    "before": {
      "model-digest": "9df85daf7db22f593e1526cc63967a92727d60a24bd35e44d7f5bba7b62a9301"
    },
    "after": {
      "model-digest": "9df85daf7db22f593e1526cc63967a92727d60a24bd35e44d7f5bba7b62a9301"
    },
    "effects": [],
    "outcome": "outcome:ready",
    "output": {
      "kind": "ready",
      "included_ids": [
        "root",
        "left",
        "right",
        "shared"
      ],
      "omitted_ids": [],
      "decision_ids": [],
      "artifact_id": "specification:dbe3374d01fe2de245be2986596b0b5dc4cbdc34efd5d07d5f718d7b7a8bb69e",
      "used_bytes": 4764,
      "required_bytes": 4764
    }
  },
  "result": {
    "artifact_id": "specification:03e94a4d33af12456ea816c0ffa1ffc8482d3fd93ff6f46b4e3fbd752b2d2aa6",
    "operation_id": "assemble-context",
    "perspective": "intended",
    "verdict": "pass",
    "applicable_outcome_ids": [
      "outcome:ready",
      "outcome:budget"
    ],
    "uncertain_outcome_ids": [],
    "checks": [
      {
        "id": "outcome-condition",
        "description": "Return the complete required context package.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:ready-tag",
        "description": "The result identifies a ready package.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:root-present",
        "description": "The selected operation is present.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:no-duplicates",
        "description": "Each operation appears once, including in cycles.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:known-records",
        "description": "Every included operation comes from this specification.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:dependency-closure",
        "description": "Every required dependency of an included operation is included.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:minimal-closure",
        "description": "Every included operation is reachable from the selected root through required edges.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:retain-decisions",
        "description": "Every open decision on an included operation remains available.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:omissions",
        "description": "Every available operation is included or explicitly omitted.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:disjoint-omissions",
        "description": "An included operation is never listed as omitted.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:identity",
        "description": "The package identifies the input specification.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:within-budget",
        "description": "The exact serialized output fits its byte budget.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:required-size",
        "description": "This required-only package reports its full size as required.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "effects:allowed",
        "description": "Only effects allowed for this outcome occur.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "frame:model-digest",
        "description": "Preserve Input model content digest.",
        "verdict": "pass",
        "reason": null
      }
    ],
    "limitations": [
      "Checks apply only to the supplied observation and modeled rules. Source implementation is not executed or proved.",
      "analysis-limit: Does this context improve a fresh agent coding task?",
      "analysis-limit: Does the implementation select the least required closure?",
      "analysis-limit: Does used_bytes equal actual UTF-8 serialization?"
    ]
  }
}
```

</details>

### A cycle terminates and retains its blocking decision

Operation: `assemble-context`. Scenario check: **pass**.

<details>
<summary>Open inputs, outcome, and checks</summary>

```json
{
  "observation": {
    "input": {
      "root_id": "root",
      "available_ids": [
        "root",
        "left",
        "right",
        "shared",
        "optional"
      ],
      "required_edges": [
        {
          "from": "root",
          "to": "left"
        },
        {
          "from": "root",
          "to": "right"
        },
        {
          "from": "left",
          "to": "shared"
        },
        {
          "from": "right",
          "to": "shared"
        },
        {
          "from": "shared",
          "to": "root"
        }
      ],
      "applicable_decisions": [
        {
          "operation_id": "shared",
          "decision_id": "decision:callback"
        }
      ],
      "artifact_id": "specification:bed319137b79b4c54ad4784bf55352f3f0c6f9851165bb7122eaab9cd9b3d9f0",
      "max_bytes": 65536
    },
    "before": {
      "model-digest": "50a95bd688f8eaa21e761cff85b05ac12e9696b3c32bf21e558192e73d82091c"
    },
    "after": {
      "model-digest": "50a95bd688f8eaa21e761cff85b05ac12e9696b3c32bf21e558192e73d82091c"
    },
    "effects": [],
    "outcome": "outcome:ready",
    "output": {
      "kind": "ready",
      "included_ids": [
        "root",
        "left",
        "right",
        "shared"
      ],
      "omitted_ids": [
        "optional"
      ],
      "decision_ids": [
        "decision:callback"
      ],
      "artifact_id": "specification:bed319137b79b4c54ad4784bf55352f3f0c6f9851165bb7122eaab9cd9b3d9f0",
      "used_bytes": 5972,
      "required_bytes": 5972
    }
  },
  "result": {
    "artifact_id": "specification:03e94a4d33af12456ea816c0ffa1ffc8482d3fd93ff6f46b4e3fbd752b2d2aa6",
    "operation_id": "assemble-context",
    "perspective": "intended",
    "verdict": "pass",
    "applicable_outcome_ids": [
      "outcome:ready",
      "outcome:budget"
    ],
    "uncertain_outcome_ids": [],
    "checks": [
      {
        "id": "outcome-condition",
        "description": "Return the complete required context package.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:ready-tag",
        "description": "The result identifies a ready package.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:root-present",
        "description": "The selected operation is present.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:no-duplicates",
        "description": "Each operation appears once, including in cycles.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:known-records",
        "description": "Every included operation comes from this specification.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:dependency-closure",
        "description": "Every required dependency of an included operation is included.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:minimal-closure",
        "description": "Every included operation is reachable from the selected root through required edges.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:retain-decisions",
        "description": "Every open decision on an included operation remains available.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:omissions",
        "description": "Every available operation is included or explicitly omitted.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:disjoint-omissions",
        "description": "An included operation is never listed as omitted.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:identity",
        "description": "The package identifies the input specification.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:within-budget",
        "description": "The exact serialized output fits its byte budget.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:required-size",
        "description": "This required-only package reports its full size as required.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "effects:allowed",
        "description": "Only effects allowed for this outcome occur.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "frame:model-digest",
        "description": "Preserve Input model content digest.",
        "verdict": "pass",
        "reason": null
      }
    ],
    "limitations": [
      "Checks apply only to the supplied observation and modeled rules. Source implementation is not executed or proved.",
      "analysis-limit: Does this context improve a fresh agent coding task?",
      "analysis-limit: Does the implementation select the least required closure?",
      "analysis-limit: Does used_bytes equal actual UTF-8 serialization?"
    ]
  }
}
```

</details>

### An exact byte budget succeeds, including Unicode and counters

Operation: `assemble-context`. Scenario check: **pass**.

<details>
<summary>Open inputs, outcome, and checks</summary>

```json
{
  "observation": {
    "input": {
      "root_id": "root",
      "available_ids": [
        "root"
      ],
      "required_edges": [],
      "applicable_decisions": [],
      "artifact_id": "specification:6a2320449b0782c87903d959db3f29803103c52d80fccc5c830a400ec5d2bc0a",
      "max_bytes": 1686
    },
    "before": {
      "model-digest": "402fd29a87ea0fa62e6e5ecd5373aa6d6cc9fc83a0eb9d68099c50c55c2341c9"
    },
    "after": {
      "model-digest": "402fd29a87ea0fa62e6e5ecd5373aa6d6cc9fc83a0eb9d68099c50c55c2341c9"
    },
    "effects": [],
    "outcome": "outcome:ready",
    "output": {
      "kind": "ready",
      "included_ids": [
        "root"
      ],
      "omitted_ids": [],
      "decision_ids": [],
      "artifact_id": "specification:6a2320449b0782c87903d959db3f29803103c52d80fccc5c830a400ec5d2bc0a",
      "used_bytes": 1686,
      "required_bytes": 1686
    }
  },
  "result": {
    "artifact_id": "specification:03e94a4d33af12456ea816c0ffa1ffc8482d3fd93ff6f46b4e3fbd752b2d2aa6",
    "operation_id": "assemble-context",
    "perspective": "intended",
    "verdict": "pass",
    "applicable_outcome_ids": [
      "outcome:ready",
      "outcome:budget"
    ],
    "uncertain_outcome_ids": [],
    "checks": [
      {
        "id": "outcome-condition",
        "description": "Return the complete required context package.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:ready-tag",
        "description": "The result identifies a ready package.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:root-present",
        "description": "The selected operation is present.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:no-duplicates",
        "description": "Each operation appears once, including in cycles.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:known-records",
        "description": "Every included operation comes from this specification.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:dependency-closure",
        "description": "Every required dependency of an included operation is included.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:minimal-closure",
        "description": "Every included operation is reachable from the selected root through required edges.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:retain-decisions",
        "description": "Every open decision on an included operation remains available.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:omissions",
        "description": "Every available operation is included or explicitly omitted.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:disjoint-omissions",
        "description": "An included operation is never listed as omitted.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:identity",
        "description": "The package identifies the input specification.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:within-budget",
        "description": "The exact serialized output fits its byte budget.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:required-size",
        "description": "This required-only package reports its full size as required.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "effects:allowed",
        "description": "Only effects allowed for this outcome occur.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "frame:model-digest",
        "description": "Preserve Input model content digest.",
        "verdict": "pass",
        "reason": null
      }
    ],
    "limitations": [
      "Checks apply only to the supplied observation and modeled rules. Source implementation is not executed or proved.",
      "analysis-limit: Does this context improve a fresh agent coding task?",
      "analysis-limit: Does the implementation select the least required closure?",
      "analysis-limit: Does used_bytes equal actual UTF-8 serialization?"
    ]
  }
}
```

</details>

### One byte too little returns an explicit size error

Operation: `assemble-context`. Scenario check: **pass**.

<details>
<summary>Open inputs, outcome, and checks</summary>

```json
{
  "observation": {
    "input": {
      "root_id": "root",
      "available_ids": [
        "root"
      ],
      "required_edges": [],
      "applicable_decisions": [],
      "artifact_id": "specification:6a2320449b0782c87903d959db3f29803103c52d80fccc5c830a400ec5d2bc0a",
      "max_bytes": 1685
    },
    "before": {
      "model-digest": "402fd29a87ea0fa62e6e5ecd5373aa6d6cc9fc83a0eb9d68099c50c55c2341c9"
    },
    "after": {
      "model-digest": "402fd29a87ea0fa62e6e5ecd5373aa6d6cc9fc83a0eb9d68099c50c55c2341c9"
    },
    "effects": [],
    "outcome": "outcome:budget",
    "output": {
      "kind": "budget-exceeded",
      "included_ids": [],
      "omitted_ids": [],
      "decision_ids": [],
      "artifact_id": "specification:6a2320449b0782c87903d959db3f29803103c52d80fccc5c830a400ec5d2bc0a",
      "used_bytes": 0,
      "required_bytes": 1686
    }
  },
  "result": {
    "artifact_id": "specification:03e94a4d33af12456ea816c0ffa1ffc8482d3fd93ff6f46b4e3fbd752b2d2aa6",
    "operation_id": "assemble-context",
    "perspective": "intended",
    "verdict": "pass",
    "applicable_outcome_ids": [
      "outcome:ready",
      "outcome:budget"
    ],
    "uncertain_outcome_ids": [],
    "checks": [
      {
        "id": "outcome-condition",
        "description": "Report the required size without returning truncated context.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:budget-tag",
        "description": "The result identifies insufficient budget.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:budget-reason",
        "description": "The measured required size exceeds the requested budget.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:no-partial-return",
        "description": "No truncated operation list is returned.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "effects:allowed",
        "description": "Only effects allowed for this outcome occur.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "frame:model-digest",
        "description": "Preserve Input model content digest.",
        "verdict": "pass",
        "reason": null
      }
    ],
    "limitations": [
      "Checks apply only to the supplied observation and modeled rules. Source implementation is not executed or proved.",
      "analysis-limit: Does this context improve a fresh agent coding task?",
      "analysis-limit: Does the implementation select the least required closure?",
      "analysis-limit: Does used_bytes equal actual UTF-8 serialization?"
    ]
  }
}
```

</details>

### An absent root returns an explicit selection error

Operation: `assemble-context`. Scenario check: **pass**.

<details>
<summary>Open inputs, outcome, and checks</summary>

```json
{
  "observation": {
    "input": {
      "root_id": "absent",
      "available_ids": [
        "root"
      ],
      "required_edges": [],
      "applicable_decisions": [],
      "artifact_id": "specification:6a2320449b0782c87903d959db3f29803103c52d80fccc5c830a400ec5d2bc0a",
      "max_bytes": 65536
    },
    "before": {
      "model-digest": "402fd29a87ea0fa62e6e5ecd5373aa6d6cc9fc83a0eb9d68099c50c55c2341c9"
    },
    "after": {
      "model-digest": "402fd29a87ea0fa62e6e5ecd5373aa6d6cc9fc83a0eb9d68099c50c55c2341c9"
    },
    "effects": [],
    "outcome": "outcome:selection",
    "output": {
      "kind": "invalid-selection",
      "included_ids": [],
      "omitted_ids": [],
      "decision_ids": [],
      "artifact_id": "specification:6a2320449b0782c87903d959db3f29803103c52d80fccc5c830a400ec5d2bc0a",
      "used_bytes": 0,
      "required_bytes": 0
    }
  },
  "result": {
    "artifact_id": "specification:03e94a4d33af12456ea816c0ffa1ffc8482d3fd93ff6f46b4e3fbd752b2d2aa6",
    "operation_id": "assemble-context",
    "perspective": "intended",
    "verdict": "pass",
    "applicable_outcome_ids": [
      "outcome:selection"
    ],
    "uncertain_outcome_ids": [],
    "checks": [
      {
        "id": "outcome-condition",
        "description": "Reject an unknown operation selection.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:selection-tag",
        "description": "The error identifies an unknown selection.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "effects:allowed",
        "description": "Only effects allowed for this outcome occur.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "frame:model-digest",
        "description": "Preserve Input model content digest.",
        "verdict": "pass",
        "reason": null
      }
    ],
    "limitations": [
      "Checks apply only to the supplied observation and modeled rules. Source implementation is not executed or proved.",
      "analysis-limit: Does this context improve a fresh agent coding task?",
      "analysis-limit: Does the implementation select the least required closure?",
      "analysis-limit: Does used_bytes equal actual UTF-8 serialization?"
    ]
  }
}
```

</details>

### An invalid budget returns an explicit budget error

Operation: `assemble-context`. Scenario check: **pass**.

<details>
<summary>Open inputs, outcome, and checks</summary>

```json
{
  "observation": {
    "input": {
      "root_id": "root",
      "available_ids": [
        "root"
      ],
      "required_edges": [],
      "applicable_decisions": [],
      "artifact_id": "specification:6a2320449b0782c87903d959db3f29803103c52d80fccc5c830a400ec5d2bc0a",
      "max_bytes": 0
    },
    "before": {
      "model-digest": "402fd29a87ea0fa62e6e5ecd5373aa6d6cc9fc83a0eb9d68099c50c55c2341c9"
    },
    "after": {
      "model-digest": "402fd29a87ea0fa62e6e5ecd5373aa6d6cc9fc83a0eb9d68099c50c55c2341c9"
    },
    "effects": [],
    "outcome": "outcome:invalid-budget",
    "output": {
      "kind": "invalid-budget",
      "included_ids": [],
      "omitted_ids": [],
      "decision_ids": [],
      "artifact_id": "specification:6a2320449b0782c87903d959db3f29803103c52d80fccc5c830a400ec5d2bc0a",
      "used_bytes": 0,
      "required_bytes": 0
    }
  },
  "result": {
    "artifact_id": "specification:03e94a4d33af12456ea816c0ffa1ffc8482d3fd93ff6f46b4e3fbd752b2d2aa6",
    "operation_id": "assemble-context",
    "perspective": "intended",
    "verdict": "pass",
    "applicable_outcome_ids": [
      "outcome:invalid-budget"
    ],
    "uncertain_outcome_ids": [],
    "checks": [
      {
        "id": "outcome-condition",
        "description": "Reject a budget outside the supported integer range.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:invalid-budget-tag",
        "description": "The error identifies an invalid budget.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "effects:allowed",
        "description": "Only effects allowed for this outcome occur.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "frame:model-digest",
        "description": "Preserve Input model content digest.",
        "verdict": "pass",
        "reason": null
      }
    ],
    "limitations": [
      "Checks apply only to the supplied observation and modeled rules. Source implementation is not executed or proved.",
      "analysis-limit: Does this context improve a fresh agent coding task?",
      "analysis-limit: Does the implementation select the least required closure?",
      "analysis-limit: Does used_bytes equal actual UTF-8 serialization?"
    ]
  }
}
```

</details>

### An absent required dependency prevents a partial result

Operation: `assemble-context`. Scenario check: **pass**.

<details>
<summary>Open inputs, outcome, and checks</summary>

```json
{
  "observation": {
    "input": {
      "root_id": "root",
      "available_ids": [
        "root"
      ],
      "required_edges": [
        {
          "from": "root",
          "to": "absent"
        }
      ],
      "applicable_decisions": [],
      "artifact_id": "specification:4e9f6c71bb81667ebc7849793632805c6b9d72644f89870d1662326855e8a96e",
      "max_bytes": 65536
    },
    "before": {
      "model-digest": "c4f23dd978048b5508a30d96b8dd4840f1c3bc604d41292e76912bdc68f5042a"
    },
    "after": {
      "model-digest": "c4f23dd978048b5508a30d96b8dd4840f1c3bc604d41292e76912bdc68f5042a"
    },
    "effects": [],
    "outcome": "outcome:dependency",
    "output": {
      "kind": "missing-dependency",
      "included_ids": [],
      "omitted_ids": [],
      "decision_ids": [],
      "artifact_id": "specification:4e9f6c71bb81667ebc7849793632805c6b9d72644f89870d1662326855e8a96e",
      "used_bytes": 0,
      "required_bytes": 0
    }
  },
  "result": {
    "artifact_id": "specification:03e94a4d33af12456ea816c0ffa1ffc8482d3fd93ff6f46b4e3fbd752b2d2aa6",
    "operation_id": "assemble-context",
    "perspective": "intended",
    "verdict": "pass",
    "applicable_outcome_ids": [
      "outcome:dependency"
    ],
    "uncertain_outcome_ids": [],
    "checks": [
      {
        "id": "outcome-condition",
        "description": "Reject a missing required dependency.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:dependency-tag",
        "description": "The error identifies a missing dependency.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "effects:allowed",
        "description": "Only effects allowed for this outcome occur.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "frame:model-digest",
        "description": "Preserve Input model content digest.",
        "verdict": "pass",
        "reason": null
      }
    ],
    "limitations": [
      "Checks apply only to the supplied observation and modeled rules. Source implementation is not executed or proved.",
      "analysis-limit: Does this context improve a fresh agent coding task?",
      "analysis-limit: Does the implementation select the least required closure?",
      "analysis-limit: Does used_bytes equal actual UTF-8 serialization?"
    ]
  }
}
```

</details>

### Clearings assembles its own context\-assembly specification

Operation: `assemble-context`. Scenario check: **pass**.

<details>
<summary>Open inputs, outcome, and checks</summary>

```json
{
  "observation": {
    "input": {
      "root_id": "assemble-context",
      "available_ids": [
        "assemble-context",
        "select-required",
        "project-operation",
        "measure-package"
      ],
      "required_edges": [
        {
          "from": "assemble-context",
          "to": "select-required"
        },
        {
          "from": "assemble-context",
          "to": "project-operation"
        },
        {
          "from": "assemble-context",
          "to": "measure-package"
        }
      ],
      "applicable_decisions": [
        {
          "operation_id": "assemble-context",
          "decision_id": "decision:bootstrap-coverage"
        },
        {
          "operation_id": "assemble-context",
          "decision_id": "decision:minimum-closure"
        },
        {
          "operation_id": "assemble-context",
          "decision_id": "decision:encoding"
        },
        {
          "operation_id": "select-required",
          "decision_id": "decision:closure-errors"
        }
      ],
      "artifact_id": "specification:03e94a4d33af12456ea816c0ffa1ffc8482d3fd93ff6f46b4e3fbd752b2d2aa6",
      "max_bytes": 131072
    },
    "before": {
      "model-digest": "8309b342a1ef302f216f647b2e521ced7972b7668e42b2b5a81613e76f2c85b1"
    },
    "after": {
      "model-digest": "8309b342a1ef302f216f647b2e521ced7972b7668e42b2b5a81613e76f2c85b1"
    },
    "effects": [],
    "outcome": "outcome:ready",
    "output": {
      "kind": "ready",
      "included_ids": [
        "assemble-context",
        "measure-package",
        "project-operation",
        "select-required"
      ],
      "omitted_ids": [],
      "decision_ids": [
        "decision:bootstrap-coverage",
        "decision:minimum-closure",
        "decision:encoding",
        "decision:closure-errors"
      ],
      "artifact_id": "specification:03e94a4d33af12456ea816c0ffa1ffc8482d3fd93ff6f46b4e3fbd752b2d2aa6",
      "used_bytes": 29489,
      "required_bytes": 29489
    }
  },
  "result": {
    "artifact_id": "specification:03e94a4d33af12456ea816c0ffa1ffc8482d3fd93ff6f46b4e3fbd752b2d2aa6",
    "operation_id": "assemble-context",
    "perspective": "intended",
    "verdict": "pass",
    "applicable_outcome_ids": [
      "outcome:ready",
      "outcome:budget"
    ],
    "uncertain_outcome_ids": [],
    "checks": [
      {
        "id": "outcome-condition",
        "description": "Return the complete required context package.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:ready-tag",
        "description": "The result identifies a ready package.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:root-present",
        "description": "The selected operation is present.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:no-duplicates",
        "description": "Each operation appears once, including in cycles.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:known-records",
        "description": "Every included operation comes from this specification.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:dependency-closure",
        "description": "Every required dependency of an included operation is included.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:minimal-closure",
        "description": "Every included operation is reachable from the selected root through required edges.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:retain-decisions",
        "description": "Every open decision on an included operation remains available.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:omissions",
        "description": "Every available operation is included or explicitly omitted.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:disjoint-omissions",
        "description": "An included operation is never listed as omitted.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:identity",
        "description": "The package identifies the input specification.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:within-budget",
        "description": "The exact serialized output fits its byte budget.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "rule:required-size",
        "description": "This required-only package reports its full size as required.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "effects:allowed",
        "description": "Only effects allowed for this outcome occur.",
        "verdict": "pass",
        "reason": null
      },
      {
        "id": "frame:model-digest",
        "description": "Preserve Input model content digest.",
        "verdict": "pass",
        "reason": null
      }
    ],
    "limitations": [
      "Checks apply only to the supplied observation and modeled rules. Source implementation is not executed or proved.",
      "analysis-limit: Does this context improve a fresh agent coding task?",
      "analysis-limit: Does the implementation select the least required closure?",
      "analysis-limit: Does used_bytes equal actual UTF-8 serialization?"
    ]
  }
}
```

</details>

## State used by these rules

| State | Type | Meaning |
| --- | --- | --- |
| Input model content digest | string | The digest of the input JSON before and after assembly\. The conformance adapter measures it independently\. |

<a id="record-617373656d626c652d636f6e74657874"></a>
## Assemble context for a coding agent

Give an agent the selected operation and its required rules together\. Preserve open decisions and explain deferred lookups\. Return an explicit error when the required package cannot be produced\.

| Condition | Outcome | Required result |
| --- | --- | --- |
| \(input\.available\_ids contains input\.root\_id\) and \(every edge in input\.required\_edges: input\.available\_ids contains local\.edge\.to\) and \(\(input\.max\_bytes ≥ 1\) and \(input\.max\_bytes ≤ 2097152\)\) | Return the complete required context package\. | The result identifies a ready package\. The selected operation is present\. Each operation appears once, including in cycles\. Every included operation comes from this specification\. Every required dependency of an included operation is included\. Every included operation is reachable from the selected root through required edges\. Every open decision on an included operation remains available\. Every available operation is included or explicitly omitted\. An included operation is never listed as omitted\. The package identifies the input specification\. The exact serialized output fits its byte budget\. This required\-only package reports its full size as required\. |
| \(input\.available\_ids contains input\.root\_id\) and \(every edge in input\.required\_edges: input\.available\_ids contains local\.edge\.to\) and \(\(input\.max\_bytes ≥ 1\) and \(input\.max\_bytes ≤ 2097152\)\) | Report the required size without returning truncated context\. | The result identifies insufficient budget\. The measured required size exceeds the requested budget\. No truncated operation list is returned\. |
| not \(input\.available\_ids contains input\.root\_id\) | Reject an unknown operation selection\. | The error identifies an unknown selection\. |
| not \(every edge in input\.required\_edges: input\.available\_ids contains local\.edge\.to\) | Reject a missing required dependency\. | The error identifies a missing dependency\. |
| not \(\(input\.max\_bytes ≥ 1\) and \(input\.max\_bytes ≤ 2097152\)\) | Reject a budget outside the supported integer range\. | The error identifies an invalid budget\. |


| Implementation | Responsibility |
| --- | --- |
| assembleContext | Validate the specification, select required operations, attach state and evidence, and reject an insufficient budget\. |

- **analysis-limit:** Does this context improve a fresh agent coding task? This continuing\-session bootstrap checks behavior and counterexamples\. It does not establish independent agent benefit\.
- **analysis-limit:** Does the implementation select the least required closure? Typed rules check required closure and root reachability\. A separate reference algorithm also checks exact membership against actual assembler output\.
- **analysis-limit:** Does used\_bytes equal actual UTF\-8 serialization? The expression kernel compares supplied values\. The conformance adapter measures actual bytes independently\.

<details>
<summary>Types, state, effects, and exact rules</summary>

```json
{
  "alias": "assemble-context",
  "coverage": "complete",
  "decisions": [
    {
      "blocking": false,
      "consequence": "This continuing-session bootstrap checks behavior and counterexamples. It does not establish independent agent benefit.",
      "disposition": "analysis-limit",
      "evidence_ids": [],
      "id": "decision:bootstrap-coverage",
      "question": "Does this context improve a fresh agent coding task?"
    },
    {
      "blocking": false,
      "consequence": "Typed rules check required closure and root reachability. A separate reference algorithm also checks exact membership against actual assembler output.",
      "disposition": "analysis-limit",
      "evidence_ids": [],
      "id": "decision:minimum-closure",
      "question": "Does the implementation select the least required closure?"
    },
    {
      "blocking": false,
      "consequence": "The expression kernel compares supplied values. The conformance adapter measures actual bytes independently.",
      "disposition": "analysis-limit",
      "evidence_ids": [],
      "id": "decision:encoding",
      "question": "Does used_bytes equal actual UTF-8 serialization?"
    }
  ],
  "dependencies": [
    {
      "kind": "uses-contract",
      "operation_id": "select-required",
      "requirement": "required",
      "role": "Find the selected operation and all required dependencies; terminate on cycles."
    },
    {
      "kind": "uses-contract",
      "operation_id": "project-operation",
      "requirement": "required",
      "role": "Keep each operation purpose, conditions, outcomes, implementation roles, and unknowns together."
    },
    {
      "kind": "uses-contract",
      "operation_id": "measure-package",
      "requirement": "required",
      "role": "Measure serialized bytes including budget accounting before accepting the package."
    },
    {
      "kind": "uses-contract",
      "operation_id": "render-context",
      "requirement": "optional",
      "role": "Show the same package to a person in reading order."
    }
  ],
  "effects": {
    "allowed": [],
    "completeness": "complete"
  },
  "evidence_ids": [
    "design:context"
  ],
  "frame": "complete",
  "guarantees": [],
  "id": "assemble-context",
  "implementations": [
    {
      "evidence_ids": [],
      "name": "assembleContext",
      "responsibility": "Validate the specification, select required operations, attach state and evidence, and reject an insufficient budget.",
      "symbol_id": null
    }
  ],
  "inputs": {
    "applicable_decisions": {
      "element": {
        "fields": {
          "decision_id": {
            "kind": "string"
          },
          "operation_id": {
            "kind": "string"
          }
        },
        "kind": "record"
      },
      "kind": "list"
    },
    "artifact_id": {
      "kind": "string"
    },
    "available_ids": {
      "element": {
        "kind": "string"
      },
      "kind": "list"
    },
    "max_bytes": {
      "kind": "integer"
    },
    "required_edges": {
      "element": {
        "fields": {
          "from": {
            "kind": "string"
          },
          "to": {
            "kind": "string"
          }
        },
        "kind": "record"
      },
      "kind": "list"
    },
    "root_id": {
      "kind": "string"
    }
  },
  "name": "Assemble context for a coding agent",
  "outcome_policy": "allowed",
  "outcomes": [
    {
      "description": "Return the complete required context package.",
      "effects": [],
      "ensures": [
        {
          "description": "The result identifies a ready package.",
          "evidence_ids": [
            "design:context"
          ],
          "id": "rule:ready-tag",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [
                "kind"
              ],
              "root": "output"
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": "ready"
            }
          }
        },
        {
          "description": "The selected operation is present.",
          "evidence_ids": [
            "design:context"
          ],
          "id": "rule:root-present",
          "predicate": {
            "collection": {
              "kind": "ref",
              "path": [
                "included_ids"
              ],
              "root": "output"
            },
            "kind": "contains",
            "value": {
              "kind": "ref",
              "path": [
                "root_id"
              ],
              "root": "input"
            }
          }
        },
        {
          "description": "Each operation appears once, including in cycles.",
          "evidence_ids": [
            "design:context"
          ],
          "id": "rule:no-duplicates",
          "predicate": {
            "kind": "unique",
            "value": {
              "kind": "ref",
              "path": [
                "included_ids"
              ],
              "root": "output"
            }
          }
        },
        {
          "description": "Every included operation comes from this specification.",
          "evidence_ids": [
            "design:context"
          ],
          "id": "rule:known-records",
          "predicate": {
            "collection": {
              "kind": "ref",
              "path": [
                "available_ids"
              ],
              "root": "input"
            },
            "kind": "subset",
            "value": {
              "kind": "ref",
              "path": [
                "included_ids"
              ],
              "root": "output"
            }
          }
        },
        {
          "description": "Every required dependency of an included operation is included.",
          "evidence_ids": [
            "design:context"
          ],
          "id": "rule:dependency-closure",
          "predicate": {
            "collection": {
              "kind": "ref",
              "path": [
                "required_edges"
              ],
              "root": "input"
            },
            "kind": "every",
            "predicate": {
              "kind": "any",
              "terms": [
                {
                  "kind": "not",
                  "value": {
                    "collection": {
                      "kind": "ref",
                      "path": [
                        "included_ids"
                      ],
                      "root": "output"
                    },
                    "kind": "contains",
                    "value": {
                      "kind": "ref",
                      "path": [
                        "edge",
                        "from"
                      ],
                      "root": "local"
                    }
                  }
                },
                {
                  "collection": {
                    "kind": "ref",
                    "path": [
                      "included_ids"
                    ],
                    "root": "output"
                  },
                  "kind": "contains",
                  "value": {
                    "kind": "ref",
                    "path": [
                      "edge",
                      "to"
                    ],
                    "root": "local"
                  }
                }
              ]
            },
            "variable": "edge"
          }
        },
        {
          "description": "Every included operation is reachable from the selected root through required edges.",
          "evidence_ids": [
            "design:context"
          ],
          "id": "rule:minimal-closure",
          "predicate": {
            "collection": {
              "edges": {
                "kind": "ref",
                "path": [
                  "required_edges"
                ],
                "root": "input"
              },
              "kind": "reachable",
              "root": {
                "kind": "ref",
                "path": [
                  "root_id"
                ],
                "root": "input"
              }
            },
            "kind": "subset",
            "value": {
              "kind": "ref",
              "path": [
                "included_ids"
              ],
              "root": "output"
            }
          }
        },
        {
          "description": "Every open decision on an included operation remains available.",
          "evidence_ids": [
            "design:context"
          ],
          "id": "rule:retain-decisions",
          "predicate": {
            "collection": {
              "kind": "ref",
              "path": [
                "applicable_decisions"
              ],
              "root": "input"
            },
            "kind": "every",
            "predicate": {
              "kind": "any",
              "terms": [
                {
                  "kind": "not",
                  "value": {
                    "collection": {
                      "kind": "ref",
                      "path": [
                        "included_ids"
                      ],
                      "root": "output"
                    },
                    "kind": "contains",
                    "value": {
                      "kind": "ref",
                      "path": [
                        "decision",
                        "operation_id"
                      ],
                      "root": "local"
                    }
                  }
                },
                {
                  "collection": {
                    "kind": "ref",
                    "path": [
                      "decision_ids"
                    ],
                    "root": "output"
                  },
                  "kind": "contains",
                  "value": {
                    "kind": "ref",
                    "path": [
                      "decision",
                      "decision_id"
                    ],
                    "root": "local"
                  }
                }
              ]
            },
            "variable": "decision"
          }
        },
        {
          "description": "Every available operation is included or explicitly omitted.",
          "evidence_ids": [
            "design:context"
          ],
          "id": "rule:omissions",
          "predicate": {
            "collection": {
              "kind": "ref",
              "path": [
                "available_ids"
              ],
              "root": "input"
            },
            "kind": "every",
            "predicate": {
              "kind": "any",
              "terms": [
                {
                  "collection": {
                    "kind": "ref",
                    "path": [
                      "included_ids"
                    ],
                    "root": "output"
                  },
                  "kind": "contains",
                  "value": {
                    "kind": "ref",
                    "path": [
                      "id"
                    ],
                    "root": "local"
                  }
                },
                {
                  "collection": {
                    "kind": "ref",
                    "path": [
                      "omitted_ids"
                    ],
                    "root": "output"
                  },
                  "kind": "contains",
                  "value": {
                    "kind": "ref",
                    "path": [
                      "id"
                    ],
                    "root": "local"
                  }
                }
              ]
            },
            "variable": "id"
          }
        },
        {
          "description": "An included operation is never listed as omitted.",
          "evidence_ids": [
            "design:context"
          ],
          "id": "rule:disjoint-omissions",
          "predicate": {
            "collection": {
              "kind": "ref",
              "path": [
                "included_ids"
              ],
              "root": "output"
            },
            "kind": "every",
            "predicate": {
              "kind": "not",
              "value": {
                "collection": {
                  "kind": "ref",
                  "path": [
                    "omitted_ids"
                  ],
                  "root": "output"
                },
                "kind": "contains",
                "value": {
                  "kind": "ref",
                  "path": [
                    "id"
                  ],
                  "root": "local"
                }
              }
            },
            "variable": "id"
          }
        },
        {
          "description": "The package identifies the input specification.",
          "evidence_ids": [
            "design:context"
          ],
          "id": "rule:identity",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [
                "artifact_id"
              ],
              "root": "output"
            },
            "op": "eq",
            "right": {
              "kind": "ref",
              "path": [
                "artifact_id"
              ],
              "root": "input"
            }
          }
        },
        {
          "description": "The exact serialized output fits its byte budget.",
          "evidence_ids": [
            "design:context"
          ],
          "id": "rule:within-budget",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [
                "used_bytes"
              ],
              "root": "output"
            },
            "op": "lte",
            "right": {
              "kind": "ref",
              "path": [
                "max_bytes"
              ],
              "root": "input"
            }
          }
        },
        {
          "description": "This required-only package reports its full size as required.",
          "evidence_ids": [
            "design:context"
          ],
          "id": "rule:required-size",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [
                "used_bytes"
              ],
              "root": "output"
            },
            "op": "eq",
            "right": {
              "kind": "ref",
              "path": [
                "required_bytes"
              ],
              "root": "output"
            }
          }
        }
      ],
      "evidence_ids": [],
      "id": "outcome:ready",
      "transitions": [],
      "updates": [],
      "when": {
        "kind": "all",
        "terms": [
          {
            "collection": {
              "kind": "ref",
              "path": [
                "available_ids"
              ],
              "root": "input"
            },
            "kind": "contains",
            "value": {
              "kind": "ref",
              "path": [
                "root_id"
              ],
              "root": "input"
            }
          },
          {
            "collection": {
              "kind": "ref",
              "path": [
                "required_edges"
              ],
              "root": "input"
            },
            "kind": "every",
            "predicate": {
              "collection": {
                "kind": "ref",
                "path": [
                  "available_ids"
                ],
                "root": "input"
              },
              "kind": "contains",
              "value": {
                "kind": "ref",
                "path": [
                  "edge",
                  "to"
                ],
                "root": "local"
              }
            },
            "variable": "edge"
          },
          {
            "kind": "all",
            "terms": [
              {
                "kind": "compare",
                "left": {
                  "kind": "ref",
                  "path": [
                    "max_bytes"
                  ],
                  "root": "input"
                },
                "op": "gte",
                "right": {
                  "kind": "literal",
                  "value": 1
                }
              },
              {
                "kind": "compare",
                "left": {
                  "kind": "ref",
                  "path": [
                    "max_bytes"
                  ],
                  "root": "input"
                },
                "op": "lte",
                "right": {
                  "kind": "literal",
                  "value": 2097152
                }
              }
            ]
          }
        ]
      }
    },
    {
      "description": "Report the required size without returning truncated context.",
      "effects": [],
      "ensures": [
        {
          "description": "The result identifies insufficient budget.",
          "evidence_ids": [
            "design:context"
          ],
          "id": "rule:budget-tag",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [
                "kind"
              ],
              "root": "output"
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": "budget-exceeded"
            }
          }
        },
        {
          "description": "The measured required size exceeds the requested budget.",
          "evidence_ids": [
            "design:context"
          ],
          "id": "rule:budget-reason",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [
                "required_bytes"
              ],
              "root": "output"
            },
            "op": "gt",
            "right": {
              "kind": "ref",
              "path": [
                "max_bytes"
              ],
              "root": "input"
            }
          }
        },
        {
          "description": "No truncated operation list is returned.",
          "evidence_ids": [
            "design:context"
          ],
          "id": "rule:no-partial-return",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "length",
              "value": {
                "kind": "ref",
                "path": [
                  "included_ids"
                ],
                "root": "output"
              }
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": 0
            }
          }
        }
      ],
      "evidence_ids": [],
      "id": "outcome:budget",
      "transitions": [],
      "updates": [],
      "when": {
        "kind": "all",
        "terms": [
          {
            "collection": {
              "kind": "ref",
              "path": [
                "available_ids"
              ],
              "root": "input"
            },
            "kind": "contains",
            "value": {
              "kind": "ref",
              "path": [
                "root_id"
              ],
              "root": "input"
            }
          },
          {
            "collection": {
              "kind": "ref",
              "path": [
                "required_edges"
              ],
              "root": "input"
            },
            "kind": "every",
            "predicate": {
              "collection": {
                "kind": "ref",
                "path": [
                  "available_ids"
                ],
                "root": "input"
              },
              "kind": "contains",
              "value": {
                "kind": "ref",
                "path": [
                  "edge",
                  "to"
                ],
                "root": "local"
              }
            },
            "variable": "edge"
          },
          {
            "kind": "all",
            "terms": [
              {
                "kind": "compare",
                "left": {
                  "kind": "ref",
                  "path": [
                    "max_bytes"
                  ],
                  "root": "input"
                },
                "op": "gte",
                "right": {
                  "kind": "literal",
                  "value": 1
                }
              },
              {
                "kind": "compare",
                "left": {
                  "kind": "ref",
                  "path": [
                    "max_bytes"
                  ],
                  "root": "input"
                },
                "op": "lte",
                "right": {
                  "kind": "literal",
                  "value": 2097152
                }
              }
            ]
          }
        ]
      }
    },
    {
      "description": "Reject an unknown operation selection.",
      "effects": [],
      "ensures": [
        {
          "description": "The error identifies an unknown selection.",
          "evidence_ids": [
            "design:context"
          ],
          "id": "rule:selection-tag",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [
                "kind"
              ],
              "root": "output"
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": "invalid-selection"
            }
          }
        }
      ],
      "evidence_ids": [],
      "id": "outcome:selection",
      "transitions": [],
      "updates": [],
      "when": {
        "kind": "not",
        "value": {
          "collection": {
            "kind": "ref",
            "path": [
              "available_ids"
            ],
            "root": "input"
          },
          "kind": "contains",
          "value": {
            "kind": "ref",
            "path": [
              "root_id"
            ],
            "root": "input"
          }
        }
      }
    },
    {
      "description": "Reject a missing required dependency.",
      "effects": [],
      "ensures": [
        {
          "description": "The error identifies a missing dependency.",
          "evidence_ids": [
            "design:context"
          ],
          "id": "rule:dependency-tag",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [
                "kind"
              ],
              "root": "output"
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": "missing-dependency"
            }
          }
        }
      ],
      "evidence_ids": [],
      "id": "outcome:dependency",
      "transitions": [],
      "updates": [],
      "when": {
        "kind": "not",
        "value": {
          "collection": {
            "kind": "ref",
            "path": [
              "required_edges"
            ],
            "root": "input"
          },
          "kind": "every",
          "predicate": {
            "collection": {
              "kind": "ref",
              "path": [
                "available_ids"
              ],
              "root": "input"
            },
            "kind": "contains",
            "value": {
              "kind": "ref",
              "path": [
                "edge",
                "to"
              ],
              "root": "local"
            }
          },
          "variable": "edge"
        }
      }
    },
    {
      "description": "Reject a budget outside the supported integer range.",
      "effects": [],
      "ensures": [
        {
          "description": "The error identifies an invalid budget.",
          "evidence_ids": [
            "design:context"
          ],
          "id": "rule:invalid-budget-tag",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [
                "kind"
              ],
              "root": "output"
            },
            "op": "eq",
            "right": {
              "kind": "literal",
              "value": "invalid-budget"
            }
          }
        }
      ],
      "evidence_ids": [],
      "id": "outcome:invalid-budget",
      "transitions": [],
      "updates": [],
      "when": {
        "kind": "not",
        "value": {
          "kind": "all",
          "terms": [
            {
              "kind": "compare",
              "left": {
                "kind": "ref",
                "path": [
                  "max_bytes"
                ],
                "root": "input"
              },
              "op": "gte",
              "right": {
                "kind": "literal",
                "value": 1
              }
            },
            {
              "kind": "compare",
              "left": {
                "kind": "ref",
                "path": [
                  "max_bytes"
                ],
                "root": "input"
              },
              "op": "lte",
              "right": {
                "kind": "literal",
                "value": 2097152
              }
            }
          ]
        }
      }
    }
  ],
  "output": {
    "fields": {
      "artifact_id": {
        "kind": "string"
      },
      "decision_ids": {
        "element": {
          "kind": "string"
        },
        "kind": "list"
      },
      "included_ids": {
        "element": {
          "kind": "string"
        },
        "kind": "list"
      },
      "kind": {
        "kind": "enum",
        "values": [
          "ready",
          "invalid-selection",
          "missing-dependency",
          "invalid-budget",
          "budget-exceeded"
        ]
      },
      "omitted_ids": {
        "element": {
          "kind": "string"
        },
        "kind": "list"
      },
      "required_bytes": {
        "kind": "integer"
      },
      "used_bytes": {
        "kind": "integer"
      }
    },
    "kind": "record"
  },
  "purpose": "Give an agent the selected operation and its required rules together. Preserve open decisions and explain deferred lookups. Return an explicit error when the required package cannot be produced.",
  "reads": [
    "model-digest"
  ],
  "writes": []
}
```

</details>

<a id="record-6d6561737572652d7061636b616765"></a>
## Measure the serialized package

Count UTF\-8 bytes of compact JSON plus its final newline\. Include the counters themselves in the calculation\.

| Condition | Outcome | Required result |
| --- | --- | --- |
| true | Return the measured size and whether the package fits\. | The reported size equals independently measured bytes\. The fit decision includes the exact boundary\. |


| Implementation | Responsibility |
| --- | --- |
| accountBytes | Recalculate byte counters until their encoded digits no longer change the package size\. |


<details>
<summary>Types, state, effects, and exact rules</summary>

```json
{
  "alias": "measure-package",
  "coverage": "complete",
  "decisions": [],
  "dependencies": [],
  "effects": {
    "allowed": [],
    "completeness": "complete"
  },
  "evidence_ids": [
    "design:context"
  ],
  "frame": "complete",
  "guarantees": [],
  "id": "measure-package",
  "implementations": [
    {
      "evidence_ids": [],
      "name": "accountBytes",
      "responsibility": "Recalculate byte counters until their encoded digits no longer change the package size.",
      "symbol_id": null
    }
  ],
  "inputs": {
    "maximum_bytes": {
      "kind": "integer"
    },
    "measured_bytes": {
      "kind": "integer"
    }
  },
  "name": "Measure the serialized package",
  "outcome_policy": "exclusive",
  "outcomes": [
    {
      "description": "Return the measured size and whether the package fits.",
      "effects": [],
      "ensures": [
        {
          "description": "The reported size equals independently measured bytes.",
          "evidence_ids": [
            "design:context"
          ],
          "id": "rule:measured-bytes",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [
                "used_bytes"
              ],
              "root": "output"
            },
            "op": "eq",
            "right": {
              "kind": "ref",
              "path": [
                "measured_bytes"
              ],
              "root": "input"
            }
          }
        },
        {
          "description": "The fit decision includes the exact boundary.",
          "evidence_ids": [
            "design:context"
          ],
          "id": "rule:measured-fit",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [
                "fits"
              ],
              "root": "output"
            },
            "op": "eq",
            "right": {
              "kind": "compare",
              "left": {
                "kind": "ref",
                "path": [
                  "measured_bytes"
                ],
                "root": "input"
              },
              "op": "lte",
              "right": {
                "kind": "ref",
                "path": [
                  "maximum_bytes"
                ],
                "root": "input"
              }
            }
          }
        }
      ],
      "evidence_ids": [],
      "id": "outcome:measurement",
      "transitions": [],
      "updates": [],
      "when": {
        "kind": "literal",
        "value": true
      }
    }
  ],
  "output": {
    "fields": {
      "fits": {
        "kind": "boolean"
      },
      "used_bytes": {
        "kind": "integer"
      }
    },
    "kind": "record"
  },
  "purpose": "Count UTF-8 bytes of compact JSON plus its final newline. Include the counters themselves in the calculation.",
  "reads": [],
  "writes": []
}
```

</details>

<a id="record-70726f6a6563742d6f7065726174696f6e"></a>
## Project an operation for an agent

Keep the operation purpose and every conditional outcome in one record\. Each implementation entry explains that function’s own responsibility\.

| Condition | Outcome | Required result |
| --- | --- | --- |
| true | Return all outcomes and explicit implementation responsibilities\. | No outcome is lost in projection\. The purpose is present\. Each listed implementation role is nonempty\. |


| Implementation | Responsibility |
| --- | --- |
| assembleContext | Copy canonical operations and resolve dependency names while retaining their individual roles\. |
| renderOperationContext | Render the same rules as an article and decision table, with source details available in place\. |


<details>
<summary>Types, state, effects, and exact rules</summary>

```json
{
  "alias": "project-operation",
  "coverage": "complete",
  "decisions": [],
  "dependencies": [],
  "effects": {
    "allowed": [],
    "completeness": "complete"
  },
  "evidence_ids": [
    "design:context"
  ],
  "frame": "complete",
  "guarantees": [],
  "id": "project-operation",
  "implementations": [
    {
      "evidence_ids": [],
      "name": "assembleContext",
      "responsibility": "Copy canonical operations and resolve dependency names while retaining their individual roles.",
      "symbol_id": null
    },
    {
      "evidence_ids": [],
      "name": "renderOperationContext",
      "responsibility": "Render the same rules as an article and decision table, with source details available in place.",
      "symbol_id": null
    }
  ],
  "inputs": {
    "expected_outcome_ids": {
      "element": {
        "kind": "string"
      },
      "kind": "list"
    }
  },
  "name": "Project an operation for an agent",
  "outcome_policy": "exclusive",
  "outcomes": [
    {
      "description": "Return all outcomes and explicit implementation responsibilities.",
      "effects": [],
      "ensures": [
        {
          "description": "No outcome is lost in projection.",
          "evidence_ids": [
            "design:context"
          ],
          "id": "rule:all-outcomes",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "ref",
              "path": [
                "outcome_ids"
              ],
              "root": "output"
            },
            "op": "eq",
            "right": {
              "kind": "ref",
              "path": [
                "expected_outcome_ids"
              ],
              "root": "input"
            }
          }
        },
        {
          "description": "The purpose is present.",
          "evidence_ids": [
            "design:context"
          ],
          "id": "rule:purpose-present",
          "predicate": {
            "kind": "compare",
            "left": {
              "kind": "length",
              "value": {
                "kind": "ref",
                "path": [
                  "purpose"
                ],
                "root": "output"
              }
            },
            "op": "gt",
            "right": {
              "kind": "literal",
              "value": 0
            }
          }
        },
        {
          "description": "Each listed implementation role is nonempty.",
          "evidence_ids": [
            "design:context"
          ],
          "id": "rule:roles-present",
          "predicate": {
            "collection": {
              "kind": "ref",
              "path": [
                "implementation_roles"
              ],
              "root": "output"
            },
            "kind": "every",
            "predicate": {
              "kind": "compare",
              "left": {
                "kind": "length",
                "value": {
                  "kind": "ref",
                  "path": [
                    "role"
                  ],
                  "root": "local"
                }
              },
              "op": "gt",
              "right": {
                "kind": "literal",
                "value": 0
              }
            },
            "variable": "role"
          }
        }
      ],
      "evidence_ids": [],
      "id": "outcome:projection",
      "transitions": [],
      "updates": [],
      "when": {
        "kind": "literal",
        "value": true
      }
    }
  ],
  "output": {
    "fields": {
      "implementation_roles": {
        "element": {
          "kind": "string"
        },
        "kind": "list"
      },
      "outcome_ids": {
        "element": {
          "kind": "string"
        },
        "kind": "list"
      },
      "purpose": {
        "kind": "string"
      }
    },
    "kind": "record"
  },
  "purpose": "Keep the operation purpose and every conditional outcome in one record. Each implementation entry explains that function’s own responsibility.",
  "reads": [],
  "writes": []
}
```

</details>

<a id="record-73656c6563742d7265717569726564"></a>
## Select required dependencies

Traverse required dependency references once per operation\. Keep cycles finite and leave optional relationships deferred\.

| Condition | Outcome | Required result |
| --- | --- | --- |
| input\.available\_ids contains input\.root\_id | Return required operation IDs beginning with the selected root\. | The root belongs to the selected closure\. Every selected ID is reachable from the root through required edges\. The closure has no duplicate IDs\. Every selected required edge stays inside the closure\. |


| Implementation | Responsibility |
| --- | --- |
| requiredClosure | Use a queue and visited IDs to expand required references without recursion\. |

- **analysis-limit:** How are absent roots or targets reported? The public assembly operation specifies these errors\. This local contract covers a valid graph\.

<details>
<summary>Types, state, effects, and exact rules</summary>

```json
{
  "alias": "select-required",
  "coverage": "partial",
  "decisions": [
    {
      "blocking": false,
      "consequence": "The public assembly operation specifies these errors. This local contract covers a valid graph.",
      "disposition": "analysis-limit",
      "evidence_ids": [],
      "id": "decision:closure-errors",
      "question": "How are absent roots or targets reported?"
    }
  ],
  "dependencies": [],
  "effects": {
    "allowed": [],
    "completeness": "complete"
  },
  "evidence_ids": [
    "design:context"
  ],
  "frame": "complete",
  "guarantees": [],
  "id": "select-required",
  "implementations": [
    {
      "evidence_ids": [],
      "name": "requiredClosure",
      "responsibility": "Use a queue and visited IDs to expand required references without recursion.",
      "symbol_id": null
    }
  ],
  "inputs": {
    "available_ids": {
      "element": {
        "kind": "string"
      },
      "kind": "list"
    },
    "required_edges": {
      "element": {
        "fields": {
          "from": {
            "kind": "string"
          },
          "to": {
            "kind": "string"
          }
        },
        "kind": "record"
      },
      "kind": "list"
    },
    "root_id": {
      "kind": "string"
    }
  },
  "name": "Select required dependencies",
  "outcome_policy": "exclusive",
  "outcomes": [
    {
      "description": "Return required operation IDs beginning with the selected root.",
      "effects": [],
      "ensures": [
        {
          "description": "The root belongs to the selected closure.",
          "evidence_ids": [
            "design:context"
          ],
          "id": "rule:closure-root",
          "predicate": {
            "collection": {
              "kind": "ref",
              "path": [],
              "root": "output"
            },
            "kind": "contains",
            "value": {
              "kind": "ref",
              "path": [
                "root_id"
              ],
              "root": "input"
            }
          }
        },
        {
          "description": "Every selected ID is reachable from the root through required edges.",
          "evidence_ids": [
            "design:context"
          ],
          "id": "rule:closure-minimal",
          "predicate": {
            "collection": {
              "edges": {
                "kind": "ref",
                "path": [
                  "required_edges"
                ],
                "root": "input"
              },
              "kind": "reachable",
              "root": {
                "kind": "ref",
                "path": [
                  "root_id"
                ],
                "root": "input"
              }
            },
            "kind": "subset",
            "value": {
              "kind": "ref",
              "path": [],
              "root": "output"
            }
          }
        },
        {
          "description": "The closure has no duplicate IDs.",
          "evidence_ids": [
            "design:context"
          ],
          "id": "rule:closure-unique",
          "predicate": {
            "kind": "unique",
            "value": {
              "kind": "ref",
              "path": [],
              "root": "output"
            }
          }
        },
        {
          "description": "Every selected required edge stays inside the closure.",
          "evidence_ids": [
            "design:context"
          ],
          "id": "rule:closure-edges",
          "predicate": {
            "collection": {
              "kind": "ref",
              "path": [
                "required_edges"
              ],
              "root": "input"
            },
            "kind": "every",
            "predicate": {
              "kind": "any",
              "terms": [
                {
                  "kind": "not",
                  "value": {
                    "collection": {
                      "kind": "ref",
                      "path": [],
                      "root": "output"
                    },
                    "kind": "contains",
                    "value": {
                      "kind": "ref",
                      "path": [
                        "edge",
                        "from"
                      ],
                      "root": "local"
                    }
                  }
                },
                {
                  "collection": {
                    "kind": "ref",
                    "path": [],
                    "root": "output"
                  },
                  "kind": "contains",
                  "value": {
                    "kind": "ref",
                    "path": [
                      "edge",
                      "to"
                    ],
                    "root": "local"
                  }
                }
              ]
            },
            "variable": "edge"
          }
        }
      ],
      "evidence_ids": [],
      "id": "outcome:closure",
      "transitions": [],
      "updates": [],
      "when": {
        "collection": {
          "kind": "ref",
          "path": [
            "available_ids"
          ],
          "root": "input"
        },
        "kind": "contains",
        "value": {
          "kind": "ref",
          "path": [
            "root_id"
          ],
          "root": "input"
        }
      }
    }
  ],
  "output": {
    "element": {
      "kind": "string"
    },
    "kind": "list"
  },
  "purpose": "Traverse required dependency references once per operation. Keep cycles finite and leave optional relationships deferred.",
  "reads": [],
  "writes": []
}
```

</details>

## Relationships

These are declared dependencies. The labels state their purpose; they are not an execution trace.

| From | Target | Relationship | Role |
| --- | --- | --- | --- |
| Assemble context for a coding agent | Select required dependencies | uses\-contract | Find the selected operation and all required dependencies; terminate on cycles\. |
| Assemble context for a coding agent | Project an operation for an agent | uses\-contract | Keep each operation purpose, conditions, outcomes, implementation roles, and unknowns together\. |
| Assemble context for a coding agent | Measure the serialized package | uses\-contract | Measure serialized bytes including budget accounting before accepting the package\. |
| Assemble context for a coding agent | render\-context | uses\-contract | Show the same package to a person in reading order\. (deferred) |

## Source and design evidence

<a id="record-64657369676e3a636f6e74657874"></a>
<details>
<summary>docs/SPECIFICATION\_ARCHITECTURE\.md</summary>

Origin: design. SHA-256: `114b3da3e52397851a85fad60b55fa58a05cbabfe13d839141f319b58128263b`.

```text
# Typed specifications and Clearings self-development

This design replaces prose-linked records as the primary interface for new semantic work. Historical source models remain readable. They are evidence-bearing observations; they do not become intended requirements through conversion.

## Bootstrap decision

The first operation is **assemble agent context**. Its consumer needs a selected operation's purpose, conditional outcomes, effects, dependencies, implementation roles, and unknowns together. The operation takes a specification, a selection, and a byte budget. It returns a self-contained package or an explicit error. Required information is never silently truncated.

The specification is authored before the new implementation. The active coding session then implements it. This is a continuing-session self-development experiment, not a fresh or independent agent trial. The compiler, test runner, typed expression interpreter, and structural validator form the initial implementation foundation.

## Canonical model

The v0.3 specification has an explicit `perspective`: `intended` or `observed`. Its content identity binds all records and provenance. A source-derived record never receives requirement acceptance automatically.

An operation owns typed inputs and outputs, its own purpose, state reads/writes, conditional outcomes, guarantees, permitted effects, dependency roles, implementation responsibilities, and open decisions. Dependencies are typed references, not an execution trace. Cycles are valid. A transition links an outcome to a declared dependent operation, with a specific handoff role. A complete call graph is not claimed.

Conditions use an expression tree with literals, scoped references, boolean composition, comparisons, collection membership, bounded universal quantification, and bounded reachability over explicit string-ID edges. No source, JavaScript, or expression string is executed. `opaque` conditions retain unsupported meaning explicitly and evaluate to unknown. The interpreter reports pass, fail, or unknown. A model accepting a scenario is not a proof that source implements the model.

State fields have separate identities and types. A complete frame preserves every modeled field outside the write set; a partial frame makes no such guarantee. Effect declarations distinguish required from permitted effects. An empty complete effect list forbids effects; an empty partial list does not establish purity.

Open decisions distinguish unresolved requirements, analysis limits, and intentional implementation choices. Source anchors retain exact text and hashes. Source integrity and assertion support remain separate.

## Context assembly requirements

1. Resolve a root by exact ID or unique alias. Reject an absent or ambiguous root.
2. Follow required dependency edges to a fixed point. Select the smallest reachable set. Keep each operation once, including in cycles. Required dependency order is stable and starts with the selected operation.
3. Reject missing required dependencies. Optional dependencies may be absent, and remain listed as deferred references.
4. Return each operation's meaning with its fields inline. Dependency references include the target's name and the reason for the link. Implementation entries explain each function's individual responsibility.
5. Include all state fields and source records referenced by the selected operations. Keep every applicable open decision, including blocking decisions. A partial package is inspectable; it is not an accepted specification.
6. Report omitted operations and deferred optional links. An omitted branch inside a selected operation is never treated as optional.
7. Measure compact UTF-8 JSON plus one final newline. Include the accounting fields themselves. A budget equal to the required size succeeds; one byte less fails with the measured required size.
8. Selection, rendering, and checking do not mutate input records or execute analyzed source. Repeated input produces identical serialized output.
9. Bind context to the exact specification identity and perspective. Describe how to retrieve deferred information.

## Review before implementation

The author-reviewed cases are: a single operation; a diamond dependency; a dependency cycle; a missing root; a missing required edge; an absent optional target; a blocking unknown; exact and insufficient byte budgets; Unicode; a state write with an unchanged field; an undeclared effect; and an opaque condition. Independent held-out evaluation remains future work.

A later [fresh-agent experiment](../benchmarks/agent-runs/luna-impact-001/REPORT.md) used a separately frozen dependency-impact task. Its candidate passed the withheld feature checks. This does not change the authorship or evidence boundary of the original context-assembly bootstrap. The new task also exposed a gap: some executable predicates cover less than their English descriptions. The review must distinguish predicate results from unverified prose obligations.

The conformance checks must also reject deliberately incorrect implementations: dropping a required dependency, losing an unknown, claiming the wrong specification identity, silently truncating to fit, and changing input data. These cases live outside the specification consumed by the implementation.

## Human and agent interfaces

One report starts with purpose and a concrete scenario, then shows rules/outcomes, then implementation and evidence. The graph is a generated relationship view. It does not replace the conditions and guarantees. The agent gets the same rules as self-contained JSON or deterministic readable text; the HTML is a human view.

The legacy v0.2 adapter resolves assertion text without inventing formal predicates. Its prose remains explicitly unformalized. The Hono observed specification provides a separately authored typed response-selection slice with source links. Existing engineer and overview reports remain historical source-backed views.

## Scope

Implement the typed kernel, scenario checker, required-context closure, readable projections, CLI, Clearings specification/demo, and Hono response-selection example. Do not add a solver, hosted service, provider SDK, universal source-to-specification conversion, or automatic requirement acceptance. Formal proof, concurrency model checking, source equivalence, and fresh-agent performance evaluation are not established by this bootstrap.

## Review corrections and sequence integration

Equality validation rejects literals outside an enum domain and comparisons between disjoint enum domains. The `reachable` expression returns unique IDs reachable from its string root through supplied `{ from, to }` edges, including the root. It uses a bounded fixed-point calculation and returns unknown if observations or work are insufficient. The context contract uses this expression to exclude unrelated operations as well as require dependencies. This is a graph constraint over supplied data, not source execution.

The sequence-check addition has a separate frozen intended model and fresh-agent evaluation. It was integrated after independent test authorship and source review; those frozen inputs remain unchanged by these later core corrections. See [sequence checks](SEQUENCE_CHECKS.md).
```

</details>

## Context scope

29489 UTF-8 bytes in the canonical JSON package. Text rendering has a different size.

```json
{
  "deferred_dependencies": [
    {
      "available": false,
      "from_id": "assemble-context",
      "role": "Show the same package to a person in reading order.",
      "to_id": "render-context"
    }
  ],
  "operation_ids": []
}
```

Use inspect on this exact specification with \-\-operation &lt;id&gt;\. Source text is attached and hashed; hashes establish content integrity, not source authenticity\. Dependencies describe declared relationships, not an observed execution trace\.

Scenario checks evaluate supplied observations. They do not prove the implementation or authenticate requirements.
