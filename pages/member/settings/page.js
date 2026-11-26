import { supabase, escapeHTML, message, authError, sendEmailConfirm } from '../../../assets/js/shared.js';
import { mountTelegram } from './telegram.js';

export async function render(view,identity) {
  const memberId=identity.profile.member_id;if(!memberId)throw new Error('This account is missing its member record.');
  const {data:member,error}=await supabase.from('members').select('member_no,full_name,loft_name,phone,address,email,email_confirmed_at').eq('id',memberId).single();if(error)throw error;
  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">YOUR ACCOUNT</span><h2>Settings</h2><p>Review your member details and update your password.</p></div></div><section class="panel"><div class="panel-heading"><h3>Member profile</h3></div><dl class="member-settings-grid"><div><dt>Username</dt><dd>${escapeHTML(identity.profile.username||'—')}</dd></div><div><dt>Member ID</dt><dd>${escapeHTML(member.member_no||'—')}</dd></div><div><dt>Full name</dt><dd>${escapeHTML(member.full_name||'—')}</dd></div><div><dt>Loft</dt><dd>${escapeHTML(member.loft_name||'—')}</dd></div><div><dt>Phone</dt><dd>${escapeHTML(member.phone||'—')}</dd></div><div><dt>Address</dt><dd>${escapeHTML(member.address||'—')}</dd></div></dl><p class="member-settings-help">To change your username or member details, contact your club administrator.</p></section><section class="panel narrow" data-email-panel></section><section class="panel telegram-panel" data-telegram hidden></section><section class="panel narrow"><div class="panel-heading"><h3>Change password</h3></div><form class="form-grid" id="member-password-form"><label class="field"><span>New password · 8 or more characters</span><input name="new_password" type="password" minlength="8" autocomplete="new-password" required></label><label class="field"><span>Confirm new password</span><input name="confirm_password" type="password" minlength="8" autocomplete="new-password" required></label><div class="form-actions"><button class="button primary" type="submit">Update password</button></div></form></section>`;
  mountEmail(view.querySelector('[data-email-panel]'),memberId,member);
  mountTelegram(view.querySelector('[data-telegram]')).catch(error=>console.warn('Telegram settings unavailable:',error));
  const form=view.querySelector('#member-password-form');
  form.onsubmit=async event=>{event.preventDefault();const password=form.elements.new_password.value;if(password.length<8){message('Choose a password with at least 8 characters.','error');return;}if(password!==form.elements.confirm_password.value){message('The passwords do not match.','error');return;}const button=form.querySelector('[type="submit"]');button.disabled=true;button.textContent='Updating…';const {error}=await supabase.auth.updateUser({password});button.disabled=false;button.textContent='Update password';if(error){message(authError(error),'error');return;}form.reset();alert('Your password was updated.');};
}

// Email for password resets: add or change it, then confirm it from the link
// sent to it. Only a confirmed email gets reset links.
function mountEmail(panel,memberId,member){
  const draw=(email,confirmed)=>{
    const status=!email?'<p class="small">No email yet. Add one so you can reset your password yourself if you forget it.</p>':confirmed?`<p class="small"><span class="tag verified">✓ Confirmed</span> Reset links go to <strong>${escapeHTML(email)}</strong>.</p>`:`<p class="small"><span class="tag pending">Not confirmed</span> Open the link sent to <strong>${escapeHTML(email)}</strong> (check the spam folder too). <button class="text-button" type="button" data-email-resend>Send link again</button></p>`;
    panel.innerHTML=`<div class="panel-heading"><h3>Email for password reset</h3></div>${status}<form class="form-grid" data-email-form><label class="field"><span>Email</span><input name="email" type="email" maxlength="254" autocomplete="email" value="${escapeHTML(email||'')}" placeholder="name@example.com"></label><div class="form-actions"><button class="button primary" type="submit">Save email</button></div></form>`;
    const form=panel.querySelector('[data-email-form]');
    panel.querySelector('[data-email-resend]')?.addEventListener('click',async event=>{event.target.disabled=true;const note=await sendEmailConfirm(memberId);event.target.disabled=false;message(note.trim(),note.includes('not sent')?'error':'success');});
    form.onsubmit=async event=>{event.preventDefault();const value=form.elements.email.value.trim().toLowerCase();
      if(value===(email||'')){message(value?'This email is already saved.':'Enter an email.','info');return;}
      const button=form.querySelector('[type=submit]');button.disabled=true;button.textContent='Saving…';
      const {data,error}=await supabase.rpc('member_set_email',{p_email:value});
      button.disabled=false;button.textContent='Save email';
      if(error){message(authError(error),'error');return;}
      draw(data?.email||null,Boolean(data?.confirmed));
      if(!data?.email){message('Email removed.','success');return;}
      const note=await sendEmailConfirm(memberId);message(('Email saved.'+note).trim(),note.includes('not sent')?'error':'success');};
  };
  draw(member.email||null,Boolean(member.email_confirmed_at));
}
