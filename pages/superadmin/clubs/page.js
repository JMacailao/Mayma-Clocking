import { mountPush } from '../../../assets/js/push.js';
import { supabase, escapeHTML, message, authError, tableRows, formatDate, USERNAME_RE, USERNAME_HELP } from '../../../assets/js/shared.js';

export async function render(view) {
  view.innerHTML=`<div class="split-heading"><div><h2>Club accounts</h2></div><span class="count-pill" data-count>— clubs</span></div><section class="panel"><div class="panel-heading"><h3>Create a club account</h3></div><form class="form-grid" id="club-form"><label class="field"><span>Club name</span><input name="club" type="text" minlength="2" maxlength="180" required></label><label class="field"><span>Login username</span><input name="username" type="text" minlength="3" maxlength="32" pattern="[A-Za-z0-9][A-Za-z0-9_.\\-]{2,31}" autocomplete="off" autocapitalize="none" spellcheck="false" required></label><label class="field"><span>Password (8+ characters)</span><input name="password" type="password" minlength="8" autocomplete="new-password" required></label><div class="form-actions"><button class="button primary" type="submit">Create club account</button></div></form></section><section class="panel"><div class="panel-heading"><h3>Clubs</h3></div><div data-table></div></section>`;
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
  mountRequests(view);
  const pushPanel=document.createElement('section');pushPanel.className='panel narrow';pushPanel.hidden=true;view.append(pushPanel);
  mountPush(pushPanel,{what:'Get a notification on this phone or computer when a club asks for AvilonX on the website.'}).catch(error=>console.warn('Notification settings unavailable:',error));
}

// Requests sent from the landing page's "Get AvilonX for your club" form (landing.sql).
async function mountRequests(view){
  const panel=document.createElement('section');panel.className='panel';panel.dataset.clubRequests='';view.append(panel);
  const load=async()=>{
    const {data,error}=await supabase.rpc('superadmin_club_requests');
    if(error){panel.hidden=error.code==='PGRST202';panel.innerHTML=`<h3>Requests from the website</h3><div class="notice error">${escapeHTML(error.message)}</div>`;return;}
    const rows=data||[],open=rows.filter(r=>!r.handled_at).length;
    panel.innerHTML=`<div class="panel-heading"><h3>Requests from the website</h3><span class="count-pill">${open} new</span></div>${tableRows(rows,[
      {key:'created_at',label:'Sent',render:r=>escapeHTML(formatDate(r.created_at))},
      {key:'club_name',label:'Club',render:r=>`<strong>${escapeHTML(r.club_name)}</strong><br><span class="small">${escapeHTML(r.contact_name)}</span>`},
      {key:'phone',label:'Contact',render:r=>[r.phone&&`<a href="tel:${escapeHTML(r.phone.replace(/[^\d+]/g,''))}">${escapeHTML(r.phone)}</a>`,r.email&&`<a href="mailto:${escapeHTML(r.email)}">${escapeHTML(r.email)}</a>`].filter(Boolean).join('<br>')||'—'},
      {key:'message',label:'Message',render:r=>escapeHTML(r.message||'—')},
      {key:'handled_at',label:'',render:r=>`<button class="text-button" type="button" data-handle-request="${r.id}" data-handled="${r.handled_at?'false':'true'}">${r.handled_at?'Mark as new':'Done'}</button>`}
    ],'No requests yet. Clubs send them from the AvilonX home page.',false)}`;
    panel.querySelectorAll('[data-handle-request]').forEach(button=>button.onclick=async()=>{
      const {error:handleError}=await supabase.rpc('superadmin_handle_club_request',{p_id:Number(button.dataset.handleRequest),p_handled:button.dataset.handled==='true'});
      if(handleError){message(handleError.message,'error');return;}
      load();
    });
  };
  await load();
}
