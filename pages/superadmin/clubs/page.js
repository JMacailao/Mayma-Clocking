import { supabase, escapeHTML, message, authError, tableRows, USERNAME_RE, USERNAME_HELP } from '../../../assets/js/shared.js';

export async function render(view) {
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
