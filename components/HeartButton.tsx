'use client';

import { useState } from 'react';
import { useFavorites } from './FavoritesProvider';

interface HeartButtonProps {
  gymId: string;
  /** Star glyph size in px. Component name kept for backwards compat. */
  size?: number;
  variant?: 'card' | 'overlay';
}

/**
 * Favorite toggle, rendered as a star.
 *  - Favorited:  ★  in gold (#FFD23F)
 *  - Unselected: ☆  in bone, on a brown-700 button with a bone outline
 *
 * (Component name kept as `HeartButton` so the many call sites don't need
 * to change — only the visual changes.)
 */
export default function HeartButton({ gymId, size = 22, variant = 'card' }: HeartButtonProps) {
  const { isFavorite, toggle } = useFavorites();
  const [busy, setBusy] = useState(false);
  const fav = isFavorite(gymId);

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    await toggle(gymId);
    setBusy(false);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={fav ? 'Remove from favorites' : 'Add to favorites'}
      title={fav ? 'Remove from favorites' : 'Add to favorites'}
      style={{
        // No circle: just the bare star glyph.
        background: 'transparent',
        border: 'none',
        borderRadius: 0,
        width: size + 6, height: size + 6,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: busy ? 'wait' : 'pointer',
        padding: 0,
        transition: 'transform 0.15s, color 0.15s',
        transform: busy ? 'scale(0.92)' : 'scale(1)',
        color: fav ? '#FFD23F' : 'var(--bone)',
        fontSize: size,
        lineHeight: 1,
        // `variant` is unused in this design but kept for API compat.
        ...(variant === 'overlay' ? { textShadow: '0 1px 3px rgba(0,0,0,0.55)' } : {}),
      }}
    >
      {fav ? '★' : '☆'}
    </button>
  );
}
