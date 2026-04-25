'use client';

import { useState } from 'react';
import { Gym, DISCIPLINE_LABELS, DISCIPLINE_COLORS, DAY_LABELS } from '@/lib/types';
import StarRating from './StarRating';

interface GymCardProps {
  gym: Gym;
  isSelected: boolean;
  onClick: () => void;
  distanceKm?: number;
  isOpenNow?: boolean;
}

export default function GymCard({ gym, isSelected, onClick, distanceKm, isOpenNow }: GymCardProps) {
  const disciplines = [...new Set(gym.open_mats.map((o) => o.discipline))];
  const hasFree = gym.open_mats.some((o) => o.is_free);
  // A gym is "confirmed" only if every open_mat entry is confirmed
  const fullyConfirmed = gym.open_mats.every((o) => o.confirmed === true);
  const hasUnknownBjj = gym.open_mats.some((o) => o.discipline === 'bjj');
  const [showCorrection, setShowCorrection] = useState(false);

  // Color scheme:
  //   unselected: brown background + bone text
  //   selected:   bone background + brown text
  const bg = isSelected ? 'var(--bone)' : 'var(--brown-600)';
  const nameColor = isSelected ? 'var(--brown-700)' : 'var(--bone)';
  const muted = isSelected ? '#9C7A5C' : 'rgba(245,241,232,0.65)';
  const scheduleText = isSelected ? '#7D5E3F' : 'rgba(245,241,232,0.85)';

  const correctionMailto = `mailto:carterfletcherdev@gmail.com?subject=${encodeURIComponent(
    `Gym correction: ${gym.name} (${gym.city}${gym.state ? ', ' + gym.state : ''})`
  )}&body=${encodeURIComponent(
    `Gym: ${gym.name}\nLocation: ${gym.city}${gym.state ? ', ' + gym.state : ''}, ${gym.country}\nID: ${gym.id}\n\nWhat needs correcting?\n[ ] This is Gi BJJ\n[ ] This is No-Gi BJJ\n[ ] Both gi and no-gi\n[ ] Wrong day/time:\n[ ] Other:\n\nNotes:\n`
  )}`;

  return (
    <div
      onClick={onClick}
      style={{
        background: bg,
        border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--brown-600)'}`,
        borderRadius: 'var(--radius-lg)',
        padding: '14px 16px',
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
          fontSize: 14,
          color: nameColor,
          lineHeight: 1.3,
        }}>
          {gym.name}
        </span>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {isOpenNow && (
            <span style={{
              background: '#DCFCE7', color: '#166534',
              fontSize: 10, fontWeight: 700, padding: '2px 7px',
              borderRadius: 'var(--radius-full)',
              letterSpacing: '0.05em',
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16A34A', display: 'inline-block' }} />
              OPEN NOW
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
        marginTop: 4, marginBottom: 8,
        display: 'flex', justifyContent: 'space-between', gap: 8,
      }}>
        <span>{gym.city}{gym.state ? `, ${gym.state}` : ''} · {gym.country}</span>
        {typeof distanceKm === 'number' && (
          <span style={{ flexShrink: 0 }}>{distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`}</span>
        )}
      </div>

      {/* Discipline chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
        {disciplines.map((d) => {
          const c = DISCIPLINE_COLORS[d];
          return (
            <span key={d} style={{
              background: c.bg, color: c.text,
              fontSize: 11, fontWeight: 600,
              padding: '2px 8px', borderRadius: 'var(--radius-full)',
            }}>
              {DISCIPLINE_LABELS[d]}{d === 'bjj' ? ' ?' : ''}
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

      {/* Schedule rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {gym.open_mats.map((o) => (
          <div key={o.id} style={{
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
          }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 600, color: muted,
              width: 28, flexShrink: 0, fontSize: 11,
            }}>
              {DAY_LABELS[o.day]}
            </span>
            <span style={{ color: scheduleText, fontWeight: 500 }}>
              {o.start_time}–{o.end_time}
            </span>
            <span style={{ fontSize: 11, marginLeft: 'auto' }}>
              {o.is_free ? (
                <span style={{ color: isSelected ? '#5E8B5E' : '#A8C2A8', fontWeight: 600 }}>Free</span>
              ) : (
                <span style={{ color: muted }}>${o.cost}</span>
              )}
            </span>
          </div>
        ))}
      </div>

      {/* Use-case tags — drop-in, loaner gi, free for visitors */}
      {(gym.drop_in_friendly || gym.loaner_gi || gym.free_for_visitors) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6, marginBottom: 4 }}>
          {gym.drop_in_friendly && (
            <span style={{
              background: isSelected ? '#EDE9FE' : 'rgba(237,233,254,0.25)',
              color: isSelected ? '#5B21B6' : 'rgba(245,241,232,0.8)',
              fontSize: 10, fontWeight: 600, padding: '2px 7px',
              borderRadius: 'var(--radius-full)',
            }}>Drop-in welcome</span>
          )}
          {gym.loaner_gi && (
            <span style={{
              background: isSelected ? '#DBEAFE' : 'rgba(219,234,254,0.25)',
              color: isSelected ? '#1E3A5F' : 'rgba(245,241,232,0.8)',
              fontSize: 10, fontWeight: 600, padding: '2px 7px',
              borderRadius: 'var(--radius-full)',
            }}>Loaner gi</span>
          )}
          {gym.free_for_visitors && (
            <span style={{
              background: isSelected ? '#D4DDD3' : 'rgba(212,221,211,0.25)',
              color: isSelected ? '#27402A' : 'rgba(245,241,232,0.8)',
              fontSize: 10, fontWeight: 600, padding: '2px 7px',
              borderRadius: 'var(--radius-full)',
            }}>Free for visitors</span>
          )}
        </div>
      )}

      {/* Action row — only visible when expanded/selected */}
      {isSelected && (
        <div style={{
          marginTop: 12, paddingTop: 10,
          borderTop: '1px solid var(--brown-100)',
          display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
        }}>
          {gym.website && (
            <a
              href={gym.website}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                fontSize: 12, fontWeight: 600,
                color: 'var(--brown-600)', textDecoration: 'none',
                padding: '4px 10px', borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--brown-200)',
                fontFamily: "'Inter Tight', sans-serif",
              }}
            >
              Visit website →
            </a>
          )}
          <a
            href={correctionMailto}
            onClick={(e) => { e.stopPropagation(); setShowCorrection(true); }}
            style={{
              fontSize: 12, fontWeight: 600,
              color: 'var(--brown-500)', textDecoration: 'none',
              padding: '4px 10px', borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--brown-200)',
              fontFamily: "'Inter Tight', sans-serif",
            }}
          >
            Suggest correction
          </a>
          {showCorrection && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Thanks — your email client should have opened
            </span>
          )}
        </div>
      )}

      {/* Star rating — only when expanded */}
      {isSelected && (
        <StarRating gymId={gym.id} isSelected={isSelected} />
      )}
    </div>
  );
}
