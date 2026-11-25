// AvilonX for Android (android/): the app opens the website with
// ?app=android&appVersion=<versionCode>. The latest APK is the newest release on
// GitHub (tag android-1.0.<versionCode>). Only when that is newer than the
// installed app, an "Update" button downloads it; it installs over the old one
// (same signing key). "Check for updates" in the menu says when the app is
// already the latest. Website changes need no new APK: the "AvilonX was
// updated" banner (update-check.js) reloads them.
import { t } from './i18n.js';
import { message } from './shared.js';

const KEY='avilonx.androidAppVersion',LATER='avilonx.androidUpdateLater';
const RELEASES='https://api.github.com/repos/JMacailao/Mayma-Clocking/releases/latest';
const store={get:key=>{try{return localStorage.getItem(key);}catch{return null;}},set:(key,value)=>{try{localStorage.setItem(key,value);}catch{/* storage unavailable */}}};

// The installed app version, remembered from the launch address. 1.0.3, the first
// APK, opened the site without it; it is recognised by the app's referrer.
export function rememberAndroidApp(href=location.href,referrer=document.referrer){
  const params=new URL(href).searchParams,version=Number(params.get('appVersion'));
  if(params.get('app')==='android'&&Number.isInteger(version)&&version>0)store.set(KEY,String(version));
  else if(String(referrer).startsWith('android-app://site.avilonx.app')&&!store.get(KEY))store.set(KEY,'3');
  const known=Number(store.get(KEY));
  return Number.isInteger(known)&&known>0?known:null;
}
export const versionName=code=>`1.0.${code}`;

// The newest published APK on GitHub: { versionCode, versionName, apk } or null.
export function parseRelease(release){
  const match=/^android-1\.0\.(\d+)$/.exec(String(release?.tag_name||''));
  const asset=(release?.assets||[]).find(item=>item.name==='AvilonX.apk');
  if(!match||!asset||!/^https:\/\//.test(String(asset.browser_download_url)))return null;
  return {versionCode:Number(match[1]),versionName:versionName(match[1]),apk:asset.browser_download_url};
}
export async function latestRelease(){
  const response=await fetch(RELEASES,{headers:{Accept:'application/vnd.github+json'},cache:'no-store'});
  if(!response.ok)throw new Error(`GitHub answered ${response.status}`);
  return parseRelease(await response.json());
}
export const isNewer=(installed,latest)=>Boolean(installed&&latest&&latest.versionCode>Number(installed));

function showUpdate(latest){
  document.querySelector('[data-app-update]')?.remove();
  const bar=document.createElement('div');bar.className='update-banner';bar.dataset.appUpdate='';bar.setAttribute('role','status');
  bar.innerHTML=`<span></span><a class="button primary" data-app-update-go></a><button type="button" class="text-button" data-app-update-later>${t('Later')}</button>`;
  bar.querySelector('span').textContent=`${t('A new AvilonX app is available.')} (${latest.versionName})`;
  const go=bar.querySelector('[data-app-update-go]');go.href=latest.apk;go.textContent=t('Update');go.rel='noopener';
  // After the download, Android asks to install it over this version.
  go.addEventListener('click',()=>{go.textContent=t('Downloading…');setTimeout(()=>bar.remove(),4000);});
  bar.querySelector('[data-app-update-later]').onclick=()=>{store.set(LATER,String(latest.versionCode));bar.remove();};
  document.body.append(bar);
}

// manual: from "Check for updates" (always answers, ignores Later).
export async function checkAndroidUpdate({manual=false}={}){
  const installed=rememberAndroidApp();if(!installed)return;
  let latest=null;
  try{latest=await latestRelease();}
  catch{if(manual)message(t('Could not check for updates. Check your internet connection and try again.'),'error');return;}
  if(isNewer(installed,latest)){if(manual||store.get(LATER)!==String(latest.versionCode))showUpdate(latest);return;}
  if(manual)message(`${t('Your app is the latest version.')} (${versionName(installed)})`,'success');
}

// "Check for updates" in the menu, only inside the app.
export function bindAppUpdateButton(root=document){
  const button=root.querySelector('[data-app-check]'),installed=rememberAndroidApp();
  if(!button||!installed)return;
  button.hidden=false;button.querySelector('[data-app-version]').textContent=versionName(installed);
  button.addEventListener('click',async()=>{button.disabled=true;button.setAttribute('aria-busy','true');try{await checkAndroidUpdate({manual:true});}finally{button.disabled=false;button.removeAttribute('aria-busy');}});
}
