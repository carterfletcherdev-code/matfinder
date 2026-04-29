'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { useFavorites } from '@/components/FavoritesProvider';
import { supabase, supabaseEnabled } from '@/lib/supabase';
import GymCard from '@/components/GymCard';
import type { Gym, Discipline, DayOfWeek } from '@/lib/types';
import { DISCIPLINE_LABELS, DISCIPLINE_COLORS } from '@/lib/types';
import { Button } from '@/components/ui';

type SortMode = 'recent' | 'alpha' | 'distance' | 'soon';
type GroupMode = 'none' | 'city' | 'country';

const DAYS: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Returns the soonest open mat starting within the next 24h, or null. */
function soonestStart(gym: Gym, now: Date): number | null {
  if (!gym.open_mats?.length) return null;
  let best: number | null = null;
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const target = new Date(now);
    target.setDate(now.getDate() + dayOffset);
    const dayName = DAYS[target.getDay()];
    for (const m of gym.open_mats) {
      if (m.day !== dayName) continue;
      const [h, mn] = (m.start_time || '00:00').split(':').map(Number);
      const start = new Date(target);
      start.setHours(h || 0, mn || 0, 0, 0);
      const ms = start.getTime() - now.getTime();
      if (ms < 0) continue;
      if (best === null || ms < best) best = ms;
    }
    if (best !== null && best < 24 * 3600 * 1000) return best;
  }
  return best;
}

// Mirrors components/Filters.tsx — uppercase mono section header sits
// ABOVE its row so every row's pills line up at the same left edge.
const SECTION_LABEL: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
  fontFamily: "'JetBrains Mono', monospace",
  color: 'rgba(245,241,232,0.55)', textTransform: 'uppercase',
  padding: '0 2px 6px',
};
const ROW: React.CSSProperties = {
  display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
};
const PILL_BASE: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '5px 11px',
  background: 'transparent',
  border: '1.5px solid rgba(245,241,232,0.30)',
  borderRadius: 'var(--radius-full)',
  color: 'rgba(245,241,232,0.85)',
  fontFamily: "'Inter Tight', sans-serif",
  fontSize: 12, fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  letterSpacing: '0.01em',
  transition: 'all 0.12s',
};
const PILL_ACTIVE: React.CSSProperties = {
  ...PILL_BASE,
  background: 'var(--surface-base)',
  border: '1.5px solid var(--bone)',
  color: 'var(--bone)',
};

