import type { SemanticSpecification } from './model.js';
import { contextSelectionArguments, type ContextSelection } from './selection-input.js';
import { executeContextStage } from './native-context.js';

/** Copy schema metadata; all membership, frame expansion, union, and ordering run in IR. */
export function nativeContextSelection(
  spec: SemanticSpecification,
  selectedIds: string[],
): ContextSelection {
  return executeContextStage(
    'selection',
    contextSelectionArguments(spec, selectedIds),
  ) as unknown as ContextSelection;
}
