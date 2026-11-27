import './error-report.js';
import { toolbarHtml, mountToolbar, syncToolbar } from './admin-toolbar.js';
import { supabase, escapeHTML, fail } from './shared.js';
import { startTranslation, languageSwitchHtml, bindLanguageSwitch } from './i18n.js';
import { startUpdateCheck } from './update-check.js';
import { checkAndroidUpdate, bindAppUpdateButton } from './android-app.js';
import { showClubLogo } from './club-logo.js';
import { watchDevice, releaseDevice } from './device-session.js';
import { watchIdle } from './idle-logout.js';
import { watchClubAccount } from './club-lock.js';
const signOutUser = async() => {const {error}=await supabase.auth.signOut({scope:'local'});if(error)throw error;};

const body = document.body;
const BASE = body.dataset.base || '../../';
const appRoot = new URL(BASE, location.href);
body.dataset.appRoot = appRoot.href;
const url = (path) => new URL(path, appRoot).href;
let currentPageCleanup = () => {};

async function getIdentity() {
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return null;
  const {data:profile,error}=await supabase.from('app_profiles').select('id,role,member_id,username,club_id,is_active').eq('id',session.user.id).maybeSingle();
  if(error) throw error;
  let club=null;
  if(profile?.club_id){const {data}=await supabase.from('clubs').select('*').eq('id',profile.club_id).maybeSingle();club=data;}
  return {session,user:session.user,profile:profile||null,club};
}
// Sign-in page that returns here afterwards (for example a member opening a tag's
// clocking link before signing in).
const loginUrl=()=>`${url('pages/login/index.html')}?next=${encodeURIComponent(location.pathname+location.search)}`;
const homeFor = (role) => url(role==='superadmin'?'pages/superadmin/clubs/index.html':['admin','staff'].includes(role)?'pages/admin/dashboard/index.html':'pages/member/dashboard/index.html');
// Line icons for the menu.
const ICON_PATHS={bill:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',pin:'<path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.3"/>',
  home:'<path d="M4 11.5 12 5l8 6.5V20h-5.5v-5h-5v5H4z"/>',
  user:'<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.7 3.6-5.6 7-5.6s6.2 1.9 7 5.6"/>',
  users:'<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-4.9 5.5-4.9s4.9 1.7 5.5 4.9"/><path d="M15 5.6a3 3 0 0 1 0 5.8M17 14.4c1.9.5 3.1 2 3.5 4.6"/>',
  bird:'<path d="M20 5.5c-1.8 0-3 .8-3.7 2.2L12 16H6.5c2.6-.9 4-2.4 4.7-4.4"/><path d="M16.3 7.7C13 7 9 8.4 6.8 11.4 5.5 13.2 4.6 15.4 4 18l4.6-2"/><path d="M17.6 6.4h.01"/><path d="M8.6 16 8 20M11.5 16l.6 3.6"/>',
  target:'<circle cx="12" cy="12" r="6"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>',
  clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  list:'<rect x="5" y="4" width="14" height="16" rx="1.5"/><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4"/>',
  check:'<rect x="4.5" y="4.5" width="15" height="15" rx="1.5"/><path d="m8.5 12.3 2.4 2.4 4.8-5"/>',
  raceday:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
  clocking:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/>',
  tick:'<path d="m5 12.5 4.2 4.2L19 7"/>',
  wifi:'<path d="M4 9.5a12 12 0 0 1 16 0M7 12.8a7.5 7.5 0 0 1 10 0M10 16a3 3 0 0 1 4 0"/><path d="M12 19h.01"/>',
  trend:'<path d="m4 17 5.5-5.5 3.5 3.5L20 8"/><path d="M14.5 8H20v5.5"/>',
  history:'<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9"/><path d="M4.5 4.5V9H9"/><path d="M12 8v4.3l2.8 1.7"/>',
  signout:'<path d="M10 5H6a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 6 19h4"/><path d="M14 8l4 4-4 4M18 12H9"/>',
  sticker:'<path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 9v6M10.5 9v6M13 9v6M16 9v6"/>',
  nfc:'<path d="M8 9.5a4 4 0 0 1 0 5M11.5 7a8 8 0 0 1 0 10M15 4.5a12 12 0 0 1 0 15"/><circle cx="4.5" cy="12" r="1"/>',
  grid:'<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 10h16M10 4v16"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.1.8-1.5 2.6-1.3-.6a7.7 7.7 0 0 1-1.7 1l-.2 1.5h-3l-.2-1.5a7.7 7.7 0 0 1-1.7-1l-1.3.6-1.5-2.6 1.2-.9a7 7 0 0 1 0-2l-1.2-.9 1.5-2.6 1.3.6a7.7 7.7 0 0 1 1.7-1l.2-1.5h3l.2 1.5a7.7 7.7 0 0 1 1.7 1l1.3-.6 1.5 2.6-1.2.9a7 7 0 0 1 0 2Z"/>'
};
const navIcon=name=>`<span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none">${ICON_PATHS[name]||ICON_PATHS.list}</svg></span>`;
const navLinks=(links,active)=>links.map(([key,label,href,icon])=>`<a class="nav-link ${active===key?'active':''}" ${active===key?'aria-current="page"':''} href="${url(href)}">${navIcon(icon)}<span>${label}</span></a>`).join('');
// Groups: [heading or '', links]
const navGroups=(groups,active)=>groups.filter(([,links])=>links.length).map(([heading,links])=>`<div class="nav-group">${heading?`<div class="nav-group-title">${heading}</div>`:''}${navLinks(links,active)}</div>`).join('');
function superadminNav(active) {
  return navGroups([
    ['',[['clubs','Club accounts','pages/superadmin/clubs/index.html','users']]],
    ['Registration',[['sticker-register','Register Sticker','pages/superadmin/stickers/register/index.html','sticker'],['nfc-register','Register NFC','pages/superadmin/nfc/index.html','nfc'],['rfid-register','Register RFID reader','pages/superadmin/readers/index.html','wifi'],['sticker-generate','Generate Sticker','pages/superadmin/stickers/generate/index.html','grid']]],
    ['Administration',[['billing','Billing','pages/superadmin/billing/index.html','bill'],['setup','Setup checklist','pages/superadmin/setup/index.html','check']]]
  ],active);
}
function adminNav(active,canManageAccounts) {
  return navGroups([
    ['',[['overview','Overview','pages/admin/dashboard/index.html','home']]],
    ['Club directory',[['members','Members','pages/admin/members/index.html','user'],['birds','Band Assignments','pages/admin/birds/index.html','bird']]],
    ['Race setup',[['race-points','Race points','pages/admin/race-points/index.html','target'],['coordinates','My coordinates','pages/admin/coordinates/index.html','pin'],['races','Races','pages/admin/races/index.html','clock'],['entries','Race entries','pages/admin/entries/index.html','list'],['remarks','Entry remarks','pages/admin/remarks/index.html','check']]],
    ['Race day operations',[['raceday','Race day','pages/admin/raceday/index.html','raceday'],['clocking','Clocking','pages/admin/clocking/index.html','clocking'],['showup','Show up','pages/admin/showup/index.html','tick'],['readers','RFID readers','pages/admin/readers/index.html','wifi'],['results','Results','pages/admin/results/index.html','trend']]],
    ['Administration',[['history','Change history','pages/admin/history/index.html','history'],...(canManageAccounts?[['users','Team accounts','pages/admin/users/index.html','users'],['settings','Club settings','pages/admin/settings/index.html','settings'],['billing','Billing','pages/admin/billing/index.html','bill']]:[])]]
  ],active);
}
function memberNav(active) {
  return navGroups([['',[['dashboard','My races','pages/member/dashboard/index.html','home'],['history','My clocking history','pages/member/history/index.html','history'],['clocking','Clocking','pages/member/clocking/index.html','clocking'],['pigeons','My pigeons','pages/member/pigeons/index.html','bird'],['coordinates','My coordinates','pages/member/coordinates/index.html','pin'],['results','Results','pages/member/results/index.html','trend'],['settings','Settings','pages/member/settings/index.html','settings']]]],active);
}
// Phones: the four main pages of each role, plus More, which opens the full
// menu (every page, language and sign out). Same links as the sidebar.
const BOTTOM_NAV={
  member:[['dashboard','My races','pages/member/dashboard/index.html','home'],['clocking','Clocking','pages/member/clocking/index.html','clocking'],['history','History','pages/member/history/index.html','history'],['results','Results','pages/member/results/index.html','trend']],
  admin:[['overview','Overview','pages/admin/dashboard/index.html','home'],['races','Races','pages/admin/races/index.html','clock'],['clocking','Clocking','pages/admin/clocking/index.html','clocking'],['results','Results','pages/admin/results/index.html','trend']],
  superadmin:[['clubs','Clubs','pages/superadmin/clubs/index.html','users'],['sticker-register','Stickers','pages/superadmin/stickers/register/index.html','sticker'],['nfc-register','NFC','pages/superadmin/nfc/index.html','nfc'],['rfid-register','Readers','pages/superadmin/readers/index.html','wifi']]
};
const bottomIcon=name=>`<span class="member-bottom-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none">${ICON_PATHS[name]||ICON_PATHS.list}</svg></span>`;
function bottomNav(active, role) {
  const links=BOTTOM_NAV[role]||[],inBar=links.some(([key])=>key===active);
  return `<nav class="member-bottom-nav" aria-label="Main">${links.map(([key,label,href,icon])=>`<a class="member-bottom-link" href="${url(href)}" ${active===key?'aria-current="page"':''}>${bottomIcon(icon)}<span class="member-bottom-label">${label}</span></a>`).join('')}<button type="button" class="member-bottom-link${inBar?'':' is-active'}" data-open-menu aria-expanded="false" aria-controls="app-sidebar"><span class="member-bottom-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M5 12h14M5 17h14"/></svg></span><span class="member-bottom-label">More</span></button></nav>`;
}
async function guard(role,active) {
  try {
    const identity=await getIdentity();
    if(!identity) { location.href=loginUrl(); return null; }
    if(!identity.profile) { await signOutUser(); document.querySelector('#app-shell').innerHTML=`<main class="loading"><strong>This account is not set up yet.</strong><span>Ask your administrator to finish setting up your account.</span><a class="button primary" href="${url('pages/login/index.html')}">Return to sign in</a></main>`; return null; }
    if(identity.profile.is_active===false) { await signOutUser(); document.querySelector('#app-shell').innerHTML=`<main class="loading"><strong>This account is disabled.</strong><span>Ask your club administrator to reactivate it.</span><a class="button primary" href="${url('pages/login/index.html')}">Return to sign in</a></main>`; return null; }
    const staffOnAdminPage=role==='admin'&&identity.profile.role==='staff'&&!['team-users','club-settings','billing'].includes(body.dataset.view);
    if(identity.profile.role!==role&&!staffOnAdminPage) { location.href=homeFor(identity.profile.role); return null; }
    body.classList.toggle('member-body',role==='member');
    body.classList.toggle('admin-body',role==='admin');
    document.querySelector('#app-shell').innerHTML=`<aside class="sidebar" id="app-sidebar"><a class="brand" href="${homeFor(role)}"><img class="brand-logo" src="${url('assets/images/clocking-logo.png')}" alt="AvilonX pigeon clock logo" width="72" height="48"><span>AvilonX<span class="brand-sub">RACE CLOCKING</span></span></a>${role==='superadmin'||identity.profile.role==='staff'?`<div class="nav-label">${role==='superadmin'?'SUPERADMIN':'STAFF'}</div>`:''}<nav>${role==='superadmin'?superadminNav(active):role==='admin'?adminNav(active,identity.profile.role==='admin'):memberNav(active)}</nav><div class="sidebar-bottom"><div class="signed-in"><span class="avatar">${escapeHTML((identity.profile.username||'M')[0].toUpperCase())}</span><span class="signed-email">${escapeHTML(identity.profile.username||'Account')}</span></div>${languageSwitchHtml()}<button class="nav-link app-check" type="button" data-app-check hidden>${navIcon('history')}<span>Check for updates <small class="app-version" data-app-version></small></span></button><button class="nav-link signout" id="sign-out">${navIcon('signout')}<span>Sign out</span></button></div></aside><main class="main"><div class="nav-backdrop" id="nav-backdrop"></div><div class="app-header"><header class="topbar"><div class="topbar-left"><button class="menu-toggle" id="menu-toggle" type="button" aria-label="Open menu">☰</button><span class="club-logo" data-club-logo hidden></span><div><div class="eyebrow">${escapeHTML(role==='superadmin'?'SUPERADMIN':(identity.club?.name||'PIGEON RACING CLUB').toUpperCase())}</div><h1>${escapeHTML(document.body.dataset.title||'Race clocking')}</h1></div></div><div class="topbar-right"><span class="live-dot"></span><span>Online</span><span class="timezone">PH · UTC+8</span></div></header>${role==='admin'?toolbarHtml(identity):''}</div><div class="page-content"><div data-message class="notice" hidden></div><section class="page-view" data-view="${escapeHTML(body.dataset.view)}"></section></div></main>${bottomNav(active,role)}`;
    body.classList.add('has-bottom-nav');
    document.querySelector('#menu-toggle').onclick=()=>setMenu(!body.classList.contains('nav-open'));document.querySelector('#nav-backdrop').onclick=()=>setMenu(false);document.querySelector('[data-open-menu]')?.addEventListener('click',()=>setMenu(!body.classList.contains('nav-open')));document.querySelector('#sign-out').addEventListener('click',async(event)=>{const button=event.currentTarget;if(button.disabled)return;forgetRoute();button.disabled=true;button.setAttribute('aria-busy','true');button.querySelector('.nav-icon').textContent='…';try{await Promise.race([releaseDevice().then(signOutUser),new Promise(resolve=>setTimeout(resolve,1800))]);}catch(error){console.warn('Supabase local sign-out failed; redirecting to sign-in:',error);}finally{location.replace(url('pages/login/index.html'));}});
    if(role==='admin')mountToolbar(identity);bindLanguageSwitch(document.querySelector('#app-shell'));bindAppUpdateButton(document.querySelector('#app-shell'));showClubLogo(identity.club?.logo_path);startTranslation();
    return identity;
  } catch(error){fail(error);return null;}
}

