import { dispatch, register } from './registry.js';

register('upper', (value) => value.toUpperCase());
export function run(key: string, value: string): string | undefined {
  return dispatch(key, value);
}
