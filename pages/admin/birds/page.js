import { mountBirdImport } from './import.js';
import { supabase, escapeHTML, message, dbError } from '../../../assets/js/shared.js';
import { normalizeNfcUid, formatNfcUid, phoneNfcSupported, startPhoneNfc, NFC_HELP, listenForReaderKeys, listenForDeviceScans, usbReaderStatus } from '../../../assets/js/nfc.js';

import { BIRD_COLOURS, PHOTO_BUCKET, birdPhotoUrls, shrinkPhoto } from './photos.js';

const READER_KEY='avilonx.reader',BOND_KEY='avilonx.birds.bond';
const missingSql=error=>/pigeons|relation|schema cache/i.test(error?.message||'');
// Kept for pages that import these from this file.
export { BIRD_COLOURS, birdPhotoUrls };

const friendlyError=error=>{
  const text=`${error?.message||''} ${error?.details||''}`;
  if(error?.code==='23505'&&/ring/i.test(text))return 'A bird with this ring number is already bonded in this club.';
  if(error?.code==='23505'&&/nfc/i.test(text))return 'That RFID tag is already bonded to another active bird. Retire that bird first, or use another tag.';
  if(error?.code==='23503')return 'This bird has race entries, so it cannot be deleted. Retire it instead.';
  if(/active_needs_nfc_tag/i.test(text))return 'An RFID bond needs the bird\'s RFID tag, and a ring-number-only bird has none. Use the matching tab.';
  if(/bond_type/i.test(text))return 'Ring-number-only bonding is not set up yet. Run bird-ring-only.sql in the Supabase SQL Editor, then try again.';
  if(/bucket|storage/i.test(text))return 'The photo could not be saved. Run bird-bonding.sql in the Supabase SQL Editor (it creates the pigeon-photos storage), then try again.';
  return error?.message||dbError(error);
};

