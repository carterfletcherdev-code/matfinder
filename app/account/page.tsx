'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';
import Header from '@/components/Header';
import BackButton from '@/components/BackButton';
import { useOwnedGyms } from '@/lib/useOwnedGyms';
import { Button } from '@/components/ui';

interface CheckIn {
  id: string;
  gym_id: string;
  checked_in_at: string;
  note: string | null;
}

interface GymMap { [id: string]: string }

export default function AccountPage() {
  const { user, tier, requireAuth } = useAuth();
  const ownedGymIds = useOwnedGyms();
  const ownerHref = ownedGymIds.length === 1
    ? `/owner/${ownedGymIds[0]}`
    : '/owner';
  const [checkins, setCheckins] = useState<CheckIn[] | null>(null);
  const [gymNames, setGymNames] = useState<GymMap>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Pro perk: full training history. Free users are limited to the
  // last 30 days — beyond that they need to upgrade.
  useEffect(() => {
    if (!user) return;
    let q = supabase
      .from('checkins')
      .select('id, gym_id, checked_in_at, note')
      .eq('user_id', user.id)
      .order('checked_in_at', { ascending: false });
    if (tier !== 'pro') {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      q = q.gte('checked_in_at', cutoff);
    }
    q.then(({ data }) => setCheckins(data ?? []));
  }, [user, tier]);

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
      {/* Compact header — no Add Gym, no Sign Out (sign-out lives only in
          the popup profile dropdown now). */}
      <Header hideAddGym hideSignOut />
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 48px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>

          {!user ? (
            <div style={{ textAlign: 'center', marginTop: 60 }}>
              <p style={{ marginBottom: 16 }}>Sign in to view your account.</p>
              <Button
                onClick={() => requireAuth(() => {})}
                variant="secondary"
                size="md"
                style={{ borderRadius: 'var(--radius-full)', fontWeight: 700 }}
              >
                Sign in
              </Button>
            </div>
          ) : (
            <>
              {/* Top row: title + back */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h1 style={{ margin: 0, fontSize: 22, fontFamily: "'Archivo Black', sans-serif" }}>Account</h1>
                <BackButton fallbackHref="/" />
              </div>

              {/* Email */}
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12, fontFamily: "'Inter Tight', sans-serif" }}>{user.email}</div>

              {/* Tier pill — bone outline */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span style={{
                  fontSize: 12, fontWeight: 700, color: tierColor,
                  background: 'transparent',
                  border: '1.5px solid var(--bone)',
                  borderRadius: 'var(--radius-full)',
                  padding: '3px 12px',
                  fontFamily: "'Inter Tight', sans-serif",
                }}>
                  {tierLabel}
                </span>
              </div>

              {/* Manage Your Gym — gold-outlined entry point for verified
                  gym owners. Renders above the consumer-tier upgrade CTA
                  so an owner sees their gym tools first. */}
              {ownedGymIds.length > 0 && (
                <Link
                  href={ownerHref}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 12, width: '100%',
                    padding: '14px 18px',
                    border: '1.5px solid #C9A24A',
                    background: 'rgba(201,162,74,0.08)',
                    borderRadius: 'var(--radius-md)',
                    textDecoration: 'none',
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <div style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                      fontFamily: "'JetBrains Mono', monospace",
                      color: '#C9A24A', textTransform: 'uppercase',
                      marginBottom: 4,
                    }}>Featured</div>
                    <div style={{
                      fontSize: 15, fontWeight: 700, color: 'var(--text-primary)',
                      fontFamily: "'Inter Tight', sans-serif",
                    }}>Manage Your Gym</div>
                    <div style={{
                      fontSize: 12, color: 'var(--text-secondary)',
                      fontFamily: "'Inter Tight', sans-serif",
                      marginTop: 2,
                    }}>
                      Edit schedule, listing details, and view analytics
                    </div>
                  </div>
                </Link>
              )}

              {/* Upgrade CTA — primary, bone-outlined card-style button */}
              {tier !== 'pro' && (
                <Link
                  href="/account/upgrade"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 12, width: '100%',
                    padding: '14px 18px',
                    border: '1.5px solid var(--bone)',
                    borderRadius: 'var(--radius-lg)',
                    background: 'linear-gradient(135deg, rgba(245,241,232,0.12), rgba(201,162,74,0.18))',
                    color: 'var(--text-primary)',
                    fontFamily: "'Inter Tight', sans-serif",
                    fontWeight: 700,
                    textDecoration: 'none',
                    marginBottom: 32,
                    transition: 'all 0.15s',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 16, marginBottom: 2 }}>Upgrade to Pro ✨</div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
                      Unlimited favorites · Featured gym placement · Priority support
                    </div>
                  </div>
                  <span style={{ fontSize: 18, opacity: 0.7 }}>→</span>
                </Link>
              )}

              {/* Check-in history — bone outlined cards */}
              <div style={{ marginBottom: 32 }}>
                <h2 style={{ margin: '0 0 12px', fontSize: 17, fontFamily: "'Inter Tight', sans-serif", fontWeight: 700 }}>Check-in history</h2>
                {checkins === null ? (
                  <div style={{
                    border: '1.5px solid var(--bone)', borderRadius: 'var(--radius-lg)',
                    padding: 16, color: 'var(--text-muted)', fontSize: 14,
                    fontFamily: "'Inter Tight', sans-serif",
                  }}>Loading…</div>
                ) : checkins.length === 0 ? (
                  <div style={{
                    background: 'transparent',
                    border: '1.5px solid var(--bone)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 20, textAlign: 'center',
                    color: 'var(--text-muted)', fontSize: 13,
                    fontFamily: "'Inter Tight', sans-serif",
                  }}>
                    No check-ins yet. Use the "Check in" button on any gym to log a visit.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {checkins.map(c => (
                      <div
                        key={c.id}
                        onClick={() => setExpandedId(prev => prev === c.id ? null : c.id)}
                        style={{
                          background: 'transparent',
                          border: '1.5px solid var(--bone)',
                          borderRadius: 'var(--radius-lg)',
                          padding: '12px 14px', cursor: 'pointer',
                          fontFamily: "'Inter Tight', sans-serif",
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
                          <div style={{
                            marginTop: 10, fontSize: 13, color: 'var(--text-secondary)',
                            whiteSpace: 'pre-wrap',
                            borderTop: '1px solid rgba(245,241,232,0.18)', paddingTop: 10,
                          }}>
                            {c.note}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
