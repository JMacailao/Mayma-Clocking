import { supabase, escapeHTML, message, dbError, formatDate, ringLabel, pageUrl } from '../../../assets/js/shared.js';
import { bindStickerScanner, stickerScannerDialogHtml } from '../../superadmin/stickers/shared.js';
import { birdPhotoUrls } from '../birds/photos.js';
import { normalizeNfcUid, formatNfcUid, startPhoneNfc, NFC_HELP, readerHelperLink, listenForReaderKeys, listenForDeviceScans, usbReaderStatus } from '../../../assets/js/nfc.js';
import { distanceMeters } from './entry-helpers.js';
import { mountEntrySheetImport } from './sheet-import.js';

// Race entries: the entry form (RFID entries and Sticker entries). The race
// sheet scanner and Excel import live in sheet-import.js.
export async function entriesPage(view,setPageCleanup=()=>{}) {
  const [{data:races,error:a},{data:members,error:b}]=await Promise.all([supabase.from('races').select('*').order('id',{ascending:false}),supabase.from('members').select('id,member_no,full_name,loft_name,latitude,longitude').order('member_no')]);if(a||b)throw a||b;
  const {data:entries,error}=await supabase.from('race_entries').select('*').order('id',{ascending:false});if(error)throw error;
  // The club's remarks, ticked per entry (built on Entry remarks). Missing table = no remarks yet.
  let remarkOptions=[];
  try{const {data:options,error:remarkError}=await supabase.from('entry_remark_options').select('label').eq('is_active',true).order('sort_order').order('label');if(!remarkError)remarkOptions=(options||[]).map(option=>option.label);}catch{/* entry-remarks.sql not run yet */}
  // Bonded birds (Bird bonding). When bonding is set up, entries must use one of them.
  let birds=null,birdPhotos=new Map();
  try{const {data:bonded,error:birdError}=await supabase.from('pigeons').select('*').order('ring_number');if(!birdError){birds=bonded||[];birdPhotos=await birdPhotoUrls(birds.filter(bird=>bird.status==='active').map(bird=>bird.photo_path));}}catch{/* bird-bonding.sql not run yet */}
  const birdById=new Map((birds||[]).map(bird=>[bird.id,bird]));
  // Members who clock with their own RFID reader (loft clock). Their pigeons need an RFID tag.
  const readerByMember=new Map();
  try{const {data:readers,error:readerError}=await supabase.rpc('admin_list_rfid_devices');if(!readerError)(readers||[]).filter(reader=>reader.member_id).forEach(reader=>readerByMember.set(Number(reader.member_id),reader));}catch{/* rfid-devices.sql not run yet */}
  // Club settings: does an RFID entry need the sticker? ('required' unless the club made it optional)
  let stickerRule='required';
  try{const {data:club,error:clubError}=await supabase.from('clubs').select('rfid_entry_sticker').limit(1).maybeSingle();if(!clubError&&club?.rfid_entry_sticker==='optional')stickerRule='optional';}catch{/* club-settings.sql not run yet */}
  const RACE_KEY='avilonx.entries.race';let initialRaceId=null;
  try{const stored=Number(sessionStorage.getItem(RACE_KEY));if(races.some(race=>race.id===stored))initialRaceId=stored;}catch{/* storage unavailable */}
  view.innerHTML=`<div class="entries-head"><h2>Race entries</h2><span class="entries-head-sep" aria-hidden="true"></span><label for="entry-race">Race schedule</label><select id="entry-race" name="race_id" form="entry-form" data-sheet-race required><option value="">Choose a race</option>${races.map((r,i)=>`<option value="${r.id}" ${r.id===initialRaceId||(!initialRaceId&&i===0)?'selected':''}>${escapeHTML(r.name)}</option>`).join('')}</select></div>
  <section class="entry-tabs entries-shell" data-entry-tabs data-tab="register"><div class="entry-tab-bar entries-tab-bar" role="tablist" aria-label="Ways to add entries"><button type="button" role="tab" data-entry-tab="rfid" aria-selected="true"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 9.5a4 4 0 0 1 0 5M11.5 7a8 8 0 0 1 0 10M15 4.5a12 12 0 0 1 0 15"/><circle cx="4.5" cy="12" r="1"/></svg><span>RFID entries</span></button><button type="button" role="tab" data-entry-tab="sticker" aria-selected="false"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 9v6M10.5 9v6M13 9v6M16 9v6"/></svg><span>Sticker entries</span></button><button type="button" role="tab" data-entry-tab="sheet" aria-selected="false"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg><span>Scan race sheet</span></button><button type="button" role="tab" data-entry-tab="excel" aria-selected="false"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9.5 12l5 6M14.5 12l-5 6"/></svg><span>Import Excel</span></button></div>
  <div class="entry-tab-pane entries-pane" data-entry-pane="register" role="tabpanel"><form id="entry-form" class="entries-form" data-mode="rfid">
   <div class="entries-cards">
    <section class="entries-card entries-member"><h3>Member &amp; bird</h3>
     <div class="entries-row"><label class="field"><span>Member</span><select name="member_id" required><option value="">Choose a member</option>${members.map(m=>`<option value="${m.id}">${escapeHTML(m.member_no)} · ${escapeHTML(m.full_name)}${readerByMember.has(m.id)?' · RFID reader':''}</option>`).join('')}</select></label><label class="field"><span>Ring number</span><input name="pigeon_ring" maxlength="80" required autocapitalize="characters" ${birds?'placeholder="Filled by the RFID tap"':''}></label></div>
     <small class="small member-reader-note" data-member-reader hidden></small><div class="entry-last-race" data-last-race hidden></div>
     ${birds?`<div class="field entries-bird"><span id="entry-bird-label">Bird</span><div class="entry-bird-tap rfid-only" data-bird-tap role="status"><strong>Tap the bird's bonded RFID tag</strong><span>on the RFID reader chosen on the right. The bird then appears here.</span></div><div class="entry-bird-tap sticker-only" data-bird-tap role="status"><strong>Type the bonded bird's ring number</strong><span>in Ring number above. The bird then appears here.</span></div><div class="entry-bird-preview" data-bird-preview hidden></div><input type="hidden" name="pigeon_id"><small class="small" data-bird-hint>Only bonded birds can be entered. Bond new birds on <strong>Band Assignments</strong>.</small></div>`:''}
    </section>
    <section class="entries-card entries-reader"><h3><span class="rfid-only">RFID reader</span><span class="sticker-only">Sticker</span></h3>
     <div class="reader-choice entries-reader-choice rfid-only" role="radiogroup" aria-label="Which RFID reader are you using?"><div class="reader-choice-options"><label><input type="radio" name="nfc_read_with" value="wireless"><span><strong>Wireless</strong> ESP8266</span></label><label><input type="radio" name="nfc_read_with" value="wired"><span><strong>Wired</strong> USB</span></label><label><input type="radio" name="nfc_read_with" value="phone"><span><strong>Android</strong> NFC</span></label></div></div>
     <div class="entries-tag-status rfid-only" data-tag-status hidden></div><small class="small usb-reader-status rfid-only" data-usb-status hidden></small>
     <div class="entries-row rfid-only"><label class="field"><span>NFC tag</span><div class="input-with-button"><input name="nfc_tag" maxlength="40" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" placeholder="Tap the tag on the reader"><button type="button" data-tap-nfc aria-label="Read NFC tag with this phone" title="Read NFC tag with this phone"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 9.5a4 4 0 0 1 0 5M11.5 7a8 8 0 0 1 0 10M15 4.5a12 12 0 0 1 0 15"/><circle cx="4.5" cy="12" r="1"/></svg></button></div></label><div class="field"><span>RFID tag expiry</span><div class="entries-expiry" data-race-expiry>—</div></div></div>
     <label class="field"><span>Sticker reference number${stickerRule==='optional'?' <span class="small rfid-only">(optional for RFID entries)</span>':''}</span><div class="input-with-button"><input name="barcode" maxlength="120" inputmode="numeric" autocomplete="off" autocapitalize="none" autocorrect="off" placeholder="Scan the barcode or type the number"><button data-sticker-scan-for="barcode" type="button" aria-label="Scan the sticker's reference barcode with camera" title="Scan reference barcode"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 9v6M10.5 9v6M13 9v6M16 9v6"/></svg></button></div></label>
     <details class="entries-reader-setup rfid-only"><summary>Reader setup</summary><small class="small" data-reader-choice-hint>Choose the reader, then tap the tag.</small><small class="small entry-field-hint">Windows with an ACR122U? ${readerHelperLink()}</small></details>
    </section>
   </div>
   <section class="entries-card entries-options"><div class="entries-options-row"><label class="field"><span>Category</span><select name="category"><option>Open Category</option><option>Young Bird</option><option>Old Bird</option><option>Special Category</option></select></label><label class="field"><span>Race type</span><select name="race_type"><option>Regular Race/Set</option><option>Training Toss</option><option>Special Race</option></select></label><label class="field"><span>Pooling</span><select name="pooling"><option value="0">No</option><option value="1">Yes</option></select></label>${remarkOptions.length?`<div class="field entry-remarks" role="group" aria-labelledby="entry-remarks-label"><span id="entry-remarks-label">Remarks</span><div class="entry-remarks-options">${remarkOptions.map(label=>`<label><input type="checkbox" name="remarks" value="${escapeHTML(label)}"><span>${escapeHTML(label)}</span></label>`).join('')}</div></div>`:''}</div><div class="form-actions"><button class="button primary">Save entry</button></div></section>
  </form></div><div class="entry-tab-pane" data-entry-pane="import" role="tabpanel" hidden></div></section>
  <section class="entries-card entries-registered" data-registered-panel><h3>Registered pigeons</h3><div data-registered-entries></div></section>`;
  view.querySelector('#entry-form').onsubmit=async e=>{e.preventDefault();
    // Both RFID entries and Sticker entries need the pigeon's sticker.
    const mode=e.currentTarget.dataset.mode||'rfid';if(mode==='sticker'&&!birds)e.currentTarget.nfc_tag.value='';
    if(mode==='rfid'&&birds&&!birdById.get(tappedBirdId)){message('Tap the bird\'s bonded RFID tag on the chosen reader first.','error');return;}
    if(!e.currentTarget.barcode.value.trim()){
      // Club settings: the sticker may be optional for RFID entries (warn first).
      if(mode==='rfid'&&stickerRule==='optional'){if(!confirm('No sticker for this pigeon.\n\nWithout a sticker it can only be clocked by its RFID tag (loft reader or phone). If the tag fails or expires, it cannot be clocked with a sticker.\n\nSave this RFID entry without a sticker?')){e.currentTarget.barcode.focus();return;}}
      else{message(mode==='rfid'?'Now scan or type the bird\'s sticker reference number: RFID entries need the sticker too.':'Scan or type the sticker reference number.','error');e.currentTarget.barcode.focus();return;}
    }
    if(mode==='rfid'&&!birds&&!e.currentTarget.nfc_tag.value.trim()){message('Tap the pigeon\'s RFID tag on the chosen reader.','error');return;}
   const f=e.currentTarget,m=members.find(x=>x.id===Number(f.member_id.value)),r=races.find(x=>x.id===Number(f.race_id.value)),barcode=f.barcode.value.trim(),nfcTag=normalizeNfcUid(f.nfc_tag.value);if(!m||!r)return;if(nfcTag===null){message(NFC_HELP,'error');f.nfc_tag.focus();return;}if(mode!=='sticker'&&readerByMember.has(m.id)&&!nfcTag&&!confirm(`${m.full_name} has an RFID loft reader. Without an RFID tag this pigeon can only be clocked with its sticker, not by the reader or an Android phone. Save anyway?`)){f.nfc_tag.focus();return;}if(!birds&&!barcode&&!nfcTag){message('Tap the pigeon\'s NFC tag or enter a registered sticker barcode.','error');return;}if(barcode){const {data:sticker,error:stickerError}=await supabase.from('barcode_stickers').select('barcode_number,is_registered').eq('barcode_number',barcode).maybeSingle();if(stickerError){message(stickerError.message.includes('barcode_stickers')?'The global sticker registry is not installed. Run sticker-barcodes.sql in Supabase SQL Editor.':stickerError.message,'error');return;}if(!sticker||sticker.is_registered===false){message(`Sticker ${barcode} is not registered this season. Ask the Super Admin to register it first.`,'error');return;}}if(nfcTag){const {data:tag,error:tagError}=await supabase.from('nfc_tags').select('tag_uid').eq('tag_uid',nfcTag).maybeSingle();if(tagError){message(tagError.message.includes('nfc_tags')?'The NFC tag registry is not installed. Run nfc-tags.sql in Supabase SQL Editor.':tagError.message,'error');return;}if(!tag){message(`NFC tag ${formatNfcUid(nfcTag)} is not registered. Ask the Super Admin to register it first.`,'error');return;}}const entry={race_id:r.id,member_id:m.id,pigeon_ring:f.pigeon_ring.value.trim().toUpperCase(),barcode:barcode||null,pooling:Number(f.pooling.value),category:f.category.value,race_type:f.race_type.value,distance_m:distanceMeters(r.release_latitude,r.release_longitude,m.latitude,m.longitude)};const ticked=[...f.querySelectorAll('[name=remarks]:checked')].map(box=>box.value);if(ticked.length)entry.remarks=ticked;
    if(birds&&tagBusyText(currentBird())){message(tagBusyText(currentBird()),'error');return;}
    if(birds){const bird=currentBird();if(!bird||bird.member_id!==m.id){message(mode==='rfid'?'Tap the bird\'s bonded RFID tag on the chosen reader first.':'Type the ring number of one of this member\'s bonded birds.','error');return;}if(mode==='rfid'&&bird.id!==tappedBirdId){message('Tap the bird\'s bonded RFID tag on the chosen reader first.','error');return;}if(bird.id!==tappedBirdId&&!barcode){message(`${bird.ring_number} was entered by ring number, so it is clocked with its sticker. Scan or type the sticker reference number.`,'error');f.barcode.focus();return;}entry.pigeon_id=bird.id;entry.pigeon_ring=bird.ring_number;const chosenReader=f.querySelector('[name=nfc_read_with]:checked')?.value;if(chosenReader||bird.nfc_read_with)entry.nfc_read_with=chosenReader||bird.nfc_read_with;}
    if(nfcTag&&!birds){entry.nfc_tag=nfcTag;const readWith=f.querySelector('[name=nfc_read_with]:checked')?.value;if(!readWith){message('Choose which RFID reader you are using: Wireless, Wired or Android phone.','error');f.querySelector('[name=nfc_read_with]').focus();return;}entry.nfc_read_with=readWith;}
    // The RFID tag expiry comes from the race (Race schedules); the database sets it.
    const submitButton=f.querySelector('button.primary');submitButton.disabled=true;const {data:savedEntry,error}=await supabase.from('race_entries').insert(entry).select().single();submitButton.disabled=false;if(error){message(error.code==='23505'&&birds?'This bird is already entered in this race.':error.code==='23505'&&nfcTag?'That NFC tag or barcode is already used in this race.':error.code==='PGRST204'?'Run nfc-tags.sql in the Supabase SQL Editor to enable NFC tags.':dbError(error),'error');return;}
    // Stay on this race (and member) so the next pigeon can be added straight away.
    entries.unshift(savedEntry||{...entry,id:`new-${Date.now()}`});view.querySelector('#entry-race').dispatchEvent(new Event('change'));
    f.pigeon_ring.value='';f.nfc_tag.value='';f.barcode.value='';f.querySelectorAll('[name=remarks]').forEach(box=>{box.checked=false;});
    if(f.pigeon_id){tappedBirdId=null;view.querySelector('#entry-race').dispatchEvent(new Event('change'));}else f.pigeon_ring.focus();
    message(`Pigeon ${ringLabel(entry.pigeon_ring,entry.remarks)} registered for ${r.name}.`,'success');};
  const entryForm=view.querySelector('#entry-form'),tapButton=view.querySelector('[data-tap-nfc]');
  // Show whether the chosen member has an RFID loft reader. The RFID tag is
  // recommended for them (reader and Android phone), and a sticker still works.
  const readerNote=view.querySelector('[data-member-reader]');
  const showMemberReader=()=>{
    const reader=readerByMember.get(Number(entryForm.elements.member_id.value));
    readerNote.hidden=!entryForm.elements.member_id.value;
    readerNote.classList.toggle('has-reader',Boolean(reader));
    readerNote.textContent=reader?`Has an RFID loft reader (${reader.name}). Add this pigeon's RFID tag so the reader and an Android phone can clock it; a sticker also works as a backup.`:'No RFID loft reader: clocks with a sticker, or by tapping the RFID/NFC tag on an Android phone.';
  };
  entryForm.elements.member_id.addEventListener('change',showMemberReader);
  // The member's birds from their last race (not yet entered in this one):
  // one click fills the ring number, then only the new sticker is needed.
  const lastRaceBox=view.querySelector('[data-last-race]');
  const showLastRace=()=>{
    if(!lastRaceBox||!birds){if(lastRaceBox)lastRaceBox.hidden=true;return;}
    const memberId=Number(entryForm.elements.member_id.value),raceId=Number(view.querySelector('#entry-race').value);
    const previous=entries.filter(entry=>Number(entry.member_id)===memberId&&Number(entry.race_id)!==raceId&&entry.pigeon_id);
    const lastRaceId=previous.map(entry=>Number(entry.race_id)).sort((a,b)=>b-a)[0];
    const inThis=new Set(entries.filter(entry=>Number(entry.race_id)===raceId).map(entry=>entry.pigeon_id));
    const list=[...new Set(previous.filter(entry=>Number(entry.race_id)===lastRaceId).map(entry=>entry.pigeon_id))].map(id=>birdById.get(id)).filter(bird=>bird&&bird.status==='active'&&!inThis.has(bird.id));
    lastRaceBox.hidden=!memberId||!list.length;if(lastRaceBox.hidden)return;
    const lastRace=races.find(race=>race.id===lastRaceId);
    lastRaceBox.innerHTML=`<span class="small">From ${escapeHTML(lastRace?.name||'the last race')}: click a bird, then scan its new sticker.</span><div>${list.map(bird=>`<button type="button" class="entry-chip" data-last-bird="${bird.id}">${escapeHTML(bird.ring_number)} <span>${escapeHTML(bird.bird_name)}</span></button>`).join('')}</div>`;
    lastRaceBox.querySelectorAll('[data-last-bird]').forEach(button=>button.onclick=()=>{
      const bird=birdById.get(Number(button.dataset.lastBird));if(!bird)return;
      if(entryForm.dataset.mode!=='sticker')switchTab('sticker');
      entryForm.elements.member_id.value=String(bird.member_id);
      entryForm.elements.pigeon_ring.value=bird.ring_number;entryForm.elements.pigeon_ring.dispatchEvent(new Event('input'));
      entryForm.elements.barcode.focus();message(`${bird.ring_number} · ${bird.bird_name}: now scan or type its new sticker.`,'info');
    });
  };
  entryForm.elements.member_id.addEventListener('change',showLastRace);
  // Bonded birds are identified only by tapping their bonded RFID tag on the
  // chosen reader; there is no list to choose from.
  const birdSelect=entryForm.elements.pigeon_id,birdPreview=view.querySelector('[data-bird-preview]'),birdTaps=[...view.querySelectorAll('[data-bird-tap]')];
  let tappedBirdId=null;
  const enteredInRace=()=>{const raceId=Number(view.querySelector('#entry-race').value);return new Set(entries.filter(entry=>Number(entry.race_id)===raceId&&entry.pigeon_id).map(entry=>entry.pigeon_id));};
  const ringBird=()=>{const ring=String(entryForm.elements.pigeon_ring.value||'').trim().toUpperCase();if(!ring)return null;const memberId=Number(entryForm.elements.member_id.value);return birds.find(bird=>bird.status==='active'&&String(bird.ring_number).toUpperCase()===ring&&(!memberId||bird.member_id===memberId))||null;};
  const currentBird=()=>birdById.get(tappedBirdId)||ringBird();
  // Same rule as the database (rfid-tag-in-use.sql): a tag still active in
  // another race (not closed, not expired) cannot be entered in a new one.
  const tagBusyText=bird=>{
    if(!bird?.nfc_tag||bird.bond_type==='ring')return '';
    const raceId=Number(view.querySelector('#entry-race').value),now=Date.now();
    const other=entries.find(entry=>entry.nfc_tag===bird.nfc_tag&&Number(entry.race_id)!==raceId&&(!entry.nfc_expires_at||new Date(entry.nfc_expires_at)>now)&&races.find(race=>race.id===Number(entry.race_id))?.status!=='closed');
    if(!other)return '';
    const race=races.find(item=>item.id===Number(other.race_id));
    return `RFID tag still active in ${race?.name||'another race'} ${other.nfc_expires_at?`until ${formatDate(other.nfc_expires_at)}`:'until that race is closed'}: it cannot be entered in this race yet.`;
  };
  const showBird=()=>{
    if(!birdSelect)return;
    const bird=currentBird();
    if(tappedBirdId)entryForm.elements.pigeon_ring.value=bird?.ring_number||'';
    entryForm.elements.nfc_tag.value=bird?.nfc_tag?formatNfcUid(bird.nfc_tag):'';
    entryForm.elements.nfc_tag.placeholder=bird?(bird.nfc_tag?'':'No RFID bonded: use a sticker'):'Shown after tapping the bird\'s tag';
    birdTaps.forEach(prompt=>{prompt.hidden=Boolean(bird);});birdPreview.hidden=!bird;
    if(bird){const photo=birdPhotos.get(bird.photo_path),owner=members.find(member=>member.id===bird.member_id);birdPreview.innerHTML=`${photo?`<img src="${escapeHTML(photo)}" alt="Photo of ${escapeHTML(bird.bird_name)}">`:''}<div><div class="entry-bird-line"><strong>${escapeHTML(bird.ring_number)}</strong><span class="entry-bird-chip">${escapeHTML(bird.color)}</span><span class="entry-bird-chip is-bonded">✓ Bonded</span></div><span>${escapeHTML(bird.bird_name)} · ${escapeHTML(bird.loft_name)}${owner?` · ${escapeHTML(owner.full_name)}`:''}</span>${tagBusyText(bird)?`<span class="entry-bird-warning">${escapeHTML(tagBusyText(bird))}</span>`:''}<span class="entry-bird-nfc">${bird.id===tappedBirdId?`NFC ${escapeHTML(formatNfcUid(bird.nfc_tag))} · tapped ✓`:`Entered by ring number: clocked with its sticker${bird.nfc_tag?` (bonded NFC ${escapeHTML(formatNfcUid(bird.nfc_tag))})`:''}`}</span></div><button class="button secondary entry-bird-change" type="button" data-clear-bird>Change</button>`;birdPreview.querySelector('[data-clear-bird]').onclick=()=>{tappedBirdId=null;entryForm.elements.pigeon_ring.value='';showBird();message('Tap the bird\'s RFID tag again, or type its ring number.','info');};}
  };
  const fillBirds=()=>{
    if(!birdSelect)return;
    const memberId=Number(entryForm.elements.member_id.value),entered=enteredInRace();
    const tapped=birdById.get(tappedBirdId);
    if(tapped&&(tapped.member_id!==memberId||entered.has(tapped.id)))tappedBirdId=null;
    birdSelect.value=tappedBirdId||'';
    showBird();
  };
  if(birdSelect){
    entryForm.elements.nfc_tag.readOnly=true;
    entryForm.elements.member_id.addEventListener('change',fillBirds);
    entryForm.elements.pigeon_ring.addEventListener('input',()=>{
      const tapped=birdById.get(tappedBirdId),ring=entryForm.elements.pigeon_ring.value.trim().toUpperCase();
      if(tapped&&String(tapped.ring_number).toUpperCase()!==ring)tappedBirdId=null;
      if(!entryForm.elements.member_id.value){const bird=ringBird();if(bird){entryForm.elements.member_id.value=String(bird.member_id);entryForm.elements.member_id.dispatchEvent(new Event('change'));}}
      showBird();
    });
    view.querySelector('#entry-race').addEventListener('change',fillBirds);
    fillBirds();
  }
  const applyEntryMode=()=>{
    const rfid=entryForm.dataset.mode==='rfid';
    tappedBirdId=null;entryForm.elements.pigeon_ring.value='';entryForm.elements.nfc_tag.value='';entryForm.elements.barcode.value='';
    entryForm.elements.pigeon_ring.readOnly=Boolean(birds)&&rfid;
    entryForm.elements.pigeon_ring.placeholder=birds?(rfid?'Filled by the RFID tap':'Type the bonded bird\'s ring number'):'';
    if(birdSelect)showBird();
  };
  entryForm.addEventListener('entry-mode',applyEntryMode);applyEntryMode();
  // The race's RFID tag expiry (set on Race schedules).
  const expiryBox=view.querySelector('[data-race-expiry]');
  const showRaceExpiry=()=>{const race=races.find(item=>item.id===Number(view.querySelector('#entry-race').value));if(!expiryBox)return;const days=race?.nfc_expiry_days;expiryBox.textContent=days?`${days} day${days===1?'':'s'} after release`:'No expiry';expiryBox.title='Set for the whole race on Race schedules';};
  view.querySelector('#entry-race').addEventListener('change',showRaceExpiry);showRaceExpiry();
  // A USB reader in keyboard mode presses Enter after the tag ID; keep it in the field instead of submitting the form.
  // A tag read by the chosen reader. With bird bonding it picks the bonded bird
  // (and its member); otherwise it fills the NFC tag field.
  const tagStatusBox=view.querySelector('[data-tag-status]');
  const tagStatus=(ok,text)=>{if(!tagStatusBox)return;tagStatusBox.hidden=false;tagStatusBox.className=`entries-tag-status rfid-only ${ok?'is-ok':'is-bad'}`;tagStatusBox.innerHTML=`<span aria-hidden="true">${ok?'✓':'!'}</span>${escapeHTML(text)}`;};
  const handleTag=(uid,from,candidates=[uid])=>{
    // A USB reader may type the ID in another form: use the one that is bonded.
    uid=candidates.find(item=>birds?.some(bird=>bird.status==='active'&&bird.nfc_tag===item))||uid;
    const label=formatNfcUid(uid),by=from?` by ${from}`:'';
    if(!birds){entryForm.elements.nfc_tag.value=label;message(`NFC tag ${label} read${by}.`,'success');return;}
    const bird=birds.find(item=>item.status==='active'&&item.nfc_tag===uid);
    if(!bird){tagStatus(false,`Tag ${label} is not bonded to an active bird`);message(`RFID tag ${label} (read${by}) is not bonded to an active bird. Bond the bird on Band Assignments first.`,'error');return;}
    if(enteredInRace().has(bird.id)){tagStatus(false,`${bird.ring_number} is already entered in this race`);message(`${bird.ring_number} (${bird.bird_name}) is already entered in this race.`,'error');return;}
    tappedBirdId=bird.id;birdSelect.value=String(bird.id);
    entryForm.elements.member_id.value=String(bird.member_id);entryForm.elements.member_id.dispatchEvent(new Event('change'));
    showBird();tagStatus(true,`Tag read successfully: ${bird.ring_number} · ${bird.bird_name}`);
    message(`RFID tag ${label} read${by}: ${bird.ring_number} · ${bird.bird_name}.`,'success');
  };
  // A tag tapped while on Sticker entries: it is an RFID entry, so switch to
  // RFID entries first (the page works out which kind of entry it is).
  let switchTab=()=>{};
  const tabIsRegister=()=>!view.querySelector('[data-entry-pane="register"]').hidden;
  const tapFromReader=(uid,from,candidates)=>{if(entryForm.dataset.mode!=='rfid'&&birds){switchTab('rfid');message('RFID tag tapped: switched to RFID entries.','info');}handleTag(uid,from,candidates);};
  entryForm.elements.nfc_tag.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();const uid=normalizeNfcUid(entryForm.elements.nfc_tag.value);if(uid)handleTag(uid,'');else if(uid===null)message(NFC_HELP,'error');}});
  let stopEntryNfc=()=>{},nfcTimer=null,disposed=false;
  view.insertAdjacentHTML('beforeend',stickerScannerDialogHtml());const stopStickerScanner=bindStickerScanner(view,entryForm);
  // Only the reader chosen above fills the tag field.
  const readerChoice=()=>entryForm.querySelector('[name=nfc_read_with]:checked')?.value||'';
  const READER_KEY='avilonx.reader',readerHint=view.querySelector('[data-reader-choice-hint]');
  const READER_HINTS={wireless:'Tap the tag on the club admin\'s ESP8266 wireless reader. It is read by itself.',wired:'Tap the tag on the USB reader plugged into this computer.',phone:'Press the NFC button in the RFID field, then hold the tag to the back of the Android phone (Chrome).'};
  const applyReaderChoice=()=>{const choice=readerChoice();const usbLine=view.querySelector('[data-usb-status]');if(usbLine){usbLine.hidden=choice!=='wired';if(choice==='wired'&&!usbLine.textContent){usbLine.className='small usb-reader-status';usbLine.textContent='USB reader: waiting for a tap. What it types will show here.';}}readerHint.textContent=(READER_HINTS[choice]||'Choose the reader, then tap the pigeon\'s RFID tag. Only that reader is used.')+(birds&&choice?' Tapping a bonded bird\'s tag selects that bird.':'');if(choice==='wired'||!choice)readerHint.insertAdjacentHTML('beforeend',` ACR122U on a Windows laptop? <a href="${pageUrl('tools/nfc-reader/acr122u-avilonx-helper.zip')}" download><strong>Download the ACR122U helper</strong></a> and install it once (it starts with Windows).`);if(tapButton)tapButton.hidden=choice!=='phone';try{if(choice)localStorage.setItem(READER_KEY,choice);}catch{/* storage unavailable */}};
  try{const saved=localStorage.getItem(READER_KEY);const radio=saved&&entryForm.querySelector(`[name=nfc_read_with][value="${saved}"]`);if(radio)radio.checked=true;}catch{/* storage unavailable */}
  entryForm.querySelectorAll('[name=nfc_read_with]').forEach(radio=>radio.addEventListener('change',applyReaderChoice));applyReaderChoice();
  const usbStatus=view.querySelector('[data-usb-status]');
  const stopReaderKeys=listenForReaderKeys((uid,info)=>{if(readerChoice()!=='wired'||!tabIsRegister())return false;tapFromReader(uid,'the USB reader',info.candidates);},{takeFromTextFields:true,helper:()=>readerChoice()==='wired'&&tabIsRegister(),onBurst:burst=>{if(readerChoice()==='wired'){usbStatus.hidden=false;usbReaderStatus(usbStatus)(burst);}}});
  const stopDeviceScans=listenForDeviceScans((uid,reader)=>{if(readerChoice()!=='wireless'||!tabIsRegister())return;tapFromReader(uid,reader);});
  setPageCleanup(()=>{disposed=true;stopEntryNfc();clearTimeout(nfcTimer);stopStickerScanner();stopReaderKeys();stopDeviceScans();});
  if(tapButton)tapButton.onclick=async()=>{tapButton.disabled=true;message('Hold the pigeon\'s NFC tag against the back of the phone…','info');let stop=()=>{};try{stop=await startPhoneNfc(uid=>{stop();tapButton.disabled=false;handleTag(uid,'the phone');},error=>message(error.message,'error'));stopEntryNfc=stop;if(disposed){stop();return;}nfcTimer=setTimeout(()=>{if(tapButton.disabled){stop();tapButton.disabled=false;}},30000);}catch(error){tapButton.disabled=false;message(error.message,'error');}};
  mountEntrySheetImport(view,races,members,entries,readerByMember,birds,remarkOptions,stickerRule);
  view.querySelector('#entry-race').addEventListener('change',()=>showLastRace());
  entryForm.addEventListener('entry-mode',()=>showLastRace());
  // More options: show the current choices in its heading.
  const moreSummary=view.querySelector('[data-more-summary]');
  const showMore=()=>{if(moreSummary)moreSummary.textContent=`(${entryForm.elements.category.value} · ${entryForm.elements.race_type.value} · ${entryForm.elements.pooling.value==='1'?'pooling':'no pooling'})`;};
  ['category','race_type','pooling'].forEach(name=>entryForm.elements[name].addEventListener('change',showMore));showMore();
  view.querySelector('#entry-race').addEventListener('change',event=>{try{sessionStorage.setItem(RACE_KEY,event.target.value);}catch{/* storage unavailable */}});
  const tabs=view.querySelector('[data-entry-tabs]'),tabButtons=[...view.querySelectorAll('[data-entry-tab]')];
  const ENTRY_TAB_KEY='avilonx.entries.tab',form=view.querySelector('#entry-form');
  const showTab=tab=>{
    const register=tab==='rfid'||tab==='sticker';
    tabs.dataset.tab=register?'register':tab;tabButtons.forEach(button=>button.setAttribute('aria-selected',String(button.dataset.entryTab===tab)));
    view.querySelector('[data-entry-pane="register"]').hidden=!register;view.querySelector('[data-entry-pane="import"]').hidden=register;
    if(register&&form.dataset.mode!==tab){form.dataset.mode=tab;form.dispatchEvent(new CustomEvent('entry-mode'));}
    if(register)try{localStorage.setItem(ENTRY_TAB_KEY,tab);}catch{/* storage unavailable */}
  };
  try{const saved=localStorage.getItem(ENTRY_TAB_KEY);if(saved==='sticker')showTab('sticker');}catch{/* storage unavailable */}
  tabButtons.forEach(button=>button.onclick=()=>showTab(button.dataset.entryTab));
  switchTab=showTab;
}

// Kept for other pages and tests that import these from this file.
export { sheetRemarks, sheetMember, sheetBird } from './sheet-parse.js';
export { detectTableGrid, entrySheetRowsFromGrid, entrySheetRowsFromOCR, documentGridRules, rotateDocumentCanvas, documentFileToCanvas, loadDocumentOCR } from './sheet-reader.js';
