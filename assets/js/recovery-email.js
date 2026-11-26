// "Recovery email" panel (password-reset.sql): where "Forgot password?" sends the
// reset link. Used on Club settings (club administrator) and member Settings.
import { supabase, escapeHTML, message } from './shared.js';

export async function mountRecoveryEmail(section,profileId){
  if(!section||!profileId)return;
  const {data,error}=await supabase.from('app_profiles').select('recovery_email').eq('id',profileId).maybeSingle();
  if(error){section.innerHTML='<h3>Recovery email</h3><p class="small">Not set up yet. Run avilonx-update.sql in the Supabase SQL Editor.</p>';return;}
  section.innerHTML=`<h3>Recovery email</h3><form class="recovery-form" novalidate><label class="field"><span>Gmail for "Forgot password?"</span><input name="email" type="email" inputmode="email" autocomplete="email" placeholder="name@gmail.com" value="${escapeHTML(data?.recovery_email||'')}"></label><button class="button secondary" type="submit">Save</button></form>`;
  const form=section.querySelector('form');
  form.onsubmit=async event=>{
    event.preventDefault();const button=form.querySelector('button');button.disabled=true;
    const {data:saved,error:saveError}=await supabase.rpc('set_my_recovery_email',{p_email:form.elements.email.value});
    button.disabled=false;
    if(saveError){message(saveError.code==='PGRST202'?'Not set up yet. Run avilonx-update.sql in the Supabase SQL Editor.':saveError.message,'error');return;}
    form.elements.email.value=saved||'';
    message(saved?'Recovery email saved.':'Recovery email removed.','success');
  };
}
