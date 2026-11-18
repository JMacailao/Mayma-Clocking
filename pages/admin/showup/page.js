import { supabase, escapeHTML, formatDate, message, number, ringLabel } from '../../../assets/js/shared.js';
import { normalizeNfcUid, formatNfcUid, phoneNfcSupported, startPhoneNfc, NFC_HELP, listenForReaderKeys, listenForDeviceScans, usbReaderStatus } from '../../../assets/js/nfc.js';
import { birdPhotoUrls } from '../birds/page.js';

const READER_KEY='avilonx.reader';
const asUtc=value=>value?new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(value))?String(value).replace(' ','T'):`${String(value).replace(' ','T')}Z`):null;

// The show-up state of a clocked pigeon. Disqualified = its race is closed and
// it was never verified (same rule as the database).
export function showUpState(clock,entry,race){
  if(!clock)return {key:'none',label:'Not clocked'};
  if(clock.verification==='verified')return {key:'verified',label:clock.shown_up_at?`Verified ${formatDate(clock.shown_up_at)}`:'Verified'};
  if(clock.verification==='rejected')return {key:'rejected',label:'Rejected'};
  if(race?.status==='closed')return {key:'disqualified',label:'Disqualified: no show-up'};
  return {key:'waiting',label:'Waiting · until the race is closed'};
}

