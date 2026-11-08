import { supabase } from './supabase.js';
const signOutUser = () => supabase.auth.signOut();

const body = document.body;
const BASE = body.dataset.base || '../../';
const url = (path) => `${BASE}${path}`;
const escapeHTML = (value='') => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const message = (text, kind='info') => { const el=document.querySelector('[data-message]'); if(el){el.textContent=text;el.className=`notice ${kind}`;el.hidden=!text;if(text&&el.scrollIntoView)el.scrollIntoView({behavior:'smooth',block:'nearest'});} };
const fail = (error) => { console.error(error); const text=error?.message || 'Something went wrong. Please try again.'; if(!document.querySelector('[data-message]')&&document.querySelector('#app-shell')){document.querySelector('#app-shell').innerHTML=`<main class="loading"><strong>Could not connect to Supabase.</strong><span class="notice error">${escapeHTML(text)}</span><a class="button secondary" href="${url('index.html')}">Back to home</a></main>`;return;} message(text, 'error'); };
const authError = (e) => e?.message || 'Something went wrong. Please try again.';
const dbError = (error) => { if(error?.code==='23505') return 'That value is already in use.'; if(error?.code==='23503') return 'This record is still in use by another item.'; return error?.message || 'Could not save changes.'; };
const formatDate = (value) => value ? new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}).format(new Date(value.endsWith?.('Z')?value:`${value}Z`)) : '—';
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
  const links=[['clubs','Club accounts','pages/superadmin/clubs/index.html','⌂']];
  return links.map(([key,label,href,icon])=>`<a class="nav-link ${active===key?'active':''}" ${active===key?'aria-current="page"':''} href="${url(href)}"><span class="nav-icon">${icon}</span>${label}</a>`).join('');
}
function adminNav(active,canManageAccounts) {
  const links=[['dashboard','Overview','pages/admin/dashboard/index.html','◧'],['members','Members','pages/admin/members/index.html','♙'],['race-points','Race points','pages/admin/race-points/index.html','⌖'],['races','Races','pages/admin/races/index.html','◷'],['entries','Race entries','pages/admin/entries/index.html','▤'],['clocking','Clocking','pages/admin/clocking/index.html','◉'],['results','Results','pages/admin/results/index.html','↗']];
  if(canManageAccounts)links.push(['users','Team accounts','pages/admin/users/index.html','♧']);
  return links.map(([key,label,href,icon])=>`<a class="nav-link ${active===key?'active':''}" ${active===key?'aria-current="page"':''} href="${url(href)}"><span class="nav-icon">${icon}</span>${label}</a>`).join('');
}
function memberNav(active) {
  const links=[['dashboard','My races','pages/member/dashboard/index.html','◧'],['clocking','Clock a pigeon','pages/member/clocking/index.html','◉'],['history','Clocking history','pages/member/history/index.html','◷']];
  return links.map(([key,label,href,icon])=>`<a class="nav-link ${active===key?'active':''}" ${active===key?'aria-current="page"':''} href="${url(href)}"><span class="nav-icon">${icon}</span>${label}</a>`).join('');
}
async function guard(role,active) {
  try {
    const identity=await getIdentity();
    if(!identity) { location.href=url('pages/login/index.html'); return null; }
    if(!identity.profile) { await signOutUser(); document.querySelector('#app-shell').innerHTML=`<main class="loading"><strong>This account is not set up yet.</strong><span>Ask your administrator to finish setting up your account.</span><a class="button primary" href="${url('pages/login/index.html')}">Return to sign in</a></main>`; return null; }
    if(identity.profile.is_active===false) { await signOutUser(); document.querySelector('#app-shell').innerHTML=`<main class="loading"><strong>This account is disabled.</strong><span>Ask your club administrator to reactivate it.</span><a class="button primary" href="${url('pages/login/index.html')}">Return to sign in</a></main>`; return null; }
    const staffOnAdminPage=role==='admin'&&identity.profile.role==='staff'&&body.dataset.view!=='team-users';
    if(identity.profile.role!==role&&!staffOnAdminPage) { location.href=homeFor(identity.profile.role); return null; }
    document.querySelector('#app-shell').innerHTML=`<aside class="sidebar"><a class="brand" href="${homeFor(role)}"><span class="brand-mark">✳</span><span>Mayma<span class="brand-sub">RACE CLOCKING</span></span></a><div class="nav-label">${role==='superadmin'?'SUPERADMIN':identity.profile.role==='admin'?'MANAGEMENT':identity.profile.role==='staff'?'STAFF':'MEMBER AREA'}</div><nav>${role==='superadmin'?superadminNav(active):role==='admin'?adminNav(active,identity.profile.role==='admin'):memberNav(active)}</nav><div class="sidebar-bottom"><div class="signed-in"><span class="avatar">${escapeHTML((identity.profile.username||'M')[0].toUpperCase())}</span><span class="signed-email">${escapeHTML(identity.profile.username||'Account')}</span></div><button class="nav-link signout" id="sign-out"><span class="nav-icon">↪</span>Sign out</button></div></aside><main class="main"><div class="nav-backdrop" id="nav-backdrop"></div><header class="topbar"><div class="topbar-left"><button class="menu-toggle" id="menu-toggle" type="button" aria-label="Open menu">☰</button><div><div class="eyebrow">${escapeHTML(role==='superadmin'?'SUPERADMIN':(identity.club?.name||'PIGEON RACING CLUB').toUpperCase())}</div><h1>${escapeHTML(document.body.dataset.title||'Race clocking')}</h1></div></div><div class="topbar-right"><span class="live-dot"></span><span>Supabase connected</span><span class="timezone">PH · UTC+8</span></div></header><div class="page-content"><div data-message class="notice" hidden></div><section class="page-view" data-view="${escapeHTML(body.dataset.view)}"></section><footer>Clock receipts are recorded by Supabase server time and remain provisional until verified by the club.</footer></div></main>`;
    document.querySelector('#menu-toggle').onclick=()=>body.classList.toggle('nav-open');document.querySelector('#nav-backdrop').onclick=()=>body.classList.remove('nav-open');document.querySelector('#sign-out').addEventListener('click',async()=>{await signOutUser();location.href=url('pages/login/index.html');});
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
  return `<div class="coordinate-axis" data-coordinate-axis="${key}" data-coordinate-limit="${limit}"><span class="coordinate-name" id="${id}-label">${label}</span><input type="hidden" id="${id}" name="${key}" data-coordinate-value value="${escapeHTML(value??'')}"><div class="coordinate-values"><div class="coordinate-hemispheres" role="radiogroup" aria-labelledby="${id}-label">${hemispheres.map(direction=>`<label class="hemisphere-choice"><input type="radio" name="${key}_hemisphere" value="${direction}" ${parts.hemisphere===direction?'checked':''}><span>${direction}</span></label>`).join('')}</div><label class="coordinate-part"><span class="visually-hidden">${label} degrees</span><input type="number" inputmode="numeric" autocomplete="off" data-coordinate-part="degrees" aria-label="${label} degrees" min="0" max="${limit}" step="1" value="${escapeHTML(parts.degrees)}" required><span aria-hidden="true">°</span></label><label class="coordinate-part"><span class="visually-hidden">${label} minutes</span><input type="number" inputmode="numeric" autocomplete="off" data-coordinate-part="minutes" aria-label="${label} minutes" min="0" max="59" step="1" value="${escapeHTML(parts.minutes)}"><span aria-hidden="true">′</span></label><label class="coordinate-part coordinate-seconds"><span class="visually-hidden">${label} seconds</span><input type="number" inputmode="decimal" autocomplete="off" data-coordinate-part="seconds" aria-label="${label} seconds" min="0" max="59.9999" step="0.0001" value="${escapeHTML(parts.seconds)}"><span aria-hidden="true">″</span></label></div></div>`;
}
function coordinateMapHTML(fieldsList=[]) {
  const addressTarget=fieldsList.some(([key])=>key==='address')?'address':'';
  const addressAction=addressTarget?'<div class="coordinate-map-tools"><button class="button secondary" type="button" data-get-address>Get Address</button><span data-address-status aria-live="polite">Use the coordinates to fill the address, then review it.</span></div>':'';
  return `<section class="coordinate-map" data-coordinate-map data-address-target="${addressTarget}" aria-label="Coordinate map preview">${addressAction}<div class="coordinate-map-heading"><div><h3>Map preview</h3><p data-map-status aria-live="polite">Enter latitude and longitude to preview this location.</p></div><a data-map-link target="_blank" rel="noopener noreferrer" hidden>Open in OpenStreetMap ↗</a></div><div class="coordinate-map-frame"><div class="coordinate-map-placeholder" data-map-placeholder><span class="map-placeholder-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="1.7"/></svg></span><span>Enter both coordinates to show the map.</span></div><iframe data-map-frame title="Map preview for the entered coordinates" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen hidden></iframe></div></section>`;
}
function fieldHTML([key,label,type,required],value='') {const id=`field-${key}`;if(type==='coordinates')return coordinateFieldHTML(key,label,value);if(type==='select')return `<label class="field"><span>${label}</span><select id="${id}" name="${key}"><option value="0">No</option><option value="1">Yes</option></select></label>`;return `<label class="field"><span>${label}</span><input id="${id}" name="${key}" type="${type}" ${type==='number'?`step="any" ${key==='latitude'?'min="-90" max="90"':key==='longitude'?'min="-180" max="180"':''}`:''} ${required?'required':''} value="${escapeHTML(value??'')}"></label>`;}
function genericForm(fieldsList,button='Save') {const hasCoordinates=fieldsList.some(([, ,type])=>type==='coordinates');return `<form class="form-grid" id="record-form">${fieldsList.map(f=>fieldHTML(f)).join('')}${hasCoordinates?coordinateMapHTML(fieldsList):''}<div class="form-actions"><button class="button primary" type="submit">${button}</button><button class="button secondary" id="cancel-edit" type="button" hidden>Cancel</button></div></form>`;}
function bindCoordinateEditor(form) {
  const axes=[...form.querySelectorAll('[data-coordinate-axis]')],preview=form.querySelector('[data-coordinate-map]');if(!axes.length||!preview)return {set(){},refresh(){},validate(){return true;}};
  const status=preview.querySelector('[data-map-status]'),frame=preview.querySelector('[data-map-frame]'),placeholder=preview.querySelector('[data-map-placeholder]'),mapLink=preview.querySelector('[data-map-link]'),addressButton=preview.querySelector('[data-get-address]'),addressStatus=preview.querySelector('[data-address-status]');let mapTimer=null,lastAddressLookup=0;
  const readAxis=axis=>{
    const degree=axis.querySelector('[data-coordinate-part="degrees"]'),minute=axis.querySelector('[data-coordinate-part="minutes"]'),second=axis.querySelector('[data-coordinate-part="seconds"]'),hidden=axis.querySelector('[data-coordinate-value]'),hemisphere=axis.querySelector('input[type="radio"]:checked')?.value||'N',limit=Number(axis.dataset.coordinateLimit);
    const fields=[degree,minute,second];fields.forEach(field=>{field.setCustomValidity('');field.removeAttribute('aria-invalid');});
    if(!degree.value.trim()){hidden.value='';return {valid:false,missing:true};}
    const d=Number(degree.value),m=minute.value.trim()===''?0:Number(minute.value),s=second.value.trim()===''?0:Number(second.value);
    let error='';if(!Number.isInteger(d)||d<0||d>limit)error=`Degrees must be between 0 and ${limit}.`;else if(!Number.isInteger(m)||m<0||m>=60)error='Minutes must be a whole number from 0 to 59.';else if(!Number.isFinite(s)||s<0||s>=60)error='Seconds must be from 0 up to 59.9999.';else if(d===limit&&(m>0||s>0))error=`At ${limit} degrees, minutes and seconds must be zero.`;
    if(error){degree.setCustomValidity(error);degree.setAttribute('aria-invalid','true');hidden.value='';return {valid:false,error};}
    const magnitude=d+(m/60)+(s/3600),sign=(hemisphere==='S'||hemisphere==='W')?-1:1,decimal=Number((magnitude*sign).toFixed(7));hidden.value=decimal.toFixed(7);return {valid:true,value:decimal};
  };
  const refresh=(immediate=false)=>{
    clearTimeout(mapTimer);const values=axes.map(readAxis),problem=values.find(value=>value.error);
    if(problem||values.some(value=>!value.valid)){
      frame.hidden=true;frame.removeAttribute('src');placeholder.hidden=false;placeholder.querySelector('span:last-child').textContent=problem?'Check the coordinate values above.':'Enter both coordinates to show the map.';mapLink.hidden=true;status.textContent=problem?problem.error:'Enter both coordinates to preview this location.';return;
    }
    const latitude=values.find((_,index)=>axes[index].dataset.coordinateAxis==='latitude').value,longitude=values.find((_,index)=>axes[index].dataset.coordinateAxis==='longitude').value;
    const pointUrl=new URL('https://www.openstreetmap.org/'),embedUrl=new URL('https://www.openstreetmap.org/export/embed.html'),padding=0.015;
    pointUrl.searchParams.set('mlat',latitude);pointUrl.searchParams.set('mlon',longitude);pointUrl.hash=`map=15/${latitude}/${longitude}`;
    const west=Math.max(-180,longitude-padding),south=Math.max(-90,latitude-padding),east=Math.min(180,longitude+padding),north=Math.min(90,latitude+padding);
    const bbox=[west,south,east,north].map(value=>Number(value.toFixed(7))).join(',');embedUrl.searchParams.set('bbox',bbox);embedUrl.searchParams.set('layer','mapnik');embedUrl.searchParams.set('marker',`${latitude},${longitude}`);
    mapLink.href=pointUrl.toString();mapLink.hidden=false;frame.title=`Map preview at ${latitude}, ${longitude}`;frame.hidden=true;placeholder.hidden=false;placeholder.querySelector('span:last-child').textContent='Updating map preview…';status.textContent=`Previewing ${latitude.toFixed(6)}, ${longitude.toFixed(6)}.`;
    mapTimer=setTimeout(()=>{frame.src=embedUrl.toString();frame.hidden=false;placeholder.hidden=true;},immediate?0:450);
  };
  const set=(key,value)=>{
    const axis=axes.find(item=>item.dataset.coordinateAxis===key);if(!axis)return;const parts=decimalToDms(value,key);
    axis.querySelector('[data-coordinate-part="degrees"]').value=parts.degrees;axis.querySelector('[data-coordinate-part="minutes"]').value=parts.minutes;axis.querySelector('[data-coordinate-part="seconds"]').value=parts.seconds;
    const direction=axis.querySelector(`input[type="radio"][value="${parts.hemisphere}"]`);if(direction)direction.checked=true;
  };
  if(addressButton)addressButton.onclick=async()=>{
    const values=axes.map(readAxis);if(values.some(value=>!value.valid)){addressStatus.textContent='Enter valid latitude and longitude first.';form.reportValidity();return;}
    const latitude=values.find((_,index)=>axes[index].dataset.coordinateAxis==='latitude').value,longitude=values.find((_,index)=>axes[index].dataset.coordinateAxis==='longitude').value,target=form.elements.namedItem(preview.dataset.addressTarget);
    if(!target)return;addressButton.disabled=true;addressButton.textContent='Finding address…';addressStatus.textContent='Looking up this location…';
    try{
      const delay=Math.max(0,1100-(Date.now()-lastAddressLookup));if(delay)await new Promise(resolve=>setTimeout(resolve,delay));lastAddressLookup=Date.now();
      const endpoint=new URL('https://nominatim.openstreetmap.org/reverse');endpoint.searchParams.set('format','jsonv2');endpoint.searchParams.set('lat',latitude);endpoint.searchParams.set('lon',longitude);
      const response=await fetch(endpoint,{headers:{Accept:'application/json'}});if(!response.ok)throw new Error('Address lookup failed.');const place=await response.json();if(!place.display_name)throw new Error('No address found.');
      target.value=place.display_name;addressStatus.textContent='Address added. Review it before saving.';
    }catch(error){addressStatus.textContent='Could not find an address. Check your connection or enter it manually.';console.warn('Address lookup failed:',error);}
    finally{addressButton.disabled=false;addressButton.textContent='Get Address';}
  };
  axes.forEach(axis=>axis.querySelectorAll('input').forEach(input=>{input.addEventListener('input',()=>refresh());input.addEventListener('change',()=>refresh());}));refresh(true);
  return {set,refresh,validate(){const values=axes.map(readAxis);refresh(true);return values.every(value=>value.valid);}};
}
function bindGeneric(view,table,fieldsList,columns,defaults={},withAccounts=false) {
  const records=[];const form=view.querySelector('#record-form');let editing=null;const coordinateEditor=bindCoordinateEditor(form);
  const redraw=()=>{
    view.querySelector('[data-table]').innerHTML=tableRows(records,columns);
    view.querySelectorAll('[data-edit]').forEach(btn=>btn.onclick=()=>{
      editing=records[Number(btn.dataset.edit)];
      for(const [key,,type] of fieldsList){if(type==='coordinates'){coordinateEditor.set(key,editing[key]);continue;}const el=form.elements.namedItem(key);if(el)el.value=editing[key]??(key==='paid'?0:'');}
      coordinateEditor.refresh(true);view.querySelector('#cancel-edit').hidden=false;form.querySelectorAll('[data-account-field]').forEach(el=>el.hidden=true);form.querySelector('[type=submit]').textContent='Update record';form.scrollIntoView({behavior:'smooth',block:'center'});
    });
    view.querySelectorAll('[data-login]').forEach(btn=>btn.onclick=async()=>{const username=(prompt('Choose a username for this member (letters, numbers, . _ -):')||'').trim().toLowerCase();if(!username)return;const password=prompt('Choose a password (8 or more characters):')||'';if(!password)return;const {error}=await supabase.rpc('admin_create_member_account',{p_member_id:Number(btn.dataset.login),p_username:username,p_password:password});if(error){message(authError(error),'error');return;}await load();message(`Login created. Username: ${username}`,'success');});
    view.querySelectorAll('[data-reset]').forEach(btn=>btn.onclick=async()=>{const password=prompt('Enter a new password (8 or more characters):')||'';if(!password)return;const {error}=await supabase.rpc('admin_set_member_password',{p_member_id:Number(btn.dataset.reset),p_password:password});if(error){message(authError(error),'error');return;}message('Password updated.','success');});
    view.querySelectorAll('[data-delete]').forEach(btn=>btn.onclick=async()=>{if(!confirm(withAccounts?'Delete this member and their login?':'Delete this record?'))return;const {error}=await supabase.from(table).delete().eq('id',btn.dataset.delete);if(error){message(dbError(error),'error');return;}await load();message('Record deleted.','success');});
  };
  async function load(){const {data,error}=await supabase.from(table).select('*').order('id',{ascending:false});if(error){fail(error);return;}if(withAccounts){const {data:profiles}=await supabase.from('app_profiles').select('username,member_id').eq('role','member');const byMember=new Map((profiles||[]).map(p=>[p.member_id,p.username]));(data||[]).forEach(r=>{r.username=byMember.get(r.id)||null;});}records.splice(0,records.length,...(data||[]));view.querySelector('[data-count]').textContent=`${records.length} records`;redraw();}
  form.onsubmit=async event=>{event.preventDefault();if(!coordinateEditor.validate()){message('Check the latitude and longitude values, then try again.','error');form.reportValidity();return;}const data=Object.fromEntries(fieldsList.map(([key,,type])=>{const value=form.elements.namedItem(key).value;return [key,type==='number'||type==='coordinates'?Number(value):key==='paid'?Number(value):value.trim()||null];}));Object.assign(data,defaults);const accUser=withAccounts?(form.elements.namedItem('account_username')?.value||'').trim().toLowerCase():'',accPass=withAccounts?(form.elements.namedItem('account_password')?.value||''):'';if(!editing&&withAccounts&&(accUser||accPass)&&(!accUser||accPass.length<8)){message('To create a login, enter a username and a password of 8 or more characters.','error');return;}const result=editing?await supabase.from(table).update(data).eq('id',editing.id):await supabase.from(table).insert(data).select('id').single();if(result.error){message(dbError(result.error),'error');return;}let accountNote='';if(!editing&&withAccounts&&accUser&&accPass){const {error:accError}=await supabase.rpc('admin_create_member_account',{p_member_id:result.data.id,p_username:accUser,p_password:accPass});accountNote=accError?` Member saved, but the login failed: ${authError(accError)} Use “Create login” in the list to retry.`:` Login created for ${accUser}.`;}form.reset();coordinateEditor.refresh(true);editing=null;form.querySelectorAll('[data-account-field]').forEach(el=>el.hidden=false);view.querySelector('#cancel-edit').hidden=true;form.querySelector('[type=submit]').textContent='Save';await load();message('Saved.'+accountNote,accountNote.includes('failed')?'error':'success');};
  view.querySelector('#cancel-edit').onclick=()=>{form.reset();coordinateEditor.refresh(true);editing=null;form.querySelectorAll('[data-account-field]').forEach(el=>el.hidden=false);view.querySelector('#cancel-edit').hidden=true;form.querySelector('[type=submit]').textContent='Save';};load();
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
    ...(canManageAccounts?[{key:'username',label:'Login',render:r=>r.username?`${escapeHTML(r.username)} <button class="text-button" data-reset="${escapeHTML(r.id)}">Reset password</button>`:`<button class="text-button" data-login="${escapeHTML(r.id)}">Create login</button>`}]:[])
  ]:[{key:'location',label:'Location'},{key:'sector',label:'Sector'},{key:'latitude',label:'Latitude'},{key:'longitude',label:'Longitude'}];
  const accountFields=isMembers&&canManageAccounts?'<label class="field" data-account-field><span>Login username (optional)</span><input name="account_username" minlength="3" maxlength="32" pattern="[A-Za-z0-9][A-Za-z0-9_.\\-]{2,31}" autocomplete="off" autocapitalize="none" spellcheck="false"></label><label class="field" data-account-field><span>Login password (8+ characters)</span><input name="account_password" type="password" minlength="8" autocomplete="new-password"></label>':'';
  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">${isMembers?'CLUB DIRECTORY':'RELEASE LOCATIONS'}</span><h2>${isMembers?'Members & lofts':'Race points'}</h2><p>${isMembers?'Maintain member records and loft coordinates.':'Save release points for new race schedules.'}</p></div><span class="count-pill" data-count>— records</span></div><section class="panel"><div class="panel-heading"><h3 data-form-title>${isMembers?'Add a member':'Add a race point'}</h3></div>${genericForm(fields[table]).replace('<div class="form-actions">',`${accountFields}<div class="form-actions">`)}</section><section class="panel"><div class="panel-heading"><h3>${isMembers?'Member list':'Saved locations'}</h3></div><div data-table></div></section>`;
  bindGeneric(view,table,fields[table],columns,{},isMembers&&canManageAccounts);
}

