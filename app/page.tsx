'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Gym, Discipline, DayOfWeek, Region, REGION_BOUNDS } from '@/lib/types';
import { MAP_STYLES, type MapController } from '@/components/Map';
import GymCard from '@/components/GymCard';
import Filters from '@/components/Filters';
import ProfileDropdown from '@/components/ProfileDropdown';
import DisciplineOnboarding from '@/components/DisciplineOnboarding';
import { useFavorites } from '@/components/FavoritesProvider';
import { useAuth } from '@/components/AuthProvider';
import { supabase, supabaseEnabled } from '@/lib/supabase';
import { trackEvent } from '@/lib/track';
import { useOwnedGyms } from '@/lib/useOwnedGyms';

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

// Countries where unverified gyms are shown in the default view.
// US + Canada + Australia + major Western European countries have established
// enough BJJ scenes that community-submitted listings are considered reliable
// without requiring a verified schedule or website.
const TRUSTED_COUNTRIES = new Set([
  'US', 'CA', 'AU', 'NZ',               // Anglosphere
  'UK', 'DE', 'FR', 'ES', 'IT',         // Major Western Europe
  'NL', 'BE', 'AT', 'CH', 'SE',         // More Western Europe
  'NO', 'DK', 'FI', 'PT', 'IE',         // More Western Europe
]);

