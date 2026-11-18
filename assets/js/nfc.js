// NFC tag helpers. Phones read tags with Web NFC (Chrome on Android only, over
// HTTPS). Elsewhere a USB NFC reader set to "keyboard" mode types the tag ID into
// a text field and presses Enter, which works in any browser.

import { pageUrl, supabase } from './shared.js';

// Download link for the Windows helper that makes an ACS ACR122U (or other PC/SC
// reader) type tag IDs like a keyboard.
export const readerHelperLink=()=>`<a href="${pageUrl('tools/nfc-reader/acr122u-keyboard.ps1')}" download>Download the ACR122U reader helper</a> (Windows: right-click it, Run with PowerShell).`;

export const NFC_HELP='That is not a valid NFC tag ID. Tag IDs are hex, for example 04:A2:3B:1C:5D:80:00. If your USB reader types only digits, set it to output the UID in hex (see the reader manual).';

// Same rules as public.normalize_nfc_uid(): uppercase hex with no separators.
// Returns '' when blank and null when the value is not a valid tag ID.
export function normalizeNfcUid(value){
  const uid=String(value??'').replace(/[\s:-]/g,'').toUpperCase();
  if(!uid)return '';
  return /^[0-9A-F]+$/.test(uid)&&[8,14,20].includes(uid.length)?uid:null;
}
export const formatNfcUid=uid=>String(uid||'').match(/.{1,2}/g)?.join(':')||'';

export const phoneNfcSupported=()=>'NDEFReader' in window&&window.isSecureContext;

// Starts listening for tags. Calls onTag(uid) for every tap until stop() is
// called. Must be started from a button click. Resolves to the stop function.
export async function startPhoneNfc(onTag,onError){
  if(!phoneNfcSupported())throw new Error('This browser cannot read NFC tags. Use Chrome on an Android phone, or a USB NFC reader.');
  const controller=new AbortController(),reader=new window.NDEFReader();
  let last='',lastAt=0;
  reader.onreading=event=>{
    const uid=normalizeNfcUid(event.serialNumber);
    if(!uid){onError?.(new Error('This tag has no readable ID. Use a different NFC tag.'));return;}
    // A tag held against the phone can be reported more than once.
    const now=Date.now();if(uid===last&&now-lastAt<2500)return;last=uid;lastAt=now;
    onTag(uid);
  };
  reader.onreadingerror=()=>onError?.(new Error('Could not read the tag. Hold it still against the back of the phone.'));
  try{await reader.scan({signal:controller.signal});}
  catch(error){
    if(error?.name==='NotAllowedError')throw new Error('NFC permission was blocked. Allow NFC for this site in Chrome settings, then try again.');
    if(error?.name==='NotSupportedError')throw new Error('NFC is off or not available. Turn on NFC in the phone settings, then try again.');
    throw error;
  }
  return()=>controller.abort();
}

// iPhones cannot read NFC tags from a web page (no browser on iOS supports Web
// NFC). They can open a web link stored on a tag: hold the iPhone to the tag and
// tap the notification. So each tag can carry a link to the member Clocking page
// with its own ID, which clocks that tag when it opens.
export const isIos=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
export const nfcClockingLink=uid=>new URL(pageUrl(`pages/member/clocking/index.html?nfc=${encodeURIComponent(uid)}`),location.href).href;

