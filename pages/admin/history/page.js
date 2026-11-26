import { supabase, escapeHTML, formatDateSeconds, distanceKm } from '../../../assets/js/shared.js';

const TABLES={races:'Race schedule',race_entries:'Race entry',clock_events:'Clock',pigeons:'Bonded bird',password_reset:'Password reset'};
const ACTIONS={insert:'Added',update:'Changed',delete:'Deleted'};
// Fields worth showing, with friendly names; others are left out of the list.
const FIELDS={name:'Name',status:'Status',release_at_utc:'Release',release_location:'Release point',open_date:'Open date',end_date:'End date',is_practice:'Practice',pigeon_ring:'Ring',ring_number:'Ring',barcode:'Sticker',nfc_tag:'RFID tag',nfc_expires_at:'Tag expires',remarks:'Remarks',distance_m:'Distance',member_id:'Member',received_at_utc:'Clocked at',verification:'Verification',source:'Clocked with',bird_name:'Bird name',color:'Colour',loft_name:'Loft',bond_type:'Bond',category:'Category',pooling:'Pooling',event:'What',member:'Member',email:'Email'};
const PAGE=100;

const show=(value,key)=>key==='distance_m'&&value!==null&&value!==undefined&&value!==''?distanceKm(value):value===null||value===undefined||value===''?'—':Array.isArray(value)?(value.join(', ')||'—'):typeof value==='boolean'?(value?'Yes':'No'):String(value);
// What changed: for an update the fields that differ, otherwise the main fields.
function changes(row){
  const before=row.old_data||{},after=row.new_data||{};
  const keys=Object.keys(FIELDS).filter(key=>key in before||key in after);
  if(row.action==='update')return keys.filter(key=>JSON.stringify(before[key])!==JSON.stringify(after[key])).map(key=>[FIELDS[key],show(before[key],key),show(after[key],key)]);
  const data=row.action==='delete'?before:after;
  return keys.filter(key=>data[key]!==null&&data[key]!==undefined&&data[key]!==''&&!(Array.isArray(data[key])&&!data[key].length)).slice(0,6).map(key=>[FIELDS[key],null,show(data[key],key)]);
}
const label=row=>{const data=row.new_data||row.old_data||{};return data.pigeon_ring||data.ring_number||data.name||(row.row_id?`#${row.row_id}`:'');};

// Club admins and staff: who changed what, and when.
export async function render(view){
  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">RECORDS</span><h2>Change history</h2><p>Who changed races, entries, clocks and birds, and when.</p></div></div>
  <section class="panel"><div class="history-filters"><label class="field"><span>What</span><select data-table><option value="">Everything</option>${Object.entries(TABLES).map(([key,text])=>`<option value="${key}">${text}s</option>`).join('')}</select></label><label class="field"><span>Search</span><input data-search placeholder="Ring, race, sticker or person"></label></div><div data-history><p class="small">Loading…</p></div><div class="history-more"><button class="button secondary" type="button" data-more hidden>Show older changes</button></div></section>`;
  const box=view.querySelector('[data-history]'),more=view.querySelector('[data-more]'),tableSelect=view.querySelector('[data-table]'),search=view.querySelector('[data-search]');
  let rows=[],limit=PAGE;
  const load=async()=>{
    let query=supabase.from('audit_log').select('*').order('changed_at',{ascending:false}).limit(limit);
    if(tableSelect.value)query=query.eq('table_name',tableSelect.value);
    const {data,error}=await query;
    if(error){box.innerHTML=/audit_log|relation|schema cache/i.test(error.message||'')?'<div class="notice error">Change history is not set up yet. Run <strong>avilonx-update.sql</strong> in the Supabase SQL Editor. Changes are recorded from then on.</div>':`<div class="notice error">${escapeHTML(error.message)}</div>`;more.hidden=true;return;}
    rows=data||[];more.hidden=rows.length<limit;draw();
  };
  const draw=()=>{
    const text=search.value.trim().toLowerCase();
    const list=rows.filter(row=>!text||JSON.stringify([row.changed_by_name,row.new_data,row.old_data]).toLowerCase().includes(text));
    box.innerHTML=list.length?`<ol class="history-list">${list.map(row=>{const diff=changes(row);return `<li class="history-item is-${row.action}"><div class="history-head"><span class="history-action">${ACTIONS[row.action]||row.action}</span><strong>${escapeHTML(TABLES[row.table_name]||row.table_name)} ${escapeHTML(label(row))}</strong><span class="small">${escapeHTML(formatDateSeconds(row.changed_at))} · by ${escapeHTML(row.changed_by_name||'—')}</span></div>${diff.length?`<ul class="history-diff">${diff.map(([field,before,after])=>`<li><span>${escapeHTML(field)}</span>${before!==null?`<del>${escapeHTML(before)}</del> → `:''}<ins>${escapeHTML(after)}</ins></li>`).join('')}</ul>`:''}</li>`;}).join('')}</ol>`:`<p class="small">${rows.length?'No changes match the search.':'No changes recorded yet.'}</p>`;
  };
  tableSelect.onchange=()=>{limit=PAGE;load();};search.oninput=draw;more.onclick=()=>{limit+=PAGE;load();};
  await load();
}
