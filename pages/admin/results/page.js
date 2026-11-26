import { mountSeason } from '../../../assets/js/season.js';
import { supabase, escapeHTML, formatDate, stateTag, number, tableRows, ringLabel, distanceKm, formatDateSeconds, raceSummaryHtml } from '../../../assets/js/shared.js';
import { showUpState } from '../showup/page.js';
import { raceRows, exportRaceToExcel } from '../../../assets/js/race-export.js';
import { message } from '../../../assets/js/shared.js';

export async function render(view) {
 const season=document.createElement('section');season.className='panel';season.dataset.season='';season.hidden=true;
 const [{data:races,error:a},{data:entries,error:b},{data:clocks,error:c},{data:members,error:d}]=await Promise.all([supabase.from('races').select('*').order('id',{ascending:false}),supabase.from('race_entries').select('*'),supabase.from('clock_events').select('*'),supabase.from('members').select('id,member_no,full_name,loft_name')]);if(a||b||c||d)throw a||b||c||d;
 const rows=entries.map(e=>{const clock=clocks.find(x=>x.race_entry_id===e.id),race=races.find(x=>x.id===e.race_id),member=members.find(x=>x.id===e.member_id);const seconds=clock&&race?(new Date(clock.received_at_utc+'Z')-new Date(race.release_at_utc+'Z'))/1000:null;return {...e,clock,race,member,seconds,velocity:seconds>0?e.distance_m*60/seconds:null};});
 rows.forEach(r=>{r.show=r.clock?showUpState(r.clock,r,r.race):null;});const ranked=rows.filter(r=>r.velocity!==null&&r.clock.verification!=='rejected'&&r.show?.key!=='disqualified').sort((x,y)=>y.velocity-x.velocity);ranked.forEach((r,i)=>r.rank=i+1);
 view.innerHTML=`<div class="split-heading"><div><h2>Race results</h2></div><div class="results-actions"><label class="field race-filter"><span>Schedule</span><select id="race-filter"><option value="all">All races</option>${races.map(r=>`<option value="${r.id}">${escapeHTML(r.name)}${r.is_practice?' (practice)':''}</option>`).join('')}</select></label><button class="button secondary" type="button" data-export-race>Export Excel</button><button class="button secondary" type="button" data-print-results>Print / PDF</button></div></div><section class="panel"><div id="results-table"></div></section>`;view.append(season);mountSeason(season).catch(error=>console.warn('Season standings unavailable:',error));
 const filter=view.querySelector('#race-filter');function draw(){const list=rows.filter(r=>filter.value==='all'||String(r.race_id)===filter.value).sort((x,y)=>(x.rank||Infinity)-(y.rank||Infinity));view.querySelector('#results-table').innerHTML=raceHeaders(list)+tableRows(list,[{key:'rank',label:'Rank',render:r=>r.rank?`#${r.rank}`:'—'},{key:'member',label:'Member',render:r=>`${escapeHTML(r.member?.member_no||'—')} · ${escapeHTML(r.member?.full_name||'')}`},{key:'race',label:'Race',render:r=>escapeHTML(r.race?.name||'—')},{key:'pigeon_ring',label:'Ring',render:r=>escapeHTML(ringLabel(r.pigeon_ring,r.remarks))},{key:'distance_m',label:'Distance',render:r=>distanceKm(r.distance_m)},{key:'clock',label:'Arrival · PH',render:r=>escapeHTML(r.clock?formatDateSeconds(r.clock.received_at_utc):'Not clocked')},{key:'velocity',label:'Velocity · m/min',render:r=>r.velocity?number(r.velocity):'—'},{key:'verification',label:'Review',render:r=>r.show?`<span class="showup-status is-${r.show.key}">${escapeHTML(r.show.label)}</span>`:stateTag('pending')}],'No race entries to show.',false)+resultCards(list);}filter.onchange=draw;draw();
 view.querySelector('[data-print-results]').onclick=()=>window.print();
 view.querySelector('[data-export-race]').onclick=async()=>{const race=races.find(r=>String(r.id)===filter.value);if(!race){message('Choose one race under Schedule to export it.','error');filter.focus();return;}let birds=[];try{const {data}=await supabase.from('pigeons').select('id,bird_name,color');birds=data||[];}catch{/* not set up */}try{await exportRaceToExcel(race,raceRows(race,entries,clocks,members,birds));message('Excel file downloaded.','success');}catch(error){message(error.message,'error');}};
}

// Phones only (CSS swaps them for the table): one compact card per entry.
const PILLS={verified:['is-ok','✓ Verified'],waiting:['','Waiting'],disqualified:['is-dq','DQ'],rejected:['is-dq','Rejected'],not_needed:['','No show up']};
const flight=seconds=>{if(!(seconds>0))return '';const t=Math.round(seconds);return [Math.floor(t/3600),Math.floor(t%3600/60),t%60].map(n=>String(n).padStart(2,'0')).join(':');};
function resultCards(list){
 if(!list.length)return '';
 return `<ul class="public-cards">${list.map(r=>{const [cls,text]=PILLS[r.show?.key]||['','Not clocked'],out=!r.rank&&r.show&&['disqualified','rejected'].includes(r.show.key);return `<li class="public-card${out?' is-dq':''}"><div class="pc-head"><span class="pc-rank" aria-label="Rank">${r.rank?r.rank:'–'}</span><strong class="pc-loft">${escapeHTML(String(r.member?.full_name||r.member?.member_no||'—').toUpperCase())}</strong></div><div class="pc-line pc-mono"><span>${escapeHTML(ringLabel(r.pigeon_ring,r.remarks))}</span><span>${escapeHTML(r.clock?formatDateSeconds(r.clock.received_at_utc):'Not clocked')}</span></div><div class="pc-line"><span>${escapeHTML(r.race?.name||'—')}</span><span>${escapeHTML(distanceKm(r.distance_m))}</span>${flight(r.seconds)?`<span>${flight(r.seconds)}</span>`:''}</div><div class="pc-line"><span class="pc-label">Speed</span><strong class="pc-mono">${r.velocity?`${escapeHTML(number(r.velocity))} m/min`:'—'}</strong><span class="pc-pill ${cls}" title="${escapeHTML(r.show?.label||'Not clocked')}">${text}</span></div><div class="pc-line"><span class="pc-label">Member</span><span>${escapeHTML(r.member?.member_no||'—')}</span>${r.member?.loft_name?`<span>${escapeHTML(r.member.loft_name)}</span>`:''}</div></li>`;}).join('')}</ul>`;
}

// One header per race shown: release point, coordinates, release time and
// birds clocked of entered (clocks the club rejected are not counted).
function raceHeaders(list){
 const byRace=new Map();
 list.forEach(r=>{if(!r.race)return;const s=byRace.get(r.race.id)||{race:r.race,entered:0,clocked:0};s.entered++;if(r.clock&&r.clock.verification!=='rejected')s.clocked++;byRace.set(r.race.id,s);});
 if(!byRace.size)return '';
 return `<div class="race-summaries">${[...byRace.values()].map(({race,entered,clocked})=>raceSummaryHtml({name:race.name,location:race.release_location,latitude:race.release_latitude,longitude:race.release_longitude,release_at_utc:race.release_at_utc,status:race.status,entered,clocked})).join('')}</div>`;
}
