import tsParser from '@typescript-eslint/parser';

export default [
  {
    ignores: [
      '**/node_modules/**',
      'target/**',
      'dist/**',
      'runs/**',
      'benchmark-checkouts/**',
      '.clearings/**',
      '.venv-tools/**',
      'website/.next/**',
      'website/out/**',
      'website/.source/**',
      'website/content/docs/**',
      'website/next-env.d.ts',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs,jsx,ts,tsx}'],
    languageOptions: { parser: tsParser },
    rules: {
      'constructor-super': 'error',
      'no-async-promise-executor': 'error',
      'no-constant-binary-expression': 'error',
      'no-dupe-args': 'error',
      'no-dupe-else-if': 'error',
      'no-duplicate-case': 'error',
      'no-self-assign': 'error',
      'no-sparse-arrays': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
    },
  },
];
