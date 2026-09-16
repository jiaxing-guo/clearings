import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = fileURLToPath(new URL('../', import.meta.url));
const binary = process.env.CLEARINGS_TEST_BINARY || path.join(repo, 'target/debug/clearings');
const temporary = await mkdtemp(path.join(tmpdir(), 'clearings-browser-'));
const projectRoot = path.join(temporary, 'project');
const session = path.join(temporary, 'session');
const database = path.join(temporary, 'state.db');
await mkdir(projectRoot);
await mkdir(session);
let sourceRequests = 0;
const model = createServer(async (request, response) => {
  try {
    let body = '';
    for await (const chunk of request) body += chunk;
    const packet = JSON.parse(JSON.parse(body).messages[1].content);
    assert.equal(packet.cases.length, 2, 'new example is withheld from source authoring');
    assert.match(packet.request, /factor/);
    assert.equal(packet.contract.input_schema.properties.factor.type, 'integer');
    sourceRequests++;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                source:
                  "export default async x=>({status:'completed',output:x.value*(x.factor??2)})",
              }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      }),
    );
  } catch (error) {
    response.writeHead(500);
    response.end(error.message);
  }
});
await new Promise((resolve) => model.listen(0, '127.0.0.1', resolve));
let child;
let browser;
function command(...args) {
  return JSON.parse(
    execFileSync(binary, ['--store', database, ...args], { encoding: 'utf8', timeout: 30000 }),
  );
}
try {
  const settings = path.join(temporary, 'settings.json');
  await writeFile(
    settings,
    JSON.stringify({
      grants: { roots: { repo: projectRoot, contacts: projectRoot } },
      model: {
        url: `http://127.0.0.1:${model.address().port}/chat`,
        model: 'browser-fixture',
        max_output_tokens: 1024,
        input_price: 1,
        output_price: 1,
      },
      daily_budget_microusd: 100,
    }),
  );
  const project = command(
    'project-configure',
    '--root',
    projectRoot,
    '--name',
    'Browser test',
    '--settings',
    settings,
  ).id;
  async function seed(task, source) {
    const taskFile = path.join(temporary, 'task.json');
    const sourceFile = path.join(temporary, 'routine.ts');
    await writeFile(taskFile, JSON.stringify(task));
    await writeFile(sourceFile, source);
    const id = command('--project', project, 'prepare-task', taskFile).task;
    const version = command(
      '--project',
      project,
      'submit',
      '--task',
      id,
      '--source',
      sourceFile,
    ).version;
    assert.equal(command('--project', project, 'evaluate', version).accepted, true);
    command('--project', project, 'activate', version);
  }
  await seed(
    {
      contract: {
        abi: 1,
        name: 'scale-number',
        description: 'Double the supplied value',
        input_schema: {
          type: 'object',
          properties: { value: { type: 'integer' } },
          required: ['value'],
          additionalProperties: true,
        },
        output_schema: { type: 'integer' },
        capabilities: [],
      },
      cases: [
        { name: 'Two', input: { value: 2 }, expected: { status: 'completed', output: 4 } },
        { name: 'Zero', input: { value: 0 }, expected: { status: 'completed', output: 0 } },
      ],
    },
    "export default async x=>({status:'completed',output:x.value*2})",
  );
  await seed(
    {
      contract: {
        abi: 1,
        name: 'empty-result',
        description: 'Return an empty value',
        input_schema: { type: 'null' },
        output_schema: { type: 'null' },
        capabilities: [],
      },
      cases: [{ name: 'Empty', input: null, expected: { status: 'completed', output: null } }],
    },
    "export default async x=>({status:'completed',output:null})",
  );
  const folder = path.join(repo, 'examples/normalize-contact-file');
  await writeFile(
    path.join(projectRoot, 'contacts.json'),
    await readFile(path.join(folder, 'data/contacts.json')),
  );
  await seed(
    JSON.parse(await readFile(path.join(folder, 'task.json'), 'utf8')),
    await readFile(path.join(folder, 'routine.ts'), 'utf8'),
  );
  child = spawn(
    binary,
    ['--store', database, '--project', project, 'workbench-serve', '--session-dir', session],
    { stdio: 'ignore', detached: true },
  );
  let connection;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      connection = JSON.parse(await readFile(path.join(session, 'ready.json'), 'utf8'));
      break;
    } catch {
      assert.equal(child.exitCode, null, 'workbench exited before ready');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  assert.ok(connection, 'workbench startup timed out');
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CLEARINGS_TEST_BROWSER
      ? { executablePath: process.env.CLEARINGS_TEST_BROWSER }
      : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(connection.url);
  await page.getByRole('button', { name: /scale number/ }).click();
  await page.getByLabel('value', { exact: true }).fill('9007199254740993');
  await page.getByRole('button', { name: 'Try input', exact: true }).click();
  await page
    .locator('#notice')
    .getByText(/cannot be represented exactly/)
    .waitFor();
  await page.getByLabel('value', { exact: true }).fill('7');
  await page.getByRole('button', { name: 'Try input', exact: true }).click();
  await page.locator('.result-area').getByText('14', { exact: true }).waitFor();
  const input = page.getByRole('heading', { name: 'Try a new input' }).locator('..');
  await input.getByLabel('New field name').fill('factor');
  await input.locator('.add-row select').selectOption('integer');
  await input.getByRole('button', { name: 'Add field', exact: true }).click();
  await page.getByLabel('factor', { exact: true }).fill('3');
  await page.getByText('Input and output contract', { exact: true }).click();
  const schema = page.locator('.schema-editor').first();
  await schema.getByRole('button', { name: 'Add field', exact: true }).click();
  await schema.getByLabel('Field name', { exact: true }).last().fill('factor');
  await schema.locator('.schema-row select').last().selectOption('integer');

  await page
    .getByLabel('What should change?')
    .fill('Use factor when supplied, otherwise keep doubling.');
  await page.locator('.change-panel .value-editor input').first().fill('21');
  await page.getByRole('button', { name: 'Add this example', exact: true }).click();
  await page.getByRole('button', { name: 'Propose update', exact: true }).click();
  await page.getByRole('heading', { name: 'Update passed its examples' }).waitFor();
  await page.getByRole('button', { name: 'Use update', exact: true }).click();
  await page.getByRole('button', { name: 'Undo last change', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Undo last change', exact: true }).click();
  await page
    .getByRole('button', { name: 'Undo last change', exact: true })
    .waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('button', { name: 'Try input', exact: true }).isDisabled(),
    true,
  );
  // Switching immediately catches late control responses that used to steal selection.
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: /normalize contact file/ }).click();
  await page.getByRole('button', { name: 'Try input', exact: true }).click();
  await page.locator('.result-area').getByText('iris@example.test', { exact: true }).waitFor();
  await input.getByLabel('path', { exact: true }).fill('missing.json');
  await page.getByRole('button', { name: 'Try input', exact: true }).click();
  await page.getByRole('heading', { name: 'Needs your agent', exact: true }).waitFor();
  await writeFile(
    path.join(projectRoot, 'untrusted.json'),
    JSON.stringify({
      rows: [
        { name: '<img src=x onerror="window.__workbench_injected=1">', email: 'safe@example.test' },
      ],
    }),
  );
  await input.getByLabel('path', { exact: true }).fill('untrusted.json');
  await page.getByRole('button', { name: 'Try input', exact: true }).click();
  await page.locator('.result-area').getByText('safe@example.test', { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => window.__workbench_injected),
    undefined,
    'result text executed as HTML',
  );
  await page.getByRole('button', { name: /empty result/ }).click();
  await page.getByRole('button', { name: 'Try input', exact: true }).click();
  await page.locator('.result-area').getByText('Empty', { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    'mobile overflow',
  );
  // Exercise a real second library page and preserve its selection after controls.
  for (let i = 0; i < 21; i++) {
    await seed(
      {
        contract: {
          abi: 1,
          name: `paged-routine-${i}`,
          description: 'Pagination sample',
          input_schema: { type: 'integer' },
          output_schema: { type: 'integer' },
          capabilities: [],
        },
        cases: [{ name: 'One', input: 1, expected: { status: 'completed', output: 2 } }],
      },
      "export default async x=>({status:'completed',output:x*2})",
    );
  }
  const firstPage = command('--project', project, 'library');
  const secondPage = command('--project', project, 'library', '--after', firstPage.next_after);
  const later = secondPage.routines.find((r) => r.name.startsWith('paged-routine-'));
  assert.ok(later);
  await page.goto('about:blank');
  await page.goto(connection.url);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await page
    .locator('#library button')
    .filter({ has: page.getByText(later.name.replaceAll('-', ' '), { exact: true }) })
    .click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('button', { name: 'Try input', exact: true }).isDisabled(),
    true,
  );
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('button', { name: 'Try input', exact: true }).isDisabled(),
    false,
  );
  assert.equal(sourceRequests, 1, 'tests and controls must not call a model');
  assert.deepEqual(errors, []);
  await page.route('**/api/library', (route) =>
    route.fulfill({ json: { project: { name: 'Empty project' }, routines: [], next_after: null } }),
  );
  await page.goto('about:blank');
  await page.goto(connection.url);
  await page.getByText('No saved routines yet.', { exact: true }).waitFor();
  await page.unroute('**/api/library');
  await page.goto('about:blank');
  await page.goto(connection.url.split('#')[0] + '#expired');
  await page
    .locator('#library')
    .getByText(/not authorized/)
    .waitFor();
  console.log(
    'Workbench browser flow passed: inputs, proposals, apply, undo, controls, files, handoff, untrusted text, mobile, expired link.',
  );
} finally {
  if (browser) await browser.close();
  if (child?.exitCode === null) {
    process.kill(-child.pid, 'SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
  }
  await new Promise((resolve) => model.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
