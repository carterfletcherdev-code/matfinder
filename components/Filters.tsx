'use client';

import { Discipline, DayOfWeek, DISCIPLINE_LABELS, DISCIPLINE_COLORS, DAY_LABELS } from '@/lib/types';

const DISCIPLINES: Discipline[] = ['nogi_bjj', 'gi_bjj', 'wrestling', 'judo', 'muay_thai', 'mma', 'kickboxing', 'boxing'];
const DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

interface FiltersProps {
  selectedDisciplines: Discipline[];
  selectedDays: DayOfWeek[];
  freeOnly: boolean;
  region: 'all' | 'us' | 'europe';
  onDisciplineToggle: (d: Discipline) => void;
  onDayToggle: (d: DayOfWeek) => void;
  onFreeOnlyToggle: () => void;
  onRegionChange: (r: 'all' | 'us' | 'europe') => void;
  resultCount: number;
}

export default function Filters({
  selectedDisciplines,
  selectedDays,
  freeOnly,
  region,
  onDisciplineToggle,
  onDayToggle,
  onFreeOnlyToggle,
  onRegionChange,
  resultCount,
}: FiltersProps) {
  return (
    <div style={{
      background: 'var(--surface-raised)',
      borderBottom: '1px solid var(--border)',
      padding: '12px 16px',
    }}>
      {/* Region tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {(['all', 'us', 'europe'] as const).map((r) => (
          <button
            key={r}
            onClick={() => onRegionChange(r)}
            style={{
              padding: '5px 14px',
              borderRadius: 'var(--radius-full)',
              border: `1.5px solid ${region === r ? 'var(--accent)' : 'var(--border)'}`,
              background: region === r ? 'var(--accent)' : 'transparent',
              color: region === r ? 'var(--bone)' : 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "'Inter Tight', sans-serif",
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {r === 'all' ? 'All' : r === 'us' ? '🇺🇸 US' : '🌍 Europe'}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={onFreeOnlyToggle}
            style={{
              padding: '5px 14px',
              borderRadius: 'var(--radius-full)',
              border: `1.5px solid ${freeOnly ? 'var(--success)' : 'var(--border)'}`,
              background: freeOnly ? '#D4DDD3' : 'transparent',
              color: freeOnly ? '#27402A' : 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "'Inter Tight', sans-serif",
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            Free only
          </button>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
          }}>
            {resultCount} gym{resultCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Discipline chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {DISCIPLINES.map((d) => {
          const active = selectedDisciplines.includes(d);
          const c = DISCIPLINE_COLORS[d];
          return (
            <button
              key={d}
              onClick={() => onDisciplineToggle(d)}
              style={{
                padding: '4px 12px',
                borderRadius: 'var(--radius-full)',
                border: `1.5px solid ${active ? c.text : 'var(--border)'}`,
                background: active ? c.bg : 'transparent',
                color: active ? c.text : 'var(--text-muted)',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "'Inter Tight', sans-serif",
                cursor: 'pointer',
                transition: 'all 0.12s',
              }}
            >
              {DISCIPLINE_LABELS[d]}
            </button>
          );
        })}
      </div>

      {/* Day chips */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {DAYS.map((d) => {
          const active = selectedDays.includes(d);
          return (
            <button
              key={d}
              onClick={() => onDayToggle(d)}
              style={{
                padding: '3px 10px',
                borderRadius: 'var(--radius-full)',
                border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? 'var(--bone)' : 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace",
                cursor: 'pointer',
                transition: 'all 0.12s',
              }}
            >
              {DAY_LABELS[d]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
