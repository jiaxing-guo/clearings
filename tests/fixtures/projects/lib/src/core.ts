export interface Item { value: string }
export function normalize(value: string): string { return value; }
export const decorate = (value: string): string => normalize(value);
