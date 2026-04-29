'use client';

import { useState } from 'react';
import { Discipline, DayOfWeek, Region, DISCIPLINE_LABELS, DISCIPLINE_COLORS, DAY_LABELS, REGION_LABELS } from '@/lib/types';

const REGIONS: Region[] = ['all', 'north_america', 'south_america', 'europe', 'asia', 'africa', 'oceania'];

// bjj represents the whole BJJ group (bjj + nogi_bjj + gi_bjj) in filters
const DISCIPLINES: Discipline[] = ['bjj', 'wrestling', 'judo', 'muay_thai', 'mma', 'kickboxing', 'boxing', 'karate', 'taekwondo'];
const DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const CATEGORIES: { key: 'grappling' | 'striking'; label: string; disciplines: Discipline[] }[] = [
  { key: 'grappling', label: 'Grappling', disciplines: ['bjj', 'wrestling', 'judo', 'mma'] },
  { key: 'striking',  label: 'Striking',  disciplines: ['muay_thai', 'kickboxing', 'boxing', 'mma', 'karate', 'taekwondo'] },
];

interface FiltersProps {
  selectedDisciplines: Discipline[];
  selectedDays: DayOfWeek[];
  freeOnly: boolean;
  startingSoonOnly: boolean;
  verifiedOnly?: boolean;
  showUnverifiedGyms?: boolean;
  favoritedOnly?: boolean;
  region: Region;
  selectedRegions?: Region[];
  useKm?: boolean;
  onDisciplineToggle: (d: Discipline) => void;
  onSetDisciplines?: (next: Discipline[]) => void;
  onDayToggle: (d: DayOfWeek) => void;
  onFreeOnlyToggle: () => void;
  onStartingSoonToggle: () => void;
  onVerifiedOnlyToggle?: () => void;
  onShowUnverifiedToggle?: () => void;
  onFavoritedOnlyToggle?: () => void;
  onToggleUnits?: () => void;
  onRegionChange: (r: Region) => void;
  onReset?: () => void;
  resultCount: number;
  isMobile?: boolean;
  noBackground?: boolean;
  floatingFilters?: boolean;
  horizontalExpand?: boolean;
  /** Mobile flat layout — all sections visible from open, disciplines first, no Days. */
  allOpen?: boolean;
  /** When `allOpen`: place the discipline "Select all / Clear" actions
   *  inline next to the section label (default true) or push them to the
   *  far right of the row (false — landscape). */
  inlineDisciplineActions?: boolean;
}

const scrollRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  overflowX: 'auto',
  flexWrap: 'nowrap',
  WebkitOverflowScrolling: 'touch',
  scrollbarWidth: 'none',
  msOverflowStyle: 'none',
};

