import { supabase, escapeHTML, formatDate, stateTag, tableRows, ringLabel, formatDateSeconds } from '../../../assets/js/shared.js';
import { clockVideos, addClockVideo, playClockVideo } from '../../../assets/js/clock-video.js';

export async function render(view,identity) {
 const memberId=identity.profile.member_id;if(!memberId)throw new Error('This account is missing its member record.');
 const [{data:entries,error:a},{data:clocks,error:b},{data:races,error:c}]=await Promise.all([supabase.from('race_entries').select('*').eq('member_id',memberId),supabase.from('clock_events').select('*').order('received_at_utc',{ascending:false}).limit(500),supabase.from('races').select('id,name')]);if(a||b||c)throw a||b||c;
 const ids=new Set(entries.map(e=>e.id));const history=clocks.filter(c=>ids.has(c.race_entry_id)).map(c=>({...c,entry:entries.find(e=>e.id===c.race_entry_id),race:races.find(r=>r.id===entries.find(e=>e.id===c.race_entry_id)?.race_id)}));
 const videos=await clockVideos(history.map(c=>c.id));
 view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">YOUR RECEIPTS</span><h2>Clocking history</h2><p>Recent server-received clockings for your pigeons.</p></div></div><section class="panel">${tableRows(history,[{key:'received_at_utc',label:'Received · PH',render:r=>escapeHTML(formatDateSeconds(r.received_at_utc))},{key:'race',label:'Race',render:r=>escapeHTML(r.race?.name||'—')},{key:'entry',label:'Ring',render:r=>escapeHTML(r.entry?ringLabel(r.entry.pigeon_ring,r.entry.remarks):'—')},{key:'source',label:'Clocked with',render:r=>escapeHTML(r.source==='barcode'?'Sticker':r.source==='admin_manual'?'Club':r.time_source==='reader'?'Loft reader':'NFC tag')},{key:'verification',label:'Status',render:r=>stateTag(r.verification)},{key:'video',label:'Video',render:r=>videoButtons(r,videos)}],'No receipts have been recorded yet.',false)}${receiptCards(history,videos)}</section>`;
 // Short video of a clocking: add one (camera or library), play it, or replace it.
 const target=clockId=>({clockId,clubId:identity.profile.club_id,memberId});
 view.querySelectorAll('[data-add-video]').forEach(button=>button.onclick=async()=>{if(await addClockVideo(button,target(Number(button.dataset.addVideo))))await render(view,identity);});
 view.querySelectorAll('[data-play-video]').forEach(button=>button.onclick=()=>{const r=history.find(item=>item.id===Number(button.dataset.playVideo));playClockVideo(videos.get(r.id),r.entry?ringLabel(r.entry.pigeon_ring,r.entry.remarks):'Clocking video');});
}

const how=r=>r.source==='barcode'?'Sticker':r.source==='admin_manual'?'Club':r.time_source==='reader'?'Loft reader':'NFC tag';
const PILLS={verified:['is-ok','✓ Verified'],rejected:['is-dq','Rejected']};
// Phones only (CSS swaps them for the table): one compact card per receipt.
function receiptCards(history,videos){
 if(!history.length)return '';
 return `<ul class="public-cards">${history.map(r=>{const [cls,text]=PILLS[r.verification]||['','Provisional'];return `<li class="public-card${r.verification==='rejected'?' is-dq':''}"><div class="pc-head"><strong class="pc-loft">${escapeHTML(r.entry?ringLabel(r.entry.pigeon_ring,r.entry.remarks):'—')}</strong></div><div class="pc-line pc-mono"><span>${escapeHTML(formatDateSeconds(r.received_at_utc))}</span></div><div class="pc-line"><span>${escapeHTML(r.race?.name||'—')}</span></div><div class="pc-line"><span class="pc-label">Clocked with</span><span>${escapeHTML(how(r))}</span><span class="pc-pill ${cls}">${text}</span></div><div class="pc-line">${videoButtons(r,videos)}</div></li>`;}).join('')}</ul>`;
}
// Add video, or play it and replace it. Buttons are wired up in render().
function videoButtons(r,videos){
 const video=videos.get(r.id);
 return video?`<span class="video-actions"><button class="text-button" type="button" data-play-video="${r.id}">▶ Play video</button><button class="text-button" type="button" data-add-video="${r.id}">Replace</button></span>`:`<button class="text-button" type="button" data-add-video="${r.id}">＋ Add video</button>`;
}
