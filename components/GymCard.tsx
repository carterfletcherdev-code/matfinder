'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Gym, DISCIPLINE_LABELS, DISCIPLINE_COLORS, DAY_LABELS, Discipline, BJJ_DISCIPLINES } from '@/lib/types';
import { formatTime, titleCase } from '@/lib/utils';
import StarRating from './StarRating';
import HeartButton from './HeartButton';
import CheckInButton from './CheckInButton';
import VerifiedBadge from './VerifiedBadge';
import { trackEvent } from '@/lib/track';
import { useOwnedGyms } from '@/lib/useOwnedGyms';

function VerifiedTooltip({ verifiedAgo, lastVerifiedAt }: { verifiedAgo: string; lastVerifiedAt: Date | null }) {
  const [show, setShow] = useState(false);
  const dateStr = lastVerifiedAt ? lastVerifiedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setShow(v => !v); }}
        style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: '#A8C2A8', fontSize: 10, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 3,
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 13, height: 13, borderRadius: '50%',
          background: '#A8C2A8', color: '#1A1310',
          fontSize: 9, fontWeight: 900, lineHeight: 1, flexShrink: 0,
        }}>✓</span>
        verified {verifiedAgo}
      </button>
      {show && (
        <span style={{
          position: 'absolute', bottom: '100%', left: 0, marginBottom: 6, zIndex: 9999,
          background: 'rgba(26,19,16,0.97)', border: '1px solid rgba(168,194,168,0.40)',
          borderRadius: 6, padding: '7px 10px', whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }}>
          <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#A8C2A8', fontFamily: "'Inter Tight', sans-serif", marginBottom: 2 }}>
            Schedule verified
          </span>
          <span style={{ display: 'block', fontSize: 10, color: 'rgba(245,241,232,0.65)', fontFamily: "'Inter Tight', sans-serif" }}>
            Open mat times confirmed from the gym's{dateStr ? ` website on ${dateStr}` : ' website'}.
          </span>
        </span>
      )}
    </span>
  );
}

interface GymCardProps {
  gym: Gym;
  isSelected: boolean;
  isMobile?: boolean;
  mapOverlay?: boolean;
  /** Compact 2-row layout — used in the landscape mobile list. */
  compact?: boolean;
  onClick: () => void;
  distanceKm?: number;
  useKm?: boolean;
  isStartingSoon?: boolean;
  ratingAvg?: number | null;
  ratingCount?: number;
  onRated?: () => void;
  onCityClick?: (cityQuery: string) => void;
  /** Number of distinct check-ins at this gym in the last 7 days. Drives
   *  the "X trained here this week" social-proof badge on the card. */
  weeklyCheckins?: number;
}

