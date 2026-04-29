'use client';

// Reusable photo lightbox modal. Used by /gym/[gymId]/page.tsx when the
// "Browse photos" button on the hero is tapped. Designed to gracefully
// scale from 1 photo (current state — single Google Places photo per
// gym) up to many photos when gym owners upload their own.
//
// Behaviors:
//   - Click backdrop closes
//   - Esc key closes
//   - Body scroll locked while open
//   - Arrow keys navigate (left/right) when there's more than one photo
//   - Single photo: just a hero shot with a close X
//   - Multiple photos: hero + thumb strip + arrow nav

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  photos: string[];
  initialIndex?: number;
  onClose: () => void;
}

export default function PhotoLightbox({ photos, initialIndex = 0, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [portal, setPortal] = useState<HTMLElement | null>(null);

  // Mount-only — portal target is document.body so the modal escapes any
  // backdrop-filter / transform containing-block traps.
  useEffect(() => {
    if (typeof document !== 'undefined') setPortal(document.body);
  }, []);

  // Lock body scroll while the modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Keyboard nav: Esc closes, ←/→ navigate when multi-photo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (photos.length > 1) {
        if (e.key === 'ArrowLeft')  setIndex(i => (i - 1 + photos.length) % photos.length);
        if (e.key === 'ArrowRight') setIndex(i => (i + 1) % photos.length);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photos.length, onClose]);

  if (!portal || photos.length === 0) return null;

  const current = photos[index] ?? photos[0]!;
  const hasMultiple = photos.length > 1;

  const modal = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.92)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      {/* Close button — fixed top-right */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close photo viewer"
        style={{
          position: 'absolute', top: 16, right: 16,
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(245,241,232,0.10)',
          border: '1px solid rgba(245,241,232,0.20)',
          color: 'var(--bone)',
          fontSize: 18,
          cursor: 'pointer',
          display: 'grid', placeItems: 'center',
          transition: 'background 150ms',
          zIndex: 2,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(245,241,232,0.18)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(245,241,232,0.10)'; }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

      {/* Counter (only when multi) */}
      {hasMultiple && (
        <div
          style={{
            position: 'absolute', top: 24, left: 24,
            color: 'rgba(245,241,232,0.8)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 13, fontWeight: 600,
            letterSpacing: '0.04em',
          }}
        >
          {index + 1} / {photos.length}
        </div>
      )}

      {/* Photo container — clicking the photo itself shouldn't close */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          maxWidth: 'min(1100px, 95vw)',
          maxHeight: hasMultiple ? '80vh' : '90vh',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 16,
        }}
      >
        {/* Hero photo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current}
          alt={`Photo ${index + 1} of ${photos.length}`}
          style={{
            maxWidth: '100%',
            maxHeight: hasMultiple ? '70vh' : '85vh',
            objectFit: 'contain',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
            display: 'block',
          }}
        />

        {/* Thumb strip + arrows when multiple photos exist */}
        {hasMultiple && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <NavBtn
              dir="prev"
              onClick={() => setIndex(i => (i - 1 + photos.length) % photos.length)}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              {photos.map((p, i) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Show photo ${i + 1}`}
                  style={{
                    width: 56, height: 40,
                    borderRadius: 6,
                    border: i === index ? '2px solid var(--bone)' : '2px solid transparent',
                    overflow: 'hidden',
                    padding: 0,
                    cursor: 'pointer',
                    background: 'var(--brown-700)',
                    opacity: i === index ? 1 : 0.6,
                    transition: 'opacity 150ms, border-color 150ms',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = i === index ? '1' : '0.6'; }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </button>
              ))}
            </div>
            <NavBtn
              dir="next"
              onClick={() => setIndex(i => (i + 1) % photos.length)}
            />
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, portal);
}

function NavBtn({ dir, onClick }: { dir: 'prev' | 'next'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === 'prev' ? 'Previous photo' : 'Next photo'}
      style={{
        width: 36, height: 36, borderRadius: '50%',
        background: 'rgba(245,241,232,0.10)',
        border: '1px solid rgba(245,241,232,0.20)',
        color: 'var(--bone)',
        cursor: 'pointer',
        display: 'grid', placeItems: 'center',
        transition: 'background 150ms',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(245,241,232,0.18)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(245,241,232,0.10)'; }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {dir === 'prev' ? (
          <>
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </>
        ) : (
          <>
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="12 5 19 12 12 19"/>
          </>
        )}
      </svg>
    </button>
  );
}
