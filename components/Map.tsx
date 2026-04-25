'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { Gym, DISCIPLINE_LABELS, DISCIPLINE_COLORS, DAY_LABELS } from '@/lib/types';

interface MapProps {
  gyms: Gym[];
  selectedGym: string | null;
  onGymSelect: (id: string) => void;
}

export default function Map({ gyms, selectedGym, onGymSelect }: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const markersRef = useRef<Record<string, unknown>>({});

  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current) return;

    import('leaflet').then((L) => {
      if (mapInstanceRef.current) return;

      // Fix default icon paths
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(mapRef.current!, {
        center: [39.5, -98.35],
        zoom: 4,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
      }).addTo(map);

      mapInstanceRef.current = map;
      addMarkers(L, map, gyms, onGymSelect);

      // Invalidate size after paint and on resize
      setTimeout(() => map.invalidateSize(), 50);
      setTimeout(() => map.invalidateSize(), 300);
      const ro = new ResizeObserver(() => map.invalidateSize());
      if (mapRef.current) ro.observe(mapRef.current);
      (mapInstanceRef.current as any)._resizeObserver = ro;
    });

    return () => {
      if (mapInstanceRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const m = mapInstanceRef.current as any;
        if (m._resizeObserver) m._resizeObserver.disconnect();
        m.remove();
        mapInstanceRef.current = null;
        markersRef.current = {};
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update markers when gyms change
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    import('leaflet').then((L) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map = mapInstanceRef.current as any;
      // Remove old markers
      Object.values(markersRef.current).forEach((m) => (m as any).remove());
      markersRef.current = {};
      addMarkers(L, map, gyms, onGymSelect);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gyms]);

  // Pan to selected gym
  useEffect(() => {
    if (!selectedGym || !mapInstanceRef.current) return;
    const gym = gyms.find((g) => g.id === selectedGym);
    if (!gym) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mapInstanceRef.current as any).flyTo([gym.lat, gym.lng], 13, { duration: 0.8 });
    const marker = markersRef.current[selectedGym];
    if (marker) (marker as any).openPopup();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGym]);

  function addMarkers(
    L: typeof import('leaflet'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map: any,
    gyms: Gym[],
    onSelect: (id: string) => void,
  ) {
    gyms.forEach((gym) => {
      const primaryDiscipline = gym.open_mats[0]?.discipline;
      const color = primaryDiscipline ? DISCIPLINE_COLORS[primaryDiscipline].bg : '#E8DDC8';

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:32px;height:32px;
          background:${color};
          border:2.5px solid #5C4430;
          border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          box-shadow:0 2px 8px rgba(62,46,32,0.3);
          cursor:pointer;
        "></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -36],
      });

      const disciplineChips = [...new Set(gym.open_mats.map((o) => o.discipline))]
        .map((d) => {
          const c = DISCIPLINE_COLORS[d];
          return `<span style="
            background:${c.bg};color:${c.text};
            padding:2px 8px;border-radius:9999px;
            font-size:11px;font-weight:600;white-space:nowrap;
          ">${DISCIPLINE_LABELS[d]}</span>`;
        })
        .join('');

      const scheduleRows = gym.open_mats
        .map((o) => `
          <div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(62,46,32,0.1);">
            <span style="font-size:11px;font-weight:600;color:#9C7A5C;width:28px;flex-shrink:0;">${DAY_LABELS[o.day]}</span>
            <span style="font-size:12px;color:#3E2E20;">${o.start_time}–${o.end_time}</span>
            <span style="font-size:11px;color:#7D5E3F;">${DISCIPLINE_LABELS[o.discipline]}</span>
            <span style="margin-left:auto;font-size:11px;font-weight:600;color:${o.is_free ? '#5E8B5E' : '#7D5E3F'};">
              ${o.is_free ? 'FREE' : `$${o.cost}`}
            </span>
          </div>
        `)
        .join('');

      const popup = L.popup({ maxWidth: 280, minWidth: 220 }).setContent(`
        <div style="font-family:'Inter Tight',sans-serif;padding:4px 0;">
          <div style="font-size:15px;font-weight:700;color:#3E2E20;margin-bottom:8px;line-height:1.3;">${gym.name}</div>
          <div style="font-size:12px;color:#7D5E3F;margin-bottom:8px;">📍 ${gym.city}, ${gym.state}</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;">${disciplineChips}</div>
          <div style="font-size:11px;font-weight:700;color:#9C7A5C;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Open Mats</div>
          ${scheduleRows}
          ${gym.website ? `<a href="${gym.website}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:8px;font-size:12px;color:#5C4430;font-weight:600;text-decoration:none;">Visit website →</a>` : ''}
        </div>
      `);

      const marker = L.marker([gym.lat, gym.lng], { icon }).bindPopup(popup);
      marker.on('click', () => onSelect(gym.id));
      marker.addTo(map);
      markersRef.current[gym.id] = marker;
    });
  }

  return (
    <div
      ref={mapRef}
      style={{ width: '100%', height: '100%', minHeight: 400 }}
    />
  );
}
