'use client';

import { useRef, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'fumadocs-ui/components/ui/tabs';

type ReceiptSet = 'mixed' | 'clean' | 'missing';
type ReceiptStatus = 'passed' | 'failed' | 'incomplete' | 'missing';
const messages: Record<Exclude<ReceiptStatus, 'passed'>, string> = {
  failed: 'Failed · exit code 1',
  incomplete: 'Incomplete · metrics absent',
  missing: 'Missing · no receipt found',
};

// Synthetic receipts only. This example never reads files or calls the runtime.
function auditSample(sample: ReceiptSet) {
  const rows = Array.from({ length: 8 }, (_, index) => {
    let status: ReceiptStatus = 'passed';
    if (sample === 'mixed' && index === 3) status = 'failed';
    if (sample === 'mixed' && index === 6) status = 'incomplete';
    if (sample === 'missing' && index === 7) status = 'missing';
    return { name: `run-${String(index + 1).padStart(2, '0')}`, status };
  });
  return {
    found: rows.filter((row) => row.status !== 'missing').length,
    issues: rows.filter((row) => row.status !== 'passed'),
  };
}

export function RoutineDemo() {
  const [sample, setSample] = useState<ReceiptSet>('mixed');
  const [view, setView] = useState('request');
  const [result, setResult] = useState<ReturnType<typeof auditSample> | null>(null);
  const resultTab = useRef<HTMLButtonElement>(null);
  const requestTab = useRef<HTMLButtonElement>(null);
  const run = () => {
    setResult(auditSample(sample));
    setView('result');
    resultTab.current?.focus({ preventScroll: true });
  };
  const runButton = (
    <button className="button run-demo" onClick={run}>
      Run sample <span aria-hidden="true">↗</span>
    </button>
  );

  return (
    <section className="demo" id="example" aria-label="Interactive sample routine">
      <div className="demo-top">
        <span className="mono">research / receipt-audit</span>
        <span className="demo-label">Browser-only sample</span>
      </div>
      <Tabs value={view} onValueChange={setView}>
        <TabsList className="demo-tabs" aria-label="Example view">
          <TabsTrigger value="request" ref={requestTab}>
            Request
          </TabsTrigger>
          <TabsTrigger value="routine">Saved routine</TabsTrigger>
          <TabsTrigger value="result" ref={resultTab}>
            Result
          </TabsTrigger>
        </TabsList>
        <div className="demo-body">
          <TabsContent value="request" className="demo-panel">
            <div className="request-line">
              <span className="avatar" aria-hidden="true">
                You
              </span>
              <p>
                Check the latest research runs.
                <br />
                <span>Show what needs my attention.</span>
              </p>
            </div>
            <div className="input-selection">
              <label htmlFor="sample-set">Receipt set</label>
              <select
                id="sample-set"
                value={sample}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === 'mixed' || value === 'clean' || value === 'missing') {
                    setSample(value);
                    setResult(null);
                  }
                }}
              >
                <option value="mixed">Mixed results</option>
                <option value="clean">All checks passed</option>
                <option value="missing">One receipt missing</option>
              </select>
            </div>
            <div className="file-list">
              <div>
                <span className="file-symbol" aria-hidden="true">
                  {'{ }'}
                </span>
                <span>manifest.json</span>
                <small>8 runs</small>
              </div>
              <div>
                <span className="file-symbol" aria-hidden="true">
                  [ ]
                </span>
                <span>receipts/</span>
                <small>Example files</small>
              </div>
              <div>
                <span className="file-symbol" aria-hidden="true">
                  ↔
                </span>
                <span>previous-summary.json</span>
                <small>Example baseline</small>
              </div>
            </div>
            <div className="demo-action">
              <span className="ready-label">Receipt audit is ready</span>
              {runButton}
            </div>
          </TabsContent>
          <TabsContent value="routine" className="demo-panel">
            <div className="code-heading">
              <span>receipt-audit.ts</span>
              <span>Illustrative routine</span>
            </div>
            <pre className="code">
              <code>{`export default async function audit(input) {
  const manifest = await readManifest(input);
  const receipts = await readReceipts(manifest);
  return {
    status: 'completed',
    output: summarize(receipts),
  };
}`}</code>
            </pre>
            <p className="code-note">
              The saved routine handles collection and checks. The agent interprets the findings.
            </p>
            {runButton}
          </TabsContent>
          <TabsContent value="result" className="demo-panel" aria-live="polite">
            {result ? (
              <div className="result-content">
                <div className="result-title">
                  <strong>
                    {result.issues.length ? 'These runs need attention' : 'All checks passed'}
                  </strong>
                  <span className="result-badge">Sample result</span>
                </div>
                <div className="result-metrics">
                  <div>
                    <strong>{result.found}/8</strong>
                    <span>receipts found</span>
                  </div>
                  <div>
                    <strong>{result.issues.length}</strong>
                    <span>need attention</span>
                  </div>
                </div>
                {result.issues.length ? (
                  result.issues.map((row) => (
                    <div className="result-row" key={row.name}>
                      <code>{row.name}</code>
                      <span>{row.status !== 'passed' && messages[row.status]}</span>
                    </div>
                  ))
                ) : (
                  <div className="result-row">
                    <span>Every expected receipt is present and passed.</span>
                  </div>
                )}
                <p className="result-note">
                  Computed from example data in this browser. No model or Clearings runtime was
                  called.
                </p>
                <button
                  className="rerun"
                  onClick={() => {
                    setView('request');
                    requestTab.current?.focus({ preventScroll: true });
                  }}
                >
                  Try another receipt set →
                </button>
              </div>
            ) : (
              <div className="empty-result">
                <p>No result yet.</p>
                <span>Run the sample against a receipt set.</span>
                {runButton}
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>
      <div className="demo-foot">
        <span>Example data</span>
        <span>Runs in your browser</span>
      </div>
    </section>
  );
}
