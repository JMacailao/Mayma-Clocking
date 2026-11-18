import { supabase, escapeHTML, number, formatDate } from '../../../assets/js/shared.js';
import { formatNfcUid } from '../../../assets/js/nfc.js';
import { birdPhotoUrls } from '../../admin/birds/page.js';
import { raceRows } from '../../../assets/js/race-export.js';
import { t } from '../../../assets/js/i18n.js';

// Members: their bonded birds with photo, ring, RFID status, races and best speed.
export async function render(view,identity){
  const memberId=identity.profile.member_id;
  if(!memberId)throw new Error('This account is missing its member record. Ask the club administrator.');
  const heading=`<div class="split-heading"><div><span class="eyebrow">${t('MY LOFT')}</span><h2>${t('My pigeons')}</h2><p>${t('Your birds bonded by the club, with their races and best speed.')}</p></div></div>`;
  const {data:birdRows,error:birdError}=await supabase.from('pigeons').select('*').eq('member_id',memberId).order('ring_number');
  if(birdError){view.innerHTML=`${heading}<div class="notice">${t('Your club has not set up bird bonding yet.')}</div>`;return;}
  const birds=birdRows||[];
  const [{data:entries},{data:clocks},{data:races},{data:members}]=await Promise.all([
    supabase.from('race_entries').select('*').eq('member_id',memberId),
    supabase.from('clock_events').select('*'),
    supabase.from('races').select('*'),
    supabase.from('members').select('id,member_no,full_name,loft_name').eq('id',memberId)
  ]);
  const photos=await birdPhotoUrls(birds.map(bird=>bird.photo_path));
  // Speed per entry, worked out the same way as the results.
  const speeds=new Map();
  (races||[]).forEach(race=>raceRows(race,entries||[],clocks||[],members||[],birds).forEach(row=>{if(row.entry.pigeon_id)speeds.set(row.entry.id,{race,row});}));
  const stats=bird=>{
    const mine=(entries||[]).filter(entry=>entry.pigeon_id===bird.id);
    const results=mine.map(entry=>speeds.get(entry.id)).filter(Boolean);
    const clocked=results.filter(item=>item.row.clock);
    const best=clocked.filter(item=>item.row.rank).sort((a,b)=>b.row.speed-a.row.speed)[0]||null;
    return {races:mine.length,clocked:clocked.length,best};
  };
  const active=birds.filter(bird=>bird.status==='active');
  view.innerHTML=`${heading}<section class="panel"><div class="panel-heading"><h3>${t('Bonded birds')}</h3><span class="count-pill">${active.length} ${t('active')}${birds.length>active.length?` · ${birds.length-active.length} ${t('retired')}`:''}</span></div>
  ${birds.length?`<div class="table-scroll"><table class="bird-table"><thead><tr><th>${t('Photo')}</th><th>${t('Ring')}</th><th>${t('Bird')}</th><th>${t('Colour')}</th><th>RFID</th><th>${t('Races')}</th><th>${t('Best speed')}</th></tr></thead><tbody>${birds.map(bird=>{const s=stats(bird),photo=photos.get(bird.photo_path);return `<tr class="bird-row ${bird.status==='retired'?'is-retired':''}">
    <td data-label="${t('Photo')}" class="bird-col-photo">${photo?`<button type="button" class="bird-thumb" data-view-photo="${bird.id}" aria-label="${t('View photo')}"><img src="${escapeHTML(photo)}" alt="" loading="lazy"></button>`:'<span class="bird-thumb is-empty">—</span>'}</td>
    <td data-label="${t('Ring')}"><strong>${escapeHTML(bird.ring_number)}</strong>${bird.status==='retired'?` <span class="tag closed">${t('Retired')}</span>`:''}</td>
    <td data-label="${t('Bird')}">${escapeHTML(bird.bird_name)}</td>
    <td data-label="${t('Colour')}" class="bird-col-colour">${escapeHTML(bird.color)}</td>
    <td data-label="RFID">${bird.bond_type==='ring'?`<span class="bird-ring-only">${t('Ring only · sticker')}</span>`:bird.nfc_tag?`<code>${escapeHTML(formatNfcUid(bird.nfc_tag))}</code>`:'—'}</td>
    <td data-label="${t('Races')}">${s.races} ${t('entered')} · ${s.clocked} ${t('clocked')}</td>
    <td data-label="${t('Best speed')}">${s.best?`<strong>${number(s.best.row.speed)} m/min</strong><br><span class="small">${escapeHTML(s.best.race.name)} · ${escapeHTML(formatDate(s.best.row.clock.received_at_utc))}</span>`:'—'}</td></tr>`;}).join('')}</tbody></table></div>`:`<p class="small">${t('No birds are bonded to you yet. The club bonds your birds on Bird bonding.')}</p>`}</section>`;
  const viewer=document.createElement('dialog');viewer.className='photo-viewer';view.append(viewer);
  viewer.addEventListener('click',event=>{if(event.target===viewer)viewer.close();});
  view.querySelectorAll('[data-view-photo]').forEach(button=>button.onclick=()=>{
    const bird=birds.find(item=>item.id===Number(button.dataset.viewPhoto)),photo=bird&&photos.get(bird.photo_path);if(!photo)return;
    viewer.innerHTML=`<img src="${escapeHTML(photo)}" alt="${escapeHTML(bird.bird_name)}"><div class="photo-viewer-caption"><div><strong>${escapeHTML(bird.ring_number)} · ${escapeHTML(bird.bird_name)}</strong><span>${escapeHTML(bird.color)} · ${escapeHTML(bird.loft_name)}</span></div><form method="dialog"><button class="button secondary">${t('Close')}</button></form></div>`;
    try{viewer.showModal();}catch{viewer.setAttribute('open','');}
  });
}
