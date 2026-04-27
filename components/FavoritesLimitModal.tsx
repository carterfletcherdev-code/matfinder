'use client';

import Link from 'next/link';
import { useAuth, FAVORITES_LIMITS } from './AuthProvider';
import { useFavorites } from './FavoritesProvider';

export function FavoritesLimitModal() {
  const { tier } = useAuth();
  const { showLimitModal, setShowLimitModal, count, limit } = useFavorites();

  if (!showLimitModal) return null;

  const close = () => setShowLimitModal(false);

  const nextTier = tier === 'free' ? 'standard' : tier === 'standard' ? 'pro' : null;
  const nextLimit = nextTier ? FAVORITES_LIMITS[nextTier] : null;
  const nextPrice = nextTier === 'standard' ? '$4.99/mo' : nextTier === 'pro' ? '$9.99/mo' : null;

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg)', color: 'var(--fg)',
          border: '1px solid var(--border)', borderRadius: 12,
          padding: 24, width: '100%', maxWidth: 400,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Favorites limit reached</h2>
          <button
            onClick={close}
            style={{ background: 'none', border: 'none', color: 'var(--fg)', fontSize: 20, cursor: 'pointer' }}
          >×</button>
        </div>

        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--muted)' }}>
          You&apos;ve favorited {count} of {limit === Infinity ? '∞' : limit} gyms on the <strong>{tier}</strong> plan.
        </p>

        {nextTier && nextLimit && (
          <div style={{
            background: 'var(--bg-elev)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 14, marginBottom: 16,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
              Upgrade to {nextTier === 'standard' ? 'Standard' : 'Pro'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
              {nextLimit === Infinity ? 'Unlimited favorites' : `Up to ${nextLimit} favorites`} · {nextPrice}
            </div>
            <Link
              href="/account/billing"
              onClick={close}
              style={{
                display: 'inline-block',
                background: 'var(--accent)', color: '#000',
                padding: '8px 14px', borderRadius: 6,
                fontSize: 13, fontWeight: 700, textDecoration: 'none',
              }}
            >
              Upgrade for {nextPrice}
            </Link>
          </div>
        )}

        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
          Or remove some favorites to make room.
        </p>
      </div>
    </div>
  );
}
