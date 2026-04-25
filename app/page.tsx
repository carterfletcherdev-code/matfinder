'use client';

import dynamic from 'next/dynamic';
import { useState, useMemo } from 'react';
import { Discipline, DayOfWeek } from '@/lib/types';
import { GYMS } from '@/lib/data';
import GymCard from '@/components/GymCard';
import Filters from '@/components/Filters';

const Map = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div style={{
      width: '100%',
      height: '100%',
      background: 'var(--surface-sunken)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-muted)',
      fontFamily: "'Inter Tight', sans-serif",
      fontSize: 14,
    }}>
      Loading map…
    </div>
  ),
});

export default function Home() {
  const [selectedDisciplines, setSelectedDisciplines] = useState<Discipline[]>([]);
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([]);
  const [freeOnly, setFreeOnly] = useState(false);
  const [region, setRegion] = useState<'all' | 'us' | 'europe'>('all');
  const [selectedGym, setSelectedGym] = useState<string | null>(null);
  const [view, setView] = useState<'split' | 'map' | 'list'>('split');

  const US_COUNTRIES = ['US'];
  const EU_COUNTRIES = ['UK', 'IE', 'NL', 'DE', 'ES', 'FR', 'SE', 'IT', 'PT', 'NO', 'DK', 'FI', 'BE', 'CH', 'AT'];

  const filteredGyms = useMemo(() => {
    return GYMS.filter((gym) => {
      // Region filter
      if (region === 'us' && !US_COUNTRIES.includes(gym.country)) return false;
      if (region === 'europe' && !EU_COUNTRIES.includes(gym.country)) return false;

      // Each gym must have at least one matching open mat
      const matchingMats = gym.open_mats.filter((mat) => {
        if (selectedDisciplines.length > 0 && !selectedDisciplines.includes(mat.discipline)) return false;
        if (selectedDays.length > 0 && !selectedDays.includes(mat.day)) return false;
        if (freeOnly && !mat.is_free) return false;
        return true;
      });

      return matchingMats.length > 0;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDisciplines, selectedDays, freeOnly, region]);

  const toggleDiscipline = (d: Discipline) => {
    setSelectedDisciplines((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  };

  const toggleDay = (d: DayOfWeek) => {
    setSelectedDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0,
      overflow: 'hidden',
    }}>
      {/* ── Filters bar ─────────────────────────────────────────── */}
      <Filters
        selectedDisciplines={selectedDisciplines}
        selectedDays={selectedDays}
        freeOnly={freeOnly}
        region={region}
        onDisciplineToggle={toggleDiscipline}
        onDayToggle={toggleDay}
        onFreeOnlyToggle={() => setFreeOnly((v) => !v)}
        onRegionChange={setRegion}
        resultCount={filteredGyms.length}
      />

      {/* ── View toggle ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        gap: 4,
        padding: '8px 16px',
        background: 'var(--surface-base)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        {(['split', 'map', 'list'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              padding: '4px 12px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: view === v ? 'var(--accent-muted)' : 'transparent',
              color: view === v ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "'Inter Tight', sans-serif",
              cursor: 'pointer',
              transition: 'all 0.12s',
            }}
          >
            {v === 'split' ? '⊞ Split' : v === 'map' ? '🗺 Map' : '☰ List'}
          </button>
        ))}
      </div>

      {/* ── Main content ────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
        minHeight: 0,
      }}>
        {/* Sidebar list */}
        {(view === 'split' || view === 'list') && (
          <div style={{
            width: view === 'list' ? '100%' : 340,
            flexShrink: 0,
            borderRight: view === 'split' ? '1px solid var(--border)' : 'none',
            overflowY: 'auto',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            {filteredGyms.length === 0 ? (
              <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontFamily: "'Inter Tight', sans-serif",
                fontSize: 14,
              }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🥋</div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>No open mats found</div>
                <div style={{ fontSize: 13 }}>Try adjusting your filters</div>
              </div>
            ) : (
              filteredGyms.map((gym) => (
                <GymCard
                  key={gym.id}
                  gym={gym}
                  isSelected={selectedGym === gym.id}
                  onClick={() => {
                    setSelectedGym(gym.id);
                    if (view === 'list') setView('split');
                  }}
                />
              ))
            )}
          </div>
        )}

        {/* Map */}
        {(view === 'split' || view === 'map') && (
          <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0 }}>
              <Map
                gyms={filteredGyms}
                selectedGym={selectedGym}
                onGymSelect={setSelectedGym}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
