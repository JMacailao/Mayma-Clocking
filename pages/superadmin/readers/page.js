import { supabase, escapeHTML, message, dbError } from '../../../assets/js/shared.js';
import { READER_MODES, formatSerial, lastTagCell, missingReaderSql, readerSqlNotice } from '../../admin/readers/page.js';

// Super Admin: register external RFID readers (ESP8266 + RC522) by serial
// number and assign each to a club. Unregistered readers are refused.
export async function render(view,_cleanup,{pendingKey=null}={}) {
  const [{data:devices,error},{data:clubs,error:clubError}]=await Promise.all([supabase.rpc('superadmin_list_rfid_devices'),supabase.rpc('superadmin_list_clubs')]);
  const heading='<div class="split-heading"><div><span class="eyebrow">EXTERNAL READERS</span><h2>Register RFID reader</h2><p>Register each ESP8266 RFID reader by its serial number and assign it to a club before it is used. Unregistered readers are refused.</p></div></div>';
  if(error){if(missingReaderSql(error)){view.innerHTML=heading+readerSqlNotice;return;}throw error;}
  if(clubError)throw clubError;
  const clubOptions=(selected,placeholder)=>`${placeholder?`<option value="">${placeholder}</option>`:''}${(clubs||[]).map(club=>`<option value="${club.id}" ${club.id===selected?'selected':''}>${escapeHTML(club.name)}</option>`).join('')}`;
  const modeOptions=selected=>READER_MODES.map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('');

  view.innerHTML=`${heading}
  <section class="panel narrow"><h3>Register a reader</h3>
  <ol class="reader-steps"><li>Upload the AvilonX reader sketch to the ESP8266 (tools/rfid-reader/avilonx-rfid-reader/avilonx-rfid-reader.ino).</li><li>Join its Wi-Fi <strong>RFID-READER</strong> (password <strong>RFID12345</strong>) and open <strong>http://192.168.4.1</strong>. Copy the <strong>Device serial</strong> it shows.</li><li>Register the serial below for the club that will use it. Enter the device key it gives you, and the internet Wi-Fi, on the reader's page.</li></ol>
  <form id="reader-form" class="form-grid"><label class="field"><span>Device serial</span><input name="serial" required maxlength="20" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="5C:CF:7F:12:34:56"></label><label class="field"><span>Reader name</span><input name="name" required maxlength="80" placeholder="Loft clock, Club gate…"></label><label class="field"><span>Club</span><select name="club_id" required>${clubOptions(null,'Choose a club')}</select></label><label class="field"><span>Starting mode</span><select name="mode">${modeOptions('register')}</select><small class="small">The club can change the mode later on its RFID readers page.</small></label><div class="form-actions"><button class="button primary">Register reader</button></div></form>
  <div class="reader-key" data-reader-key hidden></div></section>
  <section class="panel"><div class="panel-heading"><h3>Registered readers</h3><span class="count-pill">${devices.length} reader${devices.length===1?'':'s'}</span></div>
  <div class="table-scroll"><table><thead><tr><th>Reader</th><th>Serial</th><th>Club</th><th>Mode</th><th>Last tag</th><th></th></tr></thead><tbody>${devices.length?devices.map(device=>`<tr data-reader="${device.id}"><td data-label="Reader"><strong>${escapeHTML(device.name)}</strong>${device.member_name?`<br><span class="small">Loft clock of ${escapeHTML(device.member_name)}</span>`:''}</td><td data-label="Serial"><code>${escapeHTML(formatSerial(device.serial))}</code></td><td data-label="Club"><select data-reader-club aria-label="Club using ${escapeHTML(device.name)}">${clubOptions(device.club_id)}</select></td><td data-label="Mode">${device.mode==='clock'?'Clocking':'Register'}</td><td data-label="Last tag">${lastTagCell(device)}</td><td class="row-actions"><button class="text-button" type="button" data-reader-key-reset>New key</button><button class="text-button danger-text" type="button" data-reader-delete>Delete</button></td></tr>`).join(''):'<tr><td class="empty-cell" colspan="6">No readers registered yet.</td></tr>'}</tbody></table></div></section>`;

  const keyBox=view.querySelector('[data-reader-key]');
  const showKey=(serial,key,note)=>{
    keyBox.hidden=false;
    keyBox.innerHTML=`<p><strong>${escapeHTML(note)}</strong></p><p>Device key for <code>${escapeHTML(formatSerial(serial))}</code>:</p><div class="reader-key-value"><code data-key-value>${escapeHTML(key)}</code><button class="button secondary" type="button" data-copy-key>Copy</button></div><p class="small">Enter this key on the reader's page (http://192.168.4.1), then press Save key. It is shown only once; if it is lost, press New key.</p>`;
    keyBox.querySelector('[data-copy-key]').onclick=async event=>{const button=event.currentTarget;try{await navigator.clipboard.writeText(key);button.textContent='Copied';}catch{message('Select the key and copy it by hand.','info');}};
    keyBox.scrollIntoView({behavior:'smooth',block:'center'});
  };

  const form=view.querySelector('#reader-form');
  form.onsubmit=async event=>{
    event.preventDefault();
    const button=form.querySelector('button.primary');button.disabled=true;
    const {data,error:registerError}=await supabase.rpc('superadmin_register_rfid_device',{p_serial:form.elements.serial.value,p_name:form.elements.name.value,p_club_id:Number(form.elements.club_id.value),p_mode:form.elements.mode.value});
    button.disabled=false;
    if(registerError){message(registerError.message||dbError(registerError),'error');return;}
    message('Reader registered. Copy its device key now.','success');
    await render(view,_cleanup,{pendingKey:{serial:data.serial,key:data.device_key,note:'Reader registered.'}});
  };

  view.querySelectorAll('[data-reader]').forEach(row=>{
    const id=Number(row.dataset.reader),device=devices.find(item=>item.id===id),clubSelect=row.querySelector('[data-reader-club]');
    clubSelect.onchange=async()=>{
      const club=clubs.find(item=>item.id===Number(clubSelect.value));
      if(!confirm(`Move ${device.name} to ${club?.name}? Its loft-clock member link is cleared.`)){clubSelect.value=device.club_id;return;}
      clubSelect.disabled=true;
      const {error:moveError}=await supabase.rpc('superadmin_update_rfid_device',{p_id:id,p_name:device.name,p_club_id:Number(clubSelect.value)});
      clubSelect.disabled=false;
      if(moveError){clubSelect.value=device.club_id;message(moveError.message||dbError(moveError),'error');return;}
      device.club_id=Number(clubSelect.value);message(`${device.name} now belongs to ${club?.name}.`,'success');
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
