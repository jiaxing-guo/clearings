'use client';

import { useState } from 'react';
import data from '@/public/operation-explorer.json';

export default function OperationExplorer() {
  const [selected, setSelected] = useState(data.cases[0].id);
  const example = data.cases.find(item => item.id === selected)!;
  return <section className="operation-explorer not-prose" aria-labelledby="explorer-title">
    <div className="explorer-heading">
      <p className="eyebrow">Worked example · Hono response selection</p>
      <h2 id="explorer-title">Inspect an operation check</h2>
      <p>A direct handler result is nullish. Compare three authored observations of the same contract.</p>
    </div>
    <fieldset className="case-selector"><legend>Select an observation</legend>
      {data.cases.map(item => <label key={item.id} data-selected={selected === item.id}>
        <input type="radio" name="operation-case" value={item.id} checked={selected === item.id} onChange={() => setSelected(item.id)} />
        {item.name}
      </label>)}
    </fieldset>
    <div className="example-columns">
      <div className="example-panel"><h3>Selected contract branch</h3>
        <dl className="contract-terms">
          <dt>Guard</dt><dd><code>{data.guard}</code></dd>
          <dt>Postcondition</dt><dd><code>{Object.values(data.predicates).join('\n')}</code></dd>
          <dt>Outcome policy</dt><dd>{data.operation.outcome_policy}</dd>
          <dt>Coverage / state frame / effects</dt><dd>{data.operation.coverage} / {data.operation.frame} / {data.operation.effects.completeness}</dd>
        </dl>
      </div>
      <div className="example-panel"><h3>Supplied observation</h3><pre tabIndex={0}><code>{JSON.stringify(example.observation, null, 2)}</code></pre></div>
    </div>
    <div className="check-summary" role="status" aria-live="polite" aria-atomic="true">
      <span className="verdict" data-verdict={example.result.verdict}>{example.result.verdict}</span>
      <p>{example.explanation}</p>
    </div>
    <div className="check-table"><table><caption>Individual checks for the selected observation</caption>
      <thead><tr><th scope="col">Rule</th><th scope="col">Verdict</th><th scope="col">Evaluation</th></tr></thead>
      <tbody>{example.result.checks.map(check => <tr key={check.id}>
        <th scope="row"><code>{check.id}</code></th>
        <td><span className="verdict" data-verdict={check.verdict}>{check.verdict}</span></td>
        <td>{check.id === 'outcome-condition' ? <code>{data.guard}</code> : <code>{data.predicates[check.id as keyof typeof data.predicates]}</code>}
          <p>{check.reason ?? check.description}</p></td>
      </tr>)}</tbody>
    </table></div>
    <div className="example-boundary"><strong>Interpretation boundary</strong><p>These results were computed from authored observations using the Clearings checker. Selecting a case displays its recorded result; it does not execute Hono. This model has partial coverage, a partial state frame, and a partial effect boundary.</p></div>
    <details><summary>Exact operation contract and check result</summary>
      <p>The JSON below is taken from the specification and the checker output.</p>
      <h3>Operation contract</h3><pre tabIndex={0}><code>{JSON.stringify(data.operation, null, 2)}</code></pre>
      <h3>Check result</h3><pre tabIndex={0}><code>{JSON.stringify(example.result, null, 2)}</code></pre>
    </details>
  </section>;
}
