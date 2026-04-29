'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, supabaseEnabled } from '@/lib/supabase';

type Tier = 'free' | 'standard' | 'pro';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  tier: Tier;
  favoritesLimit: number;
  signInWithEmail: (email: string) => Promise<{ ok: boolean; error?: string }>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  showSignInModal: boolean;
  setShowSignInModal: (show: boolean) => void;
  requireAuth: (action: () => void) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const FAVORITES_LIMITS: Record<Tier, number> = { free: 5, standard: 30, pro: Infinity };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState<Tier>('free');
  const [showSignInModal, setShowSignInModal] = useState(false);

  useEffect(() => {
    if (!supabaseEnabled) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load subscription tier when session changes — and re-fetch on tab
  // focus / visibility change so users who upgrade via Stripe see their
  // tier reflected as soon as they return to the app.
  useEffect(() => {
    if (!session?.user) { setTier('free'); return; }
    let cancelled = false;
    const userId = session.user.id;

    async function refresh() {
      const { data } = await supabase
        .from('subscriptions')
        .select('tier, status')
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled) return;
      if (data?.status === 'active' && (data.tier === 'standard' || data.tier === 'pro')) {
        setTier(data.tier as Tier);
      } else {
        setTier('free');
      }
    }

    refresh();

    const onFocus = () => { refresh(); };
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [session?.user?.id]);

  const signInWithGoogle = useCallback(async () => {
    if (!supabaseEnabled) return;
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
    });
  }, []);

  const signInWithEmail = useCallback(async (email: string) => {
    if (!supabaseEnabled) return { ok: false, error: 'Auth not configured' };
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
  }, []);

  const requireAuth = useCallback((action: () => void) => {
    if (session?.user) action();
    else setShowSignInModal(true);
  }, [session]);

  return (
    <AuthContext.Provider value={{
      user: session?.user ?? null,
      session,
      loading,
      tier,
      favoritesLimit: FAVORITES_LIMITS[tier],
      signInWithEmail,
      signInWithGoogle,
      signOut,
      showSignInModal,
      setShowSignInModal,
      requireAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
