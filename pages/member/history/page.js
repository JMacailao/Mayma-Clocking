import { supabase, escapeHTML, formatDate, stateTag, tableRows } from '../../../assets/js/shared.js';

export async function render(view,identity) {
 const memberId=identity.profile.member_id;if(!memberId)throw new Error('This account is missing its member record.');
 const [{data:entries,error:a},{data:clocks,error:b},{data:races,error:c}]=await Promise.all([supabase.from('race_entries').select('id,race_id,pigeon_ring').eq('member_id',memberId),supabase.from('clock_events').select('*').order('received_at_utc',{ascending:false}).limit(500),supabase.from('races').select('id,name')]);if(a||b||c)throw a||b||c;
 const ids=new Set(entries.map(e=>e.id));const history=clocks.filter(c=>ids.has(c.race_entry_id)).map(c=>({...c,entry:entries.find(e=>e.id===c.race_entry_id),race:races.find(r=>r.id===entries.find(e=>e.id===c.race_entry_id)?.race_id)}));
 view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">YOUR RECEIPTS</span><h2>Clocking history</h2><p>Recent server-received clockings for your pigeons.</p></div></div><section class="panel">${tableRows(history,[{key:'received_at_utc',label:'Received · PH',render:r=>escapeHTML(formatDate(r.received_at_utc))},{key:'race',label:'Race',render:r=>escapeHTML(r.race?.name||'—')},{key:'entry',label:'Ring',render:r=>escapeHTML(r.entry?.pigeon_ring||'—')},{key:'source',label:'Source',render:()=> 'Barcode'},{key:'verification',label:'Status',render:r=>stateTag(r.verification)}],'No receipts have been recorded yet.',false)}</section>`;
}
