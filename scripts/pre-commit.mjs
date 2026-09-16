import lintStaged from 'lint-staged';
import { checkFiles } from './checks.mjs';

const passed = await lintStaged({
  // Include deletions so removing a source file still triggers workspace checks.
  diffFilter: 'ACMRDT',
  hideUnstaged: true,
  concurrent: false,
  allowEmpty: true,
  config: {
    '*': {
      title: 'Format and check changed files',
      task: async (files) => {
        try {
          await checkFiles(files, { fix: true, workspace: true });
        } catch (error) {
          console.error(error.message);
          throw error;
        }
      },
    },
  },
});
process.exitCode = passed ? 0 : 1;
