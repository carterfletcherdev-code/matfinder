import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/Header';

export const metadata: Metadata = {
  title: 'MatFinder — Find Open Mats Near You',
  description:
    'Discover open mat sessions for BJJ, No-Gi, Wrestling, Judo, Muay Thai, MMA, Kickboxing, and Boxing across the US and Europe.',
  openGraph: {
    title: 'MatFinder — Find Open Mats Near You',
    description: 'Find BJJ, wrestling, muay thai, and MMA open mats near you or anywhere you travel.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ height: '100dvh', overflow: 'hidden' }}>
      <body style={{ height: '100dvh', margin: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header />
        <main style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
