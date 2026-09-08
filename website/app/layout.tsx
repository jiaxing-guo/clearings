import './global.css';
import { Provider } from '@/components/provider';
export const metadata = {
  title: { default: 'Clearings', template: '%s · Clearings' },
  description:
    'Clearings technical documentation: architecture, typed contract semantics, abstraction, validation, and worked examples.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
