'use strict';
const token = location.hash.slice(1);
document.querySelector('.brand').href = location.href;
const library = document.querySelector('#library');
const detail = document.querySelector('#detail');
const notice = document.querySelector('#notice');
let routines = [];
let cursor = null;
let selected = null;
let selection = 0;
let libraryRequest = 0;
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function message(text, bad = false) {
  notice.replaceChildren(
    el('span', text),
    button(
      'Dismiss',
      () => {
        notice.hidden = true;
      },
      'small quiet',
    ),
  );
  notice.className = bad ? 'error' : 'success';
  notice.hidden = false;
}
async function api(path, data) {
  if (!token) throw new Error('Open a fresh workbench link from your coding client.');
  const options = { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' };
  if (data !== undefined) {
    options.method = 'POST';
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(data);
  }
  const response = await fetch(`/api/${path}`, options);
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || 'The request did not complete. Refresh before retrying.');
  return result;
}
function button(label, action, kind = '') {
  const node = el('button', label, kind);
  node.type = 'button';
  node.addEventListener('click', async () => {
    node.disabled = true;
    notice.hidden = true;
    try {
      await action();
    } catch (error) {
      message(error.message, true);
    } finally {
      node.disabled = false;
    }
  });
  return node;
}
function title(name) {
  return name.replaceAll('-', ' ').replaceAll('_', ' ');
}
function stateLabel(row) {
  if (row.excluded) return row.owned ? 'Excluded' : 'Excluded by owner';
  if (!row.active) return 'No active version';
  if (!row.owned && row.owner_paused) return 'Paused by owner';
  return row.paused ? 'Paused' : 'Ready';
}
function usage(row) {
  const counts = row.usage?.windows?.['30'] || {};
  return `${counts.reuse_calls || 0} ${counts.reuse_calls === 1 ? 'reuse' : 'reuses'} · ${counts.test_calls || 0} ${counts.test_calls === 1 ? 'test' : 'tests'}${counts.unclassified_calls ? ` · ${counts.unclassified_calls} unclassified` : ''}`;
}
function renderLibrary() {
  library.replaceChildren();
  const query = document.querySelector('#filter').value.toLowerCase();
  for (const row of routines.filter((r) =>
    `${r.name} ${r.description}`.toLowerCase().includes(query),
  )) {
    const item = button('', () => select(row), 'routine');
    item.classList.toggle('selected', selected === row.id);
    item.append(
      el('strong', title(row.name)),
      el('span', row.description, 'description'),
      el('small', `${stateLabel(row)}${row.owned ? '' : ' · Shared'} · ${usage(row)}`),
    );
    library.append(item);
  }
  if (!library.childElementCount) {
    library.append(
      el('p', routines.length ? 'No matches in the loaded routines.' : 'No saved routines yet.'),
    );
    if (!routines.length)
      library.append(
        button(
          'Copy a learning request',
          () =>
            navigator.clipboard.writeText(
              'Learn a reusable routine from recent work in this project.',
            ),
          'quiet',
        ),
      );
  }
  document.querySelector('#more').hidden = !cursor;
}
async function load(more = false) {
  const serial = ++libraryRequest;
  const previousCount = routines.length;
  const wanted = routines.find((r) => r.id === selected);
  let page = await api(more && cursor ? `library?after=${encodeURIComponent(cursor)}` : 'library');
  if (serial !== libraryRequest) return;
  const refreshed = more ? [...routines, ...page.routines] : [...page.routines];
  while (
    !more &&
    page.next_after &&
    (refreshed.length < previousCount ||
      (wanted &&
        !refreshed.some((r) => r.name === wanted.name && r.owner_project === wanted.owner_project)))
  ) {
    page = await api(`library?after=${encodeURIComponent(page.next_after)}`);
    if (serial !== libraryRequest) return;
    refreshed.push(...page.routines);
  }
  routines = refreshed;
  cursor = page.next_after;
  document.querySelector('#project-name').textContent = page.project.name;
  renderLibrary();
}

