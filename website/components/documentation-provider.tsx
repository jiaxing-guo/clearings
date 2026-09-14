'use client';
import { RootProvider } from 'fumadocs-ui/provider/next';
import StaticSearch from './search';
export function DocumentationProvider({ children }: { children: React.ReactNode }) {
  return <RootProvider search={{ SearchDialog: StaticSearch }}>{children}</RootProvider>;
}
