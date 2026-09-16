import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
export function getLayoutOptions(): BaseLayoutProps {
  return {
    nav: { title: 'Clearings' },
    links: [
      { text: 'Get started', url: '/docs/installation' },
      { text: 'Guide', url: '/docs' },
      { text: 'Workbench', url: '/docs/workbench' },
      { text: 'Develop', url: '/docs/development' },
    ],
    githubUrl: 'https://github.com/jiaxing-guo/clearings',
  };
}
