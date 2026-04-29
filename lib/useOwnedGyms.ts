// Hook that exposes the gym IDs the current user is a verified owner of.
// Returns an empty array when signed-out or while loading. Used to gate
// the "Manage Gym" entry points across the app.

'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase, supabaseEnabled } from '@/lib/supabase';

export function useOwnedGyms(): string[] {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [gymIds, setGymIds] = useState<string[]>([]);

  useEffect(() => {
    if (!userId || !supabaseEnabled) { setGymIds([]); return; }
    let cancelled = false;
    supabase
      .from('gym_owners')
      .select('gym_id')
      .eq('user_id', userId)
      .eq('status', 'verified')
      .then(({ data }) => {
        if (cancelled || !data) return;
        setGymIds(data.map(r => r.gym_id as string).filter(Boolean));
      });
    return () => { cancelled = true; };
  }, [userId]);

  return gymIds;
}
