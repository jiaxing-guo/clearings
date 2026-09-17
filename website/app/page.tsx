import Link from 'next/link';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { getLayoutOptions } from '@/lib/layout-options';
const paths = [
  [
    'Start with repeatable work',
    'Save the collection, parsing and checks your agent would otherwise rebuild.',
    '/docs/workflows',
  ],
  [
    'Try a routine',
    'Open the local workbench, change an input, and inspect the result.',
    '/docs/workbench',
  ],
  [
    'Keep control',
    'Pause learning, inspect use, and undo a change through conversation.',
    '/docs/management',
  ],
  [
    'Understand the boundary',
    'Fresh inputs, frozen examples, project grants and isolated execution.',
    '/docs/execution',
  ],
];
export default function Home() {
  return (
    <HomeLayout {...getLayoutOptions()}>
      <main className="home-intro">
        <p className="eyebrow">Reusable work for your coding agent</p>
        <h1>
          Save the work.
          <br />
          Run it again.
        </h1>
        <p>Clearings turns repeatable agent steps into tested routines that run on fresh inputs.</p>
        <div className="home-actions">
          <Link className="home-primary" href="/docs/installation">
            Get Clearings
          </Link>
          <Link href="/docs">Read the guide</Link>
        </div>
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
          Use skills for guidance and routines for executable steps. Clearings works with local
          Codex and Claude Code, using your existing authoring connection.
        </p>
      </main>
    </HomeLayout>
  );
}