async function renderPage(view,role,identity,page=body.dataset.view,setCleanup=fn=>{currentPageCleanup=fn;}){
  if(page==='clubs'&&role==='superadmin'){const pageModule=await import('../../pages/superadmin/clubs/page.js');await pageModule.render(view);}
  else if(page==='sticker-register'&&role==='superadmin'){const pageModule=await import('../../pages/superadmin/stickers/register/page.js');await pageModule.render(view,setCleanup);}
  else if(page==='nfc-register'&&role==='superadmin'){const pageModule=await import('../../pages/superadmin/nfc/page.js');await pageModule.render(view,setCleanup);}
  else if(page==='rfid-register'&&role==='superadmin'){const pageModule=await import('../../pages/superadmin/readers/page.js');await pageModule.render(view,setCleanup);}
  else if(page==='billing'&&role==='superadmin'){const pageModule=await import('../../pages/superadmin/billing/page.js');await pageModule.render(view);}
  else if(page==='billing'&&role==='admin'&&identity.profile.role==='admin'){const pageModule=await import('../../pages/admin/billing/page.js');await pageModule.render(view);}
  else if(page==='setup'&&role==='superadmin'){const pageModule=await import('../../pages/superadmin/setup/page.js');await pageModule.render(view);}
  else if(page==='sticker-generate'&&role==='superadmin'){const pageModule=await import('../../pages/superadmin/stickers/generate/page.js');await pageModule.render(view);}
  else if(page==='team-users'&&role==='admin'&&identity.profile.role==='admin'){const pageModule=await import('../../pages/admin/users/page.js');await pageModule.render(view,identity);}
  else if(page==='race-day'&&role==='admin'){const pageModule=await import('../../pages/admin/raceday/page.js');await pageModule.render(view,identity,setCleanup);}
  else if(page==='club-settings'&&role==='admin'&&identity.profile.role==='admin'){const pageModule=await import('../../pages/admin/settings/page.js');await pageModule.render(view,identity);}
  else if(page==='change-history'&&role==='admin'){const pageModule=await import('../../pages/admin/history/page.js');await pageModule.render(view,identity);}
  else if(page==='dashboard'&&role==='admin'){const pageModule=await import('../../pages/admin/dashboard/page.js');await pageModule.render(view);}
  else if(page==='members'){const pageModule=await import('../../pages/admin/members/page.js');await pageModule.render(view,identity.profile.role==='admin');}
  else if(page==='race-points'){const pageModule=await import('../../pages/admin/race-points/page.js');await pageModule.render(view,identity.profile.role==='admin');}
  else if(page==='races'){const pageModule=await import('../../pages/admin/races/page.js');await pageModule.render(view);}
  else if(page==='entries'){const pageModule=await import('../../pages/admin/entries/page.js');await pageModule.entriesPage(view,setCleanup);}
  else if(page==='clocking'&&role==='admin'){const pageModule=await import('../../pages/admin/clocking/page.js');await pageModule.render(view,identity,setCleanup);}
  else if(page==='show-up'&&role==='admin'){const pageModule=await import('../../pages/admin/showup/page.js');await pageModule.render(view,identity,setCleanup);}
  else if(page==='bird-bonding'&&role==='admin'){const pageModule=await import('../../pages/admin/birds/page.js');await pageModule.render(view,identity,setCleanup);}
  else if(page==='entry-remarks'&&role==='admin'){const pageModule=await import('../../pages/admin/remarks/page.js');await pageModule.render(view,identity);}
  else if(page==='rfid-readers'&&role==='admin'){const pageModule=await import('../../pages/admin/readers/page.js');await pageModule.render(view,identity,setCleanup);}
  else if(page==='results'&&role==='admin'){const pageModule=await import('../../pages/admin/results/page.js');await pageModule.render(view);}
  else if(page==='dashboard'&&role==='member'){const pageModule=await import('../../pages/member/dashboard/page.js');await pageModule.render(view,identity);}
  else if(page==='member-clocking'&&role==='member'){const pageModule=await import('../../pages/member/clocking/page.js');await pageModule.render(view,identity,setCleanup);}
  else if(page==='history'&&role==='member'){const pageModule=await import('../../pages/member/history/page.js');await pageModule.render(view,identity);}
  else if(page==='member-results'&&role==='member'){const pageModule=await import('../../pages/member/results/page.js');await pageModule.render(view);}
  else if(page==='my-pigeons'&&role==='member'){const pageModule=await import('../../pages/member/pigeons/page.js');await pageModule.render(view,identity);}
  else if(page==='my-coordinates'){const pageModule=await import('./my-coordinates.js');pageModule.render(view);}
  else if(page==='member-settings'&&role==='member'){const pageModule=await import('../../pages/member/settings/page.js');await pageModule.render(view,identity);}
}
async function main(){
  startUpdateCheck();
  checkAndroidUpdate().catch(()=>{});
  if(body.dataset.view==='reset-password'){try{const pageModule=await import('../../pages/reset-password/page.js');await pageModule.render();}catch(error){fail(error);}return;}
  if(body.dataset.view==='login'){try{const pageModule=await import('../../pages/login/page.js');await pageModule.render();showSiteOnly('pages/login/index.html');}catch(error){fail(error);}return;}
  const role=body.dataset.role,active=body.dataset.active,identity=await guard(role,active);
  if(!identity)return;
  // One device per account: sign out here when another device took the account over.
  if(identity.profile?.role!=='superadmin')watchDevice(async()=>{try{await signOutUser();}catch{/* already signed out */}location.replace(`${url('pages/login/index.html')}?signedout=device`);});
  // Club admin and staff: a closed club shows only the lock screen; warnings pop up.
  if(['admin','staff'].includes(identity.profile?.role)&&await watchClubAccount(async()=>{try{await signOutUser();}catch{/* already signed out */}location.replace(url('pages/login/index.html'));}))return;
  // 15 minutes without any action: signed out (all roles).
  watchIdle(async()=>{try{await signOutUser();}catch{/* already signed out */}location.replace(`${url('pages/login/index.html')}?signedout=idle`);});
  await navigateRoute(routeFor(location.href),{push:false,identity});
  // Members get a pop-up with the result whenever one of their pigeons is clocked (also by their loft reader).
  if(role==='member'&&identity.profile?.member_id)import('./member-results-watch.js').then(module=>module.watchMemberReceipts(identity.profile.member_id)).catch(error=>console.warn('Result pop-ups unavailable:',error));
}
const routes=[
  {
    "path": "pages/admin/settings/index.html",
    "documentTitle": "Club settings \u00b7 AvilonX Clocking",
    "title": "Club settings",
    "view": "club-settings",
    "role": "admin",
    "active": "settings"
  },
  {
    "path": "pages/admin/raceday/index.html",
    "documentTitle": "Race day \u00b7 AvilonX Clocking",
    "title": "Race day",
    "view": "race-day",
    "role": "admin",
    "active": "raceday"
  },
  {
    "path": "pages/admin/history/index.html",
    "documentTitle": "Change history \u00b7 AvilonX Clocking",
    "title": "Change history",
    "view": "change-history",
    "role": "admin",
    "active": "history"
  },
  {
    "path": "pages/member/pigeons/index.html",
    "documentTitle": "My pigeons \u00b7 AvilonX Clocking",
    "title": "My pigeons",
    "view": "my-pigeons",
    "role": "member",
    "active": "pigeons"
  },
  {
    "path": "pages/superadmin/billing/index.html",
    "documentTitle": "Billing \u00b7 AvilonX Clocking",
    "title": "Billing",
    "view": "billing",
    "role": "superadmin",
    "active": "billing"
  },
  {
    "path": "pages/admin/billing/index.html",
    "documentTitle": "Billing \u00b7 AvilonX Clocking",
    "title": "Billing",
    "view": "billing",
    "role": "admin",
    "active": "billing"
  },
  {
    "path": "pages/superadmin/setup/index.html",
    "documentTitle": "Setup checklist \u00b7 AvilonX Clocking",
    "title": "Setup checklist",
    "view": "setup",
    "role": "superadmin",
    "active": "setup"
  },
  {
    "path": "pages/admin/clocking/index.html",
    "documentTitle": "Clocking \u00b7 AvilonX Clocking",
    "title": "Clocking",
    "view": "clocking",
    "role": "admin",
    "active": "clocking"
  },
  {
    "path": "pages/admin/dashboard/index.html",
    "documentTitle": "Overview \u00b7 AvilonX Clocking",
    "title": "Overview",
    "view": "dashboard",
    "role": "admin",
    "active": "overview"
  },
  {
    "path": "pages/admin/entries/index.html",
    "documentTitle": "Race entries \u00b7 AvilonX Clocking",
    "title": "Race entries",
    "view": "entries",
    "role": "admin",
    "active": "entries"
  },
  {
    "path": "pages/admin/members/index.html",
    "documentTitle": "Members & lofts \u00b7 AvilonX Clocking",
    "title": "Members & lofts",
    "view": "members",
    "role": "admin",
    "active": "members"
  },
  {
    "path": "pages/admin/race-points/index.html",
    "documentTitle": "Race points \u00b7 AvilonX Clocking",
    "title": "Race points",
    "view": "race-points",
    "role": "admin",
    "active": "race-points"
  },
  {
    "path": "pages/admin/races/index.html",
    "documentTitle": "Race schedules \u00b7 AvilonX Clocking",
    "title": "Race schedules",
    "view": "races",
    "role": "admin",
    "active": "races"
  },
  {
    "path": "pages/admin/results/index.html",
    "documentTitle": "Race results \u00b7 AvilonX Clocking",
    "title": "Race results",
    "view": "results",
    "role": "admin",
    "active": "results"
  },
  {
    "path": "pages/admin/showup/index.html",
    "documentTitle": "Show up \u00b7 AvilonX Clocking",
    "title": "Show up",
    "view": "show-up",
    "role": "admin",
    "active": "showup"
  },
  {
    "path": "pages/admin/birds/index.html",
    "documentTitle": "Band Assignments \u00b7 AvilonX Clocking",
    "title": "Band Assignments",
    "view": "bird-bonding",
    "role": "admin",
    "active": "birds"
  },
  {
    "path": "pages/admin/remarks/index.html",
    "documentTitle": "Entry remarks \u00b7 AvilonX Clocking",
    "title": "Entry remarks",
    "view": "entry-remarks",
    "role": "admin",
    "active": "remarks"
  },
  {
    "path": "pages/admin/readers/index.html",
    "documentTitle": "RFID readers \u00b7 AvilonX Clocking",
    "title": "RFID readers",
    "view": "rfid-readers",
    "role": "admin",
    "active": "readers"
  },
  {
    "path": "pages/admin/users/index.html",
    "documentTitle": "Team accounts \u00b7 AvilonX Clocking",
    "title": "Team accounts",
    "view": "team-users",
    "role": "admin",
    "active": "users"
  },
  {
    "path": "pages/member/clocking/index.html",
    "documentTitle": "Clock a pigeon \u00b7 AvilonX Clocking",
    "title": "Clock a pigeon",
    "view": "member-clocking",
    "role": "member",
    "active": "clocking"
  },
  {
    "path": "pages/member/dashboard/index.html",
    "documentTitle": "My races \u00b7 AvilonX Clocking",
    "title": "My races",
    "view": "dashboard",
    "role": "member",
    "active": "dashboard"
  },
  {
    "path": "pages/member/history/index.html",
    "documentTitle": "Clocking history \u00b7 AvilonX Clocking",
    "title": "Clocking history",
    "view": "history",
    "role": "member",
    "active": "history"
  },
  {
    "path": "pages/member/results/index.html",
    "documentTitle": "Race results \u00b7 AvilonX Clocking",
    "title": "Results",
    "view": "member-results",
    "role": "member",
    "active": "results"
  },
  {
    "path": "pages/admin/coordinates/index.html",
    "documentTitle": "My coordinates \u00b7 AvilonX Clocking",
    "title": "My coordinates",
    "view": "my-coordinates",
    "role": "admin",
    "active": "coordinates"
  },
  {
    "path": "pages/member/coordinates/index.html",
    "documentTitle": "My coordinates \u00b7 AvilonX Clocking",
    "title": "My coordinates",
    "view": "my-coordinates",
    "role": "member",
    "active": "coordinates"
  },
  {
    "path": "pages/member/settings/index.html",
    "documentTitle": "Settings \u00b7 AvilonX Clocking",
    "title": "Settings",
    "view": "member-settings",
    "role": "member",
    "active": "settings"
  },
  {
    "path": "pages/superadmin/clubs/index.html",
    "documentTitle": "Club accounts \u00b7 AvilonX Clocking",
    "title": "Club accounts",
    "view": "clubs",
    "role": "superadmin",
    "active": "clubs"
  },
  {
    "path": "pages/superadmin/stickers/generate/index.html",
    "documentTitle": "Generate Sticker \u00b7 AvilonX Clocking",
    "title": "Generate Sticker",
    "view": "sticker-generate",
    "role": "superadmin",
    "active": "sticker-generate"
  },
  {
    "path": "pages/superadmin/stickers/register/index.html",
    "documentTitle": "Register Sticker \u00b7 AvilonX Clocking",
    "title": "Register Sticker",
    "view": "sticker-register",
    "role": "superadmin",
    "active": "sticker-register"
  },
  {
    "path": "pages/superadmin/nfc/index.html",
    "documentTitle": "Register NFC \u00b7 AvilonX Clocking",
    "title": "Register NFC",
    "view": "nfc-register",
    "role": "superadmin",
    "active": "nfc-register"
  },
  {
    "path": "pages/superadmin/readers/index.html",
    "documentTitle": "Register RFID reader \u00b7 AvilonX Clocking",
    "title": "Register RFID reader",
    "view": "rfid-register",
    "role": "superadmin",
    "active": "rfid-register"
  }
];
function routeFor(href){
  const target=new URL(href,location.href);
  if(target.origin!==location.origin)return null;
  return routes.find(route=>new URL(url(route.path)).pathname===target.pathname);
}
function setMenu(open){
  body.classList.toggle('nav-open',open);
  document.querySelectorAll('#menu-toggle,[data-open-menu]').forEach(button=>button.setAttribute('aria-expanded',String(open)));
}
// The address bar shows only the site (www.avilonx.site/). The page in use is kept
// in the history entry and in this tab's session, so Back, Forward and Refresh
// still return to it (index.html sends a refreshed tab back to it).
const ROUTE_KEY='avilonx.route';
let currentPath=null;
function showSiteOnly(path){
  currentPath=path;
  try{sessionStorage.setItem(ROUTE_KEY,path);}catch{/* storage unavailable */}
  try{history.replaceState({appRoute:true,path},'',url(''));}catch{/* history unavailable */}
}
const forgetRoute=()=>{try{sessionStorage.removeItem(ROUTE_KEY);}catch{/* storage unavailable */}};
// The top bar already names the page: a page heading that only repeats it is kept
// for screen readers but takes no space; a heading row left empty collapses.
function tidyHeading(view,title){
  const row=view.querySelector('.split-heading,.welcome-row,.entries-head,.birds-head');
  const heading=row?.querySelector('h2');
  if(!heading||heading.textContent.trim().toLowerCase()!==String(title||'').trim().toLowerCase())return;
  heading.classList.add('sr-only');
  if(!row.querySelector('button,a,select,input,p,label'))row.classList.add('is-empty');
}
let navigationToken=0;
async function navigateRoute(route,{push=true,identity=null}={}){
  if(!route||route.role!==body.dataset.role)return;
  const token=++navigationToken;
  const cleanup=currentPageCleanup;currentPageCleanup=()=>{};cleanup();
  if(push)history.pushState({appRoute:true,path:route.path},'',url(''));
  showSiteOnly(route.path);
  setMenu(false);
  body.dataset.title=route.title;body.dataset.view=route.view;body.dataset.active=route.active;
  document.title=route.documentTitle;
  const heading=document.querySelector('.topbar h1');if(heading)heading.textContent=route.title;
  document.querySelectorAll('.sidebar nav a,.member-bottom-nav a').forEach(link=>{
    const active=new URL(link.href).pathname===new URL(url(route.path)).pathname;
    link.classList.toggle('active',active);
    if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  });
  // More is highlighted when the page is not one of the bottom bar's own.
  document.querySelector('.member-bottom-nav [data-open-menu]')?.classList.toggle('is-active',!document.querySelector('.member-bottom-nav a[aria-current="page"]'));
  const notice=document.querySelector('[data-message]');if(notice){notice.hidden=true;notice.textContent='';}
  const view=document.createElement('section');view.className='page-view';view.dataset.view=route.view;
  view.setAttribute('aria-busy','true');
  view.innerHTML='<div class="route-loading" role="status"><span class="spinner" aria-hidden="true"></span>Loading page…</div>';
  document.querySelector('.page-view')?.replaceWith(view);
  window.scrollTo(0,0);
  try{
    identity=identity||await getIdentity();
    if(token!==navigationToken)return;
    if(!identity?.profile){location.href=loginUrl();return;}
    if(identity.profile.is_active===false){await signOutUser();location.href=url('pages/login/index.html');return;}
    const allowed=identity.profile.role===route.role||(route.role==='admin'&&identity.profile.role==='staff'&&route.view!=='team-users');
    if(!allowed){location.href=homeFor(identity.profile.role);return;}
    await renderPage(view,route.role,identity,route.view,fn=>{
      if(token===navigationToken)currentPageCleanup=fn;else fn();
    });
    if(token===navigationToken){tidyHeading(view,route.title);syncToolbar(view,route.view);}
  }catch(error){
    if(token===navigationToken){
      view.innerHTML='<div class="notice error" role="alert">Could not load this page. Please try again.</div><button class="button secondary" data-retry-page>Try again</button>';
      view.querySelector('[data-retry-page]').onclick=()=>navigateRoute(route,{push:false});
      fail(error);
    }
  }finally{view.removeAttribute('aria-busy');}
}
document.addEventListener('click',event=>{
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const anchor=event.target.closest?.('a[href]');
  if(!anchor||anchor.hasAttribute('download')||(anchor.target&&anchor.target!=='_self'))return;
  const route=routeFor(anchor.href);
  if(!route||route.role!==body.dataset.role||!document.querySelector('.page-view'))return;
  event.preventDefault();navigateRoute(route);
});
window.addEventListener('popstate',event=>{
  const route=event?.state?.path?routeFor(url(event.state.path)):routeFor(location.href);
  if(route&&route.role===body.dataset.role)navigateRoute(route,{push:false});
});
window.addEventListener('app:refresh',()=>navigateRoute(routeFor(currentPath?url(currentPath):location.href),{push:false}));
document.addEventListener('keydown',event=>{if(event.key==='Escape')setMenu(false);});
main();
