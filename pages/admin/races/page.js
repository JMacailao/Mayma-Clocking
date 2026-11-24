import { supabase, escapeHTML, formatDate, phDateTimeLocalToUtc, utcToPhDateTimeLocal, stateTag, dbError, message } from '../../../assets/js/shared.js';

const STATUSES=[['draft','Draft'],['open','Open'],['closed','Closed']];

export async function render(view) {
  const {data:points,error}=await supabase.from('race_points').select('id,location,sector,latitude,longitude').order('location');if(error)throw error;
  const {data:races,error:raceError}=await supabase.from('races').select('*').order('id',{ascending:false});if(raceError)throw raceError;
  const {data:entries,error:entryError}=await supabase.from('race_entries').select('id,race_id,member_id');if(entryError)throw entryError;
  const pigeonCount=id=>entries.filter(entry=>entry.race_id===id).length;

  view.innerHTML=`<div class="split-heading"><div><h2>Race schedules</h2></div></div>
  <div class="schedule-toolbar"><button class="button primary" type="button" data-create-schedule><span aria-hidden="true">＋</span> Create schedule</button></div>
  <div class="schedule-layout" data-schedule-layout>
    <section class="panel schedule-list"><div class="table-scroll"><table><thead><tr><th>Race</th><th>Release point</th><th>Release time</th><th>Pigeons</th><th>Status</th></tr></thead><tbody data-schedule-rows></tbody></table></div></section>
    <aside class="panel schedule-editor" data-schedule-editor hidden>
      <div class="schedule-editor-head"><h3 data-editor-title>Edit schedule</h3><button class="schedule-editor-close" type="button" data-close-editor aria-label="Close">×</button></div>
      <form id="race-form" class="schedule-form">
        <label class="field"><span>Race name</span><input name="name" maxlength="180" required></label>
        <label class="field"><span>Release point</span><select name="race_point_id" required><option value="">Choose a location</option>${points.map(p=>`<option value="${p.id}">${escapeHTML(p.location)}${p.sector?` · ${escapeHTML(p.sector)}`:''}</option>`).join('')}</select><small class="small" data-point-note hidden>Pigeons are already registered, so the release point can't be changed here. To correct its location or coordinates, edit it on Race points: this race and its entries' distances, speeds and ranks are then recalculated.</small></label>
        <div class="schedule-form-pair"><label class="field"><span>Open date</span><input name="open_date" type="date" required></label><label class="field"><span>End date</span><input name="end_date" type="date" required></label></div>
        <label class="field"><span>Status</span><select name="status">${STATUSES.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label>
        <div class="field"><span>Official release</span><div class="schedule-form-pair"><input name="release_date" type="date" aria-label="Official release date"><input name="release_time" type="time" aria-label="Official release time"></div><small class="small">Philippine time. Needed before the race can open. Leave blank until it is known.</small></div>
        <div class="field"><span>RFID tag expiry</span><div class="schedule-form-pair"><select name="nfc_expiry_days" aria-label="RFID tag expiry"><option value="">No expiry</option><option value="1">1 day</option><option value="2">2 days</option><option value="3">3 days</option><option value="5">5 days</option><option value="7">7 days</option><option value="14">14 days</option><option value="custom">Custom…</option></select><input name="nfc_expiry_custom" type="number" min="1" max="365" step="1" inputmode="numeric" placeholder="Days" aria-label="RFID tag expiry in days" hidden></div><small class="small">For every pigeon entered in this race with an RFID tag, counted from the official release. After it the tag no longer clocks (the sticker still works) and is free for the next race.</small></div>
        <label class="schedule-practice"><input type="checkbox" name="is_practice"><span><strong>Practice race</strong> A test race to try readers and phones. It never appears in the public results.</span></label>
        <div class="schedule-form-actions"><button class="button primary" type="submit" data-save-schedule>Save changes</button><button class="button secondary" type="button" data-cancel-editor>Cancel</button></div>
      </form>
    </aside>
  </div>`;

  const layout=view.querySelector('[data-schedule-layout]'),editor=view.querySelector('[data-schedule-editor]'),form=view.querySelector('#race-form'),rowsNode=view.querySelector('[data-schedule-rows]'),title=view.querySelector('[data-editor-title]'),saveButton=view.querySelector('[data-save-schedule]'),pointNote=view.querySelector('[data-point-note]');
  const {open_date:openDateInput,end_date:endDateInput,release_date:releaseDateInput,release_time:releaseTimeInput}=form.elements;
  let selectedId=null;

  const drawRows=()=>{
    rowsNode.innerHTML=races.length?races.map(race=>`<tr class="schedule-row ${race.id===selectedId?'is-selected':''}" data-race-row="${race.id}" tabindex="0" aria-selected="${race.id===selectedId}"><td data-label="Race"><strong>${escapeHTML(race.name)}</strong>${race.is_practice?' <span class="tag practice">Practice</span>':''}</td><td data-label="Release point">${escapeHTML(race.release_location||'—')}</td><td data-label="Release time">${escapeHTML(race.release_at_utc?formatDate(race.release_at_utc):'Not set')}</td><td data-label="Pigeons">${pigeonCount(race.id)}</td><td data-label="Status">${stateTag(race.status)}</td></tr>`).join(''):'<tr><td class="empty-cell" colspan="5">No schedules yet. Press Create schedule to add one.</td></tr>';
    rowsNode.querySelectorAll('[data-race-row]').forEach(row=>{const pick=()=>openEditor(races.find(race=>race.id===Number(row.dataset.raceRow)));row.onclick=pick;row.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();pick();}};});
  };
  const validateDateRange=()=>{endDateInput.min=openDateInput.value;const invalid=Boolean(openDateInput.value&&endDateInput.value&&endDateInput.value<openDateInput.value);endDateInput.setCustomValidity(invalid?'End date must be on or after open date.':'');return !invalid;};
  openDateInput.addEventListener('input',validateDateRange);endDateInput.addEventListener('input',validateDateRange);

  const expirySelect=form.elements.nfc_expiry_days,expiryCustom=form.elements.nfc_expiry_custom;
  const setExpiry=days=>{const preset=[...expirySelect.options].some(option=>option.value===String(days??''));expirySelect.value=days==null?'':preset?String(days):'custom';expiryCustom.hidden=expirySelect.value!=='custom';expiryCustom.value=expirySelect.value==='custom'?String(days):'';};
  expirySelect.addEventListener('change',()=>{expiryCustom.hidden=expirySelect.value!=='custom';if(!expiryCustom.hidden)expiryCustom.focus();});
  function openEditor(race){
    selectedId=race?.id??null;form.reset();
    title.textContent=race?'Edit schedule':'Create schedule';saveButton.textContent=race?'Save changes':'Create schedule';
    const locked=Boolean(race&&pigeonCount(race.id));form.elements.race_point_id.disabled=locked;pointNote.hidden=!locked;
    if(race){
      form.elements.name.value=race.name||'';
      form.elements.race_point_id.value=race.race_point_id??points.find(point=>point.location===race.release_location)?.id??'';
      openDateInput.value=race.open_date||'';endDateInput.value=race.end_date||'';form.elements.status.value=race.status||'draft';form.elements.is_practice.checked=Boolean(race.is_practice);setExpiry(race.nfc_expiry_days);
      const [date='',time='']=utcToPhDateTimeLocal(race.release_at_utc).split('T');releaseDateInput.value=date;releaseTimeInput.value=time;
    }
    if(!race)setExpiry(null);
    validateDateRange();editor.hidden=false;layout.classList.add('has-editor');drawRows();
    if(matchMedia('(max-width:980px)').matches)editor.scrollIntoView({behavior:'smooth',block:'start'});
  }
  const closeEditor=()=>{selectedId=null;editor.hidden=true;layout.classList.remove('has-editor');drawRows();};

  view.querySelector('[data-create-schedule]').onclick=()=>{openEditor(null);form.elements.name.focus();};
  view.querySelector('[data-close-editor]').onclick=closeEditor;view.querySelector('[data-cancel-editor]').onclick=closeEditor;

  form.onsubmit=async event=>{
    event.preventDefault();
    if(!validateDateRange()){endDateInput.reportValidity();return;}
    const race=races.find(item=>item.id===selectedId),status=form.elements.status.value;
    if(Boolean(releaseDateInput.value)!==Boolean(releaseTimeInput.value)){message('Enter both the official release date and time, or leave both blank.','error');(releaseDateInput.value?releaseTimeInput:releaseDateInput).focus();return;}
    const releaseAt=releaseDateInput.value?phDateTimeLocalToUtc(`${releaseDateInput.value}T${releaseTimeInput.value}`):null;
    if(releaseDateInput.value&&!releaseAt){message('Enter a valid release date and time.','error');return;}
    if(status==='open'&&!releaseAt){message('Add the official release date and time before opening this race.','error');releaseDateInput.focus();return;}
    const record={name:form.elements.name.value.trim(),open_date:openDateInput.value,end_date:endDateInput.value,status,release_at_utc:releaseAt};
    const expiryDays=expirySelect.value==='custom'?Number(expiryCustom.value):expirySelect.value?Number(expirySelect.value):null;
    if(expirySelect.value==='custom'&&!(Number.isInteger(expiryDays)&&expiryDays>=1&&expiryDays<=365)){message('Enter the RFID tag expiry in days (1 to 365).','error');expiryCustom.focus();return;}
    // Sent only when set (or already set), so saving still works before race-tag-expiry.sql is run.
    if(expiryDays!==null||race?.nfc_expiry_days!=null)record.nfc_expiry_days=expiryDays;
    // Sent only when ticked (or already a practice race), so saving still works before race-day.sql is run.
    if(form.elements.is_practice.checked||race?.is_practice)record.is_practice=form.elements.is_practice.checked;
    if(!form.elements.race_point_id.disabled){
      const point=points.find(item=>item.id===Number(form.elements.race_point_id.value));if(!point){form.elements.race_point_id.reportValidity();return;}
      Object.assign(record,{race_point_id:point.id,release_location:point.location,release_latitude:point.latitude,release_longitude:point.longitude});
    }
    if(race&&status==='closed'&&race.status!=='closed'&&!(await confirmReadersSynced(race)))return;
    if(race&&status==='closed'&&race.status!=='closed'&&!(await confirmShowUps(race)))return;
    saveButton.disabled=true;
    const {error:saveError}=race?await supabase.from('races').update(record).eq('id',race.id):await supabase.from('races').insert(record);
    saveButton.disabled=false;
    if(saveError){message(/nfc_expiry_days/i.test(saveError.message||'')?'RFID tag expiry per race is not set up yet. Run avilonx-update.sql in the Supabase SQL Editor.':/is_practice/i.test(saveError.message||'')?'Practice races are not set up yet. Run avilonx-update.sql in the Supabase SQL Editor.':dbError(saveError),'error');return;}
    message(race?'Schedule saved.':'Schedule created.','success');window.dispatchEvent(new Event('app:refresh'));
  };

  // Loft readers keep taps made offline and send them later with their tap
  // time; taps that arrive after the race is closed are refused. So before
  // closing, list members' readers that have sent nothing since the release
  // while the member still has pigeons without a receipt.
  async function confirmReadersSynced(race){
    try{
      const {data:readers,error:readerError}=await supabase.rpc('admin_list_rfid_devices');
      if(readerError||!readers?.length)return true;
      const raceEntries=entries.filter(entry=>entry.race_id===race.id);
      if(!raceEntries.length)return true;
      const {data:clocks}=await supabase.from('clock_events').select('race_entry_id').in('race_entry_id',raceEntries.map(entry=>entry.id));
      const clocked=new Set((clocks||[]).map(clock=>clock.race_entry_id));
      const waitingMembers=new Set(raceEntries.filter(entry=>!clocked.has(entry.id)).map(entry=>entry.member_id));
      const releasedAt=race.release_at_utc?new Date(String(race.release_at_utc).replace(' ','T')+(/[zZ]|[+-]\d\d:?\d\d$/.test(String(race.release_at_utc))?'':'Z')):null;
      const lastContact=reader=>[reader.last_seen_at,reader.last_heartbeat_at].filter(Boolean).map(value=>new Date(value)).sort((a,b)=>b-a)[0]||null;
      const silent=readers.filter(reader=>{if(!reader.member_id||!waitingMembers.has(reader.member_id))return false;const contact=lastContact(reader);return Number(reader.pending_taps)>0||!contact||(releasedAt&&contact<releasedAt);});
      if(!silent.length)return true;
      const list=silent.map(reader=>{const contact=lastContact(reader),waiting=Number(reader.pending_taps)||0;return `• ${reader.name} (${reader.member_name||'member'}), ${reader.is_online?'online now':contact?`last online ${formatDate(contact)}`:'never connected'}${waiting?`, ${waiting} tap${waiting===1?'':'s'} still waiting to send`:''}`;}).join('\n');
      return confirm(`Before closing ${race.name}: these loft readers may still hold taps saved while offline (they still report taps waiting, or have not been online since the release):\n\n${list}\n\nTaps that arrive after the race is closed are not accepted. Ask these members to connect their reader to the internet first.\n\nClose the race anyway?`);
    }catch{return true;}
  }

  // Closing a race disqualifies clocked pigeons that never showed up.
  async function confirmShowUps(race){
    try{
      const raceEntries=entries.filter(entry=>entry.race_id===race.id);if(!raceEntries.length)return true;
      const {data:clocks,error:clockError}=await supabase.from('clock_events').select('race_entry_id,verification').in('race_entry_id',raceEntries.map(entry=>entry.id));
      if(clockError)return true;
      const waiting=(clocks||[]).filter(clock=>clock.verification==='provisional').length;
      if(!waiting)return true;
      return confirm(`${waiting} clocked pigeon${waiting===1?' has':'s have'} not shown up yet (Show up). Closing ${race.name} disqualifies ${waiting===1?'it':'them'}: ${waiting===1?'it is':'they are'} left out of the results.\n\nClose the race anyway?`);
    }catch{return true;}
  }

  drawRows();
  if(races.length)openEditor(races[0]);
}
