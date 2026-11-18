// NFC tag helpers. Phones read tags with Web NFC (Chrome on Android only, over
// HTTPS). Elsewhere a USB NFC reader set to "keyboard" mode types the tag ID into
// a text field and presses Enter, which works in any browser.

import { pageUrl, supabase } from './shared.js';

// Download link for the Windows helper that makes an ACS ACR122U (or other PC/SC
// reader) type tag IDs like a keyboard.
export const readerHelperUrl=()=>pageUrl('tools/nfc-reader/acr122u-avilonx-helper.zip');
export const readerHelperLink=()=>`<a href="${readerHelperUrl()}" download>Download the ACR122U helper</a> (Windows: unzip it, double-click <strong>Start ACR122U for AvilonX</strong>, keep its window open, then choose Wired).`;

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
<h4>ACS ACR122U (Windows only)</h4><ol><li>${readerHelperLink()}</li><li>Keep its window open, choose <strong>Wired</strong> as the reader, then tap tags on the ACR122U. Nothing to register. If the browser asks to allow access to devices on your network, choose Allow.</li></ol><p class="small">The ACR122U does not work on Android phones, iPhone, iPad or Mac: phone browsers cannot use this kind of reader. Use a keyboard-type reader on phones.</p>
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

// Tag IDs a USB reader may mean by what it typed. Readers differ: most type
// the ID in hex (sometimes with the bytes reversed), some type it as a decimal
// number (8 to 10 digits for a 4-byte tag). The first candidate is the usual
// form (the one phones and the ESP8266 reader send).
const reverseBytes=hex=>hex.match(/../g).reverse().join('');
export function uidCandidates(text){
  const raw=String(text??'').replace(/[\s:-]/g,'');
  const out=[];
  const add=hex=>{const uid=normalizeNfcUid(hex);if(uid&&!out.includes(uid))out.push(uid);};
  if(/^\d{8,10}$/.test(raw)&&Number(raw)<=0xFFFFFFFF){const hex=Number(raw).toString(16).toUpperCase().padStart(8,'0');add(hex);add(reverseBytes(hex));}
  const hex=normalizeNfcUid(raw);if(hex){add(hex);add(reverseBytes(hex));}
  return out;
}

// Listens for keyboard-type (USB or Bluetooth) RFID readers. A reader types the
// tag ID much faster than a person and ends with Enter or Tab, or just stops.
// Radio buttons, dropdowns, checkboxes, buttons and read-only fields with focus
// do not block it. With takeFromTextFields, a reader burst that lands in a text
// field is taken back out and used as the tag. onTag(uid, {candidates, raw})
// can return false to leave the keys alone (another reader chosen). onBurst
// ({raw, uid, ended}) reports every fast burst, valid or not, for a status line.
// The ACR122U helper (tools/nfc-reader) runs on the same computer and shares
// each tap at this address. The page asks it for new taps while wanted, so a
// laptop reader works with nothing to register and whatever window is in front.
const LOCAL_HELPER='http://127.0.0.1:47321/tag';
function pollLocalHelper(onUid,isWanted,onState){
  let stopped=false,timer=null,seq=null,state='';
  const report=(next,extra={})=>{if(state!==next){state=next;onState?.({helper:next,...extra});}};
  const tick=async()=>{
    if(stopped)return;
    let delay=3000;
    if(isWanted()){
      try{
        const response=await fetch(`${LOCAL_HELPER}?after=${seq??''}`,{cache:'no-store'});
        const data=await response.json();
        report('connected',{reader:data.reader||''});
        if(seq===null||data.seq<seq)seq=data.seq;
        else{for(const tag of data.tags||[])if(tag.seq>seq&&!stopped)onUid(String(tag.uid));seq=data.seq;}
        delay=350;
      }catch{report('missing');}
    }else{state='';seq=null;}
    if(!stopped)timer=setTimeout(tick,delay);
  };
  tick();
  return()=>{stopped=true;clearTimeout(timer);};
}

