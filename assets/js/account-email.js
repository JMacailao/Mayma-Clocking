import { supabase, escapeHTML, message, authError, sendEmailConfirm } from './shared.js';

// "Email for password reset" box: add, change or remove the account's email,
// then confirm it from the link sent to it. Only a confirmed email gets reset
// links (Forgot password? on the sign-in page). One email per account.
//   memberId: the member record (member accounts), or null for the signed-in
//   club administrator / Super Admin account.
export async function mountAccountEmail(panel,{memberId=null,email,confirmed}={}){
  if(!panel)return;
  if(email===undefined){
    const {data,error}=await supabase.rpc('account_email_status');
    if(error){panel.hidden=true;console.warn('Password reset email is not set up:',error.message);return;}
    email=data?.email||null;confirmed=Boolean(data?.confirmed);
  }
  const draw=(email,confirmed)=>{
    const status=!email?'<p class="small">No email yet. Add one so you can reset your password yourself if you forget it.</p>':confirmed?`<p class="small"><span class="tag verified">✓ Confirmed</span> Reset links go to <strong>${escapeHTML(email)}</strong>.</p>`:`<p class="small"><span class="tag pending">Not confirmed</span> Open the link sent to <strong>${escapeHTML(email)}</strong> (check the spam folder too). <button class="text-button" type="button" data-email-resend>Send link again</button></p>`;
    panel.innerHTML=`<div class="panel-heading"><h3>Email for password reset</h3></div>${status}<form class="form-grid" data-email-form><label class="field"><span>Email</span><input name="email" type="email" maxlength="254" autocomplete="email" value="${escapeHTML(email||'')}" placeholder="name@example.com"></label><div class="form-actions"><button class="button primary" type="submit">Save email</button></div></form>`;
    const form=panel.querySelector('[data-email-form]');
    panel.querySelector('[data-email-resend]')?.addEventListener('click',async event=>{event.target.disabled=true;const note=await sendEmailConfirm(memberId);event.target.disabled=false;message(note.trim(),note.includes('not sent')?'error':'success');});
    form.onsubmit=async event=>{event.preventDefault();const value=form.elements.email.value.trim().toLowerCase();
      if(value===(email||'')){message(value?'This email is already saved.':'Enter an email.','info');return;}
      const button=form.querySelector('[type=submit]');button.disabled=true;button.textContent='Saving…';
      const {data,error}=await supabase.rpc('account_set_email',{p_email:value});
      button.disabled=false;button.textContent='Save email';
      if(error){message(authError(error),'error');return;}
      draw(data?.email||null,Boolean(data?.confirmed));
      if(!data?.email){message('Email removed.','success');return;}
      const note=await sendEmailConfirm(memberId);message(('Email saved.'+note).trim(),note.includes('not sent')?'error':'success');};
  };
  draw(email||null,Boolean(confirmed));
}
