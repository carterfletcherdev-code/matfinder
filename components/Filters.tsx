'use client';

import { useState } from 'react';
import { Discipline, DayOfWeek, Region, DISCIPLINE_LABELS, DISCIPLINE_COLORS, DAY_LABELS, REGION_LABELS } from '@/lib/types';

const REGIONS: Region[] = ['all', 'north_america', 'south_america', 'europe', 'asia', 'africa', 'oceania'];

const DISCIPLINES: Discipline[] = ['bjj', 'nogi_bjj', 'gi_bjj', 'wrestling', 'judo', 'muay_thai', 'mma', 'kickboxing', 'boxing', 'karate', 'taekwondo'];
const DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// Discipline category groupings — used for the vertical accordion in the floating dropdown.
// MMA appears in BOTH grappling and striking (it's both); no standalone MMA category.
const CATEGORIES: { key: 'grappling' | 'striking'; label: string; disciplines: Discipline[] }[] = [
  { key: 'grappling', label: 'Grappling', disciplines: ['bjj', 'nogi_bjj', 'gi_bjj', 'wrestling', 'judo', 'mma'] },
  { key: 'striking',  label: 'Striking',  disciplines: ['muay_thai', 'kickboxing', 'boxing', 'karate', 'taekwondo', 'mma'] },
];

interface FiltersProps {
  selectedDisciplines: Discipline[];
  selectedDays: DayOfWeek[];
  freeOnly: boolean;
  startingSoonOnly: boolean;
  region: Region;
  onDisciplineToggle: (d: Discipline) => void;
  onDayToggle: (d: DayOfWeek) => void;
  onFreeOnlyToggle: () => void;
  onStartingSoonToggle: () => void;
  onRegionChange: (r: Region) => void;
  onReset?: () => void;
  resultCount: number;
  isMobile?: boolean;
  noBackground?: boolean;
  floatingFilters?: boolean;
  horizontalExpand?: boolean;
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
  selectedDisciplines, selectedDays, freeOnly, startingSoonOnly, region,
  onDisciplineToggle, onDayToggle, onFreeOnlyToggle, onStartingSoonToggle,
  onRegionChange, onReset, resultCount, isMobile, noBackground, floatingFilters,
  horizontalExpand,
}: FiltersProps) {
  const hasActiveFilters = selectedDisciplines.length > 0 || selectedDays.length > 0 || freeOnly || startingSoonOnly;
  const [flashRegion, setFlashRegion] = useState<string | null>(null);
  function handleRegionClick(r: Region) {
    setFlashRegion(r);
    setTimeout(() => setFlashRegion(null), 500);
    // Click an active non-"all" region again to toggle back to "all".
    onRegionChange(r !== 'all' && region === r ? 'all' : r);
  }

  // ── Horizontal category-pill variant — boxes that expand sideways ──
  if (horizontalExpand) {
    return (
      <HorizontalExpandFilters
        selectedDisciplines={selectedDisciplines}
        selectedDays={selectedDays}
        freeOnly={freeOnly}
        startingSoonOnly={startingSoonOnly}
        region={region}
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
              border: `1.5px solid ${active ? 'var(--accent)' : inactiveBorder}`,
              background: active ? 'var(--accent)' : inactiveBg,
              color: active ? 'var(--bone)' : inactiveText,
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
            border: `1.5px solid ${flashRegion === r ? 'var(--accent)' : inactiveBorder}`,
            background: flashRegion === r ? 'var(--accent)' : inactiveBg,
            color: flashRegion === r ? 'var(--bone)' : inactiveText,
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
  onDisciplineToggle: (d: Discipline) => void;
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
            <span style={{ background: 'var(--accent)', color: 'var(--bone)', borderRadius: 'var(--radius-full)', padding: '0 6px', fontSize: 10 }}>
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
                border: `1.5px solid ${active ? 'var(--accent)' : inactiveBorder}`,
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? 'var(--bone)' : inactiveText,
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
  region: Region;
  onDisciplineToggle: (d: Discipline) => void;
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

type GroupKey = 'disciplines' | 'days' | 'toggles' | 'region' | null;

function HorizontalExpandFilters({
  selectedDisciplines, selectedDays, freeOnly, startingSoonOnly, region,
  onDisciplineToggle, onDayToggle, onFreeOnlyToggle, onStartingSoonToggle,
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
    region: region !== 'all' ? 1 : 0,
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
            background: 'var(--accent)', color: 'var(--bone)',
            borderRadius: 'var(--radius-full)', padding: '0 6px',
            fontSize: 10, fontWeight: 700, lineHeight: '14px', minWidth: 14, textAlign: 'center',
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
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.marker, flexShrink: 0, display: 'inline-block' }} />
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
                border: `1.5px solid ${active ? 'var(--accent)' : inactiveBorder}`,
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? 'var(--bone)' : inactiveText,
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
        </div>
      )}

      <CategoryPill k="region" label="Region" />
      {openGroup === 'region' && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {REGIONS.map((r) => {
            const active = region === r;
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
