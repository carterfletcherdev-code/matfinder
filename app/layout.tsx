import type { Metadata } from 'next';
import './globals.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Analytics } from '@vercel/analytics/react';
import { AuthProvider } from '@/components/AuthProvider';
import { RatingsProvider } from '@/components/RatingsProvider';
import { FavoritesProvider } from '@/components/FavoritesProvider';
import { SignInModal } from '@/components/SignInModal';
import { FavoritesLimitModal } from '@/components/FavoritesLimitModal';

export const metadata: Metadata = {
  title: 'MatFinder — Find Open Mats & Martial Arts Gyms',
  description:
    'Find open mat sessions, class schedules, and martial arts gyms near you. BJJ, No-Gi, Wrestling, Judo, Muay Thai, MMA, Kickboxing, and Boxing. 15,000+ gyms worldwide.',
  keywords: [
    'open mat', 'BJJ open mat', 'jiu jitsu open mat', 'martial arts gym',
    'find open mat near me', 'wrestling open mat', 'judo open mat',
    'muay thai gym', 'MMA gym', 'boxing gym', 'no-gi BJJ',
  ],
  metadataBase: new URL('https://matfinder.app'),
  openGraph: {
    title: 'MatFinder — Find Open Mats Near You',
    description: 'Find BJJ, wrestling, muay thai, and MMA open mats near you or anywhere you travel. 15,000+ gyms worldwide with verified schedules.',
    type: 'website',
    url: 'https://matfinder.app',
    siteName: 'MatFinder',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'MatFinder — Find Open Mats Near You' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MatFinder — Find Open Mats Near You',
    description: 'Find BJJ, wrestling, muay thai, and MMA open mats near you or anywhere you travel.',
    images: ['/og-image.png'],
  },
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://matfinder.app' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" style={{ height: '100dvh', overflow: 'hidden' }}>
      <body style={{ height: '100dvh', margin: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AuthProvider>
          <RatingsProvider>
            <FavoritesProvider>
              <main style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {children}
              </main>
              <SignInModal />
              <FavoritesLimitModal />
            </FavoritesProvider>
          </RatingsProvider>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
