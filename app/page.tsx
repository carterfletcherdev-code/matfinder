'use client';

import dynamic from 'next/dynamic';
import { useState, useMemo, useEffect, useRef } from 'react';
import { Gym, Discipline, DayOfWeek } from '@/lib/types';
import GymCard from '@/components/GymCard';
import Filters from '@/components/Filters';

const Map = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div style={{
      width: '100%', height: '100%',
      background: 'var(--surface-sunken)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--text-muted)', fontFamily: "'Inter Tight', sans-serif", fontSize: 14,
    }}>
      Loading map…
    </div>
  ),
});

const US_COUNTRIES = ['US'];
const EU_COUNTRIES = ['UK', 'IE', 'NL', 'DE', 'ES', 'FR', 'SE', 'IT', 'PT', 'NO', 'DK', 'FI', 'BE', 'CH', 'AT', 'GR', 'PL', 'CZ', 'HU', 'RO', 'BG', 'HR', 'SI', 'SK', 'RS', 'BA', 'ME', 'MK', 'AL', 'XK', 'LT', 'LV', 'EE', 'LU', 'CY', 'MT', 'AD', 'MC', 'SM', 'LI', 'IS', 'UA', 'MD', 'BY', 'GE', 'AM'];

// Haversine distance in km
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function isOpenNow(gym: Gym): boolean {
  const now = new Date();
  const todayIdx = now.getDay(); // 0=Sun
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today = dayNames[todayIdx];
  const currentMins = now.getHours() * 60 + now.getMinutes();
  return gym.open_mats.some(mat => {
    if (mat.day !== today) return false;
    const [sh, sm] = mat.start_time.split(':').map(Number);
    const [eh, em] = mat.end_time.split(':').map(Number);
    return currentMins >= sh * 60 + sm && currentMins <= eh * 60 + em;
  });
}

// "BJJ" filter expands to include both confirmed gi and confirmed no-gi
// Conversely, gi_bjj or nogi_bjj filter expands to include unknown bjj entries
function matchesDisciplineFilter(matDiscipline: Discipline, selected: Discipline[]): boolean {
  if (selected.length === 0) return true;
  if (selected.includes(matDiscipline)) return true;
  if (selected.includes('bjj') && (matDiscipline === 'gi_bjj' || matDiscipline === 'nogi_bjj')) return true;
  if ((selected.includes('gi_bjj') || selected.includes('nogi_bjj')) && matDiscipline === 'bjj') return true;
  return false;
}

