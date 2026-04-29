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
  title: 'MatFinder — The Martial Arts Gym Finder',
  description:
    '15,000+ martial arts gyms worldwide with community-confirmed open mat schedules. BJJ, No-Gi, Wrestling, Judo, Muay Thai, MMA, Kickboxing, Boxing. Find a gym, drop in, train.',
  keywords: [
    'open mat', 'BJJ open mat', 'jiu jitsu open mat', 'martial arts gym',
    'find open mat near me', 'wrestling open mat', 'judo open mat',
    'muay thai gym', 'MMA gym', 'boxing gym', 'no-gi BJJ',
  ],
  metadataBase: new URL('https://matfinder.app'),
  openGraph: {
    title: 'MatFinder — The Martial Arts Gym Finder',
    description: '15,000+ gyms worldwide. Community-confirmed open mat times for BJJ, wrestling, muay thai, MMA, and more.',
    type: 'website',
    url: 'https://matfinder.app',
    siteName: 'MatFinder',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'MatFinder — The Martial Arts Gym Finder' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MatFinder — The Martial Arts Gym Finder',
    description: '15,000+ martial arts gyms worldwide with community-confirmed open mat schedules.',
    images: ['/og-image.png'],
  },
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://matfinder.app' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" style={{ height: '100dvh', overflow: 'hidden' }}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        {/* Preload the gym data in parallel with HTML/JS download so the
            map's `fetch('/api/gyms')` resolves from the HTTP cache the
            moment React mounts. Pins appear ~instantly instead of ~1s
            after first paint. crossOrigin="anonymous" matches what fetch()
            uses by default so the preload is reused. */}
        <link
          rel="preload"
          href="/api/gyms"
          as="fetch"
          crossOrigin="anonymous"
          fetchPriority="high"
        />
      </head>
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
