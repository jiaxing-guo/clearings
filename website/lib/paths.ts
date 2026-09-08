/** Raw asset links need the prefix; Next Link adds it to application routes. */
export const assetPath = (path: string) =>
  `${process.env.NEXT_PUBLIC_DOCS_BASE_PATH ?? ''}/${path.replace(/^\//, '')}`;
