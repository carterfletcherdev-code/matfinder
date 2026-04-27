'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from './AuthProvider';
import { useFavorites } from './FavoritesProvider';
import { supabase } from '@/lib/supabase';

interface CheckIn {
  id: string;
  gym_id: string;
  gym_name: string | null;
  session_name: string | null;
  note: string | null;
  checked_in_at: string;
}

interface ProfileDropdownProps {
  gymNameById?: Record<string, string>;
  onGymClick?: (gymId: string) => void;
}

const TIER_LABELS = { free: 'Free', standard: 'Standard', pro: 'Pro' };
const TIER_COLORS = {
  free: 'rgba(245,241,232,0.45)',
  standard: '#7EC8A4',
  pro: '#C9A24A',
};

export default function ProfileDropdown({ gymNameById, onGymClick }: ProfileDropdownProps) {
  const { user, tier, signOut, requireAuth, signInWithEmail, signInWithGoogle } = useAuth();
  const { favorites } = useFavorites();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'sessions' | 'favorites' | 'account'>('sessions');
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [loadingCheckins, setLoadingCheckins] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  // Load check-ins when opening sessions tab
  useEffect(() => {
    if (!open || tab !== 'sessions' || !user) return;
    setLoadingCheckins(true);
    supabase
      .from('checkins')
      .select('id, gym_id, gym_name, session_name, note, checked_in_at')
      .eq('user_id', user.id)
      .order('checked_in_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setCheckins((data as CheckIn[]) ?? []);
        setLoadingCheckins(false);
      });
  }, [open, tab, user]);

  const avatarLetter = user?.email?.[0]?.toUpperCase() ?? '?';

  return (
    <div ref={dropdownRef} style={{ position: 'relative', flexShrink: 0 }}>
      {/* Trigger button */}
      <button
        onClick={() => {
          if (!user) { requireAuth(() => setOpen(true)); return; }
          setOpen(v => !v);
        }}
        title={user ? `Account (${user.email})` : 'Sign in'}
        style={{
          width: 28, height: 28, borderRadius: '50%',
          border: `1.5px solid ${open ? 'var(--accent)' : 'var(--bone)'}`,
          background: open ? 'var(--accent)' : 'transparent',
          color: 'var(--bone)',
          fontSize: 12, fontWeight: 700, fontFamily: "'Inter Tight', sans-serif",
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >{user ? avatarLetter : '→'}</button>

      {/* Dropdown panel */}
      {open && user && (
        <div
          style={{
            position: 'absolute', top: 36, right: 0, zIndex: 800,
            width: 300,
            maxHeight: '80vh',
            overflowY: 'auto',
            borderRadius: 'var(--radius-lg)',
            background: 'rgba(30,20,14,0.97)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(245,241,232,0.15)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
          }}
          className="no-scrollbar"
        >
          {/* Header */}
          <div style={{
            padding: '14px 16px 10px',
            borderBottom: '1px solid rgba(245,241,232,0.12)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'var(--accent)', color: 'var(--bone)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 800, fontFamily: "'Inter Tight', sans-serif",
              flexShrink: 0,
            }}>{avatarLetter}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12, fontWeight: 700, fontFamily: "'Inter Tight', sans-serif",
                color: 'var(--bone)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{user.email}</div>
              <div style={{
                fontSize: 10, fontWeight: 700,
                color: TIER_COLORS[tier],
                fontFamily: "'JetBrains Mono', monospace",
                textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2,
              }}>{TIER_LABELS[tier]}</div>
            </div>
            <button
              onClick={() => { signOut(); setOpen(false); }}
              style={{
                background: 'none', border: '1px solid rgba(245,241,232,0.25)',
                color: 'rgba(245,241,232,0.60)', borderRadius: 6,
                fontSize: 10, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
                padding: '3px 8px', cursor: 'pointer', flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >Sign out</button>
          </div>

          {/* Tabs */}
          <div style={{
            display: 'flex', borderBottom: '1px solid rgba(245,241,232,0.12)',
          }}>
            {(['sessions', 'favorites', 'account'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1, padding: '8px 4px',
                  background: 'none', border: 'none',
                  color: tab === t ? 'var(--bone)' : 'rgba(245,241,232,0.45)',
                  fontSize: 11, fontWeight: 700, fontFamily: "'Inter Tight', sans-serif",
                  cursor: 'pointer', textTransform: 'capitalize',
                  borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`,
                  transition: 'all 0.12s',
                }}
              >{t}</button>
            ))}
          </div>

          {/* Sessions tab */}
          {tab === 'sessions' && (
            <div style={{ padding: '8px 0' }}>
              {loadingCheckins ? (
                <div style={{ padding: '20px', textAlign: 'center', fontSize: 12, color: 'rgba(245,241,232,0.45)', fontFamily: "'Inter Tight', sans-serif" }}>
                  Loading…
                </div>
              ) : checkins.length === 0 ? (
                <div style={{ padding: '20px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: 'rgba(245,241,232,0.55)', fontFamily: "'Inter Tight', sans-serif", marginBottom: 6 }}>
                    No sessions logged yet
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(245,241,232,0.35)', fontFamily: "'Inter Tight', sans-serif" }}>
                    Use the ✓ Check in button on any gym card to log a session.
                  </div>
                </div>
              ) : (
                checkins.map(ci => {
                  const gymName = ci.gym_name ?? gymNameById?.[ci.gym_id] ?? ci.gym_id;
                  const date = new Date(ci.checked_in_at);
                  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  return (
                    <div
                      key={ci.id}
                      style={{
                        padding: '9px 16px',
                        borderBottom: '1px solid rgba(245,241,232,0.07)',
                        cursor: onGymClick ? 'pointer' : 'default',
                      }}
                      onClick={() => { if (onGymClick) { onGymClick(ci.gym_id); setOpen(false); } }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{
                          fontSize: 12, fontWeight: 700, fontFamily: "'Inter Tight', sans-serif",
                          color: 'var(--bone)', flex: 1, minWidth: 0,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {ci.session_name || gymName}
                        </div>
                        <div style={{
                          fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                          color: 'rgba(245,241,232,0.40)', flexShrink: 0,
                        }}>{dateStr}</div>
                      </div>
                      {ci.session_name && (
                        <div style={{
                          fontSize: 11, color: 'rgba(245,241,232,0.55)', fontFamily: "'Inter Tight', sans-serif",
                          marginTop: 1,
                        }}>{gymName}</div>
                      )}
                      {ci.note && (
                        <div style={{
                          fontSize: 11, color: 'rgba(245,241,232,0.45)', fontFamily: "'Inter Tight', sans-serif",
                          marginTop: 3, lineHeight: 1.4,
                          overflow: 'hidden', display: '-webkit-box',
                          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        }}>{ci.note}</div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Favorites tab */}
          {tab === 'favorites' && (
            <div style={{ padding: '8px 0' }}>
              {favorites.size === 0 ? (
                <div style={{ padding: '20px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: 'rgba(245,241,232,0.55)', fontFamily: "'Inter Tight', sans-serif", marginBottom: 6 }}>
                    No favorites yet
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(245,241,232,0.35)', fontFamily: "'Inter Tight', sans-serif" }}>
                    Tap ♥ on any gym card to save it here.
                  </div>
                </div>
              ) : (
                [...favorites].map(gymId => {
                  const name = gymNameById?.[gymId] ?? gymId;
                  return (
                    <button
                      key={gymId}
                      onClick={() => { if (onGymClick) { onGymClick(gymId); setOpen(false); } }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        width: '100%', padding: '9px 16px',
                        background: 'none', border: 'none',
                        borderBottom: '1px solid rgba(245,241,232,0.07)',
                        cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <span style={{ color: '#C9A24A', fontSize: 12, flexShrink: 0 }}>♥</span>
                      <span style={{
                        fontSize: 12, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
                        color: 'var(--bone)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{name}</span>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* Account tab */}
          {tab === 'account' && (
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Upgrade section */}
              {tier === 'free' && (
                <div>
                  <div style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                    fontFamily: "'JetBrains Mono', monospace",
                    color: 'rgba(245,241,232,0.45)', textTransform: 'uppercase',
                    marginBottom: 8,
                  }}>Upgrade your plan</div>
                  {/* Pro first */}
                  <Link
                    href="/account/upgrade"
                    onClick={() => setOpen(false)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 12px', borderRadius: 8,
                      border: '1.5px solid #C9A24A',
                      background: 'rgba(201,162,74,0.08)',
                      textDecoration: 'none', marginBottom: 6,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#C9A24A', fontFamily: "'Inter Tight', sans-serif" }}>
                        Pro <span style={{ fontSize: 9, fontWeight: 800, background: '#C9A24A', color: '#1A1310', borderRadius: 3, padding: '1px 5px', marginLeft: 4 }}>BEST VALUE</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(245,241,232,0.55)', fontFamily: "'Inter Tight', sans-serif", marginTop: 2 }}>Unlimited favorites · alerts · priority support · $9.99/mo</div>
                    </div>
                    <span style={{ color: '#C9A24A', fontSize: 14, flexShrink: 0, marginLeft: 8 }}>→</span>
                  </Link>
                  {/* Standard second */}
                  <Link
                    href="/account/upgrade"
                    onClick={() => setOpen(false)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 12px', borderRadius: 8,
                      border: '1.5px solid #7EC8A4',
                      background: 'rgba(126,200,164,0.08)',
                      textDecoration: 'none',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#7EC8A4', fontFamily: "'Inter Tight', sans-serif" }}>Standard</div>
                      <div style={{ fontSize: 11, color: 'rgba(245,241,232,0.55)', fontFamily: "'Inter Tight', sans-serif", marginTop: 2 }}>30 favorites · session logs · $4.99/mo</div>
                    </div>
                    <span style={{ color: '#7EC8A4', fontSize: 14, flexShrink: 0, marginLeft: 8 }}>→</span>
                  </Link>
                </div>
              )}

              {tier !== 'free' && (
                <div style={{
                  padding: '10px 12px', borderRadius: 8,
                  border: `1.5px solid ${TIER_COLORS[tier]}`,
                  background: `${TIER_COLORS[tier]}12`,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: TIER_COLORS[tier], fontFamily: "'Inter Tight', sans-serif" }}>
                    {TIER_LABELS[tier]} plan active
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(245,241,232,0.55)', fontFamily: "'Inter Tight', sans-serif", marginTop: 2 }}>
                    Thanks for supporting MatFinder!
                  </div>
                </div>
              )}

              {/* Gym account */}
              <div>
                <div style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                  fontFamily: "'JetBrains Mono', monospace",
                  color: 'rgba(245,241,232,0.45)', textTransform: 'uppercase',
                  marginBottom: 8,
                }}>Gym owner?</div>
                <div style={{
                  padding: '10px 12px', borderRadius: 8,
                  border: '1px solid rgba(245,241,232,0.15)',
                  background: 'rgba(245,241,232,0.04)',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--bone)', fontFamily: "'Inter Tight', sans-serif", marginBottom: 4 }}>
                    Claim your gym listing
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(245,241,232,0.55)', fontFamily: "'Inter Tight', sans-serif", marginBottom: 8, lineHeight: 1.4 }}>
                    Get a featured listing, edit your schedule, and see visitor analytics.
                  </div>
                  <Link
                    href="/"
                    onClick={() => setOpen(false)}
                    style={{
                      display: 'inline-block',
                      padding: '5px 12px', borderRadius: 6,
                      border: '1.5px solid var(--bone)',
                      background: 'transparent', color: 'var(--bone)',
                      fontSize: 11, fontWeight: 700, fontFamily: "'Inter Tight', sans-serif",
                      textDecoration: 'none',
                    }}
                  >Search your gym →</Link>
                </div>
              </div>

              {/* Account page link */}
              <Link
                href="/account"
                onClick={() => setOpen(false)}
                style={{
                  display: 'block', padding: '8px 0',
                  fontSize: 12, color: 'var(--bone)',
                  fontFamily: "'Inter Tight', sans-serif",
                  textDecoration: 'underline', textAlign: 'center',
                  fontWeight: 600,
                }}
              >View full account page</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
