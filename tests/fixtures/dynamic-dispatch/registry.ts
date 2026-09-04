export type Handler = (value: string) => string;

const handlers: Record<string, Handler> = {};
export function register(key: string, handler: Handler): void {
  handlers[key] = handler;
}
export function dispatch(key: string, value: string): string | undefined {
  return handlers[key]?.(value);
}
