import Link from 'next/link';
import { source } from '@/lib/source';
import { historicalRoutes, historicalSource } from '@/lib/history';
import { notFound } from 'next/navigation';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/page';
import { getMDXComponents } from '@/mdx-components';
const route = (slug?: string[]) => '/docs' + (slug?.length ? '/' + slug.join('/') : '');
export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) {
    const original = historicalRoutes[route(params.slug)];
    if (!original) notFound();
    return (
      <DocsPage toc={[]}>
        <DocsTitle>Historical documentation</DocsTitle>
        <DocsBody>
          <p>
            This page described the earlier Clearings analyzer, specification engine or compiler.
            That implementation has been retired from the active repository.
          </p>
          <p>
            <a href={historicalSource(original)}>
              Read the original page at its preserved revision
            </a>
            .
          </p>
          <p>
            See <Link href="/docs/history">project history</Link> for retrieval instructions, or the{' '}
            <Link href="/docs">current documentation</Link> for the local agent runtime.
          </p>
        </DocsBody>
      </DocsPage>
    );
  }
  const Content = page.data.body;
  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <Content components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}
export function generateStaticParams() {
  const current = new Set(source.getPages().map((page) => page.url));
  return [
    ...source.generateParams(),
    ...Object.keys(historicalRoutes)
      .filter((url) => !current.has(url))
      .map((url) => ({ slug: url.slice('/docs/'.length).split('/') })),
  ];
}
export async function generateMetadata(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  return page
    ? { title: page.data.title, description: page.data.description }
    : { title: 'Historical documentation', robots: { index: false, follow: true } };
}
