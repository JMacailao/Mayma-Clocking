import { supabase, escapeHTML, message, dbError } from '../../../assets/js/shared.js';
import { formatSerial, lastTagCell, missingReaderSql, readerSqlNotice } from '../../admin/readers/page.js';

// Super Admin: register external RFID readers (ESP8266 + RC522) by serial
// number and assign each to a club. Unregistered readers are refused.
export async function render(view,_cleanup,{pendingKey=null}={}) {
  const [{data:devices,error},{data:clubs,error:clubError}]=await Promise.all([supabase.rpc('superadmin_list_rfid_devices'),supabase.rpc('superadmin_list_clubs')]);
  const heading='<div class="split-heading"><div><span class="eyebrow">EXTERNAL READERS</span><h2>Register RFID reader</h2><p>Register each ESP8266 RFID reader by its serial number and assign it to a club before it is used. Unregistered readers are refused.</p></div></div>';
  if(error){if(missingReaderSql(error)){view.innerHTML=heading+readerSqlNotice;return;}throw error;}
  if(clubError)throw clubError;
  const clubOptions=(selected,placeholder)=>`${placeholder?`<option value="">${placeholder}</option>`:''}${(clubs||[]).map(club=>`<option value="${club.id}" ${club.id===selected?'selected':''}>${escapeHTML(club.name)}</option>`).join('')}`;

  view.innerHTML=`${heading}
  <section class="panel narrow"><h3>Register a reader</h3>
  <ol class="reader-steps"><li>Upload the AvilonX reader sketch to the ESP8266 (tools/rfid-reader/avilonx-rfid-reader/avilonx-rfid-reader.ino).</li><li>Join its Wi-Fi <strong>RFID-READER</strong> (password <strong>RFID12345</strong>) and open <strong>http://192.168.4.1</strong>. Copy the <strong>Device serial</strong> it shows.</li><li>Register the serial below for the club that will use it. Enter the device key it gives you, and the internet Wi-Fi, on the reader's page.</li></ol>
  <form id="reader-form" class="form-grid"><label class="field"><span>Device serial</span><input name="serial" required maxlength="20" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="5C:CF:7F:12:34:56"></label><label class="field"><span>Reader name</span><input name="name" required maxlength="80" placeholder="Loft clock, Club gate…"></label><label class="field"><span>Club</span><select name="club_id" required>${clubOptions(null,'Choose a club')}</select></label><label class="field"><span>Used by</span><select name="member_id" disabled><option value="">Club admin (registering pigeons)</option></select><small class="small">Choose the club first. <strong>Club admin</strong>: the reader only registers pigeons (taps fill the RFID field on Race entries). <strong>A member</strong>: it is their loft clock and only clocks their own pigeons.</small></label><div class="form-actions"><button class="button primary">Register reader</button></div></form>
  <div class="reader-key" data-reader-key hidden></div></section>
  <section class="panel"><div class="panel-heading"><h3>Registered readers</h3><span class="count-pill">${devices.length} reader${devices.length===1?'':'s'}</span></div>
  <div class="table-scroll"><table><thead><tr><th>Reader</th><th>Serial</th><th>Club</th><th>Used by</th><th>Mode</th><th>Last tag</th><th></th></tr></thead><tbody>${devices.length?devices.map(device=>`<tr data-reader="${device.id}"><td data-label="Reader"><strong>${escapeHTML(device.name)}</strong></td><td data-label="Serial"><code>${escapeHTML(formatSerial(device.serial))}</code></td><td data-label="Club"><select data-reader-club aria-label="Club using ${escapeHTML(device.name)}">${clubOptions(device.club_id)}</select></td><td data-label="Used by"><select data-reader-member aria-label="Who uses ${escapeHTML(device.name)}"><option value="">${device.member_id?escapeHTML(device.member_name||'Loading…'):'Club admin (registering)'}</option></select></td><td data-label="Mode" data-reader-mode-text>${device.member_id?'Clocking':'Register'}</td><td data-label="Last tag">${lastTagCell(device)}</td><td class="row-actions"><button class="text-button" type="button" data-reader-key-reset>New key</button><button class="text-button danger-text" type="button" data-reader-delete>Delete</button></td></tr>`).join(''):'<tr><td class="empty-cell" colspan="7">No readers registered yet.</td></tr>'}</tbody></table></div></section>`;

  const keyBox=view.querySelector('[data-reader-key]');
  const showKey=(serial,key,note)=>{
    keyBox.hidden=false;
    keyBox.innerHTML=`<p><strong>${escapeHTML(note)}</strong></p><p>Device key for <code>${escapeHTML(formatSerial(serial))}</code>:</p><div class="reader-key-value"><code data-key-value>${escapeHTML(key)}</code><button class="button secondary" type="button" data-copy-key>Copy</button></div><p class="small">Enter this key on the reader's page (http://192.168.4.1), then press Save key. It is shown only once; if it is lost, press New key.</p>`;
    keyBox.querySelector('[data-copy-key]').onclick=async event=>{const button=event.currentTarget;try{await navigator.clipboard.writeText(key);button.textContent='Copied';}catch{message('Select the key and copy it by hand.','info');}};
    keyBox.scrollIntoView({behavior:'smooth',block:'center'});
  };

  // Members are loaded per club when needed (the Super Admin cannot read members directly).
  const memberCache=new Map();
  const loadMembers=clubId=>{
    if(!clubId)return Promise.resolve([]);
    if(!memberCache.has(clubId))memberCache.set(clubId,supabase.rpc('superadmin_list_club_members',{p_club_id:clubId}).then(({data,error:membersError})=>{if(membersError){memberCache.delete(clubId);throw membersError;}return data||[];}));
    return memberCache.get(clubId);
  };
  const fillMembers=async(select,clubId,selected)=>{
    select.disabled=true;
    try{
      const list=await loadMembers(clubId);
      select.innerHTML=`<option value="">Club admin (registering pigeons)</option>${list.map(member=>`<option value="${member.id}" ${member.id===selected?'selected':''}>${escapeHTML(member.member_no)} · ${escapeHTML(member.full_name)} (clocking)</option>`).join('')}`;
      select.disabled=!clubId;
    }catch(membersError){select.innerHTML='<option value="">Could not load members</option>';message(membersError.message||dbError(membersError),'error');}
  };

  const form=view.querySelector('#reader-form');
  form.elements.club_id.onchange=()=>fillMembers(form.elements.member_id,Number(form.elements.club_id.value)||null,null);
  form.onsubmit=async event=>{
    event.preventDefault();
    const button=form.querySelector('button.primary');button.disabled=true;
    const {data,error:registerError}=await supabase.rpc('superadmin_register_rfid_device',{p_serial:form.elements.serial.value,p_name:form.elements.name.value,p_club_id:Number(form.elements.club_id.value),p_mode:form.elements.member_id.value?'clock':'register',p_member_id:form.elements.member_id.value?Number(form.elements.member_id.value):null});
    button.disabled=false;
    if(registerError){message(registerError.message||dbError(registerError),'error');return;}
    message('Reader registered. Copy its device key now.','success');
    await render(view,_cleanup,{pendingKey:{serial:data.serial,key:data.device_key,note:'Reader registered.'}});
  };

  view.querySelectorAll('[data-reader]').forEach(row=>{
    const id=Number(row.dataset.reader),device=devices.find(item=>item.id===id),clubSelect=row.querySelector('[data-reader-club]'),memberSelect=row.querySelector('[data-reader-member]');
    fillMembers(memberSelect,device.club_id,device.member_id);
    memberSelect.onchange=async()=>{
      const memberId=memberSelect.value?Number(memberSelect.value):null;memberSelect.disabled=true;
      const {error:memberError}=await supabase.rpc('superadmin_set_rfid_device_member',{p_id:id,p_member_id:memberId});
      memberSelect.disabled=false;
      if(memberError){memberSelect.value=device.member_id??'';message(memberError.message||dbError(memberError),'error');return;}
      device.member_id=memberId;
      row.querySelector('[data-reader-mode-text]').textContent=memberId?'Clocking':'Register';
      message(memberId?`${device.name} is now a loft clock (clocking only) for ${memberSelect.selectedOptions[0].textContent.replace(' (clocking)','')}.`:`${device.name} is now the club admin's reader (registering only).`,'success');
    };
    clubSelect.onchange=async()=>{
      const club=clubs.find(item=>item.id===Number(clubSelect.value));
      if(!confirm(`Move ${device.name} to ${club?.name}? It becomes that club admin's reader (registering only).`)){clubSelect.value=device.club_id;return;}
      clubSelect.disabled=true;
      const {error:moveError}=await supabase.rpc('superadmin_update_rfid_device',{p_id:id,p_name:device.name,p_club_id:Number(clubSelect.value)});
      clubSelect.disabled=false;
      if(moveError){clubSelect.value=device.club_id;message(moveError.message||dbError(moveError),'error');return;}
      device.club_id=Number(clubSelect.value);device.member_id=null;row.querySelector('[data-reader-mode-text]').textContent='Register';fillMembers(memberSelect,device.club_id,null);message(`${device.name} now belongs to ${club?.name}.`,'success');
    };
    row.querySelector('[data-reader-key-reset]').onclick=async()=>{
      if(!confirm(`Make a new key for ${device.name}? The old key stops working at once, so the reader must be updated.`))return;
      const {data,error:resetError}=await supabase.rpc('superadmin_reset_rfid_device_key',{p_id:id});
      if(resetError){message(resetError.message||dbError(resetError),'error');return;}
      showKey(data.serial,data.device_key,`New key for ${device.name}.`);
    };
    row.querySelector('[data-reader-delete]').onclick=async()=>{
      if(!confirm(`Delete ${device.name}? It will no longer be able to send tags.`))return;
      const {error:deleteError}=await supabase.rpc('superadmin_delete_rfid_device',{p_id:id});
      if(deleteError){message(deleteError.message||dbError(deleteError),'error');return;}
      row.remove();message(`${device.name} deleted.`,'success');
    };
  });
  if(pendingKey)showKey(pendingKey.serial,pendingKey.key,pendingKey.note);
}