// Club administrators and staff bond each bird before it can race: ring,
// bird name, colour, loft name, its RFID tag and a photo.
export async function render(view,identity,setPageCleanup=()=>{}) {
  const clubId=identity?.profile?.club_id;
  const heading='<div class="birds-head"><h2>Band Assignments</h2><div class="birds-head-actions"><button class="button secondary" type="button" data-birds-import>Import Excel</button><button class="text-button" type="button" data-birds-template>Template</button><button class="button birds-add" type="button" data-bond-new><span aria-hidden="true">＋</span> Bond a bird</button></div></div><section class="panel birds-import" data-birds-import-panel hidden></section>';
  const [{data:members,error:memberError},{data:birdsData,error:birdError},{data:entryRows}]=await Promise.all([
    supabase.from('members').select('id,member_no,full_name,loft_name').order('member_no'),
    supabase.from('pigeons').select('*').order('created_at',{ascending:false}),
    supabase.from('race_entries').select('pigeon_id')
  ]);
  if(memberError)throw memberError;
  if(birdError){if(missingSql(birdError)){view.innerHTML=`${heading}<div class="notice error">Band Assignments is not set up yet. Run bird-bonding.sql in the Supabase SQL Editor, then reload this page.</div>`;return;}throw birdError;}
  const birds=birdsData||[],raced=new Set((entryRows||[]).map(row=>row.pigeon_id).filter(Boolean));
  const memberById=new Map(members.map(member=>[member.id,member]));
  let photoUrls=await birdPhotoUrls(birds.map(bird=>bird.photo_path)),editing=null;

  view.innerHTML=`${heading}
  <dialog class="bird-dialog" data-bird-dialog><button type="button" class="bird-dialog-close" data-bird-dialog-close aria-label="Close">×</button><section class="panel bird-form-panel entry-tabs"><div class="entry-tab-bar" role="tablist" aria-label="How the bird is bonded"><button type="button" role="tab" data-bond-tab="rfid" aria-selected="true"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 9.5a4 4 0 0 1 0 5M11.5 7a8 8 0 0 1 0 10M15 4.5a12 12 0 0 1 0 15"/><circle cx="4.5" cy="12" r="1"/></svg><span>RFID bond</span></button><button type="button" role="tab" data-bond-tab="ring" aria-selected="false"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 9v6M10.5 9v6M13 9v6M16 9v6"/></svg><span>Ring number only (sticker)</span></button></div><div class="entry-tab-pane">
  <div class="panel-heading"><h3 data-bird-form-title>Bond a bird</h3></div>
  <p class="entry-tab-intro bond-rfid-only">RFID bond: the bird is picked on Race entries by tapping its RFID tag, and can be clocked by reader, phone or sticker.</p><p class="entry-tab-intro bond-ring-only">Ring number only: no RFID tag. The bird is entered on Race entries → <strong>Sticker entries</strong> by its ring number and sticker, and is clocked with the sticker.</p>
  <form id="bird-form" class="entry-form-grid bird-form" data-bond="rfid">
    <label class="field span-3"><span>Member</span><select name="member_id" required><option value="">Choose a member</option>${members.map(m=>`<option value="${m.id}">${escapeHTML(m.member_no)} · ${escapeHTML(m.full_name)}</option>`).join('')}</select></label>
    <label class="field span-3"><span>Ring number</span><input name="ring_number" required maxlength="80" autocapitalize="characters" placeholder="e.g. PH-2026-012345"></label>
    <label class="field span-2"><span>Bird name</span><input name="bird_name" required maxlength="80" placeholder="e.g. Blue Lightning"></label>
    <label class="field span-2"><span>Colour</span><select name="color" required><option value="">Choose a colour</option>${BIRD_COLOURS.map(colour=>`<option>${colour}</option>`).join('')}</select><input name="color_other" maxlength="40" placeholder="Type the colour" hidden></label>
    <label class="field span-2"><span>Loft name</span><input name="loft_name" required maxlength="120" placeholder="The member's loft"></label>
    <label class="field span-3"><span>Sex <span class="small">(optional)</span></span><select name="sex"><option value="">Not set</option><option value="cock">Cock</option><option value="hen">Hen</option></select></label>
    <label class="field span-3"><span>Hatch year <span class="small">(optional)</span></span><input name="hatch_year" type="number" min="1990" max="2100" step="1" inputmode="numeric" placeholder="${new Date().getFullYear()}"></label>
    <div class="field span-6 reader-choice bond-rfid-only" role="radiogroup" aria-labelledby="bird-reader-label"><span id="bird-reader-label">Which RFID reader are you using?</span><div class="reader-choice-options"><label><input type="radio" name="nfc_read_with" value="wireless"><span><strong>Wireless</strong> ESP8266 Wi-Fi reader</span></label><label><input type="radio" name="nfc_read_with" value="wired"><span><strong>Wired</strong> USB reader</span></label><label><input type="radio" name="nfc_read_with" value="phone"><span><strong>Android phone</strong> NFC</span></label></div><small class="small usb-reader-status" data-usb-status hidden></small></div>
    <label class="field span-3 bond-rfid-only"><span>RFID tag</span><div class="input-with-button"><input name="nfc_tag" required maxlength="40" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" placeholder="Tap the bird's RFID tag"><button type="button" data-tap-nfc aria-label="Read the RFID tag with this phone" title="Read with this phone" hidden><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 9.5a4 4 0 0 1 0 5M11.5 7a8 8 0 0 1 0 10M15 4.5a12 12 0 0 1 0 15"/><circle cx="4.5" cy="12" r="1"/></svg></button></div><small class="small bird-tag-status" data-tag-check hidden></small><small class="small">Required. Register the tag first (Super Admin → Register NFC).</small></label>
    <div class="field span-3 bird-photo-field"><span>Photo of the bird</span><div class="bird-photo-picker"><img data-photo-preview alt="" hidden><div class="bird-photo-empty" data-photo-empty>No photo yet</div><label class="button secondary bird-photo-button"><input name="photo" type="file" accept="image/*" hidden>Choose or take photo</label></div><small class="small" data-photo-hint>Required. Required. Camera or photo library.</small></div>
    <div class="form-actions"><button class="button primary" type="submit" data-save-bird>Bond bird</button><button class="button secondary" type="button" data-cancel-edit>Cancel</button></div>
  </form></div></section></dialog>
  <div class="birds-filters"><label class="birds-search"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg><input data-filter-text placeholder="Search ring number or bird name" aria-label="Search ring number or bird name"></label><select data-filter-member aria-label="Member"><option value="">All members</option>${members.map(m=>`<option value="${m.id}">${escapeHTML(m.member_no)} · ${escapeHTML(m.full_name)}</option>`).join('')}</select><label class="bird-show-retired"><input type="checkbox" data-filter-retired> Show retired birds</label></div>
  <section class="birds-list-section"><h3>Bonded birds</h3><p class="birds-count" data-bird-count></p>
  <div class="bird-list" data-bird-grid></div></section>`;

  const form=view.querySelector('#bird-form'),grid=view.querySelector('[data-bird-grid]'),count=view.querySelector('[data-bird-count]'),title=view.querySelector('[data-bird-form-title]'),saveButton=view.querySelector('[data-save-bird]'),cancelButton=view.querySelector('[data-cancel-edit]');
  const preview=view.querySelector('[data-photo-preview]'),emptyPhoto=view.querySelector('[data-photo-empty]'),tapButton=view.querySelector('[data-tap-nfc]');
  const filterMember=view.querySelector('[data-filter-member]'),filterText=view.querySelector('[data-filter-text]'),filterRetired=view.querySelector('[data-filter-retired]');
  let photoBlob=null,previewUrl=null;

  const bondTabs=[...view.querySelectorAll('[data-bond-tab]')];
  const bondMode=()=>form.dataset.bond==='ring'?'ring':'rfid';
  const setBond=mode=>{
    form.dataset.bond=mode;view.querySelector('.bird-form-panel').dataset.bond=mode;
    bondTabs.forEach(tab=>tab.setAttribute('aria-selected',String(tab.dataset.bondTab===mode)));
    form.elements.nfc_tag.required=mode==='rfid';if(mode==='ring')form.elements.nfc_tag.value='';
    if(!editing)saveButton.textContent=mode==='ring'?'Bond bird (ring only)':'Bond bird';
    try{localStorage.setItem(BOND_KEY,mode);}catch{/* storage unavailable */}
  };
  bondTabs.forEach(tab=>tab.onclick=()=>setBond(tab.dataset.bondTab));
  const showPreview=src=>{preview.hidden=!src;emptyPhoto.hidden=Boolean(src);if(src)preview.src=src;else preview.removeAttribute('src');};
  form.elements.member_id.onchange=()=>{const member=memberById.get(Number(form.elements.member_id.value));if(member&&!editing)form.elements.loft_name.value=member.loft_name||'';};
  form.elements.color.onchange=()=>{const other=form.elements.color.value==='Other';form.elements.color_other.hidden=!other;form.elements.color_other.required=other;if(other)form.elements.color_other.focus();};
  form.elements.photo.onchange=async()=>{
    const file=form.elements.photo.files?.[0];if(!file)return;
    try{photoBlob=await shrinkPhoto(file);if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(photoBlob);showPreview(previewUrl);view.querySelector('[data-photo-hint]').textContent=`Photo ready (${Math.round(photoBlob.size/1024)} KB).`;}
    catch(error){photoBlob=null;message(error.message,'error');}
  };

  // Only the reader chosen above fills the RFID field.
  const readerChoice=()=>form.dataset.bond==='ring'?'':(form.querySelector('[name=nfc_read_with]:checked')?.value||'');
  const applyReaderChoice=()=>{tapButton.hidden=readerChoice()!=='phone'||!phoneNfcSupported();const usbLine=view.querySelector('[data-usb-status]');if(usbLine){usbLine.hidden=readerChoice()!=='wired';if(readerChoice()==='wired'&&!usbLine.textContent)usbLine.textContent='USB reader: waiting for a tap. What it types will show here.';}try{if(readerChoice())localStorage.setItem(READER_KEY,readerChoice());}catch{/* storage unavailable */}};
  try{const saved=localStorage.getItem(READER_KEY);const radio=saved&&form.querySelector(`[name=nfc_read_with][value="${saved}"]`);if(radio)radio.checked=true;}catch{/* storage unavailable */}
  form.querySelectorAll('[name=nfc_read_with]').forEach(radio=>radio.addEventListener('change',applyReaderChoice));applyReaderChoice();
  // Every tag read is checked at once: registered by the Super Admin, and not
  // assigned to another active bird. (The database checks again on saving.)
  const tagCheck=view.querySelector('[data-tag-check]');
  const showTagCheck=(ok,text)=>{tagCheck.hidden=!text;tagCheck.className=`small bird-tag-status ${ok?'is-ok':'is-bad'}`;tagCheck.textContent=text||'';};
  const checkTag=async uid=>{
    const label=formatNfcUid(uid);
    const {data,error}=await supabase.from('nfc_tags').select('tag_uid').eq('tag_uid',uid).maybeSingle();
    if(error)return {ok:true,text:''};// cannot check here: the database still checks on saving
    if(!data)return {ok:false,text:`RFID tag ${label} is not registered. Ask the Super Admin to register it on Register NFC first, then tap it again.`};
    const other=birds.find(bird=>bird.status==='active'&&bird.nfc_tag===uid&&bird.id!==editing?.id);
    if(other)return {ok:false,text:`RFID tag ${label} is already assigned to ${other.ring_number} (${other.bird_name}). Retire that bird first, or use another tag.`};
    return {ok:true,text:`RFID tag ${label}: registered ✓`};
  };
  const fillTag=async(uid,from)=>{
    const result=await checkTag(uid);
    if(!result.ok){form.elements.nfc_tag.value='';showTagCheck(false,result.text);message(result.text,'error');return;}
    form.elements.nfc_tag.value=formatNfcUid(uid);showTagCheck(true,result.text);
    message(`RFID tag ${formatNfcUid(uid)} read${from?` by ${from}`:''}.`,'success');
  };
  form.elements.nfc_tag.addEventListener('keydown',event=>{if(event.key!=='Enter')return;event.preventDefault();const uid=normalizeNfcUid(form.elements.nfc_tag.value);if(uid)fillTag(uid,'');else if(uid===null)message(NFC_HELP,'error');});
  const usbStatus=view.querySelector('[data-usb-status]');
  // A USB reader may type the ID in another form: use the one the Super Admin registered.
  const registeredForm=async candidates=>{if(candidates.length<2)return candidates[0];const {data}=await supabase.from('nfc_tags').select('tag_uid').in('tag_uid',candidates);return candidates.find(item=>(data||[]).some(row=>row.tag_uid===item))||candidates[0];};
  const stopReaderKeys=listenForReaderKeys((uid,info)=>{if(readerChoice()!=='wired')return false;registeredForm(info.candidates).then(best=>fillTag(best,'the USB reader')).catch(()=>fillTag(uid,'the USB reader'));},{helper:()=>readerChoice()==='wired',takeFromTextFields:true,onBurst:burst=>{if(readerChoice()==='wired'){usbStatus.hidden=false;usbReaderStatus(usbStatus)(burst);}}});
  const stopDeviceScans=listenForDeviceScans((uid,reader)=>{if(readerChoice()==='wireless')fillTag(uid,reader);});
  let stopPhone=()=>{};
  tapButton.onclick=async()=>{try{message('Hold the bird\'s RFID tag to the back of the phone…','info');stopPhone();stopPhone=await startPhoneNfc(uid=>{stopPhone();fillTag(uid,'the phone');},error=>message(error.message,'error'));}catch(error){message(error.message,'error');}};
  setPageCleanup(()=>{stopReaderKeys();stopDeviceScans();stopPhone();if(previewUrl)URL.revokeObjectURL(previewUrl);});

  const resetForm=()=>{
    showTagCheck(true,'');
    editing=null;form.reset();photoBlob=null;showPreview(null);form.elements.color_other.hidden=true;form.elements.color_other.required=false;
    try{const saved=localStorage.getItem(READER_KEY);const radio=saved&&form.querySelector(`[name=nfc_read_with][value="${saved}"]`);if(radio)radio.checked=true;}catch{/* storage unavailable */}
    title.textContent='Bond a bird';form.elements.member_id.disabled=false;
    let savedBond='rfid';try{savedBond=localStorage.getItem(BOND_KEY)==='ring'?'ring':'rfid';}catch{/* storage unavailable */}
    setBond(savedBond);applyReaderChoice();
    view.querySelector('[data-photo-hint]').textContent='Required. Required. Camera or photo library.';
  };
  const dialog=view.querySelector('[data-bird-dialog]');
  const openDialog=()=>{try{dialog.showModal();}catch{dialog.setAttribute('open','');}};
  const closeDialog=()=>{if(dialog.open)dialog.close();};
  dialog.addEventListener('close',()=>{if(editing)resetForm();});
  view.querySelector('[data-bird-dialog-close]').onclick=closeDialog;
  view.querySelector('[data-bond-new]').onclick=()=>{resetForm();openDialog();form.elements.member_id.focus();};
  cancelButton.onclick=()=>{resetForm();closeDialog();};

  const editBird=bird=>{
    resetForm();editing=bird;
    form.elements.member_id.value=bird.member_id;form.elements.member_id.disabled=raced.has(bird.id);
    form.elements.ring_number.value=bird.ring_number;form.elements.bird_name.value=bird.bird_name;
    if(BIRD_COLOURS.includes(bird.color)&&bird.color!=='Other')form.elements.color.value=bird.color;else{form.elements.color.value='Other';form.elements.color_other.hidden=false;form.elements.color_other.required=true;form.elements.color_other.value=bird.color;}
    form.elements.loft_name.value=bird.loft_name;form.elements.sex.value=bird.sex||'';form.elements.hatch_year.value=bird.hatch_year||'';
    editing=null;setBond(bird.bond_type==='ring'?'ring':'rfid');editing=bird;
    form.elements.nfc_tag.value=bird.nfc_tag?formatNfcUid(bird.nfc_tag):'';
    if(bird.nfc_read_with){const radio=form.querySelector(`[name=nfc_read_with][value="${bird.nfc_read_with}"]`);if(radio)radio.checked=true;applyReaderChoice();}
    showPreview(photoUrls.get(bird.photo_path)||null);
    title.textContent=`Edit bird ${bird.ring_number}`;saveButton.textContent='Save changes';
    view.querySelector('[data-photo-hint]').textContent='Keep the photo, or take or choose a new one.';
    openDialog();
  };

  form.onsubmit=async event=>{
    event.preventDefault();
    const memberId=Number(form.elements.member_id.value),member=memberById.get(memberId);if(!member){message('Choose the member who owns the bird.','error');return;}
    const ringOnly=bondMode()==='ring';
    const tag=ringOnly?'':normalizeNfcUid(form.elements.nfc_tag.value.trim());
    if(!ringOnly){
      if(tag===null){message(NFC_HELP,'error');form.elements.nfc_tag.focus();return;}
      if(!tag){message('Tap the bird\'s RFID tag, or use the Ring number only tab for a bird raced with a sticker only.','error');form.elements.nfc_tag.focus();return;}
      if(!readerChoice()){message('Choose which RFID reader you are using: Wireless, Wired or Android phone.','error');return;}
      const tagResult=await checkTag(tag);
      if(!tagResult.ok){showTagCheck(false,tagResult.text);message(tagResult.text,'error');form.elements.nfc_tag.focus();return;}
    }
    if(!editing&&!photoBlob){message('Take or choose a photo of the bird. A photo is required.','error');return;}
    const colour=form.elements.color.value==='Other'?form.elements.color_other.value.trim():form.elements.color.value;
    if(!colour){message('Choose or type the bird\'s colour.','error');return;}
    const record={member_id:memberId,ring_number:form.elements.ring_number.value.trim(),bird_name:form.elements.bird_name.value.trim(),color:colour,loft_name:form.elements.loft_name.value.trim(),sex:form.elements.sex.value||null,hatch_year:form.elements.hatch_year.value?Number(form.elements.hatch_year.value):null,nfc_tag:tag||null,nfc_read_with:tag?readerChoice():null};
    // Sent only when needed, so RFID bonding keeps working before bird-ring-only.sql is run.
    if(ringOnly||editing?.bond_type)record.bond_type=ringOnly?'ring':'rfid';
    saveButton.disabled=true;
    let uploadedPath=null;
    try{
      if(photoBlob){
        uploadedPath=`${clubId||'club'}/${memberId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.jpg`;
        const {error:uploadError}=await supabase.storage.from(PHOTO_BUCKET).upload(uploadedPath,photoBlob,{contentType:'image/jpeg',upsert:false});
        if(uploadError){uploadedPath=null;throw uploadError;}
        record.photo_path=uploadedPath;
      }
      const {error:saveError}=editing?await supabase.from('pigeons').update(record).eq('id',editing.id):await supabase.from('pigeons').insert(record);
      if(saveError)throw saveError;
      if(editing&&uploadedPath&&editing.photo_path)await supabase.storage.from(PHOTO_BUCKET).remove([editing.photo_path]);
      message(editing?`Bird ${record.ring_number.toUpperCase()} updated.`:`Bird ${record.ring_number.toUpperCase()} (${record.bird_name}) bonded to ${member.full_name}${ringOnly?' by ring number only (sticker entries)':''}.`,'success');
      resetForm();closeDialog();await reload();
    }catch(error){
      if(uploadedPath)await supabase.storage.from(PHOTO_BUCKET).remove([uploadedPath]);
      message(friendlyError(error),'error');
    }finally{saveButton.disabled=false;}
  };

  mountBirdImport({button:view.querySelector('[data-birds-import]'),templateButton:view.querySelector('[data-birds-template]'),panel:view.querySelector('[data-birds-import-panel]'),members,birds,onDone:()=>reload()});

  async function reload(){
    const {data,error}=await supabase.from('pigeons').select('*').order('created_at',{ascending:false});
    if(error){message(dbError(error),'error');return;}
    birds.splice(0,birds.length,...(data||[]));photoUrls=await birdPhotoUrls(birds.map(bird=>bird.photo_path));drawGrid();
  }

  function drawGrid(){
    const memberFilter=Number(filterMember.value)||null,text=filterText.value.trim().toLowerCase(),showRetired=filterRetired.checked;
    const list=birds.filter(bird=>(showRetired||bird.status==='active')&&(!memberFilter||bird.member_id===memberFilter)&&(!text||[bird.ring_number,bird.bird_name,bird.color].some(value=>String(value||'').toLowerCase().includes(text))));
    const active=birds.filter(bird=>bird.status==='active').length;
    count.textContent=`${list.length} bird${list.length===1?'':'s'}${!showRetired&&birds.length>active?` · ${birds.length-active} retired hidden`:''}`;
    const rfidCell=bird=>bird.bond_type==='ring'?'<span class="bird-ring-only">Ring only · sticker</span>':bird.nfc_tag?escapeHTML(formatNfcUid(bird.nfc_tag)):'–';
    grid.innerHTML=list.length?`<div class="table-scroll"><table class="bird-table"><thead><tr><th>Ring number</th><th>Bird name</th><th>Color</th><th>Member</th><th>RFID tag</th><th>Status</th><th>Actions</th></tr></thead><tbody>${list.map(bird=>{const member=memberById.get(bird.member_id),photo=photoUrls.get(bird.photo_path);return `<tr class="bird-row ${bird.status==='retired'?'is-retired':''}" data-bird="${bird.id}">
      <td data-label="Ring number" class="bird-col-ring"><span class="bird-ring-cell">${photo?`<button type="button" class="bird-thumb" data-view-photo aria-label="View photo of ${escapeHTML(bird.bird_name)}"><img src="${escapeHTML(photo)}" alt="" loading="lazy"></button>`:'<span class="bird-thumb is-empty">—</span>'}<strong>${escapeHTML(bird.ring_number)}</strong></span></td>
      <td data-label="Bird name">${escapeHTML(bird.bird_name)}</td>
      <td data-label="Color">${escapeHTML(bird.color)}</td>
      <td data-label="Member">${escapeHTML(member?.full_name||'—')}</td>
      <td data-label="RFID tag">${rfidCell(bird)}</td>
      <td data-label="Status"><span class="bird-status ${bird.status==='active'?'is-bonded':'is-retired'}">${bird.status==='active'?'Bonded':'Retired'}</span></td>
      <td data-label="Actions" class="bird-actions"><button class="text-button bird-action" type="button" data-edit-bird>Edit</button><span class="bird-action-sep" aria-hidden="true">|</span><button class="text-button bird-action" type="button" data-retire-bird>${bird.status==='active'?'Retire':'Make active'}</button>${raced.has(bird.id)?'':'<span class="bird-action-sep" aria-hidden="true">|</span><button class="text-button bird-action danger-text" type="button" data-delete-bird>Delete</button>'}</td></tr>`;}).join('')}</tbody></table></div>`:`<p class="small">${birds.length?'No birds match the filters.':'No birds bonded yet. Press Bond a bird to add the first one.'}</p>`;
    grid.querySelectorAll('[data-bird]').forEach(card=>{
      const bird=birds.find(item=>item.id===Number(card.dataset.bird));
      card.querySelector('[data-edit-bird]').onclick=()=>editBird(bird);
      const thumb=card.querySelector('[data-view-photo]');if(thumb)thumb.onclick=()=>viewPhoto(bird);
      card.querySelector('[data-retire-bird]').onclick=async()=>{
        const retiring=bird.status==='active';
        if(retiring&&!confirm(`Retire ${bird.ring_number} (${bird.bird_name})? It can no longer be entered in races, and its RFID tag becomes free for another bird.`))return;
        const {error}=await supabase.from('pigeons').update({status:retiring?'retired':'active'}).eq('id',bird.id);
        if(error){message(friendlyError(error),'error');return;}
        message(retiring?`${bird.ring_number} retired.`:`${bird.ring_number} is active again.`,'success');await reload();
      };
      const remove=card.querySelector('[data-delete-bird]');
      if(remove)remove.onclick=async()=>{
        if(!confirm(`Delete ${bird.ring_number} (${bird.bird_name}) and its photo? This cannot be undone.`))return;
        const {error}=await supabase.from('pigeons').delete().eq('id',bird.id);
        if(error){message(friendlyError(error),'error');return;}
        await supabase.storage.from(PHOTO_BUCKET).remove([bird.photo_path]);
        message(`${bird.ring_number} deleted.`,'success');await reload();
      };
    });
  }
  // Full-size photo of a bird, opened from the list.
  const viewer=document.createElement('dialog');viewer.className='photo-viewer';view.append(viewer);
  viewer.addEventListener('click',event=>{if(event.target===viewer)viewer.close();});
  function viewPhoto(bird){
    const member=memberById.get(bird.member_id),photo=photoUrls.get(bird.photo_path);if(!photo)return;
    viewer.innerHTML=`<img src="${escapeHTML(photo)}" alt="Photo of ${escapeHTML(bird.bird_name)}"><div class="photo-viewer-caption"><div><strong>${escapeHTML(bird.ring_number)} · ${escapeHTML(bird.bird_name)}</strong><span>${escapeHTML(bird.color)} · ${escapeHTML(bird.loft_name)}${member?` · ${escapeHTML(member.full_name)}`:''}</span></div><form method="dialog"><button class="button secondary">Close</button></form></div>`;
    try{viewer.showModal();}catch{viewer.setAttribute('open','');}
  }
  filterMember.onchange=drawGrid;filterText.oninput=drawGrid;filterRetired.onchange=drawGrid;
  resetForm();drawGrid();
}
