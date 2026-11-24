// AvilonX for Android (android/): the app opens the website with
// ?app=android&appVersion=<versionCode>. When /android-app.json lists a newer
// version, an "Update" button downloads the new APK, which installs over the
// old one (same signing key). Website changes need no new APK: the "AvilonX was
// updated" banner (update-check.js) reloads them.
import { t } from './i18n.js';

const KEY='avilonx.androidAppVersion',LATER='avilonx.androidUpdateLater';
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

// True when the latest app is newer than the installed one.
export const needsUpdate=(installed,latest)=>Boolean(installed&&latest&&Number(latest.versionCode)>Number(installed)&&/^https:\/\//.test(String(latest.apk||'')));

export async function checkAndroidUpdate(){
  const installed=rememberAndroidApp();if(!installed)return;
  let latest=null;
  try{const response=await fetch(new URL('../../android-app.json',import.meta.url),{cache:'no-store'});if(response.ok)latest=await response.json();}catch{return;}
  if(!needsUpdate(installed,latest)||store.get(LATER)===String(latest.versionCode)||document.querySelector('[data-app-update]'))return;
  const bar=document.createElement('div');bar.className='update-banner';bar.dataset.appUpdate='';bar.setAttribute('role','status');
  bar.innerHTML=`<span>${t('A new AvilonX app is available.')}</span><a class="button primary" data-app-update-go></a><button type="button" class="text-button" data-app-update-later>${t('Later')}</button>`;
  const go=bar.querySelector('[data-app-update-go]');go.href=latest.apk;go.textContent=t('Update');go.rel='noopener';
  // After the download, Android asks to install it over this version.
  go.addEventListener('click',()=>{go.textContent=t('Downloading…');setTimeout(()=>bar.remove(),4000);});
  bar.querySelector('[data-app-update-later]').onclick=()=>{store.set(LATER,String(latest.versionCode));bar.remove();};
  document.body.append(bar);
}
