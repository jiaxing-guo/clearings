import Link from 'next/link';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { source } from '@/lib/source';
import { DocsHeader } from '@/components/docs-header';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <DocsLayout
      tree={source.getPageTree()}
      nav={{ title: 'Documentation', url: '/docs' }}
      themeSwitch={{ enabled: false }}
      slots={{ header: DocsHeader }}
      containerProps={{ className: 'documentation' }}
      sidebar={{
        collapsible: false,
        footer: (
          <div className="docs-sidebar-footer">
            <p>Have a workflow in mind?</p>
            <Link href="/docs/workflows">Start with one useful step →</Link>
          </div>
        ),
      }}
    >
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {children}
    </DocsLayout>
  );
}
