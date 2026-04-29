'use client';

// /gym/[gymId] — full gym detail page.
//
// Layout matches the locked design from public/gym-page-final.html:
//   - Featured banner (when paid tier)
//   - Sticky topbar with "Back to map"
//   - Hero photo strip (or monogram fallback) with "Browse photos" CTA
//   - Header: name as website link, Save + Check in actions
//   - Two-column body:
//       Left: open-mat hero panel · weekly schedule (day strip +
//             grouped class list with open mats up top) · about
//       Right: contact · at-a-glance · trained here · wrong info
//
// Design system: uses existing tokens, Button/Pill/StatusBadge primitives,
// stroke SVG icons (no emojis). Sentence case throughout.
//
// Data: fetches /api/gyms (cached 30s edge + SWR), finds the gym by id.
// Photos and ratings come from gym_overrides via the route's merge.

import { useEffect, useState, useMemo, use } from 'react';
import Link from 'next/link';
import {
  Gym,
  Discipline,
  BJJ_DISCIPLINES,
  DISCIPLINE_LABELS,
  DISCIPLINE_COLORS,
  DAY_LABELS,
  DayOfWeek,
  ScheduleEntry,
  OpenMat,
} from '@/lib/types';
import { computeGymStatus } from '@/lib/gymStatus';
import { Button, Pill, StatusBadge } from '@/components/ui';
import HeartButton from '@/components/HeartButton';
import CheckInButton from '@/components/CheckInButton';
import PhotoLightbox from '@/components/PhotoLightbox';
import CorrectionForm from '@/components/CorrectionForm';
import { titleCase, formatTime } from '@/lib/utils';
import { PhotoSize } from '@/lib/photoUrl';
import { trackEvent } from '@/lib/track';

// ───────────────────────────────────────────────────────────────────
// Helpers (mirrored from GymCard.tsx)
// ───────────────────────────────────────────────────────────────────

function gymMonogram(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const numMatch = trimmed.match(/^(\d+)/);
  if (numMatch) {
    const rest = trimmed.slice(numMatch[1]!.length).trim();
    const restWords = rest.split(/\s+/).filter(Boolean);
    return (numMatch[1]! + (restWords[0]?.[0] ?? '')).toUpperCase().slice(0, 4);
  }
  const words = trimmed.split(/\s+/).filter(w => !/^(the|a|an|of|and|&)$/i.test(w));
  return words.slice(0, 3).map(w => w[0]).join('').toUpperCase().slice(0, 3) || trimmed.slice(0, 3).toUpperCase();
}

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace('#', '').match(/^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return `rgba(245,241,232,${alpha})`;
  return `rgba(${parseInt(m[1]!, 16)}, ${parseInt(m[2]!, 16)}, ${parseInt(m[3]!, 16)}, ${alpha})`;
}

const ALL_DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const FULL_DAY: Record<DayOfWeek, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
};
const DAY_INDEX: Record<DayOfWeek, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

function todayKey(): DayOfWeek {
  return ALL_DAYS[(new Date().getDay() + 6) % 7]!; // shift so monday=0…sunday=6
}

function findNextOpenMat(gym: Gym, now: Date = new Date()): OpenMat | null {
  const verified = gym.open_mats.filter(o => o.verified);
  const pool = verified.length > 0 ? verified : gym.open_mats;
  if (pool.length === 0) return null;
  const todayIdx = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let best: { mat: OpenMat; score: number } | null = null;
  for (const mat of pool) {
    const matIdx = DAY_INDEX[mat.day];
    const [h, m] = mat.start_time.split(':').map(Number);
    const matMin = (h ?? 0) * 60 + (m ?? 0);
    let daysAway = matIdx - todayIdx;
    if (daysAway < 0) daysAway += 7;
    if (daysAway === 0 && matMin < nowMin) daysAway = 7;
    const score = daysAway * 24 * 60 + matMin;
    if (!best || score < best.score) best = { mat, score };
  }
  return best?.mat ?? null;
}