export default function Filters({
  selectedDisciplines, selectedDays, freeOnly, startingSoonOnly,
  verifiedOnly = false, showUnverifiedGyms = false, favoritedOnly = false,
  region,
  selectedRegions = [],
  useKm = true, onToggleUnits,
  onDisciplineToggle, onSetDisciplines, onDayToggle, onFreeOnlyToggle, onStartingSoonToggle,
  onVerifiedOnlyToggle, onShowUnverifiedToggle, onFavoritedOnlyToggle,
  onRegionChange, onReset, resultCount, isMobile, noBackground, floatingFilters,
  horizontalExpand, allOpen, inlineDisciplineActions,
}: FiltersProps) {
  const hasActiveFilters = selectedDisciplines.length > 0 || selectedDays.length > 0 || freeOnly || startingSoonOnly;
  const [flashRegion, setFlashRegion] = useState<string | null>(null);
  function handleRegionClick(r: Region) {
    setFlashRegion(r);
    setTimeout(() => setFlashRegion(null), 500);
    // page-level handler manages multi-toggle state; just forward the click.
    onRegionChange(r);
  }

  // ── Mobile flat layout — all filters visible at once, disciplines first, no Days ──
  if (allOpen) {
    return (
      <AllOpenFilters
        selectedDisciplines={selectedDisciplines}
        freeOnly={freeOnly}
        startingSoonOnly={startingSoonOnly}
        verifiedOnly={verifiedOnly}
        showUnverifiedGyms={showUnverifiedGyms}
        favoritedOnly={favoritedOnly}
        onVerifiedOnlyToggle={onVerifiedOnlyToggle}
        onShowUnverifiedToggle={onShowUnverifiedToggle}
        onFavoritedOnlyToggle={onFavoritedOnlyToggle}
        selectedRegions={selectedRegions}
        useKm={useKm}
        onToggleUnits={onToggleUnits}
        onDisciplineToggle={onDisciplineToggle}
        onSetDisciplines={onSetDisciplines}
        inlineDisciplineActions={inlineDisciplineActions}
        onFreeOnlyToggle={onFreeOnlyToggle}
        onStartingSoonToggle={onStartingSoonToggle}
        onRegionChange={onRegionChange}
        onReset={onReset}
        resultCount={resultCount}
        hasActiveFilters={hasActiveFilters}
        flashRegion={flashRegion}
        handleRegionClick={handleRegionClick}
      />
    );
  }

  // ── Horizontal category-pill variant — boxes that expand sideways ──
  if (horizontalExpand) {
    return (
      <HorizontalExpandFilters
        selectedDisciplines={selectedDisciplines}
        selectedDays={selectedDays}
        freeOnly={freeOnly}
        startingSoonOnly={startingSoonOnly}
        verifiedOnly={verifiedOnly}
        showUnverifiedGyms={showUnverifiedGyms}
        onVerifiedOnlyToggle={onVerifiedOnlyToggle}
        onShowUnverifiedToggle={onShowUnverifiedToggle}
        region={region}
        selectedRegions={selectedRegions}
        useKm={useKm}
        onToggleUnits={onToggleUnits}
        onDisciplineToggle={onDisciplineToggle}
        onDayToggle={onDayToggle}
        onFreeOnlyToggle={onFreeOnlyToggle}
        onStartingSoonToggle={onStartingSoonToggle}
        onRegionChange={onRegionChange}
        onReset={onReset}
        resultCount={resultCount}
        hasActiveFilters={hasActiveFilters}
        flashRegion={flashRegion}
        handleRegionClick={handleRegionClick}
      />
    );
  }

  // ── Vertical category-accordion variant — only used in the floating dropdown ──
  if (floatingFilters) {
    return (
      <VerticalFilters
        selectedDisciplines={selectedDisciplines}
        selectedDays={selectedDays}
        freeOnly={freeOnly}
        startingSoonOnly={startingSoonOnly}
        region={region}
        useKm={useKm}
        onToggleUnits={onToggleUnits}
        onDisciplineToggle={onDisciplineToggle}
        onDayToggle={onDayToggle}
        onFreeOnlyToggle={onFreeOnlyToggle}
        onStartingSoonToggle={onStartingSoonToggle}
        onRegionChange={onRegionChange}
        onReset={onReset}
        resultCount={resultCount}
        hasActiveFilters={hasActiveFilters}
        flashRegion={flashRegion}
        handleRegionClick={handleRegionClick}
      />
    );
  }

  // ── Horizontal scroll-row variant — mobile + expanded list overlay ──
  const rowPad = isMobile ? '6px 10px' : '7px 16px';
  const inactiveBg = 'transparent';
  const inactiveText = 'var(--text-secondary)';
  const inactiveBorder = 'var(--border)';
  const rowBorder = noBackground ? 'none' : '1px solid var(--border)';

  return (
    <div style={{
      background: noBackground ? 'transparent' : 'var(--surface-raised)',
      borderBottom: noBackground ? 'none' : '1px solid var(--border)',
      flexShrink: 0,
    }}>

      {/* Row 1: Disciplines */}
      <div className="filter-scroll" style={{ ...scrollRow, padding: rowPad, borderBottom: rowBorder }}>
        {DISCIPLINES.map((d) => {
          const active = selectedDisciplines.includes(d);
          const c = DISCIPLINE_COLORS[d];
          return (
            <button key={d} onClick={() => onDisciplineToggle(d)} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 10px 3px 7px',
              borderRadius: 'var(--radius-full)',
              border: `1.5px solid ${active ? c.text : inactiveBorder}`,
              background: active ? c.bg : inactiveBg,
              color: active ? c.text : inactiveText,
              fontSize: 12, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
              cursor: 'pointer', transition: 'all 0.12s',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.marker, flexShrink: 0, display: 'inline-block' }} />
              {DISCIPLINE_LABELS[d]}
            </button>
          );
        })}
      </div>

      {/* Row 2: Days + Starting Soon + Free Only + Count */}
      <div className="filter-scroll" style={{ ...scrollRow, padding: rowPad, borderBottom: rowBorder }}>
        {DAYS.map((d) => {
          const active = selectedDays.includes(d);
          return (
            <button key={d} onClick={() => onDayToggle(d)} style={{
              padding: '3px 9px',
              borderRadius: 'var(--radius-full)',
              border: `1.5px solid ${active ? 'var(--bone)' : inactiveBorder}`,
              background: active ? 'var(--bone)' : inactiveBg,
              color: active ? '#1A1310' : inactiveText,
              fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
              cursor: 'pointer', transition: 'all 0.12s',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {DAY_LABELS[d]}
            </button>
          );
        })}

        <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0, margin: '0 2px' }} />

        <button onClick={onStartingSoonToggle} style={{
          padding: '3px 10px',
          borderRadius: 'var(--radius-full)',
          border: `1.5px solid ${startingSoonOnly ? '#D97706' : inactiveBorder}`,
          background: startingSoonOnly ? 'var(--bone)' : inactiveBg,
          color: startingSoonOnly ? '#5C4430' : inactiveText,
          fontSize: 12, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
          cursor: 'pointer', transition: 'all 0.15s',
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          Starting Soon
        </button>

        <button onClick={onFreeOnlyToggle} style={{
          padding: '3px 10px',
          borderRadius: 'var(--radius-full)',
          border: `1.5px solid ${freeOnly ? '#5E8B5E' : inactiveBorder}`,
          background: freeOnly ? '#D4DDD3' : inactiveBg,
          color: freeOnly ? '#27402A' : inactiveText,
          fontSize: 12, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
          cursor: 'pointer', transition: 'all 0.15s',
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          Free only
        </button>

        {onToggleUnits && (
          <button onClick={onToggleUnits} style={{
            padding: '3px 10px',
            borderRadius: 'var(--radius-full)',
            border: `1.5px solid ${inactiveBorder}`,
            background: inactiveBg,
            color: inactiveText,
            fontSize: 12, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
            cursor: 'pointer', transition: 'all 0.15s',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {useKm ? 'km' : 'mi'}
          </button>
        )}

        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
          color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 4,
        }}>
          {resultCount.toLocaleString()} gym{resultCount !== 1 ? 's' : ''}
        </span>

        {hasActiveFilters && onReset && (
          <button onClick={onReset} style={{
            padding: '3px 10px',
            borderRadius: 'var(--radius-full)',
            border: `1.5px solid ${inactiveBorder}`,
            background: inactiveBg,
            color: inactiveText,
            fontSize: 12, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
            cursor: 'pointer', transition: 'all 0.12s',
            whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 4,
            opacity: 0.7,
          }}>
            Reset ✕
          </button>
        )}
      </div>

      {/* Row 3: Regions */}
      <div className="filter-scroll" style={{ ...scrollRow, padding: rowPad }}>
        {REGIONS.map((r) => (
          <button key={r} onClick={() => handleRegionClick(r)} style={{
            padding: '3px 12px',
            borderRadius: 'var(--radius-full)',
            border: `1.5px solid ${flashRegion === r ? 'var(--bone)' : inactiveBorder}`,
            background: flashRegion === r ? 'var(--bone)' : inactiveBg,
            color: flashRegion === r ? '#1A1310' : inactiveText,
            fontSize: 12, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
            cursor: 'pointer', transition: 'all 0.15s',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {REGION_LABELS[r]}
          </button>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Vertical category-accordion variant for the floating dropdown
// ────────────────────────────────────────────────────────────────────────────

interface VerticalFiltersProps {
  selectedDisciplines: Discipline[];
  selectedDays: DayOfWeek[];
  freeOnly: boolean;
  startingSoonOnly: boolean;
  region: Region;
  useKm?: boolean;
  onToggleUnits?: () => void;
  onDisciplineToggle: (d: Discipline) => void;
  onSetDisciplines?: (next: Discipline[]) => void;
  onDayToggle: (d: DayOfWeek) => void;
  onFreeOnlyToggle: () => void;
  onStartingSoonToggle: () => void;
  onRegionChange: (r: Region) => void;
  onReset?: () => void;
  resultCount: number;
  hasActiveFilters: boolean;
  flashRegion: string | null;
  handleRegionClick: (r: Region) => void;
}

function VerticalFilters({
  selectedDisciplines, selectedDays, freeOnly, startingSoonOnly, region,
  useKm = true, onToggleUnits,
  onDisciplineToggle, onDayToggle, onFreeOnlyToggle, onStartingSoonToggle,
  handleRegionClick, onReset, resultCount, hasActiveFilters, flashRegion,
}: VerticalFiltersProps) {
  const [regionOpen, setRegionOpen] = useState<boolean>(region !== 'all');
  // Auto-expand a category if any of its disciplines are selected
  const initiallyOpen = (catKey: 'grappling' | 'striking') => {
    const cat = CATEGORIES.find(c => c.key === catKey)!;
    return cat.disciplines.some(d => selectedDisciplines.includes(d));
  };
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({
    grappling: initiallyOpen('grappling'),
    striking:  initiallyOpen('striking'),
  });

  const sectionLabel: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
    fontFamily: "'JetBrains Mono', monospace",
    color: 'rgba(245,241,232,0.55)', textTransform: 'uppercase',
    padding: '0 2px 4px',
  };

  const inactiveBorder = 'rgba(245,241,232,0.30)';
  const inactiveText = 'rgba(245,241,232,0.85)';

  function CategoryButton({
    cat, isOpen,
  }: { cat: typeof CATEGORIES[number]; isOpen: boolean }) {
    const selectedInCat = cat.disciplines.filter(d => selectedDisciplines.includes(d)).length;

    return (
      <button onClick={() => setOpenCats(s => ({ ...s, [cat.key]: !isOpen }))} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 10px', borderRadius: 'var(--radius-md)',
        border: `1.5px solid ${isOpen ? 'var(--bone)' : inactiveBorder}`,
        background: 'transparent',
        color: 'var(--bone)',
        fontSize: 13, fontWeight: 700, fontFamily: "'Inter Tight', sans-serif",
        cursor: 'pointer', transition: 'all 0.15s',
        textAlign: 'left',
      }}>
        <span>{cat.label}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, opacity: 0.8 }}>
          {selectedInCat > 0 && (
            <span style={{ background: 'var(--bone)', color: '#1A1310', borderRadius: 'var(--radius-full)', padding: '0 6px', fontSize: 10, fontWeight: 800 }}>
              {selectedInCat}
            </span>
          )}
          <span style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block', width: 10, lineHeight: '10px' }}>›</span>
        </span>
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: 10, gap: 10, color: 'var(--bone)' }}>

      {/* ── Disciplines (categorized accordion) ─────────────────────────── */}
      <div>
        <div style={sectionLabel}>Disciplines</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {CATEGORIES.map((cat) => {
            const isOpen = !!openCats[cat.key];
            return (
              <div key={cat.key}>
                <CategoryButton cat={cat} isOpen={isOpen} />
                {isOpen && (
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: 4,
                    padding: '6px 0 2px 8px',
                  }}>
                    {cat.disciplines.map((d) => {
                      const active = selectedDisciplines.includes(d);
                      const c = DISCIPLINE_COLORS[d];
                      return (
                        <button key={d} onClick={() => onDisciplineToggle(d)} style={{
                          display: 'flex', alignItems: 'center', gap: 7,
                          padding: '4px 9px 4px 7px',
                          borderRadius: 'var(--radius-full)',
                          border: `1.5px solid ${active ? c.text : inactiveBorder}`,
                          background: active ? c.bg : 'transparent',
                          color: active ? c.text : inactiveText,
                          fontSize: 12, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
                          cursor: 'pointer', transition: 'all 0.12s',
                          textAlign: 'left',
                        }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.marker, flexShrink: 0, display: 'inline-block' }} />
                          {DISCIPLINE_LABELS[d]}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Days ────────────────────────────────────────────────────────── */}
      <div>
        <div style={sectionLabel}>Days</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {DAYS.map((d) => {
            const active = selectedDays.includes(d);
            return (
              <button key={d} onClick={() => onDayToggle(d)} style={{
                padding: '3px 8px',
                borderRadius: 'var(--radius-full)',
                border: `1.5px solid ${active ? 'var(--bone)' : inactiveBorder}`,
                background: active ? 'var(--bone)' : 'transparent',
                color: active ? '#1A1310' : inactiveText,
                fontSize: 10, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
                cursor: 'pointer', transition: 'all 0.12s',
                whiteSpace: 'nowrap',
              }}>
                {DAY_LABELS[d]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Toggles ─────────────────────────────────────────────────────── */}
      <div>
        <div style={sectionLabel}>Filters</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button onClick={onStartingSoonToggle} style={{
            padding: '4px 10px',
            borderRadius: 'var(--radius-full)',
            border: `1.5px solid ${startingSoonOnly ? '#D97706' : inactiveBorder}`,
            background: startingSoonOnly ? 'var(--bone)' : 'transparent',
            color: startingSoonOnly ? '#5C4430' : inactiveText,
            fontSize: 12, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
            cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left',
          }}>
            Starting Soon
          </button>
          <button onClick={onFreeOnlyToggle} style={{
            padding: '4px 10px',
            borderRadius: 'var(--radius-full)',
            border: `1.5px solid ${freeOnly ? '#5E8B5E' : inactiveBorder}`,
            background: freeOnly ? '#D4DDD3' : 'transparent',
            color: freeOnly ? '#27402A' : inactiveText,
            fontSize: 12, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
            cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left',
          }}>
            Free only
          </button>
          {onToggleUnits && (
            <button onClick={onToggleUnits} style={{
              padding: '4px 10px',
              borderRadius: 'var(--radius-full)',
              border: `1.5px solid ${inactiveBorder}`,
              background: 'transparent',
              color: inactiveText,
              fontSize: 12, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
              cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left',
            }}>
              Distance: {useKm ? 'km' : 'mi'} — tap to switch
            </button>
          )}
        </div>
      </div>

      {/* ── Region (accordion) ──────────────────────────────────────────── */}
      <div>
        <div style={sectionLabel}>Region</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            onClick={() => setRegionOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px', borderRadius: 'var(--radius-md)',
              border: `1.5px solid ${regionOpen ? 'var(--bone)' : inactiveBorder}`,
              background: 'transparent',
              color: 'var(--bone)',
              fontSize: 13, fontWeight: 700, fontFamily: "'Inter Tight', sans-serif",
              cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left',
            }}
          >
            <span>{region === 'all' ? 'Region' : REGION_LABELS[region]}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, opacity: 0.8 }}>
              <span style={{ transform: regionOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block', width: 10, lineHeight: '10px' }}>›</span>
            </span>
          </button>
          {regionOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '2px 0 2px 8px' }}>
              {REGIONS.map((r) => {
                const active = region === r;
                return (
                  <button key={r} onClick={() => handleRegionClick(r)} style={{
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-full)',
                    border: `1.5px solid ${active || flashRegion === r ? 'var(--bone)' : inactiveBorder}`,
                    background: active ? 'rgba(245,241,232,0.12)' : 'transparent',
                    color: active ? 'var(--bone)' : inactiveText,
                    fontSize: 12, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
                    cursor: 'pointer', transition: 'all 0.15s',
                    textAlign: 'left', whiteSpace: 'nowrap',
                  }}>
                    {REGION_LABELS[r]}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Footer: count + reset ───────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 2px 0', borderTop: '1px solid rgba(245,241,232,0.15)',
        marginTop: 2,
      }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
          color: 'rgba(245,241,232,0.65)',
        }}>
          {resultCount.toLocaleString()} gym{resultCount !== 1 ? 's' : ''}
        </span>
        {hasActiveFilters && onReset && (
          <button onClick={onReset} style={{
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
            border: `1px solid ${inactiveBorder}`,
            background: 'transparent',
            color: inactiveText,
            fontSize: 10, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            Reset ✕
          </button>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Horizontal expand variant — category boxes that expand sideways inline
// ────────────────────────────────────────────────────────────────────────────

interface HorizontalExpandProps {
  selectedDisciplines: Discipline[];
  selectedDays: DayOfWeek[];
  freeOnly: boolean;
  startingSoonOnly: boolean;
  verifiedOnly?: boolean;
  showUnverifiedGyms?: boolean;
  favoritedOnly?: boolean;
  region: Region;
  selectedRegions: Region[];
  useKm?: boolean;
  onToggleUnits?: () => void;
  onDisciplineToggle: (d: Discipline) => void;
  onSetDisciplines?: (next: Discipline[]) => void;
  onDayToggle: (d: DayOfWeek) => void;
  onFreeOnlyToggle: () => void;
  onStartingSoonToggle: () => void;
  onVerifiedOnlyToggle?: () => void;
  onShowUnverifiedToggle?: () => void;
  onFavoritedOnlyToggle?: () => void;
  onRegionChange: (r: Region) => void;
  onReset?: () => void;
  resultCount: number;
  hasActiveFilters: boolean;
  flashRegion: string | null;
  handleRegionClick: (r: Region) => void;
}

type GroupKey = 'disciplines' | 'days' | 'toggles' | 'region' | null;

function HorizontalExpandFilters({
  selectedDisciplines, selectedDays, freeOnly, startingSoonOnly, selectedRegions,
  verifiedOnly = false, showUnverifiedGyms = false,
  useKm = true, onToggleUnits,
  onDisciplineToggle, onDayToggle, onFreeOnlyToggle, onStartingSoonToggle,
  onVerifiedOnlyToggle, onShowUnverifiedToggle,
  handleRegionClick, onReset, resultCount, hasActiveFilters, flashRegion,
}: HorizontalExpandProps) {
  const [openGroup, setOpenGroup] = useState<GroupKey>(null);

  const inactiveBorder = 'rgba(245,241,232,0.30)';
  const inactiveText = 'rgba(245,241,232,0.85)';

  const togglesActive = (freeOnly ? 1 : 0) + (startingSoonOnly ? 1 : 0);
  const counts: Record<Exclude<GroupKey, null>, number> = {
    disciplines: selectedDisciplines.length,
    days: selectedDays.length,
    toggles: togglesActive,
    region: selectedRegions.length,
  };

  function CategoryPill({ k, label }: { k: Exclude<GroupKey, null>; label: string }) {
    const isOpen = openGroup === k;
    const count = counts[k];
    const hasSelection = count > 0;
    return (
      <button
        onClick={() => setOpenGroup(isOpen ? null : k)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 12px',
          borderRadius: 'var(--radius-full)',
          border: `1.5px solid ${isOpen || hasSelection ? 'var(--bone)' : inactiveBorder}`,
          background: isOpen ? 'rgba(245,241,232,0.12)' : 'transparent',
          color: 'var(--bone)',
          fontSize: 12, fontWeight: 700, fontFamily: "'Inter Tight', sans-serif",
          cursor: 'pointer', transition: 'all 0.15s',
          whiteSpace: 'nowrap', flexShrink: 0,
        }}
      >
        {label}
        {count > 0 && (
          <span style={{
            background: 'var(--bone)', color: '#1A1310',
            borderRadius: 'var(--radius-full)', padding: '0 6px',
            fontSize: 10, fontWeight: 800, lineHeight: '14px', minWidth: 14, textAlign: 'center',
          }}>
            {count}
          </span>
        )}
        <span style={{
          fontSize: 9, opacity: 0.7, marginLeft: 1,
          transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s', display: 'inline-block',
        }}>›</span>
      </button>
    );
  }

  const optionPill: React.CSSProperties = {
    padding: '4px 10px',
    borderRadius: 'var(--radius-full)',
    fontSize: 11, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
    cursor: 'pointer', transition: 'all 0.12s',
    whiteSpace: 'nowrap', flexShrink: 0,
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', flexWrap: 'wrap',
      gap: 6, padding: '8px 10px', color: 'var(--bone)',
    }}>
      {onVerifiedOnlyToggle && (
        <button onClick={onVerifiedOnlyToggle} style={{
          ...optionPill,
          padding: '5px 12px',
          fontSize: 12, fontWeight: 700,
          border: `1.5px solid ${verifiedOnly ? '#5E8B5E' : inactiveBorder}`,
          background: verifiedOnly ? '#D4DDD3' : 'transparent',
          color: verifiedOnly ? '#27402A' : 'var(--bone)',
        }}>
          ✓ Verified only
        </button>
      )}

      <CategoryPill k="disciplines" label="Disciplines" />
      {openGroup === 'disciplines' && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {DISCIPLINES.map((d) => {
            const active = selectedDisciplines.includes(d);
            const c = DISCIPLINE_COLORS[d];
            return (
              <button key={d} onClick={() => onDisciplineToggle(d)} style={{
                ...optionPill,
                display: 'inline-flex', alignItems: 'center', gap: 5,
                paddingLeft: 7,
                border: `1.5px solid ${active ? c.text : inactiveBorder}`,
                background: active ? c.bg : 'transparent',
                color: active ? c.text : inactiveText,
              }}>
                {/* Color dot — no letter glyph. */}
                <span style={{
                  width: 10, height: 10, borderRadius: '50%', background: c.marker,
                  flexShrink: 0,
                }} />
                {DISCIPLINE_LABELS[d]}
              </button>
            );
          })}
        </div>
      )}

      <CategoryPill k="days" label="Days" />
      {openGroup === 'days' && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {DAYS.map((d) => {
            const active = selectedDays.includes(d);
            return (
              <button key={d} onClick={() => onDayToggle(d)} style={{
                ...optionPill,
                fontFamily: "'JetBrains Mono', monospace",
                border: `1.5px solid ${active ? 'var(--bone)' : inactiveBorder}`,
                background: active ? 'var(--bone)' : 'transparent',
                color: active ? '#1A1310' : inactiveText,
              }}>
                {DAY_LABELS[d]}
              </button>
            );
          })}
        </div>
      )}

      <CategoryPill k="toggles" label="Filters" />
      {openGroup === 'toggles' && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <button onClick={onStartingSoonToggle} style={{
            ...optionPill,
            border: `1.5px solid ${startingSoonOnly ? '#D97706' : inactiveBorder}`,
            background: startingSoonOnly ? 'var(--bone)' : 'transparent',
            color: startingSoonOnly ? '#5C4430' : inactiveText,
          }}>
            Starting Soon
          </button>
          <button onClick={onFreeOnlyToggle} style={{
            ...optionPill,
            border: `1.5px solid ${freeOnly ? '#5E8B5E' : inactiveBorder}`,
            background: freeOnly ? '#D4DDD3' : 'transparent',
            color: freeOnly ? '#27402A' : inactiveText,
          }}>
            Free only
          </button>
          {onToggleUnits && (
            <button onClick={onToggleUnits} style={{
              ...optionPill,
              border: `1.5px solid ${inactiveBorder}`,
              background: 'transparent',
              color: inactiveText,
            }}>
              {useKm ? 'km' : 'mi'}
            </button>
          )}
        </div>
      )}

      <CategoryPill k="region" label="Region" />
      {openGroup === 'region' && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {REGIONS.map((r) => {
            const active = r === 'all' ? selectedRegions.length === 0 : selectedRegions.includes(r);
            return (
              <button key={r} onClick={() => handleRegionClick(r)} style={{
                ...optionPill,
                border: `1.5px solid ${active || flashRegion === r ? 'var(--bone)' : inactiveBorder}`,
                background: active ? 'rgba(245,241,232,0.15)' : 'transparent',
                color: active ? 'var(--bone)' : inactiveText,
              }}>
                {REGION_LABELS[r]}
              </button>
            );
          })}
        </div>
      )}

      <span style={{ flex: 1 }} />

      <span style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
        color: 'rgba(245,241,232,0.65)', whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        {resultCount.toLocaleString()} gym{resultCount !== 1 ? 's' : ''}
      </span>

      {onShowUnverifiedToggle && (
        <button onClick={onShowUnverifiedToggle} title="Include gyms with no website and no verified open mat times" style={{
          ...optionPill,
          border: `1.5px solid ${showUnverifiedGyms ? 'var(--bone)' : inactiveBorder}`,
          background: showUnverifiedGyms ? 'rgba(245,241,232,0.15)' : 'transparent',
          color: showUnverifiedGyms ? 'var(--bone)' : inactiveText,
        }}>
          {showUnverifiedGyms ? '✓ ' : ''}Show unverified
        </button>
      )}

      {hasActiveFilters && onReset && (
        <button onClick={onReset} style={{
          ...optionPill,
          border: `1.5px solid ${inactiveBorder}`,
          background: 'transparent',
          color: inactiveText,
          opacity: 0.8,
        }}>
          Reset ✕
        </button>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// All-Open variant for mobile — flat layout, everything visible at once.
// Order by decision priority: Disciplines → Toggles → Region.
// Days filter intentionally dropped (see Baymard / Pencil & Paper research).
// ────────────────────────────────────────────────────────────────────────────

interface AllOpenProps {
  selectedDisciplines: Discipline[];
  freeOnly: boolean;
  startingSoonOnly: boolean;
  verifiedOnly?: boolean;
  showUnverifiedGyms?: boolean;
  favoritedOnly?: boolean;
  selectedRegions: Region[];
  useKm?: boolean;
  onToggleUnits?: () => void;
  onDisciplineToggle: (d: Discipline) => void;
  onSetDisciplines?: (next: Discipline[]) => void;
  onFreeOnlyToggle: () => void;
  onStartingSoonToggle: () => void;
  onVerifiedOnlyToggle?: () => void;
  onShowUnverifiedToggle?: () => void;
  onFavoritedOnlyToggle?: () => void;
  onRegionChange: (r: Region) => void;
  onReset?: () => void;
  resultCount: number;
  hasActiveFilters: boolean;
  flashRegion: string | null;
  handleRegionClick: (r: Region) => void;
  /** Where the discipline "Select all / Clear" actions sit:
   *  true (default) → inline next to the section label (portrait + desktop)
   *  false → pushed to the far right of the row (landscape) */
  inlineDisciplineActions?: boolean;
}

function AllOpenFilters({
  selectedDisciplines, freeOnly, startingSoonOnly, selectedRegions,
  verifiedOnly = false, showUnverifiedGyms = false, favoritedOnly = false,
  useKm = true, onToggleUnits,
  onDisciplineToggle, onSetDisciplines, onFreeOnlyToggle, onStartingSoonToggle,
  onVerifiedOnlyToggle, onShowUnverifiedToggle, onFavoritedOnlyToggle,
  handleRegionClick, onReset, resultCount, hasActiveFilters, flashRegion,
  inlineDisciplineActions = true,
}: AllOpenProps) {
  const inactiveBorder = 'rgba(245,241,232,0.30)';
  const inactiveText = 'rgba(245,241,232,0.85)';

  const sectionLabel: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
    fontFamily: "'JetBrains Mono', monospace",
    color: 'rgba(245,241,232,0.55)', textTransform: 'uppercase',
    padding: '0 2px 4px',
  };

  const optionPill: React.CSSProperties = {
    padding: '3px 9px',
    borderRadius: 'var(--radius-full)',
    fontSize: 11, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
    cursor: 'pointer', transition: 'all 0.12s',
    whiteSpace: 'nowrap', flexShrink: 0,
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 9,
      padding: 10, color: 'var(--bone)',
    }}>
      {/* ── Disciplines (FIRST — decision priority) ─────────────────────── */}
      <div>
        <div style={{
          display: 'flex', alignItems: 'center',
          // Portrait + desktop: actions sit immediately next to the
          // "Disciplines" label so it's clear they apply to this section.
          // Landscape: actions are pushed to the far right (more horizontal
          // space available, easier to scan there).
          justifyContent: inlineDisciplineActions ? 'flex-start' : 'space-between',
          gap: inlineDisciplineActions ? 10 : 0,
          paddingBottom: 4,
        }}>
          <div style={{ ...sectionLabel, padding: 0 }}>Disciplines</div>
          {/* Select all / Clear — let users explicitly select every
              discipline, then toggle off the ones they don't want. */}
          {onSetDisciplines && (() => {
            const allSelected = selectedDisciplines.length === DISCIPLINES.length;
            const noneSelected = selectedDisciplines.length === 0;
            const linkBtn: React.CSSProperties = {
              background: 'transparent', border: 'none', padding: '2px 4px',
              cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'rgba(245,241,232,0.65)',
            };
            return (
              <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <button
                  onClick={() => onSetDisciplines(DISCIPLINES)}
                  disabled={allSelected}
                  style={{ ...linkBtn, opacity: allSelected ? 0.35 : 1, color: allSelected ? 'rgba(245,241,232,0.45)' : 'var(--bone)' }}
                >Select all</button>
                <span style={{ color: 'rgba(245,241,232,0.30)' }}>·</span>
                <button
                  onClick={() => onSetDisciplines([])}
                  disabled={noneSelected}
                  style={{ ...linkBtn, opacity: noneSelected ? 0.35 : 1 }}
                >Clear</button>
              </div>
            );
          })()}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {DISCIPLINES.map((d) => {
            const active = selectedDisciplines.includes(d);
            const c = DISCIPLINE_COLORS[d];
            // Active state mirrors the map pin: the saturated marker
            // colour fills the pill and the text goes white. Inactive
            // pills keep the muted bone outline.
            return (
              <button key={d} onClick={() => onDisciplineToggle(d)} style={{
                ...optionPill,
                display: 'inline-flex', alignItems: 'center', gap: 6, paddingLeft: 8,
                border: `1.5px solid ${active ? c.marker : inactiveBorder}`,
                background: active ? c.marker : 'transparent',
                color: active ? '#FFFFFF' : inactiveText,
              }}>
                {/* Color dot — no letter glyph. The dot is the discipline. */}
                <span style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: c.marker,
                  flexShrink: 0,
                  border: active ? '1.5px solid #FFFFFF' : 'none',
                }} />
                {DISCIPLINE_LABELS[d]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Toggles — order left→right: Favorited only · Starting Soon · Free only · Verified only · Show unverified ── */}
      <div>
        <div style={sectionLabel}>Filters</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {onFavoritedOnlyToggle && (
            <button onClick={onFavoritedOnlyToggle} style={{
              ...optionPill,
              display: 'inline-flex', alignItems: 'center', gap: 6, paddingLeft: 6,
              border: `1.5px solid var(--bone)`,
              background: favoritedOnly ? 'rgba(245,241,232,0.15)' : 'transparent',
              color: 'var(--bone)',
              opacity: favoritedOnly ? 1 : 0.85,
            }}>
              {/* Rose-gold radial gradient disc with a bone outline and a
                  bone-white star — mirrors the favorite pin on the map. */}
              <span style={{
                width: 16, height: 16, borderRadius: '50%',
                border: '1.5px solid var(--bone)',
                background: 'radial-gradient(circle at 30% 30%, #E8B4B8 0%, #D4AF37 80%)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <span style={{
                  fontSize: 9, lineHeight: 1, fontWeight: 900,
                  color: '#F5F1E8',
                }}>★</span>
              </span>
              Favorited only
            </button>
          )}
          <button onClick={onStartingSoonToggle} style={{
            ...optionPill,
            border: `1.5px solid ${startingSoonOnly ? '#D97706' : inactiveBorder}`,
            background: startingSoonOnly ? 'var(--bone)' : 'transparent',
            color: startingSoonOnly ? '#5C4430' : inactiveText,
          }}>
            Starting Soon
          </button>
          <button onClick={onFreeOnlyToggle} style={{
            ...optionPill,
            border: `1.5px solid ${freeOnly ? '#5E8B5E' : inactiveBorder}`,
            background: freeOnly ? '#D4DDD3' : 'transparent',
            color: freeOnly ? '#27402A' : inactiveText,
          }}>
            Free only
          </button>
          {onVerifiedOnlyToggle && (
            <button onClick={onVerifiedOnlyToggle} style={{
              ...optionPill,
              border: `1.5px solid ${verifiedOnly ? '#5E8B5E' : inactiveBorder}`,
              background: verifiedOnly ? '#D4DDD3' : 'transparent',
              color: verifiedOnly ? '#27402A' : inactiveText,
            }}>
              {verifiedOnly ? '✓ ' : ''}Verified only
            </button>
          )}
          {onShowUnverifiedToggle && (
            <button onClick={onShowUnverifiedToggle} style={{
              ...optionPill,
              border: `1.5px solid ${showUnverifiedGyms ? 'var(--bone)' : inactiveBorder}`,
              background: showUnverifiedGyms ? 'rgba(245,241,232,0.15)' : 'transparent',
              color: showUnverifiedGyms ? 'var(--bone)' : inactiveText,
            }}>
              {showUnverifiedGyms ? '✓ ' : ''}Show unverified
            </button>
          )}
          {/* km/mi pill removed — units auto-detected from user locale. */}
        </div>
      </div>

      {/* ── Region ──────────────────────────────────────────────────────── */}
      <div>
        <div style={sectionLabel}>Region</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {REGIONS.map((r) => {
            const active = r === 'all' ? selectedRegions.length === 0 : selectedRegions.includes(r);
            return (
              <button key={r} onClick={() => handleRegionClick(r)} style={{
                ...optionPill,
                border: `1.5px solid ${active || flashRegion === r ? 'var(--bone)' : inactiveBorder}`,
                background: active ? 'rgba(245,241,232,0.15)' : 'transparent',
                color: active ? 'var(--bone)' : inactiveText,
              }}>
                {REGION_LABELS[r]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Footer: count + reset ───────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 2px 0', borderTop: '1px solid rgba(245,241,232,0.15)',
      }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
          color: 'rgba(245,241,232,0.65)',
        }}>
          {resultCount.toLocaleString()} gym{resultCount !== 1 ? 's' : ''}
        </span>
        {hasActiveFilters && onReset && (
          <button onClick={onReset} style={{
            ...optionPill,
            border: `1.5px solid ${inactiveBorder}`,
            background: 'transparent',
            color: inactiveText,
            opacity: 0.85,
          }}>
            Reset ✕
          </button>
        )}
      </div>
    </div>
  );
}
