import { supabase, authError, USERNAME_RE, USERNAME_HELP, pageUrl as url } from '../../assets/js/shared.js';
import { mountPublicResults } from '../results/public.js';
import { claimDevice } from '../../assets/js/device-session.js';

const signOutUser = async()=>{const {error}=await supabase.auth.signOut({scope:'local'});if(error)throw error;};
// The page to return to after signing in, when it is a page of this site for the
// account's role (only member pages for members, only team pages for others).
const nextFor=role=>{
 const next=new URLSearchParams(location.search).get('next');
 if(!next||!next.startsWith('/')||next.startsWith('//'))return null;
 const target=new URL(next,location.origin);if(target.origin!==location.origin)return null;
 const area=role==='member'?'/pages/member/':role==='superadmin'?'/pages/superadmin/':'/pages/admin/';
 return target.pathname.includes(area)?target.pathname+target.search:null;
};
const homeFor = role=>url(role==='superadmin'?'pages/superadmin/clubs/index.html':['admin','staff'].includes(role)?'pages/admin/dashboard/index.html':'pages/member/dashboard/index.html');

export async function render() {
 const container=document.querySelector('#login-content');
 const resultsPanel=document.querySelector('[data-login-results]');if(resultsPanel&&!resultsPanel.dataset.mounted){resultsPanel.dataset.mounted='true';mountPublicResults(resultsPanel);}
 const {data:hasAdmin,error:checkError}=await supabase.rpc('has_admin_account');
 if(checkError){container.innerHTML='<span class="eyebrow">DATABASE SETUP NEEDED</span><h1>Finish database setup</h1><p>In your Supabase SQL Editor run <code>schema.sql</code> (fresh database only), then <code>supabase-auth.sql</code>, <code>multi-club.sql</code>, <code>account-credentials.sql</code>, and <code>public-results.sql</code>, then reload this page.</p>';return;}
 // The emailed "Forgot password" link: set a new password.
 const resetToken=new URLSearchParams(location.search).get('reset');
 if(resetToken){renderResetPassword(container,resetToken);return;}
 const {data:{session}}=await supabase.auth.getSession();
 if(session){try{const {data:p}=await supabase.from('app_profiles').select('role').eq('id',session.user.id).maybeSingle();if(p){location.href=nextFor(p.role)||homeFor(p.role);return;}}catch(e){console.error(e);}}
 if(!hasAdmin){renderSuperAdmin(container);return;}
 renderSignIn(container);
}
function renderSignIn(container){
 let audience='team';
 container.innerHTML=`<h1 id="login-title">Welcome back</h1><p data-login-intro>Sign in with your club-team username and password.</p><div class="login-tabs" role="tablist" aria-label="Choose sign-in type"><button class="login-tab active" id="audience-team" role="tab" type="button" data-audience="team" aria-controls="signin-pane" aria-selected="true">Club team</button><button class="login-tab" id="audience-member" role="tab" type="button" data-audience="member" aria-controls="signin-pane" aria-selected="false">Member</button></div><div id="signin-pane" role="tabpanel" aria-labelledby="audience-team" data-signin-pane><div data-login-message class="notice" hidden></div><form id="login-form" class="form-grid"><label class="field"><span>Username</span><input name="username" type="text" minlength="3" maxlength="32" pattern="[A-Za-z0-9][A-Za-z0-9_.\\-]{2,31}" autocomplete="username" autocapitalize="none" spellcheck="false" required></label><label class="field"><span>Password</span><span class="password-field"><input name="password" type="password" autocomplete="current-password" required><button type="button" class="password-eye" data-show-password aria-label="Show password" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></span></label><button class="button primary" type="submit">Sign in <span>→</span></button></form><p class="login-help" data-login-help>For club administrator access, contact your club administrator to create your account or reset your password.</p></div>`;
 const helpCopy=container.querySelector('[data-login-help]');
 const introCopy=container.querySelector('[data-login-intro]');
 const title=container.querySelector('#login-title'),tabs=[...container.querySelectorAll('[data-audience]')];
 const showAudience=next=>{
  audience=next;const isResults=false;
  tabs.forEach(option=>{const selected=option.dataset.audience===audience;option.classList.toggle('active',selected);option.setAttribute('aria-selected',String(selected));});
  
  title.textContent=isResults?'Public race results':audience==='member'?'Member sign in':'Welcome back';
  introCopy.textContent=isResults?'Choose a club and race date to view the results.':audience==='member'?'Sign in with the username and password your club administrator gave you.':'Sign in with your club-team username and password.';
  helpCopy.textContent=audience==='member'?'No member login yet? Ask your club administrator.':'No account yet? Ask your club administrator.';
  container.querySelector('[data-login-message]').hidden=true;
 };
 tabs.forEach(tab=>tab.onclick=()=>{
  showAudience(tab.dataset.audience);
 });
 if((new URLSearchParams(location.search).get('next')||'').includes('/pages/member/'))showAudience('member');
 if(new URLSearchParams(location.search).get('signedout')==='device')loginMessage(container,'You were signed out because this account was signed in on another device. The club allows one device per account.','info');
 const form=container.querySelector('#login-form');
 form.insertAdjacentHTML('beforeend','<button class="text-button forgot-link" type="button" data-forgot>Forgot password?</button>');
 form.querySelector('[data-forgot]').onclick=()=>renderForgot(container,form.elements.username.value.trim().toLowerCase());
 const eye=container.querySelector('[data-show-password]');eye.onclick=()=>{const field=form.elements.password,show=field.type==='password';field.type=show?'text':'password';eye.setAttribute('aria-pressed',String(show));eye.setAttribute('aria-label',show?'Hide password':'Show password');field.focus();};
 form.onsubmit=async event=>{event.preventDefault();const username=form.elements.username.value.trim().toLowerCase();if(!USERNAME_RE.test(username)){loginMessage(container,USERNAME_HELP,'error');return;}const button=form.querySelector('button');tabs.forEach(tab=>tab.disabled=true);button.disabled=true;button.textContent='Signing in…';
  const {data,error}=await supabase.auth.signInWithPassword({email:`${username}@users.mayma.invalid`,password:form.elements.password.value});
  if(error){tabs.forEach(tab=>tab.disabled=false);button.disabled=false;button.textContent='Sign in →';loginMessage(container,'Sign-in failed. Check your username and password.','error');return;}
  const {data:profile,error:profileError}=await supabase.from('app_profiles').select('role,username,is_active').eq('id',data.user.id).maybeSingle();
  if(profileError||!profile||profile.username!==username){await signOutUser();tabs.forEach(tab=>tab.disabled=false);button.disabled=false;button.textContent='Sign in →';loginMessage(container,'This account is not set up for the clocking app. Ask your administrator.','error');return;}
  if(profile.is_active===false){await signOutUser();tabs.forEach(tab=>tab.disabled=false);button.disabled=false;button.textContent='Sign in →';loginMessage(container,'This account is disabled. Ask your club administrator to reactivate it.','error');return;}
  const isMember=profile.role==='member';
  if((audience==='member')!==isMember){await signOutUser();tabs.forEach(tab=>tab.disabled=false);button.disabled=false;button.textContent='Sign in →';loginMessage(container,isMember?'This is a member account. Choose Member above.':'This is a club-team account. Choose Club team above.','error');return;}
  // One device per account (when the club uses it): ask before signing the other device out.
  if(profile.role!=='superadmin'&&!(await claimDevice())){await signOutUser();tabs.forEach(tab=>tab.disabled=false);button.disabled=false;button.textContent='Sign in →';loginMessage(container,'Not signed in: the account stays signed in on the other device.','info');return;}
  location.href=nextFor(profile.role)||homeFor(profile.role);};
}
function renderSuperAdmin(container){
 container.innerHTML=`<span class="eyebrow" data-portal-eyebrow>FIRST-TIME SETUP</span><h1 data-portal-heading>Create superadmin account</h1><p data-portal-intro>This database is new. Choose a username and password for the superadmin. The superadmin creates the club accounts.</p><div id="setup-pane" data-setup-pane><div data-login-message class="notice" hidden></div><form id="superadmin-form" class="form-grid"><label class="field"><span>Superadmin username</span><input name="username" type="text" minlength="3" maxlength="32" pattern="[A-Za-z0-9][A-Za-z0-9_.\\-]{2,31}" autocomplete="username" autocapitalize="none" spellcheck="false" required></label><label class="field"><span>Password</span><input name="password" type="password" minlength="8" autocomplete="new-password" required></label><label class="field"><span>Confirm password</span><input name="confirm" type="password" minlength="8" autocomplete="new-password" required></label><button class="button primary" type="submit">Create superadmin <span>→</span></button></form><p class="login-help">Use at least 8 characters. This screen only appears once, while the database has no administrator.</p></div>`;
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

// "Forgot password?": the avilonx-password-reset Edge Function emails a link to
// the account's recovery email (Gmail). Same answer whether or not it exists.
async function callReset(body){
 const {data,error}=await supabase.functions.invoke('avilonx-password-reset',{body});
 if(!error)return data;
 try{const answer=await error.context?.json?.();if(answer?.message)return answer;}catch{/* not JSON */}
 return {ok:false,message:'Password reset is not available right now. Ask your club administrator.'};
}
function renderForgot(container,username=''){
 container.innerHTML=`<h1>Forgot password</h1><p>Enter your username. We email a reset link to your recovery email.</p><form id="forgot-form" class="form-grid" novalidate><label class="field"><span>Username</span><input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required></label><button class="button primary" type="submit">Send reset link</button><button class="text-button" type="button" data-back>Back to sign in</button></form><div class="notice" data-login-message role="status" hidden></div>`;
 const form=container.querySelector('#forgot-form');form.elements.username.value=username;form.elements.username.focus();
 container.querySelector('[data-back]').onclick=()=>renderSignIn(container);
 form.onsubmit=async event=>{
  event.preventDefault();const name=form.elements.username.value.trim().toLowerCase();
  if(!USERNAME_RE.test(name)){loginMessage(container,USERNAME_HELP,'error');return;}
  const button=form.querySelector('[type=submit]');button.disabled=true;button.textContent='Sending…';
  const answer=await callReset({action:'request',username:name});
  button.disabled=false;button.textContent='Send reset link';
  loginMessage(container,answer?.message||'Try again.',answer?.ok?'success':'error');
 };
}
function renderResetPassword(container,token){
 container.innerHTML=`<h1>Set a new password</h1><form id="reset-form" class="form-grid" novalidate><label class="field"><span>New password · 8 or more characters</span><input name="password" type="password" autocomplete="new-password" minlength="8" required></label><label class="field"><span>Confirm new password</span><input name="confirm" type="password" autocomplete="new-password" minlength="8" required></label><button class="button primary" type="submit">Save new password</button></form><div class="notice" data-login-message role="status" hidden></div>`;
 const form=container.querySelector('#reset-form');form.elements.password.focus();
 form.onsubmit=async event=>{
  event.preventDefault();const password=form.elements.password.value;
  if(password.length<8){loginMessage(container,'Use at least 8 characters.','error');return;}
  if(password!==form.elements.confirm.value){loginMessage(container,'The two passwords are not the same.','error');return;}
  const button=form.querySelector('[type=submit]');button.disabled=true;button.textContent='Saving…';
  const answer=await callReset({action:'reset',token,password});
  if(answer?.ok){container.innerHTML=`<h1>Password changed</h1><p>Sign in with your username${answer.username?` <strong>${answer.username.replace(/[^a-z0-9_.-]/g,'')}</strong>`:''} and the new password.</p><button class="button primary" type="button" data-signin>Sign in</button>`;container.querySelector('[data-signin]').onclick=()=>{try{history.replaceState(null,'',url('pages/login/index.html'));}catch{/* history unavailable */}renderSignIn(container);};return;}
  button.disabled=false;button.textContent='Save new password';
  loginMessage(container,answer?.message||'Try again.','error');
 };
}
