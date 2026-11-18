// Members: a pop-up with the result whenever one of their pigeons is clocked,
// whichever way (loft RFID reader, phone, sticker or the club). Checks every
// 15 seconds while the app is open, and on opening the app shows clocks from
// the last 24 hours that were not shown yet.
import { supabase, escapeHTML, formatDateSeconds, number, ringLabel, message } from './shared.js';

const CHECK_MS=15000,RECENT_MS=24*3600*1000;
const asUtc=value=>value?new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(value))?String(value).replace(' ','T'):`${String(value).replace(' ','T')}Z`):null;
const flightText=seconds=>{if(!(seconds>0))return '—';const s=Math.round(seconds),h=Math.floor(s/3600),m=Math.floor(s%3600/60);return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;};
const howText=clock=>clock.source==='barcode'?'Sticker':clock.source==='admin_manual'?'Club':clock.time_source==='reader'?'Loft RFID reader':'NFC tag';

export function watchMemberReceipts(memberId){
  if(!memberId||window.__avilonxReceiptWatch)return;
  window.__avilonxReceiptWatch=true;
  const key=`avilonx.seenReceipts.${memberId}`;
  let seen=null;
  try{const stored=localStorage.getItem(key);if(stored)seen=new Set(JSON.parse(stored));}catch{/* storage unavailable */}
  const firstRun=!seen;seen=seen||new Set();
  const save=()=>{try{localStorage.setItem(key,JSON.stringify([...seen].slice(-300)));}catch{/* storage unavailable */}};
  window.addEventListener('avilonx:receipt-shown',event=>{if(event.detail?.id){seen.add(event.detail.id);save();}});

  const queue=[];let dialog=null,busy=false;
  const showNext=()=>{
    if(!queue.length||dialog?.open)return;
    const item=queue.shift();
    if(!dialog){dialog=document.createElement('dialog');dialog.className='result-popup';document.body.append(dialog);dialog.addEventListener('close',()=>setTimeout(showNext,300));}
    const rows=[['Race',item.race?.name],['Ring',ringLabel(item.entry.pigeon_ring,item.entry.remarks)],['Bird',item.bird?`${item.bird.bird_name} · ${item.bird.color}`:null],['Clocked at',formatDateSeconds(item.clock.received_at_utc)],['Release',item.race?.release_at_utc?`${item.race.release_location||''}${item.race.release_location?' · ':''}${formatDateSeconds(item.race.release_at_utc)}`:null],['Flight time',flightText(item.seconds)],['Distance',item.entry.distance_m?`${number(item.entry.distance_m/1000)} km`:null],['Speed',item.speed?`${number(item.speed)} m/min`:'—'],['Clocked with',howText(item.clock)],['Show up',item.clock.verification==='verified'?'Verified':item.race?.status==='closed'?'Race closed':'Bring the pigeon to the club before the race is closed']].filter(([,value])=>value);
    dialog.innerHTML=`<div class="result-popup-head"><span class="result-popup-icon" aria-hidden="true">✓</span><div><h2>Your pigeon was clocked</h2><p>${escapeHTML(ringLabel(item.entry.pigeon_ring,item.entry.remarks))}${item.race?` · ${escapeHTML(item.race.name)}`:''}</p></div></div><dl>${rows.map(([label,value])=>`<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join('')}</dl><p class="small">Results are provisional until the club verifies them.</p><form method="dialog"><button class="button primary">OK</button></form>`;
    try{dialog.showModal();}catch{dialog.setAttribute('open','');}
    message(`${item.entry.pigeon_ring} clocked for ${item.race?.name||'the race'}${item.speed?` · ${number(item.speed)} m/min`:''}.`,'success');
  };

  const check=async()=>{
    if(busy||document.hidden)return;busy=true;
    try{
      const {data:entries,error}=await supabase.from('race_entries').select('*').eq('member_id',memberId);
      if(error||!entries?.length)return;
      const {data:clocks}=await supabase.from('clock_events').select('*').in('race_entry_id',entries.map(entry=>entry.id));
      const fresh=(clocks||[]).filter(clock=>!seen.has(clock.id)&&Date.now()-new Date(clock.created_at||asUtc(clock.received_at_utc))<RECENT_MS);
      if(firstRun&&!queue.length){
        // First time on this device: only pop clocks from the last 10 minutes.
        fresh.filter(clock=>Date.now()-new Date(clock.created_at||asUtc(clock.received_at_utc))>10*60*1000).forEach(clock=>seen.add(clock.id));
      }
      const toShow=fresh.filter(clock=>!seen.has(clock.id));
      if(toShow.length){
        const raceIds=[...new Set(entries.filter(entry=>toShow.some(clock=>clock.race_entry_id===entry.id)).map(entry=>entry.race_id))];
        const [{data:races},{data:birds,error:birdError}]=await Promise.all([supabase.from('races').select('id,name,status,release_at_utc,release_location').in('id',raceIds),supabase.from('pigeons').select('id,bird_name,color')]);
        toShow.sort((a,b)=>asUtc(a.received_at_utc)-asUtc(b.received_at_utc)).forEach(clock=>{
          const entry=entries.find(item=>item.id===clock.race_entry_id),race=(races||[]).find(item=>item.id===entry.race_id),bird=birdError?null:(birds||[]).find(item=>item.id===entry.pigeon_id);
          const seconds=race?.release_at_utc?(asUtc(clock.received_at_utc)-asUtc(race.release_at_utc))/1000:null;
          queue.push({clock,entry,race,bird,seconds,speed:seconds>0?entry.distance_m*60/seconds:null});seen.add(clock.id);
        });
        save();showNext();
      }else if(firstRun)save();
    }catch(error){console.warn('Result check failed:',error);}
    finally{busy=false;}
  };
  setInterval(check,CHECK_MS);check();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
}
