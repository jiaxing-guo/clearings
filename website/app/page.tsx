import Link from 'next/link';
import { Brand, BrandMark } from '@/components/brand';
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
      <div className="hero-field">
        <div className="product-context">
          <span>For work worth repeating.</span>
          <span>Codex / Claude Code</span>
        </div>
        <section className="hero">
          <div className="hero-copy">
            <h1>
              Turn repeated AI work
              <br />
              <span>into reusable code.</span>
            </h1>
            <p>
              Clearings turns repeatable steps from your local agent's conversations into tested
              routines your agent can run again on fresh inputs.
            </p>
            <div className="hero-actions">
              <Link className="button" href="/docs/installation">
                Get Clearings <span aria-hidden="true">↗</span>
              </Link>
              <a className="text-link" href="#example">
                Try a routine <span aria-hidden="true">↓</span>
              </a>
            </div>
          </div>
          <div className="hero-emblem" aria-hidden="true">
            <BrandMark />
            <span>Good work. Kept.</span>
          </div>
        </section>
        <div className="hero-index">
          <span>01 / Find the repeatable</span>
          <span>02 / Test the routine</span>
          <span>03 / Run it again</span>
        </div>
      </div>
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
        <BrandMark className="closing-mark" />
      </section>
      <footer className="site-footer">
        <div className="footer-brand">
          <BrandMark />
          <span className="footer-word">clearings</span>
        </div>
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
