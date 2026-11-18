import { supabase } from './supabase.js';
export { supabase };
export const USERNAME_RE=/^[a-z0-9][a-z0-9_.-]{2,31}$/;
export const USERNAME_HELP='Username must be 3–32 characters and use letters, numbers, dots, hyphens, or underscores.';
export const authError = (error) => error?.message || 'Something went wrong. Please try again.';

export const escapeHTML = (value='') => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const message = (text, kind='info') => { const el=document.querySelector('[data-message]'); if(el){el.textContent=text;el.className=`notice ${kind}`;el.hidden=!text;if(text&&el.scrollIntoView)el.scrollIntoView({behavior:'smooth',block:'nearest'});} };
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
export const number = (value) => value==null?'—':Number(value).toLocaleString('en-PH',{maximumFractionDigits:3});
export const titleCase = (value) => String(value||'').replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase());
export const stateTag = (value) => `<span class="tag ${escapeHTML(value)}">${escapeHTML(titleCase(value))}</span>`;
export function tableRows(items, columns, empty='Nothing here yet.',withActions=true) {
  const actionHeader=withActions?'<th>Actions</th>':'';
  const actionCell=(item,index)=>withActions?`<td class="row-actions" data-label="Actions"><button class="text-button" data-edit="${index}">Edit</button><button class="text-button danger-text" data-delete="${escapeHTML(item.id)}">Delete</button></td>`:'';
  return `<div class="table-scroll"><table><thead><tr>${columns.map(c=>`<th>${escapeHTML(c.label)}</th>`).join('')}${actionHeader}</tr></thead><tbody>${items.length?items.map((item,index)=>`<tr>${columns.map(c=>`<td data-label="${escapeHTML(c.label)}">${c.render?c.render(item):escapeHTML(item[c.key])}</td>`).join('')}${actionCell(item,index)}</tr>`).join(''):`<tr><td colspan="${columns.length+(withActions?1:0)}" class="empty-cell">${escapeHTML(empty)}</td></tr>`}</tbody></table></div>`;
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
