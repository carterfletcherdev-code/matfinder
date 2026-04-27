'use client';

import { useState } from 'react';
import { useFavorites } from './FavoritesProvider';

interface HeartButtonProps {
  gymId: string;
  size?: number;
  variant?: 'card' | 'overlay';
}

export default function HeartButton({ gymId, size = 18, variant = 'card' }: HeartButtonProps) {
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

  const overlayBg = variant === 'overlay' ? 'rgba(40,28,20,0.85)' : 'transparent';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={fav ? 'Remove from favorites' : 'Add to favorites'}
      title={fav ? 'Remove from favorites' : 'Add to favorites'}
      style={{
        background: overlayBg,
        border: variant === 'overlay' ? '1px solid rgba(245,241,232,0.3)' : 'none',
        borderRadius: variant === 'overlay' ? '50%' : 4,
        width: size + 10, height: size + 10,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: busy ? 'wait' : 'pointer',
        padding: 0,
        transition: 'transform 0.15s, color 0.15s',
        transform: busy ? 'scale(0.92)' : 'scale(1)',
        color: fav ? '#E11D48' : 'rgba(245,241,232,0.55)',
        fontSize: size,
        lineHeight: 1,
      }}
    >
      {fav ? '♥' : '♡'}
    </button>
  );
}
