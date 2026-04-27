'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';
import Header from '@/components/Header';

interface CheckIn {
  id: string;
  gym_id: string;
  checked_in_at: string;
  note: string | null;
}

interface GymMap { [id: string]: string }

export default function AccountPage() {
  const { user, tier, signOut, requireAuth } = useAuth();
  const [checkins, setCheckins] = useState<CheckIn[] | null>(null);
  const [gymNames, setGymNames] = useState<GymMap>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('checkins')
      .select('id, gym_id, checked_in_at, note')
      .eq('user_id', user.id)
      .order('checked_in_at', { ascending: false })
      .then(({ data }) => setCheckins(data ?? []));
  }, [user]);

  useEffect(() => {
    if (!checkins?.length) return;
    const ids = [...new Set(checkins.map(c => c.gym_id))];
    fetch('/api/gyms')
      .then(r => r.json())
      .then((gyms: { id: string; name: string }[]) => {
        const map: GymMap = {};
        gyms.forEach(g => { if (ids.includes(g.id)) map[g.id] = g.name; });
        setGymNames(map);
      });
  }, [checkins]);

  const tierLabel = tier === 'free' ? 'Free' : tier === 'standard' ? 'Standard' : 'Pro';
  const tierColor = tier === 'pro' ? '#f59e0b' : tier === 'standard' ? '#3b82f6' : 'var(--text-muted)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', background: 'var(--bg)', color: 'var(--fg)' }}>
      <Header />
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 48px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>

          {!user ? (
            <div style={{ textAlign: 'center', marginTop: 60 }}>
              <p style={{ marginBottom: 16 }}>Sign in to view your account.</p>
              <button
                onClick={() => requireAuth(() => {})}
                style={{ background: 'var(--accent)', color: '#000', border: 'none', padding: '8px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
              >Sign in</button>
            </div>
          ) : (
            <>
              {/* Profile */}
              <div style={{ marginBottom: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <h1 style={{ margin: 0, fontSize: 22 }}>Account</h1>
                  <Link href="/" style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none' }}>← Back</Link>
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 2 }}>{user.email}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: tierColor, background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 20, padding: '2px 10px' }}>
                    {tierLabel}
                  </span>
                  {tier !== 'pro' && (
                    <Link href="/account/upgrade" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>
                      Upgrade →
                    </Link>
                  )}
                </div>
              </div>

              {/* Check-in history */}
              <div style={{ marginBottom: 32 }}>
                <h2 style={{ margin: '0 0 12px', fontSize: 17 }}>Check-in history</h2>
                {checkins === null ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</div>
                ) : checkins.length === 0 ? (
                  <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    No check-ins yet. Use the "Check in" button on any gym to log a visit.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {checkins.map(c => (
                      <div
                        key={c.id}
                        onClick={() => setExpandedId(prev => prev === c.id ? null : c.id)}
                        style={{
                          background: 'var(--bg-elev)', border: '1px solid var(--border)',
                          borderRadius: 10, padding: '12px 14px', cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>
                              {gymNames[c.gym_id] ?? c.gym_id}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                              {new Date(c.checked_in_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                          </div>
                          {c.note && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {expandedId === c.id ? '▲' : '▼'}
                            </span>
                          )}
                        </div>
                        {expandedId === c.id && c.note && (
                          <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                            {c.note}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sign out */}
              <button
                onClick={signOut}
                style={{ fontSize: 13, color: 'var(--text-muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}
              >Sign out</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
