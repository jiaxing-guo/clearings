import Link from 'next/link';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { getLayoutOptions } from '@/lib/layout-options';
const paths = [
  [
    'Product requirements',
    'SDKs, adapters, execution policies and the proposed first workload.',
    '/docs/product',
  ],
  [
    'Development',
    'Build the available SDKs and run execution and documentation checks.',
    '/docs/development',
  ],
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
          Clearings provides an execution boundary for backend read flows. Application logic
          describes operations and dependencies; the runtime manages scheduling, local capacity,
          cancellation and deadlines.
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
          The native core and SDKs are in development. See the current documentation for package
          availability and setup. Real service adapters, batching, reuse, shared quotas, CLI and MCP
          remain subsequent work. Performance benefits remain to be demonstrated.
        </p>
      </main>
    </HomeLayout>
  );
}
