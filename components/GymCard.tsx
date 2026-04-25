'use client';

import { Gym, DISCIPLINE_LABELS, DISCIPLINE_COLORS, DAY_LABELS } from '@/lib/types';

interface GymCardProps {
  gym: Gym;
  isSelected: boolean;
  onClick: () => void;
}

export default function GymCard({ gym, isSelected, onClick }: GymCardProps) {
  const disciplines = [...new Set(gym.open_mats.map((o) => o.discipline))];
  const hasFree = gym.open_mats.some((o) => o.is_free);

  return (
    <button
      onClick={onClick}
      style={{
        background: isSelected ? 'var(--brown-100)' : 'var(--surface-raised)',
        border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
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
          color: 'var(--text-primary)',
          lineHeight: 1.3,
        }}>
          {gym.name}
        </span>
        {hasFree && (
          <span style={{
            flexShrink: 0,
            background: '#D4DDD3',
            color: '#27402A',
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 7px',
            borderRadius: 'var(--radius-full)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}>
            FREE
          </span>
        )}
      </div>

      {/* Location */}
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        color: 'var(--text-muted)',
        marginTop: 4,
        marginBottom: 8,
      }}>
        {gym.city}, {gym.state} · {gym.country}
      </div>

      {/* Discipline chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
        {disciplines.map((d) => {
          const c = DISCIPLINE_COLORS[d];
          return (
            <span key={d} style={{
              background: c.bg,
              color: c.text,
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
            }}>
              {DISCIPLINE_LABELS[d]}
            </span>
          );
        })}
      </div>

      {/* Schedule rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {gym.open_mats.map((o) => (
          <div key={o.id} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
          }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 600,
              color: 'var(--text-muted)',
              width: 28,
              flexShrink: 0,
              fontSize: 11,
            }}>
              {DAY_LABELS[o.day]}
            </span>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
              {o.start_time}–{o.end_time}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 'auto' }}>
              {o.is_free ? (
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>Free</span>
              ) : (
                <span>${o.cost}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </button>
  );
}
