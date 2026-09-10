import type { SemanticSpecification } from './model.js';

export interface SelectionOperation {
  id: string;
  complete_frame: boolean;
  reads: string[];
  writes: string[];
  evidence_groups: string[][];
}
export interface SelectionState {
  id: string;
  evidence_ids: string[];
}
export type ContextSelectionArguments = [
  selected_ids: string[],
  operations: SelectionOperation[],
  states: SelectionState[],
  source_ids: string[],
];
export interface ContextSelection {
  state_ids: string[];
  source_ids: string[];
}

/** Copy declared metadata only. Membership, frame expansion, and ordering belong to IR. */
export function contextSelectionArguments(
  spec: SemanticSpecification,
  selectedIds: string[],
): ContextSelectionArguments {
  return [
    [...selectedIds],
    spec.operations.map((operation) => ({
      id: operation.id,
      complete_frame: operation.frame === 'complete',
      reads: [...operation.reads],
      writes: [...operation.writes],
      evidence_groups: [
        [...operation.evidence_ids],
        ...operation.guarantees.map((item) => [...item.evidence_ids]),
        ...operation.implementations.map((item) => [...item.evidence_ids]),
        ...operation.decisions.map((item) => [...item.evidence_ids]),
        ...operation.outcomes.flatMap((outcome) => [
          [...outcome.evidence_ids],
          ...outcome.ensures.map((item) => [...item.evidence_ids]),
        ]),
      ],
    })),
    spec.states.map((state) => ({ id: state.id, evidence_ids: [...state.evidence_ids] })),
    spec.sources.map((source) => source.id),
  ];
}
