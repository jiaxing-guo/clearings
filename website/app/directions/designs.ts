export const designs = {
  signal: {
    name: 'Signal',
    tag: 'Precise. Technical. Immediate.',
    summary:
      'Graphite, lime, and a sharp grid. A strong identity for a tool that turns repeated work into reliable execution.',
    headline: ['Make good work', 'repeatable.'],
    intro: 'Clearings turns repeatable agent steps into tested routines that run on fresh inputs.',
    image: 'signal.png',
    alt: 'Generated concept artwork of machined graphite channels converging into one lime track.',
    dials: '7 / 3 / 4',
    recommendation:
      'The strongest developer-tool identity. Best if the landing page should feel direct and technical.',
  },
  fieldwork: {
    name: 'Fieldwork',
    tag: 'Readable. Grounded. Personal.',
    summary:
      'Open space, deep green, and an editorial rhythm. The documentation feels like a useful working reference.',
    headline: ['Keep useful work.', 'Within reach.'],
    intro: 'Your agent learns the routine. You keep the examples, controls, and room to change it.',
    image: 'fieldwork.png',
    alt: 'Generated concept artwork of tracing sheets revealing a shared green path.',
    dials: '6 / 3 / 3',
    recommendation:
      'The best reading-first direction. A calm fit for research workflows and a personal automation library.',
  },
  studio: {
    name: 'Studio',
    tag: 'Bold. Clear. Expressive.',
    summary:
      'Cobalt, oversized type, and crisp geometry. A more expressive launch treatment with a disciplined reading surface.',
    headline: ['Turn repeat work', 'into routines.'],
    intro: 'Capture a workflow, test its examples, and reuse its code through your coding client.',
    image: 'studio.png',
    alt: 'Generated concept artwork of silver rails converging into a continuous cobalt ribbon.',
    dials: '8 / 4 / 4',
    recommendation:
      'The most expressive launch direction. Best if Clearings should stand apart from familiar coding-tool pages.',
  },
} as const;
export type Direction = keyof typeof designs;
