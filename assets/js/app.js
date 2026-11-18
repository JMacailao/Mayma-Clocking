import { supabase, escapeHTML, fail } from './shared.js';
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
  if(profile?.club_id){const {data}=await supabase.from('clubs').select('id,name').eq('id',profile.club_id).maybeSingle();club=data;}
  return {session,user:session.user,profile:profile||null,club};
}
// Sign-in page that returns here afterwards (for example a member opening a tag's
// clocking link before signing in).
const loginUrl=()=>`${url('pages/login/index.html')}?next=${encodeURIComponent(location.pathname+location.search)}`;
const homeFor = (role) => url(role==='superadmin'?'pages/superadmin/clubs/index.html':['admin','staff'].includes(role)?'pages/admin/dashboard/index.html':'pages/member/dashboard/index.html');
function superadminNav(active) {
  const links=[['clubs','Club accounts','pages/superadmin/clubs/index.html','⌂'],['sticker-register','Register Sticker','pages/superadmin/stickers/register/index.html','▣'],['nfc-register','Register NFC','pages/superadmin/nfc/index.html','◉'],['rfid-register','Register RFID reader','pages/superadmin/readers/index.html','⌁'],['sticker-generate','Generate Sticker','pages/superadmin/stickers/generate/index.html','▤'],['setup','Setup checklist','pages/superadmin/setup/index.html','✓']];
  return links.map(([key,label,href,icon])=>`<a class="nav-link ${active===key?'active':''}" ${active===key?'aria-current="page"':''} href="${url(href)}"><span class="nav-icon">${icon}</span>${label}</a>`).join('');
}
function adminNav(active,canManageAccounts) {
  const links=[['dashboard','Overview','pages/admin/dashboard/index.html','◧'],['members','Members','pages/admin/members/index.html','♙'],['birds','Bird bonding','pages/admin/birds/index.html','❖'],['race-points','Race points','pages/admin/race-points/index.html','⌖'],['races','Races','pages/admin/races/index.html','◷'],['entries','Race entries','pages/admin/entries/index.html','▤'],['remarks','Entry remarks','pages/admin/remarks/index.html','☑'],['clocking','Clocking','pages/admin/clocking/index.html','◉'],['showup','Show up','pages/admin/showup/index.html','✔'],['readers','RFID readers','pages/admin/readers/index.html','⌁'],['results','Results','pages/admin/results/index.html','↗']];
  if(canManageAccounts)links.push(['users','Team accounts','pages/admin/users/index.html','♧']);
  return links.map(([key,label,href,icon])=>`<a class="nav-link ${active===key?'active':''}" ${active===key?'aria-current="page"':''} href="${url(href)}"><span class="nav-icon">${icon}</span>${label}</a>`).join('');
}
function memberNav(active) {
  const links=[['dashboard','My races','pages/member/dashboard/index.html','◧'],['history','My clocking history','pages/member/history/index.html','◷'],['clocking','Clocking','pages/member/clocking/index.html','◉'],['results','Results','pages/member/results/index.html','↗'],['settings','Settings','pages/member/settings/index.html','⚙']];
  return links.map(([key,label,href,icon])=>`<a class="nav-link ${active===key?'active':''}" ${active===key?'aria-current="page"':''} href="${url(href)}"><span class="nav-icon">${icon}</span>${label}</a>`).join('');
}
function bottomNav(active, role) {
  let links=[
    ['dashboard','My races','pages/member/dashboard/index.html','<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/></svg>'],
    ['history','My clocking history','pages/member/history/index.html','<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2M5 4 3.5 6M19 4l1.5 2"/></svg>'],
    ['clocking','Clocking','pages/member/clocking/index.html','<svg viewBox="0 0 24 24" fill="none"><path d="M5 4v16M8 4v16M12 4v16M15 4v16M19 4v16"/><path d="M3 7h2M17 17h4"/></svg>'],
    ['results','Results','pages/member/results/index.html','<svg viewBox="0 0 24 24" fill="none"><path d="M5 19V5M5 19h15"/><path d="m8 15 3-4 3 2 4-6"/><circle cx="18" cy="7" r="1"/></svg>'],
    ['settings','Settings','pages/member/settings/index.html','<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.1.8-1.5 2.6-1.3-.6a7.7 7.7 0 0 1-1.7 1l-.2 1.5h-3l-.2-1.5a7.7 7.7 0 0 1-1.7-1l-1.3.6-1.5-2.6 1.2-.9a7 7 0 0 1 0-2l-1.2-.9 1.5-2.6 1.3.6a7.7 7.7 0 0 1 1.7-1l.2-1.5h3l.2 1.5a7.7 7.7 0 0 1 1.7 1l1.3-.6 1.5 2.6-1.2.9a7 7 0 0 1 0 2Z"/></svg>']
  ];
  if(role==='admin')links=[
    ['overview','Overview','pages/admin/dashboard/index.html',links[0][3]],
    ['races','Races','pages/admin/races/index.html',links[1][3]],
    ['clocking','Clocking','pages/admin/clocking/index.html',links[2][3]],
    ['results','Results','pages/admin/results/index.html',links[3][3]],
    ['menu','More',null,'<svg viewBox="0 0 24 24" fill="none"><path d="M5 6h14M5 12h14M5 18h14"/></svg>']
  ];
  return `<nav class="member-bottom-nav" aria-label="${role==='admin'?'Admin':'Member'} navigation">${links.map(([key,label,href,icon])=>`<${href?'a':'button type="button"'} class="member-bottom-link ${key==='clocking'?'is-clock':''}" ${href?`href="${url(href)}"`:'data-open-menu aria-expanded="false"'} ${active===key?'aria-current="page"':''} aria-label="${label}"><span class="member-bottom-icon" aria-hidden="true">${icon}</span><span class="member-bottom-label">${label}</span></${href?'a':'button'}>`).join('')}</nav>`;
}
async function guard(role,active) {
  try {
    const identity=await getIdentity();
    if(!identity) { location.href=loginUrl(); return null; }
    if(!identity.profile) { await signOutUser(); document.querySelector('#app-shell').innerHTML=`<main class="loading"><strong>This account is not set up yet.</strong><span>Ask your administrator to finish setting up your account.</span><a class="button primary" href="${url('pages/login/index.html')}">Return to sign in</a></main>`; return null; }
    if(identity.profile.is_active===false) { await signOutUser(); document.querySelector('#app-shell').innerHTML=`<main class="loading"><strong>This account is disabled.</strong><span>Ask your club administrator to reactivate it.</span><a class="button primary" href="${url('pages/login/index.html')}">Return to sign in</a></main>`; return null; }
    const staffOnAdminPage=role==='admin'&&identity.profile.role==='staff'&&body.dataset.view!=='team-users';
    if(identity.profile.role!==role&&!staffOnAdminPage) { location.href=homeFor(identity.profile.role); return null; }
    body.classList.toggle('member-body',role==='member');
    body.classList.toggle('admin-body',role==='admin');
    document.querySelector('#app-shell').innerHTML=`<aside class="sidebar"><a class="brand" href="${homeFor(role)}"><img class="brand-logo" src="${url('assets/images/clocking-logo.png')}" alt="AvilonX pigeon clock logo" width="72" height="48"><span>AvilonX<span class="brand-sub">RACE CLOCKING</span></span></a><div class="nav-label">${role==='superadmin'?'SUPERADMIN':identity.profile.role==='admin'?'MANAGEMENT':identity.profile.role==='staff'?'STAFF':'MEMBER AREA'}</div><nav>${role==='superadmin'?superadminNav(active):role==='admin'?adminNav(active,identity.profile.role==='admin'):memberNav(active)}</nav><div class="sidebar-bottom"><div class="signed-in"><span class="avatar">${escapeHTML((identity.profile.username||'M')[0].toUpperCase())}</span><span class="signed-email">${escapeHTML(identity.profile.username||'Account')}</span></div><button class="nav-link signout" id="sign-out"><span class="nav-icon">↪</span>Sign out</button></div></aside><main class="main"><div class="nav-backdrop" id="nav-backdrop"></div><header class="topbar"><div class="topbar-left"><button class="menu-toggle" id="menu-toggle" type="button" aria-label="Open menu">☰</button><div><div class="eyebrow">${escapeHTML(role==='superadmin'?'SUPERADMIN':(identity.club?.name||'PIGEON RACING CLUB').toUpperCase())}</div><h1>${escapeHTML(document.body.dataset.title||'Race clocking')}</h1></div></div><div class="topbar-right"><span class="live-dot"></span><span>Supabase connected</span><span class="timezone">PH · UTC+8</span></div></header><div class="page-content"><div data-message class="notice" hidden></div><section class="page-view" data-view="${escapeHTML(body.dataset.view)}"></section><footer>Clock receipts are recorded by Supabase server time and remain provisional until verified by the club.</footer></div></main>${['member','admin'].includes(role)?bottomNav(active,role):''}`;
    document.querySelector('#menu-toggle').onclick=()=>setMenu(!body.classList.contains('nav-open'));document.querySelector('#nav-backdrop').onclick=()=>setMenu(false);document.querySelector('[data-open-menu]')?.addEventListener('click',()=>setMenu(!body.classList.contains('nav-open')));document.querySelector('#sign-out').addEventListener('click',async(event)=>{const button=event.currentTarget;if(button.disabled)return;button.disabled=true;button.setAttribute('aria-busy','true');button.querySelector('.nav-icon').textContent='…';try{await Promise.race([signOutUser(),new Promise(resolve=>setTimeout(resolve,1800))]);}catch(error){console.warn('Supabase local sign-out failed; redirecting to sign-in:',error);}finally{location.replace(url('pages/login/index.html'));}});
    return identity;
  } catch(error){fail(error);return null;}
}

