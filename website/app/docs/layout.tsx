import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { documentationTree } from '@/lib/navigation';
import { getLayoutOptions } from '@/lib/layout-options';
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <DocsLayout tree={documentationTree} {...getLayoutOptions()}>
      {children}
    </DocsLayout>
  );
}