let fieldId = 0;
function field(label, control) {
  const wrap = el('div', undefined, 'field');
  const caption = el('span', label);
  caption.id = `field-${++fieldId}`;
  const controls = control.matches('input,select,textarea')
    ? [control]
    : [...control.querySelectorAll('input,select,textarea')];
  if (controls.length === 1) controls[0].setAttribute('aria-labelledby', caption.id);
  else {
    control.setAttribute('role', 'group');
    control.setAttribute('aria-labelledby', caption.id);
  }
  wrap.append(caption, control);
  return wrap;
}
function scalarType(value, schema) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value !== undefined) return typeof value;
  return Array.isArray(schema.type)
    ? schema.type.find((t) => t !== 'null') || 'null'
    : schema.type || 'string';
}
function empty(type) {
  return { object: {}, array: [], string: '', integer: 0, number: 0, boolean: false, null: null }[
    type
  ];
}
// A bounded form editor for JSON values. Unsupported schema rules remain enforced by the host.
function editor(value, schema = {}, depth = 0, budget = { count: 0 }) {
  const node = el('div', undefined, 'value-editor');
  const type = scalarType(value, schema);
  if (++budget.count > 400 || depth > 12 || (Array.isArray(value) && value.length > 50)) {
    node.append(
      el(
        'p',
        'This value is too large for form editing. It is preserved unchanged. Ask your agent to make a smaller example.',
        'subtle',
      ),
    );
    return { node, get: () => value };
  }
  if (schema.enum) {
    const select = el('select');
    schema.enum.forEach((v, index) => {
      const option = el('option', String(v));
      option.value = String(index);
      select.append(option);
    });
    select.value = String(
      Math.max(
        0,
        schema.enum.findIndex((v) => JSON.stringify(v) === JSON.stringify(value)),
      ),
    );
    node.append(select);
    return { node, get: () => schema.enum[Number(select.value)] };
  }
  if (type === 'object') {
    const children = new Map();
    const fields = el('div', undefined, 'object-fields');
    const add = (key, childValue, childSchema = {}) => {
      if (!key || children.has(key)) return;
      const child = editor(childValue, childSchema, depth + 1, budget);
      const row = el('div', undefined, 'object-row');
      row.append(
        field(key, child.node),
        button(
          'Remove',
          () => {
            children.delete(key);
            row.remove();
          },
          'small quiet',
        ),
      );
      fields.append(row);
      children.set(key, child);
    };
    const initial = value && typeof value === 'object' ? value : {};
    const keys = new Set([...Object.keys(initial), ...(schema.required || [])]);
    keys.forEach((key) =>
      add(
        key,
        Object.hasOwn(initial, key)
          ? initial[key]
          : empty(scalarType(undefined, schema.properties?.[key] || {})),
        schema.properties?.[key] || {},
      ),
    );
    const key = el('input');
    key.placeholder = 'Field name';
    key.setAttribute('aria-label', 'New field name');
    const kind = kindSelect('string');
    const controls = el('div', undefined, 'add-row');
    controls.append(
      key,
      kind,
      button(
        'Add field',
        () => {
          add(key.value.trim(), empty(kind.value), { type: kind.value });
          key.value = '';
        },
        'small quiet',
      ),
    );
    node.append(fields, controls);
    return {
      node,
      get: () => Object.fromEntries([...children].map(([key, child]) => [key, child.get()])),
    };
  }
  if (type === 'array') {
    const children = [];
    const list = el('div', undefined, 'array-fields');
    const add = (item) => {
      const child = editor(item, schema.items || {}, depth + 1, budget);
      const row = el('div', undefined, 'array-row');
      row.append(
        child.node,
        button(
          'Remove item',
          () => {
            children.splice(children.indexOf(child), 1);
            row.remove();
          },
          'small quiet',
        ),
      );
      children.push(child);
      list.append(row);
    };
    (value || []).forEach(add);
    node.append(
      list,
      button(
        'Add item',
        () => {
          if (children.length >= 50) throw new Error('Use a smaller example for form editing.');
          add(empty(scalarType(undefined, schema.items || {})));
        },
        'small quiet',
      ),
    );
    return { node, get: () => children.map((child) => child.get()) };
  }
  if (type === 'null') {
    node.append(el('span', 'Empty value', 'subtle'));
    return { node, get: () => null };
  }
  if (type === 'boolean') {
    const checkbox = el('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(value);
    checkbox.setAttribute('aria-label', 'Yes or no');
    node.append(checkbox);
    return { node, get: () => checkbox.checked };
  }
  const control = el(type === 'string' && String(value || '').length > 100 ? 'textarea' : 'input');
  if (type === 'number' || type === 'integer') {
    control.type = 'number';
    control.step = type === 'integer' ? '1' : 'any';
  }
  control.value = value === undefined ? '' : String(value);
  node.append(control);
  return {
    node,
    get: () => {
      if (type === 'number' || type === 'integer') {
        if (type === 'integer' || schema.type === 'integer') {
          if (!/^[+-]?\d+$/.test(control.value))
            throw new Error('Enter a whole number without decimals or exponent notation.');
          const exact = BigInt(control.value);
          if (exact > BigInt(Number.MAX_SAFE_INTEGER) || exact < BigInt(Number.MIN_SAFE_INTEGER))
            throw new Error(
              'That integer cannot be represented exactly. Use a smaller value or ask your agent for a string-based input.',
            );
          return Number(exact);
        }
        const result = Number(control.value);
        if (!control.value || !Number.isFinite(result)) throw new Error('Enter a valid number.');
        if (Number.isInteger(result) && !Number.isSafeInteger(result))
          throw new Error('That integer cannot be represented exactly.');
        return result;
      }
      return control.value;
    },
  };
}
function kindSelect(value) {
  const select = el('select');
  select.setAttribute('aria-label', 'Value type');
  for (const [kind, label] of Object.entries({
    string: 'Text',
    integer: 'Whole number',
    number: 'Number',
    boolean: 'Yes / no',
    null: 'Empty value',
    array: 'List',
    object: 'Fields',
  })) {
    const option = el('option', label);
    option.value = kind;
    select.append(option);
  }
  select.value = value || 'string';
  return select;
}
function schemaEditor(schema) {
  const node = el('div', undefined, 'schema-editor');
  const original = structuredClone(schema);
  let modified = false;
  let kindChanged = false;
  const kind = kindSelect(typeof schema.type === 'string' ? schema.type : 'object');
  kind.addEventListener('change', () => {
    modified = true;
    kindChanged = true;
  });
  const rows = el('div');
  const entries = [];
  const add = (name, definition = { type: 'string' }, required = false) => {
    const input = el('input');
    input.value = name;
    input.setAttribute('aria-label', 'Field name');
    const type = kindSelect(definition.type);
    const check = el('input');
    check.type = 'checkbox';
    check.checked = required;
    const row = el('div', undefined, 'schema-row');
    const entry = { input, type, check, definition, typeChanged: false };
    input.addEventListener('input', () => {
      modified = true;
    });
    check.addEventListener('change', () => {
      modified = true;
    });
    type.addEventListener('change', () => {
      modified = true;
      entry.typeChanged = true;
    });
    row.append(
      input,
      type,
      field('Required', check),
      button(
        'Remove',
        () => {
          modified = true;
          entries.splice(entries.indexOf(entry), 1);
          row.remove();
        },
        'small quiet',
      ),
    );
    entries.push(entry);
    rows.append(row);
  };
  for (const [name, definition] of Object.entries(schema.properties || {}))
    add(name, definition, (schema.required || []).includes(name));
  node.append(
    field('Kind of value', kind),
    rows,
    button(
      'Add field',
      () => {
        modified = true;
        add('');
      },
      'small quiet',
    ),
  );
  return {
    node,
    get: () => {
      if (!modified) return structuredClone(original);
      const result = { ...original };
      if (kindChanged || !Object.hasOwn(original, 'type')) result.type = kind.value;
      if (kind.value === 'object') {
        const names = entries.map((e) => e.input.value.trim());
        if (names.some((n) => !n) || new Set(names).size !== names.length)
          throw new Error('Each contract field needs a unique name.');
        result.properties = Object.fromEntries(
          entries.map((e) => [
            e.input.value.trim(),
            e.typeChanged ? { ...e.definition, type: e.type.value } : e.definition,
          ]),
        );
        result.required = entries.filter((e) => e.check.checked).map((e) => e.input.value.trim());
      }
      return result;
    },
  };
}
function view(value, depth = 0, budget = { count: 0 }) {
  if (++budget.count > 300)
    return el('span', 'More data is available in the copied result.', 'subtle');
  if (depth > 6) return el('span', 'Nested value', 'subtle');
  if (value === null || typeof value !== 'object')
    return el('span', value === null ? 'Empty' : String(value), 'result-value');
  const list = el('dl', undefined, 'result-tree');
  const entries = Object.entries(value);
  for (const [key, val] of entries.slice(0, 40)) {
    list.append(el('dt', Array.isArray(value) ? `Item ${Number(key) + 1}` : title(key)), el('dd'));
    list.lastChild.append(view(val, depth + 1, budget));
  }
  if (!entries.length)
    list.append(el('p', Array.isArray(value) ? 'Empty list' : 'No fields', 'subtle'));
  if (entries.length > 40)
    list.append(
      el(
        'p',
        `Showing 40 of ${entries.length} entries. Copy the result to keep every entry.`,
        'subtle',
      ),
    );
  return list;
}
function renderActivity(activity, row) {
  activity.replaceChildren(
    el('summary', 'Recent use'),
    el(
      'p',
      `${usage(row)} in the last 30 days. Counts describe this acceptance contract.`,
      'subtle',
    ),
  );
  for (const call of row.recent_calls || [])
    activity.append(
      el(
        'p',
        `${call.created_at} · ${call.purpose} · ${title(call.status)} · ${call.elapsed_ms} ms`,
      ),
    );
  if (!row.recent_calls?.length) activity.append(el('p', 'No recent calls recorded.', 'subtle'));
}
async function select(row) {
  const serial = ++selection;
  selected = row.id;
  renderLibrary();
  detail.replaceChildren(el('p', 'Loading routine…', 'loading'));
  const data = await api(`routine/${row.id}`);
  if (serial !== selection) return;
  renderRoutine(row, data);
}
function renderRoutine(row, data) {
  detail.replaceChildren();
  const header = el('section', undefined, 'routine-heading');
  const controls = el('div', undefined, 'actions');
  for (const [label, action] of [
    [
      row.owned && row.excluded
        ? 'Include'
        : (row.owned ? row.paused : row.local_paused)
          ? 'Resume'
          : 'Pause',
      row.owned && row.excluded
        ? 'include'
        : (row.owned ? row.paused : row.local_paused)
          ? 'resume'
          : 'pause',
    ],
    ...(row.can_undo ? [['Undo last change', 'undo']] : []),
  ]) {
    controls.append(
      button(
        label,
        async () => {
          controls.querySelectorAll('button').forEach((control) => {
            control.disabled = true;
          });
          try {
            await api('control', { id: row.id, action, expected_version: data.version });
            await load();
            const next = routines.find(
              (r) => r.name === row.name && r.owner_project === row.owner_project,
            );
            if (next && selected === row.id) await select(next);
          } finally {
            controls.querySelectorAll('button').forEach((control) => {
              control.disabled = false;
            });
          }
        },
        'quiet',
      ),
    );
  }
  header.append(
    el(
      'p',
      `${row.owned ? 'Your routine' : `Shared from ${row.owner_name}`} · ${stateLabel(row)}`,
      'kicker',
    ),
    el('h2', title(row.name)),
    el('p', data.contract.description),
    controls,
  );
  detail.append(header);
  if (data.details_required || !data.contract.input_schema || !data.contract.output_schema) {
    detail.append(
      el(
        'p',
        'This contract is too large for this view. Ask your coding agent to inspect its full requirements.',
        'error',
      ),
    );
    return;
  }
  const first = data.examples?.[0];
  function exampleInput(value) {
    const input = structuredClone(value);
    if (
      input &&
      typeof input === 'object' &&
      !Array.isArray(input) &&
      typeof input.root === 'string' &&
      data.contract.capabilities.some((name) => name === 'files.read' || name === 'files.list') &&
      data.roots?.length === 1 &&
      !data.roots.includes(input.root)
    )
      input.root = data.roots[0];
    return input;
  }
  let input = editor(exampleInput(first?.input), data.contract.input_schema);
  let lastTest = null;
  let expected = editor(first?.expected?.output, data.contract.output_schema);
  const expectedArea = el('div');
  const expectedStatus = el('select');
  for (const [value, label] of [
    ['completed', 'Complete'],
    ['needs_agent', 'Ask my agent'],
    ['not_applicable', 'Not applicable'],
  ]) {
    const option = el('option', label);
    option.value = value;
    expectedStatus.append(option);
  }
  if (['completed', 'needs_agent', 'not_applicable'].includes(first?.expected?.status))
    expectedStatus.value = first.expected.status;
  const expectedReason = el('input');
  expectedReason.value = first?.expected?.reason || '';
  let expectedContext = editor(
    first?.expected?.context === undefined ? {} : first.expected.context,
  );
  function renderExpected() {
    expectedArea.replaceChildren();
    if (expectedStatus.value === 'completed') expectedArea.append(expected.node);
    else {
      expectedArea.append(field('Reason', expectedReason));
      if (expectedStatus.value === 'needs_agent')
        expectedArea.append(field('Details for the agent', expectedContext.node));
    }
  }
  expectedStatus.addEventListener('change', renderExpected);
  renderExpected();
  const trySection = el('section', undefined, 'panel');
  const inputArea = el('div');
  inputArea.append(el('h3', 'Try a new input'), input.node);
  const result = el('div', undefined, 'result-area');
  result.append(el('h3', 'Result'), el('p', 'Run a test to inspect the result here.', 'subtle'));
  const test = button('Try input', async () => {
    const value = input.get();
    result.replaceChildren(el('h3', 'Testing…'));
    try {
      const report = await api('run', { id: row.id, expected_version: data.version, input: value });
      lastTest = { input: value, report };
      const outcome = report.run.outcome;
      result.replaceChildren(
        el(
          'h3',
          outcome.status === 'completed'
            ? 'Completed'
            : outcome.status === 'needs_agent'
              ? 'Needs your agent'
              : title(outcome.status),
        ),
        el('p', `${report.run.elapsed_ms} ms · Test run`, 'subtle'),
        view(
          outcome.status === 'completed'
            ? outcome.output
            : (outcome.context ?? outcome.message ?? outcome.reason),
        ),
      );
      if (outcome.reason) result.append(el('p', outcome.reason));
      result.append(
        button(
          'Copy result',
          () => navigator.clipboard.writeText(JSON.stringify(outcome, null, 2)),
          'quiet small',
        ),
      );
      if (outcome.status === 'completed') {
        expectedStatus.value = 'completed';
        expected = editor(outcome.output, outputSchema.get());
        renderExpected();
      } else if (['needs_agent', 'not_applicable'].includes(outcome.status)) {
        expectedStatus.value = outcome.status;
        expectedReason.value = outcome.reason || '';
        expectedContext = editor(outcome.context === undefined ? {} : outcome.context);
        renderExpected();
      }
      const refreshed = await api(`routine/${row.id}`);
      row.usage = refreshed.usage;
      row.recent_calls = refreshed.recent_calls;
      renderLibrary();
      renderActivity(activity, row);
    } catch (error) {
      result.replaceChildren(el('h3', 'Test did not complete'), el('p', error.message, 'error'));
      throw error;
    }
  });
  test.disabled = Boolean(row.paused || row.excluded || !row.active);
  inputArea.append(
    test,
    el(
      'p',
      `Allowed operations: ${data.contract.capabilities.length ? data.contract.capabilities.join(', ') : 'Transform input only'}. File roots: ${data.roots?.join(', ') || 'none'}.`,
      'subtle',
    ),
  );
  trySection.append(inputArea, result);
  detail.append(trySection);
  const examples = el('details', undefined, 'panel disclosure');
  examples.append(el('summary', `Accepted examples (${data.case_count})`));
  for (const sample of data.examples || []) {
    const block = el('div', undefined, 'example');
    block.append(
      el('h4', sample.name),
      el('strong', 'Input'),
      view(sample.input),
      el('strong', 'Expected result'),
      view(sample.expected),
      button(
        'Use example',
        () => {
          input = editor(exampleInput(sample.input), data.contract.input_schema);
          inputArea.replaceChildren(el('h3', 'Try a new input'), input.node, test);
          if (['completed', 'needs_agent', 'not_applicable'].includes(sample.expected?.status)) {
            expectedStatus.value = sample.expected.status;
            expected = editor(sample.expected.output, data.contract.output_schema);
            expectedReason.value = sample.expected.reason || '';
            expectedContext = editor(
              sample.expected.context === undefined ? {} : sample.expected.context,
            );
            renderExpected();
          }
          lastTest = null;
        },
        'small quiet',
      ),
    );
    examples.append(block);
  }
  examples.append(
    el(
      'p',
      'This view shows up to three examples. Existing examples are preserved when you propose a change. File examples use recorded data; tests read current files.',
      'subtle',
    ),
  );
  detail.append(examples);
  const activity = el('details', undefined, 'panel disclosure');
  renderActivity(activity, row);
  detail.append(activity);
  const inputSchema = schemaEditor(data.contract.input_schema);
  const outputSchema = schemaEditor(data.contract.output_schema);
  const contract = el('details', undefined, 'panel disclosure');
  contract.append(el('summary', 'Input and output contract'));
  const description = el('textarea');
  description.value = data.contract.description;
  description.rows = 3;
  contract.append(
    field('What this routine does', description),
    el('h4', 'Input'),
    inputSchema.node,
    el('h4', 'Output'),
    outputSchema.node,
  );
  contract.append(
    el(
      'p',
      'Simple field types can be changed here. Custom schema rules stay in place and are checked by the runtime. Existing examples must still pass.',
      'subtle',
    ),
  );
  contract.append(
    button(
      'Update input form',
      () => {
        input = editor(input.get(), inputSchema.get());
        inputArea.replaceChildren(el('h3', 'Try a new input'), input.node, test);
        lastTest = null;
      },
      'quiet',
    ),
  );
  if (row.owned && data.version) {
    contract.append(
      button(
        'Reset expected result form',
        () => {
          expectedStatus.value = 'completed';
          expected = editor(undefined, outputSchema.get());
          renderExpected();
        },
        'quiet',
      ),
      el(
        'p',
        'Use after output-contract changes. This clears the entered expected result.',
        'subtle',
      ),
    );
  }
  detail.append(contract);
  const change = el('section', undefined, 'panel change-panel');
  change.append(el('h3', 'Make it handle this too'));
  if (!row.owned || !data.version) {
    change.append(
      el(
        'p',
        row.owned
          ? 'Ask your agent to save an accepted version before proposing an update.'
          : 'Open this routine in its owning project to propose a change.',
        'subtle',
      ),
    );
    detail.append(change);
    return;
  }
  const request = el('textarea');
  request.rows = 3;
  request.placeholder = 'Describe the new behavior in your own words.';
  change.append(field('What should change?', request));
  change.append(
    el('h4', 'Expected result for the input above'),
    field('Expected outcome', expectedStatus),
    expectedArea,
  );
  const newExamples = [];
  let exampleIndex = 0;
  const exampleList = el('div');
  change.append(
    button(
      'Add this example',
      () => {
        const value = input.get();
        let calls = [];
        if (data.contract.capabilities.length) {
          if (
            !lastTest ||
            JSON.stringify(value) !== JSON.stringify(lastTest.input) ||
            !lastTest.report.fixtures?.available
          )
            throw new Error(
              'Try this input first. If its recorded data is too large or a read failed, ask your agent to prepare a small representative example.',
            );
          calls = lastTest.report.fixtures.calls;
        }
        if (newExamples.length >= 8) throw new Error('Use at most eight new examples.');
        const outcome =
          expectedStatus.value === 'completed'
            ? { status: 'completed', output: expected.get() }
            : {
                status: expectedStatus.value,
                reason: expectedReason.value,
                ...(expectedStatus.value === 'needs_agent'
                  ? { context: expectedContext.get() }
                  : {}),
              };
        if (outcome.status !== 'completed' && !outcome.reason.trim())
          throw new Error('Add a reason for the handoff.');
        const sample = {
          name: `New example ${data.case_count + ++exampleIndex}`,
          input: value,
          expected: outcome,
          calls,
        };
        newExamples.push(sample);
        const item = el('div', undefined, 'example-added');
        item.append(
          el('span', sample.name),
          button(
            'Remove',
            () => {
              newExamples.splice(newExamples.indexOf(sample), 1);
              item.remove();
            },
            'small quiet',
          ),
        );
        exampleList.append(item);
      },
      'quiet',
    ),
    exampleList,
  );
  const preview = el('div', undefined, 'proposal-result');
  const showProposal = (proposal) => {
    preview.replaceChildren(
      el('h4', proposal.accepted ? 'Update passed its examples' : 'Update did not pass'),
    );
    if (proposal.cases)
      proposal.cases.forEach((c) =>
        preview.append(el('p', `${c.accepted ? 'Passed' : 'Failed'}: ${c.name}`)),
      );
    if (proposal.accepted)
      preview.append(
        button('Use update', async () => {
          const applied = await api('apply', { task: proposal.task, version: proposal.version });
          await load();
          const next = routines.find((r) => r.id === applied.task);
          if (next && selected === row.id) await select(next);
          message('Updated. The previous routine can be restored with Undo last change.');
        }),
      );
    else
      preview.append(
        el(
          'p',
          'Your active routine is unchanged. Refine the request or ask your agent to inspect the failed examples.',
          'subtle',
        ),
      );
  };
  change.append(
    button('Propose update', async () => {
      if (!request.value.trim()) throw new Error('Describe the change first.');
      if (!newExamples.length) throw new Error('Add an example of the new behavior.');
      preview.replaceChildren(
        el('p', 'Your coding client is drafting and testing an update. This may take a minute.'),
      );
      try {
        showProposal(
          await api('propose', {
            id: row.id,
            expected_version: data.version,
            request: request.value,
            description: description.value,
            input_schema: inputSchema.get(),
            output_schema: outputSchema.get(),
            examples: newExamples,
          }),
        );
      } catch (error) {
        preview.replaceChildren(el('p', error.message, 'error'));
        throw error;
      }
    }),
    el(
      'p',
      'Your authoring connection drafts the change under your existing learning allowance. A passing update still needs your “Use update” action.',
      'subtle',
    ),
    preview,
  );
  if (data.pending) showProposal({ ...data.pending, accepted: true });
  detail.append(change);
}
document.querySelector('#filter').addEventListener('input', renderLibrary);
document.querySelector('#refresh').addEventListener('click', async () => {
  const serial = selection;
  const previous = routines.find((r) => r.id === selected);
  try {
    await load();
    if (serial === selection && previous) {
      const next = routines.find(
        (r) => r.name === previous.name && r.owner_project === previous.owner_project,
      );
      if (next) await select(next);
      else {
        selected = null;
        detail.replaceChildren(el('p', 'Select a routine from the refreshed library.'));
      }
    }
  } catch (error) {
    message(error.message, true);
  }
});
document
  .querySelector('#more')
  .addEventListener('click', () => load(true).catch((error) => message(error.message, true)));
load().catch((error) => {
  library.replaceChildren(el('p', error.message, 'error'));
  message(error.message, true);
});
