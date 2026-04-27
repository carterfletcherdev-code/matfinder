'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { useFavorites } from '@/components/FavoritesProvider';
import GymCard from '@/components/GymCard';
import type { Gym } from '@/lib/types';

export default function FavoritesPage() {
  const { session, tier, requireAuth } = useAuth();
  const { favorites, count, limit } = useFavorites();
  const [gyms, setGyms] = useState<Gym[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/gyms').then(r => r.json()).then((data: Gym[]) => {
      if (!cancelled) setGyms(data);
    });
    return () => { cancelled = true; };
  }, []);

  const myGyms = gyms ? gyms.filter(g => favorites.has(g.id)) : null;

  return (
    <div style={{
      flex: 1, overflowY: 'auto', padding: '20px 24px 48px',
      background: 'var(--bg)', color: 'var(--fg)',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <Link href="/" style={{ color: 'var(--muted)', fontSize: 13, textDecoration: 'none' }}>
            ← Back to map
          </Link>
        </div>

        <h1 style={{ margin: '0 0 4px', fontSize: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#E11D48' }}>♥</span> Favorites
        </h1>
        <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 24 }}>
          {session?.user
            ? `${count}${limit === Infinity ? '' : ` of ${limit}`} favorites · ${tier} plan`
            : 'Sign in to save favorites'}
        </div>

        {!session?.user ? (
          <div style={{
            background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 12,
            padding: 24, textAlign: 'center',
          }}>
            <p style={{ margin: '0 0 12px', fontSize: 14 }}>
              Sign in to save gyms and access them from any device.
            </p>
            <button
              onClick={() => requireAuth(() => {})}
              style={{
                background: 'var(--accent)', color: '#000', border: 'none',
                padding: '8px 16px', borderRadius: 6, fontWeight: 700, cursor: 'pointer',
              }}
            >Sign in</button>
          </div>
        ) : myGyms === null ? (
          <div style={{ color: 'var(--muted)' }}>Loading…</div>
        ) : myGyms.length === 0 ? (
          <div style={{
            background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 12,
            padding: 24, textAlign: 'center',
          }}>
            <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>No favorites yet</p>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
              Tap the ♡ on any gym card to save it here.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {myGyms.map(g => (
              <GymCard
                key={g.id}
                gym={g}
                isSelected={selectedId === g.id}
                onClick={() => setSelectedId(prev => prev === g.id ? null : g.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
