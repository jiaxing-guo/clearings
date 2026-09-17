'use client';

import Link from 'next/link';
import { useDocsLayout } from 'fumadocs-ui/layouts/docs';
import { Brand } from './brand';

export function DocsHeader() {
  const { slots } = useDocsLayout();
  const SidebarTrigger = slots.sidebar.trigger;
  const SearchTrigger = slots.searchTrigger && slots.searchTrigger.sm;
  return (
    <header className="docs-header">
      <Brand />
      <Link className="docs-home-link" href="/">
        Back to the site <span aria-hidden="true">↗</span>
      </Link>
      <div className="docs-mobile-controls">
        {SearchTrigger && <SearchTrigger aria-label="Search documentation" />}
        <SidebarTrigger className="docs-contents">Contents</SidebarTrigger>
      </div>
    </header>
  );
}
