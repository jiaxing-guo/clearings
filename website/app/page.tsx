import Link from 'next/link';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { getLayoutOptions } from '@/lib/layout-options';
const paths = [
  [
    'Product requirements',
    'SDKs, adapters, execution policies and the proposed first workload.',
    '/docs/product',
  ],
  ['Development', 'Set up the documentation site and run the current checks.', '/docs/development'],
  ['Current status', 'What this repository contains and what remains to be built.', '/docs'],
  [
    'Project history',
    'Retrieve the earlier implementation and its recorded experiments.',
    '/docs/history',
  ],
];
export default function Home() {
  return (
    <HomeLayout {...getLayoutOptions()}>
      <main className="home-intro">
        <p className="eyebrow">Clearings · In development</p>
        <h1>Straightforward backend logic. Efficient execution as workloads grow.</h1>
        <p>
          We are designing TypeScript and Python SDKs that let engineers and coding agents describe
          application operations while Clearings handles batching, scoped reuse, concurrency and
          service limits.
        </p>
        <div className="reading-paths">
          {paths.map(([title, description, href]) => (
            <Link href={href} key={href} className="reading-path">
              <h2>
                {title}
                <span aria-hidden="true"> ↗</span>
              </h2>
              <p>{description}</p>
            </Link>
          ))}
        </div>
        <p className="home-note">
          This repository currently contains requirements and documentation infrastructure. The
          managed runtime, SDKs, adapters, CLI and MCP are not implemented yet. Performance benefits
          remain to be demonstrated.
        </p>
      </main>
    </HomeLayout>
  );
}
