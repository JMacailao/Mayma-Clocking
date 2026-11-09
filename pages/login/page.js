import { supabase, authError, USERNAME_RE, USERNAME_HELP, pageUrl as url } from '../../assets/js/shared.js';
import { mountPublicResults } from '../results/public.js';

const signOutUser = async()=>{const {error}=await supabase.auth.signOut({scope:'local'});if(error)throw error;};
const homeFor = role=>url(role==='superadmin'?'pages/superadmin/clubs/index.html':['admin','staff'].includes(role)?'pages/admin/dashboard/index.html':'pages/member/dashboard/index.html');

export async function render() {
 const container=document.querySelector('#login-content');
 const {data:hasAdmin,error:checkError}=await supabase.rpc('has_admin_account');
 if(checkError){container.innerHTML='<span class="eyebrow">DATABASE SETUP NEEDED</span><h1>Finish database setup</h1><p>In your Supabase SQL Editor run <code>schema.sql</code> (fresh database only), then <code>supabase-auth.sql</code>, <code>multi-club.sql</code>, <code>account-credentials.sql</code>, and <code>public-results.sql</code>, then reload this page.</p>';return;}
 const {data:{session}}=await supabase.auth.getSession();
 if(session){try{const {data:p}=await supabase.from('app_profiles').select('role').eq('id',session.user.id).maybeSingle();if(p){location.href=homeFor(p.role);return;}}catch(e){console.error(e);}}
 if(!hasAdmin){renderSuperAdmin(container);return;}
 renderSignIn(container);
}
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
