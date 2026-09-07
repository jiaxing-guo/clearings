import { source } from '@/lib/source';
import { notFound } from 'next/navigation';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/page';
import { getMDXComponents } from '@/mdx-components';
export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();
  const Content = page.data.body;
  return <DocsPage toc={page.data.toc} full={page.data.full}><DocsTitle>{page.data.title}</DocsTitle><DocsDescription>{page.data.description}</DocsDescription><DocsBody><Content components={getMDXComponents()} /></DocsBody></DocsPage>;
}
export function generateStaticParams() { return source.generateParams(); }
export async function generateMetadata(props: { params: Promise<{ slug?: string[] }> }) {
  const page = source.getPage((await props.params).slug);
  return { title: page?.data.title, description: page?.data.description };
}
