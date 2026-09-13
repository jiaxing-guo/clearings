import Link from 'next/link';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { getLayoutOptions } from '@/lib/layout-options';
const paths = [
  [
    'Product requirements',
    'User-selected routines, explicit capabilities and reusable execution.',
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
        <h1>Let your agent discover the work. Reuse what it learns.</h1>
        <p>
          Clearings runs parameterized TypeScript routines inside a Rust executable. Your coding
          agent can turn repeated work into code with explicit inputs, outputs and host
          capabilities.
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
          Isolated execution, immutable routine storage, evaluation and activation are implemented.
          CLI/MCP lifecycle operations and agent integrations are the next steps. Token savings
          remain to be measured.
        </p>
      </main>
    </HomeLayout>
  );
}