export default function Home() {
  const [allGyms, setAllGyms] = useState<Gym[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDisciplines, setSelectedDisciplines] = useState<Discipline[]>([]);
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([]);
  const [freeOnly, setFreeOnly] = useState(false);
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [dropInOnly, setDropInOnly] = useState(false);
  const [loanerGiOnly, setLoanerGiOnly] = useState(false);
  const [region, setRegion] = useState<'all' | 'us' | 'europe'>('all');
  const [selectedGym, setSelectedGym] = useState<string | null>(null);
  const [view, setView] = useState<'split' | 'map' | 'list'>('split');

  // Location-based sort
  const [sortLocation, setSortLocation] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [locationInput, setLocationInput] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Map center for live re-sort while panning
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const mapCenterTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetch('/api/gyms')
      .then(r => r.json())
      .then(data => { setAllGyms(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function useCurrentLocation() {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError('Geolocation not available');
      return;
    }
    setGeocoding(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSortLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'Your location' });
        setLocationInput('');
        setGeocoding(false);
      },
      (err) => { setGeoError(err.message); setGeocoding(false); },
      { timeout: 10000 }
    );
  }

  async function geocodeAddress(query: string) {
    setGeoError(null);
    setGeocoding(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      const data = await res.json();
      if (!data.length) {
        setGeoError(`Couldn't find "${query}"`);
      } else {
        setSortLocation({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: query });
      }
    } catch {
      setGeoError('Geocoding failed');
    } finally {
      setGeocoding(false);
    }
  }

  // Effective sort origin: typed location > current location > map center > none
  const sortOrigin = sortLocation || mapCenter;

  const filteredGyms = useMemo(() => {
    const filtered = allGyms.filter((gym) => {
      if (region === 'us' && !US_COUNTRIES.includes(gym.country)) return false;
      if (region === 'europe' && !EU_COUNTRIES.includes(gym.country)) return false;
      if (dropInOnly && !gym.drop_in_friendly) return false;
      if (loanerGiOnly && !gym.loaner_gi) return false;
      if (openNowOnly && !isOpenNow(gym)) return false;

      const matchingMats = gym.open_mats.filter((mat) => {
        if (!matchesDisciplineFilter(mat.discipline, selectedDisciplines)) return false;
        if (selectedDays.length > 0 && !selectedDays.includes(mat.day)) return false;
        if (freeOnly && !mat.is_free) return false;
        return true;
      });
      return matchingMats.length > 0;
    });

    if (sortOrigin) {
      return [...filtered].sort((a, b) =>
        haversine(sortOrigin.lat, sortOrigin.lng, a.lat, a.lng) -
        haversine(sortOrigin.lat, sortOrigin.lng, b.lat, b.lng)
      );
    }
    return filtered;
  }, [allGyms, selectedDisciplines, selectedDays, freeOnly, openNowOnly, dropInOnly, loanerGiOnly, region, sortOrigin]);

  const toggleDiscipline = (d: Discipline) =>
    setSelectedDisciplines(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  const toggleDay = (d: DayOfWeek) =>
    setSelectedDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  // Debounced map-center updates so the list doesn't reorder on every pan tick
  function handleMapMove(lat: number, lng: number) {
    if (sortLocation) return; // explicit location takes priority
    if (mapCenterTimer.current) clearTimeout(mapCenterTimer.current);
    mapCenterTimer.current = setTimeout(() => setMapCenter({ lat, lng }), 200);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      <Filters
        selectedDisciplines={selectedDisciplines}
        selectedDays={selectedDays}
        freeOnly={freeOnly}
        openNowOnly={openNowOnly}
        dropInOnly={dropInOnly}
        loanerGiOnly={loanerGiOnly}
        region={region}
        onDisciplineToggle={toggleDiscipline}
        onDayToggle={toggleDay}
        onFreeOnlyToggle={() => setFreeOnly(v => !v)}
        onOpenNowToggle={() => setOpenNowOnly(v => !v)}
        onDropInToggle={() => setDropInOnly(v => !v)}
        onLoanerGiToggle={() => setLoanerGiOnly(v => !v)}
        onRegionChange={setRegion}
        resultCount={loading ? 0 : filteredGyms.length}
      />

      {/* View toggle + location bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px',
        background: 'var(--surface-base)', borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        {(['split', 'map', 'list'] as const).map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            padding: '4px 12px', borderRadius: 'var(--radius-md)', border: 'none',
            background: view === v ? 'var(--accent-muted)' : 'transparent',
            color: view === v ? 'var(--accent)' : 'var(--text-muted)',
            fontSize: 12, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
            cursor: 'pointer', transition: 'all 0.12s',
          }}>
            {v === 'split' ? '⊞ Split' : v === 'map' ? '🗺 Map' : '☰ List'}
          </button>
        ))}

        <div style={{ width: 1, height: 18, background: 'var(--border)' }} />

        {/* Location-based sort controls */}
        <button
          onClick={useCurrentLocation}
          disabled={geocoding}
          title="Sort by distance from your location"
          style={{
            padding: '4px 10px', borderRadius: 'var(--radius-full)',
            border: `1.5px solid ${sortLocation?.label === 'Your location' ? 'var(--accent)' : 'var(--border)'}`,
            background: sortLocation?.label === 'Your location' ? 'var(--accent)' : 'transparent',
            color: sortLocation?.label === 'Your location' ? 'var(--bone)' : 'var(--text-secondary)',
            fontSize: 12, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
            cursor: geocoding ? 'wait' : 'pointer',
          }}
        >
          📍 Use my location
        </button>

        <form
          onSubmit={(e) => { e.preventDefault(); if (locationInput.trim()) geocodeAddress(locationInput.trim()); }}
          style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, maxWidth: 320 }}
        >
          <input
            type="text"
            value={locationInput}
            onChange={(e) => setLocationInput(e.target.value)}
            placeholder="Or enter a city, address…"
            style={{
              flex: 1,
              padding: '4px 10px',
              borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--border)',
              background: 'var(--surface-raised)',
              color: 'var(--text-primary)',
              fontSize: 12,
              fontFamily: "'Inter Tight', sans-serif",
              outline: 'none',
            }}
          />
          {sortLocation && (
            <button
              type="button"
              onClick={() => { setSortLocation(null); setLocationInput(''); setGeoError(null); }}
              title="Clear location"
              style={{
                padding: '4px 8px', borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--border)', background: 'transparent',
                color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
              }}
            >
              ✕
            </button>
          )}
        </form>

        {sortOrigin && (
          <span style={{
            fontSize: 11, color: 'var(--text-muted)',
            fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap',
          }}>
            sort: {sortLocation?.label ?? 'map center'}
          </span>
        )}

        {geoError && (
          <span style={{ fontSize: 11, color: 'var(--danger)', fontFamily: "'Inter Tight', sans-serif" }}>
            {geoError}
          </span>
        )}

        {loading && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: "'Inter Tight', sans-serif" }}>
            Loading gyms…
          </span>
        )}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {(view === 'split' || view === 'list') && (
          <div style={{
            width: view === 'list' ? '100%' : 340, flexShrink: 0,
            borderRight: view === 'split' ? '1px solid var(--border)' : 'none',
            overflowY: 'auto', padding: '12px',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            {loading ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontFamily: "'Inter Tight', sans-serif", fontSize: 14 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🥋</div>
                <div style={{ fontWeight: 600 }}>Loading open mats…</div>
              </div>
            ) : filteredGyms.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontFamily: "'Inter Tight', sans-serif", fontSize: 14 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🥋</div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>No open mats found</div>
                <div style={{ fontSize: 13 }}>Try adjusting your filters</div>
              </div>
            ) : (
              filteredGyms.slice(0, 100).map(gym => (
                <GymCard
                  key={gym.id}
                  gym={gym}
                  isSelected={selectedGym === gym.id}
                  onClick={() => { setSelectedGym(gym.id); if (view === 'list') setView('split'); }}
                  distanceKm={sortOrigin ? haversine(sortOrigin.lat, sortOrigin.lng, gym.lat, gym.lng) : undefined}
                  isOpenNow={isOpenNow(gym)}
                />
              ))
            )}
            {filteredGyms.length > 100 && (
              <div style={{ padding: '12px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                Showing 100 of {filteredGyms.length}{sortOrigin ? ' (closest first)' : ''} — use filters or the map to narrow down
              </div>
            )}
          </div>
        )}

        {(view === 'split' || view === 'map') && (
          <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0 }}>
              <Map
                gyms={filteredGyms}
                selectedGym={selectedGym}
                onGymSelect={setSelectedGym}
                region={region}
                onMapMove={handleMapMove}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
