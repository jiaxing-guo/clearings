import './global.css';
import { Provider } from '@/components/provider';
export const metadata = { title: { default: 'Clearings', template: '%s · Clearings' }, description: 'Internal representation for AI coding. Inspect behavior, follow source evidence, and export bounded context.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" suppressHydrationWarning><body className="flex min-h-screen flex-col"><Provider>{children}</Provider></body></html>;
}
