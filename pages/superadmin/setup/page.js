import { supabase, escapeHTML } from '../../../assets/js/shared.js';

// What each setup part adds, in the order avilonx-update.sql runs them.
const PARTS=[
  ['multi-club','Clubs and team accounts'],
  ['account-credentials','Change usernames and passwords'],
  ['public-results','Public results page'],
  ['sticker-barcodes','Sticker barcodes'],
  ['race-release-time','Races saved before their release time'],
  ['race-schedule-dates','Race open and end dates'],
  ['nfc-tags','RFID / NFC tags'],
  ['rfid-devices','ESP8266 RFID readers'],
  ['entry-remarks','Entry remarks and practice races'],
  ['bird-bonding','Bird bonding'],
  ['show-up','Show up'],
  ['rfid-tag-in-use','RFID tag once per race'],
  ['bird-ring-only','Ring-number-only birds'],
  ['race-day','Race day: change history, setup checks'],
  ['realtime','Instant result pop-ups (live updates)']
];

// Super Admin: which parts of the database setup are done, and what to run.
export async function render(view){
  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">DATABASE</span><h2>Setup checklist</h2><p>Every AvilonX feature needs its part of the database. Green = done. If anything is red, run <strong>avilonx-update.sql</strong> in the Supabase SQL Editor (it is safe to run again), then press Check again.</p></div><button class="button secondary" type="button" data-recheck>Check again</button></div>
  <section class="panel"><div data-setup-list><p class="small">Checking…</p></div></section>
  <section class="panel"><h3>How to update the database</h3><ol class="setup-steps"><li>Open Supabase → your project → <strong>SQL Editor</strong> → <strong>New query</strong>.</li><li>Paste the whole of <strong>avilonx-update.sql</strong> (from the AvilonX files) and press <strong>Run</strong>.</li><li>Come back here and press <strong>Check again</strong>.</li></ol><p class="small">A brand-new database first needs <strong>schema.sql</strong> and <strong>supabase-auth.sql</strong>, once.</p></section>`;
  const list=view.querySelector('[data-setup-list]');
  const check=async()=>{
    list.innerHTML='<p class="small">Checking…</p>';
    const {data,error}=await supabase.rpc('setup_status');
    if(error){list.innerHTML=`<div class="notice error">The setup check itself is not installed yet. Run <strong>avilonx-update.sql</strong> in the Supabase SQL Editor, then press Check again.</div>`;return;}
    const missing=PARTS.filter(([key])=>!data?.[key]).length;
    list.innerHTML=`<p class="setup-summary ${missing?'is-bad':'is-ok'}">${missing?`${missing} part${missing===1?' is':'s are'} not set up. Run avilonx-update.sql.`:'Everything is set up.'}</p><ul class="setup-list">${PARTS.map(([key,label])=>`<li class="${data?.[key]?'is-ok':'is-bad'}"><span class="setup-mark" aria-hidden="true">${data?.[key]?'✓':'✕'}</span><span><strong>${escapeHTML(label)}</strong><span class="small">${escapeHTML(key==='realtime'?'Turned on by race-day.sql':`${key}.sql`)}</span></span><span class="setup-state">${data?.[key]?'Done':'Not set up'}</span></li>`).join('')}</ul>`;
  };
  view.querySelector('[data-recheck]').onclick=check;
  await check();
}
