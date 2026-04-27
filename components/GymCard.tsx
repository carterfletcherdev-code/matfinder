'use client';

import { useState } from 'react';
import { Gym, DISCIPLINE_LABELS, DISCIPLINE_COLORS, DAY_LABELS, Discipline } from '@/lib/types';
import { formatTime } from '@/lib/utils';
import StarRating from './StarRating';
import HeartButton from './HeartButton';
import CheckInButton from './CheckInButton';
import VerifiedBadge from './VerifiedBadge';

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
  onClick: () => void;
  distanceKm?: number;
  useKm?: boolean;
  isStartingSoon?: boolean;
  ratingAvg?: number | null;
  ratingCount?: number;
  onRated?: () => void;
  onCityClick?: (cityQuery: string) => void;
}

export default function GymCard({ gym, isSelected, isMobile, mapOverlay, onClick, distanceKm, useKm = true, isStartingSoon, ratingAvg, ratingCount, onRated, onCityClick }: GymCardProps) {
  const disciplines = [...new Set(gym.open_mats.map((o) => o.discipline))];
  const hasFree = gym.open_mats.some((o) => o.is_free);
  // A gym is "confirmed" only if every open_mat entry is confirmed
  const fullyConfirmed = gym.open_mats.every((o) => o.confirmed === true);
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
  const [correctionSubmitted, setCorrectionSubmitted] = useState(false);
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false);
  const [showFullSchedule, setShowFullSchedule] = useState(false);

  async function submitCorrection() {
    if (!correctionField || !correctionValue.trim()) return;
    setCorrectionSubmitting(true);
    try {
      await fetch('/api/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gym_id: gym.id,
          gym_name: gym.name,
          gym_city: gym.city,
          field: correctionField,
          current_val: correctionField === 'discipline' ? gym.open_mats[0]?.discipline : '',
          correct_val: correctionValue.trim(),
          notes: correctionNotes.trim() || null,
        }),
      });
      setCorrectionSubmitted(true);
      setShowCorrectionForm(false);
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
          <HeartButton gymId={gym.id} size={isMobile ? 14 : 16} />
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
          {fullyConfirmed && (
            <span title="Discipline verified" style={{
              background: '#D4DDD3', color: '#27402A',
              fontSize: 10, fontWeight: 700, padding: '2px 7px',
              borderRadius: 'var(--radius-full)',
            }}>✓</span>
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
        {/* City — clickable if handler provided */}
        {onCityClick && (gym.city || gym.state) ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCityClick(`${gym.city}${gym.state ? `, ${gym.state}` : ''}`); }}
            title="Search from this city"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0, margin: 0,
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
              color: 'rgba(245,241,232,0.65)',
              textDecoration: 'underline dotted rgba(245,241,232,0.35)',
              textUnderlineOffset: 2,
            }}
          >{gym.city}{gym.state ? `, ${gym.state}` : ''}</button>
        ) : (
          <span>{gym.city}{gym.state ? `, ${gym.state}` : ''}</span>
        )}
        <span style={{ opacity: 0.4 }}>·</span>
        {onCityClick && gym.country ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCityClick(gym.country); }}
            title="Search from this country"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0, margin: 0,
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
              color: 'rgba(245,241,232,0.65)',
              textDecoration: 'underline dotted rgba(245,241,232,0.35)',
              textUnderlineOffset: 2,
            }}
          >{gym.country}</button>
        ) : (
          <span>{gym.country}</span>
        )}
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
        {verifiedAgo && (
          <>
            <span style={{ opacity: 0.4 }}>·</span>
            <VerifiedTooltip verifiedAgo={verifiedAgo} lastVerifiedAt={lastVerifiedAt} />
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

      {/* "BJJ unconfirmed" disclosure when this is a bjj-unknown gym */}
      {hasUnknownBjj && (
        <div style={{
          fontFamily: "'Inter Tight', sans-serif",
          fontSize: 11, fontStyle: 'italic',
          color: muted,
          marginBottom: 8, lineHeight: 1.4,
        }}>
          Gi/No-Gi unconfirmed{gym.website ? ' — visit site to verify' : ''}
        </div>
      )}

      {/* Website link on collapsed card */}
      {!isSelected && gym.website && (
        <a
          href={gym.website.startsWith('http') ? gym.website : `https://${gym.website}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'inline-block', marginBottom: 8,
            fontSize: 11, fontWeight: 600,
            color: 'rgba(245,241,232,0.85)',
            textDecoration: 'none',
            fontFamily: "'Inter Tight', sans-serif",
          }}
        >
          Visit website →
        </a>
      )}

      {/* Open mats only — default schedule view, with explicit OPEN MAT badge */}
      {gym.open_mats.length === 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 10px', borderRadius: 'var(--radius-md)',
          background: 'rgba(245,241,232,0.05)',
          border: '1px dashed rgba(245,241,232,0.18)',
        }}>
          <span style={{ fontSize: 13 }}>🕐</span>
          <span style={{ fontSize: 12, color: muted, fontStyle: 'italic' }}>
            Schedule not verified yet
          </span>
          {gym.website && (
            <a
              href={gym.website}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
            >
              Visit website →
            </a>
          )}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {(showFullSchedule || gym.open_mats.length <= 2 ? gym.open_mats : gym.open_mats.slice(0, 2)).map((o) => (
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
            {isSelected && o.verified && o.source_quote && (
              <VerifiedBadge sourceUrl={o.source_url} sourceQuote={o.source_quote} verifiedAt={o.verified_at} />
            )}
            <span style={{ fontSize: 11, marginLeft: 'auto' }}>
              {o.is_free ? (
                <span style={{ color: isSelected ? '#5E8B5E' : '#A8C2A8', fontWeight: 600 }}>Free</span>
              ) : (
                <span style={{ color: muted }}>${o.cost}</span>
              )}
            </span>
          </div>
        ))}
        {gym.open_mats.length > 2 && !showFullSchedule && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowFullSchedule(true); }}
            style={{
              marginTop: 4, background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, color: 'var(--accent)', fontFamily: "'Inter Tight', sans-serif",
              padding: '2px 0', textAlign: 'left',
            }}
          >
            +{gym.open_mats.length - 2} more open mats ▾
          </button>
        )}
      </div>

      {/* "View full schedule" button — opens centered modal */}
      {isSelected && gym.schedule && gym.schedule.length > gym.open_mats.length && (
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowFullSchedule(true); }}
            style={{
              padding: '4px 10px', borderRadius: 'var(--radius-md)',
              border: '1.5px solid rgba(245,241,232,0.30)',
              background: 'transparent', color: 'rgba(245,241,232,0.85)',
              fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: "'Inter Tight', sans-serif",
            }}
          >
            View full schedule ({gym.schedule.length} classes) →
          </button>
        </div>
      )}

      {/* Full-schedule modal — centered, 50% black backdrop */}
      {showFullSchedule && gym.schedule && (
        <div
          onClick={(e) => { e.stopPropagation(); setShowFullSchedule(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1100,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(40,28,20,0.98)', backdropFilter: 'blur(8px)',
              border: '1px solid rgba(245,241,232,0.20)',
              borderRadius: 'var(--radius-lg)',
              width: '100%', maxWidth: 480, maxHeight: '85vh',
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              color: 'var(--bone)',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', borderBottom: '1px solid rgba(245,241,232,0.15)',
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Inter Tight', sans-serif" }}>{gym.name}</div>
                <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>Full weekly schedule · {gym.schedule.length} classes</div>
              </div>
              <button
                onClick={() => setShowFullSchedule(false)}
                style={{
                  background: 'transparent', border: 'none', color: 'var(--bone)',
                  fontSize: 22, lineHeight: 1, cursor: 'pointer', padding: '0 4px',
                }}
              >×</button>
            </div>
            <div style={{ overflowY: 'auto', padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {gym.schedule.map((s, i) => {
                const c = DISCIPLINE_COLORS[s.discipline];
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, flexWrap: 'wrap',
                    padding: '4px 0', borderBottom: i < gym.schedule!.length - 1 ? '1px dashed rgba(245,241,232,0.10)' : 'none',
                  }}>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: 600, color: muted, width: 32, flexShrink: 0, fontSize: 11,
                    }}>{DAY_LABELS[s.day]}</span>
                    <span style={{ color: scheduleText, fontWeight: 500, fontSize: 12 }}>
                      {formatTime(s.start_time)}{s.end_time ? `–${formatTime(s.end_time)}` : ''}
                    </span>
                    <span style={{
                      background: c.bg, color: c.text,
                      fontSize: 10, fontWeight: 600,
                      padding: '1px 7px', borderRadius: 999,
                    }}>{s.class_name || DISCIPLINE_LABELS[s.discipline]}</span>
                    {s.is_open_mat && (
                      <span style={{
                        background: '#D4DDD3', color: '#27402A',
                        fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 999,
                      }}>OPEN MAT</span>
                    )}
                    {s.is_kids && (
                      <span style={{
                        background: 'rgba(245,241,232,0.12)', color: muted,
                        fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 999,
                      }}>kids</span>
                    )}
                    {s.verified && s.source_quote && (
                      <VerifiedBadge sourceUrl={s.source_url} sourceQuote={s.source_quote} verifiedAt={s.verified_at} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

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

      {/* Action row — only visible when expanded/selected */}
      {isSelected && (
        <div style={{ marginTop: isMobile ? 8 : 12, paddingTop: isMobile ? 7 : 10, borderTop: '1px solid rgba(245,241,232,0.20)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* PRIMARY: Check-in first */}
            <CheckInButton gymId={gym.id} gymName={gym.name} />

            {/* Website link */}
            {gym.website && (
              <a
                href={gym.website.startsWith('http') ? gym.website : `https://${gym.website}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  fontSize: 12, fontWeight: 600,
                  color: 'var(--bone)', textDecoration: 'none',
                  padding: '4px 10px', borderRadius: 'var(--radius-md)',
                  background: 'transparent',
                  border: '1.5px solid var(--bone)',
                  fontFamily: "'Inter Tight', sans-serif",
                  whiteSpace: 'nowrap',
                }}
              >
                Website →
              </a>
            )}

            {/* Far right: Report + Claim stacked small */}
            <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
              {!correctionSubmitted ? (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowCorrectionForm(v => !v); }}
                  style={{
                    fontSize: 10, fontWeight: 600,
                    color: 'rgba(245,241,232,0.50)', background: 'transparent',
                    padding: '2px 7px', borderRadius: 'var(--radius-md)',
                    border: '1px solid rgba(245,241,232,0.20)',
                    fontFamily: "'Inter Tight', sans-serif", cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {showCorrectionForm ? 'Cancel' : 'Report'}
                </button>
              ) : (
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Thanks!
                </span>
              )}
              <a
                href={`/claim/${gym.id}`}
                onClick={(e) => e.stopPropagation()}
                style={{
                  fontSize: 10, fontWeight: 600,
                  color: '#C4973A', textDecoration: 'none',
                  padding: '2px 7px', borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(196,151,58,0.35)',
                  fontFamily: "'Inter Tight', sans-serif",
                  whiteSpace: 'nowrap',
                }}
              >
                ★ Claim
              </a>
            </div>
          </div>

          {showCorrectionForm && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                marginTop: isMobile ? 7 : 10, padding: isMobile ? '8px 10px' : '12px 14px',
                background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--brown-100)',
                display: 'flex', flexDirection: 'column', gap: 8,
              }}
            >
              <select
                value={correctionField}
                onChange={(e) => setCorrectionField(e.target.value)}
                style={{
                  padding: '5px 8px', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)', background: 'var(--surface-raised)',
                  color: 'var(--text-primary)', fontSize: 12,
                  fontFamily: "'Inter Tight', sans-serif",
                }}
              >
                <option value="">What needs correcting?</option>
                <option value="discipline">Gi vs No-Gi classification</option>
                <option value="day">Wrong day</option>
                <option value="time">Wrong time</option>
                <option value="cost">Wrong cost</option>
                <option value="website">Wrong website</option>
                <option value="name">Wrong gym name</option>
                <option value="closed">Gym is permanently closed</option>
                <option value="other">Other</option>
              </select>
              <input
                type="text"
                value={correctionValue}
                onChange={(e) => setCorrectionValue(e.target.value)}
                placeholder="Correct value (e.g. 'Gi BJJ', 'Saturday 10am', '$20')"
                style={{
                  padding: '5px 8px', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)', background: 'var(--surface-raised)',
                  color: 'var(--text-primary)', fontSize: 12,
                  fontFamily: "'Inter Tight', sans-serif",
                }}
              />
              <textarea
                value={correctionNotes}
                onChange={(e) => setCorrectionNotes(e.target.value)}
                placeholder="Any other notes? (optional)"
                rows={2}
                style={{
                  padding: '5px 8px', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)', background: 'var(--surface-raised)',
                  color: 'var(--text-primary)', fontSize: 12, resize: 'vertical',
                  fontFamily: "'Inter Tight', sans-serif",
                }}
              />
              <button
                onClick={submitCorrection}
                disabled={!correctionField || !correctionValue.trim() || correctionSubmitting}
                style={{
                  padding: '6px 14px', borderRadius: 'var(--radius-md)',
                  border: 'none', background: 'var(--accent)', color: 'var(--bone)',
                  fontSize: 12, fontWeight: 600, cursor: correctionSubmitting ? 'wait' : 'pointer',
                  fontFamily: "'Inter Tight', sans-serif", alignSelf: 'flex-start',
                  opacity: !correctionField || !correctionValue.trim() ? 0.5 : 1,
                }}
              >
                {correctionSubmitting ? 'Sending…' : 'Submit'}
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
