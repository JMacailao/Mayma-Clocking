import { supabase, escapeHTML, message, formatDate, tableRows } from '../../../assets/js/shared.js';
import { normalizeNfcUid, formatNfcUid, phoneNfcSupported, startPhoneNfc, NFC_HELP, nfcClockingLink, writeNfcClockingLink, nfcSetupGuideHtml, listenForReaderKeys, listenForDeviceScans } from '../../../assets/js/nfc.js';

export async function render(view,setPageCleanup){
  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">SUPERADMIN · GLOBAL REGISTRY</span><h2>Register NFC</h2><p>Register NFC tags so any club can put them on race entries.</p></div></div><section class="panel narrow nfc-clock-panel"><div class="callout"><span class="callout-icon">◉</span><span>Tap tags one after another on your NFC reader. A keyboard-type reader (USB, or Bluetooth paired as a keyboard, on a computer or phone) works without tapping the reader field first. Each tag is registered as soon as it is read. Tags are global and are not assigned to a club or member. Clubs cannot use a tag until it is registered here.</span></div><div class="form-grid">${phoneNfcSupported()?'<label class="field sticker-registration-choice"><span>iPhone clocking</span><span class="sticker-registration-toggle"><input type="checkbox" data-nfc-write-link checked><span><strong>Also write the clocking link onto each tag</strong><small>Needed for iPhones: members hold the iPhone to the tag and tap the notification to clock. Hold each tag still until it says the link was written.</small></span></span></label><div class="form-actions"><button class="button secondary" type="button" data-nfc-start aria-pressed="false">Start phone NFC</button></div>':''}<label class="field"><span>USB NFC reader</span><input data-nfc-input maxlength="40" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" placeholder="Click here, then tap a tag on the reader"><small class="small">You can also type a tag ID, for example 04:A2:3B:1C:5D:80:00, and press Enter. A USB reader cannot write the iPhone link: use <strong>Copy link</strong> in the list below with an NFC writer app, or register on an Android phone.</small></label></div>${nfcSetupGuideHtml()}<p class="nfc-status" data-nfc-status aria-live="polite" hidden></p><ol class="nfc-log" data-nfc-log></ol></section><section class="panel"><div class="panel-heading"><div><h3>Registered NFC tags</h3><p class="small">Global tag IDs available to all clubs. Showing the latest 100.</p></div><span class="count-pill" data-nfc-count>Loading…</span></div><div data-nfc-table></div></section>`;
  const input=view.querySelector('[data-nfc-input]'),startButton=view.querySelector('[data-nfc-start]'),status=view.querySelector('[data-nfc-status]'),log=view.querySelector('[data-nfc-log]'),table=view.querySelector('[data-nfc-table]'),count=view.querySelector('[data-nfc-count]');
  const say=(text,kind='info')=>{status.textContent=text;status.className=`nfc-status notice ${kind}`;status.hidden=!text;};
  const addLog=(text,kind)=>{const item=document.createElement('li');item.className=`nfc-log-item ${kind}`;item.textContent=text;log.prepend(item);while(log.children.length>20)log.lastElementChild.remove();};
  const load=async()=>{
    const {data,error,count:total}=await supabase.from('nfc_tags').select('tag_uid,source,created_at',{count:'exact'}).order('created_at',{ascending:false}).limit(100);
    if(error){table.innerHTML=`<p class="notice error">${escapeHTML(error.message)}. Run nfc-tags.sql in your Supabase SQL Editor.</p>`;count.textContent='—';return;}
    count.textContent=`${(total||0).toLocaleString()} registered`;
    table.innerHTML=tableRows(data||[],[{key:'tag_uid',label:'Tag ID',render:r=>`<strong>${escapeHTML(formatNfcUid(r.tag_uid))}</strong>`},{key:'link',label:'iPhone link',render:r=>`<button class="text-button" type="button" data-copy-link="${escapeHTML(r.tag_uid)}">Copy link</button>`},{key:'source',label:'Registered via',render:r=>escapeHTML(r.source==='legacy'?'Existing race entry':'Reader or typed')},{key:'created_at',label:'Registered',render:r=>escapeHTML(formatDate(r.created_at))},{key:'delete',label:'Actions',render:r=>`<button class="text-button danger-text" type="button" data-delete-tag="${escapeHTML(r.tag_uid)}">Delete</button>`}],'No NFC tags have been registered yet.',false);
  };
  const pending=new Set();let reloadTimer=null;
  const writeLinkBox=view.querySelector('[data-nfc-write-link]');
  // Registers a tag. From an Android phone it can also write the iPhone clocking
  // link onto the tag while it is still held to the phone.
  const register=async(uid,{fromPhone=false}={})=>{
    if(pending.has(uid))return;pending.add(uid);
    try{
      const {error}=await supabase.rpc('superadmin_register_nfc_tag',{p_tag:uid});
      const alreadyRegistered=error?.code==='23505';
      if(error&&!alreadyRegistered){const text=error.code==='PGRST202'?'Run the updated nfc-tags.sql in the Supabase SQL Editor first.':error.message;say(`${formatNfcUid(uid)} · ${text}`,'error');addLog(`${formatNfcUid(uid)} · ${text}`,'error');return;}
      if(alreadyRegistered){say(`${formatNfcUid(uid)} · ${error.message}`,'info');addLog(`${formatNfcUid(uid)} · ${error.message}`,'info');}
      else{say(`${formatNfcUid(uid)} registered. Tap the next tag.`,'success');addLog(`${formatNfcUid(uid)} · Registered`,'success');navigator.vibrate?.(120);clearTimeout(reloadTimer);reloadTimer=setTimeout(load,600);}
      if(fromPhone&&writeLinkBox?.checked){
        say(`Writing the iPhone link to ${formatNfcUid(uid)}… keep the tag on the phone.`,'info');
        try{await writeNfcClockingLink(uid);say(`${formatNfcUid(uid)} ready: iPhone link written. Tap the next tag.`,'success');addLog(`${formatNfcUid(uid)} · iPhone link written`,'success');navigator.vibrate?.([60,40,60]);}
        catch(writeError){say(`${formatNfcUid(uid)} · ${writeError.message}`,'error');addLog(`${formatNfcUid(uid)} · iPhone link not written: ${writeError.message}`,'error');}
      }
    }catch(error){say(error.message||'Could not register the tag. Check your internet connection.','error');}
    finally{pending.delete(uid);}
  };
  table.addEventListener('click',async event=>{
    const deleteButton=event.target.closest('[data-delete-tag]');
    if(deleteButton){
      const uid=deleteButton.dataset.deleteTag;
      if(!window.confirm(`Delete NFC tag ${formatNfcUid(uid)} from the registry? Clubs will no longer be able to put it on race entries.`))return;
      deleteButton.disabled=true;deleteButton.textContent='Deleting…';
      const {error}=await supabase.rpc('superadmin_delete_nfc_tag',{p_tag:uid});
      if(error){deleteButton.disabled=false;deleteButton.textContent='Delete';message(error.code==='PGRST202'?'Run the updated nfc-tags.sql in the Supabase SQL Editor first.':error.message,'error');return;}
      message(`NFC tag ${formatNfcUid(uid)} deleted.`,'success');addLog(`${formatNfcUid(uid)} · Deleted`,'info');await load();return;
    }
    const button=event.target.closest('[data-copy-link]');if(!button)return;
    const link=nfcClockingLink(button.dataset.copyLink);
    try{await navigator.clipboard.writeText(link);message(`Copied the iPhone link for ${formatNfcUid(button.dataset.copyLink)}. Write it to the tag as a URL (web link) record with an NFC writer app.`,'success');}
    catch{window.prompt('Copy this link and write it to the tag as a URL record:',link);}
  });
  input.addEventListener('keydown',event=>{if(event.key!=='Enter')return;event.preventDefault();const uid=normalizeNfcUid(input.value);input.value='';if(uid)register(uid);else if(uid===null)say(NFC_HELP,'error');});
  let stopNfc=null;
  const endNfc=(text='Phone NFC stopped.')=>{stopNfc?.();stopNfc=null;if(startButton){startButton.textContent='Start phone NFC';startButton.setAttribute('aria-pressed','false');}if(text)say(text);};
  if(startButton)startButton.onclick=async()=>{
    if(stopNfc){endNfc();return;}
    startButton.disabled=true;
    try{stopNfc=await startPhoneNfc(uid=>register(uid,{fromPhone:true}),error=>say(error.message,'error'));startButton.textContent='Stop phone NFC';startButton.setAttribute('aria-pressed','true');say('Ready. Hold a tag against the back of the phone.');}
    catch(error){say(error.message,'error');}
    finally{startButton.disabled=false;}
  };
  const onHidden=()=>{if(document.hidden&&stopNfc)endNfc('Phone NFC paused while the app was in the background. Press Start again.');};
  document.addEventListener('visibilitychange',onHidden);
  const stopReaderKeys=listenForReaderKeys(uid=>register(uid),{helper:true});
  // Readers belong to clubs, so ask before registering a tag one of them read.
  const stopDeviceScans=listenForDeviceScans((uid,reader)=>{if(confirm(`Register NFC tag ${formatNfcUid(uid)}, read by the RFID reader "${reader}"?`))register(uid);});
  setPageCleanup(()=>{stopReaderKeys();stopDeviceScans();document.removeEventListener('visibilitychange',onHidden);clearTimeout(reloadTimer);endNfc('');});
  message('');
  await load();input.focus();
}
