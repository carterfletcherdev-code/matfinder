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
const DISCIPLINE_GLYPH_EXPR = [
  'match', ['get', 'discipline'],
  'bjj',        'B',
  'nogi_bjj',   'N',
  'gi_bjj',     'G',
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
}

export default function Map({
  gyms, selectedGym, onGymSelect, region, onMapMove, flyToLocation,
  pinDropMode, onPinDrop, onZoomChange, pinLocation, onBoundsChange,
  isGpsLocation, onMapClick, hideStyleSwitcher, hideNavigationControl,
  controllerRef, onStyleChange,
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
        mapInstanceRef.current._resizeObserver?.disconnect();
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Rebuild GeoJSON when gyms change ──────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource('gyms');
    if (src) src.setData(gymsToGeoJSON(gyms));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gyms]);

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
  function gymsToGeoJSON(gyms: Gym[]) {
    return {
      type: 'FeatureCollection' as const,
      features: gyms.map(g => ({
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
        },
        geometry: { type: 'Point' as const, coordinates: [g.lng, g.lat] },
      })),
    };
  }

  function addGymSource(map: any, gyms: Gym[]) {
    if (map.getSource('gyms')) return;
    map.addSource('gyms', {
      type: 'geojson',
      data: gymsToGeoJSON(gyms),
      cluster: true,
      clusterMaxZoom: 9,
      clusterRadius: 40,
      clusterMinPoints: 6,
    });
  }

  function addGymLayers(map: any) {
    // Remove existing layers if present (on style reload)
    ['clusters', 'cluster-count', 'unclustered-point', 'unclustered-point-stroke', 'unclustered-point-label'].forEach(id => {
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
        'text-field': ['case',
          ['>=', ['get', 'point_count'], 1000], '999+',
          ['concat', ['to-string', ['*', 5, ['floor', ['/', ['get', 'point_count'], 5]]]], '+'],
        ],
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 11,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#F5F1E8' },
    });

    // Individual gym point stroke (slightly bigger on mobile via window width)
    const isMobileViewport = typeof window !== 'undefined' && window.innerWidth < 640;
    const strokeR = isMobileViewport ? 11 : 9;
    const fillR = isMobileViewport ? 9 : 7.5;
    map.addLayer({
      id: 'unclustered-point-stroke',
      type: 'circle',
      source: 'gyms',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': 'white',
        'circle-radius': strokeR,
        'circle-opacity': 0.92,
      },
    });

    // Individual gym point (colored by discipline)
    map.addLayer({
      id: 'unclustered-point',
      type: 'circle',
      source: 'gyms',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': DISCIPLINE_COLOR_EXPR as any,
        'circle-radius': fillR,
        'circle-stroke-width': 0,
      },
    });

    // Single-letter glyph centered on the pin (visible above zoom 6)
    map.addLayer({
      id: 'unclustered-point-label',
      type: 'symbol',
      source: 'gyms',
      filter: ['!', ['has', 'point_count']],
      minzoom: 6,
      layout: {
        'text-field': DISCIPLINE_GLYPH_EXPR as any,
        'text-size': isMobileViewport ? 10 : 9,
        'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': '#FFFFFF',
        'text-halo-color': 'rgba(0,0,0,0.35)',
        'text-halo-width': 0.6,
      },
    });
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

    // ── Hover: show gym name tooltip ─────────────────────────────────────────
    map.on('mouseenter', 'unclustered-point', (e: any) => {
      map.getCanvas().style.cursor = 'pointer';
      const props = e.features[0].properties;
      const coords = e.features[0].geometry.coordinates.slice();
      popup.setLngLat(coords).setHTML(
        `<div style="font-family:'Inter Tight',sans-serif;padding:0;">
          <div style="font-weight:700;font-size:12px;color:var(--popup-text,#F5F1E8);">${props.name}</div>
          <div style="font-size:11px;color:var(--popup-muted,rgba(245,241,232,0.7));">${props.city}${props.state ? `, ${props.state}` : props.country ? `, ${props.country}` : ''}</div>
        </div>`
      ).addTo(map);
      hoveredIdRef.current = props.id;
    });

    map.on('mouseleave', 'unclustered-point', () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
      hoveredIdRef.current = null;
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

      // Gym pins — pick closest to tap point when multiple overlap
      const gymFeatures = map.queryRenderedFeatures(bbox, { layers: ['unclustered-point'] });
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
