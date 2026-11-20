// "Start scanning": a full-screen radar pop-up for clocking by RFID / NFC tag.
//
// The page keeps reading tags as before (USB ACR122U helper, keyboard-type
// readers, phone NFC); this screen only shows them: a blip on the radar where
// the beam is, a big card with the bird, and the list of arrivals. Back (or
// Esc) closes it. Used by the admin and member Clocking pages.
import { escapeHTML, formatDate, playFeedback } from './shared.js';
import { t } from './i18n.js';

const SWEEP_MS=4000;            // one turn of the beam
const BLIP_MS=9000;             // how long a blip stays on the radar
const CARD_MS=4500;             // how long the big card stays up

export function createRadarScan({title='Scanning',raceLabel=()=>'',phoneButton=null}={}){
  let dialog=null,started=0,count=0,cardTimer=null,wakeLock=null,observer=null;
  const reduceMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const degrees=Array.from({length:12},(_,i)=>i*30).map(d=>`<span class="radar-degree" style="--a:${d}deg"><b>${d}</b></span>`).join('');
  const build=()=>{
    dialog=document.createElement('dialog');dialog.className='radar-scan';dialog.dataset.radarScan='';
    dialog.innerHTML=`<header class="radar-top">
      <button class="radar-back" type="button" data-radar-back>← ${t('Back')}</button>
      <div class="radar-title"><strong>${escapeHTML(t(title))}</strong><span data-radar-race></span></div>
      <div class="radar-count"><b data-radar-count>0</b><span>${t('clocked')}</span></div>
    </header>
    <div class="radar-body">
      <div class="radar-stage">
        <div class="radar-scope" data-radar-scope aria-hidden="true">
          <div class="radar-grid"></div>${degrees}
          <div class="radar-sweep"></div>
          <div class="radar-blips" data-radar-blips></div>
          <div class="radar-centre"></div>
        </div>
        <div class="radar-card" data-radar-card hidden aria-live="assertive"></div>
      </div>
      <aside class="radar-side">
        <p class="radar-reader" data-radar-reader hidden></p>
        <p class="radar-status" data-radar-status>${t('Waiting for a tag…')}</p>
        ${phoneButton?`<button class="radar-phone" type="button" data-radar-phone></button>`:''}
        <h3>${t('Arrivals')}</h3>
        <ol class="radar-list" data-radar-list><li class="radar-empty">${t('Tap each arriving pigeon\'s tag on the reader.')}</li></ol>
      </aside>
    </div>`;
    document.body.append(dialog);
    dialog.querySelector('[data-radar-back]').onclick=()=>close();
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});// Esc
    if(phoneButton){
      const mirror=dialog.querySelector('[data-radar-phone]');
      const sync=()=>{const on=phoneButton.getAttribute('aria-pressed')==='true';mirror.textContent=on?t('Stop phone NFC'):t('Start phone NFC');mirror.classList.toggle('is-on',on);};
      mirror.onclick=()=>{phoneButton.click();setTimeout(sync,400);};
      observer=new MutationObserver(sync);observer.observe(phoneButton,{attributes:true,attributeFilter:['aria-pressed']});sync();
    }
  };

  const keepAwake=async()=>{try{if(dialog?.open&&!document.hidden&&navigator.wakeLock&&!wakeLock){wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener?.('release',()=>{wakeLock=null;});}}catch{/* not allowed here */}};
  const onVisible=()=>{if(!document.hidden)keepAwake();};

  function open(){
    if(!dialog)build();
    dialog.querySelector('[data-radar-race]').textContent=raceLabel()||'';showReader();
    started=performance.now();
    try{dialog.showModal();}catch{dialog.setAttribute('open','');}
    // Focus the screen itself, not a field or button: a keyboard-type reader's
    // Enter then cannot press anything.
    dialog.tabIndex=-1;dialog.focus();
    document.documentElement.classList.add('radar-is-open');
    document.addEventListener('visibilitychange',onVisible);keepAwake();
  }
  function close(){
    if(!dialog?.open)return;
    dialog.close();document.documentElement.classList.remove('radar-is-open');
    document.removeEventListener('visibilitychange',onVisible);
    try{wakeLock?.release();}catch{/* already released */}wakeLock=null;
  }
  const isOpen=()=>Boolean(dialog?.open);

  // Where the beam points now (degrees, 0 = up, clockwise).
  const beamAngle=()=>reduceMotion()?Math.random()*360:((performance.now()-started)%SWEEP_MS)/SWEEP_MS*360;
  function blip(kind){
    const holder=dialog.querySelector('[data-radar-blips]'),angle=beamAngle()*Math.PI/180,r=.25+Math.random()*.6;
    const dot=document.createElement('span');dot.className=`radar-blip is-${kind}`;
    dot.style.left=`${50+r*50*Math.sin(angle)}%`;dot.style.top=`${50-r*50*Math.cos(angle)}%`;dot.style.setProperty('--life',`${BLIP_MS}ms`);
    holder.append(dot);setTimeout(()=>dot.remove(),BLIP_MS);
    while(holder.children.length>14)holder.firstElementChild.remove();
  }

  const LABELS={success:'Clocked',info:'Already clocked',error:'Not clocked'};
  // One tag's result: kind success | info | error; ring, name, detail, time (UTC).
  function report({kind='info',ring='',name='',detail='',time=null}={}){
    if(!isOpen())return;
    if(kind==='success')count++;
    dialog.querySelector('[data-radar-count]').textContent=String(count);
    blip(kind);
    if(kind==='success'||kind==='error')playFeedback(kind);
    navigator.vibrate?.(kind==='error'?[80,60,80]:120);
    const when=time?formatDate(time):new Date().toLocaleTimeString('en-PH',{timeZone:'Asia/Manila'});
    const card=dialog.querySelector('[data-radar-card]');
    card.className=`radar-card is-${kind}`;card.hidden=false;
    card.innerHTML=`<span class="radar-card-state">${t(LABELS[kind]||'Clocked')}</span><strong>${escapeHTML(ring)}</strong>${name?`<span>${escapeHTML(name)}</span>`:''}${detail?`<small>${escapeHTML(detail)}</small>`:''}<em>${escapeHTML(when)}</em>`;
    clearTimeout(cardTimer);cardTimer=setTimeout(()=>{card.hidden=true;},CARD_MS);
    const list=dialog.querySelector('[data-radar-list]');list.querySelector('.radar-empty')?.remove();
    const item=document.createElement('li');item.className=`is-${kind}`;
    item.innerHTML=`<span class="radar-dot"></span><span><strong>${escapeHTML(ring)}</strong>${name?` · ${escapeHTML(name)}`:''}<small>${escapeHTML(t(LABELS[kind]||''))} · ${escapeHTML(when)}</small></span>`;
    list.prepend(item);while(list.children.length>50)list.lastElementChild.remove();
    status(kind==='error'?detail:t('Waiting for a tag…'));
  }
  const status=text=>{const line=dialog?.querySelector('[data-radar-status]');if(line)line.textContent=text||t('Waiting for a tag…');};
  // What the reader is doing (from listenForReaderKeys' onBurst).
  // The helper says it is connected once, maybe before the radar is opened:
  // kept, and shown when it opens.
  let lastReader=null;
  const showReader=()=>{
    const state=lastReader,line=dialog?.querySelector('[data-radar-reader]');if(!state||!line)return;
    line.hidden=false;
    line.className=`radar-reader ${state.helper==='connected'?'is-ok':'is-bad'}`;
    line.textContent=state.helper==='connected'?`${t('ACR122U reader connected')}${state.reader?` (${state.reader})`:''}`:t('ACR122U helper not found. Keyboard-type USB readers and phone NFC still work.');
  };
  function readerState(state={}){
    if(state.helper){lastReader=state;showReader();return;}
    if(!dialog)return;
    if(state.uid)status(t('Tag read. Sending…'));
  }
  function destroy(){close();observer?.disconnect();dialog?.remove();dialog=null;clearTimeout(cardTimer);}
  return {open,close,isOpen,report,readerState,destroy};
}
