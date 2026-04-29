'use client';

// GymCard — Card A spec.
//
// Standard list/list-row card. Clean photo hero (or monogram fallback when
// no photo), name as website link, status badge, discipline pills, an
// open-mat panel with RSVP + going stack, big primary Check-in button, and
// a 3-button uniform secondary action grid (Directions / Call / Instagram).
// The legacy correction form + full-schedule modal still live in
// `GymCard.legacy.tsx` and will be ported into this card in a follow-up
// pass; for now the "Wrong info?" button calls a TODO handler.
//
// All buttons inherit the `Button` primitive. All colors use design tokens.

import { useState } from 'react';
import {
  Gym,
  Discipline,
  BJJ_DISCIPLINES,
  DISCIPLINE_LABELS,
  DISCIPLINE_COLORS,
  OpenMat,
  DayOfWeek,
} from '@/lib/types';
import { computeGymStatus } from '@/lib/gymStatus';
import { Button, Pill, StatusBadge } from './ui';
import HeartButton from './HeartButton';
import { trackEvent } from '@/lib/track';
import { useOwnedGyms } from '@/lib/useOwnedGyms';
import { formatTime, titleCase } from '@/lib/utils';

// ───────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────

/** Monogram for a gym name. Used as the photo fallback (e.g. "10P", "ASD",
 *  "GB"). Numbers leading the first word are kept intact ("10th Planet
 *  Austin" → "10P"). */
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

const DAY_INDEX: Record<DayOfWeek, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};
const DAY_FULL: Record<DayOfWeek, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
};

/** Find the next chronological open mat (today onward, then wrap to next week).
 *  Returns null if the gym has no open mats. */
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

/** Convert a #RRGGBB hex string to an rgba() with the given alpha.
 *  Used by the discipline pill to render a translucent tint of the
 *  marker color (bright variant) for contrast on dark surfaces. */
