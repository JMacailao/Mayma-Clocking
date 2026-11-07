import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';

// Publishable client credentials are safe to ship to browsers. Row access is
// restricted by Supabase Auth and the policies in schema.sql.
export const supabase = createClient(
  'https://utfxtwgqdbjkbxlooolr.supabase.co',
  'sb_publishable_bUkPWYhRAP0nYd9yL01ObA__PJ3Q4v3',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);