async function renderPage(view,role,identity,page=body.dataset.view,setCleanup=fn=>{currentPageCleanup=fn;}){
  if(page==='clubs'&&role==='superadmin'){const pageModule=await import('../../pages/superadmin/clubs/page.js');await pageModule.render(view);}
  else if(page==='sticker-register'&&role==='superadmin'){const pageModule=await import('../../pages/superadmin/stickers/register/page.js');await pageModule.render(view,setCleanup);}
  else if(page==='nfc-register'&&role==='superadmin'){const pageModule=await import('../../pages/superadmin/nfc/page.js');await pageModule.render(view,setCleanup);}
  else if(page==='rfid-register'&&role==='superadmin'){const pageModule=await import('../../pages/superadmin/readers/page.js');await pageModule.render(view,setCleanup);}
  else if(page==='setup'&&role==='superadmin'){const pageModule=await import('../../pages/superadmin/setup/page.js');await pageModule.render(view);}
  else if(page==='sticker-generate'&&role==='superadmin'){const pageModule=await import('../../pages/superadmin/stickers/generate/page.js');await pageModule.render(view);}
  else if(page==='team-users'&&role==='admin'&&identity.profile.role==='admin'){const pageModule=await import('../../pages/admin/users/page.js');await pageModule.render(view,identity);}
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
  else if(page==='member-settings'&&role==='member'){const pageModule=await import('../../pages/member/settings/page.js');await pageModule.render(view,identity);}
}
async function main(){
  if(body.dataset.view==='login'){try{const pageModule=await import('../../pages/login/page.js');await pageModule.render();}catch(error){fail(error);}return;}
  const role=body.dataset.role,active=body.dataset.active,identity=await guard(role,active);
  if(!identity)return;
  await navigateRoute(routeFor(location.href),{push:false,identity});
  // Members get a pop-up with the result whenever one of their pigeons is clocked (also by their loft reader).
  if(role==='member'&&identity.profile?.member_id)import('./member-results-watch.js').then(module=>module.watchMemberReceipts(identity.profile.member_id)).catch(error=>console.warn('Result pop-ups unavailable:',error));
}
const routes=[
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
    "documentTitle": "Bird bonding \u00b7 AvilonX Clocking",
    "title": "Bird bonding",
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
let navigationToken=0;
async function navigateRoute(route,{push=true,identity=null}={}){
  if(!route||route.role!==body.dataset.role)return;
  const token=++navigationToken;
  const cleanup=currentPageCleanup;currentPageCleanup=()=>{};cleanup();
  if(push)history.pushState({appRoute:true},'',url(route.path));
  setMenu(false);
  body.dataset.title=route.title;body.dataset.view=route.view;body.dataset.active=route.active;
  document.title=route.documentTitle;
  const heading=document.querySelector('.topbar h1');if(heading)heading.textContent=route.title;
  document.querySelectorAll('.sidebar nav a,.member-bottom-nav a').forEach(link=>{
    const active=new URL(link.href).pathname===new URL(url(route.path)).pathname;
    link.classList.toggle('active',active);
    if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  });
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
window.addEventListener('popstate',()=>{
  const route=routeFor(location.href);
  if(route&&route.role===body.dataset.role)navigateRoute(route,{push:false});
});
window.addEventListener('app:refresh',()=>navigateRoute(routeFor(location.href),{push:false}));
document.addEventListener('keydown',event=>{if(event.key==='Escape')setMenu(false);});
main();
