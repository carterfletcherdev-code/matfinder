'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase, supabaseEnabled } from '@/lib/supabase';
import { useAuth } from './AuthProvider';

interface Aggregate { avg: number; count: number; }

interface RatingsContextValue {
  aggregates: Record<string, Aggregate>;
  myRatings: Record<string, number>;
  submit: (gymId: string, score: number) => Promise<{ ok: boolean; error?: string }>;
  remove: (gymId: string) => Promise<{ ok: boolean; error?: string }>;
}

const RatingsContext = createContext<RatingsContextValue | null>(null);

export function RatingsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [aggregates, setAggregates] = useState<Record<string, Aggregate>>({});
  const [myRatings, setMyRatings] = useState<Record<string, number>>({});

  // Load aggregates once on mount.
  useEffect(() => {
    if (!supabaseEnabled) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('ratings').select('gym_id, score');
      if (cancelled || !data) return;
      const sums: Record<string, { sum: number; count: number }> = {};
      for (const r of data) {
        const a = sums[r.gym_id] ?? (sums[r.gym_id] = { sum: 0, count: 0 });
        a.sum += r.score; a.count += 1;
      }
      const agg: Record<string, Aggregate> = {};
      for (const [id, { sum, count }] of Object.entries(sums)) {
        agg[id] = { avg: sum / count, count };
      }
      setAggregates(agg);
    })();
    return () => { cancelled = true; };
  }, []);

  // Load this user's ratings whenever auth changes.
  useEffect(() => {
    if (!userId || !supabaseEnabled) { setMyRatings({}); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('ratings').select('gym_id, score').eq('user_id', userId);
      if (cancelled || !data) return;
      const map: Record<string, number> = {};
      for (const r of data) map[r.gym_id] = r.score;
      setMyRatings(map);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const recomputeAggregate = useCallback((gymId: string, prevUser: number | undefined, nextUser: number | undefined) => {
    setAggregates(prev => {
      const cur = prev[gymId] ?? { avg: 0, count: 0 };
      const sum = cur.avg * cur.count;
      let newSum = sum;
      let newCount = cur.count;
      if (prevUser !== undefined) { newSum -= prevUser; newCount -= 1; }
      if (nextUser !== undefined) { newSum += nextUser; newCount += 1; }
      const next = { ...prev };
      if (newCount <= 0) delete next[gymId];
      else next[gymId] = { avg: newSum / newCount, count: newCount };
      return next;
    });
  }, []);

  const submit = useCallback(async (gymId: string, score: number) => {
    if (!supabaseEnabled) return { ok: false, error: 'Ratings not configured' };
    if (!userId) return { ok: false, error: 'Sign in to rate' };
    if (score < 1 || score > 5) return { ok: false, error: 'Invalid score' };

    const prevUser = myRatings[gymId];
    const { error } = await supabase
      .from('ratings')
      .upsert({ user_id: userId, gym_id: gymId, score }, { onConflict: 'user_id,gym_id' });
    if (error) return { ok: false, error: error.message };

    setMyRatings(prev => ({ ...prev, [gymId]: score }));
    recomputeAggregate(gymId, prevUser, score);
    return { ok: true };
  }, [userId, myRatings, recomputeAggregate]);

  const remove = useCallback(async (gymId: string) => {
    if (!supabaseEnabled || !userId) return { ok: false, error: 'Sign in required' };
    const prevUser = myRatings[gymId];
    if (prevUser === undefined) return { ok: true };
    const { error } = await supabase.from('ratings').delete().eq('user_id', userId).eq('gym_id', gymId);
    if (error) return { ok: false, error: error.message };
    setMyRatings(prev => { const next = { ...prev }; delete next[gymId]; return next; });
    recomputeAggregate(gymId, prevUser, undefined);
    return { ok: true };
  }, [userId, myRatings, recomputeAggregate]);

  return (
    <RatingsContext.Provider value={{ aggregates, myRatings, submit, remove }}>
      {children}
    </RatingsContext.Provider>
  );
}

export function useRatings() {
  const ctx = useContext(RatingsContext);
  if (!ctx) throw new Error('useRatings must be used within RatingsProvider');
  return ctx;
}
