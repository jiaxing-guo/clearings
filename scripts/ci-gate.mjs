import { pathToFileURL } from 'node:url';

export function failedChecks(needs) {
  const failed = [];
  for (const job of ['plan', 'quality']) if (needs[job]?.result !== 'success') failed.push(job);
  for (const job of ['runtime', 'workbench', 'packages']) {
    const expected = needs.plan?.outputs?.[job];
    if (!['true', 'false'].includes(expected)) failed.push(`${job}: missing plan`);
    else if (needs[job]?.result !== (expected === 'true' ? 'success' : 'skipped')) failed.push(job);
  }
  return failed;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const failed = failedChecks(JSON.parse(process.env.CI_NEEDS));
  if (failed.length) throw new Error(`Required checks did not pass: ${failed.join(', ')}`);
  console.log('All planned checks passed.');
}
