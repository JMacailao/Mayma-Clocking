import { supabase, escapeHTML, formatDate, formatDateSeconds, tableRows, ringLabel, message, number, distanceKm, pageUrl as url } from '../../../assets/js/shared.js';
import { notificationsState, enableNotifications, notify } from '../../../assets/js/member-results-watch.js';
import { speedForecast, phClock, flightClock } from '../../../assets/js/forecast.js';
import { distanceMeters } from '../../admin/entries/entry-helpers.js';

export async function render(view,identity) {
 const memberId=identity.profile.member_id;if(!memberId)throw new Error('This account is missing its member record. Ask the club administrator.');
 let [{data:member,error:a},{data:races,error:b},{data:entries,error:c},{data:clocks,error:d}]=await Promise.all([supabase.from('members').select('*').eq('id',memberId).single(),supabase.from('races').select('*').in('status',['open','closed']).order('release_at_utc'),supabase.from('race_entries').select('*').eq('member_id',memberId),supabase.from('clock_events').select('id,race_entry_id,received_at_utc,verification')]);if(a||b||c||d)throw a||b||c||d;
 const ownClocks=clocks.filter(c=>entries.some(e=>e.id===c.race_entry_id));const allRaces=races;races=races.filter(r=>r.status==='open');const ownRaces=races.filter(r=>entries.some(e=>e.race_id===r.id));
 const reminders=memberReminders(ownRaces,entries,ownClocks);
 view.innerHTML=`<div class="welcome-row"><div><h2>Welcome, ${escapeHTML(member.full_name.split(' ')[0])}</h2><p>${escapeHTML(member.loft_name)} · Member ${escapeHTML(member.member_no)}</p></div><a class="button primary" href="${url('pages/member/clocking/index.html')}">Clock a pigeon →</a></div><div class="stats-grid three"><article class="stat-card"><div class="stat-label">Open race entries</div><strong>${entries.filter(e=>ownRaces.some(r=>r.id===e.race_id)).length}</strong><span class="stat-foot">Your pigeons</span></article><article class="stat-card"><div class="stat-label">Clocking receipts</div><strong>${ownClocks.length}</strong><span class="stat-foot">All recorded receipts</span></article><article class="stat-card"><div class="stat-label">Open schedules</div><strong>${ownRaces.length}</strong><span class="stat-foot">Available to you</span></article></div>${reminders.length?`<section class="panel member-reminders"><div class="panel-heading"><h3>Reminders</h3></div><ul>${reminders.map(item=>`<li class="is-${item.kind}"><span aria-hidden="true">${item.kind==='showup'?'!':'◷'}</span><span>${item.html}</span></li>`).join('')}</ul></section>`:''}<section class="panel"><div class="panel-heading"><div><h2>Open races</h2></div></div>${tableRows(ownRaces.map(r=>({...r,pigeons:entries.filter(e=>e.race_id===r.id).length})),[{key:'name',label:'Race'},{key:'release_location',label:'Release point'},{key:'release_at_utc',label:'Release · PH',render:r=>escapeHTML(formatDate(r.release_at_utc))},{key:'pigeons',label:'Your pigeons'}],'No open races are available for your registered pigeons.',false)}${raceCards(ownRaces,entries)}</section><section class="panel forecast-panel" data-forecast hidden></section>`;

 mountForecast(view.querySelector('[data-forecast]'),races,entries,member);

 // Loft reader: online or not, and taps it holds that still have to be sent.
 mountReaderStatus(view).catch(error=>console.warn('Reader status unavailable:',error));

 // Notifications: offer to turn them on, and remind about show-ups once a day.
 const box=view.querySelector('[data-notify-box]');const state=notificationsState();
 if(box&&state==='default'){box.hidden=false;box.innerHTML='<div><strong>Get notified on this phone</strong><span>A notification when your pigeon is clocked, and show-up reminders.</span></div><button class="button primary" type="button">Turn on notifications</button>';box.querySelector('button').onclick=async()=>{
  // Server push first (arrives even with the app closed); the in-page notice is the fallback.
  try{await (await import('../../../assets/js/push.js')).turnOn();box.hidden=true;message('Notifications are on for this device.','success');return;}catch(error){console.warn('Push notifications unavailable:',error);}
  const result=await enableNotifications();if(result==='granted'){box.hidden=true;message('Notifications are on for this device.','success');notify('AvilonX notifications are on','You will be notified when your pigeons are clocked.');}else message('Notifications were not allowed. You can allow them in the browser\'s site settings.','error');};}
 const showups=reminders.filter(item=>item.kind==='showup');
 if(showups.length&&state==='granted'){const key=`avilonx.showupReminder.${memberId}`,today=new Date().toDateString();let last=null;try{last=localStorage.getItem(key);}catch{/* storage unavailable */}if(last!==today){notify('Show up reminder',showups.map(item=>item.text).join(' '));try{localStorage.setItem(key,today);}catch{/* storage unavailable */}}}
}

