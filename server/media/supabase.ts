import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseConfig } from './env';

let cached: SupabaseClient | undefined;

/** Server-only client using the service role key. Never expose to the browser. */
export function supabaseAdmin(): SupabaseClient {
  if (!cached) {
    const { url, serviceRoleKey } = supabaseConfig();
    cached = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
