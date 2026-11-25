import { supabase, escapeHTML, formatDate, formatDateSeconds, number, ringLabel, stateTag, message, pageUrl } from '../../../assets/js/shared.js';
import { raceRows, exportRaceToExcel, flightText, clockedWith } from '../../../assets/js/race-export.js';

const RACE_KEY='avilonx.raceday.race';
const REFRESH_MS=15000;
const asUtc=value=>value?new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(value))?String(value).replace(' ','T'):`${String(value).replace(' ','T')}Z`):null;
const SHOW={verified:['Verified','is-verified'],waiting:['Waiting for show up','is-waiting'],disqualified:['Disqualified','is-disqualified'],not_needed:['No show up needed','is-not_needed'],rejected:['Rejected','is-rejected'],none:['Not clocked','is-none']};
// End of the race's end date in Philippine time (UTC+8).
const raceEnd=race=>race?.end_date?new Date(`${race.end_date}T23:59:59+08:00`):null;
const span=ms=>{if(!(ms>0))return '00:00:00';const s=Math.floor(ms/1000),d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);return `${d?`${d}d `:''}${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;};

// Race day: everything about one race on one screen, updating by itself, with
// a big-screen leaderboard for the clubhouse TV and a one-click export.
export async function render(view,identity,setPageCleanup=()=>{}){
  let state=await load();
  const pick=()=>{let saved=null;try{saved=Number(localStorage.getItem(RACE_KEY));}catch{/* storage unavailable */}return state.races.find(race=>race.id===saved)?.id||state.races.find(race=>race.status==='open')?.id||state.races[0]?.id||null;};
  let raceId=pick();

  view.innerHTML=`<div class="split-heading raceday-head"><div><span class="eyebrow">RACE DAY</span><h2>Race day</h2><p>Arrivals, readers and show-ups for one race, updating by itself.</p></div>
    <div class="raceday-actions"><label class="field"><span>Race</span><select data-race>${state.races.map(race=>`<option value="${race.id}" ${race.id===raceId?'selected':''}>${escapeHTML(race.name)}${race.is_practice?' (practice)':''}</option>`).join('')}</select></label>
    <button class="button secondary" type="button" data-tv>Big screen</button><button class="button secondary" type="button" data-export>Export Excel</button><button class="button secondary" type="button" data-print>Print / PDF</button></div></div>
  <div data-alerts></div>
  <div class="raceday-stats" data-stats></div>
  <div class="raceday-grid"><section class="panel raceday-arrivals"><div class="panel-heading"><h3>Live arrivals</h3><span class="count-pill" data-updated></span></div><div data-arrivals></div></section>
  <aside class="raceday-side"><section class="panel"><div class="panel-heading"><h3>Loft readers</h3></div><div data-readers></div></section>
  <section class="panel"><div class="panel-heading"><h3>Show up</h3><a class="quiet-link" href="${pageUrl('pages/admin/showup/index.html')}">Open Show up ↗</a></div><div data-showup></div></section></aside></div>
  <div class="raceday-tv" data-tv-board hidden></div>`;

  const select=view.querySelector('[data-race]'),tvBoard=view.querySelector('[data-tv-board]');
  if(!state.races.length){view.querySelector('[data-stats]').innerHTML='<div class="notice">Create a race on Race schedules first.</div>';return;}
  const race=()=>state.races.find(item=>item.id===raceId);
  const rows=()=>raceRows(race(),state.entries,state.clocks,state.members,state.birds);

  function draw(){
    const r=race();if(!r)return;
    const list=rows(),clocked=list.filter(row=>row.clock),waiting=list.filter(row=>row.show==='waiting'),released=asUtc(r.release_at_utc),end=raceEnd(r),now=Date.now();
    const timing=r.status==='closed'?['Race closed','Results are final once verified.']:!released?['Release not set','Set it on Race schedules.']:now<released?[`Release in ${span(released-now)}`,formatDateSeconds(r.release_at_utc)]:[`Flying ${span(now-released)}`,`Released ${formatDateSeconds(r.release_at_utc)}`];
    view.querySelector('[data-stats]').innerHTML=`
      <article class="stat-card"><div class="stat-label">Status</div><strong>${stateTag(r.status)}${r.is_practice?' <span class="tag practice">Practice</span>':''}</strong><span class="stat-foot">${escapeHTML(r.release_location||'—')}</span></article>
      <article class="stat-card"><div class="stat-label">Time</div><strong class="raceday-clock" data-live-clock>${escapeHTML(timing[0])}</strong><span class="stat-foot">${escapeHTML(timing[1])}</span></article>
      <article class="stat-card"><div class="stat-label">Clocked</div><strong>${clocked.length} / ${list.length}</strong><span class="stat-foot">${list.length-clocked.length} still flying</span></article>
      <article class="stat-card"><div class="stat-label">Closes</div><strong data-close-clock>${r.status==='closed'?'Closed':end?(now<end?span(end-now):'End date passed'):'—'}</strong><span class="stat-foot">${end?`End date ${escapeHTML(formatDate(end))}`:'No end date'}</span></article>`;

    view.querySelector('[data-arrivals]').innerHTML=clocked.length?`<div class="table-scroll"><table><thead><tr><th>#</th><th>Ring</th><th>Member</th><th>Arrival</th><th>Flight</th><th>Speed · m/min</th><th>Clocked with</th><th>Show up</th></tr></thead><tbody>${clocked.map(row=>`<tr class="${row.show==='disqualified'||row.show==='rejected'?'is-out':''}"><td data-label="#"><strong>${row.rank?row.rank:'—'}</strong></td><td data-label="Ring"><strong>${escapeHTML(ringLabel(row.entry.pigeon_ring,row.entry.remarks))}</strong>${row.bird?`<br><span class="small">${escapeHTML(row.bird.bird_name)}</span>`:''}</td><td data-label="Member">${escapeHTML(row.member?.full_name||'—')}</td><td data-label="Arrival" title="${escapeHTML(formatDateSeconds(row.clock.received_at_utc))}">${escapeHTML(formatDateSeconds(row.clock.received_at_utc).split(', ').pop())}</td><td data-label="Flight">${escapeHTML(flightText(row.seconds)||'—')}</td><td data-label="Speed">${row.speed?number(row.speed):'—'}</td><td data-label="Clocked with">${escapeHTML(clockedWith(row.clock))}</td><td data-label="Show up"><span class="showup-status ${SHOW[row.show][1]}">${SHOW[row.show][0]}</span></td></tr>`).join('')}</tbody></table></div>`:`<p class="small">${list.length?'No arrivals yet. They appear here as soon as pigeons are clocked.':'No pigeons entered in this race yet.'}</p>`;

    // Members with pigeons still flying whose loft reader is not online.
    const flyingMembers=new Set(list.filter(row=>!row.clock).map(row=>row.entry.member_id));
    const memberReaders=state.readers.filter(reader=>reader.member_id);
    const offline=r.status==='open'?memberReaders.filter(reader=>flyingMembers.has(reader.member_id)&&!reader.is_online):[];
    view.querySelector('[data-alerts]').innerHTML=[
      offline.length?`<div class="notice error raceday-alert"><strong>${offline.length} loft reader${offline.length===1?' is':'s are'} offline</strong> while ${offline.length===1?'its member has':'their members have'} pigeons still flying: ${offline.map(reader=>`${escapeHTML(reader.name)} (${escapeHTML(reader.member_name||'member')})`).join(', ')}. Taps are saved on the reader and sent when it is back online, but only until the race is closed.</div>`:'',
      r.status==='open'&&waiting.length&&end&&end-now<3*3600*1000&&end>now?`<div class="notice raceday-alert"><strong>${waiting.length} clocked pigeon${waiting.length===1?'':'s'} not shown up</strong> and the race closes in ${span(end-now)}. Pigeons not shown up are disqualified when the race is closed.</div>`:''
    ].join('');

    view.querySelector('[data-readers]').innerHTML=memberReaders.length?`<ul class="raceday-readers">${memberReaders.map(reader=>{const flying=flyingMembers.has(reader.member_id);return `<li class="${reader.is_online?'is-online':'is-offline'}"><span class="reader-dot" aria-hidden="true"></span><span><strong>${escapeHTML(reader.name)}</strong><span class="small">${escapeHTML(reader.member_name||'')}${flying?' · pigeons flying':''}</span></span><span class="small">${reader.is_online?'Online':reader.last_heartbeat_at||reader.last_seen_at?`Last seen ${escapeHTML(formatDate(reader.last_heartbeat_at||reader.last_seen_at))}`:'Never connected'}${Number(reader.pending_taps)>0?` · ${reader.pending_taps} waiting`:''}</span></li>`;}).join('')}</ul>`:'<p class="small">No members\' loft readers registered.</p>';

    const verified=list.filter(row=>row.show==='verified').length,dq=list.filter(row=>row.show==='disqualified').length;
    view.querySelector('[data-showup]').innerHTML=r.requires_show_up===false?'<p class="small">No show up needed for this race.</p>':`<div class="raceday-showup"><div><strong>${verified}</strong><span>Verified</span></div><div><strong>${waiting.length}</strong><span>Waiting</span></div><div><strong>${dq}</strong><span>Disqualified</span></div></div>${waiting.length?`<ul class="raceday-waiting">${waiting.slice(0,8).map(row=>`<li><strong>${escapeHTML(ringLabel(row.entry.pigeon_ring,row.entry.remarks))}</strong> · ${escapeHTML(row.member?.full_name||'')}</li>`).join('')}${waiting.length>8?`<li class="small">and ${waiting.length-8} more</li>`:''}</ul>`:''}`;
    view.querySelector('[data-updated]').textContent=`Updated ${new Date().toLocaleTimeString('en-PH',{timeZone:'Asia/Manila'})}`;
    if(!tvBoard.hidden)drawTv();
  }

  function drawTv(){
    const r=race(),list=rows().filter(row=>row.rank).slice(0,15),released=asUtc(r.release_at_utc),now=Date.now();
    tvBoard.innerHTML=`<div class="tv-head"><div><span>AvilonX · Live results</span><h2>${escapeHTML(r.name)}${r.is_practice?' · Practice':''}</h2><p>${escapeHTML(r.release_location||'')}${released?` · Released ${escapeHTML(formatDateSeconds(r.release_at_utc))}`:''}</p></div><div class="tv-clock" data-live-clock>${released&&now>released&&r.status!=='closed'?span(now-released):escapeHTML(r.status==='closed'?'Closed':'—')}</div><button type="button" class="tv-exit" data-tv-exit>Exit big screen</button></div>
      ${list.length?`<ol class="tv-list">${list.map(row=>`<li><span class="tv-rank">${row.rank}</span><span class="tv-ring">${escapeHTML(ringLabel(row.entry.pigeon_ring,row.entry.remarks))}<small>${escapeHTML(row.member?.full_name||'')}${row.member?.loft_name?` · ${escapeHTML(row.member.loft_name)}`:''}</small></span><span class="tv-time">${escapeHTML(formatDateSeconds(row.clock.received_at_utc).split(', ').pop())}</span><span class="tv-speed">${number(row.speed)}<small>m/min</small></span></li>`).join('')}</ol>`:'<p class="tv-empty">Waiting for the first arrival…</p>'}
      <p class="tv-foot">Provisional results · updating live</p>`;
    tvBoard.querySelector('[data-tv-exit]').onclick=exitTv;
  }
  const exitTv=()=>{tvBoard.hidden=true;document.body.classList.remove('raceday-tv-on');if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});};
  view.querySelector('[data-tv]').onclick=()=>{tvBoard.hidden=false;document.body.classList.add('raceday-tv-on');drawTv();tvBoard.requestFullscreen?.().catch(()=>{});};
  const onFullscreen=()=>{if(!document.fullscreenElement&&!tvBoard.hidden)exitTv();};
  document.addEventListener('fullscreenchange',onFullscreen);

  select.onchange=()=>{raceId=Number(select.value);try{localStorage.setItem(RACE_KEY,String(raceId));}catch{/* storage unavailable */}draw();};
  view.querySelector('[data-export]').onclick=async()=>{try{await exportRaceToExcel(race(),rows());message('Excel file downloaded.','success');}catch(error){message(error.message,'error');}};
  view.querySelector('[data-print]').onclick=()=>window.print();

  // Refresh: live when Supabase Realtime is on (race-day.sql), and every 15 seconds anyway.
  let busy=false;
  const refresh=async()=>{if(busy||document.hidden)return;busy=true;try{state=await load();draw();}catch(error){console.warn('Race day refresh failed:',error);}finally{busy=false;}};
  const timer=setInterval(refresh,REFRESH_MS);
  const ticker=setInterval(()=>{const r=race();if(!r)return;const released=asUtc(r.release_at_utc),end=raceEnd(r),now=Date.now();view.querySelectorAll('[data-live-clock]').forEach(node=>{if(r.status!=='closed'&&released&&now>released)node.textContent=node.closest('.tv-head')?span(now-released):`Flying ${span(now-released)}`;});const close=view.querySelector('[data-close-clock]');if(close&&r.status!=='closed'&&end&&now<end)close.textContent=span(end-now);},1000);
  let channel=null;
  try{channel=supabase.channel?.(`raceday-${Date.now()}`).on('postgres_changes',{event:'*',schema:'public',table:'clock_events'},()=>refresh()).subscribe();}catch{/* realtime unavailable */}
  setPageCleanup(()=>{clearInterval(timer);clearInterval(ticker);document.removeEventListener('fullscreenchange',onFullscreen);document.body.classList.remove('raceday-tv-on');try{channel&&supabase.removeChannel?.(channel);}catch{/* ignore */}});
  draw();
}

async function load(){
  const [{data:races,error:a},{data:entries,error:b},{data:clocks,error:c},{data:members,error:d}]=await Promise.all([
    supabase.from('races').select('*').order('id',{ascending:false}),
    supabase.from('race_entries').select('*'),
    supabase.from('clock_events').select('*'),
    supabase.from('members').select('id,member_no,full_name,loft_name')
  ]);
  if(a||b||c||d)throw a||b||c||d;
  let birds=[],readers=[];
  try{const {data,error}=await supabase.from('pigeons').select('id,bird_name,color');if(!error)birds=data||[];}catch{/* bird-bonding.sql not run */}
  try{const {data,error}=await supabase.rpc('admin_list_rfid_devices');if(!error)readers=data||[];}catch{/* rfid-devices.sql not run */}
  return {races:races||[],entries:entries||[],clocks:clocks||[],members:members||[],birds,readers};
}
