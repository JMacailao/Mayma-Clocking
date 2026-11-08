import { supabase } from './supabase.js';
const signOutUser = async() => {const {error}=await supabase.auth.signOut({scope:'local'});if(error)throw error;};

const body = document.body;
const BASE = body.dataset.base || '../../';
const url = (path) => `${BASE}${path}`;
let currentPageCleanup = () => {};
const escapeHTML = (value='') => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const message = (text, kind='info') => { const el=document.querySelector('[data-message]'); if(el){el.textContent=text;el.className=`notice ${kind}`;el.hidden=!text;if(text&&el.scrollIntoView)el.scrollIntoView({behavior:'smooth',block:'nearest'});} };
const fail = (error) => { console.error(error); const text=error?.message || 'Something went wrong. Please try again.'; if(!document.querySelector('[data-message]')&&document.querySelector('#app-shell')){document.querySelector('#app-shell').innerHTML=`<main class="loading"><strong>Could not connect to Supabase.</strong><span class="notice error">${escapeHTML(text)}</span><a class="button secondary" href="${url('index.html')}">Back to home</a></main>`;return;} message(text, 'error'); };
const authError = (e) => e?.message || 'Something went wrong. Please try again.';
const dbError = (error) => { if(error?.code==='23505') return 'That value is already in use.'; if(error?.code==='23503') return 'This record is still in use by another item.'; return error?.message || 'Could not save changes.'; };
const formatDate = (value) => value ? new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}).format(new Date(value.endsWith?.('Z')?value:`${value}Z`)) : '—';
const phDateTimeLocalToUtc = (value) => {
  if(!value)return null;
  const normalized=value.length===16?`${value}:00`:value;
  const date=new Date(`${normalized}+08:00`);
  return Number.isNaN(date.valueOf())?null:date.toISOString().slice(0,19).replace('T',' ');
};
const utcToPhDateTimeLocal = (value) => {
  if(!value)return '';
  const normalized=String(value).replace(' ','T');
  const date=new Date(/[zZ]|[+-]\d\d:\d\d$/.test(normalized)?normalized:`${normalized}Z`);
  return Number.isNaN(date.valueOf())?'':new Date(date.valueOf()+8*60*60*1000).toISOString().slice(0,16);
};
const peso = (value) => Number(value||0).toLocaleString('en-PH',{maximumFractionDigits:2});
const number = (value) => value==null?'—':Number(value).toLocaleString('en-PH',{maximumFractionDigits:3});
const titleCase = (value) => String(value||'').replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase());
const stateTag = (value) => `<span class="tag ${escapeHTML(value)}">${escapeHTML(titleCase(value))}</span>`;

async function getIdentity() {
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return null;
  const {data:profile,error}=await supabase.from('app_profiles').select('id,role,member_id,username,club_id,is_active').eq('id',session.user.id).maybeSingle();
  if(error) throw error;
  let club=null;
  if(profile?.club_id){const {data}=await supabase.from('clubs').select('id,name').eq('id',profile.club_id).maybeSingle();club=data;}
  return {session,user:session.user,profile:profile||null,club};
}
const homeFor = (role) => url(role==='superadmin'?'pages/superadmin/clubs/index.html':['admin','staff'].includes(role)?'pages/admin/dashboard/index.html':'pages/member/dashboard/index.html');
function superadminNav(active) {
  const links=[['clubs','Club accounts','pages/superadmin/clubs/index.html','⌂'],['sticker-register','Register Sticker','pages/superadmin/stickers/register/index.html','▣'],['sticker-generate','Generate Sticker','pages/superadmin/stickers/generate/index.html','▤']];
  return links.map(([key,label,href,icon])=>`<a class="nav-link ${active===key?'active':''}" ${active===key?'aria-current="page"':''} href="${url(href)}"><span class="nav-icon">${icon}</span>${label}</a>`).join('');
}
function adminNav(active,canManageAccounts) {
  const links=[['dashboard','Overview','pages/admin/dashboard/index.html','◧'],['members','Members','pages/admin/members/index.html','♙'],['race-points','Race points','pages/admin/race-points/index.html','⌖'],['races','Races','pages/admin/races/index.html','◷'],['entries','Race entries','pages/admin/entries/index.html','▤'],['clocking','Clocking','pages/admin/clocking/index.html','◉'],['results','Results','pages/admin/results/index.html','↗']];
  if(canManageAccounts)links.push(['users','Team accounts','pages/admin/users/index.html','♧']);
  return links.map(([key,label,href,icon])=>`<a class="nav-link ${active===key?'active':''}" ${active===key?'aria-current="page"':''} href="${url(href)}"><span class="nav-icon">${icon}</span>${label}</a>`).join('');
}
function memberNav(active) {
  const links=[['dashboard','My races','pages/member/dashboard/index.html','◧'],['history','My clocking history','pages/member/history/index.html','◷'],['clocking','Clocking','pages/member/clocking/index.html','◉'],['results','Results','pages/member/results/index.html','↗'],['settings','Settings','pages/member/settings/index.html','⚙']];
  return links.map(([key,label,href,icon])=>`<a class="nav-link ${active===key?'active':''}" ${active===key?'aria-current="page"':''} href="${url(href)}"><span class="nav-icon">${icon}</span>${label}</a>`).join('');
}
function memberBottomNav(active) {
  const links=[
    ['dashboard','My races','pages/member/dashboard/index.html','<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/></svg>'],
    ['history','My clocking history','pages/member/history/index.html','<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2M5 4 3.5 6M19 4l1.5 2"/></svg>'],
    ['clocking','Clocking','pages/member/clocking/index.html','<svg viewBox="0 0 24 24" fill="none"><path d="M5 4v16M8 4v16M12 4v16M15 4v16M19 4v16"/><path d="M3 7h2M17 17h4"/></svg>'],
    ['results','Results','pages/member/results/index.html','<svg viewBox="0 0 24 24" fill="none"><path d="M5 19V5M5 19h15"/><path d="m8 15 3-4 3 2 4-6"/><circle cx="18" cy="7" r="1"/></svg>'],
    ['settings','Settings','pages/member/settings/index.html','<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.1.8-1.5 2.6-1.3-.6a7.7 7.7 0 0 1-1.7 1l-.2 1.5h-3l-.2-1.5a7.7 7.7 0 0 1-1.7-1l-1.3.6-1.5-2.6 1.2-.9a7 7 0 0 1 0-2l-1.2-.9 1.5-2.6 1.3.6a7.7 7.7 0 0 1 1.7-1l.2-1.5h3l.2 1.5a7.7 7.7 0 0 1 1.7 1l1.3-.6 1.5 2.6-1.2.9a7 7 0 0 1 0 2Z"/></svg>']
  ];
  return `<nav class="member-bottom-nav" aria-label="Member navigation">${links.map(([key,label,href,icon])=>`<a class="member-bottom-link ${key==='clocking'?'is-clock':''}" href="${url(href)}" ${active===key?'aria-current="page"':''} aria-label="${label}"><span class="member-bottom-icon" aria-hidden="true">${icon}</span><span class="member-bottom-label">${label}</span></a>`).join('')}</nav>`;
}
async function guard(role,active) {
  try {
    const identity=await getIdentity();
    if(!identity) { location.href=url('pages/login/index.html'); return null; }
    if(!identity.profile) { await signOutUser(); document.querySelector('#app-shell').innerHTML=`<main class="loading"><strong>This account is not set up yet.</strong><span>Ask your administrator to finish setting up your account.</span><a class="button primary" href="${url('pages/login/index.html')}">Return to sign in</a></main>`; return null; }
    if(identity.profile.is_active===false) { await signOutUser(); document.querySelector('#app-shell').innerHTML=`<main class="loading"><strong>This account is disabled.</strong><span>Ask your club administrator to reactivate it.</span><a class="button primary" href="${url('pages/login/index.html')}">Return to sign in</a></main>`; return null; }
    const staffOnAdminPage=role==='admin'&&identity.profile.role==='staff'&&body.dataset.view!=='team-users';
    if(identity.profile.role!==role&&!staffOnAdminPage) { location.href=homeFor(identity.profile.role); return null; }
    body.classList.toggle('member-body',role==='member');
    document.querySelector('#app-shell').innerHTML=`<aside class="sidebar"><a class="brand" href="${homeFor(role)}"><span class="brand-mark">✳</span><span>Mayma<span class="brand-sub">RACE CLOCKING</span></span></a><div class="nav-label">${role==='superadmin'?'SUPERADMIN':identity.profile.role==='admin'?'MANAGEMENT':identity.profile.role==='staff'?'STAFF':'MEMBER AREA'}</div><nav>${role==='superadmin'?superadminNav(active):role==='admin'?adminNav(active,identity.profile.role==='admin'):memberNav(active)}</nav><div class="sidebar-bottom"><div class="signed-in"><span class="avatar">${escapeHTML((identity.profile.username||'M')[0].toUpperCase())}</span><span class="signed-email">${escapeHTML(identity.profile.username||'Account')}</span></div><button class="nav-link signout" id="sign-out"><span class="nav-icon">↪</span>Sign out</button></div></aside><main class="main"><div class="nav-backdrop" id="nav-backdrop"></div><header class="topbar"><div class="topbar-left"><button class="menu-toggle" id="menu-toggle" type="button" aria-label="Open menu">☰</button><div><div class="eyebrow">${escapeHTML(role==='superadmin'?'SUPERADMIN':(identity.club?.name||'PIGEON RACING CLUB').toUpperCase())}</div><h1>${escapeHTML(document.body.dataset.title||'Race clocking')}</h1></div></div><div class="topbar-right"><span class="live-dot"></span><span>Supabase connected</span><span class="timezone">PH · UTC+8</span></div></header><div class="page-content"><div data-message class="notice" hidden></div><section class="page-view" data-view="${escapeHTML(body.dataset.view)}"></section><footer>Clock receipts are recorded by Supabase server time and remain provisional until verified by the club.</footer></div></main>${role==='member'?memberBottomNav(active):''}`;
    document.querySelector('#menu-toggle').onclick=()=>body.classList.toggle('nav-open');document.querySelector('#nav-backdrop').onclick=()=>body.classList.remove('nav-open');document.querySelector('#sign-out').addEventListener('click',async(event)=>{const button=event.currentTarget;if(button.disabled)return;button.disabled=true;button.setAttribute('aria-busy','true');button.querySelector('.nav-icon').textContent='…';try{await Promise.race([signOutUser(),new Promise(resolve=>setTimeout(resolve,1800))]);}catch(error){console.warn('Supabase local sign-out failed; redirecting to sign-in:',error);}finally{location.replace(url('pages/login/index.html'));}});
    return identity;
  } catch(error){fail(error);return null;}
}

