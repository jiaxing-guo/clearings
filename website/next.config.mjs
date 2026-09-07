import { createMDX } from 'fumadocs-mdx/next';
import constants from 'next/constants.js';
import { fileURLToPath } from 'node:url';
const withMDX = createMDX();
export default function configure(phase) {
  const development = phase === constants.PHASE_DEVELOPMENT_SERVER;
  const basePath = process.env.DOCS_BASE_PATH ?? (development ? '' : '/clearings');
  if (basePath && !/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(basePath)) throw new Error('DOCS_BASE_PATH must be empty or a path without a trailing slash.');
  return withMDX({
    output: 'export', trailingSlash: true, basePath,
    env: { NEXT_PUBLIC_DOCS_BASE_PATH: basePath },
    images: { unoptimized: true },
    turbopack: { root: fileURLToPath(new URL('.', import.meta.url)) },
  });
}
