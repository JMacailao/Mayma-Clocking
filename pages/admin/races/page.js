import { supabase, escapeHTML, formatDate, phDateTimeLocalToUtc, utcToPhDateTimeLocal, stateTag, dbError, message } from '../../../assets/js/shared.js';

const STATUSES=[['draft','Draft'],['open','Open'],['closed','Closed']];

export async function render(view) {
  const {data:points,error}=await supabase.from('race_points').select('id,location,sector,latitude,longitude').order('location');if(error)throw error;
  const {data:races,error:raceError}=await supabase.from('races').select('*').order('id',{ascending:false});if(raceError)throw raceError;
  const {data:entries,error:entryError}=await supabase.from('race_entries').select('id,race_id,member_id');if(entryError)throw entryError;
  const pigeonCount=id=>entries.filter(entry=>entry.race_id===id).length;

  view.innerHTML=`<div class="split-heading"><div><h2>Race schedules</h2></div></div>
  <div class="schedule-toolbar">
    <button class="button primary" type="button" data-create-schedule><span aria-hidden="true">＋</span> Create schedule</button>
    <div class="schedule-filter" role="group" aria-label="Show races">
      <div class="schedule-filter-modes" role="group" aria-label="Quick filter"><button type="button" data-filter-mode="today" aria-pressed="true">Today &amp; open</button><button type="button" data-filter-mode="all" aria-pressed="false">All</button></div>
      <label class="field"><span>From</span><input type="date" data-filter-from></label>
      <label class="field"><span>To</span><input type="date" data-filter-to></label>
      <span class="count-pill" data-filter-count></span>
    </div>
  </div>
  <dialog class="schedule-dialog" data-schedule-dialog aria-labelledby="schedule-dialog-title"><div class="schedule-editor-head"><h3 id="schedule-dialog-title">Create schedule</h3><button class="schedule-editor-close" type="button" data-close-dialog aria-label="Close">×</button></div><div data-dialog-body></div></dialog>
  <div class="schedule-layout" data-schedule-layout>
    <section class="panel schedule-list"><div class="table-scroll"><table><thead><tr><th>Race</th><th>Release point</th><th>Release time</th><th>Pigeons</th><th>Status</th></tr></thead><tbody data-schedule-rows></tbody></table></div></section>
    <aside class="panel schedule-editor" data-schedule-editor hidden>
      <div class="schedule-editor-head"><h3 data-editor-title>Edit schedule</h3><button class="schedule-editor-close" type="button" data-close-editor aria-label="Close">×</button></div>
      <section class="race-details" data-race-details aria-label="Race details" hidden></section>
      <form id="race-form" class="schedule-form">
        <label class="field"><span>Race name</span><input name="name" maxlength="180" required></label>
        <label class="field"><span>Release point</span><select name="race_point_id" required><option value="">Choose a location</option>${points.map(p=>`<option value="${p.id}">${escapeHTML(p.location)}${p.sector?` · ${escapeHTML(p.sector)}`:''}</option>`).join('')}</select><small class="small" data-point-note hidden>Locked (pigeons registered). Edit it on Race points.</small></label>
        <div class="schedule-form-pair"><label class="field"><span>Open date</span><input name="open_date" type="date" required></label><label class="field"><span>End date</span><input name="end_date" type="date" required></label></div>
        <div class="schedule-form-row"><label class="field"><span>Status</span><select name="status">${STATUSES.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><label class="field schedule-lap"><span>Lap</span><input name="lap" type="number" min="1" max="99" step="1" inputmode="numeric" placeholder="e.g. 1"></label></div>
        <div class="field"><span>Official release</span><div class="schedule-form-pair"><input name="release_date" type="date" aria-label="Official release date"><input name="release_time" type="time" aria-label="Official release time"></div><small class="small">Philippine time. Needed to open the race.</small></div>
        <div class="field"><span>RFID tag expiry</span><div class="schedule-form-pair"><select name="nfc_expiry_days" aria-label="RFID tag expiry"><option value="">No expiry</option><option value="1">1 day</option><option value="2">2 days</option><option value="3">3 days</option><option value="5">5 days</option><option value="7">7 days</option><option value="14">14 days</option><option value="custom">Custom…</option></select><input name="nfc_expiry_custom" type="number" min="1" max="365" step="1" inputmode="numeric" placeholder="Days" aria-label="RFID tag expiry in days" hidden></div><small class="small">From release. Then RFID tags stop clocking.</small></div>
        <label class="schedule-practice schedule-showup"><input type="checkbox" name="requires_show_up" checked><span><strong>Show up needed</strong> Clocked pigeons must be brought to the club before the race closes, or they are disqualified.</span></label>
        <label class="schedule-practice"><input type="checkbox" name="is_practice"><span><strong>Practice race</strong> A test race to try readers and phones. It never appears in the public results.</span></label>
        <div class="schedule-form-actions"><button class="button primary" type="submit" data-save-schedule>Save changes</button><button class="button secondary" type="button" data-cancel-editor>Cancel</button><button class="button danger-button" type="button" data-delete-race hidden>Delete race</button></div>
      </form>
    </aside>
  </div>`;

  const layout=view.querySelector('[data-schedule-layout]'),editor=view.querySelector('[data-schedule-editor]'),form=view.querySelector('#race-form'),rowsNode=view.querySelector('[data-schedule-rows]'),title=view.querySelector('[data-editor-title]'),saveButton=view.querySelector('[data-save-schedule]'),pointNote=view.querySelector('[data-point-note]');
  const {open_date:openDateInput,end_date:endDateInput,release_date:releaseDateInput,release_time:releaseTimeInput}=form.elements;
  let selectedId=null;

  // Filter: "Today & open" (default) = races whose dates include today, open
  // races, and races made today; or races between From and To; or All.
  const PH_DAY=value=>value?new Date(new Date(`${String(value).replace(' ','T')}${/[zZ]|[+-]\d\d:?\d\d$/.test(String(value))?'':'Z'}`).getTime()+8*3600e3).toISOString().slice(0,10):null;
  const today=new Date(Date.now()+8*3600e3).toISOString().slice(0,10);
  const span=race=>{const start=race.open_date||PH_DAY(race.release_at_utc);const end=race.end_date||start;return [start,end];};
  const filterNodes={from:view.querySelector('[data-filter-from]'),to:view.querySelector('[data-filter-to]'),count:view.querySelector('[data-filter-count]'),modes:[...view.querySelectorAll('[data-filter-mode]')]};
  // Found with the toolbar's Find: show every race so it is in the list.
  let filterMode='today';try{if(sessionStorage.getItem('avilonx.racesShowAll')){filterMode='all';sessionStorage.removeItem('avilonx.racesShowAll');}}catch{/* storage unavailable */}
  const shown=()=>races.filter(race=>{
    if(filterMode==='all')return true;
    const [start,end]=span(race);
    if(filterMode==='today')return race.status==='open'||(start&&start<=today&&end>=today)||PH_DAY(race.created_at)===today;
    const from=filterNodes.from.value||'0000-01-01',to=filterNodes.to.value||'9999-12-31';
    return Boolean(start)&&start<=to&&end>=from;
  });
  const setMode=mode=>{filterMode=mode;filterNodes.modes.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.filterMode===mode)));if(mode!=='range'){filterNodes.from.value='';filterNodes.to.value='';}drawRows();};
  filterNodes.modes.forEach(button=>button.onclick=()=>setMode(button.dataset.filterMode));
  [filterNodes.from,filterNodes.to].forEach(input=>input.addEventListener('change',()=>{
    if(filterNodes.from.value&&filterNodes.to.value&&filterNodes.to.value<filterNodes.from.value)filterNodes.to.value=filterNodes.from.value;
    setMode(filterNodes.from.value||filterNodes.to.value?'range':'today');
  }));
  const emptyText=()=>!races.length?'No schedules yet. Press Create schedule to add one.':filterMode==='today'?'No races today and none open. Choose dates or All to see other races.':'No races between these dates.';

  const drawRows=()=>{
    const list=shown();
    filterNodes.count.textContent=`${list.length} of ${races.length} race${races.length===1?'':'s'}`;
    rowsNode.innerHTML=list.length?list.map(race=>`<tr class="schedule-row ${race.id===selectedId?'is-selected':''}" data-race-row="${race.id}" tabindex="0" aria-selected="${race.id===selectedId}"><td data-label="Race"><strong>${escapeHTML(race.name)}</strong>${race.is_practice?' <span class="tag practice">Practice</span>':''}${race.lap?` <span class="tag lap">Lap ${escapeHTML(String(race.lap))}</span>`:''}${race.requires_show_up===false?' <span class="tag">No show up</span>':''}</td><td data-label="Release point">${escapeHTML(race.release_location||'—')}</td><td data-label="Release time">${escapeHTML(race.release_at_utc?formatDate(race.release_at_utc):'Not set')}</td><td data-label="Pigeons">${pigeonCount(race.id)}</td><td data-label="Status">${stateTag(race.status)}</td></tr>`).join(''):`<tr><td class="empty-cell" colspan="5">${escapeHTML(emptyText())}</td></tr>`;
    rowsNode.querySelectorAll('[data-race-row]').forEach(row=>{const pick=()=>openEditor(races.find(race=>race.id===Number(row.dataset.raceRow)));row.onclick=pick;row.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();pick();}};});
  };
  const validateDateRange=()=>{endDateInput.min=openDateInput.value;const invalid=Boolean(openDateInput.value&&endDateInput.value&&endDateInput.value<openDateInput.value);endDateInput.setCustomValidity(invalid?'End date must be on or after open date.':'');return !invalid;};
  openDateInput.addEventListener('input',validateDateRange);endDateInput.addEventListener('input',validateDateRange);

  const expirySelect=form.elements.nfc_expiry_days,expiryCustom=form.elements.nfc_expiry_custom;
  const setExpiry=days=>{const preset=[...expirySelect.options].some(option=>option.value===String(days??''));expirySelect.value=days==null?'':preset?String(days):'custom';expiryCustom.hidden=expirySelect.value!=='custom';expiryCustom.value=expirySelect.value==='custom'?String(days):'';};
  expirySelect.addEventListener('change',()=>{expiryCustom.hidden=expirySelect.value!=='custom';if(!expiryCustom.hidden)expiryCustom.focus();});
  // The chosen race at a glance: name, release point and time, pigeons, status.
  const details=view.querySelector('[data-race-details]');
  const drawDetails=race=>{
    details.hidden=!race;if(!race){details.innerHTML='';return;}
    const rows=[['Race',`<strong>${escapeHTML(race.name||'—')}</strong>${race.is_practice?' <span class="tag practice">Practice</span>':''}`],['Release point',escapeHTML(race.release_location||'—')],['Release time',escapeHTML(race.release_at_utc?formatDate(race.release_at_utc):'Not set')],['Pigeons',String(pigeonCount(race.id))],['Status',stateTag(race.status)]];
    details.innerHTML=`<dl class="race-details-panel">${rows.map(([label,value])=>`<div class="race-details-row"><dt class="race-details-label">${label}</dt><dd class="race-details-value">${value}</dd></div>`).join('')}</dl>`;
  };
  function openEditor(race,{inDialog=false}={}){
    selectedId=race?.id??null;form.reset();
    title.textContent=race?'Edit schedule':'Create schedule';saveButton.textContent=race?'Save changes':'Create schedule';view.querySelector('[data-delete-race]').hidden=!race;
    const locked=Boolean(race&&pigeonCount(race.id));form.elements.race_point_id.disabled=locked;pointNote.hidden=!locked;
    if(race){
      form.elements.name.value=race.name||'';
      form.elements.race_point_id.value=race.race_point_id??points.find(point=>point.location===race.release_location)?.id??'';
      openDateInput.value=race.open_date||'';endDateInput.value=race.end_date||'';form.elements.status.value=race.status||'draft';form.elements.is_practice.checked=Boolean(race.is_practice);form.elements.requires_show_up.checked=race.requires_show_up!==false;form.elements.lap.value=race.lap??'';setExpiry(race.nfc_expiry_days);
      const [date='',time='']=utcToPhDateTimeLocal(race.release_at_utc).split('T');releaseDateInput.value=date;releaseTimeInput.value=time;
    }
    if(!race)setExpiry(null);
    drawDetails(race);validateDateRange();
    if(inDialog){if(!openDateInput.value){openDateInput.value=today;endDateInput.value=today;}return;}
    if(dialog?.open)dialog.close();
    editor.hidden=false;layout.classList.add('has-editor');drawRows();
    if(matchMedia('(max-width:980px)').matches)editor.scrollIntoView({behavior:'smooth',block:'start'});
  }
  const closeEditor=()=>{selectedId=null;editor.hidden=true;layout.classList.remove('has-editor');drawRows();};

  // Create schedule opens the form in a pop-up; editing keeps it beside the list.
  const dialog=view.querySelector('[data-schedule-dialog]'),dialogBody=view.querySelector('[data-dialog-body]'),formHome=details.nextElementSibling===form?details:null;
  const putFormBack=()=>{if(form.parentElement!==editor)(formHome||editor.querySelector('.schedule-editor-head')).after(form);};
  view.querySelector('[data-create-schedule]').onclick=()=>{
    if(!editor.hidden)closeEditor();
    openEditor(null,{inDialog:true});
    dialogBody.append(form);dialog.showModal();form.elements.name.focus();
  };
  view.querySelector('[data-close-dialog]').onclick=()=>dialog.close();
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  dialog.addEventListener('close',()=>{putFormBack();selectedId=null;drawRows();});
  view.querySelector('[data-close-editor]').onclick=closeEditor;view.querySelector('[data-cancel-editor]').onclick=()=>dialog.open?dialog.close():closeEditor();

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
    const lap=form.elements.lap.value===''?null:Number(form.elements.lap.value);
    if(lap!==null&&!(Number.isInteger(lap)&&lap>=1&&lap<=99)){message('Enter the lap as a number from 1 to 99, or leave it blank.','error');form.elements.lap.focus();return;}
    // Sent only when set (or already set), so saving still works before avilonx-update.sql is run again.
    if(lap!==null||race?.lap!=null)record.lap=lap;
    // Sent only when ticked (or already a practice race), so saving still works before race-day.sql is run.
    if(form.elements.is_practice.checked||race?.is_practice)record.is_practice=form.elements.is_practice.checked;
    // Sent only when unticked (or already unticked), so saving still works before entry-remarks.sql is run.
    if(!form.elements.requires_show_up.checked||race?.requires_show_up===false)record.requires_show_up=form.elements.requires_show_up.checked;
    if(!form.elements.race_point_id.disabled){
      const point=points.find(item=>item.id===Number(form.elements.race_point_id.value));if(!point){form.elements.race_point_id.reportValidity();return;}
      Object.assign(record,{race_point_id:point.id,release_location:point.location,release_latitude:point.latitude,release_longitude:point.longitude});
    }
    if(race&&status==='closed'&&race.status!=='closed'&&!(await confirmReadersSynced(race)))return;
    if(race&&status==='closed'&&race.status!=='closed'&&form.elements.requires_show_up.checked&&!(await confirmShowUps(race)))return;
    saveButton.disabled=true;
    const {error:saveError}=race?await supabase.from('races').update(record).eq('id',race.id):await supabase.from('races').insert(record);
    saveButton.disabled=false;
    if(saveError){message(/\blap\b|races_lap_range/i.test(saveError.message||'')?'Laps are not set up yet. Run avilonx-update.sql in the Supabase SQL Editor.':/nfc_expiry_days/i.test(saveError.message||'')?'RFID tag expiry per race is not set up yet. Run avilonx-update.sql in the Supabase SQL Editor.':/is_practice/i.test(saveError.message||'')?'Practice races are not set up yet. Run avilonx-update.sql in the Supabase SQL Editor.':/requires_show_up/i.test(saveError.message||'')?'The Show up option is not set up yet. Run avilonx-update.sql in the Supabase SQL Editor.':dbError(saveError),'error');return;}
    if(dialog.open)dialog.close();
    message(race?'Schedule saved.':'Schedule created.','success');window.dispatchEvent(new Event('app:refresh'));
  };

  // Delete a race: one without pigeons any time; one with pigeons only 6 months
  // after its race day (its entries and clockings go with it; billing stays).
  const raceDay=race=>race.end_date||race.open_date||PH_DAY(race.release_at_utc)||PH_DAY(race.created_at);
  const sixMonthsAfter=day=>{const d=new Date(`${day}T00:00:00Z`),m=d.getUTCMonth()+6;d.setUTCMonth(m);if(d.getUTCMonth()!==((m%12)+12)%12)d.setUTCDate(0);return d.toISOString().slice(0,10);};
  const dayText=day=>new Date(`${day}T00:00:00Z`).toLocaleDateString('en-PH',{timeZone:'UTC',year:'numeric',month:'short',day:'numeric'});
  view.querySelector('[data-delete-race]').onclick=async()=>{
    const race=races.find(item=>item.id===selectedId);if(!race)return;
    const count=pigeonCount(race.id),day=raceDay(race),allowed=day?sixMonthsAfter(day):null;
    if(count&&(!allowed||allowed>today)){message(`${race.name} has ${count} pigeon${count===1?'':'s'} entered. A race with pigeons can be deleted 6 months after its race day${allowed?` (from ${dayText(allowed)})`:''}. Until then, set it to Closed.`,'error');return;}
    if(!confirm(count?`Delete "${race.name}" with its ${count} pigeon entr${count===1?'y':'ies'}, clockings and results? This cannot be undone. (Entries stay billed.)`:`Delete the race "${race.name}"? This cannot be undone.`))return;
    const button=view.querySelector('[data-delete-race]');button.disabled=true;
    let {error:deleteError}=await supabase.rpc('admin_delete_race',{p_race_id:race.id});
    // Before avilonx-update.sql adds admin_delete_race: an empty race is deleted directly.
    if(deleteError&&/admin_delete_race/.test(deleteError.message||'')&&!count)({error:deleteError}=await supabase.from('races').delete().eq('id',race.id));
    button.disabled=false;
    if(deleteError){message(/admin_delete_race/.test(deleteError.message||'')?'Deleting races with pigeons is not set up yet. Run avilonx-update.sql in the Supabase SQL Editor.':dbError(deleteError),'error');return;}
    if(dialog.open)dialog.close();
    message(`Race "${race.name}" deleted${count?` with ${count} entr${count===1?'y':'ies'}`:''}.`,'success');window.dispatchEvent(new Event('app:refresh'));
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

  filterNodes.modes.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.filterMode===filterMode)));
  drawRows();
  // Overview's "Create a race" (club toolbar) opens the pop-up right away.
  let openCreate=false;try{openCreate=Boolean(sessionStorage.getItem('avilonx.openCreate'));sessionStorage.removeItem('avilonx.openCreate');}catch{/* storage unavailable */}
  if(openCreate){view.querySelector('[data-create-schedule]').click();return;}
  const first=shown()[0];if(first)openEditor(first);
}
