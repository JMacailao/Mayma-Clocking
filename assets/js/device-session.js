// One device per account (Club settings → One device per account).
// Each browser keeps a random device id; the database records which device
// holds each account. Clubs that do not use the setting are never affected.
import { supabase } from './supabase.js';

const KEY='avilonx.deviceId';
const CHECK_MS=60000;

export function deviceId(){
  try{
    let id=localStorage.getItem(KEY);
    if(!id){id=(crypto.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).replace(/[^\w-]/g,'');localStorage.setItem(KEY,id);}
    return id;
  }catch{return `tab-${Math.random().toString(36).slice(2,12)}`;}
}

// A short name for this device, shown on the other device's question.
export function deviceLabel(agent=navigator.userAgent){
  const browser=/Edg\//.test(agent)?'Edge':/OPR\//.test(agent)?'Opera':/SamsungBrowser/.test(agent)?'Samsung Internet':/CriOS|Chrome\//.test(agent)?'Chrome':/FxiOS|Firefox\//.test(agent)?'Firefox':/Safari\//.test(agent)?'Safari':'Browser';
  const system=/iPhone/.test(agent)?'iPhone':/iPad/.test(agent)?'iPad':/Android/.test(agent)?'Android phone':/Windows/.test(agent)?'Windows':/Mac OS X|Macintosh/.test(agent)?'Mac':/Linux/.test(agent)?'Linux':'device';
  return `${browser} on ${system}`;
}

const ago=value=>{const minutes=Math.max(0,Math.round((Date.now()-new Date(value))/60000));return minutes<1?'just now':minutes<60?`${minutes} minute${minutes===1?'':'s'} ago`:minutes<1440?`${Math.round(minutes/60)} hour${Math.round(minutes/60)===1?'':'s'} ago`:`${Math.round(minutes/1440)} day${Math.round(minutes/1440)===1?'':'s'} ago`;};

// After signing in: true to carry on here, false when the person chose to keep
// the other device signed in. Missing setup (SQL not run) never blocks.
export async function claimDevice({ask=window.confirm.bind(window)}={}){
  const call=force=>supabase.rpc('claim_account_device',{p_device_id:deviceId(),p_device_label:deviceLabel(),p_force:force});
  const {data,error}=await call(false);
  if(error||data?.status!=='other_device')return true;
  const where=data.device_label||'another device',when=data.last_seen_at?`, active ${ago(data.last_seen_at)}`:'';
  if(!ask(`This account is signed in on another device (${where}${when}).\n\nThe club allows one device per account. Sign out that device and continue here?`))return false;
  const {error:forceError}=await call(true);
  return !forceError;
}

// While the app is open: sign out here when another device took over.
export function watchDevice(onReplaced){
  if(window.__avilonxDeviceWatch)return;
  window.__avilonxDeviceWatch=true;
  const check=async()=>{
    if(document.hidden)return;
    try{
      const {data,error}=await supabase.rpc('check_account_device',{p_device_id:deviceId()});
      if(error)return;
      if(data?.status==='replaced')onReplaced(data.device_label||'another device');
      else if(data?.status==='unclaimed')await supabase.rpc('claim_account_device',{p_device_id:deviceId(),p_device_label:deviceLabel(),p_force:false});
    }catch{/* offline: try again later */}
  };
  check();setInterval(check,CHECK_MS);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
}

export async function releaseDevice(){
  try{await supabase.rpc('release_account_device',{p_device_id:deviceId()});}catch{/* not set up */}
}