function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace('#', '').match(/^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return `rgba(245,241,232,${alpha})`;
  const r = parseInt(m[1]!, 16);
  const g = parseInt(m[2]!, 16);
  const b = parseInt(m[3]!, 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Compute distance display. Always shown when distanceKm is provided. */
function formatDistance(km: number | undefined, useKm: boolean): string | null {
  if (km == null || !Number.isFinite(km)) return null;
  if (useKm) return `${km.toFixed(km < 10 ? 1 : 0)} km`;
  const mi = km * 0.621371;
  return `${mi.toFixed(mi < 10 ? 1 : 0)} mi`;
}

/** True if the open-mat is happening within the next 60 minutes. */
function isStartingWithinHour(mat: OpenMat, now: Date = new Date()): boolean {
  const matIdx = DAY_INDEX[mat.day];
  if (matIdx !== now.getDay()) return false;
  const [h, m] = mat.start_time.split(':').map(Number);
  const matMin = (h ?? 0) * 60 + (m ?? 0);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const diff = matMin - nowMin;
  return diff > 0 && diff <= 60;
}

// ───────────────────────────────────────────────────────────────────
// Inline SVG icons (no emoji, all stroke-based)
// ───────────────────────────────────────────────────────────────────

const stroke = {
  width: 14, height: 14,
  fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  'aria-hidden': true,
} as const;

const IconExt = () => (
  <svg {...stroke} width={13} height={13} viewBox="0 0 24 24" style={{ flexShrink: 0, opacity: 0.5, transition: 'opacity 150ms' }}>
    <path d="M7 17L17 7" /><polyline points="7 7 17 7 17 17" />
  </svg>
);
const IconNav = () => (
  <svg {...stroke} viewBox="0 0 24 24"><polygon points="3 11 22 2 13 21 11 13 3 11" /></svg>
);
const IconPhone = () => (
  <svg {...stroke} viewBox="0 0 24 24">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);
const IconIg = () => (
  <svg {...stroke} viewBox="0 0 24 24">
    <rect x="2" y="2" width="20" height="20" rx="5" />
    <path d="M16 11.37a4 4 0 1 1-7.92 1.18A4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);
const IconFlag = () => (
  <svg {...stroke} width={11} height={11} viewBox="0 0 24 24">
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <line x1="4" y1="22" x2="4" y2="15" />
  </svg>
);

// ───────────────────────────────────────────────────────────────────
// Props
// ───────────────────────────────────────────────────────────────────

interface GymCardProps {
  gym: Gym;
  isSelected: boolean;
  isMobile?: boolean;
  /** Legacy — accepted for backwards compatibility but no longer used. */
  mapOverlay?: boolean;
  /** Legacy — accepted for backwards compatibility but no longer used. */
  compact?: boolean;
  onClick: () => void;
  distanceKm?: number;
  useKm?: boolean;
  /** Forces the "starting soon" label even when we can't compute it. */
  isStartingSoon?: boolean;
  /** Internal user-rating average (separate from gym.rating which is from
   *  Google Places). Currently unused in the new layout — kept for compat. */
  ratingAvg?: number | null;
  /** Internal user-rating count. Kept for compat. */
  ratingCount?: number;
  onRated?: () => void;
  onCityClick?: (cityQuery: string) => void;
  /** Number of distinct check-ins at this gym in the last 7 days. */
  weeklyCheckins?: number;
}

// ───────────────────────────────────────────────────────────────────
// Component
// ───────────────────────────────────────────────────────────────────

export default function GymCard({
  gym,
  isSelected,
  onClick,
  distanceKm,
  useKm = true,
  isStartingSoon: isStartingSoonProp,
  weeklyCheckins = 0,
  onCityClick,
  mapOverlay = false,
}: GymCardProps) {
  const ownedGymIds = useOwnedGyms();
  const ownsThisGym = ownedGymIds.includes(gym.id);

  // Status from schedule
  const status = computeGymStatus(gym.schedule);

  // Next open mat
  const next = findNextOpenMat(gym);
  const startingSoon = next ? (isStartingSoonProp || isStartingWithinHour(next)) : false;

  // Verified mats
  const verifiedMats = gym.open_mats.filter(o => o.verified);
  const hasVerifiedMats = verifiedMats.length > 0;

  // Disciplines (deduped — collapse all BJJ variants into one chip)
  const rawDisciplines = [...new Set(gym.open_mats.map(o => o.discipline))];
  const disciplines: Discipline[] = rawDisciplines.reduce<Discipline[]>((acc, d) => {
    const key = BJJ_DISCIPLINES.has(d) ? 'bjj' : d;
    if (!acc.includes(key)) acc.push(key);
    return acc;
  }, []);

  // Distance / address
  const distance = formatDistance(distanceKm, useKm);

  // Website normalization for link affordance
  const websiteHref = gym.website
    ? (gym.website.startsWith('http') ? gym.website : `https://${gym.website}`)
    : null;

  // Instagram normalization
  const igHref = gym.instagram
    ? (gym.instagram.startsWith('http')
        ? gym.instagram
        : `https://instagram.com/${gym.instagram.replace(/^@/, '')}`)
    : null;

  // Rating display — prefer Google rating from gym_overrides
  const ratingValue = typeof gym.rating === 'number' ? gym.rating : null;
  const ratingCount = typeof gym.review_count === 'number' ? gym.review_count : null;

  // Stop-prop helpers for nested actions so card-click still works
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  // ── Local placeholder for "Wrong info?" until we port the legacy
  // correction form into this card. Wired to a no-op alert for now.
  const onWrongInfoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    alert("Reporting flow coming soon. For now, click the gym name → check the gym's website.");
  };

  // ── RSVP placeholder. Real flow ships in Week 3 (Community core).
  const onRsvpClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    alert('RSVP coming soon — open mats will let you confirm and see who else is going.');
  };

  // ─────────────────────────────────────────────────────────────────
  // LANDSCAPE VARIANT — desktop map popover.
  //
  // When a user clicks a pin on the map, the card pops out next to
  // the pin. A vertical card forces scrolling and dominates the
  // viewport; a landscape layout (photo left, info right) fits the
  // popover context and shows everything above the fold.
  // ─────────────────────────────────────────────────────────────────
  if (mapOverlay) {
    return (
      <article
        onClick={onClick}
        data-gym-id={gym.id}
        style={{
          background: 'var(--surface-raised)',
          border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          cursor: 'pointer',
          boxShadow: 'var(--shadow-lg)',
          transition: 'border-color 150ms, box-shadow 200ms',
          fontFamily: "'Inter Tight', sans-serif",
          color: 'var(--text-primary)',
          display: 'grid',
          gridTemplateColumns: '200px 1fr',
          width: '100%',
          maxWidth: 720,
          minHeight: 240,
        }}
      >
        {/* ── Left: photo or monogram ── */}
        <div
          style={{
            position: 'relative',
            background: gym.photo_url
              ? 'var(--brown-700)'
              : 'linear-gradient(135deg, var(--brown-700), var(--brown-500))',
            overflow: 'hidden',
          }}
        >
          {gym.photo_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={gym.photo_url}
              alt={gym.name}
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div
              aria-hidden
              style={{
                position: 'absolute', inset: 0,
                display: 'grid', placeItems: 'center',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 44, fontWeight: 800,
                color: 'rgba(245,241,232,0.18)',
                letterSpacing: '0.06em',
                userSelect: 'none',
              }}
            >
              {gymMonogram(gym.name)}
            </div>
          )}

          {/* Heart top-right */}
          <div
            onClick={stop}
            style={{
              position: 'absolute', top: 10, right: 10,
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: '1px solid rgba(245,241,232,0.18)',
              display: 'grid', placeItems: 'center',
            }}
          >
            <HeartButton gymId={gym.id} />
          </div>

          {/* Verified badge bottom-left */}
          {hasVerifiedMats && (
            <span
              style={{
                position: 'absolute', bottom: 10, left: 10,
                background: 'rgba(94,139,94,0.92)',
                color: 'var(--bone)',
                fontSize: 10, fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 'var(--radius-full)',
                backdropFilter: 'blur(8px)',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              <svg {...stroke} width={10} height={10} viewBox="0 0 24 24" strokeWidth={3}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              verified
            </span>
          )}
        </div>

        {/* ── Right: info body ── */}
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', minWidth: 0, gap: 8 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            {websiteHref ? (
              <a
                href={websiteHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={stop}
                style={{
                  fontSize: 16, fontWeight: 800,
                  color: 'var(--bone)',
                  lineHeight: 1.25,
                  textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  flex: 1, minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {gym.name}
                </span>
                <IconExt />
              </a>
            ) : (
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--bone)', margin: 0, lineHeight: 1.25, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {gym.name}
              </h3>
            )}
            {ratingValue != null && (
              <span
                style={{
                  display: 'inline-flex', alignItems: 'baseline', gap: 4,
                  fontWeight: 700, color: 'var(--bone)', fontSize: 13,
                  flexShrink: 0,
                }}
              >
                <span style={{ color: 'var(--warning)', fontSize: 12 }}>★</span>
                {ratingValue.toFixed(1)}
                {ratingCount != null && (
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: 11 }}>({ratingCount})</span>
                )}
              </span>
            )}
          </div>

          {/* Meta row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            <StatusBadge status={status} size="sm" />
            {distance && (
              <>
                <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'currentColor', opacity: 0.5 }} />
                <span>{distance}</span>
              </>
            )}
            {gym.city && (
              <>
                <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'currentColor', opacity: 0.5 }} />
                <span>{titleCase(gym.city)}{gym.state ? `, ${gym.state}` : ''}</span>
              </>
            )}
          </div>

          {/* Discipline pills — marker color (bright) on translucent tint
              for proper contrast on the dark brown surface. */}
          {disciplines.length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {disciplines.slice(0, 4).map(d => {
                const c = DISCIPLINE_COLORS[d];
                return (
                  <Pill
                    key={d}
                    size="sm"
                    style={{
                      background: hexToRgba(c.marker, 0.16),
                      color: c.marker,
                      borderColor: hexToRgba(c.marker, 0.45),
                      fontSize: 10,
                      padding: '3px 8px',
                    }}
                  >
                    {DISCIPLINE_LABELS[d]}
                  </Pill>
                );
              })}
              {disciplines.length > 4 && (
                <Pill size="sm" style={{ fontSize: 10, padding: '3px 8px' }}>
                  +{disciplines.length - 4}
                </Pill>
              )}
            </div>
          )}

          {/* Open-mat panel — compact */}
          {next && (
            <div
              onClick={stop}
              style={{
                border: '1px solid rgba(94,139,94,0.45)',
                background: 'linear-gradient(135deg, rgba(94,139,94,0.16), rgba(94,139,94,0.06))',
                borderRadius: 'var(--radius-md)',
                padding: '10px 12px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    color: 'var(--success)',
                    fontSize: 10, fontWeight: 700,
                    letterSpacing: '0.04em',
                    marginBottom: 2,
                    textTransform: 'uppercase',
                  }}
                >
                  {startingSoon ? 'Starting soon' : `${DAY_FULL[next.day]} · ${formatTime(next.start_time)}`}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--bone)' }}>
                  Open mat
                  <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: 11, marginLeft: 6 }}>
                    {DISCIPLINE_LABELS[next.discipline]}{next.is_free ? ' · Free for visitors' : ''}
                  </span>
                </div>
              </div>
              <Button
                onClick={onRsvpClick}
                size="sm"
                variant="primary"
                style={{
                  background: 'var(--success)',
                  borderColor: 'var(--success)',
                  color: 'var(--bone)',
                  fontWeight: 700,
                  height: 28,
                  borderRadius: 'var(--radius-full)',
                  flexShrink: 0,
                }}
              >
                RSVP
              </Button>
            </div>
          )}

          {/* Action grid — only render available actions so the visible
              buttons always look identical (no greyed-out placeholders).
              Grid columns auto-fit based on what's there. */}
          {(() => {
            const actions: Array<{ key: string; node: React.ReactElement }> = [];
            actions.push({
              key: 'dir',
              node: (
                <Button
                  as="a"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${gym.lat},${gym.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="secondary"
                  size="sm"
                  onClick={() => trackEvent('directions_click', gym.id)}
                  style={{ fontSize: 11 }}
                >
                  <IconNav />Directions
                </Button>
              ),
            });
            if (gym.phone) {
              actions.push({
                key: 'phone',
                node: (
                  <Button
                    as="a"
                    href={`tel:${gym.phone.replace(/[^\d+]/g, '')}`}
                    variant="secondary"
                    size="sm"
                    onClick={() => trackEvent('phone_click', gym.id)}
                    style={{ fontSize: 11 }}
                  >
                    <IconPhone />Call
                  </Button>
                ),
              });
            }
            if (igHref) {
              actions.push({
                key: 'ig',
                node: (
                  <Button
                    as="a"
                    href={igHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="secondary"
                    size="sm"
                    onClick={() => trackEvent('ig_click', gym.id)}
                    style={{ fontSize: 11 }}
                  >
                    <IconIg />Instagram
                  </Button>
                ),
              });
            }
            return (
              <div
                onClick={stop}
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${actions.length}, 1fr)`,
                  gap: 6, marginTop: 'auto', paddingTop: 4,
                }}
              >
                {actions.map(a => <div key={a.key}>{a.node}</div>)}
              </div>
            );
          })()}
        </div>
      </article>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // STANDARD VERTICAL VARIANT — list view
  // ─────────────────────────────────────────────────────────────────
  return (
    <article
      onClick={onClick}
      data-gym-id={gym.id}
      style={{
        background: 'var(--surface-raised)',
        border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        cursor: 'pointer',
        boxShadow: isSelected ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transition: 'border-color 150ms, box-shadow 200ms, transform 150ms',
        fontFamily: "'Inter Tight', sans-serif",
        color: 'var(--text-primary)',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)';
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
          (e.currentTarget as HTMLElement).style.transform = '';
        }
      }}
    >
      {/* ─── PHOTO BLOCK ─── */}
      <div
        style={{
          aspectRatio: '16 / 9',
          background: gym.photo_url
            ? 'var(--brown-700)'
            : 'linear-gradient(135deg, var(--brown-700), var(--brown-500))',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {gym.photo_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={gym.photo_url}
            alt={gym.name}
            loading="lazy"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
            onError={(e) => {
              // Hide on load failure — the gradient bg + monogram show through
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div
            aria-hidden
            style={{
              position: 'absolute', inset: 0,
              display: 'grid', placeItems: 'center',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 56,
              fontWeight: 800,
              color: 'rgba(245,241,232,0.18)',
              letterSpacing: '0.06em',
              userSelect: 'none',
            }}
          >
            {gymMonogram(gym.name)}
          </div>
        )}

        {/* Heart overlay (favorites) */}
        <div
          onClick={stop}
          style={{
            position: 'absolute', top: 12, right: 12,
            width: 36, height: 36, borderRadius: '50%',
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid rgba(245,241,232,0.18)',
            display: 'grid', placeItems: 'center',
          }}
        >
          <HeartButton gymId={gym.id} />
        </div>

        {/* Verified badge — top-left when there's at least one verified mat */}
        {hasVerifiedMats && (
          <span
            style={{
              position: 'absolute', top: 12, left: 12,
              background: 'rgba(94,139,94,0.92)',
              color: 'var(--bone)',
              fontSize: 11, fontWeight: 700,
              padding: '4px 10px',
              borderRadius: 'var(--radius-full)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            <svg {...stroke} width={11} height={11} viewBox="0 0 24 24" strokeWidth={3}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
            verified
          </span>
        )}
      </div>

      {/* ─── BODY ─── */}
      <div style={{ padding: '16px 18px' }}>

        {/* Header — name (link) + rating right */}
        <div
          style={{
            display: 'flex', alignItems: 'flex-start',
            justifyContent: 'space-between', gap: 12, marginBottom: 6,
          }}
        >
          {websiteHref ? (
            <a
              href={websiteHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={stop}
              style={{
                fontSize: 18, fontWeight: 800,
                color: 'var(--bone)',
                lineHeight: 1.25, margin: 0, flex: 1, minWidth: 0,
                textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                cursor: 'pointer', transition: 'color 150ms',
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
            <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--bone)', margin: 0, lineHeight: 1.25, flex: 1, minWidth: 0 }}>
              {gym.name}
            </h3>
          )}
          {ratingValue != null && (
            <span
              style={{
                display: 'inline-flex', alignItems: 'baseline', gap: 4,
                fontWeight: 700, color: 'var(--bone)', fontSize: 14,
                flexShrink: 0, paddingTop: 2,
              }}
              aria-label={`Rated ${ratingValue} out of 5${ratingCount ? `, ${ratingCount} reviews` : ''}`}
            >
              <span style={{ color: 'var(--warning)', fontSize: 13 }}>★</span>
              {ratingValue.toFixed(1)}
              {ratingCount != null && (
                <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: 12 }}>
                  ({ratingCount})
                </span>
              )}
            </span>
          )}
        </div>

        {/* Meta row — status · distance · city */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: 'var(--text-muted)',
            marginBottom: 12, flexWrap: 'wrap',
          }}
        >
          <StatusBadge status={status} size="sm" />
          {distance && (
            <>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'currentColor', opacity: 0.5 }} />
              <span>{distance}</span>
            </>
          )}
          {gym.city && (
            <>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'currentColor', opacity: 0.5 }} />
              <button
                onClick={(e) => { stop(e); if (onCityClick) onCityClick(gym.city); }}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  color: 'inherit', font: 'inherit', cursor: onCityClick ? 'pointer' : 'default',
                }}
              >
                {titleCase(gym.city)}{gym.state ? `, ${gym.state}` : ''}
              </button>
            </>
          )}
        </div>

        {/* Discipline pills — marker (bright) color on translucent tint
            for readable contrast on the dark brown surface. */}
        {disciplines.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {disciplines.map(d => {
              const c = DISCIPLINE_COLORS[d];
              return (
                <Pill
                  key={d}
                  size="sm"
                  variant="soft"
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

        {/* Open-mat panel */}
        {next && (
          <div
            style={{
              border: '1px solid rgba(94,139,94,0.45)',
              background: 'linear-gradient(135deg, rgba(94,139,94,0.16), rgba(94,139,94,0.06))',
              borderRadius: 'var(--radius-md)',
              padding: '14px 16px',
              marginBottom: 14,
            }}
            onClick={stop}
          >
            <div
              style={{
                color: 'var(--success)',
                fontSize: 11, fontWeight: 700,
                letterSpacing: '0.04em',
                marginBottom: 4,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                textTransform: 'uppercase',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
              {startingSoon
                ? `Starting in ~${(() => {
                    const [h, m] = next.start_time.split(':').map(Number);
                    const start = (h ?? 0) * 60 + (m ?? 0);
                    const now = new Date();
                    return Math.max(0, start - (now.getHours() * 60 + now.getMinutes()));
                  })()} min`
                : `${DAY_FULL[next.day]} · ${formatTime(next.start_time)}`}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--bone)', margin: '0 0 2px' }}>
              Open mat
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              {DISCIPLINE_LABELS[next.discipline]}
              {next.is_free && ' · Free for visitors'}
              {next.cost && next.cost > 0 ? ` · $${next.cost} drop-in` : ''}
            </p>
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginTop: 10, paddingTop: 10,
                borderTop: '1px solid rgba(94,139,94,0.25)',
                gap: 12,
              }}
            >
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {/* Going-count stub. Wired to rsvps table in Week 3. */}
                Be the first to RSVP
              </span>
              <Button
                onClick={onRsvpClick}
                size="sm"
                variant="primary"
                style={{
                  background: 'var(--success)',
                  borderColor: 'var(--success)',
                  color: 'var(--bone)',
                  fontWeight: 700,
                  height: 32,
                  borderRadius: 'var(--radius-full)',
                }}
              >
                RSVP
              </Button>
            </div>
          </div>
        )}

        {/* Note: Check-in CTA intentionally lives on /gym/[slug] in the
            header, NOT on list/popover cards. List cards are for discovery
            (browsing, comparing, planning); check-in is a destination
            action that only makes sense once the user is at the gym. */}

        {/* Secondary action grid — only render available actions so the
            visible buttons always look identical (no greyed-out
            placeholders). Columns auto-fit based on what's there. */}
        {(() => {
          const actions: Array<{ key: string; node: React.ReactElement }> = [];
          actions.push({
            key: 'dir',
            node: (
              <Button
                as="a"
                href={`https://www.google.com/maps/dir/?api=1&destination=${gym.lat},${gym.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                variant="secondary"
                size="md"
                onClick={() => trackEvent('directions_click', gym.id)}
              >
                <IconNav />
                <span>Directions</span>
              </Button>
            ),
          });
          if (gym.phone) {
            actions.push({
              key: 'phone',
              node: (
                <Button
                  as="a"
                  href={`tel:${gym.phone.replace(/[^\d+]/g, '')}`}
                  variant="secondary"
                  size="md"
                  onClick={() => trackEvent('phone_click', gym.id)}
                  aria-label={`Call ${gym.phone}`}
                >
                  <IconPhone />
                  <span>Call</span>
                </Button>
              ),
            });
          }
          if (igHref) {
            actions.push({
              key: 'ig',
              node: (
                <Button
                  as="a"
                  href={igHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="secondary"
                  size="md"
                  onClick={() => trackEvent('ig_click', gym.id)}
                >
                  <IconIg />
                  <span>Instagram</span>
                </Button>
              ),
            });
          }
          return (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${actions.length}, 1fr)`,
                gap: 6, marginBottom: 12,
              }}
              onClick={stop}
            >
              {actions.map(a => <div key={a.key}>{a.node}</div>)}
            </div>
          );
        })()}

        {/* Claim / Your gym row — small text-link only when relevant */}
        {ownsThisGym ? (
          <div style={{ marginBottom: 10 }} onClick={stop}>
            <Button
              as="a"
              href={`/owner/${gym.id}`}
              variant="ghost"
              size="sm"
              style={{ color: 'var(--warning)', fontWeight: 700 }}
            >
              Manage your gym →
            </Button>
          </div>
        ) : (
          <div style={{ marginBottom: 10 }} onClick={stop}>
            <Button
              as="a"
              href={`/claim/${gym.id}`}
              variant="ghost"
              size="sm"
              style={{ color: 'var(--text-muted)' }}
            >
              Are you the gym? Claim this listing →
            </Button>
          </div>
        )}

        {/* Meta footer — weekly check-ins + Wrong info? */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10, paddingTop: 10,
            borderTop: '1px solid var(--border)',
            fontSize: 11,
            color: 'var(--text-muted)',
          }}
        >
          <span>
            {weeklyCheckins > 0
              ? `${weeklyCheckins} trained here this week`
              : 'New gym to the network'}
          </span>
          <button
            onClick={onWrongInfoClick}
            style={{
              color: 'var(--text-muted)',
              fontSize: 11,
              border: 'none', background: 'transparent',
              padding: 0,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 4,
              transition: 'color 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--processing)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <IconFlag />
            Wrong info?
          </button>
        </div>

      </div>
    </article>
  );
}
