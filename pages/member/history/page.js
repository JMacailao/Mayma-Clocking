import { supabase, escapeHTML, formatDate, stateTag, tableRows, ringLabel, formatDateSeconds } from '../../../assets/js/shared.js';

export async function render(view,identity) {
 const memberId=identity.profile.member_id;if(!memberId)throw new Error('This account is missing its member record.');
 const [{data:entries,error:a},{data:clocks,error:b},{data:races,error:c}]=await Promise.all([supabase.from('race_entries').select('*').eq('member_id',memberId),supabase.from('clock_events').select('*').order('received_at_utc',{ascending:false}).limit(500),supabase.from('races').select('id,name')]);if(a||b||c)throw a||b||c;
 const ids=new Set(entries.map(e=>e.id));const history=clocks.filter(c=>ids.has(c.race_entry_id)).map(c=>({...c,entry:entries.find(e=>e.id===c.race_entry_id),race:races.find(r=>r.id===entries.find(e=>e.id===c.race_entry_id)?.race_id)}));
 view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">YOUR RECEIPTS</span><h2>Clocking history</h2><p>Recent server-received clockings for your pigeons.</p></div></div><section class="panel">${tableRows(history,[{key:'received_at_utc',label:'Received · PH',render:r=>escapeHTML(formatDateSeconds(r.received_at_utc))},{key:'race',label:'Race',render:r=>escapeHTML(r.race?.name||'—')},{key:'entry',label:'Ring',render:r=>escapeHTML(r.entry?ringLabel(r.entry.pigeon_ring,r.entry.remarks):'—')},{key:'source',label:'Clocked with',render:r=>escapeHTML(r.source==='barcode'?'Sticker':r.source==='admin_manual'?'Club':r.time_source==='reader'?'Loft reader':'NFC tag')},{key:'verification',label:'Status',render:r=>stateTag(r.verification)}],'No receipts have been recorded yet.',false)}${receiptCards(history)}</section>`;
}

const how=r=>r.source==='barcode'?'Sticker':r.source==='admin_manual'?'Club':r.time_source==='reader'?'Loft reader':'NFC tag';
const PILLS={verified:['is-ok','✓ Verified'],rejected:['is-dq','Rejected']};
// Phones only (CSS swaps them for the table): one compact card per receipt.
function receiptCards(history){
 if(!history.length)return '';
 return `<ul class="public-cards">${history.map(r=>{const [cls,text]=PILLS[r.verification]||['','Provisional'];return `<li class="public-card${r.verification==='rejected'?' is-dq':''}"><div class="pc-head"><strong class="pc-loft">${escapeHTML(r.entry?ringLabel(r.entry.pigeon_ring,r.entry.remarks):'—')}</strong></div><div class="pc-line pc-mono"><span>${escapeHTML(formatDateSeconds(r.received_at_utc))}</span></div><div class="pc-line"><span>${escapeHTML(r.race?.name||'—')}</span></div><div class="pc-line"><span class="pc-label">Clocked with</span><span>${escapeHTML(how(r))}</span><span class="pc-pill ${cls}">${text}</span></div></li>`;}).join('')}</ul>`;
}
