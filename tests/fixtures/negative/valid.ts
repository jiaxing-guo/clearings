import { absent } from 'not-installed';
import { missing } from './does-not-exist.js';
export const valid = (input: string): string => input;
export const useMissing = () => absent(missing());
