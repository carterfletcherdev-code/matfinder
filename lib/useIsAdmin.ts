// Returns true when the signed-in user has a row in public.admins.
// Used to gate the /admin developer console + the dropdown entry point.

'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase, supabaseEnabled } from '@/lib/supabase';

export function useIsAdmin(): boolean {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!userId || !supabaseEnabled) { setIsAdmin(false); return; }
    let cancelled = false;
    supabase
      .from('admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setIsAdmin(!!data);
      });
    return () => { cancelled = true; };
  }, [userId]);

  return isAdmin;
}