async function teamAccountsPage(view,identity) {
  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">CLUB ACCESS</span><h2>Team accounts</h2><p>Create another administrator or staff login for this club.</p></div><span class="count-pill" data-team-count>— accounts</span></div><section class="panel"><div class="panel-heading"><h3>Create a team account</h3></div><form class="form-grid" id="team-account-form"><label class="field"><span>Username</span><input name="username" type="text" minlength="3" maxlength="32" pattern="[A-Za-z0-9][A-Za-z0-9_.\\-]{2,31}" autocomplete="off" autocapitalize="none" spellcheck="false" required></label><label class="field"><span>Password · 8 or more characters</span><input name="password" type="password" minlength="8" autocomplete="new-password" required></label><label class="field"><span>Role</span><select name="role"><option value="staff">Staff · routine club work</option><option value="admin">Administrator · manage team accounts</option></select></label><div class="form-actions"><button class="button primary" type="submit">Create account</button></div></form></section><section class="panel"><div class="panel-heading"><div><h3>Club team</h3><p class="muted small">Staff can manage members, races, entries, and clocking. Administrators can also manage team accounts.</p></div></div><div data-team-table></div></section>`;
  const form=view.querySelector('#team-account-form');
  const table=view.querySelector('[data-team-table]');
  async function load(){
    const {data,error}=await supabase.from('app_profiles').select('id,username,role,is_active').eq('club_id',identity.profile.club_id).in('role',['admin','staff']).order('username');
    if(error)throw error;
    view.querySelector('[data-team-count]').textContent=`${data.length} account${data.length===1?'':'s'}`;
    table.innerHTML=`<div class="table-scroll"><table><thead><tr><th>Username</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>${data.length?data.map(user=>`<tr><td data-label="Username">${escapeHTML(user.username)}</td><td data-label="Role">${escapeHTML(titleCase(user.role))}</td><td data-label="Status">${stateTag(user.is_active?'active':'inactive')}</td><td class="row-actions" data-label="Actions"><button class="text-button" data-team-reset="${escapeHTML(user.id)}">Reset password</button><button class="text-button ${user.is_active?'danger-text':''}" data-team-active="${escapeHTML(user.id)}" data-next-active="${user.is_active?'false':'true'}" ${user.id===identity.profile.id&&user.is_active?'disabled title="You cannot disable your own account"':''}>${user.is_active?'Disable':'Reactivate'}</button></td></tr>`).join(''):'<tr><td colspan="4" class="empty-cell">No team accounts found.</td></tr>'}</tbody></table></div>`;
    table.querySelectorAll('[data-team-reset]').forEach(button=>button.onclick=async()=>{
      const password=prompt('Enter a new password (8 or more characters):')||'';
      if(!password)return;
      if(password.length<8){message('Password must be at least 8 characters.','error');return;}
      const {error}=await supabase.rpc('admin_set_team_password',{p_user_id:button.dataset.teamReset,p_password:password});
      if(error){message(authError(error),'error');return;}
      message('Team account password updated.','success');
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
    if(!USERNAME_RE.test(username)){message(USERNAME_HELP,'error');return;}
    if(password.length<8){message('Password must be at least 8 characters.','error');return;}
    const button=form.querySelector('[type="submit]');button.disabled=true;button.textContent='Creating…';
    const {error}=await supabase.rpc('admin_create_team_account',{p_username:username,p_password:password,p_role:role});
    button.disabled=false;button.textContent='Create account';
    if(error){message(authError(error),'error');return;}
    form.reset();await load();message(`${titleCase(role)} account created for ${username}.`,'success');
  };
  await load();
}
async function racesPage(view) {
  const {data:points,error}=await supabase.from('race_points').select('id,location,sector,latitude,longitude').order('location');if(error)throw error;
  const {data:races,error:raceError}=await supabase.from('races').select('*').order('id',{ascending:false});if(raceError)throw raceError;
  const {data:entries,error:entryError}=await supabase.from('race_entries').select('race_id');if(entryError)throw entryError;
  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">RACE CALENDAR</span><h2>Race schedules</h2><p>Choose a saved release point and set the official release time.</p></div></div><section class="panel"><h3>Create a race</h3><form id="race-form" class="form-grid"><label class="field"><span>Race name</span><input name="name" maxlength="180" required></label><label class="field"><span>Release point</span><select name="race_point_id" required><option value="">Choose a location</option>${points.map(p=>`<option value="${p.id}">${escapeHTML(p.sector)} · ${escapeHTML(p.location)}</option>`).join('')}</select></label><label class="field"><span>Release date and time · Philippines</span><input name="release_at" type="datetime-local" required></label><div class="form-actions"><button class="button primary">Create schedule</button></div></form></section><section class="panel"><div class="panel-heading"><h3>All schedules</h3></div>${tableRows(races.map(r=>({...r,entry_count:entries.filter(e=>e.race_id===r.id).length})),[{key:'name',label:'Race'},{key:'release_location',label:'Release point'},{key:'release_at_utc',label:'Release time',render:r=>escapeHTML(formatDate(r.release_at_utc))},{key:'entry_count',label:'Pigeons'},{key:'status',label:'Status',render:r=>stateTag(r.status)},{key:'status',label:'Change status',render:r=>`<select data-status="${r.id}" aria-label="Race status"><option ${r.status==='draft'?'selected':''}>draft</option><option ${r.status==='open'?'selected':''}>open</option><option ${r.status==='closed'?'selected':''}>closed</option></select>`}], 'No schedules yet.',false)}</section>`;
  view.querySelector('#race-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;const point=points.find(p=>p.id===Number(f.race_point_id.value));if(!point)return;const {error}=await supabase.from('races').insert({name:f.name.value.trim(),race_point_id:point.id,release_location:point.location,release_latitude:point.latitude,release_longitude:point.longitude,release_at_utc:new Date(f.release_at.value).toISOString().replace('T',' ').replace('Z',''),status:'draft'});if(error){message(dbError(error),'error');return;}location.reload();};
  view.querySelectorAll('[data-status]').forEach(el=>el.onchange=async()=>{const {error}=await supabase.from('races').update({status:el.value}).eq('id',el.dataset.status);if(error){message(dbError(error),'error');return;}message('Race status updated.','success');});
}
function distanceMeters(lat1,lon1,lat2,lon2){const rad=n=>n*Math.PI/180;const a=Math.sin(rad(lat2-lat1)/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(rad(lon2-lon1)/2)**2;return 6371008.8*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
async function entriesPage(view) {
  const [{data:races,error:a},{data:members,error:b}]=await Promise.all([supabase.from('races').select('*').order('id',{ascending:false}),supabase.from('members').select('id,member_no,full_name,loft_name,latitude,longitude').order('member_no')]);if(a||b)throw a||b;
  const {data:entries,error}=await supabase.from('race_entries').select('*').order('id',{ascending:false});if(error)throw error;
  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">PIGEON ROSTER</span><h2>Race entries</h2><p>Register each pigeon once for the selected schedule.</p></div></div><section class="panel"><h3>Register a pigeon</h3><form id="entry-form" class="form-grid"><label class="field"><span>Race schedule</span><select name="race_id" required><option value="">Choose a race</option>${races.map(r=>`<option value="${r.id}">${escapeHTML(r.name)}</option>`).join('')}</select></label><label class="field"><span>Member</span><select name="member_id" required><option value="">Choose a member</option>${members.map(m=>`<option value="${m.id}">${escapeHTML(m.member_no)} · ${escapeHTML(m.full_name)}</option>`).join('')}</select></label><label class="field"><span>Ring number</span><input name="pigeon_ring" maxlength="80" required></label><label class="field"><span>Race barcode</span><input name="barcode" maxlength="120" required autocomplete="off"></label><label class="field"><span>Category</span><select name="category"><option>Open Category</option><option>Young Bird</option><option>Old Bird</option><option>Special Category</option></select></label><label class="field"><span>Race type</span><select name="race_type"><option>Regular Race/Set</option><option>Training Toss</option><option>Special Race</option></select></label><label class="field"><span>Pooling</span><select name="pooling"><option value="0">No</option><option value="1">Yes</option></select></label><div class="form-actions"><button class="button primary">Save entry</button></div></form></section><section class="panel"><div class="panel-heading"><h3>Registered pigeons</h3></div>${tableRows(entries.map(e=>({...e,member:members.find(m=>m.id===e.member_id),race:races.find(r=>r.id===e.race_id)})),[{key:'race',label:'Race',render:r=>escapeHTML(r.race?.name||'—')},{key:'member',label:'Member',render:r=>`${escapeHTML(r.member?.member_no||'—')} · ${escapeHTML(r.member?.full_name||'')}`},{key:'pigeon_ring',label:'Ring'},{key:'barcode',label:'Barcode'},{key:'distance_m',label:'Distance',render:r=>`${number(r.distance_m)} m`}],'No pigeons registered.',false)}</section>`;
  view.querySelector('#entry-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,m=members.find(x=>x.id===Number(f.member_id.value)),r=races.find(x=>x.id===Number(f.race_id.value));if(!m||!r)return;const {error}=await supabase.from('race_entries').insert({race_id:r.id,member_id:m.id,pigeon_ring:f.pigeon_ring.value.trim().toUpperCase(),barcode:f.barcode.value.trim(),pooling:Number(f.pooling.value),category:f.category.value,race_type:f.race_type.value,distance_m:distanceMeters(r.release_latitude,r.release_longitude,m.latitude,m.longitude)});if(error){message(dbError(error),'error');return;}location.reload();};
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
 view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">MEMBER CLOCKING</span><h2>Record your pigeon</h2><p>Scan the barcode on your registered race entry.</p></div></div><section class="panel narrow"><div class="callout"><span class="callout-icon">◷</span><span>The receipt time comes from Supabase when your submission reaches the server. Clockings are provisional.</span></div><form id="member-clock-form" class="form-grid"><label class="field"><span>Open race</span><select name="race_id" required><option value="">Choose a race</option>${eligible.map(r=>`<option value="${r.id}">${escapeHTML(r.name)} · ${escapeHTML(r.release_location)}</option>`).join('')}</select></label><label class="field"><span>Barcode</span><input name="barcode" required maxlength="120" autocomplete="off" autocapitalize="none" autocorrect="off" inputmode="text" placeholder="Scan or type the registered code"></label><div class="form-actions"><button class="button primary">Submit clocking</button></div></form></section><section class="panel"><h3>Scan a barcode</h3><p class="muted">Start the camera and hold the barcode steady in the frame. Camera access requires HTTPS. You can also type the code above.</p><button class="button secondary" id="camera-button" type="button">Start camera</button><video id="camera" playsinline autoplay muted hidden aria-label="Live barcode scanner preview"></video><p class="muted small" id="camera-status" aria-live="polite" aria-atomic="true">You can enter the barcode manually above.</p></section>`;
 view.querySelector('#member-clock-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;const {data,error}=await supabase.rpc('submit_member_clock',{p_race_id:Number(f.race_id.value),p_barcode:f.barcode.value.trim()});if(error){message(error.message,'error');return;}message(data.message||'Clocking received.','success');f.reset();};
 const camera=view.querySelector('#camera'),status=view.querySelector('#camera-status'),cameraButton=view.querySelector('#camera-button'),barcode=view.querySelector('[name="barcode"]');
 let scannerControls=null,scannerActive=false,scannerStarting=false,scannerSession=0;
 const stopCamera=(statusText='Camera stopped.')=>{
  scannerSession++;scannerActive=false;scannerStarting=false;scannerControls?.stop();scannerControls=null;
  camera.pause();camera.srcObject?.getTracks().forEach(track=>track.stop());camera.srcObject=null;camera.hidden=true;cameraButton.disabled=false;cameraButton.textContent='Start camera';status.textContent=statusText;
 };
 const acceptBarcode=(value,controls)=>{
  const code=String(value||'').trim();if(!code||!scannerActive)return;
  scannerSession++;scannerActive=false;scannerStarting=false;const activeControls=controls||scannerControls;scannerControls=null;activeControls?.stop();
  camera.pause();camera.srcObject?.getTracks().forEach(track=>track.stop());camera.srcObject=null;camera.hidden=true;cameraButton.disabled=false;cameraButton.textContent='Start camera';
  barcode.value=code;status.textContent='Barcode read. Confirm the race and submit the clocking.';message('Barcode captured. Confirm the race and submit the clocking.','info');
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
  if(scannerActive){stopCamera();return;}
  if(scannerStarting){stopCamera('Camera start canceled.');return;}
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){status.textContent=cameraError();return;}
  const session=++scannerSession;scannerStarting=true;cameraButton.disabled=false;cameraButton.textContent='Cancel camera';status.textContent='Loading the barcode scanner…';
  let cameraStream=null;
  try{
   status.textContent='Requesting camera permission…';
   cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
   if(session!==scannerSession){cameraStream.getTracks().forEach(track=>track.stop());return;}
   camera.srcObject=cameraStream;camera.hidden=false;camera.play().catch(()=>{});
   status.textContent='Loading the barcode scanner…';
   const {BrowserMultiFormatReader}=await import('https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm');
   if(session!==scannerSession){cameraStream.getTracks().forEach(track=>track.stop());return;}
   const reader=new BrowserMultiFormatReader();
   scannerActive=true;status.textContent='Camera is on. Hold the barcode steady in the frame.';
   const controls=await reader.decodeFromStream(cameraStream,camera,(result,_error,scanControls)=>{
    if(result)acceptBarcode(result.getText(),scanControls);
   });
   if(session!==scannerSession||!scannerActive){controls?.stop();return;}
   scannerControls=controls;
   scannerStarting=false;cameraButton.disabled=false;cameraButton.textContent='Stop camera';status.textContent='Camera is on. Hold the barcode steady in the frame.';
  }catch(error){
   if(session!==scannerSession)return;
   scannerActive=false;scannerStarting=false;scannerControls?.stop();scannerControls=null;camera.pause();cameraStream?.getTracks().forEach(track=>track.stop());camera.srcObject?.getTracks().forEach(track=>track.stop());camera.srcObject=null;camera.hidden=true;cameraButton.disabled=false;cameraButton.textContent='Start camera';status.textContent=cameraError(error);console.error('Camera scanner could not start:',error);
  }
 };
 const releaseCameraOnPageHide=()=>stopCamera('Camera stopped.');
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&(scannerActive||scannerStarting))releaseCameraOnPageHide();});
 window.addEventListener('pagehide',releaseCameraOnPageHide,{once:true});
}
async function memberHistory(view,identity) {
 const memberId=identity.profile.member_id;if(!memberId)throw new Error('This account is missing its member record.');
 const [{data:entries,error:a},{data:clocks,error:b},{data:races,error:c}]=await Promise.all([supabase.from('race_entries').select('id,race_id,pigeon_ring').eq('member_id',memberId),supabase.from('clock_events').select('*').order('received_at_utc',{ascending:false}).limit(500),supabase.from('races').select('id,name')]);if(a||b||c)throw a||b||c;
 const ids=new Set(entries.map(e=>e.id));const history=clocks.filter(c=>ids.has(c.race_entry_id)).map(c=>({...c,entry:entries.find(e=>e.id===c.race_entry_id),race:races.find(r=>r.id===entries.find(e=>e.id===c.race_entry_id)?.race_id)}));
 view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">YOUR RECEIPTS</span><h2>Clocking history</h2><p>Recent server-received clockings for your pigeons.</p></div></div><section class="panel">${tableRows(history,[{key:'received_at_utc',label:'Received · PH',render:r=>escapeHTML(formatDate(r.received_at_utc))},{key:'race',label:'Race',render:r=>escapeHTML(r.race?.name||'—')},{key:'entry',label:'Ring',render:r=>escapeHTML(r.entry?.pigeon_ring||'—')},{key:'source',label:'Source',render:()=> 'Barcode'},{key:'verification',label:'Status',render:r=>stateTag(r.verification)}],'No receipts have been recorded yet.',false)}</section>`;
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
 if(checkError){container.innerHTML='<span class="eyebrow">DATABASE SETUP NEEDED</span><h1>Finish database setup</h1><p>In your Supabase SQL Editor run <code>schema.sql</code> (fresh database only), then <code>supabase-auth.sql</code>, <code>multi-club.sql</code>, and <code>public-results.sql</code>, then reload this page.</p>';return;}
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

async function main(){if(body.dataset.view==='login'){loginPage();return;}const role=body.dataset.role,active=body.dataset.active;const identity=await guard(role,active);if(!identity)return;const view=document.querySelector('.page-view');try{const page=body.dataset.view;if(page==='clubs'&&role==='superadmin')await clubsPage(view);else if(page==='team-users'&&role==='admin'&&identity.profile.role==='admin')await teamAccountsPage(view,identity);else if(page==='dashboard'&&role==='admin')await dashboard(view);else if(page==='members'||page==='race-points')await initCrud(view,page==='members'?'members':'race_points',identity.profile.role==='admin');else if(page==='races')await racesPage(view);else if(page==='entries')await entriesPage(view);else if(page==='clocking'&&role==='admin')await clockPage(view,identity);else if(page==='results')await resultsPage(view);else if(page==='dashboard'&&role==='member')await memberDashboard(view,identity);else if(page==='member-clocking')await memberClock(view,identity);else if(page==='history')await memberHistory(view,identity);}catch(error){fail(error);}}
main();
