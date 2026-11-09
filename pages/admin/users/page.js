import { supabase, escapeHTML, message, authError, titleCase, stateTag, USERNAME_RE, USERNAME_HELP } from '../../../assets/js/shared.js';

export async function render(view,identity) {
  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">CLUB ACCESS</span><h2>Team accounts</h2><p>Create another administrator or staff login for this club.</p></div><div class="team-account-heading-actions"><span class="count-pill" data-team-count>— accounts</span><button class="button primary" type="button" data-open-team-dialog>＋ Add account</button></div></div><section class="panel"><div class="panel-heading"><div><h3>Club team</h3><p class="muted small">Staff can manage members, races, entries, and clocking. Administrators can also manage team accounts.</p></div></div><div data-team-table></div></section><dialog class="account-dialog" data-team-dialog aria-labelledby="team-dialog-title"><form class="account-dialog-form" id="team-account-form"><div class="account-dialog-heading"><div><span class="eyebrow">CLUB LOGIN</span><h2 id="team-dialog-title" data-team-dialog-title>Create team account</h2></div><button class="text-button" type="button" data-close-team-dialog aria-label="Close dialog">✕</button></div><p class="account-dialog-copy" data-team-dialog-copy>Create a username and password for the new team member.</p><label class="field"><span>Username</span><input name="username" type="text" minlength="3" maxlength="32" pattern="[A-Za-z0-9][A-Za-z0-9_.-]{2,31}" autocomplete="off" autocapitalize="none" spellcheck="false" required></label><label class="field"><span data-team-password-label>Password · 8 or more characters</span><input name="password" type="password" minlength="8" autocomplete="new-password" required></label><label class="field" data-team-role-field><span>Role</span><select name="role"><option value="staff">Staff · routine club work</option><option value="admin">Administrator · manage team accounts</option></select></label><div class="form-actions"><button class="button secondary" type="button" data-close-team-dialog>Cancel</button><button class="button primary" type="submit" data-team-submit>Create account</button></div></form></dialog>`;
  const form=view.querySelector('#team-account-form'),table=view.querySelector('[data-team-table]'),dialog=view.querySelector('[data-team-dialog]'),usernameInput=form.elements.username,passwordInput=form.elements.password,roleField=view.querySelector('[data-team-role-field]');
  let editingUser=null,teamUsers=[];
  const openCreateDialog=()=>{editingUser=null;form.reset();view.querySelector('[data-team-dialog-title]').textContent='Create team account';view.querySelector('[data-team-dialog-copy]').textContent='Create a username and password for the new team member.';view.querySelector('[data-team-password-label]').textContent='Password · 8 or more characters';passwordInput.required=true;passwordInput.placeholder='';roleField.hidden=false;form.querySelector('[data-team-submit]').textContent='Create account';dialog.showModal();usernameInput.focus();};
  view.querySelector('[data-open-team-dialog]').onclick=openCreateDialog;
  view.querySelectorAll('[data-close-team-dialog]').forEach(button=>button.onclick=()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  async function load(){
    const {data,error}=await supabase.from('app_profiles').select('id,username,role,is_active').eq('club_id',identity.profile.club_id).in('role',['admin','staff']).order('username');
    if(error)throw error;
    teamUsers=data||[];
    view.querySelector('[data-team-count]').textContent=`${teamUsers.length} account${teamUsers.length===1?'':'s'}`;
    table.innerHTML=`<div class="table-scroll"><table><thead><tr><th>Username</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>${teamUsers.length?teamUsers.map(user=>`<tr><td data-label="Username">${escapeHTML(user.username)}</td><td data-label="Role">${escapeHTML(titleCase(user.role))}</td><td data-label="Status">${stateTag(user.is_active?'active':'inactive')}</td><td class="row-actions" data-label="Actions"><button class="text-button" data-edit-team="${escapeHTML(user.id)}">Edit username/password</button><button class="text-button ${user.is_active?'danger-text':''}" data-team-active="${escapeHTML(user.id)}" data-next-active="${user.is_active?'false':'true'}" ${user.id===identity.profile.id&&user.is_active?'disabled title="You cannot disable your own account"':''}>${user.is_active?'Disable':'Reactivate'}</button></td></tr>`).join(''):'<tr><td colspan="4" class="empty-cell">No team accounts found.</td></tr>'}</tbody></table></div>`;
    table.querySelectorAll('[data-edit-team]').forEach(button=>button.onclick=()=>{
      editingUser=teamUsers.find(user=>user.id===button.dataset.editTeam);if(!editingUser)return;
      form.reset();usernameInput.value=editingUser.username;passwordInput.required=false;passwordInput.placeholder='Leave blank to keep the current password';
      view.querySelector('[data-team-dialog-title]').textContent='Update team account';view.querySelector('[data-team-dialog-copy]').textContent='Change the username, set a new password, or update both.';view.querySelector('[data-team-password-label]').textContent='New password · optional';roleField.hidden=true;form.querySelector('[data-team-submit]').textContent='Save changes';dialog.showModal();usernameInput.focus();
    });
    table.querySelectorAll('[data-team-active]').forEach(button=>button.onclick=async()=>{
      const active=button.dataset.nextActive==='true';
      if(!confirm(`${active?'Reactivate':'Disable'} this team account?`))return;
      const {error}=await supabase.rpc('admin_set_team_active',{p_user_id:button.dataset.teamActive,p_active:active});
      if(error){message(authError(error),'error');return;}
      await load();
      message(`Team account ${active?'reactivated':'disabled'}.`,'success');
    });
  }
  form.onsubmit=async event=>{
    event.preventDefault();
    const username=form.elements.username.value.trim().toLowerCase();
    const password=form.elements.password.value;
    const role=form.elements.role.value;
    if(!USERNAME_RE.test(username)){alert(USERNAME_HELP);return;}
    if((!editingUser||password)&&password.length<8){alert('Password must be at least 8 characters.');return;}
    if(editingUser&&!password&&username===editingUser.username){alert('Enter a new username or a new password.');return;}
    const creating=!editingUser,confirmation=creating?`Create a ${titleCase(role)} account for ${username}?`:`Save the login changes for ${username}?`;
    if(!confirm(confirmation))return;
    const button=form.querySelector('[type="submit"]');button.disabled=true;button.textContent=creating?'Creating…':'Saving…';
    const {error}=creating
      ?await supabase.rpc('admin_create_team_account',{p_username:username,p_password:password,p_role:role})
      :await supabase.rpc('admin_update_user_credentials',{p_user_id:editingUser.id,p_username:username===editingUser.username?null:username,p_password:password||null});
    button.disabled=false;button.textContent=creating?'Create account':'Save changes';
    if(error){alert(authError(error));return;}
    dialog.close();form.reset();const summary=creating?`${titleCase(role)} account created for ${username}.`:`Login credentials updated for ${username}.`;editingUser=null;await load();alert(summary);
  };
  await load();
}
