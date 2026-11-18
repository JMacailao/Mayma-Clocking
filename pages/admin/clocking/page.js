import { supabase, escapeHTML, formatDate, stateTag, tableRows, message, pageUrl as url } from '../../../assets/js/shared.js';
import { normalizeNfcUid, formatNfcUid, phoneNfcSupported, startPhoneNfc, nfcSetupGuideHtml, listenForReaderKeys, NFC_HELP } from '../../../assets/js/nfc.js';
import { bindStickerScanner, stickerScannerDialogHtml } from '../../superadmin/stickers/shared.js';

// Club clocking: record an arriving pigeon by its NFC tag, its sticker
// reference number or its ring number. Supabase stamps the receipt time.
export async function render(view,identity,setPageCleanup=()=>{}) {
  const [{data:races,error:a},{data:entries,error:b},{data:members},{data:allRaces}]=await Promise.all([
    supabase.from('races').select('id,name,status,release_at_utc,release_location').eq('status','open').order('id',{ascending:false}),
    supabase.from('race_entries').select('*').order('id'),
    supabase.from('members').select('id,member_no,full_name'),
    supabase.from('races').select('id,name')
  ]);if(a||b)throw a||b;
  const openIds=new Set(races.map(race=>race.id)),openEntries=entries.filter(entry=>openIds.has(entry.race_id));
  const raceOptions=races.map(race=>`<option value="${race.id}">${escapeHTML(race.name)}${race.release_location?` · ${escapeHTML(race.release_location)}`:''}</option>`).join('');
  const memberName=entry=>members?.find(member=>member.id===entry.member_id)?.full_name||'';
  const entryLabel=entry=>`${entry.pigeon_ring}${memberName(entry)?` (${memberName(entry)})`:''}`;

  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">CLUB CLOCKING</span><h2>Record an arrival</h2><p>Tap the pigeon's NFC tag, or enter its sticker reference number or ring number.</p></div></div>
  ${races.length?'':'<div class="notice error">No race is open right now. Open a race on Race schedules before clocking.</div>'}
  <section class="panel narrow nfc-clock-panel"><h3>Clock with NFC tag</h3><div class="callout"><span class="callout-icon">◉</span><span>${phoneNfcSupported()?'Press Start, then hold each arriving pigeon\'s tag against the back of this phone, or tap it on your USB NFC reader. Each tap is sent straight away.':'Click in the NFC reader field below, then tap each arriving pigeon\'s tag on your USB NFC reader. Each tap is sent straight away.'}</span></div>
  <div class="form-grid"><label class="field"><span>Race</span><select data-nfc-race><option value="">Any open race</option>${raceOptions}</select></label>${phoneNfcSupported()?'<div class="form-actions"><button class="button primary" type="button" data-nfc-start aria-pressed="false">Start phone NFC</button></div>':''}<label class="field"><span>USB NFC reader</span><input data-nfc-input maxlength="40" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" placeholder="Click here, then tap the tag on the reader"><small class="small">The reader types the tag ID and presses Enter; the clocking is sent automatically. With a keyboard-type reader connected you can tap tags without clicking this field first.</small></label></div>
  <ol class="nfc-log" data-nfc-log></ol>${nfcSetupGuideHtml()}</section>
  <section class="panel narrow"><h3>Clock with sticker or ring number</h3><div class="callout"><span class="callout-icon">◷</span><span>The receipt time comes from Supabase when the submission reaches the server. Clockings are provisional until verified.</span></div>
  <form id="admin-clock-form" class="form-grid"><label class="field"><span>Open race</span><select name="race_id" required><option value="">Choose a race</option>${raceOptions}</select></label><div class="field barcode-field"><label for="admin-clock-code">Sticker reference or ring number</label><div class="barcode-entry"><input id="admin-clock-code" name="code" required maxlength="120" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" placeholder="Scan the sticker stub or type the number" list="admin-clock-rings"><button class="barcode-scan-button" type="button" data-sticker-scan-for="code" aria-label="Scan the sticker's reference barcode with camera" title="Scan reference barcode"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 12h8M10 9v6M14 9v6"/></svg></button></div><datalist id="admin-clock-rings"></datalist></div><div class="form-actions"><button class="button primary">Submit clocking</button></div></form></section>
  <section class="panel"><div class="panel-heading"><h3>Recent receipts</h3><a class="quiet-link" href="${url('pages/admin/results/index.html')}">View results ↗</a></div><div data-receipts>Loading…</div></section>`;
  view.insertAdjacentHTML('beforeend',stickerScannerDialogHtml());

  const form=view.querySelector('#admin-clock-form'),nfcRace=view.querySelector('[data-nfc-race]'),nfcInput=view.querySelector('[data-nfc-input]'),log=view.querySelector('[data-nfc-log]'),startButton=view.querySelector('[data-nfc-start]'),rings=view.querySelector('#admin-clock-rings');
  const fillRings=()=>{const raceId=Number(form.elements.race_id.value);rings.innerHTML=openEntries.filter(entry=>!raceId||entry.race_id===raceId).map(entry=>`<option value="${escapeHTML(entry.pigeon_ring)}">${escapeHTML(memberName(entry))}</option>`).join('');};
  form.elements.race_id.onchange=fillRings;fillRings();
  const addLog=(text,kind)=>{log.insertAdjacentHTML('afterbegin',`<li class="nfc-log-item ${kind}">${escapeHTML(new Date().toLocaleTimeString('en-PH',{timeZone:'Asia/Manila'}))} · ${escapeHTML(text)}</li>`);while(log.children.length>8)log.lastElementChild.remove();};

  // Records the entry and reports the result. Returns true when a receipt now exists.
  const clockEntry=async entry=>{
    const {data,error}=await supabase.rpc('admin_record_clock',{p_entry_id:entry.id});
    if(error)return {ok:false,text:error.message};
    await loadClocks();
    return {ok:true,duplicate:data?.status==='duplicate',text:`${entryLabel(entry)}: ${data?.message||'Clocking received.'}`};
  };

  let nfcBusy=false;
  const clockTag=async uid=>{
    if(nfcBusy)return;
    const raceId=Number(nfcRace.value),matches=openEntries.filter(entry=>entry.nfc_tag===uid&&(!raceId||entry.race_id===raceId));
    if(!matches.length){const text=`Tag ${formatNfcUid(uid)} is not registered to a pigeon in ${raceId?'this race':'an open race'}.`;addLog(text,'error');message(text,'error');return;}
    if(matches.length>1){const text=`Tag ${formatNfcUid(uid)} is entered in more than one open race. Choose the race first.`;addLog(text,'error');message(text,'error');nfcRace.focus();return;}
    nfcBusy=true;try{const result=await clockEntry(matches[0]);addLog(result.text,result.ok&&!result.duplicate?'success':'error');message(result.text,result.ok?(result.duplicate?'info':'success'):'error');}finally{nfcBusy=false;}
  };
  nfcInput.addEventListener('keydown',event=>{if(event.key!=='Enter')return;event.preventDefault();const uid=normalizeNfcUid(nfcInput.value);nfcInput.value='';if(uid)clockTag(uid);else if(uid===null)message(NFC_HELP,'error');});
  const stopReaderKeys=listenForReaderKeys(clockTag);
  let stopPhoneNfc=()=>{};
  if(startButton)startButton.onclick=async()=>{
    if(startButton.getAttribute('aria-pressed')==='true'){stopPhoneNfc();stopPhoneNfc=()=>{};startButton.setAttribute('aria-pressed','false');startButton.textContent='Start phone NFC';return;}
    try{stopPhoneNfc=await startPhoneNfc(clockTag,error=>message(error.message,'error'));startButton.setAttribute('aria-pressed','true');startButton.textContent='Stop phone NFC';message('Phone NFC is on. Hold each tag against the back of the phone.','info');}
    catch(error){message(error.message,'error');}
  };
  const stopScanner=bindStickerScanner(view,form);
  setPageCleanup(()=>{stopReaderKeys();stopPhoneNfc();stopScanner?.();});

  form.onsubmit=async event=>{
    event.preventDefault();
    const raceId=Number(form.elements.race_id.value),code=form.elements.code.value.trim(),key=code.toUpperCase();if(!raceId||!code)return;
    const inRace=openEntries.filter(entry=>entry.race_id===raceId),entry=inRace.find(item=>item.barcode&&String(item.barcode)===code)||inRace.find(item=>String(item.pigeon_ring).toUpperCase()===key);
    if(!entry){message(`No pigeon with sticker or ring number ${code} is entered in this race.`,'error');return;}
    const button=form.querySelector('button.primary');button.disabled=true;
    try{const result=await clockEntry(entry);message(result.text,result.ok?(result.duplicate?'info':'success'):'error');if(result.ok&&!result.duplicate){form.elements.code.value='';form.elements.code.focus();}}finally{button.disabled=false;}
  };

  async function loadClocks(){const {data,error}=await supabase.from('clock_events').select('*').order('received_at_utc',{ascending:false}).limit(20);if(error){view.querySelector('[data-receipts]').textContent='Could not load receipts.';return;}const mapped=(data||[]).map(c=>{const entry=entries.find(e=>e.id===c.race_entry_id);return {...c,entry,member:memberName(entry||{}),race:(allRaces||races).find(r=>r.id===entry?.race_id)};});view.querySelector('[data-receipts]').innerHTML=tableRows(mapped,[{key:'received_at_utc',label:'Received',render:r=>`${escapeHTML(formatDate(r.received_at_utc))}${r.time_source==='reader'?'<br><span class="small" title="Tapped on an RFID reader and sent later; this is the time the tag was tapped.">Reader tap time</span>':''}`},{key:'race',label:'Race',render:r=>escapeHTML(r.race?.name||'—')},{key:'member',label:'Member',render:r=>escapeHTML(r.member||'—')},{key:'entry',label:'Ring',render:r=>escapeHTML(r.entry?.pigeon_ring||r.pigeon_ring||'—')},{key:'verification',label:'Status',render:r=>stateTag(r.verification)}],'No arrivals have been recorded.',false);}
  await loadClocks();
}