export default function FavoritesPage() {
  const { session, tier, requireAuth } = useAuth();
  const { favorites, count, limit } = useFavorites();
  const userId = session?.user?.id;

  const [gyms, setGyms] = useState<Gym[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [favoritedAt, setFavoritedAt] = useState<Map<string, number>>(new Map());
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locStatus, setLocStatus] = useState<'idle' | 'asking' | 'denied'>('idle');

  // Controls
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [groupMode, setGroupMode] = useState<GroupMode>('none');
  // Multi-select filter keyed by DISCIPLINE LABEL (so Gi/No-Gi/BJJ collapse
  // into a single "Jiu-Jitsu" pill). Empty set = show all.
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set());
  // 7-day check-in counts (anonymous aggregate) — drives the
  // "X TRAINED THIS WEEK" social-proof badge on each card.
  const [checkinCounts, setCheckinCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch('/api/checkin-counts')
      .then(r => r.json())
      .then(d => setCheckinCounts(d.counts ?? {}))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/gyms').then(r => r.json()).then((data: Gym[]) => {
      if (!cancelled) setGyms(data);
    });
    return () => { cancelled = true; };
  }, []);

  // Pull favorite timestamps so we can sort by "Recently saved".
  useEffect(() => {
    if (!userId || !supabaseEnabled) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('favorites')
        .select('gym_id, created_at')
        .eq('user_id', userId);
      if (cancelled || !data) return;
      const map = new Map<string, number>();
      for (const r of data) {
        const t = r.created_at ? new Date(r.created_at).getTime() : 0;
        map.set(r.gym_id, t);
      }
      setFavoritedAt(map);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const requestLocation = () => {
    if (!('geolocation' in navigator)) { setLocStatus('denied'); return; }
    setLocStatus('asking');
    navigator.geolocation.getCurrentPosition(
      pos => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocStatus('idle');
      },
      () => setLocStatus('denied'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  };

  // Compute the visible list.
  const myGyms = gyms ? gyms.filter(g => favorites.has(g.id)) : null;

  // Disciplines present in the user's favorites — collapsed by label so
  // BJJ + No-Gi + Gi BJJ don't show as three separate "Jiu-Jitsu" pills.
  // We pick a representative discipline per label (first one we see) for
  // the dot color in the pill.
  const availableLabels = useMemo(() => {
    if (!myGyms) return [] as { label: string; rep: Discipline }[];
    const map = new Map<string, Discipline>();
    for (const g of myGyms) for (const m of g.open_mats || []) {
      const lbl = DISCIPLINE_LABELS[m.discipline];
      if (!map.has(lbl)) map.set(lbl, m.discipline);
    }
    return Array.from(map.entries())
      .map(([label, rep]) => ({ label, rep }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [myGyms]);

  const filtered = useMemo(() => {
    if (!myGyms) return null;
    if (selectedLabels.size === 0) return myGyms;
    return myGyms.filter(g => g.open_mats?.some(m =>
      selectedLabels.has(DISCIPLINE_LABELS[m.discipline])
    ));
  }, [myGyms, selectedLabels]);

  const sorted = useMemo(() => {
    if (!filtered) return null;
    const list = [...filtered];
    const now = new Date();
    if (sortMode === 'recent') {
      list.sort((a, b) => (favoritedAt.get(b.id) ?? 0) - (favoritedAt.get(a.id) ?? 0));
    } else if (sortMode === 'alpha') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === 'distance' && userLoc) {
      list.sort((a, b) => haversineKm(userLoc, a) - haversineKm(userLoc, b));
    } else if (sortMode === 'soon') {
      list.sort((a, b) => {
        const sa = soonestStart(a, now);
        const sb = soonestStart(b, now);
        if (sa === null && sb === null) return 0;
        if (sa === null) return 1;
        if (sb === null) return -1;
        return sa - sb;
      });
    }
    return list;
  }, [filtered, sortMode, favoritedAt, userLoc]);

  const toggleLabel = (label: string) => {
    setSelectedLabels(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  // Group output for rendering.
  const groups = useMemo(() => {
    if (!sorted) return null;
    if (groupMode === 'none') return [{ key: 'all', label: '', gyms: sorted }];
    const map = new Map<string, Gym[]>();
    for (const g of sorted) {
      const key = groupMode === 'city'
        ? [g.city, g.state].filter(Boolean).join(', ') || 'Unknown'
        : g.country || 'Unknown';
      const arr = map.get(key) || [];
      arr.push(g);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([key, gyms]) => ({ key, label: key, gyms }));
  }, [sorted, groupMode]);

  return (
    <div style={{
      flex: 1, minHeight: '100dvh', overflowY: 'auto',
      background: 'var(--bg)', color: 'var(--fg)',
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
          color: 'var(--text-primary)',
          fontFamily: "'Inter Tight', sans-serif",
          fontSize: 13, fontWeight: 700,
          textDecoration: 'none',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        Back to Map
      </Link>

      <div style={{ padding: '20px 24px 48px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h1 style={{ margin: '0 0 4px', fontSize: 24, paddingRight: 140 }}>Favorites</h1>
          <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
            {session?.user
              ? `${count}${limit === Infinity ? '' : ` of ${limit}`} favorites · ${tier} plan`
              : 'Sign in to save favorites'}
          </div>

          {session?.user && tier !== 'pro' && (
            <Link
              href="/account/upgrade"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 12, width: '100%',
                padding: '12px 16px',
                marginBottom: 20,
                border: '1.5px solid #FFD23F',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(255,210,63,0.08)',
                color: 'var(--text-primary)',
                fontFamily: "'Inter Tight', sans-serif",
                fontWeight: 700,
                textDecoration: 'none',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div>
                <div style={{ fontSize: 14, color: '#FFD23F', marginBottom: 2 }}>
                  Upgrade to Pro
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
                  Unlimited favorites · live calendar subscription · $59.99/yr (save 28%) or $6.99/mo
                </div>
              </div>
            </Link>
          )}

          {/* Controls — sort / filter / group. Section header sits above
              each row (mono uppercase) so every row of pills aligns at
              the same left edge. Mirrors components/Filters.tsx. */}
          {session?.user && myGyms && myGyms.length > 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 12,
              marginBottom: 18,
              padding: '14px 14px 16px',
              background: 'var(--brown-800)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
            }}>
              {/* Sort */}
              <div>
                <div style={SECTION_LABEL}>Sort</div>
                <div style={ROW}>
                  {([
                    ['recent', 'Recent'],
                    ['alpha', 'A–Z'],
                    ['soon', 'Starting soon'],
                    ['distance', 'Distance'],
                  ] as [SortMode, string][]).map(([mode, label]) => {
                    const active = sortMode === mode;
                    const onClick = () => {
                      setSortMode(mode);
                      if (mode === 'distance' && !userLoc && locStatus !== 'denied') requestLocation();
                    };
                    return (
                      <button key={mode} onClick={onClick} style={active ? PILL_ACTIVE : PILL_BASE}>
                        {label}
                        {mode === 'distance' && active && !userLoc && locStatus === 'denied' && (
                          <span style={{ marginLeft: 6, color: 'var(--muted)' }}>· no location</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Discipline filter — multi-select, deduped by label so
                  Gi / No-Gi / BJJ collapse to a single "Jiu-Jitsu" pill.
                  Empty selection = show all (no explicit "All" pill).
                  Smaller pill size so all disciplines fit on one line. */}
              {availableLabels.length > 1 && (
                <div>
                  <div style={SECTION_LABEL}>Discipline</div>
                  <div style={{ ...ROW, gap: 4 }}>
                    {availableLabels.map(({ label, rep }) => {
                      const c = DISCIPLINE_COLORS[rep];
                      const active = selectedLabels.has(label);
                      const compactPill: React.CSSProperties = {
                        ...PILL_BASE,
                        gap: 4,
                        padding: '3px 8px',
                        fontSize: 11,
                        ...(active ? {
                          background: c.marker,
                          border: `1.5px solid ${c.marker}`,
                          color: '#FFFFFF',
                        } : {}),
                      };
                      return (
                        <button key={label} onClick={() => toggleLabel(label)} style={compactPill}>
                          <span style={{
                            width: 7, height: 7, borderRadius: '50%',
                            background: c.marker, flexShrink: 0,
                            border: active ? '1px solid rgba(255,255,255,0.85)' : 'none',
                          }} />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Group */}
              <div>
                <div style={SECTION_LABEL}>Group</div>
                <div style={ROW}>
                  {([
                    ['none', 'None'],
                    ['city', 'City'],
                    ['country', 'Country'],
                  ] as [GroupMode, string][]).map(([mode, label]) => (
                    <button key={mode} onClick={() => setGroupMode(mode)}
                      style={groupMode === mode ? PILL_ACTIVE : PILL_BASE}>{label}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!session?.user ? (
            <div style={{
              background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 12,
              padding: 24, textAlign: 'center',
            }}>
              <p style={{ margin: '0 0 12px', fontSize: 14 }}>
                Sign in to save gyms and access them from any device.
              </p>
              <Button
                onClick={() => requireAuth(() => {})}
                variant="secondary"
                size="md"
                style={{ fontWeight: 700 }}
              >
                Sign in
              </Button>
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
                Tap the star on any gym card to save it here.
              </p>
            </div>
          ) : sorted && sorted.length === 0 ? (
            <div style={{
              background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
              padding: 24, textAlign: 'center',
            }}>
              <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>
                No favorites match these filters
              </p>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
                Try a different sort or clear the discipline filter.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {groups!.map(group => (
                <div key={group.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {group.label && (
                    <div style={{
                      fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                      color: 'var(--muted)', textTransform: 'uppercase',
                      marginTop: 4,
                    }}>{group.label} <span style={{ opacity: 0.6 }}>· {group.gyms.length}</span></div>
                  )}
                  {group.gyms.map(g => (
                    <GymCard
                      key={g.id}
                      gym={g}
                      isSelected={selectedId === g.id}
                      onClick={() => setSelectedId(prev => prev === g.id ? null : g.id)}
                      weeklyCheckins={checkinCounts[g.id] ?? 0}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
