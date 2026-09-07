import { createMDX } from 'fumadocs-mdx/next';
import { fileURLToPath } from 'node:url';
const basePath = process.env.DOCS_BASE_PATH ?? '/clearings-semantic';
if (basePath && !/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(basePath)) throw new Error('DOCS_BASE_PATH must be empty or a path without a trailing slash.');
const withMDX = createMDX();
export default withMDX({
  output: 'export', trailingSlash: true, basePath,
  env: { NEXT_PUBLIC_DOCS_BASE_PATH: basePath },
  images: { unoptimized: true },
  turbopack: { root: fileURLToPath(new URL('.', import.meta.url)) },
});
