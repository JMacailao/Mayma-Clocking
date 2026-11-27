import { supabase } from './supabase.js';
export { supabase };
export const USERNAME_RE=/^[a-z0-9][a-z0-9_.-]{2,31}$/;
export const USERNAME_HELP='Username must be 3–32 characters and use letters, numbers, dots, hyphens, or underscores.';
export const authError = (error) => error?.message || 'Something went wrong. Please try again.';

export const escapeHTML = (value='') => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
// Messages pop up on the right of the screen. Errors (for example an NFC tag
// that is not registered) shake, buzz and vibrate; successes chime. The sound
// can be switched off on any message and stays off on that device.
const SOUND_KEY='avilonx.sound';
let audioContext=null;
const soundOn=()=>{try{return localStorage.getItem(SOUND_KEY)!=='off';}catch{return true;}};
const audio=()=>{
  try{const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return null;audioContext=audioContext||new Context();if(audioContext.state==='suspended')audioContext.resume();return audioContext;}catch{return null;}
};
// Browsers only allow sound after the person has touched the page once.
if(typeof document!=='undefined'&&document.addEventListener)document.addEventListener('pointerdown',()=>{if(soundOn())audio();},{once:true,capture:true});
const tone=(context,{frequency,start,length,type='sine',volume=0.08})=>{
  const oscillator=context.createOscillator(),gain=context.createGain();
  oscillator.type=type;oscillator.frequency.value=frequency;
  gain.gain.setValueAtTime(0.0001,context.currentTime+start);
  gain.gain.exponentialRampToValueAtTime(volume,context.currentTime+start+0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001,context.currentTime+start+length);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(context.currentTime+start);oscillator.stop(context.currentTime+start+length+0.02);
};
export const playFeedback=kind=>{
  if(!soundOn())return;
  const context=audio();if(!context)return;
  try{
    if(kind==='success'){tone(context,{frequency:880,start:0,length:0.12});tone(context,{frequency:1320,start:0.11,length:0.18});}
    else if(kind==='error'){tone(context,{frequency:196,start:0,length:0.16,type:'square',volume:0.05});tone(context,{frequency:131,start:0.17,length:0.26,type:'square',volume:0.05});}
  }catch{/* sound is optional */}
};
const toastStack=()=>{
  let stack=document.querySelector('[data-toast-stack]');
  if(!stack&&document.body){stack=document.createElement('div');stack.className='toast-stack';stack.dataset.toastStack='';stack.setAttribute('aria-live','polite');document.body.append(stack);}
  // A pop-up (modal dialog) covers the page: show messages inside it so they stay visible.
  const host=[...document.querySelectorAll('dialog[open]')].find(dialog=>dialog.matches(':modal'))||document.body;
  if(stack&&host&&stack.parentElement!==host)host.append(stack);
  return stack;
};
export const message = (text, kind='info') => {
  const legacy=document.querySelector('[data-message]');if(legacy){legacy.hidden=true;legacy.textContent='';}
  const stack=toastStack();if(!stack)return;
  if(!text){stack.querySelectorAll('.toast').forEach(toast=>toast.remove());return;}
  const latest=stack.lastElementChild;
  if(latest&&latest.dataset.text===text&&latest.dataset.kind===kind){latest.classList.remove('is-shaking');void latest.offsetWidth;if(kind==='error')latest.classList.add('is-shaking');clearTimeout(Number(latest.dataset.timer));latest.dataset.timer=String(setTimeout(()=>latest.remove(),kind==='error'?8000:4500));playFeedback(kind);return;}
  const toast=document.createElement('div');
  toast.className=`toast ${kind}${kind==='error'?' is-shaking':''}`;toast.dataset.text=text;toast.dataset.kind=kind;
  if(kind==='error')toast.setAttribute('role','alert');
  const icon=kind==='error'?'✕':kind==='success'?'✓':'i';
  toast.innerHTML=`<span class="toast-icon" aria-hidden="true">${icon}</span><span class="toast-text"></span><button class="toast-sound" type="button" aria-label="${soundOn()?'Turn sounds off':'Turn sounds on'}" title="${soundOn()?'Sounds on':'Sounds off'}">${soundOn()?'🔊':'🔇'}</button><button class="toast-close" type="button" aria-label="Close message">×</button>`;
  toast.querySelector('.toast-text').textContent=text;
  toast.querySelector('.toast-close').onclick=()=>toast.remove();
  toast.querySelector('.toast-sound').onclick=()=>{const on=!soundOn();try{localStorage.setItem(SOUND_KEY,on?'on':'off');}catch{/* storage unavailable */}stack.querySelectorAll('.toast-sound').forEach(button=>{button.textContent=on?'🔊':'🔇';button.title=on?'Sounds on':'Sounds off';button.setAttribute('aria-label',on?'Turn sounds off':'Turn sounds on');});if(on)playFeedback('success');};
  stack.append(toast);
  while(stack.children.length>3)stack.firstElementChild.remove();
  toast.dataset.timer=String(setTimeout(()=>toast.remove(),kind==='error'?8000:4500));
  if(kind==='error'&&navigator.vibrate)try{navigator.vibrate([90,50,90]);}catch{/* not supported */}
  playFeedback(kind);
};
// A column or function the app needs is missing from the database: name the SQL
// file that adds it, so the club can run it in the Supabase SQL Editor.
const MISSING_SQL=[[/open_date|end_date/,'race-schedule-dates.sql'],[/release_at_utc/,'race-release-time.sql'],[/rfid_device|rfid_recent_scans/,'rfid-devices.sql'],[/nfc_tag|nfc_tags|submit_member_nfc_clock|superadmin_register_nfc_tag/,'nfc-tags.sql'],[/barcode_sticker|scratch_code|is_registered|sticker_season|superadmin_register_sticker|superadmin_generate_sticker_batch/,'sticker-barcodes.sql'],[/public_race_results|public_result_clubs/,'public-results.sql']];
export const missingSchemaMessage = (error) => {
  const text=`${error?.message||''} ${error?.details||''} ${error?.hint||''}`;
  if(!['PGRST204','PGRST202','PGRST200','42703','42883'].includes(error?.code)&&!/schema cache|does not exist/i.test(text))return null;
  const file=MISSING_SQL.find(([pattern])=>pattern.test(text))?.[1];
  return file?`The database is missing an update. In Supabase, open SQL Editor and run ${file}, then reload this page.`:'The database is missing an update. In Supabase, open SQL Editor and run the latest SQL files listed in the README, then reload this page.';
};
export const dbError = (error) => { const missing=missingSchemaMessage(error); if(missing) return missing; if(error?.code==='23505') return 'That value is already in use.'; if(error?.code==='23503') return 'This record is still in use by another item.'; return error?.message || 'Could not save changes.'; };
// Formats a time in Philippine time. Accepts UTC times stored without a zone
// ("2026-11-15 05:00:00") and times that already carry one ("...Z" or
// "...+00:00"). Shows "—" for a blank or unreadable value instead of throwing.
const DATE_FORMAT=new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'});
const DATE_SECONDS_FORMAT=new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'medium',timeZone:'Asia/Manila'});
// The same, to the second (for clocking times).
export const formatDateSeconds = (value) => formatDate(value,DATE_SECONDS_FORMAT);
export const formatDate = (value,format=DATE_FORMAT) => {
  if(value===null||value===undefined||value==='')return '—';
  let date;
  if(value instanceof Date||typeof value==='number')date=new Date(value);
  else{const text=String(value).trim().replace(' ','T').replace(/([+-]\d\d)$/,'$1:00');date=new Date(/([zZ]|[+-]\d\d:?\d\d)$/.test(text)?text:`${text}Z`);}
  return Number.isNaN(date.valueOf())?'—':format.format(date);
};
export const phDateTimeLocalToUtc = (value) => {
  if(!value)return null;
  const normalized=value.length===16?`${value}:00`:value;
  const date=new Date(`${normalized}+08:00`);
  return Number.isNaN(date.valueOf())?null:date.toISOString().slice(0,19).replace('T',' ');
};
export const utcToPhDateTimeLocal = (value) => {
  if(!value)return '';
  const normalized=String(value).replace(' ','T');
  const date=new Date(/[zZ]|[+-]\d\d:\d\d$/.test(normalized)?normalized:`${normalized}Z`);
  return Number.isNaN(date.valueOf())?'':new Date(date.valueOf()+8*60*60*1000).toISOString().slice(0,16);
};
export const peso = (value) => Number(value||0).toLocaleString('en-PH',{maximumFractionDigits:2});
// Distances are stored in metres (speeds use the full distance); everywhere they
// are shown in km rounded to 2 decimals (e.g. 177.86 km).
export const distanceKm = (meters) => meters===null||meters===undefined||meters===''||!Number.isFinite(Number(meters)) ? '—' : `${(Math.round(Number(meters)/10)/100).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})} km`;
// Coordinates are kept exactly but shown rounded to 2 decimals (e.g. 13.76).
export const coord2 = (value) => value===null||value===undefined||value===''||!Number.isFinite(Number(value)) ? '—' : Number(value).toFixed(2);
// Header of a race on Results and the public results: release point, its
// coordinates, release time, status and birds clocked of entered (e.g. 9/10).
export const raceSummaryHtml = (race) => {
  const coord=(value,pos,neg)=>value==null||value===''||!Number.isFinite(Number(value))?null:`${Math.abs(Number(value)).toFixed(2)}° ${Number(value)<0?neg:pos}`;
  const lat=coord(race.latitude,'N','S'),lon=coord(race.longitude,'E','W');
  const entered=Number(race.entered)||0,clocked=Number(race.clocked)||0;
  const item=(label,value,cls='')=>`<div class="race-summary-item${cls}"><dt>${escapeHTML(label)}</dt><dd>${value}</dd></div>`;
  return `<section class="race-summary"><h3>${escapeHTML(race.name||'Race')} <span class="race-summary-status${race.status==='closed'?' is-closed':''}">${race.status==='closed'?'Closed · final':'Open'}</span></h3><dl>${item('Location',escapeHTML(race.location||'—'))}${item('Coordinates',lat&&lon?`${escapeHTML(lat)}, ${escapeHTML(lon)}`:'—')}${item('Release time',escapeHTML(formatDateSeconds(race.release_at_utc)))}${item('Clocked',`<strong>${clocked}/${entered}</strong> <span>birds</span>`,' is-count')}</dl></section>`;
};
export const number = (value) => value==null?'—':Number(value).toLocaleString('en-PH',{maximumFractionDigits:3});
// A ring number with the entry's ticked remarks after it, e.g. "12345 P1/P2/P3".
// Only for showing: the saved ring number stays plain for clocking and matching.
export const ringLabel = (ring, remarks) => { const list=(Array.isArray(remarks)?remarks:[]).filter(Boolean); return `${ring??''}${list.length?` ${list.join('/')}`:''}`.trim(); };
export const titleCase = (value) => String(value||'').replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase());
export const stateTag = (value) => `<span class="tag ${escapeHTML(value)}">${escapeHTML(titleCase(value))}</span>`;
export function tableRows(items, columns, empty='Nothing here yet.',withActions=true) {
  const actionHeader=withActions?'<th>Actions</th>':'';
  const actionCell=(item,index)=>withActions?`<td class="row-actions" data-label="Actions"><button class="text-button" data-edit="${index}">Edit</button><button class="text-button danger-text" data-delete="${escapeHTML(item.id)}">Delete</button></td>`:'';
  return `<div class="table-scroll" tabindex="0" role="region" aria-label="${escapeHTML(columns.map(c=>c.label).slice(0,3).join(', '))} table"><table><thead><tr>${columns.map(c=>`<th>${escapeHTML(c.label)}</th>`).join('')}${actionHeader}</tr></thead><tbody>${items.length?items.map((item,index)=>`<tr>${columns.map(c=>`<td data-label="${escapeHTML(c.label)}">${c.render?c.render(item):escapeHTML(item[c.key])}</td>`).join('')}${actionCell(item,index)}</tr>`).join(''):`<tr><td colspan="${columns.length+(withActions?1:0)}" class="empty-cell">${escapeHTML(empty)}</td></tr>`}</tbody></table></div>`;
}