function tableRows(items, columns, empty='Nothing here yet.',withActions=true) {
  const actionHeader=withActions?'<th>Actions</th>':'';
  const actionCell=(item,index)=>withActions?`<td class="row-actions" data-label="Actions"><button class="text-button" data-edit="${index}">Edit</button><button class="text-button danger-text" data-delete="${escapeHTML(item.id)}">Delete</button></td>`:'';
  return `<div class="table-scroll"><table><thead><tr>${columns.map(c=>`<th>${escapeHTML(c.label)}</th>`).join('')}${actionHeader}</tr></thead><tbody>${items.length?items.map((item,index)=>`<tr>${columns.map(c=>`<td data-label="${escapeHTML(c.label)}">${c.render?c.render(item):escapeHTML(item[c.key])}</td>`).join('')}${actionCell(item,index)}</tr>`).join(''):`<tr><td colspan="${columns.length+(withActions?1:0)}" class="empty-cell">${escapeHTML(empty)}</td></tr>`}</tbody></table></div>`;
}
const fields={
  members:[['member_no','Member ID','text',true],['full_name','Full name','text',true],['first_name','First name','text'],['middle_name','Middle name','text'],['last_name','Last name','text'],['loft_name','Loft name','text',true],['address','Address','text'],['phone','Phone','text'],['paid','Membership paid','select',true],['latitude','Latitude','coordinates',true],['longitude','Longitude','coordinates',true]],
  race_points:[['location','Location','text',true],['description','Description','text'],['sector','Sector','text',true],['latitude','Latitude','coordinates',true],['longitude','Longitude','coordinates',true]]
};
function decimalToDms(value,key) {
  const positive=key==='latitude'?'N':'E',negative=key==='latitude'?'S':'W';
  if(value===null||value===undefined||String(value).trim()==='')return {hemisphere:positive,degrees:'',minutes:'',seconds:''};
  const decimal=Number(value);if(!Number.isFinite(decimal))return {hemisphere:positive,degrees:'',minutes:'',seconds:''};
  const totalSeconds=Math.round(Math.abs(decimal)*3600*10000)/10000;
  const degrees=Math.floor(totalSeconds/3600),remaining=totalSeconds-degrees*3600,minutes=Math.floor(remaining/60),seconds=Number((remaining-minutes*60).toFixed(4));
  return {hemisphere:decimal<0?negative:positive,degrees:String(degrees),minutes:String(minutes),seconds:String(seconds)};
}
function coordinateFieldHTML(key,label,value='') {
  const id=`field-${key}`,limit=key==='latitude'?90:180,hemispheres=key==='latitude'?['N','S']:['E','W'],parts=decimalToDms(value,key);
  return `<div class="coordinate-axis" data-coordinate-axis="${key}" data-coordinate-limit="${limit}"><span class="coordinate-name" id="${id}-label">${label}</span><input type="hidden" id="${id}" name="${key}" data-coordinate-value value="${escapeHTML(value??'')}"><div class="coordinate-values"><div class="coordinate-hemispheres" role="radiogroup" aria-labelledby="${id}-label">${hemispheres.map(direction=>`<label class="hemisphere-choice"><input type="radio" name="${key}_hemisphere" value="${direction}" ${parts.hemisphere===direction?'checked':''}><span>${direction}</span></label>`).join('')}</div><label class="coordinate-part"><span class="visually-hidden">${label} degrees</span><input type="number" inputmode="numeric" autocomplete="off" data-coordinate-part="degrees" aria-label="${label} degrees" min="0" max="${limit}" step="1" value="${escapeHTML(parts.degrees)}"><span aria-hidden="true">°</span></label><label class="coordinate-part"><span class="visually-hidden">${label} minutes</span><input type="number" inputmode="numeric" autocomplete="off" data-coordinate-part="minutes" aria-label="${label} minutes" min="0" max="59" step="1" value="${escapeHTML(parts.minutes)}"><span aria-hidden="true">′</span></label><label class="coordinate-part coordinate-seconds"><span class="visually-hidden">${label} seconds</span><input type="number" inputmode="decimal" autocomplete="off" data-coordinate-part="seconds" aria-label="${label} seconds" min="0" max="59.9999" step="0.0001" value="${escapeHTML(parts.seconds)}"><span aria-hidden="true">″</span></label></div></div>`;
}
function decimalCoordinateFields(fieldsList=[]) {
  const coordinates=fieldsList.filter(([key,,type])=>type==='coordinates'&&['latitude','longitude'].includes(key));
  if(!coordinates.length)return '';
  return `<section class="coordinate-decimal-fields" aria-labelledby="coordinate-dd-heading"><div class="coordinate-decimal-heading"><h3 id="coordinate-dd-heading">DD (decimal degrees)</h3><span>Optional</span></div><p>Enter decimal coordinates here instead of degrees, minutes, and seconds.</p><div class="coordinate-decimal-grid">${coordinates.map(([key,label])=>`<label class="field"><span>${label} · DD</span><input type="number" inputmode="decimal" step="any" min="${key==='latitude'?'-90':'-180'}" max="${key==='latitude'?'90':'180'}" data-coordinate-decimal-for="${key}" placeholder="Optional"></label>`).join('')}</div></section>`;
}
function coordinateMapHTML(fieldsList=[]) {
  const addressTarget=fieldsList.some(([key])=>key==='address')?'address':'';
  const addressAction=addressTarget?'<div class="coordinate-map-tools"><button class="button secondary" type="button" data-get-address>Get Address</button><span data-address-status aria-live="polite">Click Get Address to fill coordinates and address from your current location.</span></div>':'';
  return `<section class="coordinate-map" data-coordinate-map data-address-target="${addressTarget}" aria-label="Satellite map preview">${addressAction}<div class="coordinate-map-heading"><div><h3>Satellite map</h3><p data-map-status aria-live="polite">Loading satellite imagery…</p><p class="map-interaction-hint">Tap or click the map to set coordinates. Drag to pan; use the plus and minus controls or scroll to zoom.</p></div><a data-map-link target="_blank" rel="noopener noreferrer" hidden>Open satellite map ↗</a></div><div class="coordinate-map-frame"><div class="coordinate-map-placeholder" data-map-placeholder><span class="map-placeholder-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="1.7"/></svg></span><span>Loading satellite imagery…</span></div><div class="coordinate-map-canvas" data-map-canvas hidden></div></div></section>`;
}
const GOOGLE_MAPS_API_KEY='AIzaSyCmS46FCOenSNiQViPU03PMpkExfbH_GgU';
let googleMapsPromise=null;
function loadGoogleMaps(){
  if(window.google?.maps?.Map)return Promise.resolve(window.google.maps);
  if(!googleMapsPromise)googleMapsPromise=new Promise((resolve,reject)=>{
    const callbackName='maymaGoogleMapsReady';
    window[callbackName]=()=>{delete window[callbackName];resolve(window.google.maps);};
    window.gm_authFailure=()=>{
      document.querySelectorAll('[data-coordinate-map] [data-map-status]').forEach(status=>{status.textContent='Google Maps rejected the API key. Check API enablement, billing, and website restrictions.';});
    };
    const script=document.createElement('script');script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&callback=${callbackName}&v=weekly`;script.async=true;script.dataset.googleMapsScript='';
    script.onerror=()=>{delete window[callbackName];reject(new Error('Google Maps could not load. Check your internet connection and API key restrictions.'));};document.head.append(script);
  }).catch(error=>{googleMapsPromise=null;throw error;});
  return googleMapsPromise;
}
function fieldHTML([key,label,type,required],value='') {const id=`field-${key}`;if(type==='coordinates')return coordinateFieldHTML(key,label,value);if(type==='select')return `<label class="field"><span>${label}</span><select id="${id}" name="${key}"><option value="0">No</option><option value="1">Yes</option></select></label>`;return `<label class="field"><span>${label}</span><input id="${id}" name="${key}" type="${type}" ${type==='number'?`step="any" ${key==='latitude'?'min="-90" max="90"':key==='longitude'?'min="-180" max="180"':''}`:''} ${required?'required':''} value="${escapeHTML(value??'')}"></label>`;}
function genericForm(fieldsList,button='Save') {const hasCoordinates=fieldsList.some(([, ,type])=>type==='coordinates');return `<form class="form-grid" id="record-form">${fieldsList.map(f=>fieldHTML(f)).join('')}${hasCoordinates?decimalCoordinateFields(fieldsList):''}${hasCoordinates?coordinateMapHTML(fieldsList):''}<div class="form-actions"><button class="button primary" type="submit">${button}</button><button class="button secondary" id="cancel-edit" type="button" hidden>Cancel</button></div></form>`;}
let spreadsheetParserPromise=null;
function loadSpreadsheetParser(){
  if(window.XLSX?.read)return Promise.resolve(window.XLSX);
  if(!spreadsheetParserPromise)spreadsheetParserPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';script.crossOrigin='anonymous';script.dataset.sheetjs='';
    script.onload=()=>window.XLSX?.read?resolve(window.XLSX):reject(new Error('The Excel reader did not load.'));
    script.onerror=()=>reject(new Error('Could not load the Excel reader. Check your internet connection.'));
    document.head.append(script);
  }).catch(error=>{spreadsheetParserPromise=null;document.querySelector('[data-sheetjs]')?.remove();throw error;});
  return spreadsheetParserPromise;
}
let documentOcrPromise=null;
function loadDocumentOCR(){
  if(window.Tesseract?.createWorker)return Promise.resolve(window.Tesseract);
  if(!documentOcrPromise)documentOcrPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';script.crossOrigin='anonymous';script.dataset.tesseract='';
    script.onload=()=>window.Tesseract?.createWorker?resolve(window.Tesseract):reject(new Error('The document reader did not load.'));
    script.onerror=()=>reject(new Error('Could not load the document reader. Check your internet connection.'));
    document.head.append(script);
  }).catch(error=>{documentOcrPromise=null;document.querySelector('[data-tesseract]')?.remove();throw error;});
  return documentOcrPromise;
}
let documentBarcodeReaderPromise=null;
function loadDocumentBarcodeReader(){
  if(!documentBarcodeReaderPromise)documentBarcodeReaderPromise=Promise.all([
    import('https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm'),
    import('https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/+esm')
  ]).then(([browserZXing,zxing])=>{
    const hints=new Map();hints.set(zxing.DecodeHintType.POSSIBLE_FORMATS,[browserZXing.BarcodeFormat.CODE_128,browserZXing.BarcodeFormat.CODE_39,browserZXing.BarcodeFormat.EAN_13,browserZXing.BarcodeFormat.EAN_8,browserZXing.BarcodeFormat.UPC_A,browserZXing.BarcodeFormat.UPC_E,browserZXing.BarcodeFormat.ITF,browserZXing.BarcodeFormat.CODABAR,browserZXing.BarcodeFormat.QR_CODE,browserZXing.BarcodeFormat.DATA_MATRIX,browserZXing.BarcodeFormat.PDF_417,browserZXing.BarcodeFormat.AZTEC]);hints.set(zxing.DecodeHintType.TRY_HARDER,true);
    return new browserZXing.BrowserMultiFormatReader(hints);
  }).catch(error=>{documentBarcodeReaderPromise=null;throw error;});
  return documentBarcodeReaderPromise;
}
async function scanSheetBarcodes(source,rows,reader,onProgress=()=>{}){
  for(let index=0;index<rows.length;index++){
    const row=rows[index],region=row.barcodeRegion;
    if(!region){row.barcodeScanError='Barcode area could not be located. Enter or correct the barcode manually.';onProgress(index+1,rows.length);continue;}
    const left=Math.max(0,Math.floor(region.left)),top=Math.max(0,Math.floor(region.top)),right=Math.min(source.width,Math.ceil(region.right)),bottom=Math.min(source.height,Math.ceil(region.bottom)),width=right-left,height=bottom-top;
    if(width<8||height<8){row.barcodeScanError='Barcode area could not be located. Enter or correct the barcode manually.';onProgress(index+1,rows.length);continue;}
    const scale=Math.min(3,Math.max(1,900/width)),crop=document.createElement('canvas');crop.width=Math.max(1,Math.round(width*scale));crop.height=Math.max(1,Math.round(height*scale));crop.getContext('2d').drawImage(source,left,top,width,height,0,0,crop.width,crop.height);
    let result=null;
    for(const angle of [0,90,270,180]){try{result=reader.decodeFromCanvas(angle?rotateDocumentCanvas(crop,angle):crop);break;}catch{}}
    const value=result?.getText?.().trim().replace(/\s+/g,'')||'';
    if(value){row.barcode=value;row.barcodeDetected=true;row.barcodeScanError='';}
    else{row.barcodeDetected=false;row.barcodeScanError='Barcode image was not detected. Type or correct the barcode.';}
    reader.reset?.();onProgress(index+1,rows.length);
  }
  return rows;
}
async function documentFileToCanvas(file){
  if(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf')){
    const pdfjs=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
    const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
    const page=await pdf.getPage(1),initial=page.getViewport({scale:1.7}),scale=Math.min(1,2600/Math.max(initial.width,initial.height)),viewport=page.getViewport({scale:1.7*scale});
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;return canvas;
  }
  if(!file.type.startsWith('image/'))throw new Error('Choose a photo or a PDF document.');
  let bitmap=null,image=null,objectUrl=null,width,height;
  try{
    if(window.createImageBitmap){try{bitmap=await createImageBitmap(file);width=bitmap.width;height=bitmap.height;}catch{bitmap=null;}}
    if(!bitmap){objectUrl=URL.createObjectURL(file);image=new Image();image.src=objectUrl;if(image.decode)await image.decode();else await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;});width=image.naturalWidth;height=image.naturalHeight;}
    const scale=Math.min(1,2600/Math.max(width,height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    canvas.getContext('2d',{willReadFrequently:true}).drawImage(bitmap||image,0,0,canvas.width,canvas.height);return canvas;
  }finally{bitmap?.close();if(objectUrl)URL.revokeObjectURL(objectUrl);}
}
function rotateDocumentCanvas(source,rotation){
  const sideways=rotation%180!==0,canvas=document.createElement('canvas');canvas.width=sideways?source.height:source.width;canvas.height=sideways?source.width:source.height;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.translate(canvas.width/2,canvas.height/2);context.rotate(rotation*Math.PI/180);context.drawImage(source,-source.width/2,-source.height/2);return canvas;
}
function documentGridRules(canvas){
  const {width,height}=canvas,rgba=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,width,height).data,xDark=new Uint32Array(width),yDark=new Uint32Array(height);let xSamples=0,ySamples=0;
  for(let y=0;y<height;y+=2){for(let x=0;x<width;x+=2){const i=(y*width+x)*4,gray=rgba[i]*.299+rgba[i+1]*.587+rgba[i+2]*.114;if(gray<145){xDark[x]++;yDark[y]++;}}}
  xSamples=Math.ceil(height/2);ySamples=Math.ceil(width/2);
  const collect=(counts,samples,size)=>{
    const density=Array.from(counts,amount=>amount/samples),peaks=[];
    for(let i=4;i<size-4;i+=2){const value=(density[i-2]+density[i]+density[i+2])/3;if(value<.35||value<density[i-4]||value<density[i+4])continue;peaks.push({position:i,strength:value});}
    const merged=[];for(const peak of peaks){const previous=merged[merged.length-1];if(previous&&peak.position-previous.position<=Math.max(7,size*.004)){if(peak.strength>previous.strength)merged[merged.length-1]=peak;}else merged.push(peak);}
    return merged;
  };
  return {vertical:collect(xDark,xSamples,width),horizontal:collect(yDark,ySamples,height)};
}
function entrySheetRowsFromOCR(ocrData,canvas){
  const rules=documentGridRules(canvas),fallback=[0,.13,.35,.55,.76,1].map(ratio=>Math.round(canvas.width*ratio));
  let columns=fallback;
  if(rules.vertical.length>=6){columns=rules.vertical.sort((a,b)=>b.strength-a.strength).slice(0,6).sort((a,b)=>a.position-b.position).map(rule=>rule.position);}
  const allWords=ocrData.words?.length?ocrData.words:(ocrData.lines||[]).flatMap(line=>line.words||[]),wordCenterY=word=>(word.bbox.y0+word.bbox.y1)/2;
  let groups=[],hasRowRules=false;
  if(rules.horizontal.length>=3){
    const yBounds=[0,...rules.horizontal.map(rule=>rule.position),canvas.height];
    for(let index=1;index<yBounds.length;index++){const top=yBounds[index-1],bottom=yBounds[index];if(bottom-top<12)continue;const words=allWords.filter(word=>wordCenterY(word)>=top&&wordCenterY(word)<bottom);if(words.length)groups.push({words,top,bottom});}
    hasRowRules=groups.length>0;
  }
  if(!groups.length)groups=(ocrData.lines||[]).map(line=>({words:line.words||[],top:line.bbox?.y0,bottom:line.bbox?.y1})).filter(group=>group.words.length);
  if(!groups.length&&allWords.length){
    const sorted=[...allWords].sort((a,b)=>wordCenterY(a)-wordCenterY(b)),lineHeight=sorted.map(word=>Math.max(1,word.bbox.y1-word.bbox.y0)).sort((a,b)=>a-b)[Math.floor(sorted.length/2)]||18;
    for(const word of sorted){const center=wordCenterY(word),group=groups.find(row=>Math.abs(row.center-center)<lineHeight*1.8);if(group){const count=group.words.length;group.words.push(word);group.center=(group.center*count+center)/(count+1);group.top=Math.min(group.top,word.bbox.y0);group.bottom=Math.max(group.bottom,word.bbox.y1);}else groups.push({center,top:word.bbox.y0,bottom:word.bbox.y1,words:[word]});}
  }
  if(!hasRowRules&&groups.length===1){groups[0].top=0;groups[0].bottom=canvas.height;}
  if(!hasRowRules&&groups.length>1){groups.sort((a,b)=>((a.top??wordCenterY(a.words[0]))+(a.bottom??wordCenterY(a.words[0])))-((b.top??wordCenterY(b.words[0]))+(b.bottom??wordCenterY(b.words[0]))));const centers=groups.map(group=>group.words.reduce((sum,word)=>sum+wordCenterY(word),0)/group.words.length);groups.forEach((group,index)=>{const center=centers[index],previous=index?centers[index-1]:null,next=index<centers.length-1?centers[index+1]:null;group.top=previous===null?Math.max(0,center-(next-center)/2):(previous+center)/2;group.bottom=next===null?Math.min(canvas.height,center+(center-previous)/2):(center+next)/2;});}
  const cellText=(words,left,right)=>words.filter(word=>{const x=(word.bbox.x0+word.bbox.x1)/2;return x>=left&&x<right;}).sort((a,b)=>a.bbox.x0-b.bbox.x0).map(word=>String(word.text||'').trim()).filter(Boolean);
  const results=[];
  for(const group of groups){
    const words=group.words;
    const cells=Array.from({length:5},(_,index)=>cellText(words,columns[index],columns[index+1]));
    if(!cells.some(cell=>cell.length))continue;
    const numberText=cells[0].join(' ').match(/\d{1,4}/)?.[0]||String(results.length+1),memberNo=cells[1].join(' ').trim(),ring=cells[2].join('').replace(/\s+/g,'').trim(),barcode=cells[4].join('').replace(/\s+/g,'').trim(),allCellText=cells.flat().join(' ').toLowerCase();
    if(!cells[0].join(' ').match(/\d/)&&/member/.test(allCellText)&&/ring/.test(allCellText)&&/barcode/.test(allCellText))continue;
    results.push({id:`sheet-${Date.now()}-${results.length}-${Math.random().toString(36).slice(2,7)}`,sheetRow:numberText,member_no:memberNo,pigeon_ring:ring,barcode,barcodeDetected:false,barcodeScanError:'',barcodeRegion:{left:columns[4],right:columns[5],top:group.top??Math.min(...words.map(word=>word.bbox.y0)),bottom:group.bottom??Math.max(...words.map(word=>word.bbox.y1))},errors:[],member:null,saved:false});
  }
  return results;
}
const memberImportAliases={
  member_no:['memberid','memberno','membernumber','id'],
  full_name:['fullname','membername','name'],
  first_name:['firstname','givenname'],
  middle_name:['middlename'],
  last_name:['lastname','surname','familyname'],
  loft_name:['loftname','loft'],
  address:['address','homeaddress'],
  phone:['phone','phonenumber','contactnumber','mobile'],
  paid:['paid','membershippaid','paymentstatus','membershipstatus'],
  latitude:['latitude','lat','latitudedd','latitudedecimal','latitudedecimaldegrees'],
  latitude_hemisphere:['latitudehemisphere','latitudehemispherens','lathemisphere','latitudedirection','latdirection','latns'],
  latitude_degrees:['latitudedegrees','latdegrees','latdeg'],
  latitude_minutes:['latitudeminutes','latminutes','latmin'],
  latitude_seconds:['latitudeseconds','latseconds','latsec'],
  longitude:['longitude','lon','lng','long','longitudedd','longitudedecimal','longitudedecimaldegrees'],
  longitude_hemisphere:['longitudehemisphere','longitudehemisphereew','lonhemisphere','longitudedirection','londirection','lonew'],
  longitude_degrees:['longitudedegrees','longdegrees','longdeg','londegrees'],
  longitude_minutes:['longitudeminutes','longminutes','longmin','lonminutes'],
  longitude_seconds:['longitudeseconds','longseconds','longsec','lonseconds']
};
const normalizeImportHeader=value=>String(value??'').toLowerCase().replace(/[^a-z0-9]/g,'');
function parseImportedCoordinate(row,axis,limit,positive,negative,cell,columns){
  const decimalText=cell(row,axis),degreeField=`${axis}_degrees`,minuteField=`${axis}_minutes`,secondField=`${axis}_seconds`,hemisphereField=`${axis}_hemisphere`,hasDmsColumns=columns[degreeField]>=0;
  if(decimalText){
    const value=Number(decimalText);
    if(!Number.isFinite(value)||value < -limit||value > limit)return {error:`${titleCase(axis)} must be from ${-limit} to ${limit}.`};
    if(hasDmsColumns&&[degreeField,minuteField,secondField].some(field=>cell(row,field)!==''))return {error:`Use either decimal ${titleCase(axis)} or DMS columns, not both.`};
    return {value};
  }
  if(!hasDmsColumns)return {error:`${titleCase(axis)} is missing.`};
  const degreeText=cell(row,degreeField),minuteText=cell(row,minuteField),secondText=cell(row,secondField),hemisphere=(cell(row,hemisphereField)||positive).toUpperCase();
  if(!degreeText)return {error:`${titleCase(axis)} degrees are missing.`};
  const degrees=Number(degreeText),minutes=minuteText===''?0:Number(minuteText),seconds=secondText===''?0:Number(secondText);
  if(!Number.isInteger(degrees)||degrees<0||degrees>limit)return {error:`${titleCase(axis)} degrees must be a whole number from 0 to ${limit}.`};
  if(!Number.isInteger(minutes)||minutes<0||minutes>=60)return {error:`${titleCase(axis)} minutes must be a whole number from 0 to 59.`};
  if(!Number.isFinite(seconds)||seconds<0||seconds>=60)return {error:`${titleCase(axis)} seconds must be from 0 up to 59.9999.`};
  if(degrees===limit&&(minutes>0||seconds>0))return {error:`At ${limit} ${titleCase(axis)} degrees, minutes and seconds must be zero.`};
  if(hemisphere!==positive&&hemisphere!==negative)return {error:`${titleCase(axis)} hemisphere must be ${positive} or ${negative}.`};
  const magnitude=degrees+minutes/60+seconds/3600;
  return {value:Number((hemisphere===negative?-magnitude:magnitude).toFixed(7))};
}
function parseMemberWorksheet(XLSX,arrayBuffer){
  const workbook=XLSX.read(arrayBuffer,{type:'array',cellDates:false});
  if(!workbook.SheetNames?.length)throw new Error('The Excel file has no worksheet.');
  const sheet=workbook.Sheets[workbook.SheetNames[0]],matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false,blankrows:false});
  if(!matrix.length)throw new Error('The first worksheet is empty.');
  const headerRowIndex=matrix.slice(0,10).findIndex(row=>{
    const headers=new Set(row.map(normalizeImportHeader));
    const has=key=>memberImportAliases[key].some(alias=>headers.has(normalizeImportHeader(alias)));
    const decimalCoordinates=has('latitude')&&has('longitude'),dmsCoordinates=has('latitude_degrees')&&has('longitude_degrees');
    return has('member_no')&&has('loft_name')&&(decimalCoordinates||dmsCoordinates)&&(has('full_name')||(has('first_name')&&has('last_name')));
  });
  if(headerRowIndex<0)throw new Error('Could not find the member column headings in the first 10 rows. Include Member ID, Full name (or First name and Last name), Loft name, and either decimal Latitude/Longitude or DMS degree columns for both coordinates.');
  const header=matrix[headerRowIndex].map(normalizeImportHeader),columns={};
  for(const [field,aliases] of Object.entries(memberImportAliases))columns[field]=header.findIndex(value=>aliases.some(alias=>value===normalizeImportHeader(alias)));
  const cell=(row,field)=>{const index=columns[field];return index<0?'':String(row[index]??'').trim();};
  const dataRows=matrix.slice(headerRowIndex+1).map((row,index)=>({row,rowNumber:headerRowIndex+index+2})).filter(item=>item.row.some(value=>String(value??'').trim()!==''));
  if(dataRows.length>500)throw new Error('Import up to 500 members at a time. Split this worksheet into smaller batches.');
  const members=[],issues=[],seen=new Set();
  for(const item of dataRows){
    const row=item.row,errors=[],memberNo=cell(row,'member_no'),firstName=cell(row,'first_name'),middleName=cell(row,'middle_name'),lastName=cell(row,'last_name');
    const fullName=cell(row,'full_name')||[firstName,middleName,lastName].filter(Boolean).join(' '),loftName=cell(row,'loft_name');
    const latitudeResult=parseImportedCoordinate(row,'latitude',90,'N','S',cell,columns),longitudeResult=parseImportedCoordinate(row,'longitude',180,'E','W',cell,columns);
    if(!memberNo)errors.push('Member ID is missing.');else if(memberNo.length>40)errors.push('Member ID exceeds 40 characters.');
    if(!fullName)errors.push('Full name or first and last name is required.');else if(fullName.length>180)errors.push('Full name exceeds 180 characters.');
    if(!loftName)errors.push('Loft name is missing.');else if(loftName.length>180)errors.push('Loft name exceeds 180 characters.');
    if(latitudeResult.error)errors.push(latitudeResult.error);
    if(longitudeResult.error)errors.push(longitudeResult.error);
    for(const [value,label,max] of [[firstName,'First name',180],[middleName,'Middle name',180],[lastName,'Last name',180],[cell(row,'address'),'Address',500],[cell(row,'phone'),'Phone',40]])if(value.length>max)errors.push(`${label} exceeds ${max} characters.`);
    const paidText=cell(row,'paid').toLowerCase();let paid=0;
    if(['yes','y','true','1','paid'].includes(paidText))paid=1;else if(['','no','n','false','0','unpaid'].includes(paidText))paid=0;else errors.push('Membership paid must be Yes/No or 1/0.');
    if(memberNo){const normalized=memberNo.toLocaleLowerCase();if(seen.has(normalized))errors.push('Member ID appears more than once in this file.');else seen.add(normalized);}
    if(errors.length){issues.push({rowNumber:item.rowNumber,errors});continue;}
    members.push({__rowNumber:item.rowNumber,member_no:memberNo,full_name:fullName,first_name:firstName||null,middle_name:middleName||null,last_name:lastName||null,loft_name:loftName,address:cell(row,'address')||null,phone:cell(row,'phone')||null,paid,latitude:latitudeResult.value,longitude:longitudeResult.value});
  }
  return {members,issues,dataRows:dataRows.length};
}
function bindCoordinateEditor(form) {
  const axes=[...form.querySelectorAll('[data-coordinate-axis]')],preview=form.querySelector('[data-coordinate-map]');if(!axes.length||!preview)return {set(){},refresh(){},validate(){return true;}};
  const status=preview.querySelector('[data-map-status]'),canvas=preview.querySelector('[data-map-canvas]'),placeholder=preview.querySelector('[data-map-placeholder]'),mapLink=preview.querySelector('[data-map-link]'),addressButton=preview.querySelector('[data-get-address]'),addressStatus=preview.querySelector('[data-address-status]');let mapTimer=null,lastAddressLookup=0,mapInstance=null,mapMarker=null,lastMapPoint=null,mapRequest=0;
  const readAxis=axis=>{
    const key=axis.dataset.coordinateAxis,degree=axis.querySelector('[data-coordinate-part="degrees"]'),minute=axis.querySelector('[data-coordinate-part="minutes"]'),second=axis.querySelector('[data-coordinate-part="seconds"]'),hidden=axis.querySelector('[data-coordinate-value]'),hemisphereInput=axis.querySelector('input[type="radio"]:checked'),hemisphere=hemisphereInput?.value||'N',limit=Number(axis.dataset.coordinateLimit),decimalInput=form.querySelector(`[data-coordinate-decimal-for="${key}"]`);
    const fields=[degree,minute,second,decimalInput].filter(Boolean);fields.forEach(field=>{field.setCustomValidity('');field.removeAttribute('aria-invalid');});
    if(decimalInput&&decimalInput.value.trim()!==''){
      const decimal=Number(decimalInput.value);
      if(!Number.isFinite(decimal)||decimal < -limit||decimal > limit){const error=`Enter a decimal value from ${-limit} to ${limit}.`;decimalInput.setCustomValidity(error);decimalInput.setAttribute('aria-invalid','true');hidden.value='';return {valid:false,error};}
      const parts=decimalToDms(decimal,key);degree.value=parts.degrees;minute.value=parts.minutes;second.value=parts.seconds;const direction=axis.querySelector(`input[type="radio"][value="${parts.hemisphere}"]`);if(direction)direction.checked=true;hidden.value=decimal.toFixed(7);return {valid:true,value:decimal};
    }
    if(!degree.value.trim()){hidden.value='';return {valid:false,missing:true};}
    const d=Number(degree.value),m=minute.value.trim()===''?0:Number(minute.value),s=second.value.trim()===''?0:Number(second.value);
    let error='';if(!Number.isInteger(d)||d<0||d>limit)error=`Degrees must be between 0 and ${limit}.`;else if(!Number.isInteger(m)||m<0||m>=60)error='Minutes must be a whole number from 0 to 59.';else if(!Number.isFinite(s)||s<0||s>=60)error='Seconds must be from 0 up to 59.9999.';else if(d===limit&&(m>0||s>0))error=`At ${limit} degrees, minutes and seconds must be zero.`;
    if(error){degree.setCustomValidity(error);degree.setAttribute('aria-invalid','true');hidden.value='';return {valid:false,error};}
    const magnitude=d+(m/60)+(s/3600),sign=(hemisphere==='S'||hemisphere==='W')?-1:1,decimal=Number((magnitude*sign).toFixed(7));hidden.value=decimal.toFixed(7);return {valid:true,value:decimal};
  };
  const displaySatelliteMap=async(latitude,longitude)=>{
    const request=++mapRequest;canvas.hidden=false;placeholder.hidden=false;placeholder.querySelector('span:last-child').textContent='Loading satellite imagery…';
    try{
      const maps=await loadGoogleMaps();if(request!==mapRequest||!canvas.isConnected)return;
      const point=[latitude,longitude],pointKey=point.map(value=>value.toFixed(7)).join(',');
      if(!mapInstance){
        mapInstance=new maps.Map(canvas,{center:{lat:latitude,lng:longitude},zoom:15,mapTypeId:'satellite',mapTypeControl:true,streetViewControl:false,fullscreenControl:true,zoomControl:true,gestureHandling:'greedy'});
        mapMarker=new maps.Marker({position:{lat:latitude,lng:longitude},map:mapInstance,title:'Selected location'});
        mapInstance.addListener('click',event=>{
          if(!event.latLng)return;
          set('latitude',event.latLng.lat());set('longitude',event.latLng.lng());refresh(true);
          if(addressStatus)addressStatus.textContent='Map point selected. Coordinates are filled; update the address if needed.';
        });
      }else{
        mapMarker.setPosition({lat:latitude,lng:longitude});
        if(lastMapPoint!==pointKey)mapInstance.setCenter({lat:latitude,lng:longitude});
      }
      lastMapPoint=pointKey;placeholder.hidden=true;
      requestAnimationFrame(()=>{if(request===mapRequest&&mapInstance)maps.event.trigger(mapInstance,'resize');});
    }catch(error){
      if(request!==mapRequest)return;
      canvas.hidden=true;placeholder.hidden=false;placeholder.querySelector('span:last-child').textContent='Google Maps satellite imagery could not load. Check your connection and API key setup.';status.textContent=error.message||'Google Maps is unavailable right now.';console.error('Google Maps could not load:',error);
    }
  };
  const defaultMapPoint=[12.8797,121.7740];
  const refresh=(immediate=false)=>{
    clearTimeout(mapTimer);const values=axes.map(readAxis),problem=values.find(value=>value.error);
    if(problem){
      mapLink.hidden=true;
      if(mapInstance){canvas.hidden=false;placeholder.hidden=true;}
      else{canvas.hidden=false;placeholder.hidden=false;placeholder.querySelector('span:last-child').textContent='Loading the satellite map. Correct the coordinate or tap the map to choose a new location.';mapTimer=setTimeout(()=>displaySatelliteMap(...defaultMapPoint),0);}
      status.textContent=problem.error;return;
    }
    if(values.some(value=>!value.valid)){
      mapLink.hidden=true;status.textContent='Tap the satellite map to choose a location, or enter both coordinates above.';
      if(!mapInstance){canvas.hidden=false;placeholder.hidden=false;placeholder.querySelector('span:last-child').textContent='Loading the satellite map. Tap anywhere on it to choose coordinates.';mapTimer=setTimeout(()=>displaySatelliteMap(...defaultMapPoint),0);}
      else{canvas.hidden=false;placeholder.hidden=true;requestAnimationFrame(()=>{if(mapInstance)google.maps.event.trigger(mapInstance,'resize');});}
      return;
    }
    const latitude=values.find((_,index)=>axes[index].dataset.coordinateAxis==='latitude').value,longitude=values.find((_,index)=>axes[index].dataset.coordinateAxis==='longitude').value;
    const mapUrl=new URL('https://www.google.com/maps/@');mapUrl.searchParams.set('api','1');mapUrl.searchParams.set('map_action','map');mapUrl.searchParams.set('center',`${latitude},${longitude}`);mapUrl.searchParams.set('zoom','17');mapUrl.searchParams.set('basemap','satellite');
    mapLink.href=mapUrl.toString();mapLink.hidden=false;status.textContent=`Satellite view at ${latitude.toFixed(6)}, ${longitude.toFixed(6)}.`;
    mapTimer=setTimeout(()=>displaySatelliteMap(latitude,longitude),immediate?0:450);
  };
  const set=(key,value)=>{
    const axis=axes.find(item=>item.dataset.coordinateAxis===key);if(!axis)return;const parts=decimalToDms(value,key);
    axis.querySelector('[data-coordinate-part="degrees"]').value=parts.degrees;axis.querySelector('[data-coordinate-part="minutes"]').value=parts.minutes;axis.querySelector('[data-coordinate-part="seconds"]').value=parts.seconds;
    const decimalInput=form.querySelector(`[data-coordinate-decimal-for="${key}"]`);if(decimalInput)decimalInput.value='';
    const direction=axis.querySelector(`input[type="radio"][value="${parts.hemisphere}"]`);if(direction)direction.checked=true;
  };
  if(addressButton)addressButton.onclick=async()=>{
    const target=form.elements.namedItem(preview.dataset.addressTarget);
    if(!target)return;
    if(!window.isSecureContext){addressStatus.textContent='Location access requires a secure HTTPS connection.';return;}
    if(!navigator.geolocation){addressStatus.textContent='This browser does not support location access. Enter the coordinates manually.';return;}
    addressButton.disabled=true;addressButton.textContent='Getting location…';addressStatus.textContent='Allow location access in your browser to fill the coordinates.';
    try{
      let position;
      try{
        position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:20000,maximumAge:0}));
      }catch(error){
        addressStatus.textContent=error.code===1?'Location permission was denied. Allow it in your browser settings and try again.':error.code===3?'Location request timed out. Try again or enter the coordinates manually.':'Could not determine your location. Check your device location settings and try again.';
        return;
      }
      const latitude=position.coords.latitude,longitude=position.coords.longitude;
      set('latitude',latitude);set('longitude',longitude);refresh(true);
      addressButton.textContent='Finding address…';addressStatus.textContent='Coordinates added. Looking up the address…';
      const delay=Math.max(0,1100-(Date.now()-lastAddressLookup));if(delay)await new Promise(resolve=>setTimeout(resolve,delay));lastAddressLookup=Date.now();
      const endpoint=new URL('https://nominatim.openstreetmap.org/reverse');endpoint.searchParams.set('format','jsonv2');endpoint.searchParams.set('lat',latitude);endpoint.searchParams.set('lon',longitude);
      const response=await fetch(endpoint,{headers:{Accept:'application/json'}});if(!response.ok)throw new Error('Address lookup failed.');const place=await response.json();if(!place.display_name)throw new Error('No address found.');
      target.value=place.display_name;addressStatus.textContent='Location and address added. Review them before saving.';
    }catch(error){addressStatus.textContent='Coordinates were filled, but the address lookup failed. Check your connection or enter the address manually.';console.warn('Address lookup failed:',error);}
    finally{addressButton.disabled=false;addressButton.textContent='Get Address';}
  };
  axes.forEach(axis=>{
    const decimalInput=form.querySelector(`[data-coordinate-decimal-for="${axis.dataset.coordinateAxis}"]`);
    axis.querySelectorAll('input').forEach(input=>{const updateFromDms=()=>{if(decimalInput){decimalInput.value='';decimalInput.setCustomValidity('');decimalInput.removeAttribute('aria-invalid');}refresh();};input.addEventListener('input',updateFromDms);input.addEventListener('change',updateFromDms);});
    decimalInput?.addEventListener('input',()=>refresh());decimalInput?.addEventListener('change',()=>refresh());
  });refresh(true);
  return {set,refresh,validate(){refresh(true);const values=axes.map(readAxis);values.forEach((value,index)=>{if(value.missing){const degree=axes[index].querySelector('[data-coordinate-part="degrees"]');degree.setCustomValidity('Enter this coordinate as DMS or decimal degrees.');degree.setAttribute('aria-invalid','true');}});return values.every(value=>value.valid);}};
}
function bindGeneric(view,table,fieldsList,columns,defaults={},withAccounts=false) {
  const records=[];const form=view.querySelector('#record-form');let editing=null;const coordinateEditor=bindCoordinateEditor(form),memberFormPanel=view.querySelector('[data-member-form-panel]'),addMemberButton=view.querySelector('[data-add-member]'),importPanel=view.querySelector('[data-member-import-panel]'),importFile=view.querySelector('#member-import-file');let pendingImportRows=[];
  const setMemberFormOpen=open=>{if(!memberFormPanel)return;memberFormPanel.hidden=!open;addMemberButton.hidden=open;};
  if(addMemberButton)addMemberButton.onclick=()=>{editing=null;form.reset();coordinateEditor.refresh(true);form.querySelectorAll('[data-account-field]').forEach(el=>el.hidden=false);form.querySelector('#cancel-edit').hidden=false;form.querySelector('[type=submit]').textContent='Save';view.querySelector('[data-form-title]').textContent='Add a member';setMemberFormOpen(true);memberFormPanel.scrollIntoView({behavior:'smooth',block:'start'});};
  const redraw=()=>{
    view.querySelector('[data-table]').innerHTML=tableRows(records,columns);
    view.querySelectorAll('[data-edit]').forEach(btn=>btn.onclick=()=>{
      editing=records[Number(btn.dataset.edit)];
      for(const [key,,type] of fieldsList){if(type==='coordinates'){coordinateEditor.set(key,editing[key]);continue;}const el=form.elements.namedItem(key);if(el)el.value=editing[key]??(key==='paid'?0:'');}
      coordinateEditor.refresh(true);view.querySelector('#cancel-edit').hidden=false;form.querySelectorAll('[data-account-field]').forEach(el=>el.hidden=true);form.querySelector('[type=submit]').textContent='Update record';if(memberFormPanel){view.querySelector('[data-form-title]').textContent='Edit member';setMemberFormOpen(true);memberFormPanel.scrollIntoView({behavior:'smooth',block:'start'});}else form.scrollIntoView({behavior:'smooth',block:'center'});
    });
    view.querySelectorAll('[data-login]').forEach(btn=>btn.onclick=async()=>{const username=(prompt('Choose a username for this member (letters, numbers, . _ -):')||'').trim().toLowerCase();if(!username)return;if(!USERNAME_RE.test(username)){alert(USERNAME_HELP);return;}const password=prompt('Choose a password (8 or more characters):')||'';if(!password)return;if(password.length<8){alert('Password must be at least 8 characters.');return;}if(!confirm(`Create a member login for ${username}?`))return;const {error}=await supabase.rpc('admin_create_member_account',{p_member_id:Number(btn.dataset.login),p_username:username,p_password:password});if(error){alert(authError(error));return;}await load();alert(`Member login created. Username: ${username}`);});
    view.querySelectorAll('[data-member-username]').forEach(btn=>btn.onclick=async()=>{const username=prompt('Enter the new member username:',btn.dataset.currentUsername);if(username===null)return;const normalized=username.trim().toLowerCase();if(!USERNAME_RE.test(normalized)){alert(USERNAME_HELP);return;}if(normalized===btn.dataset.currentUsername){alert('The username has not changed.');return;}if(!confirm(`Update this member login to ${normalized}?`))return;const {error}=await supabase.rpc('admin_update_user_credentials',{p_user_id:btn.dataset.memberUsername,p_username:normalized,p_password:null});if(error){alert(authError(error));return;}await load();alert(`Member username updated to ${normalized}.`);});
    view.querySelectorAll('[data-reset]').forEach(btn=>btn.onclick=async()=>{const password=prompt('Enter a new password (8 or more characters):')||'';if(!password)return;if(password.length<8){alert('Password must be at least 8 characters.');return;}if(!confirm('Update this member’s password?'))return;const {error}=await supabase.rpc('admin_set_member_password',{p_member_id:Number(btn.dataset.reset),p_password:password});if(error){alert(authError(error));return;}alert('Member password updated.');});
    view.querySelectorAll('[data-delete]').forEach(btn=>btn.onclick=async()=>{if(!confirm(withAccounts?'Delete this member and their login?':'Delete this record?'))return;const {error}=await supabase.from(table).delete().eq('id',btn.dataset.delete);if(error){message(dbError(error),'error');return;}await load();message('Record deleted.','success');});
  };
  async function load(){const {data,error}=await supabase.from(table).select('*').order('id',{ascending:false});if(error){fail(error);return;}if(withAccounts){const {data:profiles}=await supabase.from('app_profiles').select('id,username,member_id').eq('role','member');const byMember=new Map((profiles||[]).map(p=>[String(p.member_id),{user_id:p.id,username:p.username}]));(data||[]).forEach(r=>Object.assign(r,byMember.get(String(r.id))||{username:null,user_id:null}));}records.splice(0,records.length,...(data||[]));view.querySelector('[data-count]').textContent=`${records.length} records`;redraw();}
  if(importPanel&&importFile){
    const openButton=view.querySelector('[data-open-member-import]'),summary=importPanel.querySelector('[data-import-summary]'),errorsNode=importPanel.querySelector('[data-import-errors]'),previewNode=importPanel.querySelector('[data-import-preview]'),importButton=importPanel.querySelector('[data-confirm-member-import]');
    const showImportPreview=(rows,issues)=>{
      pendingImportRows=rows;summary.textContent=`${rows.length} ready · ${issues.length} issue${issues.length===1?'':'s'}`;
      errorsNode.innerHTML=issues.length?`<div class="notice error"><strong>Fix these spreadsheet rows before importing:</strong><ul class="import-issue-list">${issues.slice(0,20).map(issue=>`<li>Row ${escapeHTML(issue.rowNumber)}: ${issue.errors.map(escapeHTML).join(' ')}</li>`).join('')}${issues.length>20?`<li>And ${issues.length-20} more issue(s).</li>`:''}</ul></div>`:'';
      previewNode.innerHTML=rows.length?`<p class="small">Previewing the first ${Math.min(rows.length,8)} of ${rows.length} members. Coordinates are converted to decimal degrees for storage. Imports create member records only; they do not create login accounts.</p>${tableRows(rows.slice(0,8),[{key:'member_no',label:'Member ID'},{key:'full_name',label:'Full name'},{key:'loft_name',label:'Loft name'},{key:'latitude',label:'Latitude · DD'},{key:'longitude',label:'Longitude · DD'}],'No member rows found.',false)}`:'<p class="small">No valid member rows to preview.</p>';
      importButton.disabled=!rows.length||issues.length>0;importPanel.hidden=false;importPanel.scrollIntoView({behavior:'smooth',block:'start'});
    };
    openButton.onclick=()=>importFile.click();
    view.querySelector('[data-download-member-template]').onclick=async event=>{
      const button=event.currentTarget;button.disabled=true;
      try{
        const XLSX=await loadSpreadsheetParser(),workbook=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([['Member ID','Full name','First name','Middle name','Last name','Loft name','Address','Phone','Membership paid','Latitude Hemisphere (N/S)','Latitude Degrees','Latitude Minutes','Latitude Seconds','Longitude Hemisphere (E/W)','Longitude Degrees','Longitude Minutes','Longitude Seconds']]);
        sheet['!cols']=[{wch:18},{wch:26},{wch:18},{wch:18},{wch:18},{wch:24},{wch:32},{wch:18},{wch:18},{wch:24},{wch:16},{wch:16},{wch:16},{wch:26},{wch:17},{wch:17},{wch:17}];
        XLSX.utils.book_append_sheet(workbook,sheet,'Members');XLSX.writeFile(workbook,'mayma-members-template.xlsx');
        message('Excel template downloaded. Fill one member per row; enter each coordinate as hemisphere, degrees, minutes, and seconds.','success');
      }catch(error){message(error.message||'Could not create the Excel template.','error');}
      finally{button.disabled=false;}
    };
    importFile.onchange=async()=>{
      const file=importFile.files?.[0];if(!file)return;
      importPanel.hidden=false;summary.textContent='Reading file…';errorsNode.innerHTML='';previewNode.innerHTML='';importButton.disabled=true;
      try{
        if(file.size>10*1024*1024)throw new Error('Choose an Excel file smaller than 10 MB.');
        const XLSX=await loadSpreadsheetParser(),parsed=parseMemberWorksheet(XLSX,await file.arrayBuffer()),issues=[...parsed.issues];
        if(!parsed.dataRows)issues.push({rowNumber:'—',errors:['No member rows were found below the heading row.']});
        if(parsed.members.length){
          const existing=new Set();
          for(let offset=0;offset<parsed.members.length;offset+=100){
            const batch=parsed.members.slice(offset,offset+100).map(member=>member.member_no),{data,error}=await supabase.from('members').select('member_no').in('member_no',batch);
            if(error)throw error;(data||[]).forEach(member=>existing.add(member.member_no.toLocaleLowerCase()));
          }
          parsed.members.forEach(member=>{if(existing.has(member.member_no.toLocaleLowerCase()))issues.push({rowNumber:member.__rowNumber,errors:[`Member ID ${member.member_no} already exists in this club.`]});});
        }
        showImportPreview(parsed.members,issues);
      }catch(error){showImportPreview([],[{rowNumber:'—',errors:[error.message||'Could not read this file.']}]);}
      finally{importFile.value='';}
    };
    importPanel.querySelector('[data-cancel-member-import]').onclick=()=>{pendingImportRows=[];importPanel.hidden=true;importFile.value='';};
    importButton.onclick=async()=>{
      if(!pendingImportRows.length)return;
      if(!confirm(`Import ${pendingImportRows.length} member records into this club? No login accounts will be created.`))return;
      importButton.disabled=true;importButton.textContent='Importing…';
      const rows=pendingImportRows.map(({__rowNumber,...member})=>member),{error}=await supabase.from('members').insert(rows);
      importButton.textContent='Import members';
      if(error){importButton.disabled=false;message(dbError(error),'error');return;}
      const imported=rows.length;pendingImportRows=[];importPanel.hidden=true;await load();message(`${imported} member${imported===1?'':'s'} imported successfully. Create member login accounts separately if needed.`,'success');
    };
  }
  form.onsubmit=async event=>{event.preventDefault();if(!coordinateEditor.validate()){message('Check the latitude and longitude values, then try again.','error');form.reportValidity();return;}const data=Object.fromEntries(fieldsList.map(([key,,type])=>{const value=form.elements.namedItem(key).value;return [key,type==='number'||type==='coordinates'?Number(value):key==='paid'?Number(value):value.trim()||null];}));Object.assign(data,defaults);const accUser=withAccounts?(form.elements.namedItem('account_username')?.value||'').trim().toLowerCase():'',accPass=withAccounts?(form.elements.namedItem('account_password')?.value||''):'';if(!editing&&withAccounts&&(accUser||accPass)&&(!accUser||accPass.length<8)){message('To create a login, enter a username and a password of 8 or more characters.','error');return;}if(!editing&&withAccounts&&accUser&&!USERNAME_RE.test(accUser)){message(USERNAME_HELP,'error');return;}if(!editing&&withAccounts&&accUser&&!confirm(`Create the member and a login for ${accUser}?`))return;const result=editing?await supabase.from(table).update(data).eq('id',editing.id):await supabase.from(table).insert(data).select('id').single();if(result.error){message(dbError(result.error),'error');return;}let accountNote='';if(!editing&&withAccounts&&accUser&&accPass){const {error:accError}=await supabase.rpc('admin_create_member_account',{p_member_id:result.data.id,p_username:accUser,p_password:accPass});accountNote=accError?` Member saved, but the login failed: ${authError(accError)} Use “Create login” in the list to retry.`:` Login created for ${accUser}.`;}form.reset();coordinateEditor.refresh(true);editing=null;form.querySelectorAll('[data-account-field]').forEach(el=>el.hidden=false);view.querySelector('#cancel-edit').hidden=true;form.querySelector('[type=submit]').textContent='Save';if(memberFormPanel)view.querySelector('[data-form-title]').textContent='Add a member';await load();setMemberFormOpen(false);message('Saved.'+accountNote,accountNote.includes('failed')?'error':'success');if(accountNote&&!accountNote.includes('failed'))alert(`Member account created. Username: ${accUser}`);};
  view.querySelector('#cancel-edit').onclick=()=>{form.reset();coordinateEditor.refresh(true);editing=null;form.querySelectorAll('[data-account-field]').forEach(el=>el.hidden=false);view.querySelector('#cancel-edit').hidden=true;form.querySelector('[type=submit]').textContent='Save';if(memberFormPanel)view.querySelector('[data-form-title]').textContent='Add a member';setMemberFormOpen(false);};load();
}

async function clubsPage(view) {
  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">SUPERADMIN</span><h2>Club accounts</h2><p>Create a login for each club. A club only ever sees its own members, races and results.</p></div><span class="count-pill" data-count>— clubs</span></div><section class="panel"><div class="panel-heading"><h3>Create a club account</h3></div><form class="form-grid" id="club-form"><label class="field"><span>Club name</span><input name="club" type="text" minlength="2" maxlength="180" required></label><label class="field"><span>Login username</span><input name="username" type="text" minlength="3" maxlength="32" pattern="[A-Za-z0-9][A-Za-z0-9_.\\-]{2,31}" autocomplete="off" autocapitalize="none" spellcheck="false" required></label><label class="field"><span>Password (8+ characters)</span><input name="password" type="password" minlength="8" autocomplete="new-password" required></label><div class="form-actions"><button class="button primary" type="submit">Create club account</button></div></form></section><section class="panel"><div class="panel-heading"><h3>Clubs</h3></div><div data-table></div></section>`;
  const form=view.querySelector('#club-form'),holder=view.querySelector('[data-table]');
  const columns=[{key:'name',label:'Club'},{key:'admin_username',label:'Login username',render:r=>escapeHTML(r.admin_username||'—')},{key:'member_count',label:'Members'},{key:'race_count',label:'Races'},{key:'created_at',label:'Created',render:r=>escapeHTML(String(r.created_at||'').slice(0,10))},{key:'actions',label:'',render:r=>`<button class="text-button" data-reset-club="${escapeHTML(r.id)}">Reset password</button> <button class="text-button danger-text" data-delete-club="${escapeHTML(r.id)}" data-name="${escapeHTML(r.name)}">Delete</button>`}];
  const load=async()=>{
    const {data,error}=await supabase.rpc('superadmin_list_clubs');
    if(error){message(authError(error),'error');return;}
    const clubs=data||[];
    view.querySelector('[data-count]').textContent=`${clubs.length} club${clubs.length===1?'':'s'}`;
    holder.innerHTML=tableRows(clubs,columns,'No clubs yet. Create the first club account above.',false);
    holder.querySelectorAll('[data-reset-club]').forEach(btn=>btn.onclick=async()=>{
      const password=prompt('Enter a new password for this club account (8 or more characters):')||'';if(!password)return;
      const {error:resetError}=await supabase.rpc('superadmin_set_club_password',{p_club_id:Number(btn.dataset.resetClub),p_password:password});
      message(resetError?authError(resetError):'Club password updated.',resetError?'error':'success');});
    holder.querySelectorAll('[data-delete-club]').forEach(btn=>btn.onclick=async()=>{
      if(!confirm(`Delete "${btn.dataset.name}" and its login? This only works for a club with no members, races or race points.`))return;
      const {error:delError}=await supabase.rpc('superadmin_delete_club',{p_club_id:Number(btn.dataset.deleteClub)});
      if(delError){message(authError(delError),'error');return;}
      await load();message('Club deleted.','success');});
  };
  form.onsubmit=async event=>{event.preventDefault();
    const club=form.elements.club.value.trim(),username=form.elements.username.value.trim().toLowerCase(),password=form.elements.password.value;
    if(!USERNAME_RE.test(username)){message(USERNAME_HELP,'error');return;}
    if(password.length<8){message('Choose a password with at least 8 characters.','error');return;}
    const button=form.querySelector('button[type=submit]');button.disabled=true;
    const {error}=await supabase.rpc('superadmin_create_club',{p_club_name:club,p_username:username,p_password:password});
    button.disabled=false;
    if(error){message(authError(error),'error');return;}
    form.reset();await load();message(`Club account created. Username: ${username}`,'success');};
  await load();
}
let barcodeRendererPromise=null;
function loadBarcodeRenderer(){
  if(window.JsBarcode)return Promise.resolve(window.JsBarcode);
  if(!barcodeRendererPromise)barcodeRendererPromise=new Promise((resolve,reject)=>{
    let script=document.querySelector('[data-jsbarcode]');
    if(!script){script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/jsbarcode@3.12.1/dist/JsBarcode.all.min.js';script.crossOrigin='anonymous';script.dataset.jsbarcode='';document.head.append(script);}
    script.addEventListener('load',()=>window.JsBarcode?resolve(window.JsBarcode):reject(new Error('The barcode renderer did not load.')),{once:true});
    script.addEventListener('error',()=>reject(new Error('Could not load the barcode renderer. Check your internet connection.')),{once:true});
    if(window.JsBarcode)resolve(window.JsBarcode);
  }).catch(error=>{barcodeRendererPromise=null;throw error;});
  return barcodeRendererPromise;
}
function drawBarcode(svg,code){
  window.JsBarcode(svg,String(code),{format:'CODE128',displayValue:false,margin:3,width:1.8,height:54,lineColor:'#17231d',background:'#ffffff'});
  svg.setAttribute('role','img');svg.setAttribute('aria-label',`Barcode ${code}`);
}
async function barcodePngDataUrl(code){
  await loadBarcodeRenderer();
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');drawBarcode(svg,code);
  const markup=new XMLSerializer().serializeToString(svg),blob=new Blob([markup],{type:'image/svg+xml;charset=utf-8'}),objectUrl=URL.createObjectURL(blob);
  try{
    const image=new Image();image.src=objectUrl;
    if(image.decode)await image.decode();else await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;});
    const canvas=document.createElement('canvas');canvas.width=Math.max(480,image.naturalWidth*2);canvas.height=Math.max(150,image.naturalHeight*2);
    const context=canvas.getContext('2d');if(!context)throw new Error('Could not prepare barcode images.');
    context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/png');
  }finally{URL.revokeObjectURL(objectUrl);}
}
function stickerGroups(codes){const pages=[];for(let i=0;i<codes.length;i+=20)pages.push(codes.slice(i,i+20));return pages;}
function stickerSheetTable(codes,renderCell){
  const cells=[...codes];while(cells.length<20)cells.push(null);
  return `<table class="sticker-sheet"><tbody>${Array.from({length:10},(_,row)=>`<tr>${cells.slice(row*2,row*2+2).map(renderCell).join('')}</tr>`).join('')}</tbody></table>`;
}
function wordStickerDocument(pages){
  const sheets=pages.map(page=>`<section class="sticker-page">${stickerSheetTable(page,code=>code?`<td class="sticker-cell"><img src="${code.image}" alt=""><div class="sticker-number">${escapeHTML(code.number)}</div></td>`:'<td class="sticker-cell"></td>')}</section>`).join('');
  return `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Mayma barcode stickers</title><style>@page{size:21cm 29.7cm;margin:1cm}body{font-family:Arial,sans-serif;margin:0}.sticker-page{page-break-after:always;break-after:page}.sticker-page:last-child{page-break-after:auto;break-after:auto}.sticker-sheet{width:19cm;height:27.7cm;table-layout:fixed;border-collapse:collapse}.sticker-cell{width:9.5cm;height:2.77cm;border:.5pt solid #cbd3cd;text-align:center;vertical-align:middle;padding:2mm}.sticker-cell img{display:block;width:7.5cm;height:1.25cm;object-fit:contain;margin:0 auto 1mm}.sticker-number{font-size:14pt;font-weight:700;line-height:1.1}</style></head><body>${sheets}</body></html>`;
}
function bindStickerScanner(view,input){
  const button=view.querySelector('#sticker-camera-button'),dialog=view.querySelector('#sticker-camera-dialog'),camera=view.querySelector('#sticker-camera'),placeholder=view.querySelector('#sticker-camera-placeholder'),status=view.querySelector('#sticker-camera-status');
  let stream=null,controls=null,active=false,starting=false,session=0;
  const setStatus=text=>{status.textContent=text;status.hidden=!text;};
  const stop=(text='Camera stopped.')=>{session++;active=false;starting=false;controls?.stop();controls=null;camera.pause();stream?.getTracks().forEach(track=>track.stop());camera.srcObject?.getTracks().forEach(track=>track.stop());camera.srcObject=null;stream=null;camera.hidden=true;placeholder.hidden=false;button.disabled=false;button.removeAttribute('aria-busy');if(dialog.open)dialog.close();setStatus(text);};
  const capture=(value,scanControls)=>{const code=String(value||'').trim();if(!code||!active)return;session++;active=false;starting=false;(scanControls||controls)?.stop();controls=null;camera.pause();stream?.getTracks().forEach(track=>track.stop());camera.srcObject=null;stream=null;camera.hidden=true;placeholder.hidden=false;button.disabled=false;button.removeAttribute('aria-busy');if(dialog.open)dialog.close();input.value=code;input.focus();message('Barcode captured. Review the number, then register it.','info');};
  const cameraMessage=error=>{
    if(!window.isSecureContext)return 'Camera access needs a secure HTTPS page. Type the barcode number manually if HTTPS is unavailable.';
    if(!navigator.mediaDevices?.getUserMedia)return 'This browser does not provide camera access. Type the barcode number manually.';
    if(error?.name==='NotAllowedError'||error?.name==='PermissionDeniedError')return 'Camera permission was blocked. Allow camera access in browser settings, then try again.';
    if(error?.name==='NotFoundError'||error?.name==='DevicesNotFoundError')return 'No camera was found on this device.';
    if(error?.name==='NotReadableError'||error?.name==='TrackStartError')return 'The camera is busy in another app. Close it and try again.';
    if(error instanceof TypeError)return 'The barcode scanner could not load. Check your internet connection.';
    return 'Could not start the camera. Check permission and try again.';
  };
  button.onclick=async()=>{
    if(active||starting)return;
    dialog.showModal();placeholder.querySelector('span:last-child').textContent='Waiting for camera access…';setStatus('Starting camera…');
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){placeholder.querySelector('span:last-child').textContent=cameraMessage();setStatus(cameraMessage());return;}
    const current=++session;starting=true;button.disabled=true;button.setAttribute('aria-busy','true');
    try{
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
      if(current!==session){stream.getTracks().forEach(track=>track.stop());return;}
      camera.srcObject=stream;camera.hidden=false;placeholder.hidden=true;camera.play().catch(()=>{});setStatus('Loading scanner…');
      const {BrowserMultiFormatReader}=await import('https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm');
      if(current!==session){stream.getTracks().forEach(track=>track.stop());return;}
      active=true;setStatus('Camera on. Hold the barcode steady in the frame.');
      controls=await new BrowserMultiFormatReader().decodeFromStream(stream,camera,(result,_error,scanControls)=>{if(result)capture(result.getText(),scanControls);});
      if(current!==session||!active){controls?.stop();return;}
      starting=false;button.disabled=false;button.removeAttribute('aria-busy');setStatus('Camera on. Hold the barcode steady in the frame.');
    }catch(error){
      if(current!==session)return;active=false;starting=false;controls?.stop();controls=null;stream?.getTracks().forEach(track=>track.stop());stream=null;camera.pause();camera.srcObject=null;camera.hidden=true;placeholder.hidden=false;placeholder.querySelector('span:last-child').textContent=cameraMessage(error);button.disabled=false;button.removeAttribute('aria-busy');setStatus(cameraMessage(error));console.error('Sticker barcode scanner could not start:',error);
    }
  };
  view.querySelectorAll('[data-close-sticker-camera]').forEach(el=>el.addEventListener('click',()=>stop()));
  dialog.addEventListener('cancel',event=>{event.preventDefault();stop();});
  dialog.addEventListener('click',event=>{if(event.target===dialog)stop();});
  const visibility=()=>{if(document.hidden&&(active||starting))stop('Camera stopped.');};
  document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',stop);
  return()=>{document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',stop);stop('');};
}
async function stickerRegisterPage(view){
  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">SUPERADMIN · GLOBAL REGISTRY</span><h2>Register Sticker</h2><p>Register an existing sticker number so any club can use it.</p></div></div><section class="panel narrow"><div class="callout"><span class="callout-icon">◎</span><span>Barcode stickers are global and are not assigned to a club or member. Scan an existing sticker or enter its number manually.</span></div><form id="sticker-register-form" class="form-grid"><label class="field"><span>Barcode number</span><div class="barcode-entry"><input id="sticker-barcode-number" name="barcode_number" maxlength="120" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" required placeholder="Scan or type the barcode number"><button class="barcode-scan-button" id="sticker-camera-button" type="button" aria-label="Scan barcode with camera" title="Scan barcode"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 12h8M10 9v6M14 9v6"/></svg></button></div></label><div class="form-actions"><button class="button primary" type="submit">Register barcode</button></div></form></section><section class="panel"><div class="panel-heading"><div><h3>Registered barcodes</h3><p class="small">Global sticker numbers available to all clubs.</p></div><span class="count-pill" data-sticker-count>Loading…</span></div><div data-sticker-table></div></section><dialog class="scanner-dialog scanner-camera-dialog" id="sticker-camera-dialog" aria-label="Scan sticker barcode"><div class="scanner-dialog-content"><div class="scanner-preview"><div class="scanner-placeholder" id="sticker-camera-placeholder"><span class="scanner-placeholder-mark" aria-hidden="true">⌗</span><span>Camera preview will appear here.</span></div><video id="sticker-camera" playsinline autoplay muted hidden aria-label="Live barcode camera preview"></video><div class="scanner-top-controls"><button class="scanner-close-button" type="button" data-close-sticker-camera aria-label="Close scanner">×</button><span class="scanner-live-indicator"><span></span>Scan barcode</span></div><div class="scanner-viewfinder" aria-hidden="true"><span class="scanner-corner top-left"></span><span class="scanner-corner top-right"></span><span class="scanner-corner bottom-left"></span><span class="scanner-corner bottom-right"></span></div><div class="scanner-bottom-controls"><p class="barcode-scan-status" id="sticker-camera-status" aria-live="polite" aria-atomic="true" hidden></p></div></div></div></dialog>`;
  const form=view.querySelector('#sticker-register-form'),input=form.elements.barcode_number,table=view.querySelector('[data-sticker-table]'),count=view.querySelector('[data-sticker-count]');
  const drawPreviews=async()=>{try{await loadBarcodeRenderer();table.querySelectorAll('[data-sticker-preview]').forEach(svg=>drawBarcode(svg,svg.dataset.stickerPreview));}catch(error){message(error.message,'error');}};
  const load=async()=>{
    const {data,error,count:total}=await supabase.from('barcode_stickers').select('barcode_number,source,created_at',{count:'exact'}).order('created_at',{ascending:false}).limit(100);
    if(error){table.innerHTML=`<p class="notice error">${escapeHTML(error.message)}. Run sticker-barcodes.sql in your Supabase SQL Editor.</p>`;count.textContent='—';return;}
    count.textContent=`${(total||0).toLocaleString()} registered`;
    table.innerHTML=tableRows(data||[],[{key:'barcode_number',label:'Barcode number',render:r=>`<strong>${escapeHTML(r.barcode_number)}</strong>`},{key:'barcode',label:'Barcode',render:r=>`<svg class="barcode-preview" data-sticker-preview="${escapeHTML(r.barcode_number)}" aria-label="Barcode ${escapeHTML(r.barcode_number)}"></svg>`},{key:'source',label:'Registered via',render:r=>escapeHTML(r.source==='generated'?'Generated batch':r.source==='legacy'?'Existing race entry':'Manual or camera scan')},{key:'created_at',label:'Registered',render:r=>escapeHTML(formatDate(r.created_at))}],'No sticker numbers have been registered yet.',false);
    await drawPreviews();
  };
  form.onsubmit=async event=>{event.preventDefault();const code=input.value.trim();if(!code){message('Enter or scan a barcode number first.','error');return;}const submit=form.querySelector('[type=submit]');submit.disabled=true;submit.textContent='Registering…';const {error}=await supabase.rpc('superadmin_register_sticker',{p_barcode_number:code});submit.disabled=false;submit.textContent='Register barcode';if(error){message(error.code==='23505'?'That barcode number is already registered.':dbError(error),'error');return;}form.reset();await load();message(`Barcode ${code} registered globally. Any club can use it.`,'success');};
  currentPageCleanup=bindStickerScanner(view,input);
  await load();
}
async function stickerGeneratePage(view){
  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">SUPERADMIN · GLOBAL REGISTRY</span><h2>Generate Sticker</h2><p>Generate a batch of unique barcodes. Each number is registered automatically and can be used by any club.</p></div></div><section class="panel narrow"><form id="sticker-batch-form" class="form-grid"><label class="field"><span>Sticker batch quantity</span><input name="quantity" type="number" min="1" max="500" step="1" inputmode="numeric" value="20" required></label><div class="form-actions"><button class="button primary" type="submit">Generate and register stickers</button></div></form><p class="small sticker-print-note">Labels contain only a barcode and its number. The Word sheet uses 20 stickers per A4 page.</p></section><section class="panel" data-sticker-preview-panel hidden><div class="panel-heading"><div><h3>Generated sticker batch</h3><p class="small" data-sticker-batch-note></p></div><div class="sticker-actions"><button class="button secondary" type="button" data-export-word>Export Word</button><button class="button primary" type="button" data-print-stickers>Print</button></div></div><div data-sticker-preview></div></section>`;
  const form=view.querySelector('#sticker-batch-form'),previewPanel=view.querySelector('[data-sticker-preview-panel]'),preview=view.querySelector('[data-sticker-preview]');let generatedCodes=[];
  const showBatch=async()=>{
    previewPanel.hidden=false;view.querySelector('[data-sticker-batch-note]').textContent=`${generatedCodes.length} stickers · 20 per A4 page`;
    preview.innerHTML=stickerGroups(generatedCodes).map(group=>`<div class="sticker-preview-page">${stickerSheetTable(group,code=>code?`<td class="sticker-cell"><svg data-sticker-preview="${escapeHTML(code)}" aria-label="Barcode ${escapeHTML(code)}"></svg><strong>${escapeHTML(code)}</strong></td>`:'<td class="sticker-cell sticker-empty" aria-hidden="true"></td>')}</div>`).join('');
    await loadBarcodeRenderer();preview.querySelectorAll('[data-sticker-preview]').forEach(svg=>drawBarcode(svg,svg.dataset.stickerPreview));
  };
  form.onsubmit=async event=>{event.preventDefault();const quantity=Number(form.elements.quantity.value);if(!Number.isInteger(quantity)||quantity<1||quantity>500){message('Choose a batch quantity from 1 to 500.','error');return;}const button=form.querySelector('[type=submit]');button.disabled=true;button.textContent='Generating and registering…';const {data,error}=await supabase.rpc('superadmin_generate_sticker_batch',{p_quantity:quantity});button.disabled=false;button.textContent='Generate and register stickers';if(error){message(authError(error),'error');return;}generatedCodes=(data||[]).map(row=>String(row.barcode_number));if(generatedCodes.length!==quantity){message('The batch may have been saved, but the generated stickers could not be loaded. Refresh the page to check the global registry.','error');return;}try{await showBatch();message(`${generatedCodes.length} unique stickers generated and registered globally.`,'success');}catch(renderError){message(`The stickers were registered, but the barcode preview could not load: ${renderError.message}`,'error');}};
  const buildDocument=async()=>{
    if(!generatedCodes.length)throw new Error('Generate a sticker batch first.');
    const pages=[];for(const group of stickerGroups(generatedCodes)){const cells=await Promise.all(group.map(async number=>({number,image:await barcodePngDataUrl(number)})));pages.push(cells);}
    return wordStickerDocument(pages);
  };
  view.querySelector('[data-export-word]').onclick=async event=>{const button=event.currentTarget;button.disabled=true;button.textContent='Preparing Word…';try{const html=await buildDocument(),blob=new Blob(['\ufeff',html],{type:'application/msword;charset=utf-8'}),link=document.createElement('a'),objectUrl=URL.createObjectURL(blob);link.href=objectUrl;link.download=`mayma-stickers-${new Date().toISOString().slice(0,10)}.doc`;link.click();URL.revokeObjectURL(objectUrl);message('Word sticker sheet downloaded. Open it in Word and print on A4 label paper.','success');}catch(error){message(error.message,'error');}finally{button.disabled=false;button.textContent='Export Word';}};
  view.querySelector('[data-print-stickers]').onclick=async event=>{const button=event.currentTarget,printWindow=window.open('','_blank');if(!printWindow){message('Allow pop-ups to open the print sheet. You can export Word instead.','error');return;}button.disabled=true;button.textContent='Preparing…';try{const html=await buildDocument();printWindow.onload=()=>setTimeout(()=>printWindow.print(),250);printWindow.document.open();printWindow.document.write(html);printWindow.document.close();}catch(error){printWindow.close();message(error.message,'error');}finally{button.disabled=false;button.textContent='Print';}};
}
async function dashboard(view) {
  const queries=[['members','Registered members'],['race_points','Race points'],['races','Race schedules'],['race_entries','Race entries']];
  const results=await Promise.all(queries.map(async([table,label])=>{const {count,error}=await supabase.from(table).select('*',{count:'exact',head:true});if(error)throw error;return [label,count||0];}));
  const {data:races,error}=await supabase.from('races').select('id,name,status,release_location,release_at_utc').order('id',{ascending:false}).limit(5);if(error)throw error;
  view.innerHTML=`<div class="welcome-row"><div><span class="eyebrow">RACE DESK</span><h2>Your club at a glance</h2><p>Manage members, schedules, pigeon entries, and clock receipts.</p></div><a class="button primary" href="${url('pages/admin/races/index.html')}">＋ Create a race</a></div><div class="stats-grid">${results.map(([label,count],i)=>`<article class="stat-card"><div class="stat-label"><span class="stat-glyph">${['♙','⌖','◷','▤'][i]}</span>${label}</div><strong>${count.toLocaleString()}</strong><span class="stat-foot">Current records</span></article>`).join('')}</div><section class="panel"><div class="panel-heading"><div><span class="eyebrow">SCHEDULE</span><h2>Recent races</h2></div><a class="quiet-link" href="${url('pages/admin/races/index.html')}">All races ↗</a></div>${tableRows(races||[],[{key:'name',label:'Race'},{key:'release_location',label:'Release point'},{key:'release_at_utc',label:'Release time',render:r=>escapeHTML(formatDate(r.release_at_utc))},{key:'status',label:'Status',render:r=>stateTag(r.status)}],'Create a race schedule to begin.',false)}</section>`;
}
async function initCrud(view,table,canManageAccounts) {
  const isMembers=table==='members';
  const columns=isMembers?[
    {key:'member_no',label:'Member ID'},
    {key:'full_name',label:'Name'},
    {key:'loft_name',label:'Loft'},
    {key:'paid',label:'Paid',render:r=>r.paid?'Yes':'No'},
    ...(canManageAccounts?[{key:'username',label:'Login',render:r=>r.username?`${escapeHTML(r.username)} <button class="text-button" data-member-username="${escapeHTML(r.user_id)}" data-current-username="${escapeHTML(r.username)}">Change username</button><button class="text-button" data-reset="${escapeHTML(r.id)}">Reset password</button>`:`<button class="text-button" data-login="${escapeHTML(r.id)}">Create login</button>`}]:[])
  ]:[{key:'location',label:'Location'},{key:'sector',label:'Sector'},{key:'latitude',label:'Latitude'},{key:'longitude',label:'Longitude'}];
  const accountFields=isMembers&&canManageAccounts?'<label class="field" data-account-field><span>Login username (optional)</span><input name="account_username" minlength="3" maxlength="32" pattern="[A-Za-z0-9][A-Za-z0-9_.\\-]{2,31}" autocomplete="off" autocapitalize="none" spellcheck="false"></label><label class="field" data-account-field><span>Login password (8+ characters)</span><input name="account_password" type="password" minlength="8" autocomplete="new-password"></label>':'';
  const formMarkup=genericForm(fields[table]).replace('<div class="form-actions">',`${accountFields}<div class="form-actions">`);
  const formPanel=`<section class="panel" ${isMembers?'data-member-form-panel hidden':''}><div class="panel-heading"><h3 data-form-title>${isMembers?'Add a member':'Add a race point'}</h3></div>${formMarkup}</section>`;
  const listPanel=`<section class="panel"><div class="panel-heading"><h3>${isMembers?'Member list':'Saved locations'}</h3>${isMembers?'<div class="member-list-actions"><button class="button secondary" type="button" data-download-member-template>Excel template</button><button class="button secondary" type="button" data-open-member-import>Import Excel</button><input id="member-import-file" type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" hidden><button class="button primary" type="button" data-add-member>＋ Add member</button></div>':''}</div><div data-table></div></section>`;
  const importPanel=isMembers?`<section class="panel member-import-panel" data-member-import-panel hidden><div class="panel-heading"><div><h3>Excel import preview</h3><p class="small">Reads the first worksheet using its first row of column headings. Required: Member ID, Full name, Loft name, and coordinates as decimal Latitude/Longitude or hemisphere, degrees, minutes, and seconds.</p></div><span class="count-pill" data-import-summary></span></div><div data-import-errors></div><div data-import-preview></div><div class="form-actions"><button class="button secondary" type="button" data-cancel-member-import>Cancel</button><button class="button primary" type="button" data-confirm-member-import disabled>Import members</button></div></section>`:'';
  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">${isMembers?'CLUB DIRECTORY':'RELEASE LOCATIONS'}</span><h2>${isMembers?'Members & lofts':'Race points'}</h2><p>${isMembers?'Maintain member records and loft coordinates.':'Save release points for new race schedules.'}</p></div><span class="count-pill" data-count>— records</span></div>${isMembers?`${listPanel}${importPanel}${formPanel}`:`${formPanel}${listPanel}`}`;
  bindGeneric(view,table,fields[table],columns,{},isMembers&&canManageAccounts);
}

async function teamAccountsPage(view,identity) {
  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">CLUB ACCESS</span><h2>Team accounts</h2><p>Create another administrator or staff login for this club.</p></div><div class="team-account-heading-actions"><span class="count-pill" data-team-count>— accounts</span><button class="button primary" type="button" data-open-team-dialog>＋ Add account</button></div></div><section class="panel"><div class="panel-heading"><div><h3>Club team</h3><p class="muted small">Staff can manage members, races, entries, and clocking. Administrators can also manage team accounts.</p></div></div><div data-team-table></div></section><dialog class="account-dialog" data-team-dialog aria-labelledby="team-dialog-title"><form class="account-dialog-form" id="team-account-form"><div class="account-dialog-heading"><div><span class="eyebrow">CLUB LOGIN</span><h2 id="team-dialog-title" data-team-dialog-title>Create team account</h2></div><button class="text-button" type="button" data-close-team-dialog aria-label="Close dialog">✕</button></div><p class="account-dialog-copy" data-team-dialog-copy>Create a username and password for the new team member.</p><label class="field"><span>Username</span><input name="username" type="text" minlength="3" maxlength="32" pattern="[A-Za-z0-9][A-Za-z0-9_.-]{2,31}" autocomplete="off" autocapitalize="none" spellcheck="false" required></label><label class="field"><span data-team-password-label>Password · 8 or more characters</span><input name="password" type="password" minlength="8" autocomplete="new-password" required></label><label class="field" data-team-role-field><span>Role</span><select name="role"><option value="staff">Staff · routine club work</option><option value="admin">Administrator · manage team accounts</option></select></label><div class="form-actions"><button class="button secondary" type="button" data-close-team-dialog>Cancel</button><button class="button primary" type="submit" data-team-submit>Create account</button></div></form></dialog>`;
  const form=view.querySelector('#team-account-form'),table=view.querySelector('[data-team-table]'),dialog=view.querySelector('[data-team-dialog]'),usernameInput=form.elements.username,passwordInput=form.elements.password,roleField=view.querySelector('[data-team-role-field]');
  let editingUser=null,teamUsers=[];
  const openCreateDialog=()=>{editingUser=null;form.reset();view.querySelector('[data-team-dialog-title]').textContent='Create team account';view.querySelector('[data-team-dialog-copy]').textContent='Create a username and password for the new team member.';view.querySelector('[data-team-password-label]').textContent='Password · 8 or more characters';passwordInput.required=true;passwordInput.placeholder='';roleField.hidden=false;form.querySelector('[data-team-submit]').textContent='Create account';dialog.showModal();usernameInput.focus();};
  view.querySelector('[data-open-team-dialog]').onclick=openCreateDialog;
  view.querySelectorAll('[data-close-team-dialog]').forEach(button=>button.onclick=()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  async function load(){
    const {data,error}=await supabase.from('app_profiles').select('id,username,role,is_active').eq('club_id',identity.profile.club_id).in('role',['admin','staff']).order('username');
    if(error)throw error;
    teamUsers=data||[];
    view.querySelector('[data-team-count]').textContent=`${teamUsers.length} account${teamUsers.length===1?'':'s'}`;
    table.innerHTML=`<div class="table-scroll"><table><thead><tr><th>Username</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>${teamUsers.length?teamUsers.map(user=>`<tr><td data-label="Username">${escapeHTML(user.username)}</td><td data-label="Role">${escapeHTML(titleCase(user.role))}</td><td data-label="Status">${stateTag(user.is_active?'active':'inactive')}</td><td class="row-actions" data-label="Actions"><button class="text-button" data-edit-team="${escapeHTML(user.id)}">Edit username/password</button><button class="text-button ${user.is_active?'danger-text':''}" data-team-active="${escapeHTML(user.id)}" data-next-active="${user.is_active?'false':'true'}" ${user.id===identity.profile.id&&user.is_active?'disabled title="You cannot disable your own account"':''}>${user.is_active?'Disable':'Reactivate'}</button></td></tr>`).join(''):'<tr><td colspan="4" class="empty-cell">No team accounts found.</td></tr>'}</tbody></table></div>`;
    table.querySelectorAll('[data-edit-team]').forEach(button=>button.onclick=()=>{
      editingUser=teamUsers.find(user=>user.id===button.dataset.editTeam);if(!editingUser)return;
      form.reset();usernameInput.value=editingUser.username;passwordInput.required=false;passwordInput.placeholder='Leave blank to keep the current password';
      view.querySelector('[data-team-dialog-title]').textContent='Update team account';view.querySelector('[data-team-dialog-copy]').textContent='Change the username, set a new password, or update both.';view.querySelector('[data-team-password-label]').textContent='New password · optional';roleField.hidden=true;form.querySelector('[data-team-submit]').textContent='Save changes';dialog.showModal();usernameInput.focus();
    });
    table.querySelectorAll('[data-team-active]').forEach(button=>button.onclick=async()=>{
      const active=button.dataset.nextActive==='true';
      if(!confirm(`${active?'Reactivate':'Disable'} this team account?`))return;
      const {error}=await supabase.rpc('admin_set_team_active',{p_user_id:button.dataset.teamActive,p_active:active});
      if(error){message(authError(error),'error');return;}
      await load();
      message(`Team account ${active?'reactivated':'disabled'}.`,'success');
    });
  }
  form.onsubmit=async event=>{
    event.preventDefault();
    const username=form.elements.username.value.trim().toLowerCase();
    const password=form.elements.password.value;
    const role=form.elements.role.value;
    if(!USERNAME_RE.test(username)){alert(USERNAME_HELP);return;}
    if((!editingUser||password)&&password.length<8){alert('Password must be at least 8 characters.');return;}
    if(editingUser&&!password&&username===editingUser.username){alert('Enter a new username or a new password.');return;}
    const creating=!editingUser,confirmation=creating?`Create a ${titleCase(role)} account for ${username}?`:`Save the login changes for ${username}?`;
    if(!confirm(confirmation))return;
    const button=form.querySelector('[type="submit"]');button.disabled=true;button.textContent=creating?'Creating…':'Saving…';
    const {error}=creating
      ?await supabase.rpc('admin_create_team_account',{p_username:username,p_password:password,p_role:role})
      :await supabase.rpc('admin_update_user_credentials',{p_user_id:editingUser.id,p_username:username===editingUser.username?null:username,p_password:password||null});
    button.disabled=false;button.textContent=creating?'Create account':'Save changes';
    if(error){alert(authError(error));return;}
    dialog.close();form.reset();const summary=creating?`${titleCase(role)} account created for ${username}.`:`Login credentials updated for ${username}.`;editingUser=null;await load();alert(summary);
  };
  await load();
}
async function racesPage(view) {
  const {data:points,error}=await supabase.from('race_points').select('id,location,sector,latitude,longitude').order('location');if(error)throw error;
  const {data:races,error:raceError}=await supabase.from('races').select('*').order('id',{ascending:false});if(raceError)throw raceError;
  const {data:entries,error:entryError}=await supabase.from('race_entries').select('race_id');if(entryError)throw entryError;
  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">RACE CALENDAR</span><h2>Race schedules</h2><p>Save a schedule first, then add its official release date and time when ready.</p></div></div><section class="panel"><h3>Create a race</h3><form id="race-form" class="form-grid"><label class="field"><span>Race name</span><input name="name" maxlength="180" required></label><label class="field"><span>Release point</span><select name="race_point_id" required><option value="">Choose a location</option>${points.map(p=>`<option value="${p.id}">${escapeHTML(p.sector)} · ${escapeHTML(p.location)}</option>`).join('')}</select></label><div class="form-actions"><button class="button primary">Create schedule</button></div></form></section><section class="panel"><div class="panel-heading"><h3>All schedules</h3></div>${tableRows(races.map(r=>({...r,entry_count:entries.filter(e=>e.race_id===r.id).length})),[{key:'name',label:'Race'},{key:'release_location',label:'Release point'},{key:'release_at_utc',label:'Release time',render:r=>escapeHTML(formatDate(r.release_at_utc))},{key:'entry_count',label:'Pigeons'},{key:'status',label:'Status',render:r=>stateTag(r.status)},{key:'status',label:'Change status',render:r=>`<select data-status="${r.id}" aria-label="Race status"><option ${r.status==='draft'?'selected':''}>draft</option><option ${r.status==='open'?'selected':''}>open</option><option ${r.status==='closed'?'selected':''}>closed</option></select>`},{key:'release_at_utc',label:'Add release date and time',render:r=>`<div class="race-release-editor"><input type="datetime-local" data-release-at="${r.id}" aria-label="Release date and time for ${escapeHTML(r.name)}" value="${utcToPhDateTimeLocal(r.release_at_utc)}"><button type="button" class="button secondary" data-save-release="${r.id}">${r.release_at_utc?'Save time':'Add time'}</button></div>`}], 'No schedules yet.',false)}</section>`;
  view.querySelector('#race-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;const point=points.find(p=>p.id===Number(f.race_point_id.value));if(!point)return;const {error}=await supabase.from('races').insert({name:f.name.value.trim(),race_point_id:point.id,release_location:point.location,release_latitude:point.latitude,release_longitude:point.longitude,release_at_utc:null,status:'draft'});if(error){message(dbError(error),'error');return;}location.reload();};
  view.querySelectorAll('[data-save-release]').forEach(button=>button.onclick=async()=>{const id=Number(button.dataset.saveRelease),race=races.find(item=>item.id===id),input=view.querySelector(`[data-release-at="${id}"]`);if(!race||!input)return;if(!input.value&&race.status==='open'){input.value=utcToPhDateTimeLocal(race.release_at_utc);message('Close this race before removing its release date and time.','error');return;}const releaseAt=phDateTimeLocalToUtc(input.value);if(input.value&&!releaseAt){message('Enter a valid release date and time.','error');return;}button.disabled=true;const {error}=await supabase.from('races').update({release_at_utc:releaseAt}).eq('id',id);button.disabled=false;if(error){message(dbError(error),'error');return;}race.release_at_utc=releaseAt;button.textContent=releaseAt?'Save time':'Add time';message(releaseAt?'Release date and time saved.':'Release date and time cleared.','success');});
  view.querySelectorAll('[data-status]').forEach(el=>{const race=races.find(item=>item.id===Number(el.dataset.status));el.onchange=async()=>{if(el.value==='open'&&!race?.release_at_utc){el.value=race?.status||'draft';message('Add a release date and time before opening this race.','error');return;}const previous=race?.status||'draft';el.disabled=true;const {error}=await supabase.from('races').update({status:el.value}).eq('id',el.dataset.status);el.disabled=false;if(error){el.value=previous;message(dbError(error),'error');return;}if(race)race.status=el.value;message('Race status updated.','success');};});
}
function distanceMeters(lat1,lon1,lat2,lon2){const rad=n=>n*Math.PI/180;const a=Math.sin(rad(lat2-lat1)/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(rad(lon2-lon1)/2)**2;return 6371008.8*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
function mountEntrySheetImport(view,races,members,entries){
  const existingForm=view.querySelector('#entry-form'),submitHandler=existingForm?.onsubmit;
  const raceOptions=races.map(race=>`<option value="${race.id}">${escapeHTML(race.name)}</option>`).join('');
  const importPanel=`<section class="panel entry-sheet-panel"><div class="panel-heading"><div><h3>Scan or upload a race sheet</h3><p class="small">Reads the row number, member ID, and ring, skips the next column, and scans each barcode in the final column. Review every row before saving.</p></div></div><div class="entry-sheet-controls"><label class="field"><span>Race schedule</span><select data-sheet-race><option value="">Choose a race</option>${raceOptions}</select></label><label class="field"><span>Document photo or PDF</span><input type="file" data-sheet-file accept="image/*,.pdf,application/pdf" capture="environment"><small class="small">PDF uploads read the first page. Use a clear photo; rotate the preview if the text is sideways.</small></label></div><div class="entry-sheet-actions"><button class="button secondary" type="button" data-rotate-sheet disabled>Rotate 90°</button><button class="button primary" type="button" data-read-sheet disabled>Read sheet + scan barcodes</button></div><p class="entry-sheet-status" data-sheet-status aria-live="polite">Upload a photo or PDF to start.</p><div class="entry-sheet-preview" data-sheet-preview hidden><canvas data-sheet-preview-canvas></canvas></div><section class="entry-sheet-review" data-sheet-review hidden><div class="panel-heading"><div><h3>Review scanned entries</h3><p class="small">All detected rows stay in the table. Red rows show errors; fix them before saving those entries.</p></div><span class="count-pill" data-sheet-count></span></div><div data-sheet-table></div><div class="form-actions"><button class="button secondary" type="button" data-clear-sheet>Clear scan</button><button class="button primary" type="button" data-save-sheet disabled>Save valid entries</button></div></section></section>`;
  view.innerHTML=view.innerHTML.replace('<section class="panel"><h3>Register a pigeon</h3>',`${importPanel}<section class="panel"><h3>Register a pigeon</h3>`);
  const newForm=view.querySelector('#entry-form');if(newForm&&submitHandler)newForm.onsubmit=submitHandler;
  const registeredPanel=[...view.querySelectorAll('.panel')].find(panel=>panel.querySelector('h3')?.textContent==='Registered pigeons');
  if(registeredPanel)registeredPanel.innerHTML='<div class="panel-heading"><h3>Registered pigeons</h3></div><div data-registered-entries></div>';
  const fileInput=view.querySelector('[data-sheet-file]'),raceSelect=view.querySelector('[data-sheet-race]'),readButton=view.querySelector('[data-read-sheet]'),rotateButton=view.querySelector('[data-rotate-sheet]'),status=view.querySelector('[data-sheet-status]'),preview=view.querySelector('[data-sheet-preview]'),previewCanvas=view.querySelector('[data-sheet-preview-canvas]'),review=view.querySelector('[data-sheet-review]'),table=view.querySelector('[data-sheet-table]'),count=view.querySelector('[data-sheet-count]'),saveButton=view.querySelector('[data-save-sheet]');
  if(!fileInput)return;
  let sourceCanvas=null,rotation=0,rows=[],validationTimer=null,validationSequence=0;
  const drawRegistered=()=>{const mapped=entries.map(entry=>({...entry,member:members.find(member=>member.id===entry.member_id),race:races.find(race=>race.id===entry.race_id)}));view.querySelector('[data-registered-entries]').innerHTML=tableRows(mapped,[{key:'race',label:'Race',render:item=>escapeHTML(item.race?.name||'—')},{key:'member',label:'Member',render:item=>`${escapeHTML(item.member?.member_no||'—')} · ${escapeHTML(item.member?.full_name||'')}`},{key:'pigeon_ring',label:'Ring'},{key:'barcode',label:'Barcode'},{key:'distance_m',label:'Distance',render:item=>`${number(item.distance_m)} m`}],'No pigeons registered.',false);};
  drawRegistered();
  const redrawRows=()=>{
    review.hidden=!rows.length;count.textContent=`${rows.length} row${rows.length===1?'':'s'}`;
    table.innerHTML=rows.length?`<div class="table-scroll entry-sheet-table"><table><thead><tr><th>Sheet row</th><th>Member ID</th><th>Ring</th><th>Barcode</th><th>Error / status</th><th></th></tr></thead><tbody>${rows.map(row=>`<tr data-sheet-row="${escapeHTML(row.id)}" class="${row.saved?'is-saved':row.errors?.length?'has-errors':''}"><td data-label="Sheet row"><span class="entry-sheet-row-number">${escapeHTML(row.sheetRow)}</span></td><td data-label="Member ID"><input class="entry-sheet-input" data-sheet-field="member_no" data-sheet-id="${escapeHTML(row.id)}" maxlength="120" value="${escapeHTML(row.member_no)}" aria-label="Member ID, source row ${escapeHTML(row.sheetRow)}" ${row.saved?'disabled':''}></td><td data-label="Ring"><input class="entry-sheet-input" data-sheet-field="pigeon_ring" data-sheet-id="${escapeHTML(row.id)}" maxlength="80" value="${escapeHTML(row.pigeon_ring)}" aria-label="Ring number, source row ${escapeHTML(row.sheetRow)}" ${row.saved?'disabled':''}></td><td data-label="Barcode"><input class="entry-sheet-input" data-sheet-field="barcode" data-sheet-id="${escapeHTML(row.id)}" maxlength="120" value="${escapeHTML(row.barcode)}" aria-label="Barcode, source row ${escapeHTML(row.sheetRow)}" ${row.saved?'disabled':''}></td><td data-label="Error / status"><span class="entry-sheet-row-status ${row.saved?'is-saved':row.errors?.length?'has-error':''}" data-sheet-row-status="${escapeHTML(row.id)}">${row.saved?'Saved':'Checking…'}</span></td><td data-label="Remove"><button class="text-button danger-text" type="button" data-remove-sheet-row="${escapeHTML(row.id)}" ${row.saved?'disabled':''}>Remove</button></td></tr>`).join('')}</tbody></table></div>`:'';
    table.querySelectorAll('[data-sheet-field]').forEach(input=>input.addEventListener('input',()=>{const row=rows.find(item=>item.id===input.dataset.sheetId);if(row){row[input.dataset.sheetField]=input.value;if(input.dataset.sheetField==='barcode')row.barcodeScanError='';}clearTimeout(validationTimer);validationTimer=setTimeout(()=>validateRows(),400);}));
    table.querySelectorAll('[data-remove-sheet-row]').forEach(button=>button.onclick=()=>{rows=rows.filter(row=>row.id!==button.dataset.removeSheetRow);redrawRows();validateRows();});
  };
  async function validateRows(){
    const sequence=++validationSequence,raceId=Number(raceSelect.value),codes=[...new Set(rows.filter(row=>!row.saved).map(row=>row.barcode.trim()).filter(code=>code&&code.length<=120))],registered=new Set();let registryError=null;
    for(let offset=0;offset<codes.length;offset+=100){const {data,error}=await supabase.from('barcode_stickers').select('barcode_number').in('barcode_number',codes.slice(offset,offset+100));if(error){registryError=error;break;}for(const sticker of data||[])registered.add(sticker.barcode_number);}
    if(sequence!==validationSequence)return;
    const raceEntries=entries.filter(entry=>entry.race_id===raceId),seenRings=new Set(),seenCodes=new Set();let ready=0,savedCount=0,errorCount=0;
    for(const row of rows){
      const indicator=table.querySelector(`[data-sheet-row-status="${row.id}"]`),rowElement=table.querySelector(`[data-sheet-row="${row.id}"]`);
      if(row.saved){row.errors=[];savedCount++;if(indicator){indicator.textContent='Saved';indicator.classList.remove('has-error','is-ready');indicator.classList.add('is-saved');}rowElement?.classList.remove('has-errors');rowElement?.classList.add('is-saved');continue;}
      const errors=[],memberCode=row.member_no.trim(),ring=row.pigeon_ring.trim().toUpperCase(),barcode=row.barcode.trim();
      row.member=members.find(member=>String(member.member_no).trim().toUpperCase()===memberCode.toUpperCase())||members.find(member=>String(member.id)===memberCode)||null;
      if(!raceId)errors.push('Choose a race.');
      if(!memberCode||!row.member)errors.push('Member ID is not registered in this club.');
      if(!ring)errors.push('Ring number is missing.');
      if(!barcode)errors.push(row.barcodeScanError||'Barcode is missing.');
      else if(row.barcodeScanError)errors.push(row.barcodeScanError);
      if(barcode.length>120)errors.push('Barcode is longer than 120 characters.');
      if(registryError&&barcode)errors.push('Could not verify the sticker registry. Check the connection.');
      else if(barcode&&!registered.has(barcode))errors.push('Barcode is not registered by Super Admin.');
      if(ring&&raceEntries.some(entry=>String(entry.pigeon_ring||'').toUpperCase()===ring))errors.push('Ring is already registered for this race.');
      if(barcode&&raceEntries.some(entry=>entry.barcode===barcode))errors.push('Barcode is already registered for this race.');
      if(ring&&seenRings.has(ring))errors.push('Ring is duplicated in this scan.');
      if(barcode&&seenCodes.has(barcode))errors.push('Barcode is duplicated in this scan.');
      if(ring)seenRings.add(ring);if(barcode)seenCodes.add(barcode);row.errors=errors;if(!errors.length)ready++;else errorCount++;
      if(indicator){indicator.textContent=errors.length?errors.join(' '):'Ready to save';indicator.classList.toggle('has-error',errors.length>0);indicator.classList.toggle('is-ready',!errors.length);indicator.classList.remove('is-saved');}
      rowElement?.classList.toggle('has-errors',errors.length>0);rowElement?.classList.remove('is-saved');
    }
    saveButton.disabled=!ready||!raceId;saveButton.textContent=ready?`Save ${ready} valid entr${ready===1?'y':'ies'}`:'Save valid entries';count.textContent=`${rows.length} items · ${savedCount} saved · ${ready} ready · ${errorCount} errors`;
  }
  const drawPreview=()=>{if(!sourceCanvas)return;const rotated=rotateDocumentCanvas(sourceCanvas,rotation);previewCanvas.width=rotated.width;previewCanvas.height=rotated.height;previewCanvas.getContext('2d').drawImage(rotated,0,0);preview.hidden=false;rotateButton.disabled=false;readButton.disabled=false;};
  fileInput.onchange=async()=>{const file=fileInput.files?.[0];if(!file)return;rows=[];redrawRows();readButton.disabled=true;rotateButton.disabled=true;status.textContent='Preparing the document…';try{sourceCanvas=await documentFileToCanvas(file);rotation=0;drawPreview();status.textContent=`${file.name} is ready. Rotate if needed, then read it.`;}catch(error){sourceCanvas=null;preview.hidden=true;status.textContent=error.message;message(error.message,'error');}};
  rotateButton.onclick=()=>{rotation=(rotation+90)%360;drawPreview();status.textContent=`Preview rotated ${rotation}°. Read it when the text is upright.`;};
  readButton.onclick=async()=>{
    if(!sourceCanvas)return;if(!Number(raceSelect.value)){message('Choose the race schedule for this sheet first.','error');raceSelect.focus();return;}
    readButton.disabled=true;rotateButton.disabled=true;status.textContent='Loading the document reader…';let worker=null;
    try{
      const OCR=await loadDocumentOCR();worker=await OCR.createWorker('eng',1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',langPath:'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int',logger:progress=>{if(progress.status==='recognizing text')status.textContent=`Reading document… ${Math.round((progress.progress||0)*100)}%`;else if(progress.status)status.textContent=`${progress.status}…`;}});
      const rotated=rotateDocumentCanvas(sourceCanvas,rotation),result=await worker.recognize(rotated);rows=entrySheetRowsFromOCR(result.data,rotated);redrawRows();
      if(!rows.length){status.textContent='No rows were detected. Rotate the document or use a clearer scan, then try again.';review.hidden=true;return;}
      status.textContent=`Detected ${rows.length} item${rows.length===1?'':'s'}. Scanning each barcode…`;
      try{const barcodeReader=await loadDocumentBarcodeReader();await scanSheetBarcodes(rotated,rows,barcodeReader,(current,total)=>{status.textContent=`Scanning barcode images… ${current} of ${total}`;});}
      catch(error){console.warn('Race-sheet barcode decoding is unavailable:',error);rows.forEach(row=>{row.barcodeDetected=false;row.barcodeScanError='Barcode scanner could not load. Type or confirm this barcode manually.';});}
      redrawRows();status.textContent=`Scanned ${rows.length} item${rows.length===1?'':'s'}. Red rows show the errors to fix; review the OCR values before saving.`;await validateRows();review.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){status.textContent=error.message||'Could not read this document.';message(status.textContent,'error');}
    finally{if(worker)await worker.terminate();readButton.disabled=!sourceCanvas;rotateButton.disabled=!sourceCanvas;}
  };
  raceSelect.onchange=()=>{if(rows.length)validateRows();};
  view.querySelector('[data-clear-sheet]').onclick=()=>{rows=[];sourceCanvas=null;rotation=0;fileInput.value='';preview.hidden=true;review.hidden=true;readButton.disabled=true;rotateButton.disabled=true;saveButton.disabled=true;status.textContent='Upload a photo or PDF to start.';};
  saveButton.onclick=async()=>{
    await validateRows();const race=races.find(item=>item.id===Number(raceSelect.value)),valid=rows.filter(row=>!row.saved&&!row.errors.length&&row.member);if(!race||!valid.length){message('There are no valid rows to save. Correct the red rows in the table.','error');return;}
    const payload=valid.map(row=>({race_id:race.id,member_id:row.member.id,pigeon_ring:row.pigeon_ring.trim().toUpperCase(),barcode:row.barcode.trim(),pooling:0,category:'Open Category',race_type:'Regular Race/Set',distance_m:distanceMeters(race.release_latitude,race.release_longitude,row.member.latitude,row.member.longitude)}));
    saveButton.disabled=true;saveButton.textContent='Saving…';const {error}=await supabase.from('race_entries').insert(payload);if(error){message(dbError(error),'error');await validateRows();return;}
    valid.forEach(row=>{row.saved=true;row.errors=[];});entries.unshift(...payload.map((entry,index)=>({...entry,id:`sheet-entry-${Date.now()}-${index}`})));drawRegistered();redrawRows();await validateRows();
    const errorsLeft=rows.filter(row=>!row.saved).length;status.textContent=errorsLeft?`Saved ${valid.length} pigeon${valid.length===1?'':'s'}; ${errorsLeft} row${errorsLeft===1?'':'s'} still have errors.`:`Saved ${valid.length} pigeon${valid.length===1?'':'s'}. All scanned items remain visible in the table.`;message(status.textContent,errorsLeft?'info':'success');
  };
}
async function entriesPage(view) {
  const [{data:races,error:a},{data:members,error:b}]=await Promise.all([supabase.from('races').select('*').order('id',{ascending:false}),supabase.from('members').select('id,member_no,full_name,loft_name,latitude,longitude').order('member_no')]);if(a||b)throw a||b;
  const {data:entries,error}=await supabase.from('race_entries').select('*').order('id',{ascending:false});if(error)throw error;
  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">PIGEON ROSTER</span><h2>Race entries</h2><p>Register each pigeon once for the selected schedule.</p></div></div><section class="panel"><h3>Register a pigeon</h3><form id="entry-form" class="form-grid"><label class="field"><span>Race schedule</span><select name="race_id" required><option value="">Choose a race</option>${races.map(r=>`<option value="${r.id}">${escapeHTML(r.name)}</option>`).join('')}</select></label><label class="field"><span>Member</span><select name="member_id" required><option value="">Choose a member</option>${members.map(m=>`<option value="${m.id}">${escapeHTML(m.member_no)} · ${escapeHTML(m.full_name)}</option>`).join('')}</select></label><label class="field"><span>Ring number</span><input name="pigeon_ring" maxlength="80" required></label><label class="field"><span>Race barcode · global sticker</span><input name="barcode" maxlength="120" required autocomplete="off" autocapitalize="none" autocorrect="off" placeholder="Type or scan the registered number"><small class="small">Use a sticker registered by Super Admin. The same global barcode can be used by any club.</small></label><label class="field"><span>Category</span><select name="category"><option>Open Category</option><option>Young Bird</option><option>Old Bird</option><option>Special Category</option></select></label><label class="field"><span>Race type</span><select name="race_type"><option>Regular Race/Set</option><option>Training Toss</option><option>Special Race</option></select></label><label class="field"><span>Pooling</span><select name="pooling"><option value="0">No</option><option value="1">Yes</option></select></label><div class="form-actions"><button class="button primary">Save entry</button></div></form></section><section class="panel"><div class="panel-heading"><h3>Registered pigeons</h3></div>${tableRows(entries.map(e=>({...e,member:members.find(m=>m.id===e.member_id),race:races.find(r=>r.id===e.race_id)})),[{key:'race',label:'Race',render:r=>escapeHTML(r.race?.name||'—')},{key:'member',label:'Member',render:r=>`${escapeHTML(r.member?.member_no||'—')} · ${escapeHTML(r.member?.full_name||'')}`},{key:'pigeon_ring',label:'Ring'},{key:'barcode',label:'Barcode'},{key:'distance_m',label:'Distance',render:r=>`${number(r.distance_m)} m`}],'No pigeons registered.',false)}</section>`;
  view.querySelector('#entry-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,m=members.find(x=>x.id===Number(f.member_id.value)),r=races.find(x=>x.id===Number(f.race_id.value)),barcode=f.barcode.value.trim();if(!m||!r)return;const {data:sticker,error:stickerError}=await supabase.from('barcode_stickers').select('barcode_number').eq('barcode_number',barcode).maybeSingle();if(stickerError){message(stickerError.message.includes('barcode_stickers')?'The global sticker registry is not installed. Run sticker-barcodes.sql in Supabase SQL Editor.':stickerError.message,'error');return;}if(!sticker){message('This barcode is not registered. Ask the Super Admin to register it first.','error');return;}const {error}=await supabase.from('race_entries').insert({race_id:r.id,member_id:m.id,pigeon_ring:f.pigeon_ring.value.trim().toUpperCase(),barcode,pooling:Number(f.pooling.value),category:f.category.value,race_type:f.race_type.value,distance_m:distanceMeters(r.release_latitude,r.release_longitude,m.latitude,m.longitude)});if(error){message(dbError(error),'error');return;}location.reload();};
  mountEntrySheetImport(view,races,members,entries);
}
async function clockPage(view,identity) {
 const [{data:races,error:a},{data:entries,error:b}]=await Promise.all([supabase.from('races').select('id,name,status,release_at_utc').eq('status','open').order('id',{ascending:false}),supabase.from('race_entries').select('id,race_id,member_id,pigeon_ring,barcode').order('id')]);if(a||b)throw a||b;
 view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">SERVER TIMESTAMP</span><h2>Record an arrival</h2><p>Choose a registered pigeon. Supabase stores the server receipt time.</p></div></div><section class="panel narrow"><form id="admin-clock-form" class="form-grid"><label class="field"><span>Open race</span><select name="race_id" required><option value="">Choose a race</option>${races.map(r=>`<option value="${r.id}">${escapeHTML(r.name)}</option>`).join('')}</select></label><label class="field"><span>Race entry</span><select name="entry_id" required><option value="">Choose a pigeon</option>${entries.filter(e=>races.some(r=>r.id===e.race_id)).map(e=>`<option value="${e.id}">${escapeHTML(e.pigeon_ring)} · ${escapeHTML(e.barcode)}</option>`).join('')}</select></label><div class="form-actions"><button class="button primary">Record provisional clock</button></div></form></section><section class="panel"><div class="panel-heading"><h3>Recent receipts</h3><a class="quiet-link" href="${url('pages/admin/results/index.html')}">View results ↗</a></div><div data-receipts>Loading…</div></section>`;
 const raceSelect=view.querySelector('[name=race_id]'),entrySelect=view.querySelector('[name=entry_id]');raceSelect.onchange=()=>{for(const option of entrySelect.options){if(!option.value)continue;const entry=entries.find(x=>x.id===Number(option.value));option.hidden=entry?.race_id!==Number(raceSelect.value);}};
 view.querySelector('#admin-clock-form').onsubmit=async e=>{e.preventDefault();const {data,error}=await supabase.rpc('admin_record_clock',{p_entry_id:Number(entrySelect.value)});if(error){message(error.message,'error');return;}message(data?.message||'Clock recorded.','success');await loadClocks();};
 async function loadClocks(){const {data,error}=await supabase.from('clock_events').select('*').order('received_at_utc',{ascending:false}).limit(20);if(error){view.querySelector('[data-receipts]').textContent='Could not load receipts.';return;}const {data:allEntries}=await supabase.from('race_entries').select('id,pigeon_ring,race_id');const {data:allRaces}=await supabase.from('races').select('id,name');const mapped=(data||[]).map(c=>({...c,entry:allEntries.find(e=>e.id===c.race_entry_id),race:allRaces.find(r=>r.id===allEntries.find(e=>e.id===c.race_entry_id)?.race_id)}));view.querySelector('[data-receipts]').innerHTML=tableRows(mapped,[{key:'received_at_utc',label:'Received',render:r=>escapeHTML(formatDate(r.received_at_utc))},{key:'race',label:'Race',render:r=>escapeHTML(r.race?.name||'—')},{key:'entry',label:'Ring',render:r=>escapeHTML(r.entry?.pigeon_ring||'—')},{key:'verification',label:'Status',render:r=>stateTag(r.verification)}],'No arrivals have been recorded.',false);}
 await loadClocks();
}
async function resultsPage(view) {
 const [{data:races,error:a},{data:entries,error:b},{data:clocks,error:c},{data:members,error:d}]=await Promise.all([supabase.from('races').select('*').order('id',{ascending:false}),supabase.from('race_entries').select('*'),supabase.from('clock_events').select('*'),supabase.from('members').select('id,member_no,full_name,loft_name')]);if(a||b||c||d)throw a||b||c||d;
 const rows=entries.map(e=>{const clock=clocks.find(x=>x.race_entry_id===e.id),race=races.find(x=>x.id===e.race_id),member=members.find(x=>x.id===e.member_id);const seconds=clock&&race?(new Date(clock.received_at_utc+'Z')-new Date(race.release_at_utc+'Z'))/1000:null;return {...e,clock,race,member,seconds,velocity:seconds>0?e.distance_m*60/seconds:null};});
 const ranked=rows.filter(r=>r.velocity!==null&&r.clock.verification!=='rejected').sort((x,y)=>y.velocity-x.velocity);ranked.forEach((r,i)=>r.rank=i+1);
 view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">PROVISIONAL LEADERBOARD</span><h2>Race results</h2><p>Ranked by calculated velocity. Club verification is still required.</p></div><label class="field race-filter"><span>Schedule</span><select id="race-filter"><option value="all">All races</option>${races.map(r=>`<option value="${r.id}">${escapeHTML(r.name)}</option>`).join('')}</select></label></div><section class="panel"><div id="results-table"></div></section>`;
 const filter=view.querySelector('#race-filter');function draw(){const list=rows.filter(r=>filter.value==='all'||String(r.race_id)===filter.value).sort((x,y)=>(x.rank||Infinity)-(y.rank||Infinity));view.querySelector('#results-table').innerHTML=tableRows(list,[{key:'rank',label:'Rank',render:r=>r.rank?`#${r.rank}`:'—'},{key:'member',label:'Member',render:r=>`${escapeHTML(r.member?.member_no||'—')} · ${escapeHTML(r.member?.full_name||'')}`},{key:'race',label:'Race',render:r=>escapeHTML(r.race?.name||'—')},{key:'pigeon_ring',label:'Ring'},{key:'distance_m',label:'Distance',render:r=>`${number(r.distance_m)} m`},{key:'clock',label:'Arrival · PH',render:r=>escapeHTML(r.clock?formatDate(r.clock.received_at_utc):'Not clocked')},{key:'velocity',label:'Velocity · m/min',render:r=>r.velocity?number(r.velocity):'—'},{key:'verification',label:'Review',render:r=>stateTag(r.clock?.verification||'pending')}],'No race entries to show.',false);}filter.onchange=draw;draw();
}
async function memberDashboard(view,identity) {
 const memberId=identity.profile.member_id;if(!memberId)throw new Error('This account is missing its member record. Ask the club administrator.');
 const [{data:member,error:a},{data:races,error:b},{data:entries,error:c},{data:clocks,error:d}]=await Promise.all([supabase.from('members').select('*').eq('id',memberId).single(),supabase.from('races').select('*').eq('status','open').order('release_at_utc'),supabase.from('race_entries').select('*').eq('member_id',memberId),supabase.from('clock_events').select('id,race_entry_id,received_at_utc,verification')]);if(a||b||c||d)throw a||b||c||d;
 const ownClocks=clocks.filter(c=>entries.some(e=>e.id===c.race_entry_id));const ownRaces=races.filter(r=>entries.some(e=>e.race_id===r.id));
 view.innerHTML=`<div class="welcome-row"><div><span class="eyebrow">MEMBER DASHBOARD</span><h2>Welcome, ${escapeHTML(member.full_name.split(' ')[0])}</h2><p>${escapeHTML(member.loft_name)} · Member ${escapeHTML(member.member_no)}</p></div><a class="button primary" href="${url('pages/member/clocking/index.html')}">Clock a pigeon →</a></div><div class="stats-grid three"><article class="stat-card"><div class="stat-label">Open race entries</div><strong>${entries.filter(e=>ownRaces.some(r=>r.id===e.race_id)).length}</strong><span class="stat-foot">Your pigeons</span></article><article class="stat-card"><div class="stat-label">Clocking receipts</div><strong>${ownClocks.length}</strong><span class="stat-foot">All recorded receipts</span></article><article class="stat-card"><div class="stat-label">Open schedules</div><strong>${ownRaces.length}</strong><span class="stat-foot">Available to you</span></article></div><section class="panel"><div class="panel-heading"><div><span class="eyebrow">YOUR SCHEDULE</span><h2>Open races</h2></div></div>${tableRows(ownRaces.map(r=>({...r,pigeons:entries.filter(e=>e.race_id===r.id).length})),[{key:'name',label:'Race'},{key:'release_location',label:'Release point'},{key:'release_at_utc',label:'Release · PH',render:r=>escapeHTML(formatDate(r.release_at_utc))},{key:'pigeons',label:'Your pigeons'}],'No open races are available for your registered pigeons.',false)}</section>`;
}
async function memberClock(view,identity) {
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
 currentPageCleanup=()=>{document.removeEventListener('visibilitychange',onVisibilityChange);window.removeEventListener('pagehide',releaseCameraOnPageHide);stopCamera('');currentPageCleanup=()=>{};};
}
async function memberHistory(view,identity) {
 const memberId=identity.profile.member_id;if(!memberId)throw new Error('This account is missing its member record.');
 const [{data:entries,error:a},{data:clocks,error:b},{data:races,error:c}]=await Promise.all([supabase.from('race_entries').select('id,race_id,pigeon_ring').eq('member_id',memberId),supabase.from('clock_events').select('*').order('received_at_utc',{ascending:false}).limit(500),supabase.from('races').select('id,name')]);if(a||b||c)throw a||b||c;
 const ids=new Set(entries.map(e=>e.id));const history=clocks.filter(c=>ids.has(c.race_entry_id)).map(c=>({...c,entry:entries.find(e=>e.id===c.race_entry_id),race:races.find(r=>r.id===entries.find(e=>e.id===c.race_entry_id)?.race_id)}));
 view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">YOUR RECEIPTS</span><h2>Clocking history</h2><p>Recent server-received clockings for your pigeons.</p></div></div><section class="panel">${tableRows(history,[{key:'received_at_utc',label:'Received · PH',render:r=>escapeHTML(formatDate(r.received_at_utc))},{key:'race',label:'Race',render:r=>escapeHTML(r.race?.name||'—')},{key:'entry',label:'Ring',render:r=>escapeHTML(r.entry?.pigeon_ring||'—')},{key:'source',label:'Source',render:()=> 'Barcode'},{key:'verification',label:'Status',render:r=>stateTag(r.verification)}],'No receipts have been recorded yet.',false)}</section>`;
}
async function memberResultsPage(view) {
  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">CLUB RESULTS</span><h2>Race results</h2><p>Choose a club and date to view the public race results.</p></div></div><section class="panel"><div data-member-public-results></div></section>`;
  await mountPublicResults(view.querySelector('[data-member-public-results]'));
}
async function memberSettingsPage(view,identity) {
  const memberId=identity.profile.member_id;if(!memberId)throw new Error('This account is missing its member record.');
  const {data:member,error}=await supabase.from('members').select('member_no,full_name,loft_name,phone,address').eq('id',memberId).single();if(error)throw error;
  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">YOUR ACCOUNT</span><h2>Settings</h2><p>Review your member details and update your password.</p></div></div><section class="panel"><div class="panel-heading"><h3>Member profile</h3></div><dl class="member-settings-grid"><div><dt>Username</dt><dd>${escapeHTML(identity.profile.username||'—')}</dd></div><div><dt>Member ID</dt><dd>${escapeHTML(member.member_no||'—')}</dd></div><div><dt>Full name</dt><dd>${escapeHTML(member.full_name||'—')}</dd></div><div><dt>Loft</dt><dd>${escapeHTML(member.loft_name||'—')}</dd></div><div><dt>Phone</dt><dd>${escapeHTML(member.phone||'—')}</dd></div><div><dt>Address</dt><dd>${escapeHTML(member.address||'—')}</dd></div></dl><p class="member-settings-help">To change your username or member details, contact your club administrator.</p></section><section class="panel narrow"><div class="panel-heading"><h3>Change password</h3></div><form class="form-grid" id="member-password-form"><label class="field"><span>New password · 8 or more characters</span><input name="new_password" type="password" minlength="8" autocomplete="new-password" required></label><label class="field"><span>Confirm new password</span><input name="confirm_password" type="password" minlength="8" autocomplete="new-password" required></label><div class="form-actions"><button class="button primary" type="submit">Update password</button></div></form></section>`;
  const form=view.querySelector('#member-password-form');
  form.onsubmit=async event=>{event.preventDefault();const password=form.elements.new_password.value;if(password.length<8){message('Choose a password with at least 8 characters.','error');return;}if(password!==form.elements.confirm_password.value){message('The passwords do not match.','error');return;}const button=form.querySelector('[type="submit"]');button.disabled=true;button.textContent='Updating…';const {error}=await supabase.auth.updateUser({password});button.disabled=false;button.textContent='Update password';if(error){message(authError(error),'error');return;}form.reset();alert('Your password was updated.');};
}

function publicResultsMarkup() {
 return `<div class="public-results-content"><form class="form-grid public-results-filter" data-public-results-form><label class="field"><span>Club</span><select name="club_id" required><option value="">Choose a club</option></select></label><label class="field"><span>Race date · Philippines</span><input name="race_date" type="date" required></label><div class="form-actions"><button class="button primary" type="submit">Show results</button></div></form><p class="public-results-note">Clockings remain provisional until verified by the club.</p><div class="notice error public-results-error" data-public-results-error role="alert" hidden><span data-error-text></span><button class="text-button" type="button" data-retry-clubs>Try again</button></div><div class="public-results-toolbar" data-public-results-toolbar hidden><span data-public-results-count></span><label class="field"><span>Speed order</span><select data-speed-order><option value="desc">Fastest first</option><option value="asc">Slowest first</option></select></label></div><div data-public-results-table><p class="public-results-empty">Choose a club and race date to view results.</p></div></div>`;
}
async function mountPublicResults(panel) {
 panel.innerHTML=publicResultsMarkup();
 const form=panel.querySelector('[data-public-results-form]'),clubSelect=form.elements.club_id,errorBox=panel.querySelector('[data-public-results-error]'),errorText=panel.querySelector('[data-error-text]'),retryButton=panel.querySelector('[data-retry-clubs]'),toolbar=panel.querySelector('[data-public-results-toolbar]'),count=panel.querySelector('[data-public-results-count]'),sortOrder=panel.querySelector('[data-speed-order]'),table=panel.querySelector('[data-public-results-table]');
 let rows=[];
 const setError=text=>{errorText.textContent=text;errorBox.hidden=!text;};
 const draw=()=>{
  const direction=sortOrder.value==='asc'?1:-1;
  const sorted=rows.slice().sort((a,b)=>{const av=a.speed_m_per_min,bv=b.speed_m_per_min;if(av==null&&bv!=null)return 1;if(av!=null&&bv==null)return -1;if(av==null&&bv==null)return 0;return (Number(av)-Number(bv))*direction;});
  count.textContent=`${rows.length} result${rows.length===1?'':'s'}`;
  table.innerHTML=tableRows(sorted,[{key:'race_name',label:'Race'},{key:'loft_name',label:'Loft'},{key:'distance_m',label:'Distance',render:r=>`${number(r.distance_m)} m`},{key:'pigeon_ring',label:'Pigeon ring',render:r=>escapeHTML(r.pigeon_ring||'—')},{key:'barcode',label:'Code',render:r=>escapeHTML(r.barcode||'—')},{key:'arrival_at_utc',label:'Arrival · PH',render:r=>escapeHTML(formatDate(r.arrival_at_utc))},{key:'flight_seconds',label:'Flight',render:r=>escapeHTML(formatFlight(r.flight_seconds))},{key:'speed_m_per_min',label:`Speed · m/min ${direction<0?'↓':'↑'}`,render:r=>r.speed_m_per_min==null?'—':number(r.speed_m_per_min)}], 'No results were found for that club and date.',false);
 };
 const loadClubs=async()=>{
  retryButton.disabled=true;setError('');clubSelect.disabled=true;clubSelect.innerHTML='<option value="">Loading clubs…</option>';
  const {data,error}=await supabase.rpc('public_result_clubs');
  if(error){clubSelect.innerHTML='<option value="">Clubs unavailable</option>';setError('Public results are not configured yet. Ask the administrator to run public-results.sql in Supabase.');console.error('Could not load public result clubs:',error);retryButton.disabled=false;return;}
  clubSelect.innerHTML='<option value="">Choose a club</option>';
  (data||[]).forEach(club=>{const option=document.createElement('option');option.value=club.club_id;option.textContent=club.club_name;clubSelect.append(option);});
  clubSelect.disabled=false;retryButton.disabled=false;
  if(!data?.length)setError('No clubs are available yet.');
 };
 retryButton.onclick=loadClubs;
 sortOrder.onchange=draw;
 form.onsubmit=async event=>{
  event.preventDefault();const button=form.querySelector('[type="submit"]');button.disabled=true;button.textContent='Loading results…';setError('');rows=[];toolbar.hidden=true;table.innerHTML='<p class="public-results-empty">Loading results…</p>';
  const {data,error}=await supabase.rpc('public_race_results',{p_club_id:Number(clubSelect.value),p_race_date:form.elements.race_date.value});
  button.disabled=false;button.textContent='Show results';
  if(error){setError('Could not load these results. Check your connection and try again.');table.innerHTML='';console.error('Could not load public race results:',error);return;}
  rows=(data||[]).map(row=>({...row,speed_m_per_min:row.speed_m_per_min==null?null:Number(row.speed_m_per_min)}));sortOrder.value='desc';toolbar.hidden=false;draw();
 };
 await loadClubs();
}
function formatFlight(seconds) {
 if(seconds==null||!Number.isFinite(Number(seconds))||Number(seconds)<0)return '—';
 const total=Math.round(Number(seconds)),hours=Math.floor(total/3600),minutes=Math.floor((total%3600)/60),remainder=total%60;
 return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(remainder).padStart(2,'0')}`;
}

async function loginPage() {
 const container=document.querySelector('#login-content');
 const {data:hasAdmin,error:checkError}=await supabase.rpc('has_admin_account');
 if(checkError){container.innerHTML='<span class="eyebrow">DATABASE SETUP NEEDED</span><h1>Finish database setup</h1><p>In your Supabase SQL Editor run <code>schema.sql</code> (fresh database only), then <code>supabase-auth.sql</code>, <code>multi-club.sql</code>, <code>account-credentials.sql</code>, and <code>public-results.sql</code>, then reload this page.</p>';return;}
 const {data:{session}}=await supabase.auth.getSession();
 if(session){try{const {data:p}=await supabase.from('app_profiles').select('role').eq('id',session.user.id).maybeSingle();if(p){location.href=homeFor(p.role);return;}}catch(e){console.error(e);}}
 if(!hasAdmin){renderSuperAdmin(container);return;}
 renderSignIn(container);
}
const USERNAME_RE=/^[a-z0-9][a-z0-9_.-]{2,31}$/;
const USERNAME_HELP='Username must be 3–32 characters and use letters, numbers, dots, hyphens, or underscores.';
function renderSignIn(container){
 let audience='team';
 container.innerHTML=`<span class="eyebrow">CLUB PORTAL</span><h1 id="login-title">Welcome back</h1><p data-login-intro>Sign in with your club-team username and password.</p><div class="login-tabs" role="tablist" aria-label="Choose sign-in type"><button class="login-tab active" id="audience-team" role="tab" type="button" data-audience="team" aria-controls="signin-pane" aria-selected="true">Club team</button><button class="login-tab" id="audience-member" role="tab" type="button" data-audience="member" aria-controls="signin-pane" aria-selected="false">Member</button><button class="login-tab" id="audience-results" role="tab" type="button" data-audience="results" aria-controls="public-results-pane" aria-selected="false">Results</button></div><div id="signin-pane" role="tabpanel" aria-labelledby="audience-team" data-signin-pane><div data-login-message class="notice" hidden></div><form id="login-form" class="form-grid"><label class="field"><span>Username</span><input name="username" type="text" minlength="3" maxlength="32" pattern="[A-Za-z0-9][A-Za-z0-9_.\\-]{2,31}" autocomplete="username" autocapitalize="none" spellcheck="false" required></label><label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label><button class="button primary" type="submit">Sign in <span>→</span></button></form><p class="login-help" data-login-help>For member access, ask your club administrator to create your account or reset your password.</p></div><section id="public-results-pane" role="tabpanel" aria-labelledby="audience-results" data-results-pane hidden></section>`;
 const helpCopy=container.querySelector('[data-login-help]');
 const introCopy=container.querySelector('[data-login-intro]');
 const title=container.querySelector('#login-title'),signinPane=container.querySelector('[data-signin-pane]'),resultsPane=container.querySelector('[data-results-pane]'),tabs=[...container.querySelectorAll('[data-audience]')];
 const showAudience=next=>{
  audience=next;const isResults=audience==='results';
  tabs.forEach(option=>{const selected=option.dataset.audience===audience;option.classList.toggle('active',selected);option.setAttribute('aria-selected',String(selected));});
  signinPane.hidden=isResults;resultsPane.hidden=!isResults;container.classList.toggle('results-mode',isResults);container.closest('.login-layout')?.classList.toggle('results-mode',isResults);
  title.textContent=isResults?'Public race results':audience==='member'?'Member sign in':'Welcome back';
  introCopy.textContent=isResults?'Choose a club and race date to view the results.':audience==='member'?'Sign in with the username and password your club administrator gave you.':'Sign in with your club-team username and password.';
  helpCopy.textContent=audience==='member'?'Need a member login? Ask your club administrator to create your account or reset your password.':'For member access, ask your club administrator to create your account or reset your password.';
  container.querySelector('[data-login-message]').hidden=true;
  if(isResults&&!resultsPane.dataset.mounted){resultsPane.dataset.mounted='true';mountPublicResults(resultsPane);}
 };
 tabs.forEach(tab=>tab.onclick=()=>{
  showAudience(tab.dataset.audience);
 });
 const form=container.querySelector('#login-form');
 form.onsubmit=async event=>{event.preventDefault();const username=form.elements.username.value.trim().toLowerCase();if(!USERNAME_RE.test(username)){loginMessage(container,USERNAME_HELP,'error');return;}const button=form.querySelector('button');tabs.forEach(tab=>tab.disabled=true);button.disabled=true;button.textContent='Signing in…';
  const {data,error}=await supabase.auth.signInWithPassword({email:`${username}@users.mayma.invalid`,password:form.elements.password.value});
  if(error){tabs.forEach(tab=>tab.disabled=false);button.disabled=false;button.textContent='Sign in →';loginMessage(container,'Sign-in failed. Check your username and password.','error');return;}
  const {data:profile,error:profileError}=await supabase.from('app_profiles').select('role,username,is_active').eq('id',data.user.id).maybeSingle();
  if(profileError||!profile||profile.username!==username){await signOutUser();tabs.forEach(tab=>tab.disabled=false);button.disabled=false;button.textContent='Sign in →';loginMessage(container,'This account is not set up for the clocking app. Ask your administrator.','error');return;}
  if(profile.is_active===false){await signOutUser();tabs.forEach(tab=>tab.disabled=false);button.disabled=false;button.textContent='Sign in →';loginMessage(container,'This account is disabled. Ask your club administrator to reactivate it.','error');return;}
  const isMember=profile.role==='member';
  if((audience==='member')!==isMember){await signOutUser();tabs.forEach(tab=>tab.disabled=false);button.disabled=false;button.textContent='Sign in →';loginMessage(container,isMember?'This is a member account. Choose Member above.':'This is a club-team account. Choose Club team above.','error');return;}
  location.href=homeFor(profile.role);};
}
function renderSuperAdmin(container){
 container.innerHTML=`<span class="eyebrow" data-portal-eyebrow>FIRST-TIME SETUP</span><h1 data-portal-heading>Create superadmin account</h1><p data-portal-intro>This database is new. Choose a username and password for the superadmin. The superadmin creates the club accounts.</p><div class="login-tabs" role="tablist" aria-label="Choose a page"><button class="login-tab active" id="setup-tab" role="tab" type="button" data-setup-tab="setup" aria-controls="setup-pane" aria-selected="true">Admin setup</button><button class="login-tab" id="setup-results-tab" role="tab" type="button" data-setup-tab="results" aria-controls="setup-results-pane" aria-selected="false">Results</button></div><div id="setup-pane" role="tabpanel" aria-labelledby="setup-tab" data-setup-pane><div data-login-message class="notice" hidden></div><form id="superadmin-form" class="form-grid"><label class="field"><span>Superadmin username</span><input name="username" type="text" minlength="3" maxlength="32" pattern="[A-Za-z0-9][A-Za-z0-9_.\\-]{2,31}" autocomplete="username" autocapitalize="none" spellcheck="false" required></label><label class="field"><span>Password</span><input name="password" type="password" minlength="8" autocomplete="new-password" required></label><label class="field"><span>Confirm password</span><input name="confirm" type="password" minlength="8" autocomplete="new-password" required></label><button class="button primary" type="submit">Create superadmin <span>→</span></button></form><p class="login-help">Use at least 8 characters. This screen only appears once, while the database has no administrator.</p></div><section id="setup-results-pane" role="tabpanel" aria-labelledby="setup-results-tab" data-results-pane hidden></section>`;
 const setupPane=container.querySelector('[data-setup-pane]'),resultsPane=container.querySelector('[data-results-pane]'),eyebrow=container.querySelector('[data-portal-eyebrow]'),heading=container.querySelector('[data-portal-heading]'),intro=container.querySelector('[data-portal-intro]'),tabs=[...container.querySelectorAll('[data-setup-tab]')];
 tabs.forEach(tab=>tab.onclick=()=>{const results=tab.dataset.setupTab==='results';tabs.forEach(option=>{const selected=option===tab;option.classList.toggle('active',selected);option.setAttribute('aria-selected',String(selected));});setupPane.hidden=results;resultsPane.hidden=!results;container.classList.toggle('results-mode',results);container.closest('.login-layout')?.classList.toggle('results-mode',results);eyebrow.textContent=results?'PUBLIC RESULTS':'FIRST-TIME SETUP';heading.textContent=results?'Race results':'Create superadmin account';intro.textContent=results?'Choose a club and race date to view the results.':'This database is new. Choose a username and password for the superadmin. The superadmin creates the club accounts.';if(results&&!resultsPane.dataset.mounted){resultsPane.dataset.mounted='true';mountPublicResults(resultsPane);}});
 const form=container.querySelector('#superadmin-form');
 form.onsubmit=async event=>{event.preventDefault();const username=form.elements.username.value.trim().toLowerCase(),password=form.elements.password.value;
  if(!USERNAME_RE.test(username)){loginMessage(container,USERNAME_HELP,'error');return;}
  if(password.length<8){loginMessage(container,'Choose a password with at least 8 characters.','error');return;}
  if(password!==form.elements.confirm.value){loginMessage(container,'The passwords do not match.','error');return;}
  const button=form.querySelector('button');button.disabled=true;button.textContent='Creating…';
  const {error}=await supabase.rpc('create_superadmin',{p_username:username,p_password:password});
  if(error){button.disabled=false;button.textContent='Create superadmin →';const {data:exists}=await supabase.rpc('has_admin_account');if(exists){renderSignIn(container);loginMessage(container,'A superadmin already exists. Sign in with its username.','info');return;}loginMessage(container,authError(error),'error');return;}
  const {error:signInError}=await supabase.auth.signInWithPassword({email:`${username}@users.mayma.invalid`,password});
  if(signInError){renderSignIn(container);loginMessage(container,'Superadmin created. Sign in with your username and password.','info');return;}
  location.href=homeFor('superadmin');};
}
function loginMessage(container,text,kind){const node=container.querySelector('[data-login-message]');node.textContent=text;node.className=`notice ${kind}`;node.hidden=false;}

async function renderPage(view,role,identity){
  const page=body.dataset.view;
  if(page==='clubs'&&role==='superadmin')await clubsPage(view);
  else if(page==='sticker-register'&&role==='superadmin')await stickerRegisterPage(view);
  else if(page==='sticker-generate'&&role==='superadmin')await stickerGeneratePage(view);
  else if(page==='team-users'&&role==='admin'&&identity.profile.role==='admin')await teamAccountsPage(view,identity);
  else if(page==='dashboard'&&role==='admin')await dashboard(view);
  else if(page==='members'||page==='race-points')await initCrud(view,page==='members'?'members':'race_points',identity.profile.role==='admin');
  else if(page==='races')await racesPage(view);
  else if(page==='entries')await entriesPage(view);
  else if(page==='clocking'&&role==='admin')await clockPage(view,identity);
  else if(page==='results')await resultsPage(view);
  else if(page==='dashboard'&&role==='member')await memberDashboard(view,identity);
  else if(page==='member-clocking'&&role==='member')await memberClock(view,identity);
  else if(page==='history'&&role==='member')await memberHistory(view,identity);
  else if(page==='member-results'&&role==='member')await memberResultsPage(view);
  else if(page==='member-settings'&&role==='member')await memberSettingsPage(view,identity);
}
async function main(){
  if(body.dataset.view==='login'){loginPage();return;}
  const role=body.dataset.role,active=body.dataset.active,identity=await guard(role,active);
  if(!identity)return;
  const view=document.querySelector('.page-view');
  try{await renderPage(view,role,identity);}catch(error){fail(error);}
}
const memberRoutes=[
  {path:'pages/member/dashboard/index.html',title:'My races',documentTitle:'My races · Mayma Clocking',view:'dashboard',active:'dashboard'},
  {path:'pages/member/history/index.html',title:'Clocking history',documentTitle:'Clocking history · Mayma Clocking',view:'history',active:'history'},
  {path:'pages/member/clocking/index.html',title:'Clock a pigeon',documentTitle:'Clock a pigeon · Mayma Clocking',view:'member-clocking',active:'clocking'},
  {path:'pages/member/results/index.html',title:'Results',documentTitle:'Race results · Mayma Clocking',view:'member-results',active:'results'},
  {path:'pages/member/settings/index.html',title:'Settings',documentTitle:'Settings · Mayma Clocking',view:'member-settings',active:'settings'}
];
const memberRouteFor=(href)=>{
  const pathname=new URL(href,location.href).pathname;
  return memberRoutes.find(route=>new URL(url(route.path),location.href).pathname===pathname);
};
let memberNavigationToken=0;
async function navigateMemberRoute(route,{push=true}={}){
  if(!route)return;
  const href=new URL(url(route.path),location.href);
  if(push)history.pushState({memberRoute:true},'',href);
  const token=++memberNavigationToken;
  currentPageCleanup();
  body.classList.remove('nav-open');
  body.classList.add('member-body');
  body.dataset.role='member';body.dataset.title=route.title;body.dataset.view=route.view;body.dataset.active=route.active;
  document.title=route.documentTitle;
  const heading=document.querySelector('.topbar h1');if(heading)heading.textContent=route.title;
  const selectedPath=href.pathname;
  document.querySelectorAll('.sidebar nav a,.member-bottom-nav a').forEach(link=>{
    const active=new URL(link.href,location.href).pathname===selectedPath;
    if(link.classList.contains('nav-link'))link.classList.toggle('active',active);
    if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  });
  const oldView=document.querySelector('.page-view');
  const view=document.createElement('section');view.className='page-view';view.dataset.view=route.view;
  view.innerHTML='<div class="route-loading" role="status"><span class="spinner" aria-hidden="true"></span>Loading page…</div>';
  oldView?.replaceWith(view);
  window.scrollTo(0,0);
  try{
    const identity=await getIdentity();
    if(token!==memberNavigationToken)return;
    if(!identity?.profile){location.href=url('pages/login/index.html');return;}
    if(identity.profile.is_active===false){await signOutUser();location.href=url('pages/login/index.html');return;}
    if(identity.profile.role!=='member'){location.href=homeFor(identity.profile.role);return;}
    await renderPage(view,'member',identity);
  }catch(error){if(token===memberNavigationToken)fail(error);}
}
document.addEventListener('click',event=>{
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const anchor=event.target.closest?.('a[href]');
  if(!anchor||anchor.target==='_blank'||body.dataset.role!=='member')return;
  const route=memberRouteFor(anchor.href);
  if(!route)return;
  event.preventDefault();navigateMemberRoute(route);
});
window.addEventListener('popstate',()=>{
  if(body.dataset.role!=='member')return;
  const route=memberRouteFor(location.href);
  if(route)navigateMemberRoute(route,{push:false});
});
main();
