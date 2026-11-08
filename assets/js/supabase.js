import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm";

// Publishable client credentials are safe to ship to browsers. Row access is
// restricted by Supabase Auth and the policies in supabase-auth.sql.
export const supabase = createClient(
  "https://ddwzrjvlatdbwaiagxhp.supabase.co",
  "sb_publishable_F1aQuk2-JdopON7szgnfPQ_kSabMq7N",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
