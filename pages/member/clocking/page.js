import { supabase, message, pageUrl as url } from '../../../assets/js/shared.js';

export async function render(view,identity,setPageCleanup) {
 const memberId=identity.profile.member_id;if(!memberId)throw new Error('This account is missing its member record.');
 const [{data:races,error:a},{data:entries,error:b}]=await Promise.all([supabase.from('races').select('id,name,release_location,status,release_at_utc').eq('status','open').order('id',{ascending:false}),supabase.from('race_entries').select('id,race_id,pigeon_ring').eq('member_id',memberId)]);if(a||b)throw a||b;
 const eligible=races.filter(r=>entries.some(e=>e.race_id===r.id));
 view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">MEMBER CLOCKING</span><h2>Record your pigeon</h2><p>Scan the barcode on your registered race entry.</p></div></div><section class="panel narrow"><div class="callout"><span class="callout-icon">◷</span><span>The receipt time comes from Supabase when your submission reaches the server. Clockings are provisional.</span></div><form id="member-clock-form" class="form-grid"><label class="field"><span>Open race</span><select name="race_id" required><option value="">Choose a race</option>${eligible.map(r=>`<option value="${r.id}">${escapeHTML(r.name)} · ${escapeHTML(r.release_location)}</option>`).join('')}</select></label><div class="field barcode-field"><label for="member-barcode">Barcode</label><div class="barcode-entry"><input id="member-barcode" name="barcode" required maxlength="120" autocomplete="off" autocapitalize="none" autocorrect="off" inputmode="text" placeholder="Scan or type the registered code"><button class="barcode-scan-button" id="camera-button" type="button" aria-label="Open barcode camera" title="Scan barcode" aria-controls="camera-dialog"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 12h8M10 9v6M14 9v6"/></svg></button></div></div><div class="form-actions"><button class="button primary">Submit clocking</button></div></form></section><dialog class="scanner-dialog scanner-camera-dialog" id="camera-dialog" aria-label="Barcode camera scanner"><div class="scanner-dialog-content"><div class="scanner-preview"><div class="scanner-placeholder" id="camera-placeholder"><span class="scanner-placeholder-mark" aria-hidden="true">⌗</span><span>Camera preview will appear here.</span></div><video id="camera" playsinline autoplay muted hidden aria-label="Live barcode scanner preview"></video><div class="scanner-top-controls"><button class="scanner-close-button" type="button" data-close-camera aria-label="Close scanner">×</button><span class="scanner-live-indicator"><span></span>Scan barcode</span></div><div class="scanner-viewfinder" aria-hidden="true"><span class="scanner-corner top-left"></span><span class="scanner-corner top-right"></span><span class="scanner-corner bottom-left"></span><span class="scanner-corner bottom-right"></span></div><div class="scanner-bottom-controls"><p class="barcode-scan-status" id="camera-status" aria-live="polite" aria-atomic="true" hidden></p><button class="scanner-flash-button" type="button" data-camera-flash aria-label="Flashlight unavailable" title="Flashlight unavailable" aria-pressed="false" disabled><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 3h8l1 6-3 3v8a2 2 0 0 1-4 0v-8L7 9l1-6Z"/><path d="M9 7h6M12 15v3"/></svg></button></div></div></div></dialog>`;
 view.querySelector('#member-clock-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;const {data,error}=await supabase.rpc('submit_member_clock',{p_race_id:Number(f.race_id.value),p_barcode:f.barcode.value.trim()});if(error){message(error.message,'error');return;}message(data.message||'Clocking received.','success');f.reset();};
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
  barcode.value=code;barcode.focus();message('Barcode captured. Confirm the race and submit the clocking.','info');
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
 setPageCleanup(()=>{document.removeEventListener('visibilitychange',onVisibilityChange);window.removeEventListener('pagehide',releaseCameraOnPageHide);stopCamera('');setPageCleanup(()=>{});});
}
