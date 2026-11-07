import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
import { firebaseAuth } from './firebase.js';

// The publishable key is public. Supabase accepts Firebase ID tokens only after
// Firebase is connected under Supabase Auth → Third-Party Auth.
export const supabase = createClient(
  'https://ddwzrjvlatdbwaiagxhp.supabase.co',
  'sb_publishable_F1aQuk2-JdopON7szgnfPQ_kSabMq7N',
  { accessToken: async () => firebaseAuth?.currentUser ? firebaseAuth.currentUser.getIdToken() : null }
);
