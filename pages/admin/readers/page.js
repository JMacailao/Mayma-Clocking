import { supabase, escapeHTML, formatDate, message, dbError } from '../../../assets/js/shared.js';
import { formatNfcUid } from '../../../assets/js/nfc.js';

const MODES=[['register','Register (fills NFC tag fields)'],['clock','Clocking (clocks pigeons)']];
const formatSerial=serial=>String(serial||'').match(/.{1,2}/g)?.join(':')||'';
const missingSql=error=>/admin_list_rfid_devices|rfid_devices|function/i.test(error?.message||'');

// Club admins register external RFID readers (ESP8266 + RC522) by serial
// number. A reader that is not registered here cannot send tags to AvilonX.
export async function render(view,identity,{pendingKey=null}={}) {
  const isAdmin=identity?.profile?.role==='admin';
  const [{data:devices,error},{data:members}]=await Promise.all([supabase.rpc('admin_list_rfid_devices'),supabase.from('members').select('id,member_no,full_name').order('member_no')]);
  if(error){
    if(missingSql(error)){view.innerHTML='<div class="split-heading"><div><h2>RFID readers</h2></div></div><div class="notice error">RFID readers are not set up yet. Run rfid-devices.sql in the Supabase SQL Editor, then reload this page.</div>';return;}
    throw error;
  }
  const memberOptions=selected=>`<option value="">Whole club</option>${(members||[]).map(member=>`<option value="${member.id}" ${member.id===selected?'selected':''}>${escapeHTML(member.member_no)} · ${escapeHTML(member.full_name)}</option>`).join('')}`;
  const modeOptions=selected=>MODES.map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('');

  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">EXTERNAL READERS</span><h2>RFID readers</h2><p>Register each ESP8266 RFID reader by its serial number before it is used. Unregistered readers are refused.</p></div></div>
  ${isAdmin?`<section class="panel narrow"><h3>Register a reader</h3>
  <ol class="reader-steps"><li>Upload the AvilonX reader sketch to the ESP8266 (tools/rfid-reader/avilonx-rfid-reader/avilonx-rfid-reader.ino).</li><li>Join its Wi-Fi <strong>RFID-READER</strong> (password <strong>RFID12345</strong>) and open <strong>http://192.168.4.1</strong>. Copy the <strong>Device serial</strong> it shows.</li><li>Register the serial below. Enter the device key it gives you, and your Wi-Fi, on the reader's page.</li></ol>
  <form id="reader-form" class="form-grid"><label class="field"><span>Device serial</span><input name="serial" required maxlength="20" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="5C:CF:7F:12:34:56"></label><label class="field"><span>Reader name</span><input name="name" required maxlength="80" placeholder="Loft clock, Club gate…"></label><label class="field"><span>Used by</span><select name="member_id">${memberOptions(null)}</select><small class="small">Choose a member to make it their loft clock: it then clocks only their pigeons.</small></label><label class="field"><span>Mode</span><select name="mode">${modeOptions('register')}</select></label><div class="form-actions"><button class="button primary">Register reader</button></div></form>
  <div class="reader-key" data-reader-key hidden></div></section>`:'<div class="notice">Only the club administrator can register readers or make new keys. You can change a reader\'s mode below.</div>'}
  <section class="panel"><div class="panel-heading"><h3>Registered readers</h3><span class="count-pill">${devices.length} reader${devices.length===1?'':'s'}</span></div>
  <div class="table-scroll"><table><thead><tr><th>Reader</th><th>Serial</th><th>Used by</th><th>Mode</th><th>Last tag</th><th></th></tr></thead><tbody>${devices.length?devices.map(device=>`<tr data-reader="${device.id}"><td data-label="Reader"><strong>${escapeHTML(device.name)}</strong></td><td data-label="Serial"><code>${escapeHTML(formatSerial(device.serial))}</code></td><td data-label="Used by"><select data-reader-member aria-label="Who uses ${escapeHTML(device.name)}">${memberOptions(device.member_id)}</select></td><td data-label="Mode"><select data-reader-mode aria-label="Mode of ${escapeHTML(device.name)}">${modeOptions(device.mode)}</select></td><td data-label="Last tag">${device.last_seen_at?`${escapeHTML(formatNfcUid(device.last_tag))}<br><span class="small">${escapeHTML(formatDate(device.last_seen_at))}</span>`:'<span class="small">Never used</span>'}</td><td class="row-actions">${isAdmin?`<button class="text-button" type="button" data-reader-key-reset>New key</button><button class="text-button danger-text" type="button" data-reader-delete>Delete</button>`:''}</td></tr>`).join(''):'<tr><td class="empty-cell" colspan="6">No readers registered yet.</td></tr>'}</tbody></table></div></section>`;

  const keyBox=view.querySelector('[data-reader-key]');
  const showKey=(serial,key,note)=>{
    keyBox.hidden=false;
    keyBox.innerHTML=`<p><strong>${escapeHTML(note)}</strong></p><p>Device key for <code>${escapeHTML(formatSerial(serial))}</code>:</p><div class="reader-key-value"><code data-key-value>${escapeHTML(key)}</code><button class="button secondary" type="button" data-copy-key>Copy</button></div><p class="small">Enter this key on the reader's page (http://192.168.4.1), then press Save. It is shown only once; if it is lost, press New key.</p>`;
    keyBox.querySelector('[data-copy-key]').onclick=async event=>{try{await navigator.clipboard.writeText(key);event.currentTarget.textContent='Copied';}catch{message('Select the key and copy it by hand.','info');}};
    keyBox.scrollIntoView({behavior:'smooth',block:'center'});
  };

  const form=view.querySelector('#reader-form');
  if(form)form.onsubmit=async event=>{
    event.preventDefault();
    const button=form.querySelector('button.primary');button.disabled=true;
    const {data,error:registerError}=await supabase.rpc('admin_register_rfid_device',{p_serial:form.elements.serial.value,p_name:form.elements.name.value,p_member_id:form.elements.member_id.value?Number(form.elements.member_id.value):null,p_mode:form.elements.mode.value});
    button.disabled=false;
    if(registerError){message(registerError.message||dbError(registerError),'error');return;}
    message('Reader registered. Copy its device key now.','success');
    await render(view,identity,{pendingKey:{serial:data.serial,key:data.device_key,note:'Reader registered.'}});
  };

  view.querySelectorAll('[data-reader]').forEach(row=>{
    const id=Number(row.dataset.reader),device=devices.find(item=>item.id===id),modeSelect=row.querySelector('[data-reader-mode]'),memberSelect=row.querySelector('[data-reader-member]');
    const save=async()=>{
      modeSelect.disabled=memberSelect.disabled=true;
      const {error:updateError}=await supabase.rpc('admin_update_rfid_device',{p_id:id,p_name:device.name,p_member_id:memberSelect.value?Number(memberSelect.value):null,p_mode:modeSelect.value});
      modeSelect.disabled=memberSelect.disabled=false;
      if(updateError){modeSelect.value=device.mode;memberSelect.value=device.member_id??'';message(updateError.message||dbError(updateError),'error');return;}
      device.mode=modeSelect.value;device.member_id=memberSelect.value?Number(memberSelect.value):null;
      message(`${device.name} is now in ${device.mode==='clock'?'Clocking':'Register'} mode${device.member_id?' for one member':''}.`,'success');
    };
    modeSelect.onchange=save;memberSelect.onchange=save;
    const resetButton=row.querySelector('[data-reader-key-reset]');
    if(resetButton)resetButton.onclick=async()=>{
      if(!confirm(`Make a new key for ${device.name}? The old key stops working at once, so the reader must be updated.`))return;
      const {data,error:resetError}=await supabase.rpc('admin_reset_rfid_device_key',{p_id:id});
      if(resetError){message(resetError.message||dbError(resetError),'error');return;}
      if(keyBox)showKey(data.serial,data.device_key,`New key for ${device.name}.`);else alert(`New device key: ${data.device_key}`);
    };
    const deleteButton=row.querySelector('[data-reader-delete]');
    if(deleteButton)deleteButton.onclick=async()=>{
      if(!confirm(`Delete ${device.name}? It will no longer be able to send tags.`))return;
      const {error:deleteError}=await supabase.rpc('admin_delete_rfid_device',{p_id:id});
      if(deleteError){message(deleteError.message||dbError(deleteError),'error');return;}
      row.remove();message(`${device.name} deleted.`,'success');
    };
  });
  if(pendingKey&&keyBox)showKey(pendingKey.serial,pendingKey.key,pendingKey.note);
}
