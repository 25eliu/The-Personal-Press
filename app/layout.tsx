import type { Metadata } from 'next';
import { Playfair_Display, UnifrakturCook } from 'next/font/google';
import './globals.css';

const masthead = UnifrakturCook({ weight: '700', subsets: ['latin'], variable: '--font-masthead' });
const head = Playfair_Display({ subsets: ['latin'], variable: '--font-head' });

export const metadata: Metadata = {
  title: 'The Daily Tako',
  description: 'A customizable AI newspaper grounded in real, sourced data.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${masthead.variable} ${head.variable}`}>{children}</body>
    </html>
  );
}
