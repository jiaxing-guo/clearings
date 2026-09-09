const operation = (id, complete_frame = false, reads = [], writes = [], evidence_groups = []) => ({
  id,
  complete_frame,
  reads,
  writes,
  evidence_groups,
});
const maskIds = (ids, mask) => ids.filter((_, index) => mask & (1 << index));

export function* selectionCases() {
  // Complete Cartesian product: 4 selected sets × 4 frame assignments × 16 reads × 16 writes.
  for (let selected = 0; selected < 4; selected++)
    for (let frames = 0; frames < 4; frames++)
      for (let reads = 0; reads < 16; reads++)
        for (let writes = 0; writes < 16; writes++)
          yield {
            id: `states/${selected}/${frames}/${reads}/${writes}`,
            args: [
              maskIds(['a', 'b'], selected),
              [0, 1].map((i) =>
                operation(
                  ['a', 'b'][i],
                  Boolean(frames & (1 << i)),
                  maskIds(['x', 'y'], reads >> (i * 2)),
                  maskIds(['x', 'y'], writes >> (i * 2)),
                ),
              ),
              [
                { id: 'y', evidence_ids: ['v'] },
                { id: 'x', evidence_ids: ['u'] },
              ],
              ['v', 'u'],
            ],
          };
  // All seven declared evidence positions, independently present/absent, with operation/state membership.
  for (let selected = 0; selected < 2; selected++)
    for (let accessed = 0; accessed < 2; accessed++)
      for (let evidence = 0; evidence < 128; evidence++)
        yield {
          id: `evidence/${selected}/${accessed}/${evidence}`,
          args: [
            selected ? ['a'] : [],
            [
              operation(
                'a',
                false,
                accessed ? ['x'] : [],
                [],
                Array.from({ length: 6 }, (_, i) => (evidence & (1 << i) ? ['u'] : [])),
              ),
            ],
            [{ id: 'x', evidence_ids: evidence & 64 ? ['u'] : [] }],
            ['u'],
          ],
        };
  yield { id: 'empty', args: [[], [], [], []], expected: { state_ids: [], source_ids: [] } };
  yield {
    id: 'unselected-complete',
    args: [
      ['a'],
      [operation('a'), operation('b', true, [], [], [['u']])],
      [{ id: 'x', evidence_ids: ['v'] }],
      ['v', 'u'],
    ],
    expected: { state_ids: [], source_ids: [] },
  };
  yield {
    id: 'complete-state-evidence',
    args: [
      ['a'],
      [operation('a', true)],
      [
        { id: 'z', evidence_ids: ['v'] },
        { id: 'a', evidence_ids: ['u'] },
      ],
      ['v', 'u'],
    ],
    expected: { state_ids: ['a', 'z'], source_ids: ['u', 'v'] },
  };
  yield {
    id: 'duplicates',
    args: [
      ['a', 'a'],
      [operation('a', false, ['x', 'x'], ['x'], [['u', 'u']]), operation('a')],
      [
        { id: 'x', evidence_ids: ['u'] },
        { id: 'x', evidence_ids: ['v'] },
      ],
      ['v', 'u', 'u'],
    ],
    expected: { state_ids: ['x'], source_ids: ['u', 'v'] },
  };
  yield {
    id: 'unknown-identifiers',
    args: [
      ['absent', 'a'],
      [operation('a', false, ['missing'], [], [['missing']])],
      [{ id: 'x', evidence_ids: ['u'] }],
      ['u'],
    ],
    expected: { state_ids: [], source_ids: [] },
  };
  const ids = [
    '\uE000',
    '😀',
    '\uD800',
    'é',
    'e\u0301',
    'constructor',
    '__proto__',
    '2',
    '10',
    '\u0000',
    '',
  ];
  const ordered = [
    '',
    '\u0000',
    '10',
    '2',
    '__proto__',
    'constructor',
    'e\u0301',
    'é',
    '\uD800',
    '😀',
    '\uE000',
  ];
  yield {
    id: 'utf16-order',
    args: [['a'], [operation('a', true)], ids.map((id) => ({ id, evidence_ids: [id] })), ids],
    expected: { state_ids: ordered, source_ids: ordered },
  };
  for (const count of [16, 64, 128]) {
    const labels = Array.from({ length: count }, (_, i) => `id:${String(i).padStart(3, '0')}`);
    for (const shape of ['sparse', 'dense', 'complete']) {
      const args = [
        labels.slice(0, count / 2),
        labels.map((id, i) =>
          operation(
            id,
            shape === 'complete',
            shape === 'dense' ? labels : [labels[(i * 2) % count]],
            [],
            [[id, id]],
          ),
        ),
        labels.map((id) => ({ id, evidence_ids: [id] })),
        labels,
      ];
      yield { id: `${shape}/${count}`, args };
      yield {
        id: `${shape}/${count}/permuted`,
        args: [
          [...args[0]].reverse(),
          [...args[1]].reverse(),
          [...args[2]].reverse(),
          [...args[3]].reverse(),
        ],
      };
    }
  }
}
