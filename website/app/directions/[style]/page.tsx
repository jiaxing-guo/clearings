import Link from 'next/link';
import { notFound } from 'next/navigation';
import { assetPath } from '@/lib/paths';
import { designs, type Direction } from '../designs';
export function generateStaticParams() {
  return Object.keys(designs).map((style) => ({ style }));
}
export async function generateMetadata({ params }: { params: Promise<{ style: string }> }) {
  const { style } = await params;
  if (!(style in designs)) notFound();
  return { title: `${designs[style as Direction].name} direction` };
}
export default async function DirectionPage({ params }: { params: Promise<{ style: string }> }) {
  const { style } = await params;
  if (!(style in designs)) notFound();
  const key = style as Direction;
  const design = designs[key];
  return (
    <main className={`direction ${key}`}>
      <div className="direction-rail">
        <Link href="/directions">All directions</Link>
        <div>
          {(Object.keys(designs) as Direction[]).map((name) => (
            <Link
              href={`/directions/${name}`}
              key={name}
              aria-current={name === key ? 'page' : undefined}
            >
              {designs[name].name}
            </Link>
          ))}
        </div>
        <a href="#documentation">Docs preview</a>
      </div>
      <header className="concept-nav">
        <Link className="concept-wordmark" href="/">
          Clearings
        </Link>
        <nav aria-label="Concept navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#documentation">Documentation</a>
          <Link href="/docs/installation" className="concept-button small">
            Get Clearings
          </Link>
        </nav>
      </header>
      <section className="concept-hero">
        <div className="hero-copy">
          <h1>
            {design.headline[0]}
            <br />
            {design.headline[1]}
          </h1>
          <p>{design.intro}</p>
          <div className="hero-actions">
            <Link href="/docs/installation" className="concept-button">
              Get Clearings <span aria-hidden="true">↗</span>
            </Link>
            <a href="#how-it-works" className="text-link">
              See how it works
            </a>
          </div>
        </div>
        <figure className="hero-art">
          <img
            src={assetPath(`/directions/${design.image}`)}
            width={1536}
            height={1024}
            alt={design.alt}
            fetchPriority="high"
          />
        </figure>
      </section>
      <section className="concept-method" id="how-it-works">
        <div className="method-title">
          <h2>Keep the repeatable part.</h2>
          <p>
            Let code collect, parse, check, and compare. Your agent handles the decisions and
            unfamiliar cases.
          </p>
        </div>
        <ol className="method-steps">
          <li>
            <h3>Show the work</h3>
            <p>Ask your agent to save a useful workflow or review recent project conversations.</p>
          </li>
          <li>
            <h3>Check the examples</h3>
            <p>
              Clearings tests the generated routine against criteria prepared before the source.
            </p>
          </li>
          <li>
            <h3>Run on fresh inputs</h3>
            <p>The agent reuses matching code. You can inspect, pause, extend, or undo it.</p>
          </li>
        </ol>
      </section>
      <section className="concept-workbench">
        <div className="workbench-copy">
          <h2>A routine you can inspect.</h2>
          <p>
            Try an input. Read the result. Say “make it handle this too.” Your examples stay
            visible.
          </p>
          <Link href="/docs/workbench" className="text-link">
            Explore the workbench <span aria-hidden="true">→</span>
          </Link>
        </div>
        <figure className="workbench-art">
          <img
            src={assetPath('/directions/workbench.png')}
            width={1440}
            height={1080}
            alt="Screenshot of the tested local workbench with sample routines and a completed test."
            loading="lazy"
          />
          <figcaption>Local workbench with sample routines.</figcaption>
        </figure>
      </section>
      <section className="concept-docs" id="documentation">
        <div className="docs-heading">
          <h2>A clear path into the details.</h2>
          <p>
            A matching documentation treatment, with room for both quick answers and deeper
            reference.
          </p>
        </div>
        <div className="docs-shell">
          <aside className="docs-navigation" aria-label="Documentation preview navigation">
            <span className="docs-brand">
              Clearings <small>Guide</small>
            </span>
            <a href="#doc-start" className="docs-selected">
              Start with a useful routine
            </a>
            <a href="#doc-choose">Choose the right work</a>
            <a href="#doc-teach">Teach with examples</a>
            <a href="#doc-reuse">Reuse and inspect</a>
            <div className="docs-group">
              <Link href="/docs/execution">Runtime and permissions</Link>
              <Link href="/docs/background">Background learning</Link>
              <Link href="/docs/management">Manage Clearings</Link>
            </div>
            <Link href="/docs" className="docs-all">
              Open the full guide <span aria-hidden="true">↗</span>
            </Link>
          </aside>
          <article className="docs-article" id="doc-start">
            <div className="docs-breadcrumb">Guide / Getting started</div>
            <h3>Start with a useful routine</h3>
            <p className="docs-lede">Save the steps that should not need to be worked out again.</p>
            <h4 id="doc-choose">Choose the right work</h4>
            <p>
              Look for repeated collection, parsing, validation, or comparison. A research-run audit
              is a good example: read the receipts, find missing evidence, and report what changed.
            </p>
            <div className="docs-note">
              <strong>Skills and routines work together.</strong>
              <p>
                A skill preserves guidance. A routine executes the repeatable steps. Your agent can
                use both.
              </p>
            </div>
            <h4 id="doc-teach">Teach with examples</h4>
            <p>
              Describe what should vary and what result you expect. Clearings freezes the examples
              before it evaluates the generated source.
            </p>
            <blockquote>
              “Make this receipt audit reusable. Keep technical completion separate from scientific
              conclusions.”
            </blockquote>
            <h4 id="doc-reuse">Reuse and inspect</h4>
            <p>
              Continue working normally. A matching routine reads fresh input and returns its
              result. Use the workbench to try an example, change the requirements, or restore the
              previous version.
            </p>
            <div className="docs-next">
              <span>Next</span>
              <Link href="/docs/workbench">
                Try it in the workbench <span aria-hidden="true">→</span>
              </Link>
            </div>
          </article>
          <aside className="docs-toc" aria-label="On this page">
            <span>On this page</span>
            <a href="#doc-choose">Choose the right work</a>
            <a href="#doc-teach">Teach with examples</a>
            <a href="#doc-reuse">Reuse and inspect</a>
          </aside>
        </div>
      </section>
      <footer className="concept-footer">
        <Link className="concept-wordmark" href="/">
          Clearings
        </Link>
        <p>Reusable execution for repeated agent work.</p>
        <div>
          <Link href="/docs">Guide</Link>
          <a href="https://github.com/jiaxing-guo/clearings">GitHub</a>
          <Link href="/directions">Review another direction</Link>
        </div>
      </footer>
    </main>
  );
}