// ───────────────────────────────────────────────────────────────────
// SVG icon helpers (same set used in GymCard)
// ───────────────────────────────────────────────────────────────────
const stroke = {
  fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  'aria-hidden': true,
} as const;

const IconBack = () => <svg {...stroke} width={14} height={14} viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>;
const IconHeart = () => <svg {...stroke} width={14} height={14} viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>;
const IconCheck = () => <svg {...stroke} width={14} height={14} viewBox="0 0 24 24" strokeWidth={3}><polyline points="20 6 9 17 4 12"/></svg>;
const IconExt = () => <svg {...stroke} width={15} height={15} viewBox="0 0 24 24" style={{ opacity: 0.5, transition: 'opacity 150ms' }}><path d="M7 17L17 7"/><polyline points="7 7 17 7 17 17"/></svg>;
const IconPin = () => <svg {...stroke} width={16} height={16} viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;
const IconPhone = () => <svg {...stroke} width={16} height={16} viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
const IconGlobe = () => <svg {...stroke} width={16} height={16} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>;
const IconIg = () => <svg {...stroke} width={16} height={16} viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37a4 4 0 1 1-7.92 1.18A4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>;
const IconFlag = () => <svg {...stroke} width={12} height={12} viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>;
const IconShield = () => <svg {...stroke} width={13} height={13} viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
const IconPhoto = () => <svg {...stroke} width={13} height={13} viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
const IconCalendar = () => <svg {...stroke} width={14} height={14} viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const IconDollar = () => <svg {...stroke} width={14} height={14} viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
const IconPeople = () => <svg {...stroke} width={14} height={14} viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const IconZap = () => <svg {...stroke} width={14} height={14} viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;

// ───────────────────────────────────────────────────────────────────
// Component
// ───────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ gymId: string }>;
}

