import { supabase, message, escapeHTML, formatDate, formatDateSeconds, number } from '../../../assets/js/shared.js';
import { normalizeNfcUid, formatNfcUid, phoneNfcSupported, startPhoneNfc, NFC_HELP, isIos, nfcSetupGuideHtml, listenForReaderKeys } from '../../../assets/js/nfc.js';
import { createRadarScan } from '../../../assets/js/radar-scan.js';

export async function render(view,identity,setPageCleanup) {
 const memberId=identity.profile.member_id;if(!memberId)throw new Error('This account is missing its member record.');
 const [{data:races,error:a},{data:entries,error:b}]=await Promise.all([supabase.from('races').select('id,name,release_location,status,release_at_utc').eq('status','open').order('id',{ascending:false}),supabase.from('race_entries').select('id,race_id,pigeon_ring').eq('member_id',memberId)]);if(a||b)throw a||b;
 const eligible=races.filter(r=>entries.some(e=>e.race_id===r.id));
 let readers=[];try{const {data}=await supabase.rpc('member_list_rfid_devices');readers=data||[];}catch{/* rfid-devices.sql not run yet */}
 // Every way this member can clock. The first to reach AvilonX is the pigeon's receipt.
 const ways=[...(readers.length?[`<li><strong>Loft RFID reader</strong> (${readers.map(reader=>escapeHTML(reader.name)).join(', ')}): tap the pigeon's tag. Works offline; it uses the time of the tap.</li>`]:[]),'<li><strong>Android phone</strong>: press Start phone NFC below and hold the tag to the back of the phone.</li>','<li><strong>Sticker</strong>: scratch it and scan or type the hidden code below.</li>'];
 const waysHtml=`<section class="panel narrow clock-ways"><h3>Ways to clock</h3><ul class="reader-steps">${ways.join('')}</ul><p class="small">Use any of them. Whichever reaches AvilonX first is the pigeon's receipt; a later one is not used. The phone and sticker use the time they reach AvilonX.</p></section>`;
 view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">MEMBER CLOCKING</span><h2>Record your pigeon</h2><p>Tap your pigeon's NFC tag, or scratch its sticker and enter the hidden code.</p></div></div>${waysHtml}<section class="panel narrow nfc-clock-panel"><h3>Clock with NFC tag</h3><div class="callout"><span class="callout-icon">◉</span><span>${phoneNfcSupported()?'Press Start, then hold each arriving pigeon\'s tag against the back of this phone, or tap it on your USB NFC reader. Each tap is sent straight away.':isIos()?'On iPhone: unlock it, hold its top edge near the pigeon\'s tag and tap the notification. This page opens and clocks the pigeon. You can also use a USB NFC reader below.':'Click in the NFC reader field below, then tap each arriving pigeon\'s tag on your USB NFC reader. Each tap is sent straight away.'}</span></div><div class="form-grid"><label class="field"><span>Race</span><select data-nfc-race><option value="">Any open race I'm entered in</option>${eligible.map(r=>`<option value="${r.id}">${escapeHTML(r.name)} · ${escapeHTML(r.release_location)}</option>`).join('')}</select></label><div class="form-actions"><button class="button primary radar-open" type="button" data-radar-open><span aria-hidden="true">📡</span> Start scanning</button>${phoneNfcSupported()?'<button class="button secondary" type="button" data-nfc-start aria-pressed="false">Start phone NFC</button>':''}</div><label class="field"><span>USB NFC reader</span><input data-nfc-input maxlength="40" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" placeholder="Click here, then tap the tag on the reader"><small class="small">The reader types the tag ID and presses Enter; the clocking is sent automatically. With a keyboard-type reader connected (also on Android or iPhone), you can just tap tags without tapping this field first. ACR122U on a Windows laptop with the AvilonX helper: nothing is typed here; each tap is clocked directly.</small></label></div><p class="nfc-status" data-nfc-status aria-live="polite" hidden></p><ol class="nfc-log" data-nfc-log></ol>${nfcSetupGuideHtml()}</section><section class="panel narrow"><h3>Clock with sticker scratch code</h3><div class="callout"><span class="callout-icon">◷</span><span>The receipt time comes from Supabase when your submission reaches the server. Clockings are provisional.</span></div><form id="member-clock-form" class="form-grid"><label class="field"><span>Open race</span><select name="race_id" required><option value="">Choose a race</option>${eligible.map(r=>`<option value="${r.id}">${escapeHTML(r.name)} · ${escapeHTML(r.release_location)}</option>`).join('')}</select></label><div class="field barcode-field"><label for="member-barcode">Scratch code</label><div class="barcode-entry"><input id="member-barcode" name="barcode" required maxlength="120" autocomplete="off" autocapitalize="none" autocorrect="off" inputmode="text" placeholder="Scan or type the code under the scratch area"><button class="barcode-scan-button" id="camera-button" type="button" aria-label="Scan scratch code with camera" title="Scan scratch code" aria-controls="camera-dialog"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 12h8M10 9v6M14 9v6"/></svg></button></div></div><div class="form-actions"><button class="button primary">Submit clocking</button></div></form></section><dialog class="scanner-dialog scanner-camera-dialog" id="camera-dialog" aria-label="Barcode camera scanner"><div class="scanner-dialog-content"><div class="scanner-preview"><div class="scanner-placeholder" id="camera-placeholder"><span class="scanner-placeholder-mark" aria-hidden="true">⌗</span><span>Camera preview will appear here.</span></div><video id="camera" playsinline autoplay muted hidden aria-label="Live barcode scanner preview"></video><div class="scanner-top-controls"><button class="scanner-close-button" type="button" data-close-camera aria-label="Close scanner">×</button><span class="scanner-live-indicator"><span></span>Scan barcode</span></div><div class="scanner-viewfinder" aria-hidden="true"><span class="scanner-corner top-left"></span><span class="scanner-corner top-right"></span><span class="scanner-corner bottom-left"></span><span class="scanner-corner bottom-right"></span></div><div class="scanner-bottom-controls"><p class="barcode-scan-status" id="camera-status" aria-live="polite" aria-atomic="true" hidden></p><button class="scanner-flash-button" type="button" data-camera-flash aria-label="Flashlight unavailable" title="Flashlight unavailable" aria-pressed="false" disabled><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 3h8l1 6-3 3v8a2 2 0 0 1-4 0v-8L7 9l1-6Z"/><path d="M9 7h6M12 15v3"/></svg></button></div></div></div></dialog><dialog class="clock-receipt-dialog" data-receipt-dialog aria-labelledby="clock-receipt-title"><div class="clock-receipt"><h3 id="clock-receipt-title" data-receipt-title>Clocked</h3><p class="small" data-receipt-subtitle></p><dl class="clock-receipt-list" data-receipt-list></dl><div class="form-actions"><button class="button primary" type="button" data-receipt-close>OK</button></div></div></dialog>`;
 // Pop-up after clocking: release point, release date and time, distance,
 // flying time and speed, as worked out by the server.
 const receiptDialog=view.querySelector('[data-receipt-dialog]');
 const flyingTime=seconds=>{if(seconds==null)return '—';const s=Math.round(Number(seconds)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),sec=s%60;return `${h} h ${String(m).padStart(2,'0')} min ${String(sec).padStart(2,'0')} s`;};
 const showReceipt=data=>{
  if(!data||!receiptDialog)return;
  // Tell the result watcher this receipt was already shown here.
  if(data.receipt_id)window.dispatchEvent(new CustomEvent('avilonx:receipt-shown',{detail:{id:data.receipt_id}}));
  // While scanning, the radar's card shows the result instead.
  if(document.documentElement.classList.contains('radar-is-open'))return;
  const accepted=data.status==='accepted';
  receiptDialog.querySelector('[data-receipt-title]').textContent=accepted?'Pigeon clocked':'Already clocked';
  receiptDialog.querySelector('[data-receipt-subtitle]').textContent=accepted?'Provisional until verified by the club.':'This pigeon already had a receipt; here are its details.';
  const distance=data.distance_m==null?'—':`${number(Number(data.distance_m)/1000)} km (${number(data.distance_m)} m)`;
  const speed=data.speed_m_per_min==null?'—':`${number(data.speed_m_per_min)} m/min`;
  const rows=[['Race',data.race],['Pigeon ring',data.pigeon_ring],['Release point',data.release_location],['Release date & time',formatDateSeconds(data.release_at_utc)],['Arrival time',formatDateSeconds(data.received_at_utc)],['Flying time',flyingTime(data.flight_seconds)],['Distance',distance],['Speed',speed]];
  receiptDialog.querySelector('[data-receipt-list]').innerHTML=rows.map(([label,value])=>`<dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value??'—')}</dd>`).join('');
  if(receiptDialog.open)receiptDialog.close();receiptDialog.showModal();receiptDialog.querySelector('[data-receipt-close]').focus();
 };
 receiptDialog?.querySelector('[data-receipt-close]').addEventListener('click',()=>receiptDialog.close());
 receiptDialog?.addEventListener('click',event=>{if(event.target===receiptDialog)receiptDialog.close();});
 view.querySelector('#member-clock-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;const {data,error}=await supabase.rpc('submit_member_clock',{p_race_id:Number(f.race_id.value),p_barcode:f.barcode.value.trim()});if(error){message(error.message,'error');return;}const ok=data?.status==='accepted'||data?.status==='duplicate';message(data?.message||'Clocking received.',data?.status==='accepted'?'success':ok?'info':'error');if(ok){f.reset();showReceipt(data);}else f.barcode.select();};
 const camera=view.querySelector('#camera'),status=view.querySelector('#camera-status'),cameraButton=view.querySelector('#camera-button'),cameraDialog=view.querySelector('#camera-dialog'),cameraPlaceholder=view.querySelector('#camera-placeholder'),cameraFlash=view.querySelector('[data-camera-flash]'),barcode=view.querySelector('[name="barcode"]');
 let scannerControls=null,scannerActive=false,scannerStarting=false,scannerSession=0,cameraTrack=null,torchActive=false;
 const setStatus=text=>{status.textContent=text;status.hidden=!text;};
 const resetFlash=()=>{cameraTrack=null;torchActive=false;cameraFlash.disabled=true;cameraFlash.classList.remove('is-on');cameraFlash.setAttribute('aria-pressed','false');cameraFlash.setAttribute('aria-label','Flashlight unavailable');cameraFlash.title='Flashlight unavailable on this camera';};
 const stopCamera=(statusText='Camera stopped.')=>{
  scannerSession++;scannerActive=false;scannerStarting=false;scannerControls?.stop();scannerControls=null;
  camera.pause();camera.srcObject?.getTracks().forEach(track=>track.stop());camera.srcObject=null;camera.hidden=true;cameraPlaceholder.hidden=false;cameraButton.disabled=false;cameraButton.removeAttribute('aria-busy');resetFlash();if(cameraDialog.open)cameraDialog.close();setStatus(statusText);
 };
 const acceptBarcode=(value,controls)=>{
  const code=String(value||'').trim();if(!code||!scannerActive)return;
  scannerSession++;scannerActive=false;scannerStarting=false;const activeControls=controls||scannerControls;scannerControls=null;activeControls?.stop();
  camera.pause();camera.srcObject?.getTracks().forEach(track=>track.stop());camera.srcObject=null;camera.hidden=true;cameraPlaceholder.hidden=false;cameraButton.disabled=false;cameraButton.removeAttribute('aria-busy');resetFlash();if(cameraDialog.open)cameraDialog.close();
  barcode.value=code;barcode.focus();message('Code captured. Confirm the race and submit the clocking.','info');
 };
 const cameraError=(error)=>{
  if(!window.isSecureContext)return 'Camera access needs a secure HTTPS page. Open this site using its HTTPS address.';
  if(!navigator.mediaDevices?.getUserMedia)return 'This browser does not provide camera access. Update the browser or type the barcode manually.';
  if(error?.name==='NotAllowedError'||error?.name==='PermissionDeniedError')return 'Camera permission was blocked. Allow camera access in your browser settings, then try again.';
  if(error?.name==='NotFoundError'||error?.name==='DevicesNotFoundError')return 'No camera was found on this device.';
  if(error?.name==='NotReadableError'||error?.name==='TrackStartError')return 'The camera is busy in another app. Close it and try again.';
  if(error instanceof TypeError)return 'The barcode scanner could not load. Check your internet connection or type the barcode manually.';
  return 'Could not start the camera. Check permission and try again, or type the barcode manually.';
 };
 cameraButton.onclick=async()=>{
  if(scannerActive||scannerStarting)return;
  cameraDialog.showModal();cameraPlaceholder.querySelector('span:last-child').textContent='Waiting for camera access…';setStatus('Starting camera…');
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){cameraPlaceholder.querySelector('span:last-child').textContent='Camera access requires a secure HTTPS page.';setStatus(cameraError());return;}
  const session=++scannerSession;scannerStarting=true;cameraButton.setAttribute('aria-busy','true');setStatus('Allow camera access to scan the barcode.');
  let cameraStream=null;
  try{
   cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
   if(session!==scannerSession){cameraStream.getTracks().forEach(track=>track.stop());return;}
   cameraTrack=cameraStream.getVideoTracks()[0]||null;let torchAvailable=false;try{torchAvailable=Boolean(cameraTrack?.getCapabilities?.().torch);}catch{}
   cameraFlash.disabled=!torchAvailable;cameraFlash.setAttribute('aria-label',torchAvailable?'Turn flashlight on':'Flashlight unavailable');cameraFlash.title=torchAvailable?'Turn flashlight on':'Flashlight unavailable on this camera';
   camera.srcObject=cameraStream;camera.hidden=false;cameraPlaceholder.hidden=true;camera.play().catch(()=>{});
   setStatus('Loading scanner…');
   const {BrowserMultiFormatReader}=await import('https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm');
   if(session!==scannerSession){cameraStream.getTracks().forEach(track=>track.stop());return;}
   const reader=new BrowserMultiFormatReader();
   scannerActive=true;setStatus('Camera on. Hold the barcode steady in the frame.');
   const controls=await reader.decodeFromStream(cameraStream,camera,(result,_error,scanControls)=>{
    if(result)acceptBarcode(result.getText(),scanControls);
   });
   if(session!==scannerSession||!scannerActive){controls?.stop();return;}
   scannerControls=controls;
   scannerStarting=false;cameraButton.disabled=false;cameraButton.removeAttribute('aria-busy');setStatus('Camera on. Hold the barcode steady in the frame.');
  }catch(error){
   if(session!==scannerSession)return;
   scannerActive=false;scannerStarting=false;scannerControls?.stop();scannerControls=null;camera.pause();cameraStream?.getTracks().forEach(track=>track.stop());camera.srcObject?.getTracks().forEach(track=>track.stop());camera.srcObject=null;camera.hidden=true;cameraPlaceholder.hidden=false;cameraPlaceholder.querySelector('span:last-child').textContent='Camera preview is unavailable.';cameraButton.disabled=false;cameraButton.removeAttribute('aria-busy');resetFlash();setStatus(cameraError(error));console.error('Camera scanner could not start:',error);
  }
 };
 cameraFlash.onclick=async()=>{
  if(!cameraTrack||cameraFlash.disabled)return;
  const nextState=!torchActive;
  try{await cameraTrack.applyConstraints({advanced:[{torch:nextState}]});torchActive=nextState;cameraFlash.classList.toggle('is-on',torchActive);cameraFlash.setAttribute('aria-pressed',String(torchActive));cameraFlash.setAttribute('aria-label',torchActive?'Turn flashlight off':'Turn flashlight on');cameraFlash.title=torchActive?'Turn flashlight off':'Turn flashlight on';setStatus(torchActive?'Flashlight on.':'Flashlight off.');}
  catch(error){setStatus('The flashlight is unavailable on this camera.');console.warn('Could not toggle camera flashlight:',error);}
 };
 view.querySelectorAll('[data-close-camera],[data-cancel-camera]').forEach(button=>button.addEventListener('click',()=>stopCamera()));
 cameraDialog.addEventListener('cancel',event=>{event.preventDefault();stopCamera();});
 cameraDialog.addEventListener('click',event=>{if(event.target===cameraDialog)stopCamera();});
 const releaseCameraOnPageHide=()=>stopCamera('Camera stopped.');
 const onVisibilityChange=()=>{if(document.hidden&&(scannerActive||scannerStarting))releaseCameraOnPageHide();};
 document.addEventListener('visibilitychange',onVisibilityChange);
 window.addEventListener('pagehide',releaseCameraOnPageHide);
 // NFC clocking: phone (Web NFC) or USB reader in keyboard mode.
 const nfcRace=view.querySelector('[data-nfc-race]'),nfcStart=view.querySelector('[data-nfc-start]'),nfcInput=view.querySelector('[data-nfc-input]'),nfcStatus=view.querySelector('[data-nfc-status]'),nfcLog=view.querySelector('[data-nfc-log]');
 let stopNfc=null;const pending=new Set();
 const nfcSay=(text,kind='info')=>{nfcStatus.textContent=text;nfcStatus.className=`nfc-status notice ${kind}`;nfcStatus.hidden=!text;};
 const logNfc=(text,kind)=>{const item=document.createElement('li');item.className=`nfc-log-item ${kind}`;item.textContent=text;nfcLog.prepend(item);while(nfcLog.children.length>20)nfcLog.lastElementChild.remove();};
 // Start scanning: the full-screen radar shows each tag as it is clocked.
 const radar=createRadarScan({title:'Scanning',raceLabel:()=>nfcRace.selectedOptions[0]?.textContent||'',phoneButton:nfcStart});
 view.querySelector('[data-radar-open]').onclick=()=>radar.open();
 const clockTag=async uid=>{
  if(pending.has(uid))return;pending.add(uid);nfcSay(`Sending tag ${formatNfcUid(uid)}…`);
  try{
   const {data,error}=await supabase.rpc('submit_member_nfc_clock',{p_tag:uid,p_race_id:nfcRace.value?Number(nfcRace.value):null});
   if(error){const text=error.code==='PGRST202'?'NFC clocking is not set up yet. Ask your club to run nfc-tags.sql.':error.message;nfcSay(text,'error');logNfc(`${formatNfcUid(uid)} · ${text}`,'error');if(radar.isOpen())radar.report({kind:'error',ring:formatNfcUid(uid),detail:text});else navigator.vibrate?.([80,60,80]);return;}
   radar.report({kind:data.status==='accepted'?'success':'info',ring:data.pigeon_ring||formatNfcUid(uid),detail:data.message||'',time:data.received_at_utc||null});
   const time=data.received_at_utc?` Received ${formatDate(data.received_at_utc)}.`:'';
   nfcSay(`${data.message}${time}`,data.status==='accepted'?'success':'info');showReceipt(data);logNfc(`${data.pigeon_ring} · ${data.status==='accepted'?'Clocked':'Already clocked'}${data.received_at_utc?` at ${formatDate(data.received_at_utc)}`:''}`,data.status==='accepted'?'success':'info');navigator.vibrate?.(120);
  }catch(error){const text=error.message||'Could not send the clocking. Check your internet connection and tap again.';nfcSay(text,'error');radar.report({kind:'error',ring:formatNfcUid(uid),detail:text});}
  finally{pending.delete(uid);}
 };
 nfcInput.addEventListener('keydown',event=>{if(event.key!=='Enter')return;event.preventDefault();const uid=normalizeNfcUid(nfcInput.value);nfcInput.value='';if(uid)clockTag(uid);else if(uid===null)nfcSay(NFC_HELP,'error');});
 const endNfc=(text='Phone NFC stopped.')=>{stopNfc?.();stopNfc=null;if(nfcStart){nfcStart.textContent='Start phone NFC';nfcStart.setAttribute('aria-pressed','false');}if(text)nfcSay(text);};
 if(nfcStart)nfcStart.onclick=async()=>{
  if(stopNfc){endNfc();return;}
  nfcStart.disabled=true;
  try{stopNfc=await startPhoneNfc(clockTag,error=>nfcSay(error.message,'error'));nfcStart.textContent='Stop phone NFC';nfcStart.setAttribute('aria-pressed','true');nfcSay('Ready. Hold a tag against the back of the phone.');}
  catch(error){nfcSay(error.message,'error');}
  finally{nfcStart.disabled=false;}
 };
 const onNfcHidden=()=>{if(document.hidden&&stopNfc)endNfc('Phone NFC paused while the app was in the background. Press Start again.');};
 document.addEventListener('visibilitychange',onNfcHidden);
 // On a laptop or desktop, also take taps from the AvilonX ACR122U helper
 // (it sends tags to the page instead of typing them). Phones and Macs skip it.
 const desktopHelper=()=>!/Android|iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent);
 const stopReaderKeys=listenForReaderKeys(uid=>clockTag(uid),{helper:desktopHelper,onBurst:state=>radar.readerState(state)});
 // Opened from the link written on a tag (iPhone): clock that tag straight away,
 // then drop the tag from the address so a refresh does not send it again.
 const linkParams=new URLSearchParams(location.search);
 if(linkParams.has('nfc')){
  const linkUid=normalizeNfcUid(linkParams.get('nfc'));
  linkParams.delete('nfc');history.replaceState(history.state,'',location.pathname+(linkParams.toString()?`?${linkParams}`:'')+location.hash);
  view.querySelector('.nfc-clock-panel')?.scrollIntoView({block:'start'});
  if(linkUid)clockTag(linkUid);else nfcSay('This tag link is not valid. Ask your club to rewrite the tag.','error');
 }
 setPageCleanup(()=>{radar.destroy();document.removeEventListener('visibilitychange',onVisibilityChange);document.removeEventListener('visibilitychange',onNfcHidden);stopReaderKeys();window.removeEventListener('pagehide',releaseCameraOnPageHide);stopCamera('');endNfc('');setPageCleanup(()=>{});});
}
