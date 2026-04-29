'use client';

import { useEffect, useRef, useState } from 'react';
import { Gym, DISCIPLINE_LABELS, DISCIPLINE_COLORS, DAY_LABELS, REGION_BOUNDS, type Region } from '@/lib/types';
import { formatTime } from '@/lib/utils';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

export const MAP_STYLES: Record<string, { label: string; url: string }> = {
  outdoors:  { label: 'Default',   url: 'mapbox://styles/mapbox/outdoors-v12' },
  light:     { label: 'Light',     url: 'mapbox://styles/mapbox/light-v11' },
  dark:      { label: 'Dark',      url: 'mapbox://styles/mapbox/dark-v11' },
  satellite: { label: 'Satellite', url: 'mapbox://styles/mapbox/satellite-streets-v12' },
};

// Mapbox match expression for discipline → marker color.
// Tuned for max contrast across all map styles. No two share a hue family.
const DISCIPLINE_COLOR_EXPR = [
  'match', ['get', 'discipline'],
  'bjj',        '#7C3AED', // purple
  'nogi_bjj',   '#7C3AED', // purple
  'gi_bjj',     '#7C3AED', // purple
  'wrestling',  '#854D0E', // dark amber
  'judo',       '#DC2626', // red
  'muay_thai',  '#DB2777', // hot pink
  'mma',        '#EA580C', // orange
  'kickboxing', '#0D9488', // teal
  'boxing',     '#2563EB', // cobalt blue
  'karate',     '#65A30D', // lime green
  'taekwondo',  '#4338CA', // indigo
  '#7C3AED', // default
];

// Single-letter glyph per discipline — recognizable without color.
// All BJJ variants share 'B' since we no longer split Gi vs No-Gi.
const DISCIPLINE_GLYPH_EXPR = [
  'match', ['get', 'discipline'],
  'bjj',        'B',
  'nogi_bjj',   'B',
  'gi_bjj',     'B',
  'wrestling',  'W',
  'judo',       'J',
  'muay_thai',  'T',
  'mma',        'M',
  'kickboxing', 'K',
  'boxing',     'X',
  'karate',     'A',
  'taekwondo',  'D',
  '',
];

export interface MapController {
  zoomIn: () => void;
  zoomOut: () => void;
  setStyle: (key: string) => void;
}

interface MapProps {
  gyms: Gym[];
  selectedGym: string | null;
  onGymSelect: (id: string) => void;
  region: Region;
  onMapMove?: (lat: number, lng: number) => void;
  flyToLocation?: { lat: number; lng: number; zoom: number } | null;
  pinDropMode?: boolean;
  onPinDrop?: (lat: number, lng: number) => void;
  onZoomChange?: (zoom: number) => void;
  pinLocation?: { lat: number; lng: number } | null;
  onBoundsChange?: (south: number, west: number, north: number, east: number) => void;
  isGpsLocation?: boolean;
  onMapClick?: () => void;
  hideStyleSwitcher?: boolean;
  hideNavigationControl?: boolean;
  controllerRef?: React.MutableRefObject<MapController | null>;
  onStyleChange?: (key: string) => void;
  /** Set of gym IDs the current user has favorited — pins for these
   *  gyms render as gold stars instead of the standard discipline dot. */
  favoritedIds?: Set<string>;
  /** Gyms the current user has checked in at — pin gets a bone outline
   *  ring instead of the standard dark stroke, signalling "you've been here." */
  visitedIds?: Set<string>;
}

