'use client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'fumadocs-ui/components/ui/tabs';

export function RoutineStory() {
  return (
    <section className="how story" id="how">
      <div className="story-heading">
        <h2>
          Good work deserves
          <br />a second act.
        </h2>
        <p>
          One useful step. A few checked examples.
          <br />A tool your agent can reach for again.
        </p>
      </div>
      <Tabs defaultValue="learn" orientation="vertical" className="story-layout">
        <TabsList className="story-tabs" aria-label="Routine lifecycle">
          <TabsTrigger value="learn">
            <span className="story-tab-title">
              Find the useful part.<span aria-hidden="true">↗</span>
            </span>
            <span className="story-tab-copy">
              Ask your agent to turn a repeated step into a routine.
            </span>
          </TabsTrigger>
          <TabsTrigger value="check">
            <span className="story-tab-title">
              Give it a proper test.<span aria-hidden="true">↗</span>
            </span>
            <span className="story-tab-copy">Define good results before the code is accepted.</span>
          </TabsTrigger>
          <TabsTrigger value="reuse">
            <span className="story-tab-title">
              Let it do that again.<span aria-hidden="true">↗</span>
            </span>
            <span className="story-tab-copy">
              Run saved code on fresh inputs when the next task fits.
            </span>
          </TabsTrigger>
        </TabsList>
        <div className="story-stage">
          <TabsContent value="learn" className="story-panel">
            <div className="note-sheet">
              <span className="sheet-label">From your conversation</span>
              <p className="sheet-quote">
                “We keep checking
                <br />
                these receipts.
                <br />
                <mark>Make this reusable.</mark>”
              </p>
              <div className="sheet-rule"></div>
              <p className="sheet-bottom">
                Keep: collecting and checking files.
                <br />
                Leave: deciding what the findings mean.
              </p>
            </div>
            <span className="stage-caption">Illustrative workflow</span>
          </TabsContent>
          <TabsContent value="check" className="story-panel">
            <div className="note-sheet check-sheet">
              <span className="sheet-label">Examples before activation</span>
              <p className="sheet-title">
                What should
                <br />
                happen?
              </p>
              <div className="case-line">
                <span>All receipts present</span>
                <strong>Summarize</strong>
              </div>
              <div className="case-line">
                <span>One receipt missing</span>
                <strong>Report it</strong>
              </div>
              <div className="case-line">
                <span>Malformed record</span>
                <strong>Fail clearly</strong>
              </div>
              <p className="sheet-bottom">The candidate must pass the fixed checks.</p>
            </div>
            <span className="stage-caption">Illustrative acceptance cases</span>
          </TabsContent>
          <TabsContent value="reuse" className="story-panel">
            <div className="note-sheet reuse-sheet">
              <span className="sheet-label">Next time the work comes up</span>
              <p className="sheet-title">
                Fresh files.
                <br />
                <mark>Same useful code.</mark>
              </p>
              <div className="reuse-flow">
                <span>New receipts</span>
                <b aria-hidden={true}>↓</b>
                <code>receipt-audit.ts</code>
                <b aria-hidden={true}>↓</b>
                <span>A compact summary</span>
              </div>
              <p className="sheet-bottom">Your agent takes the next decision.</p>
            </div>
            <span className="stage-caption">Routine reuse, not a cached answer</span>
          </TabsContent>
        </div>
      </Tabs>
    </section>
  );
}
