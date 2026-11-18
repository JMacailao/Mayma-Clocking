import { supabase, escapeHTML, formatDate, message, dbError } from '../../../assets/js/shared.js';
import { formatNfcUid } from '../../../assets/js/nfc.js';

export const READER_MODES=[['register','Register (fills NFC tag fields)'],['clock','Clocking (clocks pigeons)']];
export const formatSerial=serial=>String(serial||'').match(/.{1,2}/g)?.join(':')||'';
export const lastTagCell=device=>device.last_seen_at?`${escapeHTML(formatNfcUid(device.last_tag))}<br><span class="small">${escapeHTML(formatDate(device.last_seen_at))}</span>`:'<span class="small">Never used</span>';
export const missingReaderSql=error=>/rfid_device|function/i.test(error?.message||'');
export const readerSqlNotice='<div class="notice error">RFID readers are not set up yet. Run rfid-devices.sql in the Supabase SQL Editor, then reload this page.</div>';

// The club's RFID readers. The Super Admin registers them; the club chooses
// each reader's mode and, for a loft clock, the member who uses it.
export async function render(view) {
  const [{data:devices,error},{data:members}]=await Promise.all([supabase.rpc('admin_list_rfid_devices'),supabase.from('members').select('id,member_no,full_name').order('member_no')]);
  const heading='<div class="split-heading"><div><span class="eyebrow">EXTERNAL READERS</span><h2>RFID readers</h2><p>Choose what each of your club\'s RFID readers does when a tag is tapped.</p></div></div>';
  if(error){if(missingReaderSql(error)){view.innerHTML=heading+readerSqlNotice;return;}throw error;}
  const memberOptions=selected=>`<option value="">Whole club</option>${(members||[]).map(member=>`<option value="${member.id}" ${member.id===selected?'selected':''}>${escapeHTML(member.member_no)} · ${escapeHTML(member.full_name)}</option>`).join('')}`;
  const modeOptions=selected=>READER_MODES.map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('');

  view.innerHTML=`${heading}
  <section class="panel narrow"><h3>Add a reader</h3><p class="small">Readers are registered by the <strong>Super Admin</strong>. A reader that is not registered is refused.</p>
  <ol class="reader-steps"><li>Upload the AvilonX reader sketch to the ESP8266 (tools/rfid-reader/avilonx-rfid-reader/avilonx-rfid-reader.ino).</li><li>Join its Wi-Fi <strong>RFID-READER</strong> (password <strong>RFID12345</strong>), open <strong>http://192.168.4.1</strong> and note the <strong>Device serial</strong>.</li><li>Send the serial to the Super Admin. They register it for this club and give you a device key.</li><li>Enter the key and your internet Wi-Fi on the reader's page. The reader then appears below.</li></ol></section>
  <section class="panel"><div class="panel-heading"><h3>Club readers</h3><span class="count-pill">${devices.length} reader${devices.length===1?'':'s'}</span></div>
  <div class="table-scroll"><table><thead><tr><th>Reader</th><th>Serial</th><th>Used by</th><th>Mode</th><th>Last tag</th></tr></thead><tbody>${devices.length?devices.map(device=>`<tr data-reader="${device.id}"><td data-label="Reader"><strong>${escapeHTML(device.name)}</strong></td><td data-label="Serial"><code>${escapeHTML(formatSerial(device.serial))}</code></td><td data-label="Used by"><select data-reader-member aria-label="Who uses ${escapeHTML(device.name)}">${memberOptions(device.member_id)}</select></td><td data-label="Mode"><select data-reader-mode aria-label="Mode of ${escapeHTML(device.name)}">${modeOptions(device.mode)}</select></td><td data-label="Last tag">${lastTagCell(device)}</td></tr>`).join(''):'<tr><td class="empty-cell" colspan="5">No readers yet. Ask the Super Admin to register your reader\'s serial number.</td></tr>'}</tbody></table></div>
  <p class="small">Choose a member under Used by to make a reader their loft clock: it then clocks only their pigeons.</p></section>`;

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
  });
}
