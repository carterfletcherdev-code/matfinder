'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Gym, Discipline, DayOfWeek, Region, REGION_BOUNDS } from '@/lib/types';
import { MAP_STYLES, type MapController } from '@/components/Map';
import GymCard from '@/components/GymCard';
import Filters from '@/components/Filters';
import ProfileDropdown from '@/components/ProfileDropdown';

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

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function isStartingSoon(gym: Gym): boolean {
  const now = new Date();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today = dayNames[now.getDay()];
  const currentMins = now.getHours() * 60 + now.getMinutes();
  return gym.open_mats.some(mat => {
    if (mat.day !== today) return false;
    const [sh, sm] = mat.start_time.split(':').map(Number);
    const startMins = sh * 60 + sm;
    return startMins >= currentMins && startMins <= currentMins + 90;
  });
}

function matchesDisciplineFilter(matDiscipline: Discipline, selected: Discipline[]): boolean {
  if (selected.length === 0) return true;
  if (selected.includes(matDiscipline)) return true;
  if (selected.includes('bjj') && (matDiscipline === 'gi_bjj' || matDiscipline === 'nogi_bjj')) return true;
  if ((selected.includes('gi_bjj') || selected.includes('nogi_bjj')) && matDiscipline === 'bjj') return true;
  return false;
}

const REGION_FLYTO: Record<Region, { lat: number; lng: number; zoom: number }> = Object.fromEntries(
  Object.entries(REGION_BOUNDS).map(([k, v]) => [k, { lat: v.center[0], lng: v.center[1], zoom: v.zoom }])
) as Record<Region, { lat: number; lng: number; zoom: number }>;

const LIST_W = 300;

