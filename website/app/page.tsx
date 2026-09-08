import Link from 'next/link';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { getLayoutOptions } from '@/lib/layout-options';
const paths = [
  [
    'Learn Clearings',
    'Follow one operation from its contract to an observation check.',
    '/docs/technical/learn/first-contract',
  ],
  [
    'Guides',
    'Check a Hono case or author and review a specification.',
    '/docs/technical/guides/check-a-case',
  ],
  [
    'Reference',
    'Look up expression semantics, operation fields, validation rules, and APIs.',
    '/docs/technical',
  ],
  [
    'Architecture',
    'Understand the representations, abstraction boundaries, and development evidence.',
    '/docs/technical/architecture/system',
  ],
];
export default function Home() {
  return (
    <HomeLayout {...getLayoutOptions()}>
      <main className="home-intro">
        <p className="eyebrow">Technical documentation</p>
        <h1>Understand and check operation contracts.</h1>
        <p>
          Clearings represents repository structure and proposed behavior, assembles bounded agent
          context, and checks supplied observations against typed contracts.
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
        <div className="home-example">
          <div>
            <p className="eyebrow">Start with an example</p>
            <h2>Why does an observation pass?</h2>
            <p>
              Compare a matching output, a conflicting output, and a missing output for the same
              Hono operation.
            </p>
          </div>
          <Link href="/docs/technical/semantics/operations">Explore operation checks →</Link>
        </div>
        <p className="home-note">
          The reference describes v0.3.0 contracts and their relationship to the earlier source
          models.{' '}
          <Link href="/docs/technical/development/status-and-roadmap">
            Implementation status and limitations
          </Link>
        </p>
      </main>
    </HomeLayout>
  );
}
