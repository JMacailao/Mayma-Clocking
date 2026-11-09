import { supabase, escapeHTML, fail } from './shared.js';
const signOutUser = async() => {const {error}=await supabase.auth.signOut({scope:'local'});if(error)throw error;};

const body = document.body;
const BASE = body.dataset.base || '../../';
const url = (path) => `${BASE}${path}`;
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

async function renderPage(view,role,identity){
  const page=body.dataset.view;
  if(page==='clubs'&&role==='superadmin'){const pageModule=await import('../../pages/superadmin/clubs/page.js');await pageModule.render(view);}
  else if(page==='sticker-register'&&role==='superadmin'){const pageModule=await import('../../pages/superadmin/stickers/register/page.js');await pageModule.render(view,fn=>{currentPageCleanup=fn;});}
  else if(page==='sticker-generate'&&role==='superadmin'){const pageModule=await import('../../pages/superadmin/stickers/generate/page.js');await pageModule.render(view);}
  else if(page==='team-users'&&role==='admin'&&identity.profile.role==='admin'){const pageModule=await import('../../pages/admin/users/page.js');await pageModule.render(view,identity);}
  else if(page==='dashboard'&&role==='admin'){const pageModule=await import('../../pages/admin/dashboard/page.js');await pageModule.render(view);}
  else if(page==='members'){const pageModule=await import('../../pages/admin/members/page.js');await pageModule.render(view,identity.profile.role==='admin');}
  else if(page==='race-points'){const pageModule=await import('../../pages/admin/race-points/page.js');await pageModule.render(view,identity.profile.role==='admin');}
  else if(page==='races'){const pageModule=await import('../../pages/admin/races/page.js');await pageModule.render(view);}
  else if(page==='entries'){const pageModule=await import('../../pages/admin/entries/page.js');await pageModule.entriesPage(view);}
  else if(page==='clocking'&&role==='admin'){const pageModule=await import('../../pages/admin/clocking/page.js');await pageModule.render(view,identity);}
  else if(page==='results'&&role==='admin'){const pageModule=await import('../../pages/admin/results/page.js');await pageModule.render(view);}
  else if(page==='dashboard'&&role==='member'){const pageModule=await import('../../pages/member/dashboard/page.js');await pageModule.render(view,identity);}
  else if(page==='member-clocking'&&role==='member'){const pageModule=await import('../../pages/member/clocking/page.js');await pageModule.render(view,identity,fn=>{currentPageCleanup=fn;});}
  else if(page==='history'&&role==='member'){const pageModule=await import('../../pages/member/history/page.js');await pageModule.render(view,identity);}
  else if(page==='member-results'&&role==='member'){const pageModule=await import('../../pages/member/results/page.js');await pageModule.render(view);}
  else if(page==='member-settings'&&role==='member'){const pageModule=await import('../../pages/member/settings/page.js');await pageModule.render(view,identity);}
}
async function main(){
  if(body.dataset.view==='login'){try{const pageModule=await import('../../pages/login/page.js');await pageModule.render();}catch(error){fail(error);}return;}
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
