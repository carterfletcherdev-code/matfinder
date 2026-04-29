'use client';

import { useState } from 'react';
import { Discipline, DISCIPLINE_LABELS, DISCIPLINE_COLORS } from '@/lib/types';
import { Button } from './ui';

const ALL_DISCIPLINES: Discipline[] = [
  'bjj', 'wrestling', 'judo', 'muay_thai', 'kickboxing', 'boxing', 'karate', 'taekwondo', 'mma',
];

const GROUPS: { label: string; disciplines: Discipline[] }[] = [
  { label: 'Grappling', disciplines: ['bjj', 'wrestling', 'judo'] },
  { label: 'Striking', disciplines: ['muay_thai', 'kickboxing', 'boxing', 'karate', 'taekwondo'] },
  { label: 'Mixed Martial Arts', disciplines: ['mma'] },
];

interface Props {
  initialDisciplines?: Discipline[];
  onConfirm: (disciplines: Discipline[]) => void;
  onDontShowAgain: (disciplines: Discipline[]) => void;
}

export default function DisciplineOnboarding({ initialDisciplines = [], onConfirm, onDontShowAgain }: Props) {
  const [selected, setSelected] = useState<Discipline[]>(initialDisciplines);

  function toggle(d: Discipline) {
    setSelected(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }

  function selectAll() { setSelected([...ALL_DISCIPLINES]); }
  function clearAll() { setSelected([]); }

  const allSelected = selected.length === ALL_DISCIPLINES.length;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(10,6,4,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px',
    }}>
      <div style={{
        background: 'var(--surface-raised, #1a1310)',
        border: '1px solid rgba(245,241,232,0.15)',
        borderRadius: 20,
        width: '100%', maxWidth: 440,
        maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '28px 28px 0' }}>
          <div style={{
            fontFamily: "'Inter Tight', sans-serif",
            fontSize: 22, fontWeight: 800,
            color: 'var(--bone, #F5F1E8)',
            marginBottom: 6,
          }}>
            What are you training?
          </div>
          <div style={{
            fontFamily: "'Inter Tight', sans-serif",
            fontSize: 13, color: 'rgba(245,241,232,0.55)',
            lineHeight: 1.5, marginBottom: 4,
          }}>
            Pick the martial arts you want to find gyms for. You can change this anytime in Filters.
          </div>
        </div>

        {/* Select all / clear row */}
        <div style={{ padding: '10px 28px 8px', display: 'flex', gap: 8 }}>
          <Button
            onClick={allSelected ? clearAll : selectAll}
            variant={allSelected ? 'secondary' : 'primary'}
            size="sm"
            style={{
              background: allSelected ? 'rgba(245,241,232,0.12)' : 'var(--bone, #F5F1E8)',
              borderColor: allSelected ? 'rgba(245,241,232,0.30)' : 'var(--bone, #F5F1E8)',
              color: allSelected ? 'rgba(245,241,232,0.70)' : '#1A1310',
            }}
          >
            {allSelected ? 'Clear all' : 'Select all'}
          </Button>
        </div>

        {/* Discipline groups */}
        <div style={{ overflowY: 'auto', padding: '0 28px 8px', flex: 1 }}>
          {GROUPS.map(group => (
            <div key={group.label} style={{ marginBottom: 20 }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(245,241,232,0.40)',
                marginBottom: 8,
              }}>
                {group.label}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {group.disciplines.map(d => {
                  const active = selected.includes(d);
                  const c = DISCIPLINE_COLORS[d];
                  return (
                    <button key={d} onClick={() => toggle(d)} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      padding: '7px 14px 7px 10px',
                      borderRadius: 999,
                      border: `1.5px solid ${active ? c.text : 'rgba(245,241,232,0.25)'}`,
                      background: active ? c.bg : 'transparent',
                      color: active ? c.text : 'rgba(245,241,232,0.80)',
                      fontFamily: "'Inter Tight', sans-serif",
                      fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', transition: 'all 0.12s',
                      touchAction: 'manipulation',
                    }}>
                      <span style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: active ? c.marker : 'rgba(245,241,232,0.30)',
                        flexShrink: 0, display: 'inline-block',
                        transition: 'background 0.12s',
                      }} />
                      {DISCIPLINE_LABELS[d]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 28px 24px',
          borderTop: '1px solid rgba(245,241,232,0.10)',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {selected.length === 0 && (
            <div style={{
              fontFamily: "'Inter Tight', sans-serif",
              fontSize: 12, color: 'rgba(245,241,232,0.40)',
              textAlign: 'center',
            }}>
              Select at least one discipline to continue
            </div>
          )}
          <Button
            disabled={selected.length === 0}
            onClick={() => onConfirm(selected)}
            variant="primary"
            size="lg"
            fullWidth
            style={{ fontWeight: 800, fontSize: 15 }}
          >
            {selected.length === 0
              ? 'Select a discipline'
              : `Show gyms${selected.length < ALL_DISCIPLINES.length ? ` · ${selected.length} selected` : ''}`}
          </Button>
          <Button
            disabled={selected.length === 0}
            onClick={() => selected.length > 0 && onDontShowAgain(selected)}
            variant="ghost"
            size="sm"
            fullWidth
            style={{
              color: selected.length > 0 ? 'rgba(245,241,232,0.40)' : 'rgba(245,241,232,0.20)',
              fontWeight: 400,
              border: 'none',
            }}
          >
            Don&apos;t show this on startup — change in Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
