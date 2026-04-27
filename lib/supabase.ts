import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export const supabase = createClient(url, key);

// Service role client — bypasses RLS, only used in server-side API routes
export const supabaseAdmin = createClient(url, serviceKey || key);

export const supabaseEnabled = !!(url && key);
