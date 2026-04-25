'use client';

import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { useEffect, useRef } from 'react';
import { Gym, DISCIPLINE_LABELS, DISCIPLINE_COLORS, DAY_LABELS, REGION_BOUNDS } from '@/lib/types';

interface MapProps {
  gyms: Gym[];
  selectedGym: string | null;
  onGymSelect: (id: string) => void;
  region: 'all' | 'us' | 'europe';
  onMapMove?: (lat: number, lng: number) => void;
}

export default function Map({ gyms, selectedGym, onGymSelect, region, onMapMove }: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Record<string, unknown>>({});
  // Always-current ref so async callbacks see latest gyms
  const gymsRef = useRef<Gym[]>(gyms);
  const onSelectRef = useRef(onGymSelect);
  const onMoveRef = useRef(onMapMove);

  useEffect(() => { gymsRef.current = gyms; }, [gyms]);
  useEffect(() => { onSelectRef.current = onGymSelect; }, [onGymSelect]);
  useEffect(() => { onMoveRef.current = onMapMove; }, [onMapMove]);

  // Initialize map once
  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current) return;

    (async () => {
      const leafletModule = await import('leaflet');
      // markercluster is a UMD plugin that writes to the global L object;
      // we must use the mutable default export (not the frozen module namespace)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (leafletModule.default ?? leafletModule) as typeof import('leaflet');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).L = L;
      await import('leaflet.markercluster');

      if (mapInstanceRef.current) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const { center, zoom } = REGION_BOUNDS[region] ?? REGION_BOUNDS.us;
      const map = L.map(mapRef.current!, { center, zoom, zoomControl: true });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20,
      }).addTo(map);

      mapInstanceRef.current = map;

      // Re-sort the list when the user pans the map
      map.on('moveend', () => {
        if (onMoveRef.current) {
          const c = map.getCenter();
          onMoveRef.current(c.lat, c.lng);
        }
      });

      // Use gymsRef.current so we get whatever gyms are loaded by now
      addMarkers(L, map, gymsRef.current, onSelectRef.current);

      setTimeout(() => map.invalidateSize(), 50);
      setTimeout(() => map.invalidateSize(), 300);
      const ro = new ResizeObserver(() => map.invalidateSize());
      if (mapRef.current) ro.observe(mapRef.current);
      mapInstanceRef.current._resizeObserver = ro;
      mapInstanceRef.current._L = L;
    })();

    return () => {
      if (mapInstanceRef.current) {
        if (mapInstanceRef.current._resizeObserver) mapInstanceRef.current._resizeObserver.disconnect();
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markersRef.current = {};
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild markers whenever gyms change (filter updates, data loads)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !map._L) return;
    const L = map._L;
    const cluster = markersRef.current['__cluster__'] as any;
    if (cluster) map.removeLayer(cluster);
    markersRef.current = {};
    addMarkers(L, map, gyms, onGymSelect);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gyms]);

  // Fly to region
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const { center, zoom } = REGION_BOUNDS[region] ?? REGION_BOUNDS.us;
    mapInstanceRef.current.flyTo(center, zoom, { duration: 1 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region]);

  // Pan + popup on card select
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!selectedGym || !map) return;
    const gym = gyms.find(g => g.id === selectedGym);
    if (!gym) return;
    map.flyTo([gym.lat, gym.lng], 13, { duration: 0.8 });
    const marker = markersRef.current[selectedGym];
    if (marker) (marker as any).openPopup();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGym]);

  function addMarkers(L: typeof import('leaflet'), map: any, gyms: Gym[], onSelect: (id: string) => void) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cluster = (L as any).markerClusterGroup({
      maxClusterRadius: 55,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      iconCreateFunction: (c: any) => {
        const n = c.getChildCount();
        return L.divIcon({
          className: '',
          html: `<div style="width:36px;height:36px;border-radius:50%;background:#5C4430;color:#F5F1E8;display:flex;align-items:center;justify-content:center;font-family:'Inter Tight',sans-serif;font-size:12px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:2px solid rgba(255,255,255,0.8);">${n > 999 ? '999+' : n}</div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });
      },
    });

    gyms.forEach((gym) => {
      const d0 = gym.open_mats[0]?.discipline;
      const markerColor = d0 ? DISCIPLINE_COLORS[d0].marker : '#9C7A5C';

      const icon = L.divIcon({
        className: '',
        html: `<div style="width:20px;height:20px;background:${markerColor};border:2px solid rgba(255,255,255,0.9);border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 5px rgba(0,0,0,0.25);cursor:pointer;"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 20],
        popupAnchor: [0, -24],
      });

      const chips = [...new Set(gym.open_mats.map(o => o.discipline))]
        .map(d => { const c = DISCIPLINE_COLORS[d]; return `<span style="display:inline-flex;align-items:center;gap:3px;background:${c.bg};color:${c.text};padding:2px 7px;border-radius:9999px;font-size:11px;font-weight:600;"><span style="width:6px;height:6px;border-radius:50%;background:${c.marker};display:inline-block;"></span>${DISCIPLINE_LABELS[d]}</span>`; })
        .join('');

      const rows = gym.open_mats
        .map(o => `<div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid rgba(62,46,32,0.08);font-size:12px;"><span style="font-weight:600;color:#9C7A5C;width:28px;flex-shrink:0;">${DAY_LABELS[o.day]}</span><span style="color:#3E2E20;">${o.start_time}–${o.end_time}</span><span style="color:#9C7A5C;flex:1;padding-left:4px;">${DISCIPLINE_LABELS[o.discipline]}</span><span style="font-weight:700;color:${o.is_free ? '#5E8B5E' : '#7D5E3F'};">${o.is_free ? 'FREE' : `$${o.cost}`}</span></div>`)
        .join('');

      const popup = L.popup({ maxWidth: 300, minWidth: 240 }).setContent(
        `<div style="font-family:'Inter Tight',sans-serif;padding:4px 0;">
          <div style="font-size:15px;font-weight:700;color:#3E2E20;margin-bottom:3px;line-height:1.3;">${gym.name}</div>
          <div style="font-size:12px;color:#9C7A5C;margin-bottom:8px;">📍 ${gym.city}${gym.state ? `, ${gym.state}` : ''} · ${gym.country}</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">${chips}</div>
          <div style="font-size:10px;font-weight:700;color:#9C7A5C;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px;">Open Mats</div>
          ${rows}
          ${gym.website ? `<a href="${gym.website}" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px;font-size:12px;color:#5C4430;font-weight:600;text-decoration:none;">Visit website →</a>` : ''}
        </div>`
      );

      const marker = L.marker([gym.lat, gym.lng], { icon }).bindPopup(popup);
      marker.on('click', () => onSelect(gym.id));
      cluster.addLayer(marker);
      markersRef.current[gym.id] = marker;
    });

    map.addLayer(cluster);
    markersRef.current['__cluster__'] = cluster;
  }

  return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />;
}
