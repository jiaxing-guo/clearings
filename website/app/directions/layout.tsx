import localFont from 'next/font/local';
import './directions.css';
const sans = localFont({
  src: '../../fonts/geist-latin.woff2',
  variable: '--font-direction-sans',
  display: 'swap',
  weight: '100 900',
});
const mono = localFont({
  src: '../../fonts/geist-mono-latin.woff2',
  variable: '--font-direction-mono',
  display: 'swap',
  weight: '100 900',
});
export const metadata = { title: 'Visual directions', robots: { index: false, follow: false } };
export default function DirectionLayout({ children }: { children: React.ReactNode }) {
  return <div className={`direction-family ${sans.variable} ${mono.variable}`}>{children}</div>;
}
