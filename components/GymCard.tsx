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
import Link from 'next/link';
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
import CorrectionForm from './CorrectionForm';
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

  // Correction form modal toggle
  const [showCorrectionForm, setShowCorrectionForm] = useState(false);

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

  // ── "Wrong info?" opens the correction modal (CorrectionForm).
  const onWrongInfoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowCorrectionForm(true);
  };

  // ── RSVP placeholder. Real flow ships in Week 3 (Community core).
  const onRsvpClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    alert('RSVP coming soon — open mats will let you confirm and see who else is going.');
  };

  // ─────────────────────────────────────────────────────────────────
  // POPOVER VARIANT — desktop map popover.
  //
  // Photo as a header strip on top, info body below. Wider than the
  // list card so info reads naturally left-to-right rather than
  // stacking in a narrow column. The photo is a 21:7 hero strip —
  // wide and not too tall, so the card stays compact.
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
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          maxWidth: 720,
        }}
      >
        {/* ── Top: hero photo strip (21:7 ratio) ── */}
        <div
          style={{
            position: 'relative',
            aspectRatio: '21 / 7',
            background: gym.photo_url
              ? 'var(--brown-700)'
              : 'linear-gradient(135deg, var(--brown-700), var(--brown-500))',
            overflow: 'hidden',
            flexShrink: 0,
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
                fontSize: 56, fontWeight: 800,
                color: 'rgba(245,241,232,0.18)',
                letterSpacing: '0.06em',
                userSelect: 'none',
              }}
            >
              {gymMonogram(gym.name)}
            </div>
          )}

          {/* Heart top-left of photo — Mapbox close X owns top-right. */}
          <div
            onClick={stop}
            style={{
              position: 'absolute', top: 10, left: 10,
              width: 34, height: 34, borderRadius: '50%',
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: '1px solid rgba(245,241,232,0.18)',
              display: 'grid', placeItems: 'center',
            }}
          >
            <HeartButton gymId={gym.id} />
          </div>

          {/* Verified badge bottom-left (off the heart's spot) */}
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

        {/* ── Bottom: info body ── */}
        <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', minWidth: 0, gap: 10 }}>
          {/* Header — bigger now that the body has full 720px width */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            {websiteHref ? (
              <a
                href={websiteHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={stop}
                style={{
                  fontSize: 19, fontWeight: 800,
                  color: 'var(--bone)',
                  lineHeight: 1.2,
                  textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
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
              <h3 style={{ fontSize: 19, fontWeight: 800, color: 'var(--bone)', margin: 0, lineHeight: 1.2, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
              >
                <span style={{ color: 'var(--warning)', fontSize: 13 }}>★</span>
                {ratingValue.toFixed(1)}
                {ratingCount != null && (
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: 12 }}>({ratingCount})</span>
                )}
              </span>
            )}
          </div>

          {/* Meta row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
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

          {/* Discipline pills — bright marker color on translucent tint */}
          {disciplines.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {disciplines.slice(0, 5).map(d => {
                const c = DISCIPLINE_COLORS[d];
                return (
                  <Pill
                    key={d}
                    size="sm"
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
              {disciplines.length > 5 && (
                <Pill size="sm">+{disciplines.length - 5}</Pill>
              )}
            </div>
          )}

          {/* Open-mat panel — 2-line condensed:
                Line 1: ● Sat 11:00 am · Open mat
                Line 2: Jiu-Jitsu · Free for visitors
              RSVP vertically centered on the right side. */}
          {next && (
            <div
              onClick={stop}
              style={{
                border: '1px solid rgba(94,139,94,0.45)',
                background: 'linear-gradient(135deg, rgba(94,139,94,0.16), rgba(94,139,94,0.06))',
                borderRadius: 'var(--radius-md)',
                padding: '10px 14px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 14, fontWeight: 700, color: 'var(--bone)',
                    display: 'flex', alignItems: 'center', gap: 8,
                    lineHeight: 1.3,
                  }}
                >
                  <span
                    style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: 'var(--success)', flexShrink: 0,
                    }}
                  />
                  <span>
                    {startingSoon
                      ? 'Starting soon'
                      : `${DAY_FULL[next.day]} ${formatTime(next.start_time)}`}
                    <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}> · </span>
                    Open mat
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 12, color: 'var(--text-secondary)',
                    marginTop: 3, marginLeft: 16, /* indent past the dot */
                    lineHeight: 1.3,
                  }}
                >
                  {DISCIPLINE_LABELS[next.discipline]}
                  {next.is_free ? ' · Free for visitors' : ''}
                  {next.cost && next.cost > 0 ? ` · $${next.cost} drop-in` : ''}
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
                  height: 32,
                  borderRadius: 'var(--radius-full)',
                  flexShrink: 0,
                  alignSelf: 'center',
                }}
              >
                RSVP
              </Button>
            </div>
          )}

          {/* Action grid — always 3 buttons (Directions / Call / Instagram).
              Buttons with missing data fade to opacity 0.4 but keep the
              same outline, dimensions and typography so the row stays
              visually consistent. */}
          <div
            onClick={stop}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 6, marginTop: 'auto', paddingTop: 4,
            }}
          >
            <Button
              as="a"
              href={`https://www.google.com/maps/dir/?api=1&destination=${gym.lat},${gym.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              variant="secondary"
              size="md"
              onClick={() => trackEvent('directions_click', gym.id)}
            >
              <IconNav />Directions
            </Button>
            {gym.phone ? (
              <Button
                as="a"
                href={`tel:${gym.phone.replace(/[^\d+]/g, '')}`}
                variant="secondary"
                size="md"
                onClick={() => trackEvent('phone_click', gym.id)}
              >
                <IconPhone />Call
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="md"
                onClick={(e) => e.preventDefault()}
                aria-label="Phone unavailable"
                title="No phone on file"
                style={{ opacity: 0.4, cursor: 'not-allowed' }}
              >
                <IconPhone />Call
              </Button>
            )}
            {igHref ? (
              <Button
                as="a"
                href={igHref}
                target="_blank"
                rel="noopener noreferrer"
                variant="secondary"
                size="md"
                onClick={() => trackEvent('ig_click', gym.id)}
              >
                <IconIg />Instagram
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="md"
                onClick={(e) => e.preventDefault()}
                aria-label="Instagram unavailable"
                title="No Instagram on file"
                style={{ opacity: 0.4, cursor: 'not-allowed' }}
              >
                <IconIg />Instagram
              </Button>
            )}
          </div>

          {/* View full page — primary navigation. Bone white so it's
              the most noticeable text-link in the card. */}
          <Link
            href={`/gym/${encodeURIComponent(gym.id)}`}
            onClick={stop}
            style={{
              fontSize: 13, fontWeight: 700,
              color: 'var(--bone)',
              textAlign: 'center',
              padding: '8px 0 2px',
              textDecoration: 'none',
              transition: 'color 150ms',
              display: 'inline-block',
              alignSelf: 'center',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--bone)'; }}
          >
            View full page →
          </Link>
        </div>
        {showCorrectionForm && (
          <CorrectionForm gym={gym} onClose={() => setShowCorrectionForm(false)} />
        )}
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

        {/* Secondary action grid — always 3 buttons (Directions / Call /
            Instagram). Missing data dims to opacity 0.4 but keeps the
            same outline + dimensions so the row stays visually identical. */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 6, marginBottom: 12,
          }}
          onClick={stop}
        >
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
          {gym.phone ? (
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
          ) : (
            <Button
              variant="secondary"
              size="md"
              onClick={(e) => e.preventDefault()}
              aria-label="Phone unavailable"
              title="No phone on file"
              style={{ opacity: 0.4, cursor: 'not-allowed' }}
            >
              <IconPhone />
              <span>Call</span>
            </Button>
          )}
          {igHref ? (
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
          ) : (
            <Button
              variant="secondary"
              size="md"
              onClick={(e) => e.preventDefault()}
              aria-label="Instagram unavailable"
              title="No Instagram on file"
              style={{ opacity: 0.4, cursor: 'not-allowed' }}
            >
              <IconIg />
              <span>Instagram</span>
            </Button>
          )}
        </div>

        {/* View full page — primary navigation. Bone white so it's
            the most noticeable text-link in the card. */}
        <Link
          href={`/gym/${encodeURIComponent(gym.id)}`}
          onClick={stop}
          style={{
            display: 'inline-block',
            fontSize: 13, fontWeight: 700,
            color: 'var(--bone)',
            textAlign: 'center',
            padding: '8px 0',
            textDecoration: 'none',
            marginBottom: 6,
            transition: 'color 150ms',
            alignSelf: 'flex-start',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--bone)'; }}
        >
          View full page →
        </Link>

        {/* Claim / Your gym row — secondary, accent-brown so it sits
            quieter than the primary "View full page" link above. */}
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
              style={{ color: 'var(--accent)' }}
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
      {showCorrectionForm && (
        <CorrectionForm gym={gym} onClose={() => setShowCorrectionForm(false)} />
      )}
    </article>
  );
}
