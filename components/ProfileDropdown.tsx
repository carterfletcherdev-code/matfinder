'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { useFavorites } from './FavoritesProvider';
import { supabase } from '@/lib/supabase';
import { useOwnedGyms } from '@/lib/useOwnedGyms';
import { useIsAdmin } from '@/lib/useIsAdmin';

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
  mobile?: boolean;
  openFavoritesRequest?: number;
}

const TIER_LABELS = { free: 'Free', standard: 'Standard', pro: 'Pro' };
const TIER_COLORS = {
  free: 'rgba(245,241,232,0.45)',
  standard: '#7EC8A4',
  pro: '#C9A24A',
};

function SettingsToggle() {
  const [skip, setSkip] = useState<boolean>(() =>
    typeof window !== 'undefined' && !!localStorage.getItem('matfinder_skip_onboarding')
  );
  function toggle() {
    const next = !skip;
    if (next) localStorage.setItem('matfinder_skip_onboarding', '1');
    else localStorage.removeItem('matfinder_skip_onboarding');
    setSkip(next);
  }
  return (
    <div>
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
        fontFamily: "'JetBrains Mono', monospace",
        color: 'rgba(245,241,232,0.45)', textTransform: 'uppercase', marginBottom: 8,
      }}>Settings</div>
      <button onClick={toggle} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', padding: '8px 10px', borderRadius: 8,
        border: '1px solid rgba(245,241,232,0.15)',
        background: 'transparent', cursor: 'pointer',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--bone)', fontFamily: "'Inter Tight', sans-serif" }}>
          Show discipline picker on startup
        </span>
        <span style={{
          width: 36, height: 20, borderRadius: 10, flexShrink: 0,
          background: skip ? 'transparent' : 'var(--bone, #F5F1E8)',
          // ON: same lighter-brown outline used to separate buttons inside
          // the dropdown panel; OFF: bone outline so the empty toggle still reads.
          border: `1.5px solid ${skip ? 'var(--bone, #F5F1E8)' : 'rgba(245,241,232,0.15)'}`,
          position: 'relative', transition: 'background 0.2s, border-color 0.2s',
          boxSizing: 'border-box',
        }}>
          <span style={{
            position: 'absolute', top: 1.5, left: skip ? 1.5 : 17.5,
            width: 14, height: 14, borderRadius: '50%',
            background: skip ? 'rgba(245,241,232,0.45)' : 'var(--brown-700, #3E2E20)',
            transition: 'left 0.2s, background 0.2s',
          }} />
        </span>
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Pro: calendar subscription panel
// ──────────────────────────────────────────────────────────────────────
function CalendarSubscribe({ userId }: { userId: string }) {
  const url = typeof window === 'undefined'
    ? `/api/ics/${userId}/calendar.ics`
    : `${window.location.origin}/api/ics/${userId}/calendar.ics`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 'var(--radius-md)',
      border: '1.5px solid var(--bone)',
      background: 'var(--surface-base)',
    }}>
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
        fontFamily: "'JetBrains Mono', monospace",
        color: 'rgba(245,241,232,0.55)', textTransform: 'uppercase',
        marginBottom: 6,
      }}>Subscribe to calendar</div>
      <div style={{
        fontSize: 12, color: 'rgba(245,241,232,0.85)',
        fontFamily: "'Inter Tight', sans-serif", lineHeight: 1.5,
        marginBottom: 10,
      }}>
        Add every favorited gym&rsquo;s open mats to your calendar. Auto-refreshes
        when you favorite or unfavorite a gym.
      </div>
      <div style={{
        display: 'flex', gap: 6, alignItems: 'stretch',
        marginBottom: 8,
      }}>
        <input
          readOnly
          value={url}
          onClick={(e) => (e.target as HTMLInputElement).select()}
          style={{
            flex: 1, minWidth: 0,
            padding: '6px 8px',
            background: 'rgba(245,241,232,0.06)',
            border: '1.5px solid rgba(245,241,232,0.20)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--bone)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10, letterSpacing: '0.02em',
            outline: 'none',
          }}
        />
        <button
          onClick={copy}
          style={{
            padding: '6px 12px',
            background: 'transparent',
            border: '1.5px solid var(--bone)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--bone)',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
            fontFamily: "'Inter Tight', sans-serif",
            cursor: 'pointer', textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <div style={{
        fontSize: 10, color: 'rgba(245,241,232,0.55)',
        fontFamily: "'Inter Tight', sans-serif", lineHeight: 1.5,
      }}>
        Apple Calendar: File → New Calendar Subscription. Google Calendar:
        Settings → Add calendar → From URL.
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Locked Pro-only calendar teaser. Renders for any non-Pro tier
// (free + grandfathered standard).
// ──────────────────────────────────────────────────────────────────────
function CalendarSubscribeLocked() {
  return (
    <Link
      href="/account/upgrade"
      style={{
        display: 'block',
        padding: '12px 14px', borderRadius: 'var(--radius-md)',
        border: '1.5px solid rgba(245,241,232,0.20)',
        background: 'rgba(245,241,232,0.04)',
        textDecoration: 'none',
      }}
    >
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
        fontFamily: "'JetBrains Mono', monospace",
        color: 'rgba(245,241,232,0.55)', textTransform: 'uppercase',
        marginBottom: 6,
      }}>Subscribe to calendar · Pro</div>
      <div style={{
        fontSize: 12, color: 'rgba(245,241,232,0.85)',
        fontFamily: "'Inter Tight', sans-serif", lineHeight: 1.5,
      }}>
        Add every favorited gym&rsquo;s open mats to your calendar with one tap.
        Available on Pro — $59.99/yr (~$5/mo) or $6.99/mo.
      </div>
    </Link>
  );
}

