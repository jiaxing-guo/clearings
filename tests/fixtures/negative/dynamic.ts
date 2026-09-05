export function callback(fn: (value: string) => string): string { return fn('x'); }
const handlers: Record<string, (value: string) => string> = {};
export function register(key: string, handler: (value: string) => string): void { handlers[key] = handler; }
export function dispatch(key: string): string | undefined { return handlers[key]?.('x'); }
export function overloaded(value: string): string;
export function overloaded(value: number): number;
export function overloaded(value: string | number) { return value; }
export const useOverload = () => overloaded('x');
let mutable = (value: string) => value;
mutable = (value) => 'replacement';
export const useMutable = () => mutable('x');
function rebound(value: string): string { return value; }
[rebound] = [(value: string) => 'replacement'];
export const useRebound = () => rebound('x');
declare class ExternalClass { value: string }
export const useExternal = () => new ExternalClass();
