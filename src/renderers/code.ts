import type { CodeFocus } from '../presentation/plan.js';
import { anchor, html as h, markdown as md, codeFence, type Report } from './report.js';

/** Copy recorded lines without changing indentation, line endings, or source text. */
export function focusedCode(report: Report, focus: CodeFocus): string {
  const item = report.evidenceMap.get(focus.evidence_id)!;
  return item.text.split(/(?<=\n)|(?<=\r)(?!\n)|(?<=[\u2028\u2029])/u)
    .slice(focus.start_line - item.start_line, focus.end_line - item.start_line + 1).join('');
}

function codeRange(report: Report, focus: CodeFocus) {
  const item = report.evidenceMap.get(focus.evidence_id)!;
  const omitted = [
    ...(focus.start_line > item.start_line ? ['before'] : []),
    ...(focus.end_line < item.end_line ? ['after'] : []),
  ];
  return {
    item,
    text: focusedCode(report, focus),
    label: `${item.path}:${focus.start_line}–${focus.end_line}`,
    note: omitted.length ? `Partial excerpt. Code ${omitted.join(' and ')} this range is omitted.` : null,
    contextLabel: `Show surrounding source · lines ${item.start_line}–${item.end_line}`,
  };
}

/** A focusable scroll region keeps long source lines usable from the keyboard. */
export function sourceCodeHtml(text: string, label: string): string {
  return `<pre class="source-code" tabindex="0" role="region" aria-label="${h(label)}"><code>${h(text)}</code></pre>`;
}

export function codeFocusHtml(report: Report, focus: CodeFocus): string {
  const { item, text, label, note, contextLabel } = codeRange(report, focus);
  return `<figure class="code-focus"><figcaption><span>${h(label)}</span><a href="#${anchor(item.id)}">Source record</a></figcaption>`
    + (note ? `<div class="code-scope">${note}</div>` : '')
    + sourceCodeHtml(text, `Source code at ${label}`)
    + (note ? `<details class="code-context"><summary>${contextLabel}</summary>${sourceCodeHtml(item.text, `Surrounding source at ${item.path}:${item.start_line}–${item.end_line}`)}</details>` : '')
    + '</figure>';
}

export function codeFocusMarkdown(report: Report, focus: CodeFocus): string[] {
  const { item, text, label, note, contextLabel } = codeRange(report, focus);
  return [
    `Source excerpt: [${md(label)}](#${anchor(item.id)})`, '',
    ...(note ? [note, ''] : []),
    codeFence(text), '',
    ...(note ? ['<details>', `<summary>${contextLabel}</summary>`, '', codeFence(item.text), '', '</details>', ''] : []),
  ];
}
