'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { GYMS, EXTRA_US_GYMS, EU_GYMS, US_OSM_GYMS, GLOBAL_GYMS } from '@/lib/data';
import type { Gym } from '@/lib/types';
import { Button } from '@/components/ui';

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
      position: 'relative',
    }}>
      {/* Sticky bone-outlined Back pill — top-right of viewport.
          Uses Link href="/" which round-trips through the map's
          sessionStorage state restore (matfinder_map_state), so the
          map returns to the user's prior sort/center/zoom. */}
      <Link
        href="/"
        style={{
          position: 'fixed', top: 16, right: 16, zIndex: 1000,
          display: 'inline-flex', alignItems: 'center',
          padding: '8px 16px',
          background: 'var(--surface-base)',
          border: '1.5px solid var(--bone)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-primary)',
          fontFamily: "'Inter Tight', sans-serif",
          fontSize: 13, fontWeight: 700,
          textDecoration: 'none',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        Back
      </Link>

      <div style={{ maxWidth: 580, margin: '0 auto', padding: '32px 24px 80px' }}>
        {/* Header — reworded to make it clear this is a paid upgrade,
            not a status they already have. */}
        <div style={{ marginTop: 24, marginBottom: 32, paddingRight: 80 }}>
          <div style={{
            display: 'inline-block', background: 'rgba(196,151,58,0.15)',
            border: '1px solid rgba(196,151,58,0.4)', borderRadius: 'var(--radius-md)',
            padding: '4px 12px', fontSize: 12, fontWeight: 700,
            color: '#C4973A', letterSpacing: '0.04em', marginBottom: 16,
          }}>
            ★ GET FEATURED — $29.99/mo
          </div>
          <h1 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 28, margin: '0 0 6px' }}>
            Feature {gym.name}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 15, margin: 0 }}>
            {locationStr}
          </p>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 12, lineHeight: 1.5 }}>
            Pay to feature your gym at the top of MatFinder, edit your own schedule,
            and see who&rsquo;s viewing your listing. After payment we verify you own
            the gym before your featured status goes live.
          </p>
        </div>

        {/* Benefits */}
        <div style={{
          background: 'var(--surface-raised)', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)', padding: '20px 24px', marginBottom: 24,
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

        {/* Verification info — three-tier ladder from instant to manual,
            plus an authorize-not-charge guarantee at the top so the user
            sees the no-risk framing first. */}
        <div style={{
          background: 'var(--surface-base)',
          border: '1.5px solid var(--bone)',
          borderRadius: 'var(--radius-md)',
          padding: '16px 20px', marginBottom: 32,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
            color: 'var(--muted)', textTransform: 'uppercase',
            marginBottom: 8,
          }}>How we verify ownership</div>

          <p style={{
            margin: '0 0 12px', fontSize: 13, lineHeight: 1.55,
            color: 'var(--text-secondary)',
          }}>
            Your card is authorized at checkout but <b style={{ color: 'var(--text-primary)' }}>not charged</b> until
            verification clears. If we can&rsquo;t verify ownership, the
            authorization is voided in full — no risk.
          </p>

          <ol style={{
            margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.6,
            color: 'var(--text-secondary)',
          }}>
            <li>
              <b style={{ color: 'var(--text-primary)' }}>Email match</b>{' '}
              <span style={{ opacity: 0.8 }}>(instant)</span> — Use the email
              address publicly listed on your gym&rsquo;s website, Google Business
              profile, or social-media bio. We send a confirmation link; one
              click activates the listing. Domain emails (e.g.{' '}
              <code style={{ fontSize: 12 }}>you@yourgym.com</code>) and generic
              email accounts (e.g. Gmail) both work, as long as the address
              matches one already published for the gym.
            </li>
            <li>
              <b style={{ color: 'var(--text-primary)' }}>Phone callback</b>{' '}
              <span style={{ opacity: 0.8 }}>(under 1 hour during business hours)</span>{' '}
              — If no public email is on file, we call the gym&rsquo;s publicly
              listed phone number. Pick up, confirm a 6-digit code, you&rsquo;re
              verified.
            </li>
            <li>
              <b style={{ color: 'var(--text-primary)' }}>Photo verification</b>{' '}
              <span style={{ opacity: 0.8 }}>(up to 24 hours)</span> — As a
              fallback, send a photo of yourself inside the gym holding a piece
              of paper with a unique 6-digit code we email you. Our reviewer
              matches the photo to the gym&rsquo;s Street View / public photos.
            </li>
          </ol>

          <p style={{
            margin: '12px 0 0', fontSize: 12,
            color: 'var(--text-muted)', lineHeight: 1.5,
          }}>
            Most claims clear within an hour during business hours and within 24
            hours otherwise. We email you the moment your listing goes live.
            Questions? <a
              href="mailto:carterfletcherdev@gmail.com"
              style={{ color: 'var(--bone)', textDecoration: 'underline' }}
            >carterfletcherdev@gmail.com</a>
          </p>
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
                width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--border)', background: 'var(--surface-raised)',
                color: 'var(--text-primary)', fontSize: 15,
                fontFamily: "'Inter Tight', sans-serif", boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Email on your gym&rsquo;s public listings
            </label>
            <input
              type="email"
              required
              value={ownerEmail}
              onChange={e => setOwnerEmail(e.target.value)}
              placeholder="you@yourgym.com"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--border)', background: 'var(--surface-raised)',
                color: 'var(--text-primary)', fontSize: 15,
                fontFamily: "'Inter Tight', sans-serif", boxSizing: 'border-box',
              }}
            />
            <p style={{
              fontSize: 12, color: 'var(--text-muted)', margin: '6px 2px 0',
            }}>
              Use an address that&rsquo;s already on your gym&rsquo;s website, Google profile,
              or Instagram bio. Gmail / Yahoo / Outlook addresses all work as long as
              they match one we can find publicly.
            </p>
          </div>

          {error && (
            <p style={{ color: '#E06060', fontSize: 13, margin: 0 }}>{error}</p>
          )}

          <Button
            type="submit"
            disabled={submitting || !ownerName.trim() || !ownerEmail.trim()}
            loading={submitting}
            variant="primary"
            size="lg"
            style={{
              background: '#C4973A',
              borderColor: '#C4973A',
              color: '#1A1008',
              fontWeight: 700,
              fontSize: 15,
            }}
          >
            {submitting ? 'Redirecting to checkout…' : 'Continue to payment — $29.99/mo'}
          </Button>

          <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
            Secure payment via Stripe · Cancel anytime · Refund if verification fails
          </p>
        </form>
      </div>
    </div>
  );
}
