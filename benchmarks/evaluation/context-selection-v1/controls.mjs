// Faults alter requirements or observations, never the candidate program.
export const selectionControls = [
  {
    id: 'ignore-complete-frame',
    editArgs: (args) =>
      args[1].forEach((op) => {
        op.complete_frame = false;
      }),
  },
  {
    id: 'ignore-reads',
    editArgs: (args) =>
      args[1].forEach((op) => {
        op.reads = [];
      }),
  },
  {
    id: 'ignore-writes',
    editArgs: (args) =>
      args[1].forEach((op) => {
        op.writes = [];
      }),
  },
  {
    id: 'include-unselected',
    editArgs: (args) => {
      args[0] = args[1].map((op) => op.id);
    },
  },
  {
    id: 'omit-state-evidence',
    editArgs: (args) =>
      args[2].forEach((state) => {
        state.evidence_ids = [];
      }),
  },
  ...Array.from({ length: 6 }, (_, index) => ({
    id: `omit-operation-evidence-${index}`,
    editArgs: (args) =>
      args[1].forEach((op) => {
        op.evidence_groups[index] = [];
      }),
  })),
  {
    id: 'duplicate-output',
    editOutput: (value) => {
      if (value.state_ids.length) value.state_ids.push(value.state_ids[0]);
    },
  },
  {
    id: 'reverse-order',
    editOutput: (value) => {
      value.state_ids.reverse();
      value.source_ids.reverse();
    },
  },
  {
    id: 'invent-source',
    editOutput: (value) => {
      value.source_ids.push('invented');
    },
  },
  {
    id: 'mutate-input',
    editAfter: (args) => {
      args[0].push('mutation');
    },
  },
];
