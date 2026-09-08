import OperationExplorer from '@/components/operation-explorer';
import { source } from '@/lib/source';
import { notFound } from 'next/navigation';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/page';
import { getMDXComponents } from '@/mdx-components';
export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();
  const Content = page.data.body;
  const category = params.slug?.[0] === 'technical' ? params.slug[1] : undefined;
  const kinds: Record<string, string> = {
    learn: 'Learn Clearings',
    guides: 'Practical guide',
    semantics: 'Semantics reference',
    reference: 'Interface reference',
    architecture: 'Architecture',
    development: 'Development',
  };
  const kind = category ? kinds[category] : undefined;
  const explorer = page.url === '/docs/technical/semantics/operations';
  const toc = explorer
    ? [{ title: 'Inspect an operation check', url: '#explorer-title', depth: 2 }, ...page.data.toc]
    : page.data.toc;
  return (
    <DocsPage toc={toc} full={page.data.full}>
      {kind && <p className="eyebrow">{kind}</p>}
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        {explorer && <OperationExplorer />}
        <Content components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}
export function generateStaticParams() {
  return source.generateParams();
}
export async function generateMetadata(props: { params: Promise<{ slug?: string[] }> }) {
  const page = source.getPage((await props.params).slug);
  return { title: page?.data.title, description: page?.data.description };
}