// After a pigeon is clocked, its owner brings it to the club and its RFID tag
// is tapped here to verify the result. Not verified before the tag expires =
// disqualified.
export async function render(view,identity,setPageCleanup=()=>{}) {
  const load=async()=>{
    const [{data:races,error:a},{data:entries,error:b},{data:clocks,error:c},{data:members,error:d}]=await Promise.all([
      supabase.from('races').select('id,name,status,release_at_utc').order('id',{ascending:false}),
      supabase.from('race_entries').select('*'),
      supabase.from('clock_events').select('*'),
      supabase.from('members').select('id,member_no,full_name,loft_name')
    ]);if(a||b||c||d)throw a||b||c||d;
    let birds=[];try{const {data,error}=await supabase.from('pigeons').select('id,bird_name,color,photo_path');if(!error)birds=data||[];}catch{/* bird-bonding.sql not run */}
    return {races,entries,clocks,members,birds};
  };
  let state=await load();
  let photos=await birdPhotoUrls(state.birds.map(bird=>bird.photo_path));
  const racesWithClocks=state.races.filter(race=>state.entries.some(entry=>entry.race_id===race.id&&state.clocks.some(clock=>clock.race_entry_id===entry.id)));
  const firstRace=racesWithClocks[0]?.id||state.races[0]?.id||'';

  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">AFTER CLOCKING</span><h2>Show up</h2><p>When a member brings a clocked pigeon to the club, tap its RFID tag here to verify the result. When the race is closed, a clocked pigeon that has not shown up is disqualified.</p></div></div>
  <section class="panel"><div class="showup-controls"><label class="field"><span>Race</span><select data-showup-race><option value="">Any race</option>${state.races.map(race=>`<option value="${race.id}" ${race.id===firstRace?'selected':''}>${escapeHTML(race.name)}</option>`).join('')}</select></label></div>
  <div class="field reader-choice" role="radiogroup" aria-labelledby="showup-reader-label"><span id="showup-reader-label">Which RFID reader are you using?</span><div class="reader-choice-options"><label><input type="radio" name="showup_reader" value="wireless"><span><strong>Wireless</strong> ESP8266 Wi-Fi reader</span></label><label><input type="radio" name="showup_reader" value="wired"><span><strong>Wired</strong> USB reader</span></label><label><input type="radio" name="showup_reader" value="phone"><span><strong>Android phone</strong> NFC</span></label></div><small class="small usb-reader-status" data-usb-status hidden></small></div>
  <div class="showup-tap"><div class="entry-bird-tap" data-showup-prompt><strong>Tap the pigeon's RFID tag</strong><span>on the reader chosen above to verify its show-up.</span></div><div class="showup-result" data-showup-result hidden></div>
  <div class="showup-manual"><div class="input-with-button"><input data-showup-input maxlength="40" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Or type the tag ID and press Enter"><button type="button" data-showup-phone aria-label="Read the tag with this phone" title="Read with this phone" hidden><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 9.5a4 4 0 0 1 0 5M11.5 7a8 8 0 0 1 0 10M15 4.5a12 12 0 0 1 0 15"/><circle cx="4.5" cy="12" r="1"/></svg></button></div></div></div></section>
  <section class="panel"><div class="panel-heading"><h3>Clocked pigeons</h3><span class="count-pill" data-showup-counts></span></div><div data-showup-table></div>
  <p class="small">The deadline is the end of the race: when it is closed on Race schedules, every clocked pigeon still waiting is disqualified.</p></section>`;

  const raceSelect=view.querySelector('[data-showup-race]'),input=view.querySelector('[data-showup-input]'),phoneButton=view.querySelector('[data-showup-phone]'),resultBox=view.querySelector('[data-showup-result]'),prompt=view.querySelector('[data-showup-prompt]');
  const readerChoice=()=>view.querySelector('[name=showup_reader]:checked')?.value||'';
  const applyReader=()=>{phoneButton.hidden=readerChoice()!=='phone'||!phoneNfcSupported();const usbLine=view.querySelector('[data-usb-status]');if(usbLine){usbLine.hidden=readerChoice()!=='wired';if(readerChoice()==='wired'&&!usbLine.textContent)usbLine.textContent='USB reader: waiting for a tap. What it types will show here.';}try{if(readerChoice())localStorage.setItem(READER_KEY,readerChoice());}catch{/* storage unavailable */}};
  try{const saved=localStorage.getItem(READER_KEY);const radio=saved&&view.querySelector(`[name=showup_reader][value="${saved}"]`);if(radio)radio.checked=true;}catch{/* storage unavailable */}
  view.querySelectorAll('[name=showup_reader]').forEach(radio=>radio.addEventListener('change',applyReader));applyReader();

  const drawTable=()=>{
    const raceId=Number(raceSelect.value)||null;
    const rows=state.entries.filter(entry=>!raceId||entry.race_id===raceId).map(entry=>{const clock=state.clocks.find(item=>item.race_entry_id===entry.id);if(!clock)return null;const race=state.races.find(item=>item.id===entry.race_id),member=state.members.find(item=>item.id===entry.member_id),bird=state.birds.find(item=>item.id===entry.pigeon_id);const seconds=race?.release_at_utc?(asUtc(clock.received_at_utc)-asUtc(race.release_at_utc))/1000:null;return {entry,clock,race,member,bird,speed:seconds>0?entry.distance_m*60/seconds:null,show:showUpState(clock,entry,race)};}).filter(Boolean).sort((x,y)=>(y.speed||0)-(x.speed||0));
    const counts={verified:0,waiting:0,disqualified:0,rejected:0};rows.forEach(row=>{counts[row.show.key]=(counts[row.show.key]||0)+1;});
    view.querySelector('[data-showup-counts]').textContent=`${counts.verified} verified · ${counts.waiting} waiting · ${counts.disqualified} disqualified`;
    view.querySelector('[data-showup-table]').innerHTML=rows.length?`<div class="table-scroll"><table><thead><tr><th>Ring · bird</th>${raceId?'':'<th>Race</th>'}<th>Member</th><th>Clocked</th><th>Speed · m/min</th><th>Show up</th></tr></thead><tbody>${rows.map(row=>`<tr class="showup-row is-${row.show.key}"><td data-label="Ring · bird"><strong>${escapeHTML(ringLabel(row.entry.pigeon_ring,row.entry.remarks))}</strong>${row.bird?`<br><span class="small">${escapeHTML(row.bird.bird_name)} · ${escapeHTML(row.bird.color)}</span>`:''}</td>${raceId?'':`<td data-label="Race">${escapeHTML(row.race?.name||'—')}</td>`}<td data-label="Member">${escapeHTML(row.member?.full_name||'—')}</td><td data-label="Clocked">${escapeHTML(formatDate(row.clock.received_at_utc))}</td><td data-label="Speed">${row.speed?number(row.speed):'—'}</td><td data-label="Show up"><span class="showup-status is-${row.show.key}">${escapeHTML(row.show.label)}</span></td></tr>`).join('')}</tbody></table></div>`:'<p class="small">No clocked pigeons in this race yet.</p>';
  };
  raceSelect.onchange=drawTable;drawTable();

  let busy=false;
  const tap=async(uid,from,candidates=[uid])=>{
    if(busy)return;busy=true;
    try{
      // A USB reader may type the ID in another form: prefer the one entered in a race.
      uid=candidates.find(item=>state.entries.some(entry=>entry.nfc_tag===item))||uid;
      const {data,error}=await supabase.rpc('admin_show_up_tap',{p_tag:uid,p_race_id:Number(raceSelect.value)||null,p_reader:readerChoice()||null});
      if(error){message(/admin_show_up_tap|function/i.test(error.message||'')?'Show up is not set up yet. Run show-up.sql in the Supabase SQL Editor.':error.message,'error');return;}
      const kind=data.status==='verified'?'success':data.status==='duplicate'?'info':'error';
      message(`${data.message}${from?` (read by ${from})`:''}`,kind);
      state=await load();photos=await birdPhotoUrls(state.birds.map(bird=>bird.photo_path));drawTable();
      const entry=state.entries.find(item=>item.id===data.entry_id),clock=entry&&state.clocks.find(item=>item.race_entry_id===entry.id),race=entry&&state.races.find(item=>item.id===entry.race_id),bird=entry&&state.birds.find(item=>item.id===entry.pigeon_id),member=entry&&state.members.find(item=>item.id===entry.member_id),show=showUpState(clock,entry,race),photo=bird&&photos.get(bird.photo_path);
      prompt.hidden=true;resultBox.hidden=false;resultBox.className=`showup-result is-${entry?show.key:'error'}`;
      resultBox.innerHTML=entry?`${photo?`<img src="${escapeHTML(photo)}" alt="Photo of ${escapeHTML(bird.bird_name)}">`:''}<div><strong>${escapeHTML(ringLabel(entry.pigeon_ring,entry.remarks))}${bird?` · ${escapeHTML(bird.bird_name)}`:''}</strong><span>${escapeHTML(member?.full_name||'')}${data.race?` · ${escapeHTML(data.race)}`:''} · NFC ${escapeHTML(formatNfcUid(uid))}</span><span class="showup-status is-${show.key}">${escapeHTML(show.label)}</span></div>`:`<div><strong>NFC ${escapeHTML(formatNfcUid(uid))}</strong><span>${escapeHTML(data.message)}</span></div>`;
    }finally{busy=false;}
  };
  input.addEventListener('keydown',event=>{if(event.key!=='Enter')return;event.preventDefault();const uid=normalizeNfcUid(input.value);input.value='';if(uid)tap(uid,'');else if(uid===null)message(NFC_HELP,'error');});
  const usbStatus=view.querySelector('[data-usb-status]');
  const stopKeys=listenForReaderKeys((uid,info)=>{if(readerChoice()!=='wired')return false;tap(uid,'the USB reader',info.candidates);},{takeFromTextFields:true,helper:()=>readerChoice()==='wired',onBurst:burst=>{if(readerChoice()==='wired'){usbStatus.hidden=false;usbReaderStatus(usbStatus)(burst);}}});
  const stopScans=listenForDeviceScans((uid,reader)=>{if(readerChoice()==='wireless')tap(uid,reader);});
  let stopPhone=()=>{};
  phoneButton.onclick=async()=>{try{message('Hold the pigeon\'s RFID tag to the back of the phone…','info');stopPhone();stopPhone=await startPhoneNfc(uid=>{stopPhone();tap(uid,'the phone');},error=>message(error.message,'error'));}catch(error){message(error.message,'error');}};
  setPageCleanup(()=>{stopKeys();stopScans();stopPhone();});
}
