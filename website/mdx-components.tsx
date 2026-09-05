import defaultComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { assetPath } from '@/lib/paths';
function DemoLink({ file, children }: { file: string; children: React.ReactNode }) {
  return <a href={assetPath(`demo/${file}`)}>{children}</a>;
}
export function getMDXComponents(components?: MDXComponents): MDXComponents { return { ...defaultComponents, DemoLink, ...components }; }