export const pageUrl = (path) => new URL(path,document.body.dataset.appRoot || new URL(document.body.dataset.base || '../../',location.href)).href;
export const fail = (error) => { console.error(error); const text=missingSchemaMessage(error) || error?.message || 'Something went wrong. Please try again.'; if(!document.querySelector('[data-message]')&&document.querySelector('#app-shell')){document.querySelector('#app-shell').innerHTML=`<main class="loading"><strong>Could not connect to Supabase.</strong><span class="notice error">${escapeHTML(text)}</span><a class="button secondary" href="${pageUrl('index.html')}">Back to home</a></main>`;return;} message(text,'error'); };

export const normalizeImportHeader=value=>String(value??'').toLowerCase().replace(/[^a-z0-9]/g,'');
let spreadsheetParserPromise=null;
export function loadSpreadsheetParser(){
  if(window.XLSX?.read)return Promise.resolve(window.XLSX);
  if(!spreadsheetParserPromise)spreadsheetParserPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';script.crossOrigin='anonymous';script.dataset.sheetjs='';
    script.onload=()=>window.XLSX?.read?resolve(window.XLSX):reject(new Error('The Excel reader did not load.'));
    script.onerror=()=>reject(new Error('Could not load the Excel reader. Check your internet connection.'));
    document.head.append(script);
  }).catch(error=>{spreadsheetParserPromise=null;document.querySelector('[data-sheetjs]')?.remove();throw error;});
  return spreadsheetParserPromise;
}

// Sends the link that confirms a member's email (Edge Function
// avilonx-password-reset). Returns a sentence for the notice, starting with a space.
export async function sendEmailConfirm(memberId){
  const {data,error}=await supabase.functions.invoke('avilonx-password-reset',{body:{action:'confirm',member_id:memberId??null}});
  if(error){let detail='';try{detail=(await error.context?.json?.())?.error||'';}catch{/* no details */}return ` Confirmation email not sent: ${detail||'password reset by email is not set up yet (see docs/PASSWORD-RESET.md).'}`;}
  return data?.confirmed?` ${data.email} is already confirmed.`:` A confirmation link was sent to ${data?.email||'the email'}; it must be opened before password resets can use it.`;
}
