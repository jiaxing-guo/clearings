import routes from './historical-routes.json';
export const historicalRevision = 'a089d59c52a8d67d0e67fc27b2d6cb3a99da4c93';
export const historicalRoutes: Readonly<Record<string, string>> = routes;
export function historicalSource(path: string) {
  return `https://github.com/jiaxing-guo/clearings/blob/${historicalRevision}/${path}`;
}