export default function Home() {
  const [allGyms, setAllGyms] = useState<Gym[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [selectedDisciplines, setSelectedDisciplines] = useState<Discipline[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('matfinder_disciplines');
      if (saved) return JSON.parse(saved) as Discipline[];
    } catch { /* ignore */ }
    return [];
  });
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([]);
  const [freeOnly, setFreeOnly] = useState(false);
  const [startingSoonOnly, setStartingSoonOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  // Default ON so the world map is visually full on first load — every
  // gym (verified, community-listed, no-website) shows across the globe.
  // Selecting a filter from the panel narrows it from there.
  const [showUnverifiedGyms, setShowUnverifiedGyms] = useState(true);
  const [favoritedOnly, setFavoritedOnly] = useState(false);
  // Favorited gym IDs — used by the gold-pulse pin layer AND by the
  // "Favorited only" filter pill. Pulled here (not at the bottom) so
  // the filteredGyms useMemo below can reference it.
  const { favorites: favoritedIds } = useFavorites();
  const { session, tier } = useAuth();
  const userId = session?.user?.id;
  // Verified gym ownership — drives the "Manage Gym" entry points
  // (right-rail pill on desktop, dropdown link in the Account tab).
  const ownedGymIds = useOwnedGyms();
  const ownerHref = ownedGymIds.length === 1
    ? `/owner/${ownedGymIds[0]}`
    : '/owner';
  const [selectedRegions, setSelectedRegions] = useState<Region[]>([]);
  // Derived "primary" region for places that still expect a single value (last-clicked or 'all').
  const region: Region = selectedRegions.length > 0 ? selectedRegions[selectedRegions.length - 1] : 'all';

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
  // Trailing-7-day check-in counts per gym. Drives the "X trained here
  // this week" social-proof badge AND the Popular sort tab.
  const [checkinCounts, setCheckinCounts] = useState<Record<string, number>>({});
  // Distinct gym IDs the current user has checked in at — used to render
  // visited pins with a bone outline ring on the map.
  const [visitedIds, setVisitedIds] = useState<Set<string>>(new Set());
  // Auto-pick km vs mi based on the user's locale. The four jurisdictions
  // that still default to imperial road distances are the US (en-US),
  // United Kingdom (en-GB), Liberia (en-LR) and Myanmar (my-MM); everyone
  // else gets kilometres. No user-facing toggle — the chosen unit just
  // appears throughout the app.
  const [useKm, setUseKm] = useState(true);
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const region = (navigator.language || '').split('-')[1]?.toUpperCase();
    const imperialRegions = new Set(['US', 'GB', 'LR', 'MM']);
    setUseKm(!region || !imperialRegions.has(region));
  }, []);

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
  const [isLandscape, setIsLandscape] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  // Mobile redesign: tab view + pin-tap peek + full-screen detail
  const [mobileView, setMobileView] = useState<'map' | 'list'>('map');
  const [peekGymId, setPeekGymId] = useState<string | null>(null);
  const [fullCardGymId, setFullCardGymId] = useState<string | null>(null);

  // Full-screen-only UI states
  const [listVisible, setListVisible] = useState(true);
  // listExpanded was the desktop full-page list overlay; feature removed.
  const listExpanded = false;
  const [filterOpen, setFilterOpen] = useState(false);
  const [mapStyleKey, setMapStyleKey] = useState('outdoors');
  // Map style picker — toggle (stays open until clicked off / re-toggled).
  const [mapStyleOpen, setMapStyleOpen] = useState(false);
  const mapControllerRef = useRef<MapController | null>(null);
  const [openFavoritesRequest, setOpenFavoritesRequest] = useState(0);

  // Close the filter dropdown when the user scrolls / drags / wheels / taps
  // anywhere outside the filter panel itself. The panel is tagged with
  // `data-filter-panel` so we can ignore events that originate inside it.
  // The toggle button is tagged with `data-filter-toggle` so clicking the
  // button to close doesn't fight the listener. All listeners are passive
  // so the underlying gesture (Mapbox pan/zoom, scroll) still happens.
  useEffect(() => {
    if (!filterOpen) return;
    const onMotion = (e: Event) => {
      const target = e.target as Element | null;
      if (target?.closest?.('[data-filter-panel]')) return;
      if (target?.closest?.('[data-filter-toggle]')) return;
      setFilterOpen(false);
    };
    // `capture: true` so we hear the event before any element below us can
    // call stopPropagation (Mapbox does this on its canvas).
    const opts: AddEventListenerOptions = { passive: true, capture: true };
    window.addEventListener('wheel', onMotion, opts);
    window.addEventListener('touchstart', onMotion, opts);
    window.addEventListener('touchmove', onMotion, opts);
    window.addEventListener('mousedown', onMotion, opts);
    return () => {
      window.removeEventListener('wheel', onMotion, opts);
      window.removeEventListener('touchstart', onMotion, opts);
      window.removeEventListener('touchmove', onMotion, opts);
      window.removeEventListener('mousedown', onMotion, opts);
    };
  }, [filterOpen]);

  const isGpsActive = sortLocation?.label === 'Your location';
  const isPinActive = sortLocation?.label === 'Dropped pin';
  const usingMapCenter = !sortLocation && mapZoom >= 9 && !!mapCenter;

  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Landscape phones: wider than 640 but short (< 500px tall) and not a tablet/desktop
      const landscapeMobile = h < 500 && w < 1024;
      setIsMobile(w < 640 || landscapeMobile);
      setIsLandscape(h < 500);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const skip = localStorage.getItem('matfinder_skip_onboarding');
    const shownThisSession = sessionStorage.getItem('matfinder_onboarding_shown');
    if (!skip && !shownThisSession) {
      setShowOnboarding(true);
      sessionStorage.setItem('matfinder_onboarding_shown', '1');
    }
  }, []);

  // Fetch the gyms client-side. Layout adds a `<link rel="preload">`
  // for /api/gyms so this fetch hits the HTTP cache instantly on first
  // paint — pins land within ~100ms instead of ~1s.
  useEffect(() => {
    fetch('/api/gyms')
      .then(r => r.json())
      .then((data: Gym[]) => { setAllGyms(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const reloadAggregates = useCallback(() => {
    fetch('/api/ratings')
      .then(r => r.json())
      .then(d => setRatingsAgg(d.aggregates ?? {}))
      .catch(() => {});
  }, []);

  useEffect(() => { reloadAggregates(); }, [reloadAggregates]);

  // Pull the global 7-day check-in counts (anonymous aggregate). Refreshes
  // when the user checks in via the modal — see CheckInButton onSubmit.
  useEffect(() => {
    fetch('/api/checkin-counts')
      .then(r => r.json())
      .then(d => setCheckinCounts(d.counts ?? {}))
      .catch(() => {});
  }, []);

  // Pull this user's distinct visited gym IDs once on sign-in. Used to
  // render visited pins on the map with a bone outline ring.
  // Pro-only feature — non-Pro users get an empty set so no rings render
  // even though their check-ins are still saved server-side.
  useEffect(() => {
    if (!userId || !supabaseEnabled || tier !== 'pro') { setVisitedIds(new Set()); return; }
    let cancelled = false;
    supabase.from('checkins').select('gym_id').eq('user_id', userId).then(({ data }) => {
      if (cancelled || !data) return;
      setVisitedIds(new Set(data.map(r => r.gym_id).filter(Boolean) as string[]));
    });
    return () => { cancelled = true; };
  }, [userId, tier]);

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
      // Mapbox occasionally returns mixed-case names (e.g. "united states");
      // Title-case the first letter of every word for consistent chip display
      // across landscape, portrait, and desktop.
      const rawLabel = feat.text ?? feat.place_name?.split(',')[0] ?? q;
      const label = String(rawLabel).replace(/\b\w/g, (c) => c.toUpperCase());
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

    // PRIORITY 1: gym-name match. If the typed query matches a gym name,
    // navigate to that gym instead of geocoding the query as a place.
    // This fixes the bug where searching for a gym whose name contains
    // "Austin" or "Texas" would land you on the city/state instead of
    // the gym itself.
    //
    // Match logic, in order:
    //   (a) exact-name match (case-insensitive)        → that gym
    //   (b) starts-with match — closest to user wins   → that gym
    //   (c) any substring match — closest to user wins → that gym
    //   (d) no gym match                                → fall through
    //                                                     to geocoder
    const ql = q.toLowerCase();
    const exact = allGyms.find(g => g.name.toLowerCase() === ql);
    let chosen = exact;
    if (!chosen) {
      const starts = allGyms.filter(g => g.name.toLowerCase().startsWith(ql));
      const subs = starts.length > 0 ? starts
                  : allGyms.filter(g => g.name.toLowerCase().includes(ql));
      if (subs.length > 0) {
        // Tie-break by distance to the current sort origin / map center
        // so a "Corsair" search picks the nearest Corsair in a multi-
        // location chain.
        const ref = sortOrigin ?? mapCenter;
        if (ref && subs.length > 1) {
          subs.sort((a, b) =>
            haversine(ref.lat, ref.lng, a.lat, a.lng) -
            haversine(ref.lat, ref.lng, b.lat, b.lng));
        }
        chosen = subs[0];
      }
    }
    if (chosen) {
      handleMapGymSelect(chosen.id);
      setMapFlyTarget({ lat: chosen.lat, lng: chosen.lng, zoom: 14 });
      setSearchInput('');
      return;
    }

    // PRIORITY 2: geocode as a place (city / state / country).
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

  // Auto-locate on first mount, BUT skip if we already located in this
  // browser session (e.g. user navigated to /favorites and came back —
  // their map state should be preserved instead of snapping back to
  // their current location). Restore the saved sort location + sort mode
  // from sessionStorage so distance sort, dropped pins, etc. survive
  // navigation. Also restores the previous fly target so the map opens
  // wherever the user left off.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = sessionStorage.getItem('matfinder_map_state');
      if (saved) {
        const s = JSON.parse(saved) as {
          sortLocation?: { lat: number; lng: number; label: string };
          sortMode?: SortMode;
          center?: { lat: number; lng: number; zoom: number };
        };
        if (s.sortLocation) setSortLocation(s.sortLocation);
        if (s.sortMode) setSortMode(s.sortMode);
        if (s.center) setMapFlyTarget(s.center);
        if (s.sortLocation || s.center) return; // skip auto-locate
      }
    } catch { /* ignore */ }

    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        homeLocationRef.current = { lat, lng };
        setSortLocation({ lat, lng, label: 'Your location' });
        setMapFlyTarget({ lat, lng, zoom: 11 });
        // Do NOT auto-flip sortMode here. Switching to 'featured' or
        // 'popular' triggers the ~35mi radius filter and hides every
        // gym outside that range — which is why users were only seeing
        // pins around their location. The map already flies to them;
        // they can pick a sort tab if they want a filtered view.
      },
      () => {},
      { timeout: 8000 }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist map state to sessionStorage on every relevant change so a
  // round-trip through /favorites or /account preserves it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem('matfinder_map_state', JSON.stringify({
        sortLocation,
        sortMode,
        center: mapFlyTarget,
      }));
    } catch { /* quota / safari private */ }
  }, [sortLocation, sortMode, mapFlyTarget]);

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
    if (r === 'all') {
      setSelectedRegions([]);
      setMapFlyTarget(REGION_FLYTO['all']);
      return;
    }
    setSelectedRegions(prev => {
      const has = prev.includes(r);
      if (has) {
        const next = prev.filter(x => x !== r);
        // If this was the last one, fly to world view
        if (next.length === 0) setMapFlyTarget(REGION_FLYTO['all']);
        return next;
      }
      // Add and fly to it
      setMapFlyTarget(REGION_FLYTO[r]);
      return [...prev, r];
    });
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
    const nameQuery = searchInput.trim().toLowerCase();
    const filtered = allGyms.filter((gym) => {
      // Live gym-name search — applies as the user types. If the typed
      // string also happens to be a city/state/country, hitting Enter
      // promotes it to a search-region chip via the geocoder; until then
      // we just filter the list by name match.
      if (nameQuery && !gym.name.toLowerCase().includes(nameQuery)) return false;

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

      // Favorited-only filter: gym must be in the user's saved set.
      if (favoritedOnly && !favoritedIds.has(gym.id)) return false;

      // Verified-only filter: gym must have at least one verified open mat.
      const hasVerified = gym.open_mats.some(m => m.verified === true);
      if (verifiedOnly && !hasVerified) return false;

      // Default view hides gyms where every open mat is unverified AND there's
      // no website — UNLESS the gym is in a trusted country (US + major Western
      // Europe) where the BJJ scene is established enough that community listings
      // are reliably accurate without requiring a verified schedule.
      if (!showUnverifiedGyms && !hasVerified && !gym.website) {
        if (!TRUSTED_COUNTRIES.has(gym.country)) return false;
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

    // Popular + Featured: lock to ~35mi radius around the user's location.
    // Falls back to the current map center when no GPS / sort pin is set
    // — so the Popular/Featured tabs work out of the box (previously they
    // showed nothing without a location). A live search already bounds the
    // area via bbox, so we skip the radius filter in that case.
    const popularOrigin = sortOrigin ?? mapCenter;
    if ((sortMode === 'popular' || sortMode === 'featured') && popularOrigin && searchRegions.length === 0) {
      arr = arr.filter(g => haversine(popularOrigin.lat, popularOrigin.lng, g.lat, g.lng) <= POPULAR_RADIUS_KM);
    }

    // Bayesian average — rewards both volume AND quality of ratings.
    // score = (count × avg + minVotes × globalAvg) / (count + minVotes)
    // A gym with few ratings gets pulled toward the global mean.
    const MIN_VOTES = 10;
    const ratingEntries = Object.values(ratingsAgg).filter(r => r.count > 0);
    const globalAvg = ratingEntries.length > 0
      ? ratingEntries.reduce((s, r) => s + r.avg, 0) / ratingEntries.length
      : 4;
    function bayesianScore(gymId: string): number {
      const r = ratingsAgg[gymId];
      if (!r || r.count === 0) return 0;
      return (r.count * r.avg + MIN_VOTES * globalAvg) / (r.count + MIN_VOTES);
    }

    if (sortMode === 'popular') {
      // Popular = most check-ins in the last 7 days. Tie-break by rating
      // so two equally-busy gyms still order sensibly. This is what
      // makes Popular a real social-proof signal vs. Featured (paid).
      arr.sort((a, b) => {
        const cb = checkinCounts[b.id] ?? 0;
        const ca = checkinCounts[a.id] ?? 0;
        if (cb !== ca) return cb - ca;
        return bayesianScore(b.id) - bayesianScore(a.id);
      });
    } else if (sortMode === 'featured') {
      arr.sort((a, b) => {
        const f = Number(!!b.featured) - Number(!!a.featured);
        if (f !== 0) return f;
        return bayesianScore(b.id) - bayesianScore(a.id);
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
  }, [allGyms, selectedDisciplines, selectedDays, freeOnly, startingSoonOnly, verifiedOnly, showUnverifiedGyms, favoritedOnly, favoritedIds, sortOrigin, sortReference, mapCenter, mapBounds, searchRegions, sortMode, ratingsAgg, checkinCounts, searchInput]);

  const featuredGyms = useMemo(
    () => filteredGyms.filter((g) => g.featured),
    [filteredGyms]
  );

  const gymNameById = useMemo(
    () => Object.fromEntries(allGyms.map(g => [g.id, g.name])) as Record<string, string>,
    [allGyms]
  );

  const toggleDiscipline = (d: Discipline) =>
    setSelectedDisciplines(prev => {
      const next = prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d];
      localStorage.setItem('matfinder_disciplines', JSON.stringify(next));
      return next;
    });

  // Bulk setter — used by the Filters panel's "Select all" / "Clear"
  // shortcuts. Persisted same as toggleDiscipline.
  const setDisciplines = (next: Discipline[]) => {
    setSelectedDisciplines(next);
    localStorage.setItem('matfinder_disciplines', JSON.stringify(next));
  };

  const toggleDay = (d: DayOfWeek) =>
    setSelectedDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  function resetFilters() {
    setSelectedDisciplines([]);
    setSelectedDays([]);
    setFreeOnly(false);
    setStartingSoonOnly(false);
    setVerifiedOnly(false);
    setShowUnverifiedGyms(true);  // default ON — world map full on reset
    setFavoritedOnly(false);
    setSelectedRegions([]);
  }

  function handleCardClick(gymId: string) {
    setSelectedGym(gymId);
    const willExpand = expandedGym !== gymId;
    setExpandedGym(prev => prev === gymId ? null : gymId);
    setPinnedFirst(null);
    if (willExpand) trackEvent('card_open', gymId);
  }

  function handleMapGymSelect(id: string) {
    setSelectedGym(id);
    setExpandedGym(id);
    // Pin taps + card opens are tracked here since this is the unified
    // entry point for both (Map pin clicks and search-result jumps).
    trackEvent('pin_tap', id);
    trackEvent('card_open', id);
    // Portrait mobile: pin tap → peek card (tap peek to open full-screen)
    if (isMobile && !isLandscape) setPeekGymId(id);
    // The list intentionally does NOT reorder on pin clicks anymore:
    //   - sortLocation stays where the user set it (GPS, dropped pin,
    //     last search city) so distances don't jump every tap.
    //   - pinnedFirst is no longer set, so the clicked gym doesn't bump
    //     to position 0 — list keeps its nearest-to-farthest order.
    // Instead we scroll the matching card into view, so the user can
    // see the expanded card without losing their place in the list.
    if (typeof window !== 'undefined') {
      requestAnimationFrame(() => {
        const card = document.querySelector<HTMLElement>(`[data-gym-id="${id}"]`);
        if (card) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }
  }

  const activeFilterCount =
    selectedDisciplines.length + selectedDays.length + (freeOnly ? 1 : 0) + (startingSoonOnly ? 1 : 0)
    + (verifiedOnly ? 1 : 0) + (!showUnverifiedGyms ? 1 : 0) + (favoritedOnly ? 1 : 0);

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
      padding: '4px 8px 4px 14px', borderRadius: 'var(--radius-md)',
      border: '1.5px solid var(--bone)',
      background: 'rgba(26,19,16,0.85)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      minHeight: 32, width: 480, maxWidth: '60vw', flexShrink: 0,
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
        type="search"
        enterKeyHint="done"
        inputMode="search"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commitSearch();
            (e.target as HTMLInputElement).blur();
          }
        }}
        onBlur={() => { if (searchInput.trim()) commitSearch(); }}
        placeholder={searchRegions.length > 0 ? 'Add Another…' : 'Gym, City, State, or Country'}
        disabled={searching}
        style={{
          flex: 1, minWidth: 220,
          padding: '4px 6px',
          border: 'none',
          background: 'transparent',
          color: 'var(--bone)',
          fontSize: 14, fontWeight: 500,
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
      { key: 'popular',  label: 'Popular' },
      { key: 'nearest',  label: 'Nearest', requiresLocation: true },
    ];
    return (
      <div
        className="map-toolbar-float"
        style={{
          position: 'sticky', top: 0, zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: 2,
          padding: '3px 4px', marginBottom: 6,
          // Stretch to the full width of the list panel so all three pills
          // can flow without overflowing horizontally.
          alignSelf: 'stretch', width: '100%',
          // Squared off (radius-md) so it shares geometry with the search
          // bar and gym cards; overrides map-toolbar-float's radius-lg.
          borderRadius: 'var(--radius-md)',
        }}
      >
        {opts.map((o, i) => {
          const active = sortMode === o.key;
          const disabled = !!(o.requiresLocation && !sortReference);
          return (
            <span key={o.key} style={{ display: 'inline-flex', alignItems: 'center', minWidth: 0 }}>
              {i > 0 && (
                <span style={{ width: 1, height: 12, background: 'rgba(245,241,232,0.20)', margin: '0 1px' }} />
              )}
              <button
                onClick={() => setSortMode(active ? 'default' : o.key)}
                disabled={disabled}
                title={disabled ? 'Set your location, drop a pin, or search a city first' : undefined}
                style={{
                  padding: '2px 7px', borderRadius: 'var(--radius-md)',
                  border: `1.5px solid ${active ? 'var(--bone)' : 'transparent'}`,
                  background: active ? 'var(--bone)' : 'transparent',
                  color: disabled ? 'rgba(245,241,232,0.35)' : active ? '#1A1310' : 'var(--bone)',
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

  // Shared gym cards list. Pass `compact` from the renderer (landscape uses true).
  function buildGymCards(opts?: { compact?: boolean }) {
    const isCompact = !!opts?.compact;
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
          <div key={gym.id} data-gym-id={gym.id}>
          <GymCard
            gym={gym}
            isSelected={expandedGym === gym.id}
            isMobile={isMobile}
            compact={isCompact}
            onClick={() => handleCardClick(gym.id)}
            distanceKm={sortOrigin ? haversine(sortOrigin.lat, sortOrigin.lng, gym.lat, gym.lng) : undefined}
            useKm={useKm}
            isStartingSoon={isStartingSoon(gym)}
            ratingAvg={ratingsAgg[gym.id]?.avg ?? null}
            ratingCount={ratingsAgg[gym.id]?.count ?? 0}
            onRated={reloadAggregates}
            onCityClick={handleCityClick}
            weeklyCheckins={checkinCounts[gym.id] ?? 0}
          />
          </div>
        ))}
        {filteredGyms.length > 100 && (
          <div style={{ padding: '12px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
            Showing 100 of {filteredGyms.length.toLocaleString()}{sortOrigin ? ' (closest first)' : ''} — use filters or map to narrow down
          </div>
        )}
      </>
    );
  }
  const gymCards = buildGymCards();

  function clearSelectedGym() {
    setExpandedGym(null);
    setSelectedGym(null);
    // Drop the "pinned first" override so the list returns to its
    // natural sort order (Featured / Popular gyms reclaim the top
    // when you tap off the previously-selected card).
    setPinnedFirst(null);
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
        padding: '3px 10px', borderRadius: 'var(--radius-md)', flexShrink: 0,
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
        padding: '3px 10px', borderRadius: 'var(--radius-md)', flexShrink: 0,
        border: '1.5px solid var(--bone)',
        background: isPinActive || pinDropMode ? 'var(--bone)' : 'transparent',
        color: isPinActive || pinDropMode ? '#1A1310' : 'var(--bone)',
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
    favoritedIds,
    visitedIds,
    // Only show the pin marker for GPS or manually-dropped pins.
    // When the sort location came from clicking a gym card we still sort by
    // distance, but we don't clutter the map with a tan dot on top of the gym pin.
    pinLocation: (isGpsActive || isPinActive) && sortLocation
      ? { lat: sortLocation.lat, lng: sortLocation.lng }
      : null,
    isGpsLocation: isGpsActive,
    onMapClick: clearSelectedGym,
  };

  // Gym card shown at bottom-center when a gym is selected (not in expanded list)
  const overlayGym = (!listExpanded && expandedGym)
    ? filteredGyms.find(g => g.id === expandedGym) ?? null
    : null;

  function handleOnboardingConfirm(disciplines: Discipline[]) {
    setSelectedDisciplines(disciplines);
    localStorage.setItem('matfinder_disciplines', JSON.stringify(disciplines));
    setShowOnboarding(false);
  }

  function handleDontShowAgain(disciplines: Discipline[]) {
    setSelectedDisciplines(disciplines);
    localStorage.setItem('matfinder_disciplines', JSON.stringify(disciplines));
    localStorage.setItem('matfinder_skip_onboarding', '1');
    setShowOnboarding(false);
  }

  // ── MOBILE ──────────────────────────────────────────────────────────────────
  if (isMobile) {
    const LS = isLandscape;
    const filterCount = selectedDisciplines.length + selectedDays.length + selectedRegions.length
      + (freeOnly ? 1 : 0) + (startingSoonOnly ? 1 : 0)
      + (verifiedOnly ? 1 : 0) + (!showUnverifiedGyms ? 1 : 0) + (favoritedOnly ? 1 : 0);

    // Reusable: top-row pill button base — solid brown @ 100% opacity for full legibility.
    // Squared corners (radius-md) on both orientations now — matches the
    // card / search bar / sort tab geometry.
    const topPillBase: React.CSSProperties = {
      padding: LS ? '3px 8px' : '5px 12px',
      borderRadius: 'var(--radius-md)',
      border: '1.5px solid var(--bone)',
      color: 'var(--bone)',
      fontSize: LS ? 10 : 12,
      fontWeight: 700,
      fontFamily: "'Inter Tight', sans-serif",
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--brown-700)',
      textDecoration: 'none',
    };

    // ── Action pills — portrait only.
    // Order (left → right): ★ Favorites · My Location · Sort from Pin.
    // Squared corners (radius-md) for visual consistency with cards / search. ──
    const actionPills = (
      <>
        {/* Favorites — star glyph. Navigates to the full /favorites page
            (same page desktop uses) so portrait mobile gets the cards +
            sort/filter/group controls, not just a name list. */}
        <Link
          href="/favorites"
          title="Favorites"
          aria-label="Favorites"
          style={{
            ...topPillBase,
            padding: '5px 14px',
            fontSize: 18, lineHeight: 1,
            textDecoration: 'none',
          }}
        >★</Link>

        {/* My Location — momentary flash, no persistent highlight */}
        <button
          onClick={() => {
            setGpsFlashing(true);
            setTimeout(() => setGpsFlashing(false), 500);
            if (!navigator.geolocation) { setGeoError('GPS unavailable'); return; }
            setGeocoding(true);
            navigator.geolocation.getCurrentPosition((pos) => {
              const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
              homeLocationRef.current = loc;
              setSortLocation({ ...loc, label: 'Your location' });
              setMapFlyTarget({ ...loc, zoom: 12 });
              setSortMode('nearest');
              setGeocoding(false);
            }, () => { setGeoError('GPS denied'); setGeocoding(false); });
          }}
          style={{
            ...topPillBase,
            ...(gpsFlashing ? { background: 'var(--bone)', color: '#1A1310' } : {}),
          }}
        >My Location</button>

        {/* Sort from Pin — full label so the action is unambiguous */}
        <button
          onClick={() => {
            if (isPinActive) { setSortLocation(null); setPinDropMode(false); }
            else setPinDropMode(v => !v);
          }}
          style={{
            ...topPillBase,
            ...(pinDropMode || isPinActive ? { background: 'var(--bone)', color: '#1A1310' } : {}),
          }}
        >{isPinActive ? 'Clear Pin' : pinDropMode ? 'Tap Map' : 'Sort from Pin'}</button>
      </>
    );

    // ── Search input — used in both portrait + landscape top row ──
    const searchInputEl = (
      <div style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
        {searchRegions.map(sr => (
          <span key={sr.id} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: LS ? 'rgba(245,241,232,0.15)' : 'var(--accent-muted)',
            borderRadius: 'var(--radius-full)',
            padding: '1px 6px 1px 8px', fontSize: 11, fontWeight: 600,
            color: LS ? 'var(--bone)' : 'var(--text-primary)',
            fontFamily: "'Inter Tight', sans-serif",
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {sr.label}
            <button onClick={() => removeSearchRegion(sr.id)} style={{
              background: 'none', border: 'none',
              color: LS ? 'var(--bone)' : 'var(--text-secondary)',
              cursor: 'pointer', padding: '0 2px', fontSize: 11, opacity: 0.7,
            }}>✕</button>
          </span>
        ))}
        <input
          // type=search shows a "search" key on iOS soft keyboards;
          // enterKeyHint=done shows an explicit "Done" key so the user
          // can dismiss the keyboard without tapping outside.
          type="search"
          enterKeyHint="done"
          inputMode="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitSearch();
              (e.target as HTMLInputElement).blur();
            }
          }}
          onBlur={() => { if (searchInput.trim()) commitSearch(); }}
          placeholder={searchRegions.length > 0 ? 'Add Another…' : 'Search Gym, City, State, or Country…'}
          disabled={searching}
          style={{
            // Squared corners (radius-md) on both orientations to match
            // the card / sort tab / action pill geometry across the app.
            flex: 1, minWidth: 0, height: LS ? 34 : 36,
            padding: '0 12px',
            borderRadius: 'var(--radius-md)',
            border: `1.5px solid ${LS ? 'var(--bone)' : 'var(--border)'}`,
            // Landscape: same translucency as the sort tab (88% brown glass).
            // Portrait: light surface-sunken + dark text.
            background: LS ? 'rgba(26,19,16,0.88)' : 'var(--surface-sunken)',
            backdropFilter: LS ? 'blur(10px)' : undefined,
            WebkitBackdropFilter: LS ? 'blur(10px)' : undefined,
            color: LS ? 'var(--bone)' : 'var(--text-primary)',
            // iOS zooms in when an input is focused if font-size < 16px.
            fontSize: 16, fontWeight: 500,
            fontFamily: "'Inter Tight', sans-serif", outline: 'none',
          }}
        />
        {(searchInput || searchRegions.length > 0) && !searching && (
          <button
            onClick={() => { setSearchInput(''); setSearchRegions([]); setSearchError(null); }}
            style={{
              background: 'transparent', border: 'none',
              color: LS ? 'var(--bone)' : 'var(--text-secondary)',
              cursor: 'pointer', fontSize: 14, padding: '0 4px', flexShrink: 0, opacity: 0.7,
            }}
          >✕</button>
        )}
      </div>
    );

    // ── Filter panel content (shared by portrait) ──
    // Solid dark-brown — matches the search bar's full opacity so the
    // filter dropdown reads as a peer surface rather than translucent glass.
    const filterPanel = filterOpen ? (
      <div className="no-scrollbar" style={{
        borderRadius: 'var(--radius-md)', overflow: 'auto', maxHeight: '70vh',
        background: 'var(--brown-800)',
        border: '1px solid var(--border)',
      }}>
        <Filters
          selectedDisciplines={selectedDisciplines} selectedDays={selectedDays}
          freeOnly={freeOnly} startingSoonOnly={startingSoonOnly}
          verifiedOnly={verifiedOnly} showUnverifiedGyms={showUnverifiedGyms}
          favoritedOnly={favoritedOnly}
          onVerifiedOnlyToggle={() => setVerifiedOnly(v => !v)}
          onShowUnverifiedToggle={() => setShowUnverifiedGyms(v => !v)}
          onFavoritedOnlyToggle={() => setFavoritedOnly(v => !v)}
          region={region}
          selectedRegions={selectedRegions}
          useKm={useKm}
          onDisciplineToggle={toggleDiscipline} onSetDisciplines={setDisciplines} onDayToggle={toggleDay}
          onFreeOnlyToggle={() => setFreeOnly(v => !v)}
          onStartingSoonToggle={() => setStartingSoonOnly(v => !v)}
          onRegionChange={handleRegionChange}
          onReset={resetFilters}
          resultCount={loading ? 0 : filteredGyms.length}
          noBackground
          allOpen
        />
      </div>
    ) : null;

    // ── Full-screen gym detail overlay (used by both orientations) ──
    const fullCardGym = fullCardGymId ? filteredGyms.find(g => g.id === fullCardGymId) : null;
    const fullCardOverlay = fullCardGym ? (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1500,
        background: 'var(--surface-base)', overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: 'var(--surface-raised)', borderBottom: '1px solid var(--border)',
          padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontFamily: "'Inter Tight', sans-serif", flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fullCardGym.name}
          </span>
          <button
            onClick={() => setFullCardGymId(null)}
            style={{
              background: 'transparent',
              border: '1.5px solid var(--bone)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontSize: 13, color: 'var(--text-primary)', fontWeight: 700,
              fontFamily: "'Inter Tight', sans-serif",
              padding: '6px 14px',
            }}
          >Back</button>
        </div>
        <div style={{ padding: '12px', flex: 1 }}>
          <GymCard
            gym={fullCardGym} isSelected={true} isMobile={true}
            onClick={() => {}}
            distanceKm={sortOrigin ? haversine(sortOrigin.lat, sortOrigin.lng, fullCardGym.lat, fullCardGym.lng) : undefined}
            useKm={useKm}
            isStartingSoon={isStartingSoon(fullCardGym)}
            ratingAvg={ratingsAgg[fullCardGym.id]?.avg ?? null}
            ratingCount={ratingsAgg[fullCardGym.id]?.count ?? 0}
            onRated={reloadAggregates}
            onCityClick={handleCityClick}
            weeklyCheckins={checkinCounts[fullCardGym.id] ?? 0}
          />
        </div>
      </div>
    ) : null;

    // ════════════════════════════════════════════════════════════════════
    // LANDSCAPE: split view — list (280px left) + map (right)
    // ════════════════════════════════════════════════════════════════════
    if (LS) {
      return (
        <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
          {showOnboarding && <DisciplineOnboarding initialDisciplines={selectedDisciplines} onConfirm={handleOnboardingConfirm} onDontShowAgain={handleDontShowAgain} />}

          {/* Map fills entire viewport (list overlays left side) */}
          <div style={{ position: 'absolute', inset: 0 }}>
            <Map {...mapProps} hideStyleSwitcher hideNavigationControl controllerRef={mapControllerRef} onStyleChange={key => setMapStyleKey(key)} />
          </div>

          {/* Top-left search bar — width unchanged from original. */}
          <div style={{
            position: 'fixed', top: 8, left: 8, zIndex: 700,
            width: 260, maxWidth: 'calc(50vw - 16px)',
            display: 'flex', alignItems: 'center',
          }}>
            {searchInputEl}
          </div>

          {/* Action strip — Filters · Favorites · Add Gym. One flex row
              with `gap` so the buttons can never overlap regardless of the
              filter-count badge. Sits to the right of the search bar. */}
          <div style={{
            position: 'fixed', top: 8,
            left: 'calc(min(260px, 50vw - 16px) + 8px + 6px)',
            zIndex: 700,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {/* Filters button — same translucent dark glass as the search
                input + sort tab so the row reads as one coherent strip. */}
            <button
              data-filter-toggle
              onClick={() => setFilterOpen(v => !v)}
              style={{
                height: 34, padding: '0 14px',
                borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--bone)',
                background: filterOpen ? 'var(--bone)' : 'rgba(26,19,16,0.88)',
                backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                color: filterOpen ? '#1A1310' : 'var(--bone)',
                fontSize: 12, fontWeight: 700,
                fontFamily: "'Inter Tight', sans-serif",
                cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}
            >
              Filters{filterCount > 0 && (
                <span style={{
                  background: filterOpen ? 'var(--brown-700)' : 'var(--bone)',
                  color: filterOpen ? 'var(--bone)' : 'var(--brown-800)',
                  borderRadius: 'var(--radius-sm)', padding: '0 5px',
                  fontSize: 9, fontWeight: 800, lineHeight: '13px', minWidth: 13, textAlign: 'center',
                }}>{filterCount}</span>
              )}
            </button>

            {/* Add Gym — sits between Filters and Favorites. Same
                bone-outlined dark-glass pill, links to /add-gym. */}
            <Link
              href="/add-gym"
              title="Add Gym"
              style={{
                height: 34, padding: '0 14px',
                borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--bone)',
                background: 'rgba(26,19,16,0.88)',
                backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                color: 'var(--bone)',
                fontSize: 12, fontWeight: 700,
                fontFamily: "'Inter Tight', sans-serif",
                cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                textDecoration: 'none',
              }}
            >Add Gym</Link>

            {/* Favorites star — sits on the far right of the action strip. */}
            <Link
              href="/favorites"
              title="Favorites"
              aria-label="Favorites"
              style={{
                height: 34, padding: '0 14px',
                borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--bone)',
                background: 'rgba(26,19,16,0.88)',
                backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                color: 'var(--bone)',
                fontSize: 18, lineHeight: 1, fontWeight: 700,
                fontFamily: "'Inter Tight', sans-serif",
                cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                textDecoration: 'none',
              }}
            >★</Link>
          </div>

          {/* Right-side action column — My Location, Sort from Pin, Profile.
              All anchored to top:8 so My Location is flush with the search row. */}
          <div style={{
            position: 'fixed', top: 8, right: 8, zIndex: 700,
            display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 4,
            minWidth: 110,
          }}>
            {/* My Location */}
            <button
              onClick={() => {
                setGpsFlashing(true);
                setTimeout(() => setGpsFlashing(false), 500);
                if (!navigator.geolocation) { setGeoError('GPS unavailable'); return; }
                setGeocoding(true);
                navigator.geolocation.getCurrentPosition((pos) => {
                  const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                  homeLocationRef.current = loc;
                  setSortLocation({ ...loc, label: 'Your location' });
                  setMapFlyTarget({ ...loc, zoom: 12 });
                  setSortMode('nearest');
                  setGeocoding(false);
                }, () => { setGeoError('GPS denied'); setGeocoding(false); });
              }}
              style={{
                ...topPillBase,
                width: '100%', justifyContent: 'center',
                ...(gpsFlashing ? { background: 'var(--bone)', color: '#1A1310' } : {}),
              }}
            >My Location</button>
            {/* Sort from Pin — same width as My Location */}
            <button
              onClick={() => {
                if (isPinActive) { setSortLocation(null); setPinDropMode(false); }
                else setPinDropMode(v => !v);
              }}
              style={{
                ...topPillBase,
                width: '100%', justifyContent: 'center',
                ...(pinDropMode || isPinActive ? { background: 'var(--bone)', color: '#1A1310' } : {}),
              }}
            >{isPinActive ? 'Clear Pin' : pinDropMode ? 'Tap Map' : 'Sort from Pin'}</button>
            {/* Profile — replaces the previous Favorites star */}
            <div style={{ alignSelf: 'flex-end' }}>
              <ProfileDropdown
                gymNameById={gymNameById}
                onGymClick={(gymId) => handleMapGymSelect(gymId)}
                mobile
                openFavoritesRequest={openFavoritesRequest}
              />
            </div>
          </div>

          {/* Filter dropdown — anchored top-right under the action row.
              Single bounded scroll container (no nested overflow), so the
              rounded corners stay visible whether or not content overflows.
              No transparent backdrop here — the window-level motion
              listener handles outside taps/swipes so the map can still
              receive the gesture. */}
          {filterOpen && (
            <div
              data-filter-panel
              className="no-scrollbar"
              style={{
                // Slot the dropdown into the empty middle of the screen —
                // right of the Filters button and left of the action
                // column. Top aligned to top:8 so it sits flush with the
                // My Location and Filters buttons.
                position: 'fixed', top: 8, zIndex: 720,
                left: 'calc(min(260px, 50vw - 16px) + 110px)',
                right: 130,
                maxHeight: 'calc(100dvh - 16px)',
                overflowY: 'auto',
                borderRadius: 'var(--radius-md)',
                // Solid surface to match the search bar's full opacity.
                background: 'var(--brown-800)',
                border: '1px solid var(--border)',
              }}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              onWheel={(e) => e.stopPropagation()}
            >
              <Filters
                selectedDisciplines={selectedDisciplines} selectedDays={selectedDays}
                freeOnly={freeOnly} startingSoonOnly={startingSoonOnly}
                verifiedOnly={verifiedOnly} showUnverifiedGyms={showUnverifiedGyms}
                favoritedOnly={favoritedOnly}
                onVerifiedOnlyToggle={() => setVerifiedOnly(v => !v)}
                onShowUnverifiedToggle={() => setShowUnverifiedGyms(v => !v)}
                onFavoritedOnlyToggle={() => setFavoritedOnly(v => !v)}
                region={region}
                selectedRegions={selectedRegions}
                useKm={useKm}
                onDisciplineToggle={toggleDiscipline} onSetDisciplines={setDisciplines} onDayToggle={toggleDay}
                onFreeOnlyToggle={() => setFreeOnly(v => !v)}
                onStartingSoonToggle={() => setStartingSoonOnly(v => !v)}
                onRegionChange={handleRegionChange}
                onReset={resetFilters}
                resultCount={loading ? 0 : filteredGyms.length}
                noBackground
                allOpen
                inlineDisciplineActions={false}
              />
            </div>
          )}

          {/* Sort tab — three free-floating pill buttons above the list.
              No wrapping panel/background; each button carries its own
              glass fill so it can never overlap-overlay the list below. */}
          <div
            style={{
              position: 'fixed', top: 44, left: 8, zIndex: 625, width: 240,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
            }}
            onTouchStart={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            {([
              { key: 'featured', label: 'Featured' },
              { key: 'popular', label: 'Popular' },
              { key: 'nearest', label: 'Nearest', requiresLoc: true },
            ] as { key: SortMode; label: string; requiresLoc?: boolean }[]).map((o) => {
              const active = sortMode === o.key;
              const disabled = !!(o.requiresLoc && !sortReference);
              return (
                <button
                  key={o.key}
                  onClick={() => setSortMode(active ? 'default' : o.key)}
                  disabled={disabled}
                  title={disabled ? 'Set your location, drop a pin, or search a city first' : undefined}
                  style={{
                    flex: 1,
                    padding: '4px 8px', borderRadius: 'var(--radius-md)',
                    border: '1.5px solid var(--bone)',
                    background: active ? 'var(--bone)' : 'rgba(26,19,16,0.88)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    color: disabled ? 'rgba(245,241,232,0.35)' : active ? '#1A1310' : 'var(--bone)',
                    fontSize: 11, fontWeight: 700,
                    fontFamily: "'Inter Tight', sans-serif",
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >{o.label}</button>
              );
            })}
          </div>

          {/* List panel — locked to viewport (position:fixed), starts BELOW
              the sort tab. Top offset matches the small gap between the
              search bar and the sort tab so the spacing reads evenly. */}
          <div
            className="no-scrollbar"
            style={{
              position: 'fixed', top: 76, bottom: 8, left: 8, zIndex: 620, width: 240,
              overflowY: 'auto',
              padding: '6px 6px 8px',
              display: 'flex', flexDirection: 'column', gap: 4,
              touchAction: 'pan-y',
              overscrollBehavior: 'contain',
              background: 'rgba(26,19,16,0.88)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
            }}
            data-gym-list
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {featuredPills}
            {buildGymCards({ compact: true })}
          </div>

          {/* Privacy / Terms — landscape mobile, snug against the Mapbox attribution */}
          <div style={{
            position: 'fixed', bottom: 6, right: 60, zIndex: 400,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Link href="/privacy" style={{ fontSize: 11, color: 'rgba(245,241,232,0.60)', fontFamily: "'Inter Tight', sans-serif", textDecoration: 'none' }}>Privacy</Link>
            <Link href="/terms" style={{ fontSize: 11, color: 'rgba(245,241,232,0.60)', fontFamily: "'Inter Tight', sans-serif", textDecoration: 'none' }}>Terms</Link>
          </div>

          {fullCardOverlay}
        </div>
      );
    }

    // ════════════════════════════════════════════════════════════════════
    // PORTRAIT: tab-based — Map view + List view, with bottom nav
    // ════════════════════════════════════════════════════════════════════
    return (
      <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
        {showOnboarding && <DisciplineOnboarding initialDisciplines={selectedDisciplines} onConfirm={handleOnboardingConfirm} onDontShowAgain={handleDontShowAgain} />}

        {/* Map (always rendered, behind list when list active) */}
        <div style={{ position: 'absolute', inset: 0 }}>
          <Map {...mapProps} hideStyleSwitcher hideNavigationControl controllerRef={mapControllerRef} onStyleChange={key => setMapStyleKey(key)} />
        </div>

        {/* TOP BAR — solid surface that visually merges with the list view.
            Full width, anchored to top, with safe-area padding for notched
            phones. Wrapping flex so region chips reflow under the input
            when many cities are searched. */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1100,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: 'calc(8px + env(safe-area-inset-top, 0px)) 12px 8px',
          background: 'var(--surface-base)',
          borderBottom: '1px solid var(--border)',
        }}>
          {searchInputEl}
          <ProfileDropdown
            gymNameById={gymNameById}
            onGymClick={(gymId) => handleMapGymSelect(gymId)}
            mobile
            openFavoritesRequest={openFavoritesRequest}
          />
        </div>

        {/* SECOND ROW: action pills (My Location, Pin, Favorites, Add Gym).
            Anchored just below the new solid top bar (which has variable
            height due to safe-area-inset). Visible only in Map view —
            List view covers this row. */}
        <div className="no-scrollbar" style={{
          position: 'absolute',
          top: 'calc(52px + env(safe-area-inset-top, 0px) + 8px)',
          left: 8, right: 8, zIndex: 700,
          display: 'flex', alignItems: 'center', gap: 6,
          overflowX: 'auto', whiteSpace: 'nowrap',
          padding: '4px 0',
        }}>
          {actionPills}
        </div>

        {/* LIST VIEW — full-screen overlay covering the action pills row.
            Sort pills are pinned in a fixed header section so the gym list
            scrolls UNDER nothing — header has its own opaque background. */}
        {mobileView === 'list' && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(52px + env(safe-area-inset-top, 0px))',
              left: 0, right: 0, bottom: 64,
              zIndex: 1050, // above action row (700) but below top row (1100)
              background: 'var(--surface-base)',
              display: 'flex', flexDirection: 'column',
            }}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            {/* Fixed sort-pills header — solid bg so list can't bleed through */}
            <div style={{
              flexShrink: 0,
              background: 'var(--surface-base)',
              borderBottom: '1px solid var(--border)',
              padding: '8px 10px',
              boxShadow: 'var(--shadow-sm)',
            }}>
              {sortPills}
            </div>

            {/* Scrollable list body — featured pills + gym cards */}
            <div
              className="no-scrollbar"
              data-gym-list
              style={{
                flex: 1, overflowY: 'auto',
                padding: '10px 10px 16px',
                display: 'flex', flexDirection: 'column', gap: 8,
              }}
            >
              {featuredPills}
              {gymCards}
            </div>
          </div>
        )}

        {/* PIN PEEK CARD — bottom-anchored above bottom nav, only on Map view */}
        {mobileView === 'map' && peekGymId && (() => {
          const gym = filteredGyms.find(g => g.id === peekGymId);
          if (!gym) return null;
          return (
            <div
              onClick={(e) => { e.stopPropagation(); setFullCardGymId(peekGymId); }}
              style={{
                position: 'absolute', bottom: 72, left: 8, right: 8, zIndex: 800,
                background: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-xl)',
                padding: '10px 12px',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "'Inter Tight', sans-serif", fontWeight: 700,
                  fontSize: 14, color: 'var(--text-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{gym.name}</div>
                <div style={{
                  fontFamily: "'Inter Tight', sans-serif", fontSize: 11,
                  color: 'var(--text-secondary)', marginTop: 2,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {[gym.city, gym.state].filter(Boolean).join(', ')}
                  {sortOrigin && (() => {
                    const km = haversine(sortOrigin.lat, sortOrigin.lng, gym.lat, gym.lng);
                    const v = useKm ? km : km * 0.621371;
                    return ` · ${v.toFixed(1)} ${useKm ? 'km' : 'mi'}`;
                  })()}
                </div>
                <div style={{
                  fontFamily: "'Inter Tight', sans-serif", fontSize: 10,
                  color: 'var(--bone)', marginTop: 4, fontWeight: 700,
                }}>Tap for full details</div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setPeekGymId(null); clearSelectedGym(); }}
                style={{
                  background: 'transparent', border: 'none', color: 'var(--text-muted)',
                  cursor: 'pointer', fontSize: 16, padding: '4px 8px', flexShrink: 0,
                }}
              >✕</button>
            </div>
          );
        })()}

        {/* FILTER DROPDOWN — drops below the search/profile row.
            z-index sits above the list view (1050) and action row (700)
            so it overlays whichever view the user is on. The window-level
            motion listener handles outside-tap / swipe-to-close so the
            underlying map still receives the gesture. */}
        {filterOpen && (
          <div
            data-filter-panel
            style={{
              position: 'absolute',
              top: 'calc(52px + env(safe-area-inset-top, 0px) + 4px)',
              left: 8, right: 8, zIndex: 1080,
            }}
          >
            {filterPanel}
          </div>
        )}

        {/* BOTTOM NAV — Map | List | Filters as 3 toggle-style buttons (rounded fills) */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          padding: '10px 12px calc(10px + env(safe-area-inset-bottom, 0px))',
          background: 'rgba(26,19,16,0.85)',
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid rgba(245,241,232,0.15)',
        }}>
          {[
            { key: 'filters', label: 'Filters', active: filterOpen, badge: filterCount, onClick: () => setFilterOpen(v => !v) },
            { key: 'map', label: 'Map', active: mobileView === 'map', onClick: () => { setMobileView('map'); setFilterOpen(false); } },
            // List acts as a toggle: tap once to open the full-screen list,
            // tap again to dismiss it back to the map view.
            { key: 'list', label: 'List', active: mobileView === 'list', onClick: () => {
              setMobileView(v => v === 'list' ? 'map' : 'list');
              setFilterOpen(false);
              setPeekGymId(null);
            } },
          ].map((it) => (
            <button
              key={it.key}
              data-filter-toggle={it.key === 'filters' ? '' : undefined}
              onClick={it.onClick}
              style={{
                flex: 1, height: 44,
                borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--bone)',
                background: it.active ? 'var(--bone)' : 'transparent',
                color: it.active ? '#1A1310' : 'var(--bone)',
                fontFamily: "'Inter Tight', sans-serif",
                fontSize: 14, fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'all 0.12s',
              }}
            >
              {it.label}
              {('badge' in it) && it.badge ? (
                <span style={{
                  background: it.active ? 'var(--brown-700)' : 'var(--bone)',
                  color: it.active ? 'var(--bone)' : 'var(--brown-800)',
                  borderRadius: 'var(--radius-sm)', padding: '0 6px',
                  fontSize: 10, fontWeight: 800, lineHeight: '15px', minWidth: 15, textAlign: 'center',
                }}>{it.badge}</span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Privacy / Terms — portrait mobile, sits just above the bottom nav,
            hugging the right edge of the screen. */}
        <div style={{
          position: 'absolute',
          bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))',
          right: 4, zIndex: 400,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Link href="/privacy" style={{ fontSize: 11, color: 'rgba(245,241,232,0.60)', fontFamily: "'Inter Tight', sans-serif", textDecoration: 'none' }}>Privacy</Link>
          <Link href="/terms" style={{ fontSize: 11, color: 'rgba(245,241,232,0.60)', fontFamily: "'Inter Tight', sans-serif", textDecoration: 'none' }}>Terms</Link>
        </div>

        {/* Map style picker — portrait mobile, bottom-left. Sits ABOVE the
            Add Gym button. Toggles a horizontal drawer of style options
            (Outdoors / Light / Dark / Satellite) that expand to the right.
            Tap once to open, tap again to close. */}
        {mobileView === 'map' && (
          <div
            style={{
              position: 'absolute',
              bottom: 'calc(64px + env(safe-area-inset-bottom, 0px) + 8px + 32px + 6px)',
              left: 8, zIndex: 600,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <button
              onClick={() => setMapStyleOpen(v => !v)}
              title="Map style"
              style={{
                height: 32, padding: '0 14px',
                borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--bone)',
                background: mapStyleOpen ? 'var(--bone)' : 'var(--brown-700)',
                color: mapStyleOpen ? 'var(--brown-700)' : 'var(--bone)',
                fontSize: 12, fontWeight: 700,
                fontFamily: "'Inter Tight', sans-serif",
                cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                transition: 'all 0.15s ease',
                minWidth: 64,
              }}
            >Map</button>
            {mapStyleOpen && (
              // No wrapping tab background — each style option carries its
              // own glass fill so the buttons read as standalone squared
              // chips matching the rest of the portrait UI.
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {(['outdoors', 'light', 'dark', 'satellite'] as const).map((key) => {
                  const active = mapStyleKey === key;
                  return (
                    <button
                      key={key}
                      onClick={() => handleStyleChange(key)}
                      style={{
                        height: 32, padding: '0 14px', borderRadius: 'var(--radius-md)',
                        border: '1.5px solid var(--bone)',
                        background: active ? 'var(--bone)' : 'var(--brown-700)',
                        color: active ? '#1A1310' : 'var(--bone)',
                        fontSize: 11, fontWeight: 700,
                        fontFamily: "'Inter Tight', sans-serif",
                        cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >{MAP_STYLES[key].label}</button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Add Gym — portrait mobile, sits directly BELOW the Map style
            picker. Squared bone-outlined pill, same 32px height + brown
            fill so the two stack as a clean two-row column. */}
        {mobileView === 'map' && (
          <Link
            href="/add-gym"
            title="Add Gym"
            style={{
              position: 'absolute',
              bottom: 'calc(64px + env(safe-area-inset-bottom, 0px) + 8px)',
              left: 8, zIndex: 600,
              height: 32, padding: '0 14px',
              borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--bone)',
              background: 'var(--brown-700)',
              color: 'var(--bone)',
              fontSize: 12, fontWeight: 700,
              fontFamily: "'Inter Tight', sans-serif",
              cursor: 'pointer', whiteSpace: 'nowrap',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              textDecoration: 'none',
              minWidth: 64,
            }}
          >Add Gym</Link>
        )}

        {fullCardOverlay}
      </div>
    );
  }

  // ── DESKTOP (always full-screen) ─────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {showOnboarding && <DisciplineOnboarding initialDisciplines={selectedDisciplines} onConfirm={handleOnboardingConfirm} onDontShowAgain={handleDontShowAgain} />}
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

        {/* Sort tab — its own fixed panel, sits directly under the
            controls bar. Always visible (does not scroll with the list). */}
        {listVisible && !listExpanded && (
          <div
            style={{
              position: 'absolute', top: 56, left: 12, width: LIST_W, zIndex: 510,
            }}
          >
            {sortPills}
          </div>
        )}

        {/* Gym list panel — sits below the sort tab. Contains only the
            featured pills and the gym cards; sort pills live in their
            own panel above so the list can never scroll over them. */}
        {listVisible && !listExpanded && (
          <div
            className="no-scrollbar"
            data-gym-list
            style={{
              position: 'absolute', top: 100, left: 12, bottom: 12, width: LIST_W,
              zIndex: 500, overflowY: 'auto',
              padding: '4px 0 10px', display: 'flex', flexDirection: 'column', gap: 8,
            }}
          >
            {featuredPills}
            {gymCards}
          </div>
        )}

        {/* Controls bar — logo · | · list · expand · filters.
            Stretched to LIST_W (300px) so it shares the column width of
            the Featured/Popular/Nearest sort tab below. Squared corners
            (radius-md) match the sort tab geometry. */}
        <div
          className="map-toolbar-float"
          style={{
            position: 'absolute', top: 12, left: 12, zIndex: 600,
            width: LIST_W, boxSizing: 'border-box',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 5,
            padding: '5px 10px',
            borderRadius: 'var(--radius-md)',
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
              padding: '3px 10px', borderRadius: 'var(--radius-md)', flexShrink: 0,
              border: `1.5px solid ${listVisible ? 'var(--bone)' : 'var(--border)'}`,
              background: listVisible ? 'var(--bone)' : 'transparent',
              color: listVisible ? '#1A1310' : 'var(--bone)',
              fontSize: 11, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >List</button>

          {/* Expand-list feature removed — the List toggle is the only
              list affordance on desktop now. */}

          {/* Map style pills moved to a single toggleable Map button below
              the +/- panel in the secondary nav. */}

          <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />

          {/* Filters */}
          <button
            data-filter-toggle
            onClick={() => setFilterOpen(v => !v)}
            style={{
              padding: '3px 10px', borderRadius: 'var(--radius-md)', flexShrink: 0,
              border: '1.5px solid var(--bone)',
              background: 'transparent',
              color: 'var(--bone)',
              fontSize: 11, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
              cursor: 'pointer', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            Filters
            {activeFilterCount > 0 && (
              <span style={{
                background: 'var(--bone)', color: 'var(--brown-800)',
                borderRadius: 'var(--radius-sm)', padding: '0 5px', fontSize: 10, fontWeight: 800,
              }}>{activeFilterCount}</span>
            )}
          </button>

          {/* km/mi toggle removed — units now auto-detected from locale. */}

          {/* Zoom buttons moved to their own panel under the
              favorites/profile section in the secondary nav. */}

          {/* Search bar moved to its own floating tab at top-center (below). */}

          {/* Gym counter intentionally removed from the top toolbar. */}
        </div>

        {/* Search tab — floats top-center, independent of every other panel */}
        <div
          style={{
            position: 'absolute', top: 12, left: '50%',
            transform: 'translateX(-50%)', zIndex: 600,
          }}
        >
          {searchBar}
        </div>

        {/* Filter dropdown — anchored to the right of the list panel
            (and the Featured/Popular/Nearest tab) so opening it never
            shifts or covers the list. Sits directly below the toolbar.
            No backdrop here — the window-level motion listener handles
            outside-tap / swipe-to-close. */}
        {filterOpen && (
          <>
            <div
              data-filter-panel
              className="map-toolbar-float no-scrollbar"
              style={{
                position: 'absolute',
                // Centered under the search bar (which sits top-center).
                top: 56, left: '50%', transform: 'translateX(-50%)', zIndex: 700,
                width: 'min(calc(100vw - 24px), 480px)',
                maxHeight: 'calc(100dvh - 80px)',
                overflowY: 'auto',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <Filters
                selectedDisciplines={selectedDisciplines} selectedDays={selectedDays}
                freeOnly={freeOnly} startingSoonOnly={startingSoonOnly}
                verifiedOnly={verifiedOnly} showUnverifiedGyms={showUnverifiedGyms}
                favoritedOnly={favoritedOnly}
                onVerifiedOnlyToggle={() => setVerifiedOnly(v => !v)}
                onShowUnverifiedToggle={() => setShowUnverifiedGyms(v => !v)}
                onFavoritedOnlyToggle={() => setFavoritedOnly(v => !v)}
                region={region}
                onDisciplineToggle={toggleDiscipline} onSetDisciplines={setDisciplines} onDayToggle={toggleDay}
                onFreeOnlyToggle={() => setFreeOnly(v => !v)}
                onStartingSoonToggle={() => setStartingSoonOnly(v => !v)}
                onRegionChange={handleRegionChange}
                selectedRegions={selectedRegions}
                onReset={resetFilters}
                resultCount={loading ? 0 : filteredGyms.length}
                noBackground
                allOpen
              />
            </div>
          </>
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
              padding: '3px 10px', borderRadius: 'var(--radius-md)', flexShrink: 0,
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
              display: 'inline-flex', alignItems: 'center',
              padding: '3px 10px', borderRadius: 'var(--radius-md)', flexShrink: 0,
              border: '1.5px solid var(--bone)', background: 'transparent',
              color: 'var(--bone)',
              fontSize: 11, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif",
              textDecoration: 'none', whiteSpace: 'nowrap',
            }}
          >
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

        {/* Manage Gym pill — only renders when the signed-in user is a
            verified owner of at least one gym. Sits directly under the
            profile dropdown so an owner can jump straight into the
            schedule editor / analytics from anywhere on the homepage. */}
        {ownedGymIds.length > 0 && (
          <Link
            href={ownerHref}
            className="map-toolbar-float"
            title="Manage your gym"
            style={{
              position: 'absolute', top: 60, right: 12, zIndex: 600,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 10px', height: 38,
              width: 88, boxSizing: 'border-box',
              borderRadius: 'var(--radius-lg)',
              border: '1.5px solid #C9A24A',
              color: '#C9A24A',
              fontFamily: "'Inter Tight', sans-serif",
              fontSize: 11, fontWeight: 800,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >Your Gym</Link>
        )}

        {/* Zoom panel — sits directly under the secondary nav (favorites/
            profile row). Width matches the Map tab below for consistency.
            Pushed down by 48px when the owner is signed in, since the
            "Your Gym" pill takes the slot right above. */}
        <div
          className="map-toolbar-float"
          style={{
            position: 'absolute', top: ownedGymIds.length > 0 ? 108 : 60, right: 12, zIndex: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
            padding: '5px 8px',
            borderRadius: 'var(--radius-lg)',
            width: 88, boxSizing: 'border-box',
          }}
        >
          <button
            ref={zoomOutBtnRef}
            onClick={() => { triggerZoomFlash(zoomOutBtnRef, zoomOutTimeoutRef); mapControllerRef.current?.zoomOut(); }}
            title="Zoom out"
            style={{
              width: 28, height: 28, borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--bone)', background: 'transparent',
              color: 'var(--bone)', fontSize: 16, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              lineHeight: 1, padding: 0, flexShrink: 0,
            }}>−</button>
          <button
            ref={zoomInBtnRef}
            onClick={() => { triggerZoomFlash(zoomInBtnRef, zoomInTimeoutRef); mapControllerRef.current?.zoomIn(); }}
            title="Zoom in"
            style={{
              width: 28, height: 28, borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--bone)', background: 'transparent',
              color: 'var(--bone)', fontSize: 16, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              lineHeight: 1, padding: 0, flexShrink: 0,
            }}>+</button>
        </div>

        {/* Map style picker — Map button below the zoom panel. The button
            uses the same glass tab as +/-; the word "Map" floats inside
            with no inner outline. When toggled, the style options drop
            DOWN as bare buttons (no surrounding tab background). */}
        <div
          className="map-toolbar-float"
          style={{
            position: 'absolute', top: ownedGymIds.length > 0 ? 156 : 108, right: 12, zIndex: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '5px 8px', borderRadius: 'var(--radius-lg)',
            width: 88, boxSizing: 'border-box',
          }}
        >
          <button
            onClick={() => setMapStyleOpen(v => !v)}
            title="Map style"
            style={{
              // Toggle animation: bone fill + brown text when open,
              // transparent + bone text when closed.
              background: mapStyleOpen ? 'var(--bone)' : 'transparent',
              color: mapStyleOpen ? 'var(--brown-700)' : 'var(--bone)',
              border: '1.5px solid var(--bone)',
              borderRadius: 'var(--radius-md)',
              fontSize: 13, fontWeight: 700,
              fontFamily: "'Inter Tight', sans-serif",
              cursor: 'pointer', padding: '4px 14px',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
          >Map</button>
        </div>
        {mapStyleOpen && (
          <div
            style={{
              position: 'absolute', top: 154, right: 12, zIndex: 600,
              display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 4,
              width: 88,
            }}
          >
            {(['outdoors', 'light', 'dark', 'satellite'] as const).map((key) => {
              const active = mapStyleKey === key;
              return (
                <button
                  key={key}
                  onClick={() => handleStyleChange(key)}
                  style={{
                    padding: '4px 10px', borderRadius: 'var(--radius-md)',
                    border: '1.5px solid var(--bone)',
                    background: active ? 'var(--bone)' : 'rgba(26,19,16,0.88)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    color: active ? '#1A1310' : 'var(--bone)',
                    fontSize: 11, fontWeight: 600,
                    fontFamily: "'Inter Tight', sans-serif",
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >{MAP_STYLES[key].label}</button>
              );
            })}
          </div>
        )}

        {/* Privacy & Terms — bottom right, just left of the Mapbox attribution */}
        <div style={{
          position: 'absolute', bottom: 8, right: 240, zIndex: 400,
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
                weeklyCheckins={checkinCounts[overlayGym.id] ?? 0}
              />
            </div>
          </div>
        )}

        {/* Expanded-list view removed — list-toggle is the only list
            affordance on desktop now. */}
      </div>
    </div>
  );
}
