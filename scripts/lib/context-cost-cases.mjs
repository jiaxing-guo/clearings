import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Authored deterministic workloads, independent of production selection output. */
export async function contextCostCases(root) {
  const { sealSpecification } = await import(pathToFileURL(resolve(root, 'dist/index.js')));
  const { createContextAssemblyCases } = await import(
    pathToFileURL(resolve(root, 'dist/conformance/index.js'))
  );
  const fixtures = createContextAssemblyCases();
  const template = fixtures.find((item) => item.case_id === 'optional-edges').invocation;
  const source = fixtures.find((item) => item.case_id === 'complete-frame-evidence').invocation
    .specification.sources[0];
  function synthetic(id, operations, states, sources, complete = false) {
    const invocation = structuredClone(template);
    const specification = invocation.specification;
    specification.name = `Context cost workload: ${id}`;
    specification.states = Array.from({ length: states }, (_, i) => ({
      id: `state-${i}`,
      name: `State ${i}`,
      description: 'Modeled state for an authored cost workload.',
      scope: 'invocation',
      type: { kind: 'string' },
      evidence_ids: sources ? [`source-${i % sources}`] : [],
    }));
    specification.sources = Array.from({ length: sources }, (_, i) => ({
      ...structuredClone(source),
      id: `source-${i}`,
    }));
    specification.operations = Array.from({ length: operations }, (_, i) => ({
      ...structuredClone(template.specification.operations[0]),
      id: `operation-${i}`,
      alias: `operation-${i}`,
      name: `Operation ${i}`,
      purpose: 'Preserve the complete selected operation and its supporting records.',
      frame: complete && i === 0 ? 'complete' : 'partial',
      reads: specification.states
        .filter((_, j) => j % operations === i && (!complete || j < operations))
        .map((state) => state.id),
      writes: [],
      evidence_ids: sources ? [`source-${i % sources}`] : [],
      outcomes: [
        {
          ...structuredClone(template.specification.operations[0].outcomes[0]),
          id: `outcome-${i}`,
          evidence_ids: sources ? [`source-${(i + 1) % sources}`] : [],
        },
      ],
      dependencies:
        i + 1 < operations
          ? [
              {
                operation_id: `operation-${i + 1}`,
                requirement: 'required',
                kind: 'uses-contract',
                role: 'Next required operation.',
              },
            ]
          : [],
    }));
    invocation.specification = sealSpecification(specification);
    invocation.selection = 'operation-0';
    invocation.options.maxBytes = 2_097_152;
    return { id, invocation };
  }
  return [
    {
      id: 'own-contract',
      invocation: {
        specification: JSON.parse(
          readFileSync(resolve(root, 'specifications/clearings/context-assembly.json')),
        ),
        selection: 'assemble-context',
        options: { maxBytes: 131_072 },
      },
    },
    synthetic('partial-32', 32, 64, 64),
    synthetic('complete-64', 64, 128, 128, true),
    synthetic('chain-128', 128, 0, 0),
    synthetic('states-512', 1, 512, 128),
  ];
}
