import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
let ready = false;

/** Archive verification requires Python 3.9+ under the python3 command. */
export function checkReviewArchive(directory, filename = 'clearings-shared-review.zip') {
  if (!ready) {
    try {
      execFileSync('python3', ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)'], { stdio: 'ignore' });
    } catch (cause) {
      throw new Error('Review archive verification requires Python 3.9 or newer, available as python3.', { cause });
    }
    ready = true;
  }
  execFileSync('python3', [fileURLToPath(new URL('./check-review-archive.py', import.meta.url)), directory, filename], { stdio: 'inherit' });
}
