// Tells the user when a new version of AvilonX has been published, and
// reloads it properly: browsers keep the site's files for a few minutes, so
// before reloading every file this page uses is fetched fresh. (Mixing old
// and new files is what caused errors such as "does not provide an export".)
import { t } from './i18n.js';

const CHECK_MS=5*60*1000;
const probe=new URL('./app.js',import.meta.url).href;
let baseline=null,shown=false;

const versionOf=async()=>{
  const response=await fetch(probe,{method:'HEAD',cache:'no-store'});
  if(!response.ok)return null;
  return response.headers.get('etag')||response.headers.get('last-modified')||response.headers.get('content-length');
};

export async function reloadFresh(){
  const files=new Set([location.href.split('#')[0]]);
  performance.getEntriesByType('resource').forEach(entry=>{try{const address=new URL(entry.name);if(address.origin===location.origin&&/\.(js|css|html)$/.test(address.pathname))files.add(address.href);}catch{/* not a URL */}});
  await Promise.all([...files].map(file=>fetch(file,{cache:'reload'}).catch(()=>null)));
  location.reload();
}

function showBanner(){
  if(shown)return;shown=true;
  const bar=document.createElement('div');bar.className='update-banner';bar.setAttribute('role','status');
  bar.innerHTML=`<span>${t('AvilonX was updated.')}</span><button type="button" class="button primary" data-update-reload>${t('Reload')}</button><button type="button" class="text-button" data-update-later>${t('Later')}</button>`;
  document.body.append(bar);
  bar.querySelector('[data-update-reload]').onclick=async event=>{event.currentTarget.disabled=true;await reloadFresh();};
  bar.querySelector('[data-update-later]').onclick=()=>{bar.remove();shown=false;baseline=null;};
}

async function check(){
  if(document.hidden)return;
  try{
    const version=await versionOf();if(!version)return;
    if(baseline===null){baseline=version;return;}
    if(version!==baseline)showBanner();
  }catch{/* offline: try again later */}
}

export function startUpdateCheck(){
  if(window.__avilonxUpdateCheck||!/^https?:$/.test(location.protocol))return;
  window.__avilonxUpdateCheck=true;
  check();setInterval(check,CHECK_MS);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
}
