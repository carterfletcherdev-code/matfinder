'use client';

import { Discipline, DayOfWeek, DISCIPLINE_LABELS, DISCIPLINE_COLORS, DAY_LABELS } from '@/lib/types';

const DISCIPLINES: Discipline[] = ['bjj', 'nogi_bjj', 'gi_bjj', 'wrestling', 'judo', 'muay_thai', 'mma', 'kickboxing', 'boxing', 'karate', 'taekwondo'];
const DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

interface FiltersProps {
  selectedDisciplines: Discipline[];
  selectedDays: DayOfWeek[];
  freeOnly: boolean;
  openNowOnly: boolean;
  dropInOnly: boolean;
  loanerGiOnly: boolean;
  region: 'all' | 'us' | 'europe';
  onDisciplineToggle: (d: Discipline) => void;
  onDayToggle: (d: DayOfWeek) => void;
  onFreeOnlyToggle: () => void;
  onOpenNowToggle: () => void;
  onDropInToggle: () => void;
  onLoanerGiToggle: () => void;
  onRegionChange: (r: 'all' | 'us' | 'europe') => void;
  resultCount: number;
}

export default function Filters({
  selectedDisciplines,
  selectedDays,
  freeOnly,
  openNowOnly,
  dropInOnly,
  loanerGiOnly,
  region,
  onDisciplineToggle,
  onDayToggle,
  onFreeOnlyToggle,
  onOpenNowToggle,
  onDropInToggle,
  onLoanerGiToggle,
  onRegionChange,
  resultCount,
}: FiltersProps) {
  return (
    <div style={{
      background: 'var(--surface-raised)',
      borderBottom: '1px solid var(--border)',
      padding: '10px 16px',
      flexShrink: 0,
    }}>
      {/* Row 1: region + day chips + toggles + count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        {(['all', 'us', 'europe'] as const).map((r) => (
          <button
            key={r}
            onClick={() => onRegionChange(r)}
            style={{
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)',
              border: `1.5px solid ${region === r ? 'var(--accent)' : 'var(--border)'}`,
              background: region === r ? 'var(--accent)' : 'transparent',
              color: region === r ? 'var(--bone)' : 'var(--text-secondary)',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "'Inter Tight', sans-serif",
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {r === 'all' ? 'All' : r === 'us' ? '🇺🇸 US' : '🌍 Europe'}
          </button>
        ))}

        <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />

        {/* Day chips */}
        {DAYS.map((d) => {
          const active = selectedDays.includes(d);
          return (
            <button
              key={d}
              onClick={() => onDayToggle(d)}
              style={{
                padding: '3px 9px',
                borderRadius: 'var(--radius-full)',
                border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? 'var(--bone)' : 'var(--text-secondary)',
                fontSize: 11,
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

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Open Now */}
          <button
            onClick={onOpenNowToggle}
            style={{
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)',
              border: `1.5px solid ${openNowOnly ? '#16A34A' : 'var(--border)'}`,
              background: openNowOnly ? '#DCFCE7' : 'transparent',
              color: openNowOnly ? '#166534' : 'var(--text-secondary)',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "'Inter Tight', sans-serif",
              cursor: 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: openNowOnly ? '#16A34A' : 'var(--text-muted)',
              display: 'inline-block',
              boxShadow: openNowOnly ? '0 0 0 2px rgba(22,163,74,0.3)' : 'none',
            }} />
            Open Now
          </button>

          {/* Free only */}
          <button
            onClick={onFreeOnlyToggle}
            style={{
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)',
              border: `1.5px solid ${freeOnly ? '#5E8B5E' : 'var(--border)'}`,
              background: freeOnly ? '#D4DDD3' : 'transparent',
              color: freeOnly ? '#27402A' : 'var(--text-secondary)',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "'Inter Tight', sans-serif",
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            Free only
          </button>

          {/* Drop-in */}
          <button
            onClick={onDropInToggle}
            style={{
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)',
              border: `1.5px solid ${dropInOnly ? 'var(--accent)' : 'var(--border)'}`,
              background: dropInOnly ? 'var(--accent-muted)' : 'transparent',
              color: dropInOnly ? 'var(--accent)' : 'var(--text-secondary)',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "'Inter Tight', sans-serif",
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            Drop-in
          </button>

          {/* Loaner Gi */}
          <button
            onClick={onLoanerGiToggle}
            style={{
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)',
              border: `1.5px solid ${loanerGiOnly ? '#1E3A5F' : 'var(--border)'}`,
              background: loanerGiOnly ? '#DBEAFE' : 'transparent',
              color: loanerGiOnly ? '#1E3A5F' : 'var(--text-secondary)',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "'Inter Tight', sans-serif",
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            Loaner Gi
          </button>

          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
            marginLeft: 2,
          }}>
            {resultCount} gym{resultCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Row 2: discipline chips */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 5 }}>
        {DISCIPLINES.map((d) => {
          const active = selectedDisciplines.includes(d);
          const c = DISCIPLINE_COLORS[d];
          return (
            <button
              key={d}
              onClick={() => onDisciplineToggle(d)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 10px 3px 7px',
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
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: c.marker,
                flexShrink: 0,
                display: 'inline-block',
              }} />
              {DISCIPLINE_LABELS[d]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