export default function ProfileDropdown({ gymNameById, onGymClick, mobile, openFavoritesRequest }: ProfileDropdownProps) {
  const { user, tier, signOut, requireAuth, signInWithEmail, signInWithGoogle } = useAuth();
  const { favorites } = useFavorites();
  const ownedGymIds = useOwnedGyms();
  const ownerHref = ownedGymIds.length === 1
    ? `/owner/${ownedGymIds[0]}`
    : '/owner';
  const isAdmin = useIsAdmin();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'sessions' | 'favorites' | 'account'>('sessions');
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [loadingCheckins, setLoadingCheckins] = useState(false);
  // The currently-open full-screen session detail view (clicked from
  // the Sessions tab). Null = no detail view open.
  const [viewingSession, setViewingSession] = useState<CheckIn | null>(null);
  // Portal target — escapes any backdrop-filter / transform containing
  // block so the full-screen overlay reliably covers the viewport.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setPortalTarget(document.body); }, []);
  // Lock body scroll while the session detail is open.
  useEffect(() => {
    if (!viewingSession) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [viewingSession]);
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

  // Load check-ins when opening sessions tab.
  // Pro perk: Pro users see their entire training log; Free users see
  // only the last 30 days. The gate is enforced both here (no rows fetched
  // outside the window) and by the row-count limit (Free is capped at 50
  // most-recent entries even within the window for sanity).
  useEffect(() => {
    if (!open || tab !== 'sessions' || !user) return;
    setLoadingCheckins(true);
    let query = supabase
      .from('checkins')
      .select('id, gym_id, gym_name, session_name, note, checked_in_at')
      .eq('user_id', user.id)
      .order('checked_in_at', { ascending: false });
    if (tier !== 'pro') {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('checked_in_at', cutoff).limit(50);
    } else {
      query = query.limit(500); // generous Pro cap
    }
    query.then(({ data }) => {
      setCheckins((data as CheckIn[]) ?? []);
      setLoadingCheckins(false);
    });
  }, [open, tab, user, tier]);

  // Open to favorites tab when parent requests it. Only fire when the
  // counter actually INCREASES from the value we first saw on mount —
  // otherwise rotating the device (which remounts this component because
  // page.tsx renders different branches for portrait/landscape) would
  // re-open the dropdown using whatever counter value already existed.
  const initialOpenReqRef = useRef<number | undefined>(openFavoritesRequest);
  const lastSeenOpenReqRef = useRef<number | undefined>(openFavoritesRequest);
  useEffect(() => {
    if (openFavoritesRequest === undefined) return;
    if (openFavoritesRequest === lastSeenOpenReqRef.current) return;
    if (initialOpenReqRef.current !== undefined &&
        openFavoritesRequest <= initialOpenReqRef.current) {
      lastSeenOpenReqRef.current = openFavoritesRequest;
      return;
    }
    lastSeenOpenReqRef.current = openFavoritesRequest;
    // Always open the Favorites tab inside the dropdown — keeps the
    // user in their session so they can shuffle between Sessions /
    // Favorites / Account without bouncing back to the map. Same on
    // desktop, portrait, and landscape.
    if (!user) { requireAuth(() => { setTab('favorites'); setOpen(true); }); return; }
    setTab('favorites');
    setOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFavoritesRequest]);

  // Only treat an avatar URL as "uploaded by the user" when it points at
  // our own Supabase Storage `avatars` bucket. External provider avatars
  // (Google / GitHub OAuth) don't count — the rule across the app is:
  // silhouette by default, photo only when the user explicitly uploaded
  // one through the profile dropdown.
  const isUserUploadedAvatar = (url: string | null | undefined): url is string =>
    typeof url === 'string' && /\/storage\/v1\/object\/public\/avatars\//.test(url);

  const [avatarUrl, setAvatarUrlRaw] = useState<string | null>(() => {
    const url = (user?.user_metadata?.avatar_url as string | undefined) ?? null;
    return isUserUploadedAvatar(url) ? url : null;
  });
  // Helper that gates writes through the same rule (so direct uploads
  // bypass the filter — those URLs are always our bucket).
  const setAvatarUrl = (url: string | null) => setAvatarUrlRaw(url);

  // Re-sync the avatar from auth metadata whenever it changes. Without
  // this, switching orientations (which remounts ProfileDropdown) can
  // briefly drop a known-good avatar URL.
  useEffect(() => {
    const url = (user?.user_metadata?.avatar_url as string | undefined) ?? null;
    if (isUserUploadedAvatar(url) && url !== avatarUrl) {
      setAvatarUrlRaw(url);
    } else if (!isUserUploadedAvatar(url) && avatarUrl) {
      setAvatarUrlRaw(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.user_metadata?.avatar_url]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadAvatar(file: File) {
    if (!user) return;
    setUploading(true);
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${user.id}.${ext}`;
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = `${data.publicUrl}?t=${Date.now()}`;
      await supabase.auth.updateUser({ data: { avatar_url: url } });
      setAvatarUrl(url);
    }
    setUploading(false);
  }

  const avatarEl = (size: number) => avatarUrl ? (
    <img src={avatarUrl} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
  ) : (
    // Silhouette fallback (matches the trigger button) — used when no
    // photo is uploaded. Replaces the previous email-initial letter.
    <svg
      width={Math.round(size * 0.6)}
      height={Math.round(size * 0.6)}
      viewBox="0 0 24 24"
      fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4.4 3.58-8 8-8s8 3.6 8 8" />
    </svg>
  );

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
          width: 32, height: 32, borderRadius: '50%',
          // Bone outline + brown fill so the icon/avatar stands out
          // against the map. Open state flips to bone fill + brown icon.
          border: '1.5px solid var(--bone)',
          background: open ? 'var(--bone)' : 'var(--brown-700)',
          color: open ? 'var(--brown-700)' : 'var(--bone)',
          fontSize: 12, fontWeight: 700, fontFamily: "'Inter Tight', sans-serif",
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, padding: 0, overflow: 'hidden',
        }}
      >
        {user && avatarUrl ? (
          // Logged in WITH a photo → render the photo.
          avatarEl(mobile ? 24 : 22)
        ) : (
          // Logged out OR no photo → silhouette icon. Always visible
          // because the trigger has a solid brown fill behind it.
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4.4 3.58-8 8-8s8 3.6 8 8" />
          </svg>
        )}
      </button>

      {/* Tier badge — small bone-outlined dot in the bottom-right corner
          of the avatar trigger. Gold = Pro, mint = Standard, hidden for
          free. Status symbol that's visible at a glance and on every
          page (the trigger is anchored to the top nav). */}
      {user && tier !== 'free' && (
        <span
          aria-hidden
          title={`${TIER_LABELS[tier]} plan`}
          style={{
            position: 'absolute',
            right: -2, bottom: -2,
            width: 12, height: 12,
            borderRadius: '50%',
            background: TIER_COLORS[tier],
            border: '1.5px solid var(--bone)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Dropdown panel */}
      {open && user && (
        <div
          style={mobile ? {
            // Mobile: full-screen takeover — sessions / favorites / account
            // tabs all rendered inside this overlay. Covers map and nav.
            position: 'fixed', inset: 0, zIndex: 1600,
            overflowY: 'auto',
            background: 'rgba(30,20,14,1)',
            paddingTop: 'env(safe-area-inset-top, 0px)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          } : {
            // Desktop: anchored to the viewport, sitting just below the
            // secondary nav (top: 12 + ~40 height + 8 gap = 60). Right
            // offset of 104 leaves a 4px breathing room from the +/-
            // and Map tabs (which are at right:12, width:88, ending at
            // right:100). Width trimmed so the dropdown reads as a
            // peer column to the secondary nav above it.
            position: 'fixed', top: 60, right: 104, zIndex: 800,
            width: 280,
            maxHeight: 'calc(100dvh - 80px)',
            overflowY: 'auto',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(30,20,14,0.97)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(245,241,232,0.15)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
          }}
          className="no-scrollbar"
        >
          {/* Mobile close bar — Sign Out + Close, both bone-outlined,
              hugging the right edge so they sit together at the top. */}
          {mobile && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
              gap: 8, padding: '12px 16px 0',
            }}>
              <button
                onClick={() => { signOut(); setOpen(false); }}
                style={{
                  background: 'transparent',
                  border: '1.5px solid var(--bone)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--bone)',
                  fontFamily: "'Inter Tight', sans-serif",
                  fontSize: 13, fontWeight: 600,
                  padding: '6px 14px', cursor: 'pointer',
                }}
              >Sign Out</button>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{
                  background: 'transparent',
                  border: '1.5px solid var(--bone)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--bone)',
                  fontFamily: "'Inter Tight', sans-serif",
                  fontSize: 13, fontWeight: 600,
                  padding: '6px 14px', cursor: 'pointer',
                }}
              >Close</button>
            </div>
          )}

          {/* Desktop Sign Out — bone-outlined pill in the top-right
              corner of the dropdown panel, separate from the header. */}
          {!mobile && (
            <button
              onClick={() => { signOut(); setOpen(false); }}
              style={{
                position: 'absolute', top: 12, right: 12, zIndex: 1,
                background: 'transparent',
                border: '1.5px solid var(--bone)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--bone)',
                fontFamily: "'Inter Tight', sans-serif",
                fontSize: 11, fontWeight: 700,
                padding: '4px 10px', cursor: 'pointer',
              }}
            >Sign Out</button>
          )}

          {/* Header */}
          <div style={{
            // Extra right padding on desktop so the absolutely-positioned
            // Sign Out pill in the top-right doesn't overlap the email.
            padding: mobile ? '14px 16px 10px' : '14px 88px 10px 16px',
            borderBottom: '1px solid rgba(245,241,232,0.12)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Change profile photo"
              style={{
                width: 36, height: 36, borderRadius: '50%',
                background: avatarUrl ? 'var(--brown-700)' : 'var(--brown-700)',
                color: 'var(--bone)',
                border: '1.5px solid var(--bone)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, cursor: 'pointer', padding: 0, overflow: 'hidden',
                position: 'relative',
              }}
            >
              {avatarEl(36)}
              {/* Edit hint — desktop hover only. Hidden on mobile so a
                  tap doesn't leave the overlay stuck at opacity 1 after
                  the file picker is dismissed. The `(hover: hover)`
                  media query keeps it off touch-only devices. */}
              {!mobile && (
                <span
                  className="avatar-edit-hover"
                  style={{
                    position: 'absolute', inset: 0, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.45)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    opacity: 0, transition: 'opacity 0.15s',
                    pointerEvents: 'none',
                  }}
                >
                  <span style={{ fontSize: 9, color: '#fff', fontWeight: 700, fontFamily: "'Inter Tight', sans-serif" }}>
                    {uploading ? '…' : 'Edit'}
                  </span>
                </span>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12, fontWeight: 700, fontFamily: "'Inter Tight', sans-serif",
                color: 'var(--bone)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{user.email}</div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap',
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: TIER_COLORS[tier],
                  fontFamily: "'JetBrains Mono', monospace",
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>{TIER_LABELS[tier]}</span>
                {tier !== 'pro' && (
                  <Link
                    href="/account/upgrade"
                    onClick={() => setOpen(false)}
                    style={{
                      fontSize: 10, fontWeight: 700,
                      fontFamily: "'Inter Tight', sans-serif",
                      color: '#FFD23F', textDecoration: 'none',
                      border: '1.5px solid #FFD23F',
                      borderRadius: 'var(--radius-md)',
                      padding: '2px 8px',
                      letterSpacing: '0.04em',
                      whiteSpace: 'nowrap',
                    }}
                  >Upgrade <span style={{ fontSize: 11, lineHeight: 1, marginLeft: 2 }}>👑</span></Link>
                )}
              </div>
            </div>
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
                  borderBottom: `2px solid ${tab === t ? 'var(--bone)' : 'transparent'}`,
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
                <>
                {/* Pro upgrade nudge — shown only to non-Pro users when
                    they have at least one logged session. Sets the
                    expectation that older sessions exist server-side and
                    upgrading reveals the full archive. */}
                {tier !== 'pro' && (
                  <Link
                    href="/account/upgrade"
                    onClick={() => setOpen(false)}
                    style={{
                      display: 'block',
                      margin: '4px 12px 8px',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1.5px solid #C9A24A',
                      background: 'rgba(201,162,74,0.08)',
                      textDecoration: 'none',
                    }}
                  >
                    <div style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                      fontFamily: "'JetBrains Mono', monospace",
                      color: '#C9A24A', textTransform: 'uppercase',
                      marginBottom: 4,
                    }}>Last 30 days</div>
                    <div style={{
                      fontSize: 11, color: 'rgba(245,241,232,0.85)',
                      fontFamily: "'Inter Tight', sans-serif", lineHeight: 1.45,
                    }}>
                      Upgrade to Pro to see your full training log — every session, forever.
                    </div>
                  </Link>
                )}
                {checkins.map(ci => {
                  const gymName = ci.gym_name ?? gymNameById?.[ci.gym_id] ?? ci.gym_id;
                  const date = new Date(ci.checked_in_at);
                  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  return (
                    <div
                      key={ci.id}
                      style={{
                        padding: '9px 16px',
                        borderBottom: '1px solid rgba(245,241,232,0.07)',
                        cursor: 'pointer',
                      }}
                      onClick={() => setViewingSession(ci)}
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
                })}
                </>
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
                    Tap the star on any gym card to save it here.
                  </div>
                </div>
              ) : (
                <>
                  {[...favorites].map(gymId => {
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
                        <span style={{
                          fontSize: 12, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
                          color: 'var(--bone)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{name}</span>
                      </button>
                    );
                  })}
                  {tier === 'free' && (
                    <div style={{
                      margin: '8px 12px',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1.5px solid #C9A24A',
                      background: 'rgba(201,162,74,0.08)',
                    }}>
                      <div style={{
                        fontSize: 11, fontWeight: 700, color: '#C9A24A',
                        fontFamily: "'Inter Tight', sans-serif", marginBottom: 4,
                      }}>
                        Free tier: {favorites.size}/5 favorites
                      </div>
                      <div style={{
                        fontSize: 11, color: 'rgba(245,241,232,0.55)',
                        fontFamily: "'Inter Tight', sans-serif", marginBottom: 8, lineHeight: 1.4,
                      }}>
                        Upgrade to Pro for unlimited favorites and a live
                        calendar subscription you can sync to Apple, Google, or Outlook.
                      </div>
                      <Link
                        href="/account/upgrade"
                        onClick={() => setOpen(false)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          fontSize: 11, fontWeight: 700, color: '#C9A24A',
                          fontFamily: "'Inter Tight', sans-serif",
                          textDecoration: 'none',
                          border: '1px solid #C9A24A',
                          borderRadius: 6, padding: '4px 10px',
                        }}
                      >
                        Upgrade to Pro
                      </Link>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Account tab */}
          {tab === 'account' && (
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Admin · Developer console — only shown to users in the
                  public.admins table. Bone-outlined so it doesn't fight
                  with the gold "Manage Your Gym" card below. */}
              {isAdmin && (
                <Link
                  href="/admin/corrections"
                  onClick={() => setOpen(false)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    border: '1.5px solid var(--bone)',
                    background: 'rgba(245,241,232,0.04)',
                    textDecoration: 'none',
                  }}
                >
                  <div>
                    <div style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                      fontFamily: "'JetBrains Mono', monospace",
                      color: 'rgba(245,241,232,0.55)', textTransform: 'uppercase',
                      marginBottom: 4,
                    }}>Admin</div>
                    <div style={{
                      fontSize: 13, fontWeight: 700, color: 'var(--bone)',
                      fontFamily: "'Inter Tight', sans-serif",
                    }}>Developer console</div>
                    <div style={{
                      fontSize: 11, fontWeight: 500,
                      color: 'rgba(245,241,232,0.55)',
                      fontFamily: "'Inter Tight', sans-serif",
                      marginTop: 2,
                    }}>
                      Review and approve Help Confirm corrections
                    </div>
                  </div>
                </Link>
              )}

              {/* Manage Your Gym — top of the Account tab for verified
                  gym owners. Gold-outlined to match the Featured tier
                  color and stand out from the rest of the rows. */}
              {ownedGymIds.length > 0 && (
                <Link
                  href={ownerHref}
                  onClick={() => setOpen(false)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    border: '1.5px solid #C9A24A',
                    background: 'rgba(201,162,74,0.08)',
                    textDecoration: 'none',
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
                      fontSize: 13, fontWeight: 700, color: 'var(--bone)',
                      fontFamily: "'Inter Tight', sans-serif",
                    }}>Manage Your Gym</div>
                    <div style={{
                      fontSize: 11, fontWeight: 500,
                      color: 'rgba(245,241,232,0.55)',
                      fontFamily: "'Inter Tight', sans-serif",
                      marginTop: 2,
                    }}>
                      Edit schedule, listing details, and view analytics
                    </div>
                  </div>
                </Link>
              )}

              {/* Upgrade section — first so it's the most prominent CTA */}
              {tier === 'free' && (
                <div>
                  <div style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                    fontFamily: "'JetBrains Mono', monospace",
                    color: 'rgba(245,241,232,0.45)', textTransform: 'uppercase',
                    marginBottom: 8,
                  }}>Upgrade your plan</div>
                  {/* Pro — single tier. Annual is the recommended billing
                      cadence (28% cheaper than monthly), so the copy
                      leads with annual savings. */}
                  <Link
                    href="/account/upgrade"
                    onClick={() => setOpen(false)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 12px', borderRadius: 8,
                      border: '1.5px solid #C9A24A',
                      background: 'rgba(201,162,74,0.08)',
                      textDecoration: 'none',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#C9A24A', fontFamily: "'Inter Tight', sans-serif" }}>
                        Pro <span style={{ fontSize: 9, fontWeight: 800, background: '#C9A24A', color: '#1A1310', borderRadius: 3, padding: '1px 5px', marginLeft: 4 }}>BEST VALUE</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(245,241,232,0.55)', fontFamily: "'Inter Tight', sans-serif", marginTop: 2 }}>
                        $59.99/yr · works out to $5/mo · save 28%
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(245,241,232,0.45)', fontFamily: "'Inter Tight', sans-serif", marginTop: 1 }}>
                        Or $6.99/mo · cancel anytime
                      </div>
                    </div>
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

              {/* Pro: calendar subscription URL. Pasting this into Apple
                  / Google / Outlook Calendar adds every favorited gym's
                  open-mat schedule as a live, auto-refreshing feed. */}
              {tier === 'pro' && user?.id && (
                <CalendarSubscribe userId={user.id} />
              )}

              {/* Free / Standard: locked teaser nudging toward Pro. */}
              {tier !== 'pro' && (
                <CalendarSubscribeLocked />
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
                    href="/add-gym"
                    onClick={() => setOpen(false)}
                    style={{
                      display: 'inline-block',
                      padding: '5px 12px', borderRadius: 6,
                      border: '1.5px solid var(--bone)',
                      background: 'transparent', color: 'var(--bone)',
                      fontSize: 11, fontWeight: 700, fontFamily: "'Inter Tight', sans-serif",
                      textDecoration: 'none',
                    }}
                  >Search your gym</Link>
                </div>
              </div>

              {/* Settings toggle — moved to the bottom so it doesn't
                  compete with the upgrade / check-in / claim CTAs. */}
              <SettingsToggle />

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

      {/* Full-screen session detail — portalled to body so it always
          covers the viewport regardless of where the dropdown sits in
          the DOM (or whether the dropdown is closed). Opens when a
          session card in the Sessions tab is clicked. */}
      {portalTarget && viewingSession && createPortal(
        <SessionDetail
          session={viewingSession}
          gymName={
            viewingSession.gym_name ??
            gymNameById?.[viewingSession.gym_id] ??
            viewingSession.gym_id
          }
          onClose={() => setViewingSession(null)}
          onViewGym={() => {
            const id = viewingSession.gym_id;
            setViewingSession(null);
            setOpen(false);
            if (onGymClick) onGymClick(id);
          }}
        />,
        portalTarget,
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Session detail — full-screen takeover with the same visual language
// as the Full Schedule and Check-in modals (dark brown backdrop, bone
// outline, sticky header with Back pill on the right). Opened from the
// Sessions tab in the profile dropdown.
// ──────────────────────────────────────────────────────────────────────
function SessionDetail({
  session, gymName, onClose, onViewGym,
}: {
  session: CheckIn;
  gymName: string;
  onClose: () => void;
  onViewGym: () => void;
}) {
  const date = new Date(session.checked_in_at);
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(26,19,16,0.88)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000,
        padding: '5vh 5vw',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '90vw', height: '90vh', maxWidth: 1200,
          background: 'var(--bg)', color: 'var(--fg)',
          border: '1.5px solid var(--bone)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-md)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Sticky header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16,
          padding: '20px 28px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg)',
          flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
              color: 'var(--muted)', textTransform: 'uppercase',
              fontFamily: "'JetBrains Mono', monospace",
              marginBottom: 4,
            }}>Session</div>
            <h2 style={{
              margin: 0, fontSize: 22, fontWeight: 800,
              fontFamily: "'Inter Tight', sans-serif",
              color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{session.session_name || gymName}</h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1.5px solid var(--bone)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontSize: 13, color: 'var(--text-primary)', fontWeight: 700,
              fontFamily: "'Inter Tight', sans-serif",
              padding: '6px 14px',
              flexShrink: 0,
            }}
          >Back</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px' }}>
          <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Gym block */}
            <div>
              <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                color: 'var(--muted)', textTransform: 'uppercase',
                fontFamily: "'JetBrains Mono', monospace",
                marginBottom: 6,
              }}>Gym</div>
              <div style={{
                fontSize: 16, fontWeight: 700,
                fontFamily: "'Inter Tight', sans-serif",
                color: 'var(--text-primary)',
              }}>{gymName}</div>
            </div>

            {/* When */}
            <div>
              <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                color: 'var(--muted)', textTransform: 'uppercase',
                fontFamily: "'JetBrains Mono', monospace",
                marginBottom: 6,
              }}>When</div>
              <div style={{
                fontSize: 14, fontWeight: 600,
                fontFamily: "'Inter Tight', sans-serif",
                color: 'var(--text-primary)',
              }}>
                {dateStr}
                <span style={{ opacity: 0.55, marginLeft: 6 }}>· {timeStr}</span>
              </div>
            </div>

            {/* Notes — full text, no truncation */}
            {session.note && (
              <div>
                <div style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                  color: 'var(--muted)', textTransform: 'uppercase',
                  fontFamily: "'JetBrains Mono', monospace",
                  marginBottom: 6,
                }}>Notes</div>
                <div style={{
                  fontSize: 14, lineHeight: 1.55,
                  fontFamily: "'Inter Tight', sans-serif",
                  color: 'var(--text-primary)',
                  background: 'var(--surface-base)',
                  border: '1.5px solid var(--bone)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 16px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>{session.note}</div>
              </div>
            )}

            {/* CTA — view the gym on the map */}
            <button
              onClick={onViewGym}
              style={{
                marginTop: 8,
                padding: '12px 18px',
                fontSize: 14, fontWeight: 700, letterSpacing: '0.02em',
                fontFamily: "'Inter Tight', sans-serif",
                background: 'transparent',
                color: 'var(--text-primary)',
                border: '1.5px solid var(--bone)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                alignSelf: 'flex-start',
              }}
            >View gym on map</button>
          </div>
        </div>
      </div>
    </div>
  );
}
