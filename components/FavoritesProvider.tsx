'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase, supabaseEnabled } from '@/lib/supabase';
import { useAuth, FAVORITES_LIMITS } from './AuthProvider';

interface FavoritesContextValue {
  favorites: Set<string>;
  isFavorite: (gymId: string) => boolean;
  count: number;
  limit: number;
  isAtLimit: boolean;
  toggle: (gymId: string) => Promise<{ ok: boolean; error?: string; reason?: 'limit' | 'auth' }>;
  showLimitModal: boolean;
  setShowLimitModal: (show: boolean) => void;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { session, tier, requireAuth } = useAuth();
  const userId = session?.user?.id;
  const limit = FAVORITES_LIMITS[tier];

  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [showLimitModal, setShowLimitModal] = useState(false);

  useEffect(() => {
    if (!userId || !supabaseEnabled) { setFavorites(new Set()); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('favorites').select('gym_id').eq('user_id', userId);
      if (cancelled || !data) return;
      setFavorites(new Set(data.map(r => r.gym_id)));
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const isFavorite = useCallback((gymId: string) => favorites.has(gymId), [favorites]);

  const toggle = useCallback(async (gymId: string) => {
    if (!userId) {
      requireAuth(() => {});
      return { ok: false, reason: 'auth' as const };
    }
    if (!supabaseEnabled) return { ok: false, error: 'Favorites not configured' };

    const has = favorites.has(gymId);
    if (!has && favorites.size >= limit) {
      setShowLimitModal(true);
      return { ok: false, reason: 'limit' as const };
    }

    if (has) {
      const { error } = await supabase.from('favorites').delete().eq('user_id', userId).eq('gym_id', gymId);
      if (error) return { ok: false, error: error.message };
      setFavorites(prev => { const next = new Set(prev); next.delete(gymId); return next; });
    } else {
      const { error } = await supabase.from('favorites').insert({ user_id: userId, gym_id: gymId });
      if (error) return { ok: false, error: error.message };
      setFavorites(prev => new Set(prev).add(gymId));
    }
    return { ok: true };
  }, [userId, favorites, limit, requireAuth]);

  return (
    <FavoritesContext.Provider value={{
      favorites, isFavorite, count: favorites.size, limit,
      isAtLimit: favorites.size >= limit,
      toggle, showLimitModal, setShowLimitModal,
    }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used within FavoritesProvider');
  return ctx;
}
