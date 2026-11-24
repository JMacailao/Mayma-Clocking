import { supabase, escapeHTML, formatDate, tableRows, ringLabel, message, pageUrl as url } from '../../../assets/js/shared.js';
import { notificationsState, enableNotifications, notify } from '../../../assets/js/member-results-watch.js';

export async function render(view,identity) {
 const memberId=identity.profile.member_id;if(!memberId)throw new Error('This account is missing its member record. Ask the club administrator.');
 let [{data:member,error:a},{data:races,error:b},{data:entries,error:c},{data:clocks,error:d}]=await Promise.all([supabase.from('members').select('*').eq('id',memberId).single(),supabase.from('races').select('*').in('status',['open','closed']).order('release_at_utc'),supabase.from('race_entries').select('*').eq('member_id',memberId),supabase.from('clock_events').select('id,race_entry_id,received_at_utc,verification')]);if(a||b||c||d)throw a||b||c||d;
 const ownClocks=clocks.filter(c=>entries.some(e=>e.id===c.race_entry_id));const allRaces=races;races=races.filter(r=>r.status==='open');const ownRaces=races.filter(r=>entries.some(e=>e.race_id===r.id));
 const reminders=memberReminders(ownRaces,entries,ownClocks);
 view.innerHTML=`<div class="welcome-row"><div><span class="eyebrow">MEMBER DASHBOARD</span><h2>Welcome, ${escapeHTML(member.full_name.split(' ')[0])}</h2><p>${escapeHTML(member.loft_name)} · Member ${escapeHTML(member.member_no)}</p></div><a class="button primary" href="${url('pages/member/clocking/index.html')}">Clock a pigeon →</a></div><div class="stats-grid three"><article class="stat-card"><div class="stat-label">Open race entries</div><strong>${entries.filter(e=>ownRaces.some(r=>r.id===e.race_id)).length}</strong><span class="stat-foot">Your pigeons</span></article><article class="stat-card"><div class="stat-label">Clocking receipts</div><strong>${ownClocks.length}</strong><span class="stat-foot">All recorded receipts</span></article><article class="stat-card"><div class="stat-label">Open schedules</div><strong>${ownRaces.length}</strong><span class="stat-foot">Available to you</span></article></div>${reminders.length?`<section class="panel member-reminders"><div class="panel-heading"><h3>Reminders</h3></div><ul>${reminders.map(item=>`<li class="is-${item.kind}"><span aria-hidden="true">${item.kind==='showup'?'!':'◷'}</span><span>${item.html}</span></li>`).join('')}</ul></section>`:''}<div class="notify-box" data-notify-box hidden></div><section class="panel"><div class="panel-heading"><div><span class="eyebrow">YOUR SCHEDULE</span><h2>Open races</h2></div></div>${tableRows(ownRaces.map(r=>({...r,pigeons:entries.filter(e=>e.race_id===r.id).length})),[{key:'name',label:'Race'},{key:'release_location',label:'Release point'},{key:'release_at_utc',label:'Release · PH',render:r=>escapeHTML(formatDate(r.release_at_utc))},{key:'pigeons',label:'Your pigeons'}],'No open races are available for your registered pigeons.',false)}${raceCards(ownRaces,entries)}</section>`;

 // Notifications: offer to turn them on, and remind about show-ups once a day.
 const box=view.querySelector('[data-notify-box]');const state=notificationsState();
 if(state==='default'){box.hidden=false;box.innerHTML='<div><strong>Get notified on this phone</strong><span>A notification when your pigeon is clocked, and show-up reminders.</span></div><button class="button primary" type="button">Turn on notifications</button>';box.querySelector('button').onclick=async()=>{const result=await enableNotifications();if(result==='granted'){box.hidden=true;message('Notifications are on for this device.','success');notify('AvilonX notifications are on','You will be notified when your pigeons are clocked.');}else message('Notifications were not allowed. You can allow them in the browser\'s site settings.','error');};}
 const showups=reminders.filter(item=>item.kind==='showup');
 if(showups.length&&state==='granted'){const key=`avilonx.showupReminder.${memberId}`,today=new Date().toDateString();let last=null;try{last=localStorage.getItem(key);}catch{/* storage unavailable */}if(last!==today){notify('Show up reminder',showups.map(item=>item.text).join(' '));try{localStorage.setItem(key,today);}catch{/* storage unavailable */}}}
}

// Reminders for the member: open races they are entered in, and clocked
// pigeons that still have to be shown up before the race closes.
function memberReminders(races,entries,clocks){
  const out=[];
  races.forEach(race=>{
    const mine=entries.filter(entry=>entry.race_id===race.id);
    const waiting=mine.filter(entry=>clocks.some(clock=>clock.race_entry_id===entry.id&&clock.verification==='provisional'));
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
