'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { GYMS, EXTRA_US_GYMS, EU_GYMS, US_OSM_GYMS, GLOBAL_GYMS } from '@/lib/data';
import type { Gym } from '@/lib/types';

const ALL_GYMS: Gym[] = [...GYMS, ...EXTRA_US_GYMS, ...EU_GYMS, ...US_OSM_GYMS, ...GLOBAL_GYMS];

export default function ClaimPage() {
  const params = useParams();
  const gymId = params.gymId as string;
  const router = useRouter();

  const gym = ALL_GYMS.find(g => String(g.id) === gymId);

  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!gym) router.replace('/');
  }, [gym, router]);

  if (!gym) return null;

  async function handleClaim(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gymId: String(gym!.id),
          gymName: gym!.name,
          ownerName,
          ownerEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }
      if (data.url) window.location.href = data.url;
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const locationStr = [gym.city, gym.state, gym.country].filter(Boolean).join(', ');

  return (
    <div style={{
      minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text-primary)',
      fontFamily: "'Inter Tight', sans-serif", overflowY: 'auto',
    }}>
      <div style={{ maxWidth: 580, margin: '0 auto', padding: '60px 24px 80px' }}>
        <Link href="/" style={{ color: 'var(--text-secondary)', fontSize: 14, textDecoration: 'none' }}>
          ← Back to MatFinder
        </Link>

        {/* Header */}
        <div style={{ marginTop: 32, marginBottom: 40 }}>
          <div style={{
            display: 'inline-block', background: 'rgba(196,151,58,0.15)',
            border: '1px solid rgba(196,151,58,0.4)', borderRadius: 999,
            padding: '4px 12px', fontSize: 12, fontWeight: 700,
            color: '#C4973A', letterSpacing: '0.04em', marginBottom: 16,
          }}>
            ★ FEATURED LISTING
          </div>
          <h1 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 28, margin: '0 0 6px' }}>
            Claim {gym.name}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 15, margin: 0 }}>
            {locationStr}
          </p>
        </div>

        {/* Benefits */}
        <div style={{
          background: 'var(--surface-raised)', borderRadius: 12,
          border: '1px solid var(--border)', padding: '20px 24px', marginBottom: 32,
        }}>
          <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-secondary)', marginTop: 0, marginBottom: 16 }}>
            WHAT YOU GET
          </p>
          {[
            ['★ Featured badge', 'Your gym appears at the top of search results with a gold featured badge.'],
            ['📍 Priority placement', 'Featured gyms are shown first in list and map views.'],
            ['✏️ Schedule editing', 'Update your gym\'s schedule, open mats, and contact info anytime.'],
            ['📊 Analytics', 'See how many people view and click your listing each week.'],
          ].map(([title, desc]) => (
            <div key={title} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{title.split(' ')[0]}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{title.slice(title.indexOf(' ') + 1)}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{desc}</div>
              </div>
            </div>
          ))}

          <div style={{
            marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)',
            display: 'flex', alignItems: 'baseline', gap: 8,
          }}>
            <span style={{ fontSize: 32, fontWeight: 800, fontFamily: "'Archivo Black', sans-serif" }}>$29.99</span>
            <span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>/ month · cancel anytime</span>
          </div>
        </div>

        {/* Claim form */}
        <form onSubmit={handleClaim} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Your name
            </label>
            <input
              type="text"
              required
              value={ownerName}
              onChange={e => setOwnerName(e.target.value)}
              placeholder="Jane Smith"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: '1.5px solid var(--border)', background: 'var(--surface-raised)',
                color: 'var(--text-primary)', fontSize: 15,
                fontFamily: "'Inter Tight', sans-serif", boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Business email
            </label>
            <input
              type="email"
              required
              value={ownerEmail}
              onChange={e => setOwnerEmail(e.target.value)}
              placeholder="you@yourgym.com"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: '1.5px solid var(--border)', background: 'var(--surface-raised)',
                color: 'var(--text-primary)', fontSize: 15,
                fontFamily: "'Inter Tight', sans-serif", boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <p style={{ color: '#E06060', fontSize: 13, margin: 0 }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting || !ownerName.trim() || !ownerEmail.trim()}
            style={{
              padding: '13px 24px', borderRadius: 8,
              background: submitting ? 'rgba(196,151,58,0.5)' : '#C4973A',
              color: '#1A1008', border: 'none', fontSize: 15, fontWeight: 700,
              fontFamily: "'Inter Tight', sans-serif", cursor: submitting ? 'wait' : 'pointer',
              opacity: !ownerName.trim() || !ownerEmail.trim() ? 0.6 : 1,
              transition: 'all 0.15s',
            }}
          >
            {submitting ? 'Redirecting to checkout…' : 'Claim listing — $29.99/mo →'}
          </button>

          <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
            Secure payment via Stripe · Cancel anytime · No setup fee
          </p>
        </form>
      </div>
    </div>
  );
}
