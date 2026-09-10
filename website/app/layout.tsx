import './global.css';
import { DocumentationProvider } from '@/components/documentation-provider';
export const metadata = {
  title: { default: 'Clearings', template: '%s · Clearings' },
  description: 'Clearings: product requirements for managed execution of backend operations.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <DocumentationProvider>{children}</DocumentationProvider>
      </body>
    </html>
  );
}
