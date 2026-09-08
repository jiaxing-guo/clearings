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
    'Execute a Program IR algorithm or author and review a specification.',
    '/docs/technical/guides/run-programs',
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
        <h1>Specify behavior. Execute typed programs.</h1>
        <p>
          Clearings is developing a compiler and execution runtime for agentic coding. Explore
          operation contracts, Program IR, reference execution, and independent conformance checks.
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
            <h2>Run a Clearings algorithm from IR.</h2>
            <p>
              Inspect and execute required dependency closure, then read its result, resource usage,
              and diagnostic completions.
            </p>
          </div>
          <Link href="/docs/technical/guides/run-programs">Run the closure program →</Link>
        </div>
        <p className="home-note">
          The reference describes v0.3.0 operation contracts and Program IR v0.1. The Rust backend
          generates native-executable modules; compiler conformance and CLI integration are next.{' '}
          <Link href="/docs/technical/development/status-and-roadmap">
            Implementation status and limitations
          </Link>
        </p>
      </main>
    </HomeLayout>
  );
}