export default function Map({
  gyms, selectedGym, onGymSelect, region, onMapMove, flyToLocation,
  pinDropMode, onPinDrop, onZoomChange, pinLocation, onBoundsChange,
  isGpsLocation, onMapClick, hideStyleSwitcher, hideNavigationControl,
  controllerRef, onStyleChange, favoritedIds, visitedIds,
}: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const pinMarkerRef = useRef<any>(null);
  const popupRef = useRef<any>(null);
  const hoveredIdRef = useRef<string | null>(null);

  // Stable refs for callbacks
  const onSelectRef = useRef(onGymSelect);
  const onMoveRef = useRef(onMapMove);
  const onZoomChangeRef = useRef(onZoomChange);
  const onPinDropRef = useRef(onPinDrop);
  const pinDropModeRef = useRef(pinDropMode);
  const onBoundsChangeRef = useRef(onBoundsChange);
  const onMapClickRef = useRef(onMapClick);
  const onStyleChangeRef = useRef(onStyleChange);
  const gymsRef = useRef(gyms);

  useEffect(() => { onSelectRef.current = onGymSelect; }, [onGymSelect]);
  useEffect(() => { onMoveRef.current = onMapMove; }, [onMapMove]);
  useEffect(() => { onZoomChangeRef.current = onZoomChange; }, [onZoomChange]);
  useEffect(() => { onBoundsChangeRef.current = onBoundsChange; }, [onBoundsChange]);
  useEffect(() => { onPinDropRef.current = onPinDrop; }, [onPinDrop]);
  useEffect(() => { pinDropModeRef.current = pinDropMode; }, [pinDropMode]);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);
  useEffect(() => { onStyleChangeRef.current = onStyleChange; }, [onStyleChange]);
  useEffect(() => { gymsRef.current = gyms; }, [gyms]);

  // Latest fly target. Mirrored into a ref so that if `flyToLocation`
  // resolves BEFORE the Mapbox instance finishes loading (the dynamic
  // import is async), the `'load'` handler can pick it up and apply it.
  // Without this, on fast desktops the geolocation flyTo silently
  // dropped because the effect ran with mapInstanceRef.current === null.
  const flyToLocationRef = useRef(flyToLocation);
  useEffect(() => { flyToLocationRef.current = flyToLocation; }, [flyToLocation]);

  const [mapStyle, setMapStyle] = useState<keyof typeof MAP_STYLES>('outdoors');
  const [styleLoading, setStyleLoading] = useState(false);

  // ── Initialize map ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current || mapInstanceRef.current) return;

    let map: any;

    (async () => {
      const mapboxgl = (await import('mapbox-gl')).default;
      mapboxgl.accessToken = MAPBOX_TOKEN;

      const { center, zoom } = REGION_BOUNDS[region] ?? REGION_BOUNDS.all;

      map = new mapboxgl.Map({
        container: mapRef.current!,
        style: MAP_STYLES.outdoors.url,
        center: [center[1], center[0]], // Mapbox uses [lng, lat]
        zoom: zoom - 1,
        attributionControl: false,
      });

      if (!hideNavigationControl) {
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-left');
      }
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');

      mapInstanceRef.current = map;
      mapInstanceRef.current._mapboxgl = mapboxgl;

      if (controllerRef) {
        controllerRef.current = {
          zoomIn:   () => mapInstanceRef.current?.zoomIn(),
          zoomOut:  () => mapInstanceRef.current?.zoomOut(),
          setStyle: (key: string) => setMapStyle(key as keyof typeof MAP_STYLES),
        };
      }

      map.on('load', () => {
        addGymSource(map, gymsRef.current);
        addGymLayers(map);
        setupInteractions(map, mapboxgl);
        // Start (or restart) the favorited-pin pulse loop. Stored on the
        // map instance so we can cancel it on unmount / style swap.
        if (map._favoritePulseStop) map._favoritePulseStop();
        map._favoritePulseStop = startFavoritePulse(map);
        // Hide the dark dot Mapbox draws under settlement labels — those
        // city/town markers compete visually with our gym pins.
        // We zero the icon-opacity (keeps text + halo, drops the dot).
        hideSettlementIcons(map);
        // Apply any pending fly target that was set before the map
        // finished loading (desktop hits this race; geolocation resolves
        // before the async Mapbox bundle is ready).
        const pending = flyToLocationRef.current;
        if (pending) {
          map.flyTo({ center: [pending.lng, pending.lat], zoom: pending.zoom, duration: 1200 });
        }
      });

      map.on('move', () => {
        const c = map.getCenter();
        onMoveRef.current?.(c.lat, c.lng);
        const b = map.getBounds();
        onBoundsChangeRef.current?.(b.getSouth(), b.getWest(), b.getNorth(), b.getEast());
      });

      map.on('zoom', () => {
        onZoomChangeRef.current?.(map.getZoom());
      });

      const ro = new ResizeObserver(() => map.resize());
      if (mapRef.current) ro.observe(mapRef.current);
      map._resizeObserver = ro;
    })();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current._favoritePulseStop?.();
        mapInstanceRef.current._resizeObserver?.disconnect();
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Rebuild GeoJSON when gyms / favoritedIds / visitedIds change ─────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource('gyms');
    if (src) src.setData(gymsToGeoJSON(gyms));
    const favSrc = map.getSource('gyms-favorites');
    if (favSrc) favSrc.setData(favoritesToGeoJSON(gyms));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gyms, favoritedIds, visitedIds]);

  // ── Cursor in pin-drop mode ────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.style.cursor = pinDropMode ? 'crosshair' : '';
  }, [pinDropMode]);

  // ── GPS / sort pin marker ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const mapboxgl = map._mapboxgl;
    if (!mapboxgl) return;

    pinMarkerRef.current?.remove();
    pinMarkerRef.current = null;

    if (!pinLocation) return;

    const el = document.createElement('div');
    if (isGpsLocation) {
      el.className = 'gps-pin';
      el.style.cssText = 'width:16px;height:16px;background:#2563EB;border:3px solid white;border-radius:50%;';
    } else {
      el.className = 'drop-pin';
      el.style.cssText = 'width:16px;height:16px;background:#DC2626;border:3px solid white;border-radius:50%;cursor:pointer;';
    }

    pinMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat([pinLocation.lng, pinLocation.lat])
      .addTo(map);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinLocation, isGpsLocation]);

  // ── Fly to region ──────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const { center, zoom } = REGION_BOUNDS[region] ?? REGION_BOUNDS.all;
    map.flyTo({ center: [center[1], center[0]], zoom: zoom - 1, duration: 1000 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region]);

  // ── Fly to geocoded / GPS location ─────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !flyToLocation) return;
    map.flyTo({ center: [flyToLocation.lng, flyToLocation.lat], zoom: flyToLocation.zoom, duration: 1200 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyToLocation]);

  // ── Fly to selected gym ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedGym) return;
    const gym = gyms.find(g => g.id === selectedGym);
    if (!gym) return;
    map.flyTo({ center: [gym.lng, gym.lat], zoom: Math.max(map.getZoom(), 13), duration: 800 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGym]);

  // ── Switch map style ───────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    setStyleLoading(true);
    map.once('style.load', () => {
      addGymSource(map, gymsRef.current);
      addGymLayers(map);
      setStyleLoading(false);
    });
    map.setStyle(MAP_STYLES[mapStyle].url);
    onStyleChangeRef.current?.(mapStyle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapStyle]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function gymToFeature(g: Gym) {
    return {
      type: 'Feature' as const,
      properties: {
        id: g.id,
        name: g.name,
        city: g.city,
        state: g.state ?? '',
        country: g.country,
        discipline: g.open_mats[0]?.discipline ?? 'bjj',
        is_free: g.open_mats.some(o => o.is_free),
        confirmed: g.open_mats.every(o => o.confirmed),
        is_favorited: favoritedIds?.has(g.id) ? 1 : 0,
        is_visited: visitedIds?.has(g.id) ? 1 : 0,
        // Featured paid listings — render with a larger pin so they
        // stand out without changing the rest of the map.
        is_featured: g.featured ? 1 : 0,
      },
      geometry: { type: 'Point' as const, coordinates: [g.lng, g.lat] },
    };
  }

  function gymsToGeoJSON(gyms: Gym[]) {
    return {
      type: 'FeatureCollection' as const,
      features: gyms.map(gymToFeature),
    };
  }

  // Favorites get their OWN unclustered source so the gold star is always
  // visible at every zoom level — favorited gyms never collapse into a
  // cluster pill. The main 'gyms' source still clusters everything.
  function favoritesToGeoJSON(gyms: Gym[]) {
    return {
      type: 'FeatureCollection' as const,
      features: gyms
        .filter(g => favoritedIds?.has(g.id))
        .map(gymToFeature),
    };
  }

  function addGymSource(map: any, gyms: Gym[]) {
    if (!map.getSource('gyms')) {
      map.addSource('gyms', {
        type: 'geojson',
        data: gymsToGeoJSON(gyms),
        cluster: true,
        clusterMaxZoom: 9,
        clusterRadius: 50,
        // Aggressive grouping: any time three or more gyms are within
        // clusterRadius of each other, replace them with a single "N+" pill.
        clusterMinPoints: 3,
      });
    }
    if (!map.getSource('gyms-favorites')) {
      map.addSource('gyms-favorites', {
        type: 'geojson',
        data: favoritesToGeoJSON(gyms),
        cluster: false, // never cluster favorites — always show the star
      });
    }
  }

  function addGymLayers(map: any) {
    // Remove existing layers if present (on style reload)
    [
      'clusters', 'cluster-count',
      'unclustered-point', 'unclustered-point-stroke', 'unclustered-point-label',
      'unclustered-point-visited',
      'unclustered-point-featured', 'unclustered-point-featured-stroke',
      'unclustered-point-favorite-bg', 'unclustered-point-favorite',
      'unclustered-point-favorite-pulse',
    ].forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id);
    });

    // Cluster circles
    map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'gyms',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#5C4430',
        'circle-radius': ['step', ['get', 'point_count'], 18, 10, 22, 100, 28, 750, 34],
        'circle-stroke-width': 2.5,
        'circle-stroke-color': 'rgba(255,255,255,0.9)',
        'circle-opacity': 0.94,
      },
    });

    // Cluster count label
    map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: 'gyms',
      filter: ['has', 'point_count'],
      layout: {
        // Small clusters (3-9): exact count + "+" so users see "3+", "4+",
        // "5+" etc. Larger clusters round down to nearest ten. Cap at 999+.
        'text-field': ['case',
          ['>=', ['get', 'point_count'], 1000], '999+',
          ['<', ['get', 'point_count'], 10], ['concat', ['to-string', ['get', 'point_count']], '+'],
          ['concat', ['to-string', ['*', 10, ['floor', ['/', ['get', 'point_count'], 10]]]], '+'],
        ],
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 11,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#F5F1E8' },
    });

    // Distance-aware sizing — pins shrink at zoomed-out levels and grow
    // as you zoom in. Featured gyms get a +30% size bump at every zoom
    // so paid listings always read larger than standard gyms.
    const isMobileViewport = typeof window !== 'undefined' && window.innerWidth < 640;
    const mob = isMobileViewport ? 1 : 0;

    // base radius interpolated by zoom; standard gym
    const standardFill: any = ['interpolate', ['linear'], ['zoom'],
      4,  3 + mob,
      6,  4 + mob,
      9,  6 + mob,
      12, 8 + mob,
      15, 10 + mob,
    ];
    const featuredFill: any = ['interpolate', ['linear'], ['zoom'],
      4,  4 + mob,
      6,  6 + mob,
      9,  9 + mob,
      12, 12 + mob,
      15, 15 + mob,
    ];
    // Favorited gym — same as standard but a hair larger so a saved pin
    // is instantly distinguishable at every zoom level.
    const favoriteFill: any = ['interpolate', ['linear'], ['zoom'],
      4,  4 + mob,
      6,  5 + mob,
      9,  7 + mob,
      12, 9 + mob,
      15, 11 + mob,
    ];
    const standardStroke: any = ['interpolate', ['linear'], ['zoom'],
      4,  5 + mob,
      6,  6 + mob,
      9,  8 + mob,
      12, 10 + mob,
      15, 12 + mob,
    ];
    const featuredStroke: any = ['interpolate', ['linear'], ['zoom'],
      4,  6 + mob,
      6,  8 + mob,
      9,  11 + mob,
      12, 14 + mob,
      15, 17 + mob,
    ];

    // Standard pin stroke (white halo)
    map.addLayer({
      id: 'unclustered-point-stroke',
      type: 'circle',
      source: 'gyms',
      filter: ['all',
        ['!', ['has', 'point_count']],
        ['!=', ['get', 'is_favorited'], 1],
        ['!=', ['get', 'is_featured'], 1],
      ],
      paint: {
        'circle-color': 'white',
        'circle-radius': standardStroke,
        'circle-opacity': 0.92,
      },
    });

    // Standard pin (colored by discipline) — no letter glyph; discipline
    // is communicated by color + popup tooltip on hover/tap.
    map.addLayer({
      id: 'unclustered-point',
      type: 'circle',
      source: 'gyms',
      filter: ['all',
        ['!', ['has', 'point_count']],
        ['!=', ['get', 'is_favorited'], 1],
        ['!=', ['get', 'is_featured'], 1],
      ],
      paint: {
        'circle-color': DISCIPLINE_COLOR_EXPR as any,
        'circle-radius': standardFill,
        'circle-stroke-width': 0,
      },
    });

    // Visited pin halo — Option B from the design preview. A separate
    // bone-white ring orbiting the standard pin at a small offset, so
    // gyms the user has checked in at are clearly distinguishable
    // without changing the colored core. Uses transparent fill + bone
    // stroke so only the ring renders. Radius is a few px larger than
    // the white halo (`standardStroke`) so the ring sits OUTSIDE it.
    const visitedRingRadius: any = ['interpolate', ['linear'], ['zoom'],
      4,  8 + mob,
      6,  10 + mob,
      9,  13 + mob,
      12, 16 + mob,
      15, 19 + mob,
    ];
    map.addLayer({
      id: 'unclustered-point-visited',
      type: 'circle',
      source: 'gyms',
      filter: ['all',
        ['!', ['has', 'point_count']],
        ['==', ['get', 'is_visited'], 1],
        ['!=', ['get', 'is_favorited'], 1],
        ['!=', ['get', 'is_featured'], 1],
      ],
      paint: {
        'circle-color': 'rgba(0,0,0,0)',
        'circle-radius': visitedRingRadius,
        'circle-stroke-color': '#F5F1E8',
        'circle-stroke-width': 1.5,
      },
    });

    // Featured (paid) pin — same color family but visibly larger so it
    // stands out. Bone-white outer ring distinguishes it from the
    // standard pin's plain white halo.
    map.addLayer({
      id: 'unclustered-point-featured-stroke',
      type: 'circle',
      source: 'gyms',
      filter: ['all',
        ['!', ['has', 'point_count']],
        ['!=', ['get', 'is_favorited'], 1],
        ['==', ['get', 'is_featured'], 1],
      ],
      paint: {
        'circle-color': '#F5F1E8',
        'circle-radius': featuredStroke,
        'circle-opacity': 1,
      },
    });
    map.addLayer({
      id: 'unclustered-point-featured',
      type: 'circle',
      source: 'gyms',
      filter: ['all',
        ['!', ['has', 'point_count']],
        ['!=', ['get', 'is_favorited'], 1],
        ['==', ['get', 'is_featured'], 1],
      ],
      paint: {
        'circle-color': DISCIPLINE_COLOR_EXPR as any,
        'circle-radius': featuredFill,
        'circle-stroke-color': '#1A1310',
        'circle-stroke-width': 1.5,
      },
    });

    // ── Favorite pin (Option C — multicolor wheel + rose-gold star) ─────
    // Three layers, all sourced from `gyms-favorites` (cluster:false) so
    // saved gyms always render at every zoom level:
    //   1. bone-white pulsing halo (GPS-style, animated)
    //   2. invisible hit-test circle (clicks)
    //   3. SVG icon — conic gradient of every discipline color,
    //      bone-white outline, rose→gold gradient star centered.

    // 1. Pulse halo — animated by startFavoritePulse()
    map.addLayer({
      id: 'unclustered-point-favorite-pulse',
      type: 'circle',
      source: 'gyms-favorites',
      paint: {
        'circle-color': '#F5F1E8',
        'circle-radius': 10,
        'circle-opacity': 0,
        'circle-stroke-color': '#F5F1E8',
        'circle-stroke-width': 1.5,
        'circle-stroke-opacity': 0,
      },
    });

    // 2. Invisible hit-test circle — kept for click reliability since the
    // icon's hit area can be fiddly. Same legacy id so click queries
    // (queryRenderedFeatures) keep working without changes.
    map.addLayer({
      id: 'unclustered-point-favorite-bg',
      type: 'circle',
      source: 'gyms-favorites',
      paint: {
        'circle-color': '#F5F1E8',
        'circle-opacity': 0,
        'circle-radius': isMobileViewport ? 14 : 12,
      },
    });

    // 3. The icon itself — registered async via ensureFavoriteIcon().
    // Symbol layer renders nothing until the image arrives, then picks
    // it up automatically.
    map.addLayer({
      id: 'unclustered-point-favorite',
      type: 'symbol',
      source: 'gyms-favorites',
      layout: {
        'icon-image': 'favorite-icon',
        'icon-size': isMobileViewport ? 1.0 : 0.85,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    });

    ensureFavoriteIcon(map);
  }

  // Build the favorite-pin SVG (Option D): rose→gold radial gradient
  // circle with a bone-white outline and a bone-white star centered.
  // Highlight at 30% / 30% gives the disc a soft "lit" quality.
  function makeFavoriteIconSVG(): string {
    const SIZE = 32;
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const r = 13;
    // Five-pointed star path centered on (cx, cy), outer 7 / inner 3.
    const starOuter = 7;
    const starInner = 3;
    const starPts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const radius = i % 2 === 0 ? starOuter : starInner;
      const angle = (i / 10) * 2 * Math.PI - Math.PI / 2;
      starPts.push(`${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`);
    }
    const starPath = `M${starPts.join(' L')} Z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
      <defs>
        <radialGradient id="rg" cx="30%" cy="30%" r="80%">
          <stop offset="0%" stop-color="#E8B4B8"/>
          <stop offset="100%" stop-color="#D4AF37"/>
        </radialGradient>
      </defs>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#rg)" stroke="#F5F1E8" stroke-width="2"/>
      <path d="${starPath}" fill="#F5F1E8"/>
    </svg>`;
  }

  // Loads the favorite-pin SVG into the map's image cache. Fires async
  // — the symbol layer renders empty until the image is registered, then
  // automatically picks it up. Idempotent + safe to call after style swaps.
  function ensureFavoriteIcon(map: any) {
    if (map.hasImage && map.hasImage('favorite-icon')) return;
    const svg = makeFavoriteIconSVG();
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image(64, 64);
    img.onload = () => {
      try {
        if (!map.hasImage('favorite-icon')) {
          // pixelRatio=2 → SVG renders crisp on retina without doubling our viewBox.
          map.addImage('favorite-icon', img, { pixelRatio: 2 });
        }
      } catch { /* style may have been swapped mid-load */ }
      URL.revokeObjectURL(url);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  // Hide the small black/dark dots Mapbox renders under settlement
  // labels (cities + towns). We keep the text — only the icon is hidden,
  // so labels like "Cleveland" still render but no longer carry a circle
  // glyph that competes with our discipline pins.
  function hideSettlementIcons(map: any) {
    const style = map.getStyle?.();
    if (!style?.layers) return;
    const SETTLEMENT_RX = /^(settlement|place)[-_].*(label|point)|^place-(city|town|village|hamlet)/i;
    for (const layer of style.layers) {
      if (layer.type !== 'symbol') continue;
      if (!SETTLEMENT_RX.test(layer.id)) continue;
      const layout = (layer as any).layout || {};
      // Only suppress the icon — keep text + halo intact.
      if (layout['icon-image']) {
        try { map.setLayoutProperty(layer.id, 'icon-image', ''); } catch {}
        try { map.setPaintProperty(layer.id, 'icon-opacity', 0); } catch {}
      }
    }
  }

  // Drives the favorited-pin pulse animation. Mirrors the GPS pulse
  // keyframes (.gps-pin in globals.css):
  //   0%   → ring at radius 0,  opacity 0.6
  //   70%  → ring at radius 10, opacity 0
  //   100% → ring at radius 0,  opacity 0   (rest before next ping)
  // 1.8s period, ease-out timing. Returns a cleanup fn.
  function startFavoritePulse(map: any) {
    let raf = 0;
    const start = performance.now();
    const PERIOD = 1.8;       // seconds
    // Ring starts at the pin's outer edge (gold disc + 2px stroke)
    // and expands outward, matching the GPS dot's behavior.
    const STAR_RADIUS = 13;
    const RING_GROW = 12;     // px the ring expands by during the active phase
    const easeOut = (q: number) => 1 - Math.pow(1 - q, 3);
    const tick = (now: number) => {
      const t = ((now - start) / 1000) % PERIOD;
      const p = t / PERIOD;
      let radius: number;
      let opacity: number;
      if (p < 0.7) {
        const q = p / 0.7;
        const eased = easeOut(q);
        radius = STAR_RADIUS + eased * RING_GROW;
        opacity = 0.6 * (1 - q);
      } else {
        radius = STAR_RADIUS;
        opacity = 0;
      }
      if (map.getLayer && map.getLayer('unclustered-point-favorite-pulse')) {
        try {
          map.setPaintProperty('unclustered-point-favorite-pulse', 'circle-radius', radius);
          map.setPaintProperty('unclustered-point-favorite-pulse', 'circle-opacity', opacity);
          map.setPaintProperty('unclustered-point-favorite-pulse', 'circle-stroke-opacity', opacity);
        } catch { /* layer may have been removed mid-frame */ }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }

  function setupInteractions(map: any, mapboxgl: any) {
    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      maxWidth: '260px',
      offset: 12,
      className: 'mapbox-gym-popup',
    });
    popupRef.current = popup;

    // ── Hover: show gym name + discipline tooltip ────────────────────────────
    // Discipline is shown via the popup since the pin no longer carries a
    // letter glyph. Fires on standard, featured, and favorited pin layers.
    const DISCIPLINE_LABELS_INLINE: Record<string, string> = {
      bjj: 'Jiu-Jitsu', nogi_bjj: 'Jiu-Jitsu', gi_bjj: 'Jiu-Jitsu',
      wrestling: 'Wrestling', judo: 'Judo', muay_thai: 'Muay Thai',
      mma: 'MMA', kickboxing: 'Kickboxing', boxing: 'Boxing',
      karate: 'Karate', taekwondo: 'Taekwondo',
    };
    const onPinEnter = (e: any) => {
      map.getCanvas().style.cursor = 'pointer';
      const props = e.features[0].properties;
      const coords = e.features[0].geometry.coordinates.slice();
      const disciplineLabel = DISCIPLINE_LABELS_INLINE[props.discipline] ?? props.discipline;
      const featuredTag = props.is_featured == 1
        ? '<span style="background:#FFD23F;color:#1A1310;font-size:9px;font-weight:800;padding:1px 5px;border-radius:3px;letter-spacing:0.04em;margin-left:4px;">FEATURED</span>'
        : '';
      const favTag = props.is_favorited == 1
        ? '<span style="color:#FFD23F;margin-left:4px;">★</span>' : '';
      popup.setLngLat(coords).setHTML(
        `<div style="font-family:'Inter Tight',sans-serif;padding:0;">
          <div style="font-weight:700;font-size:12px;color:var(--popup-text,#F5F1E8);">${props.name}${favTag}${featuredTag}</div>
          <div style="font-size:11px;color:var(--popup-muted,rgba(245,241,232,0.7));">${disciplineLabel} · ${props.city}${props.state ? `, ${props.state}` : props.country ? `, ${props.country}` : ''}</div>
        </div>`
      ).addTo(map);
      hoveredIdRef.current = props.id;
    };
    const onPinLeave = () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
      hoveredIdRef.current = null;
    };
    ['unclustered-point', 'unclustered-point-featured', 'unclustered-point-favorite-bg'].forEach(layer => {
      map.on('mouseenter', layer, onPinEnter);
      map.on('mouseleave', layer, onPinLeave);
    });

    // ── Cluster hover cursor ─────────────────────────────────────────────────
    map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });

    // ── Unified click: fat-finger tolerant gym select + cluster zoom + dismiss ─
    // Use a padded bounding box so small pins are tappable on mobile.
    const isTouchDevice = typeof window !== 'undefined' &&
      ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    const HIT_PAD = isTouchDevice ? 22 : 6;

    map.on('click', (e: any) => {
      if (pinDropModeRef.current && onPinDropRef.current) {
        onPinDropRef.current(e.lngLat.lat, e.lngLat.lng);
        return;
      }

      const bbox: [any, any] = [
        [e.point.x - HIT_PAD, e.point.y - HIT_PAD],
        [e.point.x + HIT_PAD, e.point.y + HIT_PAD],
      ];

      // Gym pins — pick closest to tap point when multiple overlap.
      // Query standard, featured, and favorited layers so all pin types
      // remain clickable.
      const gymFeatures = map.queryRenderedFeatures(bbox, {
        layers: [
          'unclustered-point',
          'unclustered-point-featured',
          'unclustered-point-favorite-bg',
        ],
      });
      if (gymFeatures.length > 0) {
        let best = gymFeatures[0];
        let bestDist = Infinity;
        for (const f of gymFeatures) {
          const pt = map.project(f.geometry.coordinates as any);
          const dx = pt.x - e.point.x;
          const dy = pt.y - e.point.y;
          const d = dx * dx + dy * dy;
          if (d < bestDist) { bestDist = d; best = f; }
        }
        onSelectRef.current(best.properties.id);
        return;
      }

      // Clusters — zoom in
      const clusterFeatures = map.queryRenderedFeatures(bbox, { layers: ['clusters'] });
      if (clusterFeatures.length > 0) {
        const clusterId = clusterFeatures[0].properties.cluster_id;
        map.getSource('gyms').getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
          if (err) return;
          map.flyTo({ center: clusterFeatures[0].geometry.coordinates, zoom: zoom + 0.5, duration: 500 });
        });
        return;
      }

      // Background — dismiss overlay
      onMapClickRef.current?.();
    });
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

      {/* Style switcher — hidden in full-screen mode (page.tsx renders its own) */}
      {!hideStyleSwitcher && (
        <div style={{
          position: 'absolute', bottom: 28, left: 10, zIndex: 10,
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          {Object.entries(MAP_STYLES).map(([key, { label }]) => (
            <button
              key={key}
              onClick={() => setMapStyle(key as keyof typeof MAP_STYLES)}
              style={{
                padding: '4px 8px',
                fontSize: 11, fontWeight: 600,
                fontFamily: "'Inter Tight', sans-serif",
                background: mapStyle === key ? 'var(--accent, #5C4430)' : 'rgba(255,255,255,0.92)',
                color: mapStyle === key ? '#F5F1E8' : '#3E2E20',
                border: '1px solid rgba(0,0,0,0.15)',
                borderRadius: 4,
                cursor: 'pointer',
                boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                whiteSpace: 'nowrap',
                transition: 'all 0.12s',
                opacity: styleLoading ? 0.6 : 1,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
