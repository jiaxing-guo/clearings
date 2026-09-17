import Link from 'next/link';
import { Brand } from '@/components/brand';
import { RoutineDemo } from '@/components/landing/routine-demo';
import { RoutineStory } from '@/components/landing/routine-story';
import './landing.css';
export default function Home() {
  return (
    <main className="marketing" id="main-content">
      <a href="#example" className="skip-link">
        Skip to example
      </a>
      <header className="site-nav">
        <Brand />
        <nav aria-label="Main">
          <Link href="/#how">How it works</Link>
          <Link href="/docs">Documentation</Link>
          <a href="https://github.com/jiaxing-guo/clearings">
            GitHub
            <span aria-hidden={true}>↗</span>
          </a>
        </nav>
        <Link className="button compact" href="/docs/installation">
          Get Clearings
        </Link>
      </header>
      <div className="product-context">
        <span>For work worth repeating.</span>
        <span>Codex · Claude Code</span>
      </div>
      <section className="hero">
        <div className="hero-copy">
          <h1>
            Useful work,
            <br />
            <span>on file.</span>
          </h1>
          <p>
            Turn repeated agent work into reusable code.
            <br />
            Make room for what comes next.
          </p>
          <div className="hero-actions">
            <a className="button" href="#example">
              Try a routine
              <span aria-hidden={true}>↗</span>
            </a>
            <Link className="text-link" href="/docs">
              Read the docs
              <span aria-hidden={true}>→</span>
            </Link>
          </div>
        </div>
        <div className="paper-scene" aria-hidden={true}>
          <div className="paper input-paper">
            <span className="paper-label">The work</span>
            <span className="paper-title">
              Read.
              <br />
              Check.
              <br />
              Compare.
            </span>
            <div className="paper-lines">
              <i></i>
              <i></i>
              <i></i>
            </div>
            <span className="paper-caption">research / receipts</span>
          </div>
          <div className="paper saved-paper">
            <span className="paper-label">The part you keep</span>
            <span className="paper-code">{'{ }'}</span>
            <span className="paper-title">receipt-audit.ts</span>
            <span className="paper-caption">Ready for the next run</span>
            <span className="paper-stamp">REUSABLE</span>
          </div>
        </div>
      </section>
      <div className="demo-stage">
        <div className="sample-intro">
          <span className="sample-note">Take it for a spin</span>
          <h2>
            Small routine.
            <br />
            Useful result.
          </h2>
          <p>Read the files. Find the exceptions. Leave the interpretation to your agent.</p>
          <div className="sample-instruction">
            <span aria-hidden={true}>↳</span>
            <span>
              Change the receipt set.
              <br />
              Run it again.
            </span>
          </div>
        </div>
        <RoutineDemo />
      </div>
      <RoutineStory />
      <section className="division">
        <h2>
          Keep the thinking.
          <br />
          <span>Lose the repetition.</span>
        </h2>
        <div className="division-body">
          <p>
            Keep judgment with your agent. Save the collection, parsing, and checking that it should
            not need to rebuild.
          </p>
          <dl>
            <div>
              <dt>Good routine</dt>
              <dd>Audit research receipts and return the exceptions.</dd>
            </div>
            <div>
              <dt>Keep with the agent</dt>
              <dd>Decide what those exceptions mean for the research.</dd>
            </div>
          </dl>
        </div>
      </section>
      <section className="control-section">
        <h2>Still yours to change.</h2>
        <div className="control-layout">
          <div className="conversation">
            <p className="prompt">“Pause learning.”</p>
            <p className="response">
              You can pause, change the schedule, or undo an update through your coding client.
            </p>
            <Link className="text-link" href="/docs/management">
              Explore the controls
              <span aria-hidden={true}>→</span>
            </Link>
          </div>
          <div className="control-list">
            <div>
              <span>Examples before activation</span>
              <b>Checked</b>
            </div>
            <div>
              <span>Generated code</span>
              <b>Isolated</b>
            </div>
            <div>
              <span>File access</span>
              <b>Project grants</b>
            </div>
            <div>
              <span>Your routine library</span>
              <b>Local</b>
            </div>
          </div>
        </div>
      </section>
      <section className="closing">
        <div>
          <h2>
            The next task
            <br />
            gets a head start.
          </h2>
          <p>Start with one workflow worth keeping.</p>
          <Link className="button" href="/docs/workflows">
            Find your first routine
            <span aria-hidden={true}>↗</span>
          </Link>
        </div>
        <div className="closing-stack" aria-hidden={true}>
          <div className="closing-file">
            <span>clearings</span>
            <strong>
              Good work.
              <br />
              Kept.
            </strong>
            <small>Ready when it fits.</small>
          </div>
        </div>
      </section>
      <footer className="site-footer">
        <span className="footer-word">clearings</span>
        <div>
          <Link href="/docs">Documentation</Link>
          <a href="https://github.com/jiaxing-guo/clearings">Source code ↗</a>
          <Link href="/docs/development">Development</Link>
        </div>
        <p>
          The interactive sample uses example data in your browser. No model or Clearings runtime is
          called.
        </p>
      </footer>
    </main>
  );
}
