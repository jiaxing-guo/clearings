import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const codex = read('plugins/clearings/.codex-plugin/plugin.json');
const claude = read('integrations/claude-code/plugins/clearings/.claude-plugin/plugin.json');
assert.equal(codex.version, claude.version);
assert.match(codex.version, /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/);
assert.equal(read('.claude-plugin/marketplace.json').plugins[0].version, codex.version);
const expectedSkills = ['learn-from-conversations', 'manage-clearings', 'reuse-work'];
for (const plugin of ['plugins/clearings', 'integrations/claude-code/plugins/clearings']) {
  assert.equal(readFileSync(`${plugin}/runtime-version`, 'utf8').trim(), `v${codex.version}`);
  assert.deepEqual(readdirSync(`${plugin}/skills`).sort(), expectedSkills);
  for (const skill of expectedSkills)
    assert.match(readFileSync(`${plugin}/skills/${skill}/SKILL.md`, 'utf8'), /^---\nname:/);
}
if (process.env.RELEASE_TAG) assert.equal(process.env.RELEASE_TAG, `v${codex.version}`);
console.log(`Plugin metadata and skills agree on v${codex.version}.`);
