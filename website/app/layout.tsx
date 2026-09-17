import localFont from 'next/font/local';
import './global.css';
import { DocumentationProvider } from '@/components/documentation-provider';

const geist = localFont({
  src: '../fonts/geist.woff2',
  variable: '--font-geist',
  display: 'swap',
  weight: '100 900',
});
const geistMono = localFont({
  src: '../fonts/geist-mono.woff2',
  variable: '--font-geist-mono',
  display: 'swap',
  weight: '100 900',
});

export const metadata = {
  title: { default: 'Clearings · Useful work, on file.', template: '%s · Clearings' },
  description:
    'Turn repeated agent work into reusable code. Clearings helps Codex and Claude Code save, check, and reuse routines on fresh inputs.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body>
        <DocumentationProvider>{children}</DocumentationProvider>
      </body>
    </html>
  );
}