export default function Home() {
  const [allGyms, setAllGyms] = useState<Gym[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDisciplines, setSelectedDisciplines] = useState<Discipline[]>([]);
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([]);
  const [freeOnly, setFreeOnly] = useState(false);
  const [startingSoonOnly, setStartingSoonOnly] = useState(false);
  const [region, setRegion] = useState<Region>('all');

  // Search-locked regions: each chip locks the visible pins to its bbox.
  // When empty → no search lock. Multiple chips → union of bboxes.
  type SearchRegion = { id: string; label: string; bbox: [number, number, number, number] };
  const [searchRegions, setSearchRegions] = useState<SearchRegion[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  type SortMode = 'default' | 'popular' | 'featured' | 'nearest';
  const POPULAR_RADIUS_KM = 56; // ~35 miles
  const [sortMode, setSortMode] = useState<SortMode>('default');
  const [ratingsAgg, setRatingsAgg] = useState<Record<string, { avg: number; count: number }>>({});
  const [useKm, setUseKm] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('matfinder_useKm') !== 'false';
    }
    return true;
  });
  function toggleUnits() {
    setUseKm(v => {
      const next = !v;
      localStorage.setItem('matfinder_useKm', String(next));
      return next;
    });
  }

  const [expandedGym, setExpandedGym] = useState<string | null>(null);
  const [selectedGym, setSelectedGym] = useState<string | null>(null);
  const [pinnedFirst, setPinnedFirst] = useState<string | null>(null);

  const [mapFlyTarget, setMapFlyTarget] = useState<{ lat: number; lng: number; zoom: number } | null>(null);

  const [sortLocation, setSortLocation] = useState<{ lat: number; lng: number; label: string } | null>(null);
  // Remembered home location — set on first GPS fix; used to refly when clearing a selected gym.
  const homeLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [pinDropMode, setPinDropMode] = useState(false);
  const [gpsFlashing, setGpsFlashing] = useState(false);
  const zoomInBtnRef = useRef<HTMLButtonElement>(null);
  const zoomOutBtnRef = useRef<HTMLButtonElement>(null);
  const zoomInTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoomOutTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function triggerZoomFlash(btnRef: React.RefObject<HTMLButtonElement | null>, timeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>) {
    const el = btnRef.current;
    if (!el) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    el.classList.remove('btn-flash');
    void el.offsetHeight; // force reflow so animation restarts
    el.classList.add('btn-flash');
    timeoutRef.current = setTimeout(() => el.classList.remove('btn-flash'), 300);
  }

  const [mapBounds, setMapBounds] = useState<{ s: number; w: number; n: number; e: number } | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [mapZoom, setMapZoom] = useState(4);

  const [isMobile, setIsMobile] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  // Full-screen-only UI states
  const [listVisible, setListVisible] = useState(true);
  const [listExpanded, setListExpanded] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [mapStyleKey, setMapStyleKey] = useState('outdoors');
  const mapControllerRef = useRef<MapController | null>(null);

  const isGpsActive = sortLocation?.label === 'Your location';
  const isPinActive = sortLocation?.label === 'Dropped pin';
  const usingMapCenter = !sortLocation && mapZoom >= 9 && !!mapCenter;

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    fetch('/api/gyms')
      .then(r => r.json())
      .then(data => { setAllGyms(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const reloadAggregates = useCallback(() => {
    fetch('/api/ratings')
      .then(r => r.json())
      .then(d => setRatingsAgg(d.aggregates ?? {}))
      .catch(() => {});
  }, []);

  useEffect(() => { reloadAggregates(); }, [reloadAggregates]);

  async function geocodeAndAddRegion(q: string): Promise<{ lat: number; lng: number } | null> {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) { setSearchError('Search unavailable'); return null; }
    setSearching(true);
    setSearchError(null);
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${token}&types=place,region,country,district,locality&limit=1`;
      const res = await fetch(url);
      const json = await res.json();
      const feat = json.features?.[0];
      if (!feat) { setSearchError('No match'); setSearching(false); return null; }
      const [w, s, e, n] = feat.bbox ?? [feat.center[0] - 0.3, feat.center[1] - 0.3, feat.center[0] + 0.3, feat.center[1] + 0.3];
      const label = feat.text ?? feat.place_name?.split(',')[0] ?? q;
      const id = `${label}-${Date.now()}`;
      setSearchRegions(prev => [...prev, { id, label, bbox: [w, s, e, n] }]);
      const cLat = (s + n) / 2;
      const cLng = (w + e) / 2;
      const span = Math.max(n - s, e - w);
      const zoom = span > 20 ? 3 : span > 10 ? 4 : span > 5 ? 5 : span > 2 ? 7 : span > 0.8 ? 9 : 11;
      setMapFlyTarget({ lat: cLat, lng: cLng, zoom });
      setSearching(false);
      return { lat: cLat, lng: cLng };
    } catch {
      setSearchError('Search failed');
    }
    setSearching(false);
    return null;
  }

  async function commitSearch() {
    const q = searchInput.trim();
    if (!q) return;
    await geocodeAndAddRegion(q);
    setSearchInput('');
  }

  async function handleCityClick(cityQuery: string) {
    setSearchRegions([]);
    const center = await geocodeAndAddRegion(cityQuery);
    if (center) {
      // Set sort location to city center so distances show on cards
      setSortLocation({ lat: center.lat, lng: center.lng, label: cityQuery });
      setSortMode('nearest');
    }
  }

  function removeSearchRegion(id: string) {
    setSearchRegions(prev => prev.filter(r => r.id !== id));
  }

  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords;
          homeLocationRef.current = { lat, lng };
          setSortLocation({ lat, lng, label: 'Your location' });
          setMapFlyTarget({ lat, lng, zoom: 11 });
        },
        () => {},
        { timeout: 8000 }
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function activateGps() {
    setGeoError(null);
    if (!navigator.geolocation) { setGeoError('Geolocation not available'); return; }
    setGeocoding(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        homeLocationRef.current = { lat, lng };
        setSortLocation({ lat, lng, label: 'Your location' });
        setMapFlyTarget({ lat, lng, zoom: 11 });
        setGeocoding(false);
        setPinDropMode(false);
      },
      (err) => { setGeoError(err.message); setGeocoding(false); },
      { timeout: 10000 }
    );
  }

  function handleGpsClick() {
    setGpsFlashing(true);
    setTimeout(() => setGpsFlashing(false), 550);
    if (isGpsActive) {
      setMapFlyTarget({ lat: sortLocation!.lat, lng: sortLocation!.lng, zoom: 13 });
    } else {
      activateGps();
    }
  }

  function handleDropPinClick() {
    if (isPinActive) {
      setSortLocation(null);
      setGeoError(null);
    } else if (pinDropMode) {
      setPinDropMode(false);
    } else {
      setSortLocation(null);
      setPinDropMode(true);
    }
  }

  function handlePinDrop(lat: number, lng: number) {
    setSortLocation({ lat, lng, label: 'Dropped pin' });
    setPinDropMode(false);
    setMapFlyTarget({ lat, lng, zoom: 12 });
  }

  function handleZoomChange(zoom: number) {
    setMapZoom(zoom);
    if (zoom < 7) {
      setSelectedGym(null);
      setExpandedGym(null);
      setPinnedFirst(null);
    }
  }

  function handleBoundsChange(s: number, w: number, n: number, e: number) {
    setMapBounds({ s, w, n, e });
    setMapCenter({ lat: (s + n) / 2, lng: (w + e) / 2 });
  }

  function handleRegionChange(r: Region) {
    setRegion(r);
    setMapFlyTarget(REGION_FLYTO[r]);
  }

  function handleStyleChange(key: string) {
    setMapStyleKey(key);
    mapControllerRef.current?.setStyle(key);
  }

  const sortOrigin = sortLocation ?? (usingMapCenter ? mapCenter : null);

  // When the user has searched a city/state, sorts (Nearest / Popular / Featured)
  // should center on that search region instead of GPS — so "Most Popular" while
  // viewing Dallas doesn't pull in your home Austin gyms.
  const searchOrigin = searchRegions.length > 0
    ? (() => {
        const r = searchRegions[searchRegions.length - 1];
        const [w, s, e, n] = r.bbox;
        return { lat: (s + n) / 2, lng: (w + e) / 2 };
      })()
    : null;
  const sortReference = searchOrigin ?? sortOrigin;

  const filteredGyms = useMemo(() => {
    const filtered = allGyms.filter((gym) => {
      // Search-region lock: gym must fall in at least one chip's bbox.
      if (searchRegions.length > 0) {
        const inAny = searchRegions.some(r => {
          const [w, s, e, n] = r.bbox;
          return gym.lat >= s && gym.lat <= n && gym.lng >= w && gym.lng <= e;
        });
        if (!inAny) return false;
      }
      if (startingSoonOnly && !isStartingSoon(gym)) return false;
      if (startingSoonOnly && mapBounds) {
        if (gym.lat < mapBounds.s || gym.lat > mapBounds.n ||
            gym.lng < mapBounds.w || gym.lng > mapBounds.e) return false;
      }
      const matchingMats = gym.open_mats.filter((mat) => {
        if (!matchesDisciplineFilter(mat.discipline, selectedDisciplines)) return false;
        if (selectedDays.length > 0 && !selectedDays.includes(mat.day)) return false;
        if (freeOnly && !mat.is_free) return false;
        return true;
      });
      return matchingMats.length > 0;
    });

    let arr = [...filtered];

    // Popular + Featured: lock to ~35mi radius around your location, BUT only
    // when there's no active search. A search already locks the area via bbox.
    if ((sortMode === 'popular' || sortMode === 'featured') && sortOrigin && searchRegions.length === 0) {
      arr = arr.filter(g => haversine(sortOrigin.lat, sortOrigin.lng, g.lat, g.lng) <= POPULAR_RADIUS_KM);
    }

    if (sortMode === 'popular') {
      arr.sort((a, b) => (ratingsAgg[b.id]?.avg ?? 0) - (ratingsAgg[a.id]?.avg ?? 0));
    } else if (sortMode === 'featured') {
      arr.sort((a, b) => {
        const f = Number(!!b.featured) - Number(!!a.featured);
        if (f !== 0) return f;
        return (ratingsAgg[b.id]?.avg ?? 0) - (ratingsAgg[a.id]?.avg ?? 0);
      });
    } else if (sortMode === 'nearest' && sortReference) {
      arr.sort((a, b) =>
        haversine(sortReference.lat, sortReference.lng, a.lat, a.lng) -
        haversine(sortReference.lat, sortReference.lng, b.lat, b.lng));
    } else if (sortOrigin) {
      arr.sort((a, b) =>
        haversine(sortOrigin.lat, sortOrigin.lng, a.lat, a.lng) -
        haversine(sortOrigin.lat, sortOrigin.lng, b.lat, b.lng));
    }
    return arr;
  }, [allGyms, selectedDisciplines, selectedDays, freeOnly, startingSoonOnly, sortOrigin, sortReference, mapBounds, searchRegions, sortMode, ratingsAgg]);

  const featuredGyms = useMemo(
    () => filteredGyms.filter((g) => g.featured),
    [filteredGyms]
  );

  const gymNameById = useMemo(
    () => Object.fromEntries(allGyms.map(g => [g.id, g.name])) as Record<string, string>,
    [allGyms]
  );

  const toggleDiscipline = (d: Discipline) =>
    setSelectedDisciplines(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  const toggleDay = (d: DayOfWeek) =>
    setSelectedDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  function resetFilters() {
    setSelectedDisciplines([]);
    setSelectedDays([]);
    setFreeOnly(false);
    setStartingSoonOnly(false);
  }

  function handleCardClick(gymId: string) {
    setSelectedGym(gymId);
    setExpandedGym(prev => prev === gymId ? null : gymId);
    setPinnedFirst(null);
  }

  function handleMapGymSelect(id: string) {
    setSelectedGym(id);
    setExpandedGym(id);
    setPinnedFirst(id);
    if (isMobile) setMobileSheetOpen(true);
    // Set sort location to this gym so the list re-sorts nearest from here
    const gym = allGyms.find(g => g.id === id);
    if (gym) {
      setSortLocation({ lat: gym.lat, lng: gym.lng, label: gym.name });
      setSortMode('nearest');
    }
  }

  const activeFilterCount =
    selectedDisciplines.length + selectedDays.length + (freeOnly ? 1 : 0) + (startingSoonOnly ? 1 : 0);

  // Featured-gym pills — small chips at the top of the list. Same height as nav buttons.
  const featuredPills = featuredGyms.length === 0 ? null : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 0 4px' }}>
      {featuredGyms.map((g) => (
        <button
          key={`feat-${g.id}`}
          onClick={() => handleCardClick(g.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 'var(--radius-full)',
            border: '1.5px solid #C9A24A',
            background: 'rgba(40,28,20,0.94)',
            color: 'var(--bone)',
            fontSize: 11, fontWeight: 700, fontFamily: "'Inter Tight', sans-serif",
            cursor: 'pointer', whiteSpace: 'nowrap',
            textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
          title={`Featured — ${g.name}`}
        >
          <span style={{ color: '#C9A24A', fontSize: 12 }}>★</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</span>
          <span style={{
            marginLeft: 'auto', fontSize: 9, fontWeight: 700,
            color: '#C9A24A', letterSpacing: '0.06em',
          }}>FEATURED</span>
        </button>
      ))}
    </div>
  );

  // Search bar — geocodes on Enter, shows region chips with X to remove.
  const searchBar = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap',
      padding: '2px 6px 2px 10px', borderRadius: 'var(--radius-full)',
      border: '1.5px solid var(--bone)',
      background: 'transparent', minHeight: 22,
      maxWidth: 420, flexShrink: 0,
    }}>
      {searchRegions.map(r => (
        <span key={r.id} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '1px 4px 1px 8px', borderRadius: 'var(--radius-full)',
          background: 'var(--accent)', color: 'var(--bone)',
          fontSize: 10, fontWeight: 700, fontFamily: "'Inter Tight', sans-serif",
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {r.label}
          <button
            onClick={() => removeSearchRegion(r.id)}
            title={`Remove ${r.label}`}
            style={{
              background: 'rgba(40,28,20,0.94)', border: 'none',
              color: 'var(--bone)', width: 14, height: 14,
              borderRadius: '50%', cursor: 'pointer', padding: 0,
              fontSize: 10, lineHeight: 1, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
        </span>
      ))}
      <input
        type="text"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') commitSearch(); }}
        placeholder={searchRegions.length > 0 ? 'Add another…' : 'City, state, or country'}
        disabled={searching}
        style={{
          flex: 1, minWidth: 180,
          padding: '2px 4px',
          border: 'none',
          background: 'transparent',
          color: 'var(--bone)',
          fontSize: 11, fontWeight: 500,
          fontFamily: "'Inter Tight', sans-serif",
          outline: 'none',
        }}
      />
      {(searchInput || searchRegions.length > 0) && (
        <button
          onClick={() => { setSearchInput(''); setSearchRegions([]); setSearchError(null); }}
          title="Clear search"
          style={{
            background: 'transparent', border: 'none',
            color: 'var(--bone)', cursor: 'pointer',
            fontSize: 12, lineHeight: 1, padding: '2px 4px', flexShrink: 0,
            opacity: 0.7,
          }}
        >✕</button>
      )}
    </div>
  );

  // Sort pills — single-select row at the top of the list.
  const sortPills = (() => {
    const opts: { key: SortMode; label: string; requiresLocation?: boolean }[] = [
      { key: 'featured', label: 'Featured' },
      { key: 'popular',  label: 'Most popular' },
      { key: 'nearest',  label: 'Nearest', requiresLocation: true },
    ];
    return (
      <div
        className="map-toolbar-float"
        style={{
          position: 'sticky', top: 0, zIndex: 50,
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 6px', marginBottom: 6, alignSelf: 'flex-start',
        }}
      >
        {opts.map((o, i) => {
          const active = sortMode === o.key;
          const disabled = !!(o.requiresLocation && !sortReference);
          return (
            <span key={o.key} style={{ display: 'inline-flex', alignItems: 'center' }}>
              {i > 0 && (
                <span style={{ width: 1, height: 12, background: 'rgba(245,241,232,0.20)', margin: '0 2px' }} />
              )}
              <button
                onClick={() => setSortMode(active ? 'default' : o.key)}
                disabled={disabled}
                title={disabled ? 'Set your location, drop a pin, or search a city first' : undefined}
                style={{
                  padding: '3px 9px', borderRadius: 'var(--radius-full)',
                  border: `1.5px solid ${active ? 'var(--accent)' : 'transparent'}`,
                  background: active ? 'var(--accent)' : 'transparent',
                  color: disabled ? 'rgba(245,241,232,0.35)' : 'var(--bone)',
                  fontSize: 10, fontWeight: 700, fontFamily: "'Inter Tight', sans-serif",
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >{o.label}</button>
            </span>
          );
        })}
      </div>
    );
  })();

  // Shared gym cards list
  const gymCards = (() => {
    if (loading) return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontFamily: "'Inter Tight', sans-serif", fontSize: 14 }}>
        <div style={{ fontWeight: 600 }}>Loading open mats…</div>
      </div>
    );
    if (filteredGyms.length === 0) return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontFamily: "'Inter Tight', sans-serif", fontSize: 14 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>No open mats found</div>
        <div style={{ fontSize: 13 }}>Try adjusting your filters</div>
      </div>
    );
    const pinned = pinnedFirst ? filteredGyms.find(g => g.id === pinnedFirst) : null;
    const rest = pinnedFirst ? filteredGyms.filter(g => g.id !== pinnedFirst) : filteredGyms;
    const ordered = pinned ? [pinned, ...rest] : rest;
    return (
      <>
        {ordered.slice(0, 100).map(gym => (
          <GymCard
            key={gym.id}
            gym={gym}
            isSelected={expandedGym === gym.id}
            isMobile={isMobile}
            onClick={() => handleCardClick(gym.id)}
            distanceKm={sortOrigin ? haversine(sortOrigin.lat, sortOrigin.lng, gym.lat, gym.lng) : undefined}
            useKm={useKm}
            isStartingSoon={isStartingSoon(gym)}
            ratingAvg={ratingsAgg[gym.id]?.avg ?? null}
            ratingCount={ratingsAgg[gym.id]?.count ?? 0}
            onRated={reloadAggregates}
            onCityClick={handleCityClick}
          />
        ))}
        {filteredGyms.length > 100 && (
          <div style={{ padding: '12px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
            Showing 100 of {filteredGyms.length.toLocaleString()}{sortOrigin ? ' (closest first)' : ''} — use filters or map to narrow down
          </div>
        )}
      </>
    );
  })();

  function clearSelectedGym() {
    setExpandedGym(null);
    setSelectedGym(null);
  }

  // Close button for overlay card
  const closeOverlayBtn = (
    <button
      onClick={clearSelectedGym}
      style={{
        position: 'absolute', top: 10, right: 10, zIndex: 10,
        background: 'var(--surface-raised)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-full)', width: 22, height: 22,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1, padding: 0,
      }}
    >✕</button>
  );

  // GPS button (flash only)
  const gpsBtn = (label: string) => (
    <button
      onClick={handleGpsClick}
      disabled={geocoding}
      className={gpsFlashing ? 'btn-flash' : ''}
      title="Sort by distance from your location"
      style={{
        padding: '3px 10px', borderRadius: 'var(--radius-full)', flexShrink: 0,
        border: '1.5px solid var(--bone)', background: 'transparent',
        color: 'var(--bone)',
        fontSize: 11, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
        cursor: geocoding ? 'wait' : 'pointer', whiteSpace: 'nowrap',
      }}
    >{label}</button>
  );

  // Pin button (persistent)
  const pinBtnLabel = isPinActive ? 'Clear pin' : pinDropMode ? 'Click map…' : 'Sort from pin';
  const pinBtn = (
    <button
      onClick={handleDropPinClick}
      title={isPinActive ? 'Remove pin' : 'Click the map to drop a sort pin'}
      style={{
        padding: '3px 10px', borderRadius: 'var(--radius-full)', flexShrink: 0,
        border: `1.5px solid ${isPinActive || pinDropMode ? 'var(--accent)' : 'var(--bone)'}`,
        background: isPinActive || pinDropMode ? 'var(--accent)' : 'transparent',
        color: 'var(--bone)',
        fontSize: 11, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
        cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >{pinBtnLabel}</button>
  );

  // Shared map props
  const mapProps = {
    gyms: filteredGyms,
    selectedGym,
    onGymSelect: handleMapGymSelect,
    region,
    flyToLocation: mapFlyTarget,
    pinDropMode,
    onPinDrop: handlePinDrop,
    onZoomChange: handleZoomChange,
    onBoundsChange: handleBoundsChange,
    pinLocation: sortLocation ? { lat: sortLocation.lat, lng: sortLocation.lng } : null,
    isGpsLocation: isGpsActive,
    onMapClick: clearSelectedGym,
  };

  // Gym card shown at bottom-center when a gym is selected (not in expanded list)
  const overlayGym = (!listExpanded && expandedGym)
    ? filteredGyms.find(g => g.id === expandedGym) ?? null
    : null;

  // ── MOBILE ──────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <Filters
          selectedDisciplines={selectedDisciplines} selectedDays={selectedDays}
          freeOnly={freeOnly} startingSoonOnly={startingSoonOnly} region={region}
          onDisciplineToggle={toggleDiscipline} onDayToggle={toggleDay}
          onFreeOnlyToggle={() => setFreeOnly(v => !v)}
          onStartingSoonToggle={() => setStartingSoonOnly(v => !v)}
          onRegionChange={handleRegionChange}
          onReset={resetFilters}
          resultCount={loading ? 0 : filteredGyms.length}
          isMobile
        />
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 4, borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '2px solid var(--map-border)', boxShadow: 'var(--shadow-md)' }}>
            <Map {...mapProps} />
          </div>
          {/* Mobile bottom sheet */}
          <div className="bottom-sheet" style={{ height: mobileSheetOpen ? '65%' : 52 }}>
            <div
              style={{ padding: '10px 0 8px', cursor: 'pointer', flexShrink: 0 }}
              onClick={() => setMobileSheetOpen(v => !v)}
            >
              <div className="bottom-sheet-handle" />
              {!mobileSheetOpen && (
                <div style={{ textAlign: 'center', marginTop: 6, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', fontFamily: "'Inter Tight', sans-serif" }}>
                  {loading ? 'Loading…' : `${filteredGyms.length.toLocaleString()} gym${filteredGyms.length !== 1 ? 's' : ''} — tap to browse`}
                </div>
              )}
            </div>
            {mobileSheetOpen && (
              <div className="no-scrollbar" style={{ overflowY: 'auto', flex: 1, padding: '0 8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sortPills}
                {featuredPills}
                {gymCards}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── DESKTOP (always full-screen) ─────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

        {/* Map — fills everything */}
        <div style={{ position: 'absolute', inset: 0 }}>
          <Map
            {...mapProps}
            hideStyleSwitcher
            hideNavigationControl
            controllerRef={mapControllerRef}
            onStyleChange={key => setMapStyleKey(key)}
          />
        </div>

        {/* Gym list panel — drops below controls bar, left-aligned with it */}
        {listVisible && !listExpanded && (
          <div
            className="no-scrollbar"
            style={{
              position: 'absolute', top: filterOpen ? 112 : 56, left: 12, bottom: 0, width: LIST_W,
              zIndex: 500, overflowY: 'auto',
              padding: '4px 0 10px', display: 'flex', flexDirection: 'column', gap: 8,
              transition: 'top 0.15s ease',
            }}
          >
            {sortPills}
            {featuredPills}
            {gymCards}
          </div>
        )}

        {/* Controls bar — logo · | · list · expand · | · styles · filters · | · zoom */}
        <div
          className="map-toolbar-float"
          style={{
            position: 'absolute', top: 12, left: 12, zIndex: 600,
            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          {/* MatFinder logo — home link */}
          <Link href="/" style={{
            fontFamily: "'Archivo Black', sans-serif",
            fontSize: 14, color: 'var(--text-primary)',
            textDecoration: 'none', flexShrink: 0, padding: '0 4px',
            letterSpacing: '-0.01em',
          }}>MatFinder</Link>

          <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />

          {/* List toggle — far left */}
          <button
            onClick={() => setListVisible(v => !v)}
            style={{
              padding: '3px 10px', borderRadius: 'var(--radius-full)', flexShrink: 0,
              border: `1.5px solid ${listVisible ? 'var(--accent)' : 'var(--border)'}`,
              background: listVisible ? 'var(--accent)' : 'transparent',
              color: 'var(--bone)',
              fontSize: 11, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >List</button>

          {/* Expand list — nav action, visually distinct from toggles */}
          {listVisible && (
            <button
              onClick={() => setListExpanded(true)}
              style={{
                padding: '3px 10px', borderRadius: 'var(--radius-full)', flexShrink: 0,
                border: '1.5px solid var(--bone)',
                background: 'transparent',
                color: 'var(--bone)',
                fontSize: 11, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >Expand</button>
          )}

          <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />

          {/* Map style pills — light excluded */}
          {Object.entries(MAP_STYLES).map(([key, { label }]) => (
            <button
              key={key}
              onClick={() => handleStyleChange(key)}
              style={{
                padding: '3px 9px', borderRadius: 'var(--radius-full)', flexShrink: 0,
                border: `1.5px solid ${mapStyleKey === key ? 'var(--accent)' : 'var(--border)'}`,
                background: mapStyleKey === key ? 'var(--accent)' : 'transparent',
                color: 'var(--bone)',
                fontSize: 11, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >{label}</button>
          ))}

          <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />

          {/* Filters */}
          <button
            onClick={() => setFilterOpen(v => !v)}
            style={{
              padding: '3px 10px', borderRadius: 'var(--radius-full)', flexShrink: 0,
              border: `1.5px solid ${filterOpen || activeFilterCount > 0 ? 'var(--accent)' : 'var(--border)'}`,
              background: filterOpen ? 'var(--accent)' : 'transparent',
              color: 'var(--bone)',
              fontSize: 11, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
              cursor: 'pointer', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            Filters
            {activeFilterCount > 0 && (
              <span style={{
                background: filterOpen ? 'rgba(255,255,255,0.3)' : 'var(--accent)', color: 'var(--bone)',
                borderRadius: 'var(--radius-full)', padding: '0 5px', fontSize: 10, fontWeight: 700,
              }}>{activeFilterCount}</span>
            )}
          </button>

          {/* km/mi toggle */}
          <button
            onClick={toggleUnits}
            title={useKm ? 'Switch to miles' : 'Switch to kilometers'}
            style={{
              padding: '3px 8px', borderRadius: 'var(--radius-full)', flexShrink: 0,
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--bone)',
              fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
              cursor: 'pointer', whiteSpace: 'nowrap', letterSpacing: '0.02em',
            }}
          >{useKm ? 'km' : 'mi'}</button>

          <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />

          {/* Zoom — far right, animation restarts on every click */}
          <button
            ref={zoomInBtnRef}
            onClick={() => { triggerZoomFlash(zoomInBtnRef, zoomInTimeoutRef); mapControllerRef.current?.zoomIn(); }}
            title="Zoom in"
            style={{
              width: 26, height: 26, borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--bone)', fontSize: 16, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              lineHeight: 1, padding: 0, flexShrink: 0,
            }}>+</button>
          <button
            ref={zoomOutBtnRef}
            onClick={() => { triggerZoomFlash(zoomOutBtnRef, zoomOutTimeoutRef); mapControllerRef.current?.zoomOut(); }}
            title="Zoom out"
            style={{
              width: 26, height: 26, borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--bone)', fontSize: 16, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              lineHeight: 1, padding: 0, flexShrink: 0,
            }}>−</button>

          <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />

          {/* Search bar — independent of the list, lives in the toolbar */}
          {searchBar}

          {/* Total gym count badge — highlighted, beside the search box */}
          <span
            title={`${allGyms.length.toLocaleString()} gyms in MatFinder`}
            style={{
              display: 'inline-flex', alignItems: 'baseline', gap: 4,
              padding: '3px 10px', borderRadius: 'var(--radius-full)',
              background: 'rgba(201,162,74,0.18)',
              border: '1.5px solid #C9A24A',
              color: '#C9A24A',
              fontFamily: "'Inter Tight', sans-serif",
              whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 800 }}>
              {allGyms.length.toLocaleString()}
            </span>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em' }}>GYMS</span>
          </span>
        </div>

        {/* Filter bar — horizontal row below the primary toolbar */}
        {filterOpen && (
          <div
            className="map-toolbar-float no-scrollbar"
            style={{
              position: 'absolute',
              top: 56,
              left: 12,
              right: 12,
              zIndex: 700,
              overflowX: 'auto',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <Filters
              selectedDisciplines={selectedDisciplines} selectedDays={selectedDays}
              freeOnly={freeOnly} startingSoonOnly={startingSoonOnly} region={region}
              onDisciplineToggle={toggleDiscipline} onDayToggle={toggleDay}
              onFreeOnlyToggle={() => setFreeOnly(v => !v)}
              onStartingSoonToggle={() => setStartingSoonOnly(v => !v)}
              onRegionChange={handleRegionChange}
              onReset={resetFilters}
              resultCount={loading ? 0 : filteredGyms.length}
              noBackground
              horizontalExpand
            />
          </div>
        )}

        {/* Secondary nav tab — GPS · pin · Add Gym */}
        <div
          className="map-toolbar-float"
          style={{
            position: 'absolute', top: 12, right: 12, zIndex: 600,
            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          {gpsBtn('My location')}
          {geoError && (
            <span style={{ fontSize: 11, color: 'var(--danger)', fontFamily: "'Inter Tight', sans-serif", whiteSpace: 'nowrap' }}>
              {geoError}
            </span>
          )}
          <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
          {pinBtn}
          <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
          <Link
            href="/add-gym"
            style={{
              padding: '3px 10px', borderRadius: 'var(--radius-full)', flexShrink: 0,
              border: '1.5px solid var(--bone)', background: 'transparent',
              color: 'var(--bone)',
              fontSize: 11, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
              textDecoration: 'none', whiteSpace: 'nowrap',
            }}
          >Add Gym</Link>
          <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
          <Link
            href="/favorites"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 10px', borderRadius: 'var(--radius-full)', flexShrink: 0,
              border: '1.5px solid var(--bone)', background: 'transparent',
              color: 'var(--bone)',
              fontSize: 11, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
              textDecoration: 'none', whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: 12 }}>♥</span>
            Favorites
          </Link>
          <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
          <ProfileDropdown
            gymNameById={gymNameById}
            onGymClick={(gymId) => {
              handleMapGymSelect(gymId);
            }}
          />
        </div>

        {/* Privacy & Terms — bottom right, unobtrusive */}
        <div style={{
          position: 'absolute', bottom: 8, right: 12, zIndex: 400,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Link href="/privacy" style={{ fontSize: 12, color: 'rgba(245,241,232,0.60)', fontFamily: "'Inter Tight', sans-serif", textDecoration: 'none' }}>Privacy</Link>
          <Link href="/terms" style={{ fontSize: 12, color: 'rgba(245,241,232,0.60)', fontFamily: "'Inter Tight', sans-serif", textDecoration: 'none' }}>Terms</Link>
        </div>

        {/* Selected gym card — bottom center, not shown during expanded list */}
        {overlayGym && (
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', bottom: 28, left: '50%', transform: 'translateX(-50%)',
              width: 400, maxHeight: '60%', overflowY: 'auto',
              zIndex: 900, borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xl)',
            }}
          >
            <div style={{ position: 'relative' }}>
              {closeOverlayBtn}
              <GymCard
                gym={overlayGym} isSelected={true} isMobile={false} mapOverlay={true}
                onClick={() => {}}
                distanceKm={sortOrigin ? haversine(sortOrigin.lat, sortOrigin.lng, overlayGym.lat, overlayGym.lng) : undefined}
                useKm={useKm}
                isStartingSoon={isStartingSoon(overlayGym)}
                ratingAvg={ratingsAgg[overlayGym.id]?.avg ?? null}
                ratingCount={ratingsAgg[overlayGym.id]?.count ?? 0}
                onRated={reloadAggregates}
                onCityClick={handleCityClick}
              />
            </div>
          </div>
        )}

        {/* Expanded list overlay — full coverage, map visible behind */}
        {listExpanded && (
          <div
            className="expanded-list-overlay no-scrollbar"
            style={{
              position: 'absolute', inset: 0, zIndex: 800,
              overflowY: 'auto',
              display: 'flex', flexDirection: 'column',
            }}
          >
            {/* Sticky header + filters */}
            <div style={{
              position: 'sticky', top: 0, zIndex: 1,
              background: 'inherit',
              backdropFilter: 'blur(8px)',
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 20px',
              }}>
                <span style={{
                  fontFamily: "'Inter Tight', sans-serif",
                  fontWeight: 700, fontSize: 14,
                  color: 'var(--text-primary)',
                }}>
                  {loading ? 'Loading…' : `${filteredGyms.length.toLocaleString()} gym${filteredGyms.length !== 1 ? 's' : ''}`}
                  {sortOrigin && <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12 }}> — sorted by distance</span>}
                </span>
                <button
                  onClick={() => setListExpanded(false)}
                  style={{
                    padding: '5px 14px', borderRadius: 'var(--radius-full)',
                    border: '1.5px solid var(--border)', background: 'transparent',
                    color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600,
                    fontFamily: "'Inter Tight', sans-serif", cursor: 'pointer',
                  }}
                >Exit List ✕</button>
              </div>
              <Filters
                selectedDisciplines={selectedDisciplines} selectedDays={selectedDays}
                freeOnly={freeOnly} startingSoonOnly={startingSoonOnly} region={region}
                onDisciplineToggle={toggleDiscipline} onDayToggle={toggleDay}
                onFreeOnlyToggle={() => setFreeOnly(v => !v)}
                onStartingSoonToggle={() => setStartingSoonOnly(v => !v)}
                onRegionChange={handleRegionChange}
                onReset={resetFilters}
                resultCount={loading ? 0 : filteredGyms.length}
              />
            </div>

            <div style={{ padding: '12px 20px 0', maxWidth: 1280, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sortPills}
              {featuredPills}
            </div>

            {/* Cards in a responsive grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
              gap: 12,
              padding: 20,
              maxWidth: 1280,
              width: '100%',
              margin: '0 auto',
            }}>
              {gymCards}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
