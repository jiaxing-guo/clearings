import { checkFiles, trackedFiles } from './checks.mjs';

try {
  await checkFiles(trackedFiles());
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
