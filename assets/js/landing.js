import { supabase } from './supabase.js';
const label=document.querySelector('[data-entry-label]');
try { const {data,error}=await supabase.rpc('has_admin_account'); if(!error&&data) label.textContent='Sign in to the clocking app'; } catch {}
