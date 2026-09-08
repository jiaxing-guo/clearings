import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { documentationTree } from '@/lib/navigation';
import { baseOptions } from '@/lib/layout.shared';
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <DocsLayout tree={documentationTree} {...baseOptions()}>
      {children}
    </DocsLayout>
  );
}