// Writes the clocking link onto the tag that is held to the phone (Android Chrome).
export async function writeNfcClockingLink(uid,{timeoutMs=10000}={}){
  if(!phoneNfcSupported())throw new Error('Writing tags needs Chrome on an Android phone.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{await new window.NDEFReader().write({records:[{recordType:'url',data:nfcClockingLink(uid)}]},{signal:controller.signal,overwrite:true});}
  catch(error){
    if(error?.name==='AbortError')throw new Error('The tag was moved away before the link was written. Hold it still and tap again.');
    if(error?.name==='NotAllowedError')throw new Error('NFC permission was blocked. Allow NFC for this site in Chrome settings.');
    throw new Error('Could not write the link to this tag. It may be locked or read-only.');
  }finally{clearTimeout(timer);}
}

// Step-by-step reader setup for each kind of device.
export const nfcSetupGuideHtml=()=>`<details class="nfc-setup"><summary>Reader setup help (Android, iPhone, USB)</summary><div class="nfc-setup-body">
<h4>Android phone</h4><ol><li>Turn on NFC in the phone settings.</li><li>Open this site in <strong>Chrome</strong> (https address).</li><li>Press <strong>Start phone NFC</strong> and hold the tag against the back of the phone.</li></ol>
<h4>iPhone (XS or newer)</h4><ol><li>The tag must carry its clocking link, or nothing happens when you tap it. The Super Admin writes it when registering the tag on an Android phone, or with an iPhone as below.</li><li>Unlock the iPhone and hold its <strong>top edge</strong> near the tag.</li><li>Tap the notification. The Clocking page opens and clocks the pigeon. Sign in first if asked.</li></ol><p class="small">iPhone browsers cannot read tags directly, so the Start phone NFC button does not appear on iPhone.</p>
<h4>Write a tag's link with an iPhone</h4><ol><li>Install the free <strong>NFC Tools</strong> app from the App Store.</li><li>In Safari open <strong>Register NFC</strong>, find the tag and tap <strong>Copy link</strong>.</li><li>In NFC Tools: <strong>Write → Add a record → URL / URI</strong>, paste the link, then <strong>Write</strong> and hold the iPhone's top edge to the tag.</li></ol><p class="small">Use NTAG213, NTAG215 or NTAG216 tags. iPhones cannot use MIFARE Classic tags (common key fobs): in NFC Tools tap <strong>Read</strong> to see a tag's type. Close the camera and Wallet before tapping.</p>
<h4>Phone or computer with an external NFC reader (Android, iPhone, Windows, Mac)</h4><ol><li>Use a reader that works as a <strong>keyboard</strong> (often sold as "keyboard emulation" or "HID" mode).</li><li>Connect it: <strong>Android</strong> with a USB-OTG adapter; <strong>iPhone or iPad</strong> with a USB-C adapter or a Lightning to USB camera adapter; or pair a <strong>Bluetooth</strong> reader as a keyboard in the phone's Bluetooth settings.</li><li>Open the NFC page and tap the tag on the reader. There is no need to tap the reader field first; the ID is sent automatically.</li><li>The reader must type the ID in <strong>hex</strong> (letters and numbers). If it types only digits, switch it to hex as its manual describes. To check a reader, open the Notes app and tap a tag: letters and numbers should appear.</li></ol>
<h4>ACS ACR122U (Windows only)</h4><ol><li>${readerHelperLink()}</li><li>Keep its window open, tap in the USB NFC reader field, then tap tags on the reader.</li></ol><p class="small">The ACR122U does not work on Android phones, iPhone, iPad or Mac: phone browsers cannot use this kind of reader. Use a keyboard-type reader on phones.</p>
</div></details>`;

// Keyboard-type NFC readers (USB, or Bluetooth paired as a keyboard) type the
// tag ID and press Enter, on computers and on Android and iPhone alike. This
// listens on the whole page so the reader works without tapping the reader field
// first, which on phones would also open the on-screen keyboard. Readers type far
// faster than a person, so only quick bursts ending in Enter count as a tag; when
// a text field has focus it is left to that field. Returns a stop function.
// External RFID readers (ESP8266 + RC522, see tools/rfid-reader) in Register
// mode send each tag to Supabase. This polls for tags read since the page
// opened and calls onTag(uid, readerName) for each one. Older taps are skipped.
// Stops quietly when rfid-devices.sql has not been run. Returns a stop function.
export function listenForDeviceScans(onTag,{intervalMs=1500}={}){
  let lastId=null,timer=null,stopped=false,busy=false;
  const poll=async()=>{
    if(stopped||busy||document.hidden)return;busy=true;
    try{
      const {data,error}=await supabase.rpc('rfid_recent_scans',{p_after_id:lastId});
      if(error){if(/rfid_recent_scans|function|permission/i.test(error.message||''))stop();return;}
      const rows=(data||[]).slice().sort((a,b)=>a.id-b.id);
      if(lastId===null){lastId=rows.length?rows[rows.length-1].id:0;return;}
      for(const row of rows){lastId=Math.max(lastId,row.id);const uid=normalizeNfcUid(row.tag_uid);if(uid&&!stopped)onTag(uid,row.device_name);}
    }catch{/* network hiccup: try again next time */}
    finally{busy=false;}
  };
  const stop=()=>{stopped=true;clearInterval(timer);};
  timer=setInterval(poll,intervalMs);poll();
  return stop;
}

export function listenForReaderKeys(onTag,{maxGapMs=60}={}){
  let buffer='',last=0;
  const editable=el=>el&&(el.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  const onKey=event=>{
    if(event.ctrlKey||event.metaKey||event.altKey||editable(document.activeElement))return;
    const now=performance.now();
    if(now-last>maxGapMs)buffer='';
    last=now;
    if(event.key==='Enter'){
      const uid=normalizeNfcUid(buffer);buffer='';
      if(uid){event.preventDefault();onTag(uid);}
      return;
    }
    if(event.key.length===1&&/[0-9a-fA-F:\- ]/.test(event.key))buffer+=event.key;
    else buffer='';
  };
  document.addEventListener('keydown',onKey,true);
  return()=>document.removeEventListener('keydown',onKey,true);
}
