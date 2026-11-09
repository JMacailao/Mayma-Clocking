import { supabase } from './supabase.js';
export { supabase };
export const USERNAME_RE=/^[a-z0-9][a-z0-9_.-]{2,31}$/;
export const USERNAME_HELP='Username must be 3–32 characters and use letters, numbers, dots, hyphens, or underscores.';
export const authError = (error) => error?.message || 'Something went wrong. Please try again.';

export const escapeHTML = (value='') => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const message = (text, kind='info') => { const el=document.querySelector('[data-message]'); if(el){el.textContent=text;el.className=`notice ${kind}`;el.hidden=!text;if(text&&el.scrollIntoView)el.scrollIntoView({behavior:'smooth',block:'nearest'});} };
export const dbError = (error) => { if(error?.code==='23505') return 'That value is already in use.'; if(error?.code==='23503') return 'This record is still in use by another item.'; return error?.message || 'Could not save changes.'; };
export const formatDate = (value) => value ? new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}).format(new Date(value.endsWith?.('Z')?value:`${value}Z`)) : '—';
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

export const pageUrl = (path) => `${document.body.dataset.base || '../../'}${path}`;
export const fail = (error) => { console.error(error); const text=error?.message || 'Something went wrong. Please try again.'; if(!document.querySelector('[data-message]')&&document.querySelector('#app-shell')){document.querySelector('#app-shell').innerHTML=`<main class="loading"><strong>Could not connect to Supabase.</strong><span class="notice error">${escapeHTML(text)}</span><a class="button secondary" href="${pageUrl('index.html')}">Back to home</a></main>`;return;} message(text,'error'); };
