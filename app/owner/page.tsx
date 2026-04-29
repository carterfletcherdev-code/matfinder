'use client';

// Owner index — lists every gym the signed-in user is a verified owner
// of, with a tile for each. If they own exactly one gym, they're
// auto-redirected to that gym's manage page so the index never gets in
// the way.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useOwnedGyms } from '@/lib/useOwnedGyms';
import { Button } from '@/components/ui';

interface GymLite {
  id: string;
  name: string;
  city?: string;
  state?: string;
  country?: string;
}

export default function OwnerIndexPage() {
  const { user, loading: authLoading, requireAuth } = useAuth();
  const ownedIds = useOwnedGyms();
  const router = useRouter();
  const [gyms, setGyms] = useState<Record<string, GymLite>>({});
  const [loadingGyms, setLoadingGyms] = useState(true);

  useEffect(() => {
    fetch('/api/gyms')
      .then(r => r.json())
      .then((all: GymLite[]) => {
        const map: Record<string, GymLite> = {};
        for (const g of all) map[g.id] = g;
        setGyms(map);
        setLoadingGyms(false);
      })
      .catch(() => setLoadingGyms(false));
  }, []);

  // Auto-redirect to the only gym they own (skip the listing page).
  useEffect(() => {
    if (ownedIds.length === 1) {
      router.replace(`/owner/${ownedIds[0]}`);
    }
  }, [ownedIds, router]);

  if (authLoading) return <Centered>Checking your account…</Centered>;
  if (!user) {
    return (
      <Centered>
        <p style={{ marginBottom: 14 }}>Sign in to manage your gym.</p>
        <Button
          onClick={() => requireAuth(() => {})}
          variant="secondary"
          size="md"
          style={{ borderRadius: 'var(--radius-full)', fontWeight: 700 }}
        >
          Sign in
        </Button>
      </Centered>
    );
  }
  if (ownedIds.length === 0) {
    return (
      <Centered>
        <p style={{ marginBottom: 6 }}>You don&rsquo;t own any gyms yet.</p>
        <p style={{ fontSize: 13, color: 'rgba(245,241,232,0.55)', marginBottom: 18 }}>
          Find your gym on the map, click <b style={{ color: 'var(--bone)' }}>Claim</b>,
          and finish the verification flow to get owner access.
        </p>
        <Link href="/" style={pillStyle()}>Back to Map</Link>
      </Centered>
    );
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg)',
      color: 'var(--bone)',
      fontFamily: "'Inter Tight', sans-serif",
      padding: '72px 16px 32px',
      overflowY: 'auto',
      position: 'relative',
    }}>
      <Link
        href="/"
        style={{
          position: 'fixed', top: 16, right: 16, zIndex: 1000,
          display: 'inline-flex', alignItems: 'center',
          padding: '8px 16px',
          background: 'var(--surface-base)',
          border: '1.5px solid var(--bone)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--bone)',
          fontSize: 13, fontWeight: 700,
          textDecoration: 'none',
          boxShadow: 'var(--shadow-md)',
        }}
      >Back to Map</Link>

      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.10em',
          color: '#C9A24A', textTransform: 'uppercase',
          fontFamily: "'JetBrains Mono', monospace",
          marginBottom: 4,
        }}>Featured · Verified owner</div>
        <h1 style={{ margin: '0 0 24px', fontSize: 24, fontWeight: 800 }}>Manage your gyms</h1>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ownedIds.map(id => {
            const g = gyms[id];
            return (
              <Link
                key={id}
                href={`/owner/${id}`}
                style={{
                  display: 'block',
                  padding: '14px 16px',
                  border: '1.5px solid var(--bone)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-base, rgba(0,0,0,0.18))',
                  textDecoration: 'none',
                  color: 'var(--bone)',
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {g?.name ?? (loadingGyms ? 'Loading…' : id)}
                </div>
                {g && (
                  <div style={{
                    fontSize: 12, color: 'rgba(245,241,232,0.65)',
                    fontFamily: "'JetBrains Mono', monospace",
                    marginTop: 4,
                  }}>
                    {[g.city, g.state, g.country].filter(Boolean).join(' · ')}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg)',
      color: 'var(--bone)',
      fontFamily: "'Inter Tight', sans-serif",
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px', textAlign: 'center',
    }}>
      <div style={{ maxWidth: 480 }}>{children}</div>
    </div>
  );
}

function pillStyle(): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '6px 14px',
    borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--bone)',
    background: 'transparent',
    color: 'var(--bone)',
    fontFamily: "'Inter Tight', sans-serif",
    fontSize: 12, fontWeight: 700,
    cursor: 'pointer',
    textDecoration: 'none',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  };
}
