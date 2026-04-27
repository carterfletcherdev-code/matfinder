'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';

function SuccessContent() {
  const params = useSearchParams();
  const gymName = params.get('gym_name') || 'your gym';

  return (
    <div style={{
      minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text-primary)',
      fontFamily: "'Inter Tight', sans-serif",
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ maxWidth: 480, textAlign: 'center', padding: '40px 24px' }}>
        <div style={{ fontSize: 56, marginBottom: 24 }}>🎉</div>
        <h1 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 28, margin: '0 0 12px' }}>
          You&apos;re now featured!
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 16, lineHeight: 1.6, marginBottom: 32 }}>
          <strong style={{ color: 'var(--text-primary)' }}>{decodeURIComponent(gymName)}</strong> now has a featured listing on MatFinder.
          Your gym will appear at the top of search results within a few minutes.
        </p>
        <div style={{
          background: 'var(--surface-raised)', borderRadius: 12,
          border: '1px solid var(--border)', padding: '16px 20px',
          fontSize: 14, color: 'var(--text-secondary)', marginBottom: 32, textAlign: 'left',
        }}>
          <p style={{ margin: '0 0 8px', fontWeight: 600, color: 'var(--text-primary)' }}>What happens next</p>
          <p style={{ margin: '0 0 6px' }}>📧 Receipt sent to your email via Stripe</p>
          <p style={{ margin: '0 0 6px' }}>⭐ Featured badge appears on your listing within 5 minutes</p>
          <p style={{ margin: 0 }}>✏️ Reply to your receipt email to request schedule updates</p>
        </div>
        <Link
          href="/"
          style={{
            display: 'inline-block', padding: '12px 28px', borderRadius: 8,
            background: '#C4973A', color: '#1A1008',
            fontSize: 15, fontWeight: 700, textDecoration: 'none',
          }}
        >
          Back to MatFinder →
        </Link>
      </div>
    </div>
  );
}

export default function ClaimSuccessPage() {
  return (
    <Suspense>
      <SuccessContent />
    </Suspense>
  );
}
