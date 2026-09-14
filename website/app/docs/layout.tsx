import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { source } from '@/lib/source';
import { getLayoutOptions } from '@/lib/layout-options';
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <DocsLayout tree={source.getPageTree()} {...getLayoutOptions()}>
      {children}
    </DocsLayout>
  );
}
