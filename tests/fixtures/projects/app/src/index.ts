import type { Item } from '@lib/core';
import { clean, type Item as Other, decorate } from '@lib/barrel';
import * as library from '@lib/core';
export { clean as publicClean } from '@lib/barrel';
export function handle(item: Item): string { return clean(item.value); }
export const format = (value: string): string => decorate(value);
export const directNamespace = (value: string): string => library.normalize(value);
export type Alias = Other;
export type Imported = import('@lib/core').Item;
