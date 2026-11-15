// NFC tag helpers. Phones read tags with Web NFC (Chrome on Android only, over
// HTTPS). Elsewhere a USB NFC reader set to "keyboard" mode types the tag ID into
// a text field and presses Enter, which works in any browser.

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