export default function GymPage({ params }: PageProps) {
  // Next 15: params is a Promise. Use the React `use` hook to unwrap.
  const { gymId } = use(params);

  const [gym, setGym] = useState<Gym | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'notfound' | 'error'>('loading');
  const [activeDay, setActiveDay] = useState<DayOfWeek>(todayKey());
  const [showLightbox, setShowLightbox] = useState(false);
  const [showCorrectionForm, setShowCorrectionForm] = useState(false);

  // Fetch the gym list and find ours. Cached 30s edge so this is fast.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/gyms')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((all: Gym[]) => {
        if (cancelled) return;
        const decoded = decodeURIComponent(gymId);
        const found = all.find(g => g.id === gymId || g.id === decoded);
        if (found) {
          setGym(found);
          setLoadState('ok');
        } else {
          setLoadState('notfound');
        }
      })
      .catch(() => { if (!cancelled) setLoadState('error'); });
    return () => { cancelled = true; };
  }, [gymId]);

  // Derived data
  const status = useMemo(() => gym ? computeGymStatus(gym.schedule) : 'unknown', [gym]);
  const next = useMemo(() => gym ? findNextOpenMat(gym) : null, [gym]);

  const disciplines = useMemo<Discipline[]>(() => {
    if (!gym) return [];
    const raw = [...new Set(gym.open_mats.map(o => o.discipline))];
    return raw.reduce<Discipline[]>((acc, d) => {
      const k = BJJ_DISCIPLINES.has(d) ? 'bjj' : d;
      if (!acc.includes(k)) acc.push(k);
      return acc;
    }, []);
  }, [gym]);

  // Schedule grouped by day, then by open-mat-vs-class
  const dayGroups = useMemo(() => {
    if (!gym?.schedule) return {} as Record<DayOfWeek, { openMats: ScheduleEntry[]; classes: ScheduleEntry[] }>;
    const out = {} as Record<DayOfWeek, { openMats: ScheduleEntry[]; classes: ScheduleEntry[] }>;
    for (const day of ALL_DAYS) out[day] = { openMats: [], classes: [] };
    for (const entry of gym.schedule) {
      const bucket = entry.is_open_mat ? 'openMats' : 'classes';
      out[entry.day]![bucket].push(entry);
    }
    // Sort by start_time within each bucket
    for (const day of ALL_DAYS) {
      out[day]!.openMats.sort((a, b) => a.start_time.localeCompare(b.start_time));
      out[day]!.classes.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return out;
  }, [gym]);

  // Class counts per day for the strip labels
  const dayCounts = useMemo(() => {
    const out: Record<DayOfWeek, { open: number; classes: number }> = {} as never;
    for (const day of ALL_DAYS) {
      out[day] = {
        open: dayGroups[day]?.openMats.length ?? 0,
        classes: dayGroups[day]?.classes.length ?? 0,
      };
    }
    return out;
  }, [dayGroups]);

  if (loadState === 'loading') {
    return (
      <div style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--surface-base)',
        color: 'var(--text-muted)',
        fontFamily: "'Inter Tight', sans-serif",
      }}>
        Loading…
      </div>
    );
  }

  if (loadState !== 'ok' || !gym) {
    return (
      <div style={{
        minHeight: '100dvh',
        display: 'grid', placeItems: 'center',
        background: 'var(--surface-base)',
        color: 'var(--text-primary)',
        fontFamily: "'Inter Tight', sans-serif",
        textAlign: 'center', padding: 24,
      }}>
        <div>
          <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
            {loadState === 'notfound' ? 'Gym not found' : 'Could not load this gym'}
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
            {loadState === 'notfound' ? 'The link may be outdated.' : 'Try again in a moment.'}
          </p>
          <Link href="/" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
            Back to the map →
          </Link>
        </div>
      </div>
    );
  }

  // ── Display data ──────────────────────────────────────────────
  const websiteHref = gym.website
    ? (gym.website.startsWith('http') ? gym.website : `https://${gym.website}`)
    : null;
  const igHref = gym.instagram
    ? (gym.instagram.startsWith('http') ? gym.instagram : `https://instagram.com/${gym.instagram.replace(/^@/, '')}`)
    : null;
  const ratingValue = typeof gym.rating === 'number' ? gym.rating : null;
  const ratingCount = typeof gym.review_count === 'number' ? gym.review_count : null;
  const isFeatured = !!gym.featured;
  const hasVerifiedMats = gym.open_mats.some(o => o.verified);

  const onWrongInfoClick = () => {
    setShowCorrectionForm(true);
  };

  const onRsvpClick = () => {
    alert('RSVP coming soon — open mats will let you confirm and see who else is going.');
  };

  return (
    <div
      style={{
        // Root <html> is locked at height 100dvh + overflow hidden by
        // layout.tsx (the map page needs that). For this scrollable
        // detail page, the gym page itself becomes the scroll container.
        height: '100dvh',
        overflowY: 'auto',
        background: 'var(--surface-base)',
        color: 'var(--text-primary)',
        fontFamily: "'Inter Tight', sans-serif",
      }}
    >

      {/* ── Featured banner (only on paid tier) ── */}
      {isFeatured && (
        <div
          style={{
            background: 'linear-gradient(90deg, var(--warning) 0%, #E8B85F 50%, var(--warning) 100%)',
            color: '#1A1310',
            padding: '8px 24px',
            textAlign: 'center',
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <IconShield />
          Featured
        </div>
      )}

      {/* ── Top bar ── */}
      <div
        style={{
          position: 'sticky', top: 0, zIndex: 100,
          background: 'rgba(26,19,16,0.90)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderBottom: '1px solid var(--border)',
          padding: '12px 24px',
        }}
      >
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <Link
            href="/"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              color: 'var(--text-secondary)',
              fontSize: 13, fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            <IconBack /> Back to map
          </Link>
          <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--bone)' }}>matfinder</div>
          <div style={{ width: 100 }} aria-hidden /> {/* spacer to balance the flex */}
        </div>
      </div>

      {/* ── Page body ── */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px 80px' }}>

        {/* HERO PHOTO STRIP */}
        <section
          style={{
            margin: '28px 0 32px',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            aspectRatio: '21 / 9',
            position: 'relative',
            background: gym.photo_url
              ? 'var(--brown-700)'
              : 'linear-gradient(135deg, var(--brown-800), var(--brown-700))',
            border: '1px solid var(--border)',
          }}
        >
          {gym.photo_url ? (
            /* Hi-res hero — 1920px from Google Places so it stays crisp
               at full desktop width and on retina screens. The card and
               popover keep the default 800px. */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={PhotoSize.hero(gym.photo_url)}
              alt={gym.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <>
              {/* Rich placeholder — gym name in serif italic over the
                  diagonal-line pattern. Far better than an abbreviated
                  monogram once the screen is this big. */}
              <div className="gym-placeholder">
                <div className="gym-placeholder-name" style={{ fontSize: 44, maxWidth: 720 }}>
                  {gym.name}
                </div>
                <div className="gym-placeholder-tag">No photo on file</div>
              </div>

              {/* Add-a-photo CTA. Routes to the claim flow where gym
                  owners can upload their own photos. Bottom-right so
                  it doesn't compete with the gym name. */}
              <Link
                href={`/claim/${encodeURIComponent(gym.id)}`}
                style={{
                  position: 'absolute', bottom: 16, right: 16, zIndex: 2,
                  background: 'rgba(0,0,0,0.65)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  color: 'var(--bone)',
                  fontSize: 12, fontWeight: 700,
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid rgba(245,241,232,0.25)',
                  textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  transition: 'background 150ms',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.85)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.65)'; }}
              >
                <svg
                  width="13" height="13" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" aria-hidden
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Are you the gym? Claim it free
              </Link>
            </>
          )}

          {/* Browse photos — opens the lightbox modal. We currently only
              have one Google Places photo per gym; the lightbox is built
              to gracefully handle multi-photo when gym uploads land. */}
          {gym.photo_url && (
            <button
              type="button"
              onClick={() => setShowLightbox(true)}
              style={{
                position: 'absolute', bottom: 16, right: 16,
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(8px)',
                color: 'var(--bone)',
                fontSize: 12, fontWeight: 600,
                padding: '8px 14px',
                borderRadius: 'var(--radius-full)',
                border: '1px solid rgba(245,241,232,0.2)',
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontFamily: 'inherit',
                transition: 'background 150ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.78)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.6)'; }}
            >
              <IconPhoto />
              Browse photos
            </button>
          )}
        </section>

        {/* HEADER */}
        <section style={{ marginBottom: 36 }}>
          <div
            style={{
              display: 'flex', alignItems: 'flex-start',
              justifyContent: 'space-between', gap: 24,
              marginBottom: 12, flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              {websiteHref ? (
                <a
                  href={websiteHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 32, fontWeight: 800,
                    color: 'var(--bone)',
                    margin: '0 0 8px',
                    lineHeight: 1.15,
                    letterSpacing: '-0.01em',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = 'var(--accent)';
                    const ext = e.currentTarget.querySelector('svg');
                    if (ext) (ext as SVGElement).style.opacity = '1';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color = 'var(--bone)';
                    const ext = e.currentTarget.querySelector('svg');
                    if (ext) (ext as SVGElement).style.opacity = '0.5';
                  }}
                >
                  {gym.name}
                  <IconExt />
                </a>
              ) : (
                <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--bone)', margin: '0 0 8px', lineHeight: 1.15, letterSpacing: '-0.01em' }}>
                  {gym.name}
                </h1>
              )}

              {/* Meta row */}
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 13, color: 'var(--text-muted)',
                  flexWrap: 'wrap', marginBottom: 14,
                }}
              >
                {ratingValue != null && (
                  <span style={{ color: 'var(--bone)', fontWeight: 700, display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ color: 'var(--warning)' }}>★</span>
                    {ratingValue.toFixed(1)}
                    {ratingCount != null && (
                      <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: 12 }}>
                        ({ratingCount} reviews)
                      </span>
                    )}
                  </span>
                )}
                {ratingValue != null && status !== 'unknown' && <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'currentColor', opacity: 0.5 }} />}
                <StatusBadge status={status} size="md" />
                <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'currentColor', opacity: 0.5 }} />
                <span>
                  {titleCase(gym.city || '')}{gym.state ? `, ${gym.state}` : ''}
                </span>
              </div>

              {/* Discipline pills */}
              {disciplines.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {disciplines.map(d => {
                    const c = DISCIPLINE_COLORS[d];
                    return (
                      <Pill
                        key={d}
                        size="md"
                        style={{
                          background: hexToRgba(c.marker, 0.16),
                          color: c.marker,
                          borderColor: hexToRgba(c.marker, 0.45),
                        }}
                      >
                        {DISCIPLINE_LABELS[d]}
                      </Pill>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right-side actions: Save + Check in */}
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <Button
                variant="secondary"
                size="lg"
              >
                <IconHeart />
                Save
              </Button>
              <CheckInButton gymId={gym.id} gymName={gym.name} />
            </div>
          </div>
        </section>

        {/* ── 2-column body ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
            gap: 32,
          }}
          className="gym-page-grid"
        >

          {/* ── LEFT MAIN COLUMN ── */}
          <main>

            {/* NEXT OPEN MAT hero panel */}
            {next && (
              <div
                style={{
                  border: '1px solid var(--success)',
                  background: 'linear-gradient(135deg, rgba(94,139,94,0.18), rgba(94,139,94,0.04))',
                  borderRadius: 'var(--radius-lg)',
                  padding: 22,
                  marginBottom: 32,
                }}
              >
                <div
                  style={{
                    color: 'var(--success)',
                    fontSize: 11, fontWeight: 800,
                    letterSpacing: '0.08em',
                    marginBottom: 8,
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    textTransform: 'uppercase',
                  }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: 'var(--success)',
                    boxShadow: '0 0 0 0 var(--success)',
                    animation: 'pulse-ring 1.6s ease-out infinite',
                  }} />
                  Next open mat · {FULL_DAY[next.day]} · {formatTime(next.start_time)}
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px', color: 'var(--bone)' }}>
                  Open mat
                </h2>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 18px' }}>
                  {DISCIPLINE_LABELS[next.discipline]}
                  {next.is_free ? ' · Free for visitors' : ''}
                  {next.cost && next.cost > 0 ? ` · $${next.cost} drop-in` : ''}
                </p>
                <div
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 16, flexWrap: 'wrap',
                    paddingTop: 18,
                    borderTop: '1px solid rgba(94,139,94,0.25)',
                  }}
                >
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    Be the first to RSVP
                  </span>
                  <Button
                    onClick={onRsvpClick}
                    size="lg"
                    variant="primary"
                    style={{
                      background: 'var(--success)',
                      borderColor: 'var(--success)',
                      color: 'var(--bone)',
                      fontWeight: 700,
                    }}
                  >
                    RSVP — count me in
                  </Button>
                </div>
              </div>
            )}

            {/* WEEKLY SCHEDULE */}
            {gym.schedule && gym.schedule.length > 0 && (
              <section style={{ marginBottom: 36 }}>
                <h2 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 12px' }}>
                  Weekly schedule
                </h2>

                {/* Day strip */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 16 }}>
                  {ALL_DAYS.map(day => {
                    const dc = dayCounts[day];
                    const total = dc.open + dc.classes;
                    const isActive = day === activeDay;
                    const hasClass = total > 0;
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setActiveDay(day)}
                        style={{
                          textAlign: 'center',
                          padding: '14px 0 10px',
                          borderRadius: 'var(--radius-md)',
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 11, fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'background 150ms, border-color 150ms, color 150ms, transform 100ms',
                          border: '1px solid var(--border)',
                          background: isActive
                            ? 'var(--success)'
                            : hasClass ? 'rgba(94,139,94,0.10)' : 'rgba(245,241,232,0.03)',
                          borderColor: isActive
                            ? 'var(--success)'
                            : hasClass ? 'rgba(94,139,94,0.30)' : 'var(--border)',
                          color: isActive ? 'var(--bone)' : (hasClass ? 'var(--bone)' : 'var(--text-muted)'),
                          transform: isActive ? 'translateY(-1px)' : '',
                          boxShadow: isActive ? 'var(--shadow-md)' : 'none',
                        }}
                      >
                        <span style={{ display: 'block', fontSize: 13, color: isActive ? 'var(--bone)' : (hasClass ? 'var(--bone)' : 'var(--text-muted)'), fontWeight: 700, marginBottom: 4 }}>
                          {DAY_LABELS[day]}
                        </span>
                        <span style={{ display: 'block', fontSize: 9, fontWeight: 600, letterSpacing: '0.04em', color: isActive ? 'rgba(245,241,232,0.85)' : (hasClass ? 'var(--success)' : 'var(--text-muted)') }}>
                          {dc.open > 0 && dc.classes > 0
                            ? `${dc.classes} · ${dc.open} open`
                            : dc.open > 0
                              ? `${dc.open} open mat${dc.open > 1 ? 's' : ''}`
                              : dc.classes > 0
                                ? `${dc.classes} class${dc.classes > 1 ? 'es' : ''}`
                                : 'closed'}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Schedule list for active day — open mats up top */}
                <div
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                  }}
                >
                  {dayGroups[activeDay] && (dayGroups[activeDay]!.openMats.length + dayGroups[activeDay]!.classes.length) > 0 ? (
                    <>
                      {/* OPEN MATS group */}
                      {dayGroups[activeDay]!.openMats.length > 0 && (
                        <>
                          <div
                            style={{
                              padding: '10px 18px',
                              background: 'rgba(94,139,94,0.10)',
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: 11, fontWeight: 700,
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase',
                              color: 'var(--success)',
                              borderBottom: '1px solid rgba(94,139,94,0.25)',
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }}
                          >
                            <span>
                              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', marginRight: 8 }} />
                              Open mats — {FULL_DAY[activeDay]}
                            </span>
                            <span style={{ color: 'var(--success)', opacity: 0.8, fontWeight: 500 }}>
                              {dayGroups[activeDay]!.openMats.length} session{dayGroups[activeDay]!.openMats.length > 1 ? 's' : ''}
                            </span>
                          </div>
                          {dayGroups[activeDay]!.openMats.map((entry, i) => (
                            <div
                              key={`om-${i}`}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '90px 1fr auto',
                                alignItems: 'center',
                                gap: 16,
                                padding: '18px 18px 18px 14px',
                                borderLeft: '4px solid var(--success)',
                                borderBottom: '1px solid var(--border)',
                                background: 'linear-gradient(90deg, rgba(94,139,94,0.10), rgba(94,139,94,0.03))',
                              }}
                            >
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 800, color: 'var(--bone)' }}>
                                {formatTime(entry.start_time)}
                              </span>
                              <div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--bone)', marginBottom: 2 }}>
                                  {entry.class_name || 'Open mat'}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                  {DISCIPLINE_LABELS[entry.discipline]}
                                  {entry.end_time && ` · ${formatTime(entry.end_time)}`}
                                  {entry.verified && (
                                    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>· verified ✓</span>
                                  )}
                                </div>
                              </div>
                              <Button
                                onClick={onRsvpClick}
                                size="sm"
                                style={{
                                  background: 'rgba(94,139,94,0.18)',
                                  borderColor: 'rgba(94,139,94,0.5)',
                                  color: 'var(--success)',
                                  borderRadius: 'var(--radius-full)',
                                  fontWeight: 700,
                                }}
                              >
                                RSVP
                              </Button>
                            </div>
                          ))}
                        </>
                      )}

                      {/* CLASSES group */}
                      {dayGroups[activeDay]!.classes.length > 0 && (
                        <>
                          <div
                            style={{
                              padding: '10px 18px',
                              background: 'rgba(245,241,232,0.03)',
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: 11, fontWeight: 700,
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase',
                              color: 'var(--text-secondary)',
                              borderBottom: '1px solid var(--border)',
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }}
                          >
                            <span>Classes</span>
                            <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
                              {dayGroups[activeDay]!.classes.length} session{dayGroups[activeDay]!.classes.length > 1 ? 's' : ''}
                            </span>
                          </div>
                          {dayGroups[activeDay]!.classes.map((entry, i) => (
                            <div
                              key={`cl-${i}`}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '90px 1fr auto',
                                alignItems: 'center',
                                gap: 16,
                                padding: '14px 18px',
                                borderBottom: '1px solid var(--border)',
                              }}
                            >
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                                {formatTime(entry.start_time)}
                              </span>
                              <div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                                  {entry.class_name || titleCase(entry.discipline)}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                  {DISCIPLINE_LABELS[entry.discipline]}
                                  {entry.end_time && ` · ${formatTime(entry.end_time)}`}
                                  {entry.is_kids && ' · Kids'}
                                </div>
                              </div>
                              <Pill size="sm">{DISCIPLINE_LABELS[entry.discipline]}</Pill>
                            </div>
                          ))}
                        </>
                      )}
                    </>
                  ) : (
                    <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                      No classes on {FULL_DAY[activeDay]}.
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* WEEKLY SCHEDULE — empty state (no schedule on file) */}
            {(!gym.schedule || gym.schedule.length === 0) && (
              <section style={{ marginBottom: 36 }}>
                <h2 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 12px' }}>
                  Weekly schedule
                </h2>
                <div
                  style={{
                    border: '1px dashed var(--border)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '32px 24px',
                    textAlign: 'center',
                    background: 'rgba(245,241,232,0.02)',
                  }}
                >
                  <div style={{ display: 'inline-flex', marginBottom: 12, color: 'var(--text-muted)' }}>
                    <svg {...stroke} width={32} height={32} viewBox="0 0 24 24">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                  </div>
                  <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: 'var(--bone)' }}>
                    No schedule yet
                  </h3>
                  <p style={{ margin: '0 auto 18px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, maxWidth: 420 }}>
                    {websiteHref
                      ? "We don't have a verified schedule for this gym yet. Check their website for the latest, or help build the community's data by submitting times you know about."
                      : "We don't have a verified schedule for this gym yet. Help build the community's data — submit times you know about."}
                  </p>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {websiteHref && (
                      <Button
                        as="a"
                        href={websiteHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="secondary"
                        size="md"
                      >
                        Visit their website
                      </Button>
                    )}
                    <Button
                      onClick={onWrongInfoClick}
                      variant="primary"
                      size="md"
                    >
                      Help fill it in
                    </Button>
                  </div>
                </div>
              </section>
            )}

          </main>

          {/* ── RIGHT SIDEBAR ── */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* CONTACT — first / promoted */}
            <SideCard title="Contact">
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {gym.address && (
                  <ContactRow
                    href={`https://maps.google.com/?q=${encodeURIComponent(gym.address)}`}
                    icon={<IconPin />}
                    label={gym.address}
                  />
                )}
                {gym.phone && (
                  <ContactRow
                    href={`tel:${gym.phone.replace(/[^\d+]/g, '')}`}
                    icon={<IconPhone />}
                    label={gym.phone}
                    onClick={() => trackEvent('phone_click', gym.id)}
                  />
                )}
                {websiteHref && (
                  <ContactRow
                    href={websiteHref}
                    icon={<IconGlobe />}
                    label={gym.website?.replace(/^https?:\/\//, '').replace(/\/$/, '') ?? ''}
                    isLink
                  />
                )}
                {igHref && (
                  <ContactRow
                    href={igHref}
                    icon={<IconIg />}
                    label={`@${gym.instagram?.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '')}`}
                    isLink
                    onClick={() => trackEvent('ig_click', gym.id)}
                  />
                )}
              </div>
            </SideCard>

            {/* AT A GLANCE — 5 fixed stats */}
            <SideCard title="At a glance">
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <GlanceRow icon={<IconDollar />} label="Drop-in fee" value={
                  gym.free_for_visitors ? 'Free for visitors' : 'Contact gym'
                } valueClass={gym.free_for_visitors ? 'pos' : undefined} />
                <GlanceRow icon={<IconPeople />} label="Avg class size" value="—" valueClass="neg" />
                <GlanceRow icon={<IconZap />} label="Best day to visit" value={
                  next ? `${FULL_DAY[next.day]} ${formatTime(next.start_time)}` : 'No open mats yet'
                } />
                <GlanceRow icon={<IconShield />} label="Affiliation" value="—" valueClass="neg" />
                <GlanceRow icon={<IconCalendar />} label="Open since" value="—" valueClass="neg" />
              </div>
            </SideCard>

            {/* TRAINED HERE */}
            <SideCard title="Trained here">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  No matfinders have logged a session here yet — be the first.
                </div>
              </div>
            </SideCard>

            {/* WRONG INFO */}
            <button
              onClick={onWrongInfoClick}
              style={{
                color: 'var(--text-muted)',
                fontSize: 12,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                cursor: 'pointer',
                border: 'none',
                background: 'transparent',
                fontFamily: 'inherit',
                padding: '8px 0',
                transition: 'color 150ms',
                alignSelf: 'flex-start',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--processing)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              <IconFlag />
              Report wrong info on this listing
            </button>
          </aside>

        </div>
      </div>

      {/* Inline keyframes for the next-open-mat pulse */}
      <style>{`
        @keyframes pulse-ring {
          0%   { box-shadow: 0 0 0 0 rgba(94,139,94,0.6); }
          70%  { box-shadow: 0 0 0 6px rgba(94,139,94,0); }
          100% { box-shadow: 0 0 0 0 rgba(94,139,94,0); }
        }
        @media (max-width: 880px) {
          .gym-page-grid {
            grid-template-columns: 1fr !important;
            gap: 24px !important;
          }
        }
      `}</style>

      {/* Photo lightbox — escapes via portal to document.body. Uses the
          highest-res variant since the modal can fill the viewport. */}
      {showLightbox && gym.photo_url && (
        <PhotoLightbox
          photos={[PhotoSize.lightbox(gym.photo_url)!]}
          onClose={() => setShowLightbox(false)}
        />
      )}

      {/* Correction form modal */}
      {showCorrectionForm && (
        <CorrectionForm
          gym={gym}
          onClose={() => setShowCorrectionForm(false)}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Small sub-components for the sidebar
// ───────────────────────────────────────────────────────────────────

function SideCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: 16,
      }}
    >
      <h3 style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11, fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        margin: '0 0 12px',
      }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function ContactRow({
  href, icon, label, isLink, onClick,
}: {
  href: string; icon: React.ReactNode; label: string; isLink?: boolean; onClick?: () => void;
}) {
  const isExternal = href.startsWith('http');
  return (
    <a
      href={href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noopener noreferrer' : undefined}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 0',
        borderBottom: '1px solid var(--border)',
        fontSize: 13,
        color: isLink ? 'var(--accent)' : 'var(--text-secondary)',
        textDecoration: 'none',
        transition: 'color 150ms',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--bone)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = isLink ? 'var(--accent)' : 'var(--text-secondary)'; }}
    >
      <span style={{ color: 'var(--text-muted)', flexShrink: 0, display: 'inline-flex' }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </a>
  );
}

function GlanceRow({
  icon, label, value, valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: 'pos' | 'neg';
}) {
  const valueColor = valueClass === 'pos' ? 'var(--success)' : valueClass === 'neg' ? 'var(--text-muted)' : 'var(--bone)';
  const valueWeight = valueClass === 'neg' ? 500 : 600;
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, padding: '10px 0',
        borderBottom: '1px solid var(--border)',
        fontSize: 13,
      }}
    >
      <span style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span style={{ opacity: 0.7, display: 'inline-flex' }}>{icon}</span>
        {label}
      </span>
      <span style={{ color: valueColor, fontWeight: valueWeight, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}
