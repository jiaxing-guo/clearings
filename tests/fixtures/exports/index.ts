import { anonymous, arrow, identity } from './barrel.js';
export const result = identity(arrow(anonymous('x')));
function require(value: string): string { return value; }
export const shadowed = require('not-a-module');
