import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderCapability, validatePresentationPlan } from '../dist/index.js';
import { modelFields } from '../dist/semantics/validate.js';
import { focusedCode, codeFocusHtml, codeFocusMarkdown } from '../dist/renderers/code.js';
import { codeFence } from '../dist/renderers/report.js';
import { contentId, digest } from '../dist/semantics/identity.js';
const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const request = read('../benchmarks/proposals/hono/request.json');
const proposal = read('../benchmarks/proposals/hono/response.json');
function modelFor(response = proposal) {
  const { claim_checks, ...fields } = modelFields(response, request);
  const model = {
    schema_version: '0.1.0',
    command: 'import',
    artifact_id: '',
    snapshot_id: request.snapshot_id,
    data: {
      transport: 'recorded-replay',
      request,
      proposal: response,
      proposal_id: digest('proposal', response),
      claim_checks,
    },
    ...fields,
  };
  return { ...model, artifact_id: contentId(model) };
}
const model = modelFor();
const planFor = (alias) => read(`../benchmarks/presentations/hono/${alias}.json`);
const decoded = (text) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

// Integrity tests cover omissions and stale references. They do not certify English entailment.
test('both audiences and formats retain claims, branches, unknowns, and source without changing the model', () => {
  const before = JSON.stringify(model);
  for (const alias of ['request-dispatch', 'middleware-composition']) {
    const presentation = planFor(alias);
    validatePresentationPlan(presentation, model, alias);
    for (const audience of ['overview', 'engineer']) {
      const options = { presentation, audience };
      const html = renderCapability(model, alias, { ...options, format: 'html' });
      const markdown = renderCapability(model, alias, options);
      assert.equal(html, renderCapability(model, alias, { ...options, format: 'html' }));
      assert.equal(markdown, renderCapability(model, alias, options));
      const ids = proposal.data.claims
        .filter((claim) => claim.subject_ids.includes(presentation.capability_id))
        .map((claim) => claim.id);
      const flow = proposal.data.flows.find(
        (flow) => flow.capability_id === presentation.capability_id,
      );
      for (const id of [...ids, ...flow.steps.map((step) => step.id)]) {
        for (const page of [html, markdown]) assert(page.includes(`id="${id.replace(':', '-')}"`));
      }
      for (const [index, unknown] of proposal.data.unknowns.entries()) {
        if (unknown.subject_id === presentation.capability_id || unknown.critical) {
          for (const page of [html, markdown]) assert(page.includes(`id="unknown-${index}"`));
        }
      }
      // All generated fragment links resolve, including targets inside collapsed details.
      for (const page of [html, markdown]) {
        const anchors = [...page.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
        assert.equal(new Set(anchors).size, anchors.length);
        for (const match of page.matchAll(/href="#([^"]+)"|\]\(#([^)]*)\)/g)) {
          assert(anchors.includes(match[1] ?? match[2]), match[0]);
        }
        assert(page.includes(model.artifact_id));
        assert(page.includes(request.data.scan_artifact_id));
      }
      // Exact source is always retained; article code focuses must be exact subspans.
      const blocks = [...html.matchAll(/<pre\b[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].map(
        (match) => decoded(match[1]),
      );
      for (const source of blocks)
        assert(source.trim() && request.data.evidence.some((item) => item.text.includes(source)));
      for (const item of request.data.evidence) {
        if (html.includes(`id="${item.id.replace(':', '-')}"`)) assert(blocks.includes(item.text));
      }
      assert(!/<(?:script|link|img)[^>]+(?:src|href)="https?:/i.test(html));
      if (audience === 'overview') {
        assert(html.indexOf('What happens') < html.indexOf('class="proof"'));
        assert(!html.includes('class="function-ref"'));
      } else {
        assert(html.indexOf('class="guide-section"') < html.indexOf('class="function-section"'));
        assert(
          markdown.indexOf('## Functions behind this behavior') < markdown.indexOf('### Claims'),
        );
      }
    }
  }
  assert.equal(JSON.stringify(model), before);
});

test('presentation rejects stale bindings, missing records, hidden limits, and invalid function or code references', () => {
  const alias = 'request-dispatch';
  const invalid = (edit) => {
    const plan = planFor(alias);
    edit(plan);
    assert.throws(() => validatePresentationPlan(plan, model, alias), {
      code: 'INVALID_PRESENTATION',
    });
  };
  invalid((plan) => {
    plan.semantic_artifact_id = 'semantic:' + '0'.repeat(64);
  });
  invalid((plan) => {
    plan.capability_id = proposal.data.concepts[1].id;
  });
  invalid((plan) => {
    plan.stages[0].step_ids.pop();
  });
  invalid((plan) => {
    plan.stages[1].step_ids.push(plan.stages[0].step_ids[0]);
  });
  invalid((plan) => {
    plan.stages[3].claim_ids = [];
  });
  invalid((plan) => {
    plan.stages[0].summary.claim_ids = [
      proposal.data.claims.find((c) => c.subject_ids.includes(proposal.data.concepts[1].id)).id,
    ];
  });
  invalid((plan) => {
    plan.stages[1].cautions = [];
  });
  invalid((plan) => {
    plan.cases[0].stage_keys = ['missing'];
  });
  invalid((plan) => {
    plan.introduction.unknown_indices = [999];
  });
  invalid((plan) => {
    plan.introduction.claim_ids = [];
    plan.introduction.unknown_indices = [];
  });
  invalid((plan) => {
    plan.review_status = 'verified';
  });
  invalid((plan) => {
    plan.stages[0].key = '\"><script>';
  });
  invalid((plan) => {
    plan.custom_html = '<script>';
  });
  invalid((plan) => {
    plan.overview.limits = [];
  });
  invalid((plan) => {
    plan.guide.limits = [];
  });
  invalid((plan) => {
    plan.guide.sections[0].stage_keys.pop();
  });
  invalid((plan) => {
    plan.guide.sections[0].code.start_line = 1;
  });
  invalid((plan) => {
    plan.guide.sections[0].code.end_line = 999999;
  });
  invalid((plan) => {
    plan.functions[0].symbol_ids = ['symbol:' + '0'.repeat(64)];
  });
  invalid((plan) => {
    plan.functions[0].stage_keys = ['missing'];
  });
  invalid((plan) => {
    plan.functions[0].evidence_ids = request.data.evidence
      .filter((item) => item.path === 'src/compose.ts')
      .map((item) => item.id);
  });
  for (const options of [
    { format: 'pdf' },
    { audience: 'pm' },
    { companion: '../report.html' },
    { companion: 'https://example.invalid/report.html' },
  ]) {
    assert.throws(() => renderCapability(model, alias, options), { code: 'INVALID_ARGUMENTS' });
  }
  assert.throws(() => renderCapability(model, alias, { audience: 'overview' }), {
    code: 'OVERVIEW_REQUIRED',
  });
});

test('source and presentation text cannot enter executable HTML, Markdown links, or diagram markup', () => {
  const plan = planFor('middleware-composition');
  const payload =
    '</script><script>globalThis.pwned=1</script><img src=x onerror=alert(1)> [go](https://example.invalid) ```';
  plan.introduction.text = payload;
  plan.stages[0].title = payload;
  plan.cases[0].question = payload;
  plan.sequence.messages[0].label = '<script>alert(1)</script>';
  plan.guide.introduction.text = payload;
  plan.overview.purpose.text = payload;
  plan.functions[0].inputs.text = payload;
  for (const audience of ['overview', 'engineer']) {
    const html = renderCapability(model, 'middleware-composition', {
      presentation: plan,
      format: 'html',
      audience,
      sourceNotice: payload,
    });
    const markdown = renderCapability(model, 'middleware-composition', {
      presentation: plan,
      audience,
    });
    assert.equal([...html.matchAll(/<script>/g)].length, 1);
    assert.equal([...html.matchAll(/<\/script>/g)].length, 1);
    assert(!html.includes('<img src=x'));
    assert(!markdown.includes('[go](https://example.invalid)'));
    assert(html.includes('&lt;script&gt;'));
  }
});

test('an engineer guide works without optional function summaries or a companion file', () => {
  const presentation = planFor('request-dispatch');
  delete presentation.functions;
  const html = renderCapability(model, 'request-dispatch', { presentation, format: 'html' });
  assert(!html.includes('href="#functions"'));
  assert(!html.includes('href="#function-'));
  assert(!html.includes('class="active" aria-current="page">Overview'));
});

test('the single-handler source focus includes the complete branch and offers its surrounding source', () => {
  const presentation = planFor('request-dispatch');
  const html = renderCapability(model, 'request-dispatch', { presentation, format: 'html' });
  const markdown = renderCapability(model, 'request-dispatch', { presentation });
  const section = html.split('id="guide-handlers"')[1].split('</section>')[0];
  const [, code] = section.match(/<pre\b[^>]*><code>([\s\S]*?)<\/code><\/pre>/);
  const source = decoded(code);
  assert(source.includes('let res: ReturnType<H>'));
  assert(source.includes('// Do not `compose` if it has only one handler'));
  assert(source.includes('matchResult[0][0][0][0](c, async () => {'));
  assert(source.includes('return res instanceof Promise'));
  assert(source.endsWith('        : (res ?? this.#notFoundHandler(c))\n    }\n'));
  assert(section.includes('Partial excerpt. Code before and after this range is omitted.'));
  assert(section.includes('<summary>Show surrounding source'));
  assert(markdown.includes(codeFence(source)));
  assert(markdown.includes('<summary>Show surrounding source'));
});

test('code focuses preserve tabs, CRLF, generics, and fence characters without adding a blank source line', () => {
  const item = {
    id: 'evidence:sample',
    path: 'src/example.ts',
    start_line: 10,
    end_line: 12,
    text: '\tlet res: ReturnType<H>\r\n// ``` in a comment\r\n\treturn res\r\n',
  };
  const report = { evidenceMap: new Map([[item.id, item]]) };
  const focus = { evidence_id: item.id, start_line: 11, end_line: 12 };
  const expected = '// ``` in a comment\r\n\treturn res\r\n';
  assert.equal(focusedCode(report, focus), expected);
  assert.equal(codeFence(expected), '````typescript\n' + expected + '````');
  assert.equal(codeFence('return res'), '```typescript\nreturn res\n```');
  const html = codeFocusHtml(report, focus);
  const markdown = codeFocusMarkdown(report, focus).join('\n');
  const blocks = [...html.matchAll(/<pre\b[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].map((match) =>
    decoded(match[1]),
  );
  assert.deepEqual(blocks, [expected, item.text]);
  assert(html.includes('Partial excerpt. Code before this range is omitted.'));
  assert(markdown.includes('Partial excerpt. Code before this range is omitted.'));
  assert(markdown.includes(codeFence(item.text)));
});

test('Markdown fences preserve large excerpts with many separate backtick runs', () => {
  const text = '` '.repeat(200_000) + '\n// ``````\n';
  assert.equal(codeFence(text), '```````typescript\n' + text + '```````');
});

test('engineer introductions, examples, and limits retain evidence and unknown links in both formats', () => {
  for (const alias of ['request-dispatch', 'middleware-composition']) {
    const presentation = planFor(alias);
    const guide = presentation.guide;
    const html = renderCapability(model, alias, { presentation, format: 'html' });
    const markdown = renderCapability(model, alias, { presentation });
    const hero = html.split('<section class="hero">')[1].split('</section>')[0];
    const example = html.split('id="example">')[1].split('</section>')[0];
    const limits = html.split('id="limits">')[1].split('</section>')[0];
    const introMarkdown = markdown.split('<a id="example"></a>')[0];
    const exampleMarkdown = markdown.split('<a id="example"></a>')[1].split('<a id="guide-')[0];
    const limitsMarkdown = markdown
      .split('## Limits of this explanation')[1]
      .split('<a id="functions"></a>')[0];
    const check = (explanation, region, markdownRegion) => {
      const evidence = new Set([
        ...(explanation.evidence_ids ?? []),
        ...explanation.claim_ids.flatMap(
          (id) => proposal.data.claims.find((item) => item.id === id).evidence_ids,
        ),
        ...explanation.unknown_indices.flatMap(
          (index) => proposal.data.unknowns[index].evidence_ids,
        ),
      ]);
      const ids = [...evidence]
        .map((id) => id.replace(':', '-'))
        .concat(explanation.unknown_indices.map((index) => `unknown-${index}`));
      assert(ids.length > 0);
      for (const id of ids) {
        assert(region.includes(`href="#${id}"`));
        assert(markdownRegion.includes(`](#${id})`));
      }
    };
    check(guide.introduction, hero, introMarkdown);
    check(guide.example.description, example, exampleMarkdown);
    guide.limits.forEach((item) => check(item, limits, limitsMarkdown));
  }
  const fallback = renderCapability(model, 'request-dispatch', { format: 'html' });
  assert(fallback.includes('claims describe this capability.'));
  assert(!fallback.includes('claims support this capability.'));
});