// Reminders for the member: open races they are entered in, and clocked
// pigeons that still have to be shown up before the race closes.
function memberReminders(races,entries,clocks){
  const out=[];
  races.forEach(race=>{
    const mine=entries.filter(entry=>entry.race_id===race.id);
    const waiting=race.requires_show_up===false?[]:mine.filter(entry=>clocks.some(clock=>clock.race_entry_id===entry.id&&clock.verification==='provisional'));
    if(waiting.length){const rings=waiting.map(entry=>ringLabel(entry.pigeon_ring,entry.remarks)).join(', ');const text=`Bring ${rings} to the club for Show up before ${race.name} is closed${race.end_date?` (end date ${race.end_date})`:''}, or ${waiting.length===1?'it is':'they are'} disqualified.`;out.push({kind:'showup',text,html:`<strong>Show up:</strong> ${escapeHTML(text)}`});}
    const flying=mine.filter(entry=>!clocks.some(clock=>clock.race_entry_id===entry.id)).length;
    if(flying){const text=race.release_at_utc?`${race.name}: ${flying} of your pigeon${flying===1?'':'s'} not clocked yet. Released ${formatDate(race.release_at_utc)}.`:`${race.name} is open: ${flying} of your pigeon${flying===1?' is':'s are'} entered. The release time is not set yet.`;out.push({kind:'race',text,html:escapeHTML(text)});}
  });
  return out;
}

// Phones only (CSS swaps them for the table): one compact card per open race.
function raceCards(races,entries){
 if(!races.length)return '';
 return `<ul class="public-cards">${races.map(r=>{const n=entries.filter(e=>e.race_id===r.id).length;return `<li class="public-card"><div class="pc-head"><strong class="pc-loft">${escapeHTML(String(r.name||'Race').toUpperCase())}</strong><span class="pc-pill is-open">Open</span></div><div class="pc-line"><span>${escapeHTML(r.release_location||'—')}</span></div><div class="pc-line pc-mono"><span>${escapeHTML(formatDate(r.release_at_utc))}</span></div><div class="pc-line"><span class="pc-label">Your pigeons</span><strong>${n}</strong></div></li>`;}).join('')}</ul>`;
}

