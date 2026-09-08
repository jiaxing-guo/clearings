import { prepareContextRuntime } from '../dist/index.js';
if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== '--quiet'))
  throw new Error('Usage: prepare-context-native.mjs [--quiet]');
const identity = prepareContextRuntime();
if (!process.argv[2]) console.log(JSON.stringify(identity));