export function listenForReaderKeys(onTag,{maxGapMs=100,takeFromTextFields=false,onBurst=null,helper=null}={}){
  let buffer='',last=0,start=null,idleTimer=null;
  const TEXT_TYPES=/^(text|search|number|email|tel|url|password)$/i;
  const isTextField=el=>Boolean(el)&&(el.isContentEditable||el.tagName==='TEXTAREA'||(el.tagName==='INPUT'&&TEXT_TYPES.test(el.type||'text')&&!el.readOnly));
  const finish=(event,ended)=>{
    clearTimeout(idleTimer);
    const raw=buffer,from=start;buffer='';start=null;
    // A burst of only digits typed into a text field is a number for that field
    // (for example a sticker from a USB barcode scanner), not an RFID tag.
    if(from&&isTextField(from.el)&&/^\d+$/.test(raw.replace(/[\s:-]/g,'')))return;
    const candidates=uidCandidates(raw),uid=candidates[0]||null;
    if(raw.length>=4)onBurst?.({raw,uid,ended});
    if(!uid)return;
    // A dropdown the reader typed into jumped to other options: put it back.
    if(from?.el?.tagName==='SELECT'&&from.el.value!==from.value)from.el.value=from.value;
    // Take the reader's characters out of the text field first, so onTag can
    // fill that field itself; put them back if onTag leaves the tag alone.
    const field=from&&isTextField(from.el)?from.el:null,typed=field?field.value:null;
    if(field&&typed!==from.value)field.value=from.value;
    if(onTag(uid,{candidates,raw})===false){if(field)field.value=typed;return;}
    if(event){event.preventDefault();event.stopPropagation();}
  };
  const onKey=event=>{
    if(event.ctrlKey||event.metaKey||event.altKey)return;
    const active=document.activeElement;
    if(isTextField(active)&&!takeFromTextFields)return;
    const now=performance.now();
    if(now-last>maxGapMs){buffer='';start=null;clearTimeout(idleTimer);}
    last=now;
    if(event.key==='Enter'||event.key==='Tab'){if(buffer)finish(event,event.key);return;}
    if(event.key.length===1&&/[0-9a-fA-F:\- ]/.test(event.key)){
      if(!buffer)start={el:active,value:active&&'value' in active?active.value:null};
      buffer+=event.key;
      // Some readers send no Enter: a burst that simply stops counts too.
      clearTimeout(idleTimer);
      if(buffer.replace(/[\s:-]/g,'').length>=8)idleTimer=setTimeout(()=>{if(buffer)finish(null,'');},350);
    }else{buffer='';start=null;clearTimeout(idleTimer);}
  };
  document.addEventListener('keydown',onKey,true);
  // helper: true, or a function saying when to listen (for example only while
  // "Wired" is chosen), to also take taps from the ACR122U helper.
  const stopHelper=helper?pollLocalHelper(uid=>{
    const candidates=uidCandidates(uid),first=candidates[0];
    onBurst?.({raw:uid,uid:first||null,ended:'helper'});
    if(first)onTag(first,{candidates,raw:uid,source:'helper'});
  },typeof helper==='function'?helper:()=>true,state=>onBurst?.(state)):()=>{};
  return()=>{clearTimeout(idleTimer);document.removeEventListener('keydown',onKey,true);stopHelper();};
}

// A status line under the reader choice: what the USB reader last typed.
export function usbReaderStatus(element){
  return({raw,uid,ended,helper,reader})=>{
    if(!element)return;
    if(helper){
      element.className=`small usb-reader-status ${helper==='connected'?'is-ok':'is-bad'}`;
      element.textContent=helper==='connected'?`ACR122U helper connected${reader?` (${reader})`:''}. Tap a tag on the reader.`
        :'ACR122U helper not found. On Windows, start "Start ACR122U for AvilonX" and keep its window open. If it is open, the browser may have blocked it: click the icon left of the web address, allow access to apps and devices on this computer (local network), and reload. Keyboard-type USB readers work without it.';
      return;
    }
    if(ended==='helper'){
      element.className=`small usb-reader-status ${uid?'is-ok':'is-bad'}`;
      element.textContent=uid?`ACR122U read tag ${formatNfcUid(uid)}.`:`ACR122U read "${raw}": that is not a tag ID.`;
      return;
    }
    const end=ended==='Enter'?' + Enter':ended==='Tab'?' + Tab':'';
    element.className=`small usb-reader-status ${uid?'is-ok':'is-bad'}`;
    element.textContent=uid?`USB reader typed "${raw}"${end}: read as tag ${formatNfcUid(uid)}.`
      :`USB reader typed "${raw}"${end}: that is not a tag ID (expected 8, 14 or 20 hex letters/numbers, or a 10-digit number). Set the reader to output the UID in hex.`;
  };
}
