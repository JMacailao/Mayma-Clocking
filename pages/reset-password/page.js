import { supabase, authError, escapeHTML, pageUrl as url } from '../../assets/js/shared.js';

// Links from the password-reset emails: ?reset=<code> chooses a new password,
// ?confirm=<code> confirms a member's email. The code is taken out of the
// address bar at once (it is not shown, saved in history or sent onwards).
const loginLink=(extra='')=>`${url('pages/login/index.html')}?audience=member${extra}`;

export async function render(){
 const box=document.querySelector('#reset-content');
 const params=new URLSearchParams(location.search),reset=params.get('reset'),confirm=params.get('confirm');
 if(reset||confirm)history.replaceState(null,'',location.pathname);
 const show=(title,text,kind='')=>{box.innerHTML=`<span class="eyebrow">MEMBER ACCOUNT</span><h1>${escapeHTML(title)}</h1><p class="${kind?`notice ${kind}`:''}">${escapeHTML(text)}</p><a class="button primary reset-login" href="${loginLink()}">Go to sign in <span>→</span></a>`;};

 if(confirm){
  const {data,error}=await supabase.rpc('confirm_member_email',{p_token:confirm});
  if(error){show('Link not valid',`${authError(error)} Add the email again in Settings to get a new link.`,'error');return;}
  show('Email confirmed ✓',`${data?.email||'Your email'} can now be used if you forget your password: tap “Forgot password?” on the sign-in page.`,'success');
  return;
 }
 if(!reset){show('Link not complete','Open the link from your email again, or ask for a new one with “Forgot password?” on the sign-in page.','error');return;}

 box.innerHTML=`<span class="eyebrow">MEMBER ACCOUNT</span><h1>Choose a new password</h1><p>Use 8 or more characters. After saving, sign in with your username and the new password.</p><div class="notice" data-reset-message hidden></div><form class="form-grid" id="reset-form"><label class="field"><span>New password</span><input name="password" type="password" minlength="8" maxlength="72" autocomplete="new-password" required></label><label class="field"><span>Type it again</span><input name="again" type="password" minlength="8" maxlength="72" autocomplete="new-password" required></label><button class="button primary" type="submit">Save new password</button></form>`;
 const form=box.querySelector('#reset-form'),note=box.querySelector('[data-reset-message]');
 const say=(text,kind)=>{note.textContent=text;note.className=`notice ${kind}`;note.hidden=false;};
 form.onsubmit=async event=>{
  event.preventDefault();
  const password=form.elements.password.value;
  if(password.length<8){say('Choose a password with at least 8 characters.','error');return;}
  if(password!==form.elements.again.value){say('The two passwords do not match.','error');form.elements.again.focus();return;}
  const button=form.querySelector('button');button.disabled=true;button.textContent='Saving…';
  const {data,error}=await supabase.rpc('password_reset_complete',{p_token:reset,p_password:password});
  if(error){button.disabled=false;button.textContent='Save new password';say(authError(error),'error');return;}
  // Any account signed in on this browser is signed out too (the reset signed the account out everywhere).
  try{await supabase.auth.signOut({scope:'local'});}catch{/* already signed out */}
  box.innerHTML=`<span class="eyebrow">MEMBER ACCOUNT</span><h1>Password changed ✓</h1><p class="notice success">Sign in as <strong>${escapeHTML(data?.username||'your username')}</strong> with your new password. Your account was signed out on all other phones and computers.</p><a class="button primary reset-login" href="${loginLink('&reset=done')}">Sign in <span>→</span></a>`;
 };
}