// Speed forecast for an open race: arrival time at the loft for 1400 down to
// 500 m/min. Distance from the member's entry, or from the loft and the release
// point when not entered yet. A race picker when more than one race is open.
function mountForecast(panel,openRaces,entries,member){
  if(!panel||!openRaces.length)return;
  const mine=race=>entries.find(entry=>entry.race_id===race.id&&Number(entry.distance_m)>0);
  const sorted=openRaces.slice().sort((a,b)=>Number(Boolean(mine(b)))-Number(Boolean(mine(a)))||String(b.release_at_utc||'').localeCompare(String(a.release_at_utc||'')));
  const distanceFor=race=>{const entry=mine(race);if(entry)return Number(entry.distance_m);const ok=[member.latitude,member.longitude,race.release_latitude,race.release_longitude].every(v=>v!==null&&v!==''&&Number.isFinite(Number(v)));return ok?distanceMeters(Number(race.release_latitude),Number(race.release_longitude),Number(member.latitude),Number(member.longitude)):null;};
  // Compact: one summary line, then speed, arrival and flight time in one table.
  const picker=sorted.length>1?`<select class="forecast-race" data-forecast-race aria-label="Race">${sorted.map(race=>`<option value="${race.id}">${escapeHTML(race.name)}</option>`).join('')}</select>`:'';
  panel.hidden=false;
  panel.innerHTML=`<div class="forecast-head"><h2>Speed forecast <span class="forecast-approx">approx.</span></h2>${picker}</div><div data-forecast-body></div>`;
  const draw=()=>{
    const race=sorted.find(item=>String(item.id)===String(panel.querySelector('[data-forecast-race]')?.value??sorted[0].id))||sorted[0];
    const distance=distanceFor(race),rows=speedForecast(race.release_at_utc,distance);
    const summary=[sorted.length>1?'':`<strong>${escapeHTML(race.name)}</strong>`,race.release_at_utc?`Released ${escapeHTML(formatDateSeconds(race.release_at_utc))}`:'Release not set yet',escapeHTML(race.release_location||''),distance?`${escapeHTML(distanceKm(distance))}${mine(race)?'':' (your loft, not entered yet)'}`:''].filter(Boolean).join(' · ');
    panel.querySelector('[data-forecast-body]').innerHTML=`<p class="forecast-summary">${summary}</p>${rows.length?`<table class="forecast-table"><thead><tr><th scope="col">Speed · m/min</th><th scope="col">Arrival</th><th scope="col">Flight</th></tr></thead><tbody>${rows.map(row=>`<tr><th scope="row">${escapeHTML(number(row.speed))}</th><td><strong>${phClock(row.arrivalMs)}</strong></td><td>${flightClock(row.flightSeconds)}</td></tr>`).join('')}</tbody></table>`:`<p class="small forecast-empty">${race.release_at_utc?'Your loft distance is not available yet. Ask your club to check your loft coordinates.':'The forecast appears once the club sets the official release time.'}</p>`}`;
  };
  panel.querySelector('[data-forecast-race]')?.addEventListener('change',draw);
  draw();
}

async function mountReaderStatus(view){
  const {data,error}=await supabase.rpc('member_reader_status');
  if(error||!data?.length)return;
  const panel=document.createElement('section');panel.className='panel reader-status';
  const ago=value=>{if(!value)return 'never';const minutes=Math.round((Date.now()-new Date(value))/60000);return minutes<1?'just now':minutes<60?`${minutes} min ago`:minutes<1440?`${Math.round(minutes/60)} h ago`:formatDate(value);};
  panel.innerHTML=`<div class="panel-heading"><h3>Your loft reader${data.length>1?'s':''}</h3></div><ul class="reader-status-list">${data.map(reader=>`<li class="${reader.is_online?'is-online':'is-offline'}">
    <span class="reader-dot" role="img" aria-label="${reader.is_online?'Online':'Offline'}" title="${reader.is_online?'Online':'Offline'}"></span>
    <div><p class="small reader-last">${data.length>1?`<strong>${escapeHTML(reader.name)}</strong> · `:''}Last contact ${escapeHTML(ago(reader.last_heartbeat_at||reader.last_seen_at))}</p>
    ${reader.pending_taps>0?`<p class="reader-waiting"><strong>${reader.pending_taps} tap${reader.pending_taps===1?'':'s'} waiting to send.</strong> ${reader.is_online?'Sending now.':'They are saved on the reader and are sent with their real tap time when it is back online, but only until the race is closed.'}</p>`:''}</div></li>`).join('')}</ul>`;
  const after=view.querySelector('.stats-grid');
  if(after)after.after(panel);else view.prepend(panel);
}
