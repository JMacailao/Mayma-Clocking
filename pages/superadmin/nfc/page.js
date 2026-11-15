import { supabase, escapeHTML, message, formatDate, tableRows } from '../../../assets/js/shared.js';
import { normalizeNfcUid, formatNfcUid, phoneNfcSupported, startPhoneNfc, NFC_HELP, readerHelperLink } from '../../../assets/js/nfc.js';

export async function render(view,setPageCleanup){
  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">SUPERADMIN · GLOBAL REGISTRY</span><h2>Register NFC</h2><p>Register NFC tags so any club can put them on race entries.</p></div></div><section class="panel narrow nfc-clock-panel"><div class="callout"><span class="callout-icon">◉</span><span>Click in the reader field, then tap tags one after another on your USB NFC reader. Each tag is registered as soon as it is read. Tags are global and are not assigned to a club or member. Clubs cannot use a tag until it is registered here.</span></div><div class="form-grid">${phoneNfcSupported()?'<div class="form-actions"><button class="button secondary" type="button" data-nfc-start aria-pressed="false">Start phone NFC</button></div>':''}<label class="field"><span>USB NFC reader</span><input data-nfc-input maxlength="40" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" placeholder="Click here, then tap a tag on the reader"><small class="small">You can also type a tag ID, for example 04:A2:3B:1C:5D:80:00, and press Enter. ${readerHelperLink()}</small></label></div><p class="nfc-status" data-nfc-status aria-live="polite" hidden></p><ol class="nfc-log" data-nfc-log></ol></section><section class="panel"><div class="panel-heading"><div><h3>Registered NFC tags</h3><p class="small">Global tag IDs available to all clubs. Showing the latest 100.</p></div><span class="count-pill" data-nfc-count>Loading…</span></div><div data-nfc-table></div></section>`;
  const input=view.querySelector('[data-nfc-input]'),startButton=view.querySelector('[data-nfc-start]'),status=view.querySelector('[data-nfc-status]'),log=view.querySelector('[data-nfc-log]'),table=view.querySelector('[data-nfc-table]'),count=view.querySelector('[data-nfc-count]');
  const say=(text,kind='info')=>{status.textContent=text;status.className=`nfc-status notice ${kind}`;status.hidden=!text;};
  const addLog=(text,kind)=>{const item=document.createElement('li');item.className=`nfc-log-item ${kind}`;item.textContent=text;log.prepend(item);while(log.children.length>20)log.lastElementChild.remove();};
  const load=async()=>{
    const {data,error,count:total}=await supabase.from('nfc_tags').select('tag_uid,source,created_at',{count:'exact'}).order('created_at',{ascending:false}).limit(100);
    if(error){table.innerHTML=`<p class="notice error">${escapeHTML(error.message)}. Run nfc-tags.sql in your Supabase SQL Editor.</p>`;count.textContent='—';return;}
    count.textContent=`${(total||0).toLocaleString()} registered`;
    table.innerHTML=tableRows(data||[],[{key:'tag_uid',label:'Tag ID',render:r=>`<strong>${escapeHTML(formatNfcUid(r.tag_uid))}</strong>`},{key:'source',label:'Registered via',render:r=>escapeHTML(r.source==='legacy'?'Existing race entry':'Reader or typed')},{key:'created_at',label:'Registered',render:r=>escapeHTML(formatDate(r.created_at))}],'No NFC tags have been registered yet.',false);
  };
  const pending=new Set();let reloadTimer=null;
  const register=async uid=>{
    if(pending.has(uid))return;pending.add(uid);
    try{
      const {error}=await supabase.rpc('superadmin_register_nfc_tag',{p_tag:uid});
      if(error){const text=error.code==='PGRST202'?'Run the updated nfc-tags.sql in the Supabase SQL Editor first.':error.message;say(`${formatNfcUid(uid)} · ${text}`,error.code==='23505'?'info':'error');addLog(`${formatNfcUid(uid)} · ${text}`,error.code==='23505'?'info':'error');return;}
      say(`${formatNfcUid(uid)} registered. Tap the next tag.`,'success');addLog(`${formatNfcUid(uid)} · Registered`,'success');navigator.vibrate?.(120);
      clearTimeout(reloadTimer);reloadTimer=setTimeout(load,600);
    }catch(error){say(error.message||'Could not register the tag. Check your internet connection.','error');}
    finally{pending.delete(uid);}
  };
  input.addEventListener('keydown',event=>{if(event.key!=='Enter')return;event.preventDefault();const uid=normalizeNfcUid(input.value);input.value='';if(uid)register(uid);else if(uid===null)say(NFC_HELP,'error');});
  let stopNfc=null;
  const endNfc=(text='Phone NFC stopped.')=>{stopNfc?.();stopNfc=null;if(startButton){startButton.textContent='Start phone NFC';startButton.setAttribute('aria-pressed','false');}if(text)say(text);};
  if(startButton)startButton.onclick=async()=>{
    if(stopNfc){endNfc();return;}
    startButton.disabled=true;
    try{stopNfc=await startPhoneNfc(register,error=>say(error.message,'error'));startButton.textContent='Stop phone NFC';startButton.setAttribute('aria-pressed','true');say('Ready. Hold a tag against the back of the phone.');}
    catch(error){say(error.message,'error');}
    finally{startButton.disabled=false;}
  };
  const onHidden=()=>{if(document.hidden&&stopNfc)endNfc('Phone NFC paused while the app was in the background. Press Start again.');};
  document.addEventListener('visibilitychange',onHidden);
  setPageCleanup(()=>{document.removeEventListener('visibilitychange',onHidden);clearTimeout(reloadTimer);endNfc('');});
  message('');
  await load();input.focus();
}