export default function GymCard({ gym, isSelected, isMobile, mapOverlay, compact, onClick, distanceKm, useKm = true, isStartingSoon, ratingAvg, ratingCount, onRated, onCityClick, weeklyCheckins = 0 }: GymCardProps) {
  // Owner check — if the current user is a verified owner of THIS gym,
  // we replace the Claim pill with a "Your Gym" pill that links to the
  // owner portal instead of the claim flow.
  const ownedGymIds = useOwnedGyms();
  const ownsThisGym = ownedGymIds.includes(gym.id);

  // Deduplicate: all BJJ variants (bjj/nogi_bjj/gi_bjj) show as one chip
  const rawDisciplines = [...new Set(gym.open_mats.map((o) => o.discipline))];
  const disciplines: Discipline[] = rawDisciplines.reduce<Discipline[]>((acc, d) => {
    const key = BJJ_DISCIPLINES.has(d) ? 'bjj' : d;
    if (!acc.includes(key)) acc.push(key);
    return acc;
  }, []);
  // Only open mats with verified=true have real, sourced times
  const verifiedMats = gym.open_mats.filter(o => o.verified === true);
  const hasVerifiedMats = verifiedMats.length > 0;
  const hasFree = hasVerifiedMats
    ? verifiedMats.some(o => o.is_free)
    : gym.open_mats.some(o => o.is_free && o.confirmed === true);
  const lastVerifiedAt = (() => {
    const ts: number[] = [];
    for (const o of gym.open_mats) if (o.verified && o.verified_at) ts.push(Date.parse(o.verified_at));
    if (gym.schedule) for (const s of gym.schedule) if (s.verified && s.verified_at) ts.push(Date.parse(s.verified_at));
    const valid = ts.filter(n => !Number.isNaN(n));
    return valid.length ? new Date(Math.max(...valid)) : null;
  })();
  const verifiedAgo = (() => {
    if (!lastVerifiedAt) return null;
    const days = Math.floor((Date.now() - lastVerifiedAt.getTime()) / 86400000);
    if (days < 1) return 'today';
    if (days < 2) return 'yesterday';
    if (days < 30) return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  })();
  const hasUnknownBjj = gym.open_mats.some((o) => o.discipline === 'bjj');
  const [showCorrectionForm, setShowCorrectionForm] = useState(false);
  const [correctionField, setCorrectionField] = useState('');
  const [correctionValue, setCorrectionValue] = useState('');
  const [correctionNotes, setCorrectionNotes] = useState('');
  // Optional dedicated Instagram input — submitted as its own correction
  // record (`field: 'instagram'`) so future syncs can pick it up cleanly.
  const [correctionInstagram, setCorrectionInstagram] = useState('');
  const [correctionSubmitted, setCorrectionSubmitted] = useState(false);
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false);
  const [showFullSchedule, setShowFullSchedule] = useState(false);

  // Portal target — only set after mount so SSR doesn't try to render
  // into document.body. Without portaling, the card's `backdrop-filter`
  // creates a containing block that traps `position:fixed` children
  // and clips the modal to the card.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (typeof document !== 'undefined') setPortalTarget(document.body);
  }, []);

  async function submitCorrection() {
    // Description (free text) is always required. The corrected value
    // is required ONLY if the user isn't also filling in the Instagram
    // field — Instagram-only submissions skip Correct Value entirely.
    // The user can submit:
    //   (a) main correction only       → needs field + correct_val
    //   (b) main + Instagram           → needs field + correct_val + ig
    //   (c) Instagram-only              → needs field + ig (no correct_val)
    const desc = correctionField.trim();
    const val = correctionValue.trim();
    const ig = correctionInstagram.trim();
    if (!desc) return;
    if (!val && !ig) return;

    setCorrectionSubmitting(true);
    try {
      const requests: Promise<Response>[] = [];

      // Main correction record — only sent when there's an actual
      // corrected value (not on Instagram-only submissions).
      if (val) {
        requests.push(fetch('/api/corrections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gym_id: gym.id,
            gym_name: gym.name,
            gym_city: gym.city,
            field: desc.slice(0, 200),
            current_val: '',
            correct_val: val,
            notes: correctionNotes.trim() || null,
          }),
        }));
      }

      // Instagram record — sent separately so the API can route /
      // dedupe Instagram updates without touching the main correction
      // workflow.
      if (ig) {
        requests.push(fetch('/api/corrections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gym_id: gym.id,
            gym_name: gym.name,
            gym_city: gym.city,
            field: 'instagram',
            current_val: gym.instagram ?? '',
            correct_val: ig,
            // For Instagram-only submissions, fold the description in
            // as notes so the reviewer still has context (e.g. "missing
            // Instagram, found their account").
            notes: val ? null : (desc + (correctionNotes.trim() ? `\n\n${correctionNotes.trim()}` : '')),
          }),
        }));
      }

      await Promise.all(requests);
      setCorrectionSubmitted(true);
      setShowCorrectionForm(false);
      // Reset the form fields so a follow-up correction starts blank.
      setCorrectionField('');
      setCorrectionValue('');
      setCorrectionInstagram('');
      setCorrectionNotes('');
      // Auto-revert the "Thanks!" confirmation back to the Help Confirm
      // pill after 4s so a user can submit another correction without
      // having to refresh / reopen the card, but the celebratory state
      // lingers long enough to be noticed. Applies to both the main
      // form (portrait + desktop) and the compact landscape form, since
      // both share `correctionSubmitted` state.
      setTimeout(() => setCorrectionSubmitted(false), 4000);
    } finally {
      setCorrectionSubmitting(false);
    }
  }

  // Filter-panel dark-brown scheme — translucent bg + bone text + bone outline.
  // Selected state lifts opacity slightly and brightens border.
  const bg = isSelected ? 'rgba(40,28,20,0.98)' : 'rgba(40,28,20,0.94)';
  const borderCol = isSelected ? 'var(--bone)' : 'rgba(245,241,232,0.30)';
  const nameColor = 'var(--bone)';
  const muted = 'rgba(245,241,232,0.65)';
  const scheduleText = 'rgba(245,241,232,0.90)';

  // ────────────────────────────────────────────────────────────────────
  // COMPACT VARIANT — landscape mobile list. ~half-height, two-row layout:
  //   Row 1: Gym name (truncated)              [♥] [badges]
  //   Row 2: City · distance        ·    discipline glyph chips
  // No schedule preview, no rating chip in name — designed for fast scan.
  //
  // Selected compact cards fall through to the full layout below so the
  // expanded state in the landscape list reads as ~2× the compact size
  // and shows the schedule + action row.
  // ────────────────────────────────────────────────────────────────────

  // Shared full-schedule modal — rendered by both the full card layout
  // AND the landscape compact-expanded card. Big dark backdrop so the
  // rest of the UI fades out behind it, giving a clean ~80%-viewport
  // focused view (full screen on mobile).
  const renderFullScheduleModal = () => {
    if (!showFullSchedule || !gym.schedule || !portalTarget) return null;
    const FULL_DAY: Record<string, string> = {
      monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
      thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
    };
    return createPortal(
      <div
        onClick={(e) => { e.stopPropagation(); setShowFullSchedule(false); }}
        style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: isMobile ? 0 : '5vh 5vw',
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'rgba(20,13,9,0.99)',
            border: '1px solid rgba(245,241,232,0.18)',
            borderRadius: isMobile ? 0 : 14,
            width: isMobile ? '100vw' : '90vw',
            height: isMobile ? '100dvh' : '90vh',
            maxWidth: isMobile ? '100vw' : 1200,
            maxHeight: isMobile ? '100dvh' : '90vh',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 28px 72px rgba(0,0,0,0.75)',
            color: 'var(--bone)',
            fontFamily: "'Inter Tight', sans-serif",
            overflow: 'hidden',
          }}
        >
          {/* Modal header */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            padding: '16px 18px 12px',
            borderBottom: '1px solid rgba(245,241,232,0.12)',
            flexShrink: 0, gap: 12,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.2, marginBottom: 3 }}>
                {gym.name}
              </div>
              <div style={{
                fontSize: 11, color: 'rgba(245,241,232,0.50)',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {gym.city}{gym.state ? `, ${gym.state}` : ''} · {gym.schedule.length} classes/week
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setShowFullSchedule(false); }}
              style={{
                background: 'rgba(245,241,232,0.10)',
                border: '1px solid rgba(245,241,232,0.18)',
                color: 'rgba(245,241,232,0.80)',
                borderRadius: '50%',
                width: 32, height: 32, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: 0,
              }}
              aria-label="Close schedule"
            >×</button>
          </div>

          {/* Week grid — scrollable */}
          <div className="no-scrollbar" style={{ overflowY: 'auto', flex: 1, padding: '14px 18px 18px' }}>
            {(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as const).map((day) => {
              const dayEntries = gym.schedule!
                .filter(s => s.day === day)
                .sort((a, b) => a.start_time.localeCompare(b.start_time));
              if (dayEntries.length === 0) return null;
              return (
                <div key={day} style={{ marginBottom: 16 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 800, letterSpacing: '0.10em',
                    color: 'var(--bone)',
                    fontFamily: "'JetBrains Mono', monospace",
                    textTransform: 'uppercase',
                    paddingBottom: 7,
                    borderBottom: '1px solid rgba(245,241,232,0.10)',
                    marginBottom: 7,
                  }}>{FULL_DAY[day]}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {dayEntries.map((s, i) => {
                      return (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '7px 10px',
                          borderRadius: 8,
                          background: s.is_open_mat ? 'rgba(168,194,168,0.09)' : 'rgba(245,241,232,0.04)',
                          // Bone-white outline on every schedule row, both
                          // mobile and desktop. Open-mat rows keep the
                          // green tint via the background.
                          border: '1.5px solid var(--bone)',
                        }}>
                          <span style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 11, fontWeight: 600,
                            color: 'var(--bone)',
                            flexShrink: 0,
                            // Time text only — no chip outline (the row
                            // wrapper above already has a bone border).
                            padding: '0 4px 0 0',
                            minWidth: 96,
                            whiteSpace: 'nowrap',
                          }}>
                            {formatTime(s.start_time)}{s.end_time ? `–${formatTime(s.end_time)}` : ''}
                          </span>
                          <span style={{
                            fontSize: 12, fontWeight: 600,
                            color: 'var(--bone)', flex: 1, minWidth: 0,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {s.class_name ? titleCase(s.class_name) : DISCIPLINE_LABELS[s.discipline]}
                          </span>
                          <div style={{
                            display: 'flex', gap: 4, flexShrink: 0,
                            alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end',
                          }}>
                            {/* Discipline glyph (JJ etc), KIDS, level, and the
                                verified-source badge intentionally removed —
                                only the OPEN MAT tag stays so the row reads
                                as a clean schedule entry. */}
                            {s.is_open_mat && (
                              <span style={{
                                background: '#D4DDD3', color: '#27402A',
                                fontSize: 9, fontWeight: 700,
                                padding: '2px 6px', borderRadius: 999,
                                letterSpacing: '0.04em',
                              }}>OPEN MAT</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {gym.website && (
              <div style={{ marginTop: 6, paddingTop: 12, borderTop: '1px solid rgba(245,241,232,0.08)' }}>
                <a
                  href={gym.website.startsWith('http') ? gym.website : `https://${gym.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    fontSize: 11, fontWeight: 600,
                    color: 'rgba(245,241,232,0.55)',
                    textDecoration: 'none',
                    fontFamily: "'Inter Tight', sans-serif",
                  }}
                >View on gym website →</a>
              </div>
            )}
          </div>
        </div>
      </div>,
      portalTarget,
    );
  };

  if (compact && !isSelected) {
    const distMi = typeof distanceKm === 'number' ? (useKm ? distanceKm : distanceKm * 0.621371) : null;
    const distLabel = distMi !== null ? `${distMi.toFixed(1)} ${useKm ? 'km' : 'mi'}` : null;

    return (
      <div
        onClick={onClick}
        style={{
          background: bg,
          backdropFilter: 'blur(8px)',
          border: `1.5px solid ${borderCol}`,
          borderRadius: 'var(--radius-md)',
          padding: '6px 9px',
          cursor: 'pointer',
          textAlign: 'left',
          width: '100%',
          boxShadow: 'var(--shadow-sm)',
          transition: 'all 0.15s ease',
          display: 'flex', flexDirection: 'column', gap: 3,
        }}
      >
        {/* Row 1: Name + heart + badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{
            fontFamily: "'Inter Tight', sans-serif",
            fontWeight: 700, fontSize: 11.5, color: nameColor,
            lineHeight: 1.2, flex: 1, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{gym.name}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
            <HeartButton gymId={gym.id} size={14} />
            {isStartingSoon && (
              <span style={{
                background: '#FEF3C7', color: '#92400E',
                fontSize: 8, fontWeight: 800, padding: '1px 4px',
                borderRadius: 'var(--radius-full)', letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
              }}>SOON</span>
            )}
            {hasFree && (
              <span style={{
                background: '#D4DDD3', color: '#27402A',
                fontSize: 8, fontWeight: 800, padding: '1px 4px',
                borderRadius: 'var(--radius-full)', letterSpacing: '0.04em',
              }}>FREE</span>
            )}
            {hasVerifiedMats && (
              <span
                title="Verified open mat — schedule confirmed from the gym's website"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 14, height: 14, borderRadius: '50%',
                  background: '#A8C2A8', color: '#1A1310',
                  fontSize: 9, fontWeight: 900, lineHeight: 1, flexShrink: 0,
                }}
              >✓</span>
            )}
          </div>
        </div>

        {/* Row 2: Location + distance | discipline glyphs */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: muted,
          minWidth: 0,
        }}>
          <span style={{
            flex: 1, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {gym.city}{gym.state ? `, ${gym.state}` : ''}
            {distLabel && <span style={{ opacity: 0.7 }}> · {distLabel}</span>}
            {typeof ratingAvg === 'number' && ratingAvg > 0 && (
              <span style={{ marginLeft: 6, color: '#F59E0B', fontWeight: 700 }}>
                ★{ratingAvg.toFixed(1)}
              </span>
            )}
            {weeklyCheckins > 0 && (
              <span style={{
                marginLeft: 6, color: 'var(--bone)', fontWeight: 700,
                letterSpacing: '0.04em',
              }}>· {weeklyCheckins} TRAINED THIS WEEK</span>
            )}
          </span>
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            {disciplines.slice(0, 3).map((d) => {
              const c = DISCIPLINE_COLORS[d];
              return (
                <span key={d} title={d} style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: c.marker,
                  display: 'inline-block',
                }} />
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────
  // COMPACT-EXPANDED VARIANT — landscape mobile list, selected state.
  // Renders the same two-row header as the compact card plus a slim
  // expansion: up to two schedule rows (or a tight unconfirmed banner)
  // and a Check-in / Help confirm / Claim action row. Total height
  // ≈ 2× the compact card.
  // ────────────────────────────────────────────────────────────────────
  if (compact && isSelected) {
    const distMi = typeof distanceKm === 'number' ? (useKm ? distanceKm : distanceKm * 0.621371) : null;
    const distLabel = distMi !== null ? `${distMi.toFixed(1)} ${useKm ? 'km' : 'mi'}` : null;
    return (
      <div
        onClick={onClick}
        style={{
          background: bg,
          backdropFilter: 'blur(8px)',
          border: `1.5px solid ${borderCol}`,
          borderRadius: 'var(--radius-md)',
          padding: '6px 9px',
          cursor: 'pointer',
          textAlign: 'left',
          width: '100%',
          boxShadow: 'var(--shadow-md)',
          transition: 'all 0.15s ease',
          display: 'flex', flexDirection: 'column', gap: 5,
        }}
      >
        {/* Row 1: name + heart + badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{
            fontFamily: "'Inter Tight', sans-serif",
            fontWeight: 700, fontSize: 12, color: nameColor,
            lineHeight: 1.2, flex: 1, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{gym.name}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
            <HeartButton gymId={gym.id} size={14} />
            {isStartingSoon && (
              <span style={{
                background: '#FEF3C7', color: '#92400E',
                fontSize: 8, fontWeight: 800, padding: '1px 4px',
                borderRadius: 'var(--radius-full)', letterSpacing: '0.04em',
              }}>SOON</span>
            )}
            {hasFree && (
              <span style={{
                background: '#D4DDD3', color: '#27402A',
                fontSize: 8, fontWeight: 800, padding: '1px 4px',
                borderRadius: 'var(--radius-full)', letterSpacing: '0.04em',
              }}>FREE</span>
            )}
          </div>
        </div>

        {/* Row 2: location + distance + disciplines */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: muted,
          minWidth: 0,
        }}>
          <span style={{
            flex: 1, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {gym.city}{gym.state ? `, ${gym.state}` : ''}
            {distLabel && <span style={{ opacity: 0.7 }}> · {distLabel}</span>}
            {weeklyCheckins > 0 && (
              <span style={{
                marginLeft: 6, color: 'var(--bone)', fontWeight: 700,
                letterSpacing: '0.04em',
              }}>· {weeklyCheckins} TRAINED THIS WEEK</span>
            )}
          </span>
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            {disciplines.slice(0, 3).map((d) => {
              const c = DISCIPLINE_COLORS[d];
              return (
                <span key={d} title={d} style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: c.marker,
                  display: 'inline-block',
                }} />
              );
            })}
          </div>
        </div>

        {/* Schedule preview — first verified mat, OR tight unconfirmed
            line. Whole row is clickable when there's a full schedule
            available (replaces the previous "Schedule" action button so
            the action row can stay single-file). */}
        {hasVerifiedMats ? (
          <div
            onClick={(e) => {
              if (gym.schedule && gym.schedule.length > 0) {
                e.stopPropagation();
                setShowFullSchedule(true);
              }
            }}
            style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              color: scheduleText,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              cursor: gym.schedule && gym.schedule.length > 0 ? 'pointer' : 'default',
            }}
          >
            {(() => {
              const o = verifiedMats[0];
              return `${DAY_LABELS[o.day]}  ${formatTime(o.start_time)}–${formatTime(o.end_time)}`;
            })()}
            {verifiedMats.length > 1 && (
              <span style={{ opacity: 0.6 }}> · +{verifiedMats.length - 1} more</span>
            )}
            {gym.schedule && gym.schedule.length > 0 && (
              <span style={{ opacity: 0.6 }}> · view full →</span>
            )}
          </div>
        ) : (
          <div style={{
            fontFamily: "'Inter Tight', sans-serif", fontSize: 10,
            color: muted, fontStyle: 'italic',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {gym.website ? 'Times unconfirmed — visit website' : 'Community-driven · help confirm'}
          </div>
        )}

        {/* Action row — compact landscape only. Five pills total
            (Check In · Help Confirm · Directions · Claim · IG glyph).
            Wraps to a second row on the narrow ~280px landscape list
            column instead of overflowing off-screen. Tighter row gap
            so the wrap is graceful. */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, marginTop: 2,
            flexWrap: 'wrap', rowGap: 4, minWidth: 0,
          }}
        >
          <CheckInButton gymId={gym.id} gymName={gym.name} compact />
          {/* Help Confirm always renders in the footer row, regardless
              of whether the gym has a website or verified mats. */}
          {!correctionSubmitted ? (
            <button
              onClick={(e) => { e.stopPropagation(); setShowCorrectionForm(v => !v); }}
              style={{
                fontSize: 10, fontWeight: 700,
                color: 'var(--bone)', background: 'transparent',
                padding: '3px 8px',
                borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--bone)',
                fontFamily: "'Inter Tight', sans-serif", cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >{showCorrectionForm ? 'Cancel' : 'Help Confirm'}</button>
          ) : (
            // Same pill geometry as Help Confirm so the row's silhouette
            // doesn't shift; reverts back to the button after 4s.
            // Tiny crown badge in the top-right corner.
            <span
              aria-live="polite"
              style={{
                position: 'relative',
                fontSize: 10, fontWeight: 700,
                color: 'var(--bone)', background: 'transparent',
                padding: '3px 8px',
                borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--bone)',
                fontFamily: "'Inter Tight', sans-serif",
                whiteSpace: 'nowrap',
                flexShrink: 0,
                display: 'inline-flex', alignItems: 'center',
              }}
            >
              Thanks!
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  top: -7, right: -7,
                  fontSize: 11, lineHeight: 1,
                  pointerEvents: 'none',
                  transform: 'rotate(15deg)',
                  filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))',
                }}
              >👑</span>
            </span>
          )}
          {/* Claim → Your Gym, same swap as the main row. Compact pill
              size to match neighbours. */}
          {ownsThisGym ? (
            <a
              href={`/owner/${gym.id}`}
              onClick={(e) => e.stopPropagation()}
              title="Manage your gym"
              style={{
                fontSize: 10, fontWeight: 700,
                color: '#FFD23F', textDecoration: 'none',
                padding: '3px 8px', borderRadius: 'var(--radius-md)',
                border: '1.5px solid #FFD23F',
                fontFamily: "'Inter Tight', sans-serif",
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >Your Gym</a>
          ) : (
            <a
              href={`/claim/${gym.id}`}
              onClick={(e) => e.stopPropagation()}
              style={{
                fontSize: 10, fontWeight: 700,
                color: '#FFD23F', textDecoration: 'none',
                padding: '3px 8px', borderRadius: 'var(--radius-md)',
                border: '1.5px solid #FFD23F',
                fontFamily: "'Inter Tight', sans-serif",
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >Claim</a>
          )}

          {/* Get Directions — compact bone-outlined pill, opens Google
              Maps with the gym's lat/lng. Sits next to Instagram. */}
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${gym.lat},${gym.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => { e.stopPropagation(); trackEvent('directions_click', gym.id); }}
            style={{
              fontSize: 10, fontWeight: 700,
              color: 'var(--bone)', background: 'transparent',
              textDecoration: 'none',
              padding: '3px 8px', borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--bone)',
              fontFamily: "'Inter Tight', sans-serif",
              whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >Directions</a>

          {/* Instagram — glyph-only pill, sits inline next to Claim on
              the compact landscape action row. Same single-line layout
              as portrait/desktop, just sized to match the smaller
              compact pills. */}
          {gym.instagram && (() => {
            const igUrl = gym.instagram.startsWith('http')
              ? gym.instagram
              : `https://instagram.com/${gym.instagram.replace(/^@/, '')}`;
            return (
              <a
                href={igUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => { e.stopPropagation(); trackEvent('ig_click', gym.id); }}
                title="Visit on Instagram"
                aria-label="Visit on Instagram"
                style={{
                  color: '#E1306C', textDecoration: 'none',
                  padding: '3px 6px', borderRadius: 'var(--radius-md)',
                  border: '1.5px solid #E1306C',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <svg
                  width="12" height="12" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden
                >
                  <rect x="2" y="2" width="20" height="20" rx="5" />
                  <path d="M16 11.37a4 4 0 1 1-7.92 1.18A4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
              </a>
            );
          })()}

          {/* Phone — bone-outlined glyph pill on the compact landscape
              row. tel: opens the dialer on mobile. */}
          {gym.phone && (
            <a
              href={`tel:${gym.phone.replace(/[^\d+]/g, '')}`}
              onClick={(e) => { e.stopPropagation(); trackEvent('phone_click', gym.id); }}
              title={`Call ${gym.phone}`}
              aria-label={`Call ${gym.phone}`}
              style={{
                color: 'var(--bone)', textDecoration: 'none',
                padding: '3px 6px', borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--bone)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </a>
          )}
        </div>

        {/* Full Schedule + Visit Website row — landscape compact-expanded.
            Visit Website is suppressed here when the unconfirmed banner
            above already hosts one (no verified mats + website case),
            so the same gym never shows two Visit Website buttons. */}
        {((gym.schedule && gym.schedule.length > 0) || (gym.website && hasVerifiedMats)) && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap' }}
          >
            {gym.schedule && gym.schedule.length > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowFullSchedule(true); }}
                style={{
                  fontSize: 10, fontWeight: 700,
                  color: 'var(--bone)', background: 'transparent',
                  padding: '3px 8px', borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--bone)',
                  fontFamily: "'Inter Tight', sans-serif", cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >Full Schedule</button>
            )}
            {gym.website && hasVerifiedMats && (
              <a
                href={gym.website.startsWith('http') ? gym.website : `https://${gym.website}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  fontSize: 10, fontWeight: 700,
                  color: 'var(--bone)', textDecoration: 'none',
                  padding: '3px 8px', borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--bone)',
                  fontFamily: "'Inter Tight', sans-serif",
                  whiteSpace: 'nowrap',
                }}
              >Visit Website</a>
            )}
          </div>
        )}

        {/* Inline correction form (compact-expanded view). Full layout
            isn't rendered here, so the form lives directly under the
            action row when Help confirm is tapped. */}
        {showCorrectionForm && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              padding: '8px 10px', marginTop: 4,
              background: 'rgba(245,241,232,0.04)',
              border: '1px solid rgba(245,241,232,0.18)',
              borderRadius: 'var(--radius-md)',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}
          >
            <textarea
              value={correctionField}
              onChange={(e) => setCorrectionField(e.target.value)}
              placeholder="What needs correcting?"
              rows={2}
              style={{
                padding: '6px 8px', borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(245,241,232,0.20)',
                background: 'rgba(0,0,0,0.20)',
                color: 'var(--bone)', fontSize: 12, resize: 'vertical',
                fontFamily: "'Inter Tight', sans-serif", outline: 'none',
              }}
            />
            <input
              type="text"
              value={correctionValue}
              onChange={(e) => setCorrectionValue(e.target.value)}
              placeholder="Correct value"
              style={{
                padding: '6px 8px', borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(245,241,232,0.20)',
                background: 'rgba(0,0,0,0.20)',
                color: 'var(--bone)', fontSize: 12,
                fontFamily: "'Inter Tight', sans-serif", outline: 'none',
              }}
            />
            {/* Optional Instagram input — same submission flow as the
                main form. Sent as a separate `field: 'instagram'` record. */}
            <input
              type="text"
              value={correctionInstagram}
              onChange={(e) => setCorrectionInstagram(e.target.value)}
              placeholder={gym.instagram ? `Instagram (${gym.instagram})` : 'Instagram (optional) — @handle'}
              style={{
                padding: '6px 8px', borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(245,241,232,0.20)',
                background: 'rgba(0,0,0,0.20)',
                color: 'var(--bone)', fontSize: 12,
                fontFamily: "'Inter Tight', sans-serif", outline: 'none',
              }}
            />
            <button
              onClick={submitCorrection}
              disabled={
                !correctionField.trim() ||
                (!correctionValue.trim() && !correctionInstagram.trim()) ||
                correctionSubmitting
              }
              style={{
                padding: '5px 12px', borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--bone)',
                background: 'transparent', color: 'var(--bone)',
                fontSize: 11, fontWeight: 700,
                cursor: correctionSubmitting ? 'wait' : 'pointer',
                fontFamily: "'Inter Tight', sans-serif",
                alignSelf: 'flex-start',
                opacity:
                  !correctionField.trim() ||
                  (!correctionValue.trim() && !correctionInstagram.trim())
                    ? 0.5 : 1,
              }}
            >{correctionSubmitting ? 'Sending…' : 'Submit'}</button>
          </div>
        )}

        {/* Full-schedule modal — renders even from compact-expanded card. */}
        {renderFullScheduleModal()}
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      style={{
        background: bg,
        backdropFilter: 'blur(8px)',
        border: `1.5px solid ${borderCol}`,
        borderRadius: 'var(--radius-lg)',
        padding: isMobile ? '9px 11px' : '14px 16px',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        boxShadow: isSelected ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Name row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <span style={{
          fontFamily: "'Inter Tight', sans-serif",
          fontWeight: 700,
          fontSize: isMobile ? 12 : 14,
          color: nameColor,
          lineHeight: 1.3,
        }}>
          {gym.name}
          {typeof ratingAvg === 'number' && ratingAvg > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              marginLeft: 6, padding: '1px 6px',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(245,158,11,0.15)',
              color: '#F59E0B',
              fontSize: 10, fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace",
              verticalAlign: 'middle',
            }}>
              <span style={{ fontSize: 10, lineHeight: 1 }}>★</span>
              {ratingAvg.toFixed(1)}
              {typeof ratingCount === 'number' && ratingCount > 0 && (
                <span style={{ color: 'rgba(245,241,232,0.55)', fontWeight: 600 }}>({ratingCount})</span>
              )}
            </span>
          )}
        </span>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', paddingRight: mapOverlay ? 28 : 0 }}>
          <HeartButton gymId={gym.id} size={isMobile ? 18 : 20} />
          {isStartingSoon && (
            <span style={{
              background: '#FEF3C7', color: '#92400E',
              fontSize: 10, fontWeight: 700, padding: '2px 7px',
              borderRadius: 'var(--radius-full)',
              letterSpacing: '0.05em',
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#D97706', display: 'inline-block' }} />
              STARTING SOON
            </span>
          )}
          {hasFree && (
            <span style={{
              background: '#D4DDD3', color: '#27402A',
              fontSize: 10, fontWeight: 700, padding: '2px 7px',
              borderRadius: 'var(--radius-full)',
              letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>FREE</span>
          )}
          {hasVerifiedMats && (
            <span
              title="Verified open mat — schedule confirmed from the gym's website"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 18, height: 18, borderRadius: '50%',
                background: '#A8C2A8', color: '#1A1310',
                fontSize: 11, fontWeight: 900, lineHeight: 1, flexShrink: 0,
              }}
            >✓</span>
          )}
        </div>
      </div>

      {/* Location + distance */}
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11, color: muted,
        marginTop: 3, marginBottom: 7,
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px 6px',
      }}>
        {/* Location — informational only, not clickable. Bone color
            so it reads as plain text against the dark card. */}
        <span style={{ color: 'var(--bone)' }}>
          {gym.city}{gym.state ? `, ${gym.state}` : ''}
        </span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span style={{ color: 'var(--bone)' }}>{gym.country}</span>
        {typeof distanceKm === 'number' && (
          <>
            <span style={{ opacity: 0.4 }}>·</span>
            <span style={{ color: 'rgba(245,241,232,0.80)', fontWeight: 600 }}>
              {useKm
                ? (distanceKm < 1 ? `${Math.round(distanceKm * 1000)}m` : `${distanceKm.toFixed(1)} km`)
                : (distanceKm * 0.621371 < 0.1 ? `${Math.round(distanceKm * 1000 * 3.28084)} ft` : `${(distanceKm * 0.621371).toFixed(1)} mi`)}
            </span>
          </>
        )}
        {/* "Verified today" tooltip intentionally removed. */}
        {weeklyCheckins > 0 && (
          <>
            <span style={{ opacity: 0.4 }}>·</span>
            <span style={{
              color: 'var(--bone)', fontWeight: 700, letterSpacing: '0.04em',
            }}>{weeklyCheckins} TRAINED THIS WEEK</span>
          </>
        )}
      </div>

      {/* Discipline chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
        {disciplines.map((d) => {
          const c = DISCIPLINE_COLORS[d];
          const chipBg = c.bg;
          const chipColor = c.text;
          return (
            <span key={d} style={{
              background: chipBg, color: chipColor,
              fontSize: 11, fontWeight: 600,
              padding: '2px 8px', borderRadius: 'var(--radius-full)',
            }}>
              {DISCIPLINE_LABELS[d]}
            </span>
          );
        })}
      </div>

      {/* Collapsed-card "Visit Website →" link removed — Visit Website
          lives in the unconfirmed banner and beside Full Schedule when
          the card is expanded. */}

      {/* Open mat schedule — only show verified times; unverified shows
          a community-help button that opens the correction form below. */}
      {!hasVerifiedMats ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 10px', borderRadius: 'var(--radius-md)',
          background: 'rgba(245,241,232,0.05)',
          border: '1px dashed rgba(245,241,232,0.18)',
          marginBottom: 2,
        }}>
          <span style={{ fontSize: 12, color: muted, fontStyle: 'italic', flex: 1, lineHeight: 1.4 }}>
            {gym.website ? 'Open mat times unconfirmed' : 'Community-driven'}
          </span>
          {gym.website && (
            <a
              href={gym.website.startsWith('http') ? gym.website : `https://${gym.website}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                fontSize: 11, fontWeight: 700,
                color: 'var(--bone)', textDecoration: 'none',
                padding: '3px 10px', borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--bone)',
                fontFamily: "'Inter Tight', sans-serif",
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              Visit Website
            </a>
          )}
          {/* Banner Help Confirm removed — Help Confirm is now always
              available in the action row when the card is expanded. */}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {verifiedMats.slice(0, 2).map((o) => (
            <div key={o.id} style={{
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, flexWrap: 'wrap',
            }}>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 600, color: muted,
                width: 28, flexShrink: 0, fontSize: 11,
              }}>
                {DAY_LABELS[o.day]}
              </span>
              <span style={{ color: scheduleText, fontWeight: 500 }}>
                {formatTime(o.start_time)}–{formatTime(o.end_time)}
              </span>
              <span style={{
                background: '#D4DDD3', color: '#27402A',
                fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 999,
                letterSpacing: '0.04em',
              }}>OPEN MAT</span>
              {/* Inline verified badge removed — the small ✓ in the top-right
                  of the card is the canonical verified indicator now. */}
              <span style={{ fontSize: 11, marginLeft: 'auto' }}>
                {o.is_free ? (
                  <span style={{ color: isSelected ? '#5E8B5E' : '#A8C2A8', fontWeight: 600 }}>Free</span>
                ) : (
                  <span style={{ color: muted }}>${o.cost}</span>
                )}
              </span>
            </div>
          ))}
          {verifiedMats.length > 2 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowFullSchedule(true); }}
              style={{
                marginTop: 4, background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 11, color: 'var(--accent)', fontFamily: "'Inter Tight', sans-serif",
                padding: '2px 0', textAlign: 'left',
              }}
            >
              +{verifiedMats.length - 2} more open mats ▾
            </button>
          )}
        </div>
      )}

      {/* Full Schedule + Visit Website + (popup overlay only) Directions
          + Instagram. Single row that always renders when the popup
          overlay is in use (so Directions / IG have a home there) OR
          when there's at least one schedule / website link to show.
          Visit Website is suppressed when the unconfirmed-schedule
          banner above already hosts one. */}
      {isSelected && (
        mapOverlay ||
        (gym.schedule && gym.schedule.length > 0) ||
        (gym.website && hasVerifiedMats)
      ) && (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {gym.schedule && gym.schedule.length > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowFullSchedule(true); }}
              style={{
                padding: '5px 12px', borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--bone)',
                background: 'transparent', color: 'var(--bone)',
                fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: "'Inter Tight', sans-serif",
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              Full Schedule
            </button>
          )}
          {gym.website && hasVerifiedMats && (
            <a
              href={gym.website.startsWith('http') ? gym.website : `https://${gym.website}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                padding: '5px 12px', borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--bone)',
                background: 'transparent', color: 'var(--bone)',
                fontSize: 12, fontWeight: 700,
                fontFamily: "'Inter Tight', sans-serif",
                textDecoration: 'none', whiteSpace: 'nowrap',
                display: 'inline-flex', alignItems: 'center',
              }}
            >
              Visit Website
            </a>
          )}

          {/* Desktop popup overlay only — Directions + Instagram move here
              from the action row above so the action row stays compact
              (Check In · Help Confirm · Claim). List cards keep
              Directions + IG in the action row. */}
          {mapOverlay && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${gym.lat},${gym.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => { e.stopPropagation(); trackEvent('directions_click', gym.id); }}
              style={{
                padding: '5px 12px', borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--bone)',
                background: 'transparent', color: 'var(--bone)',
                fontSize: 12, fontWeight: 700,
                fontFamily: "'Inter Tight', sans-serif",
                textDecoration: 'none', whiteSpace: 'nowrap',
                display: 'inline-flex', alignItems: 'center',
              }}
            >
              Directions
            </a>
          )}
          {mapOverlay && gym.instagram && (() => {
            const igUrl = gym.instagram.startsWith('http')
              ? gym.instagram
              : `https://instagram.com/${gym.instagram.replace(/^@/, '')}`;
            return (
              <a
                href={igUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => { e.stopPropagation(); trackEvent('ig_click', gym.id); }}
                title="Visit on Instagram"
                aria-label="Visit on Instagram"
                style={{
                  color: '#E1306C', textDecoration: 'none',
                  padding: '5px 10px', borderRadius: 'var(--radius-md)',
                  border: '1.5px solid #E1306C',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <svg
                  width="14" height="14" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden
                >
                  <rect x="2" y="2" width="20" height="20" rx="5" />
                  <path d="M16 11.37a4 4 0 1 1-7.92 1.18A4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
              </a>
            );
          })()}
        </div>
      )}

      {/* Full-schedule modal — shared with the compact-expanded variant. */}
      {renderFullScheduleModal()}

      {/* Use-case tags — only on selected cards; loaner gi only for gi-related disciplines */}
      {isSelected && (gym.loaner_gi || gym.free_for_visitors) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: isMobile ? 4 : 6, marginBottom: isMobile ? 2 : 4 }}>
          {gym.loaner_gi && disciplines.some(d => d === 'bjj' || d === 'gi_bjj') && (
            <span style={{
              background: '#DBEAFE', color: '#1E3A5F',
              fontSize: 10, fontWeight: 600, padding: '2px 7px',
              borderRadius: 'var(--radius-full)',
            }}>Loaner gi</span>
          )}
          {gym.free_for_visitors && (
            <span style={{
              background: '#D4DDD3', color: '#27402A',
              fontSize: 10, fontWeight: 600, padding: '2px 7px',
              borderRadius: 'var(--radius-full)',
            }}>Free for visitors</span>
          )}
        </div>
      )}

      {/* Action row — only visible when expanded/selected.
          Footer with up to five pills: Check In · Help Confirm ·
          Directions · Claim · Instagram. Wraps to a second row when
          the container is too narrow (e.g. desktop list cards) but
          stays single-line on the wider popup overlay card. */}
      {isSelected && (
        <div style={{ marginTop: isMobile ? 8 : 12, paddingTop: isMobile ? 7 : 10, borderTop: '1px solid rgba(245,241,232,0.20)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            flexWrap: 'wrap', minWidth: 0, rowGap: 6,
          }}>
            {/* Check-in — squared, medium size (matches Help confirm + Claim) */}
            <CheckInButton gymId={gym.id} gymName={gym.name} />

            {/* Help Confirm — always renders in the action row regardless
                of website / verified-mats status. The unconfirmed banner
                above no longer hosts its own Help Confirm button. */}
            {!correctionSubmitted ? (
              <button
                onClick={(e) => { e.stopPropagation(); setShowCorrectionForm(v => !v); }}
                style={{
                  fontSize: 11, fontWeight: 700,
                  color: 'var(--bone)', background: 'transparent',
                  padding: '4px 10px', borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--bone)',
                  fontFamily: "'Inter Tight', sans-serif", cursor: 'pointer',
                  whiteSpace: 'nowrap', textAlign: 'center',
                  flexShrink: 0,
                }}
              >
                {showCorrectionForm ? 'Cancel' : 'Help Confirm'}
              </button>
            ) : (
              // Same pill geometry as the Help Confirm button so the
              // row's silhouette doesn't shift when the state flips.
              // Auto-reverts back to the Help Confirm pill after 4s
              // (see submitCorrection). Tiny crown badge in the
              // top-right corner makes the celebration feel earned.
              <span
                aria-live="polite"
                style={{
                  position: 'relative',
                  fontSize: 11, fontWeight: 700,
                  color: 'var(--bone)', background: 'transparent',
                  padding: '4px 10px', borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--bone)',
                  fontFamily: "'Inter Tight', sans-serif",
                  whiteSpace: 'nowrap', textAlign: 'center',
                  flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center',
                }}
              >
                Thanks!
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    top: -8, right: -8,
                    fontSize: 12, lineHeight: 1,
                    pointerEvents: 'none',
                    transform: 'rotate(15deg)',
                    filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))',
                  }}
                >👑</span>
              </span>
            )}

            {/* Claim → Your Gym. When the current user is a verified
                owner of this gym we swap the Claim pill for a "Your Gym"
                pill that links to the owner portal instead of the claim
                flow. Same gold styling so the row's silhouette doesn't
                change. */}
            {ownsThisGym ? (
              <a
                href={`/owner/${gym.id}`}
                onClick={(e) => e.stopPropagation()}
                title="Manage your gym"
                style={{
                  fontSize: 11, fontWeight: 700,
                  color: '#FFD23F', textDecoration: 'none',
                  padding: '4px 10px', borderRadius: 'var(--radius-md)',
                  border: '1.5px solid #FFD23F',
                  fontFamily: "'Inter Tight', sans-serif",
                  whiteSpace: 'nowrap', textAlign: 'center',
                  display: 'inline-block', flexShrink: 0,
                }}
              >Your Gym</a>
            ) : (
              <a
                href={`/claim/${gym.id}`}
                onClick={(e) => e.stopPropagation()}
                style={{
                  fontSize: 11, fontWeight: 700,
                  color: '#FFD23F', textDecoration: 'none',
                  padding: '4px 10px', borderRadius: 'var(--radius-md)',
                  border: '1.5px solid #FFD23F',
                  fontFamily: "'Inter Tight', sans-serif",
                  whiteSpace: 'nowrap', textAlign: 'center',
                  display: 'inline-block', flexShrink: 0,
                }}
              >Claim</a>
            )}

            {/* Get Directions — bone-outlined, opens Google Maps with
                the gym's lat/lng as the destination.
                NOTE: on the desktop popup overlay (mapOverlay=true) we
                render Directions + Instagram in the bottom row beside
                Full Schedule / Visit Website instead — see below. */}
            {!mapOverlay && (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${gym.lat},${gym.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => { e.stopPropagation(); trackEvent('directions_click', gym.id); }}
                style={{
                  fontSize: 11, fontWeight: 700,
                  color: 'var(--bone)', background: 'transparent',
                  padding: '4px 10px', borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--bone)',
                  fontFamily: "'Inter Tight', sans-serif",
                  whiteSpace: 'nowrap', textAlign: 'center',
                  textDecoration: 'none',
                  display: 'inline-block', flexShrink: 0,
                }}
              >
                Directions
              </a>
            )}

            {/* Instagram — pink glyph. Same conditional as Directions:
                hidden in the action row when on the desktop popup
                overlay (rendered in the bottom row there instead). */}
            {!mapOverlay && gym.instagram && (() => {
              const igUrl = gym.instagram.startsWith('http')
                ? gym.instagram
                : `https://instagram.com/${gym.instagram.replace(/^@/, '')}`;
              return (
                <a
                  href={igUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => { e.stopPropagation(); trackEvent('ig_click', gym.id); }}
                  title="Visit on Instagram"
                  aria-label="Visit on Instagram"
                  style={{
                    color: '#E1306C', textDecoration: 'none',
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-md)',
                    border: '1.5px solid #E1306C',
                    whiteSpace: 'nowrap', textAlign: 'center',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <svg
                    width="14" height="14" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden
                  >
                    <rect x="2" y="2" width="20" height="20" rx="5" />
                    <path d="M16 11.37a4 4 0 1 1-7.92 1.18A4 4 0 0 1 16 11.37z" />
                    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                  </svg>
                </a>
              );
            })()}

            {/* Phone — bone-outlined glyph pill. Tel: opens dialer.
                List cards / portrait: sits next to Instagram on the right.
                Popup overlay (mapOverlay=true): sits next to Claim
                instead, since Directions + Instagram move down to the
                Full Schedule row in that variant. */}
            {gym.phone && (
              <a
                href={`tel:${gym.phone.replace(/[^\d+]/g, '')}`}
                onClick={(e) => { e.stopPropagation(); trackEvent('phone_click', gym.id); }}
                title={`Call ${gym.phone}`}
                aria-label={`Call ${gym.phone}`}
                style={{
                  color: 'var(--bone)', textDecoration: 'none',
                  padding: '4px 8px', borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--bone)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </a>
            )}
          </div>

          {showCorrectionForm && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                marginTop: isMobile ? 8 : 10,
                padding: isMobile ? '10px 12px' : '14px 16px',
                background: 'rgba(245,241,232,0.04)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(245,241,232,0.18)',
                display: 'flex', flexDirection: 'column', gap: 10,
              }}
            >
              {/* Description — what needs correcting */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                  textTransform: 'uppercase', color: 'rgba(245,241,232,0.55)',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>What needs correcting?</span>
                <textarea
                  value={correctionField}
                  onChange={(e) => setCorrectionField(e.target.value)}
                  placeholder="e.g. The Saturday open mat is at 11am, not 10am"
                  rows={2}
                  style={{
                    padding: '8px 10px', borderRadius: 'var(--radius-md)',
                    border: '1px solid rgba(245,241,232,0.20)',
                    background: 'rgba(0,0,0,0.20)',
                    color: 'var(--bone)', fontSize: 13, resize: 'vertical',
                    fontFamily: "'Inter Tight', sans-serif", outline: 'none',
                  }}
                />
              </label>

              {/* Correct value — required UNLESS the user is only
                  submitting an Instagram update via the field below. */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                  textTransform: 'uppercase', color: 'rgba(245,241,232,0.55)',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>Correct value <span style={{ opacity: 0.6, fontWeight: 500 }}>(skip if you&rsquo;re only adding Instagram below)</span></span>
                <input
                  type="text"
                  value={correctionValue}
                  onChange={(e) => setCorrectionValue(e.target.value)}
                  placeholder="e.g. Saturday 11am–12:30pm · $15"
                  style={{
                    padding: '8px 10px', borderRadius: 'var(--radius-md)',
                    border: '1px solid rgba(245,241,232,0.20)',
                    background: 'rgba(0,0,0,0.20)',
                    color: 'var(--bone)', fontSize: 13,
                    fontFamily: "'Inter Tight', sans-serif", outline: 'none',
                  }}
                />
              </label>

              {/* Instagram — optional; lets contributors suggest a missing
                  Instagram handle/URL even when their main correction is
                  about something else. Bone outline + bone label, no
                  pink emphasis here (the card button is pink — the form
                  is intentionally low-key). */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                  textTransform: 'uppercase', color: 'rgba(245,241,232,0.55)',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>Instagram <span style={{ opacity: 0.6, fontWeight: 500 }}>(optional)</span></span>
                <input
                  type="text"
                  value={correctionInstagram}
                  onChange={(e) => setCorrectionInstagram(e.target.value)}
                  placeholder={gym.instagram ? gym.instagram : '@gymhandle or full URL'}
                  style={{
                    padding: '8px 10px', borderRadius: 'var(--radius-md)',
                    border: '1px solid rgba(245,241,232,0.20)',
                    background: 'rgba(0,0,0,0.20)',
                    color: 'var(--bone)', fontSize: 13,
                    fontFamily: "'Inter Tight', sans-serif", outline: 'none',
                  }}
                />
              </label>

              {/* Notes */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                  textTransform: 'uppercase', color: 'rgba(245,241,232,0.55)',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>Notes <span style={{ opacity: 0.6, fontWeight: 500 }}>(optional)</span></span>
                <textarea
                  value={correctionNotes}
                  onChange={(e) => setCorrectionNotes(e.target.value)}
                  placeholder="Anything else we should know?"
                  rows={2}
                  style={{
                    padding: '8px 10px', borderRadius: 'var(--radius-md)',
                    border: '1px solid rgba(245,241,232,0.20)',
                    background: 'rgba(0,0,0,0.20)',
                    color: 'var(--bone)', fontSize: 13, resize: 'vertical',
                    fontFamily: "'Inter Tight', sans-serif", outline: 'none',
                  }}
                />
              </label>

              <button
                onClick={submitCorrection}
                disabled={
                  !correctionField.trim() ||
                  (!correctionValue.trim() && !correctionInstagram.trim()) ||
                  correctionSubmitting
                }
                style={{
                  padding: '8px 16px', borderRadius: 'var(--radius-full)',
                  border: '1.5px solid var(--bone)',
                  background: 'transparent', color: 'var(--bone)',
                  fontSize: 13, fontWeight: 700,
                  cursor: correctionSubmitting ? 'wait' : 'pointer',
                  fontFamily: "'Inter Tight', sans-serif",
                  alignSelf: 'flex-start',
                  opacity:
                    !correctionField.trim() ||
                    (!correctionValue.trim() && !correctionInstagram.trim())
                      ? 0.5 : 1,
                }}
              >
                {correctionSubmitting ? 'Sending…' : 'Submit correction'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Star rating — only when expanded (not in list mode) */}
      {isSelected && (
        <StarRating gymId={gym.id} isSelected={isSelected} isMobile={isMobile} onRated={onRated} />
      )}
    </div>
  );
}
