import { supabase, escapeHTML, formatDate } from '../../../assets/js/shared.js';
import { formatNfcUid } from '../../../assets/js/nfc.js';

export const formatSerial=serial=>String(serial||'').match(/.{1,2}/g)?.join(':')||'';
export const lastTagCell=device=>device.last_seen_at?`${escapeHTML(formatNfcUid(device.last_tag))}<br><span class="small">${escapeHTML(formatDate(device.last_seen_at))}</span>`:'<span class="small">Never used</span>';
export const missingReaderSql=error=>/rfid_device|function/i.test(error?.message||'');
export const readerSqlNotice='<div class="notice error">RFID readers are not set up yet. Run rfid-devices.sql in the Supabase SQL Editor, then reload this page.</div>';

// The club's RFID readers. The Super Admin registers them and chooses who uses
// each one: the club admin's reader only registers pigeons, a member's reader
// (loft clock) only clocks that member's own pigeons.
export async function render(view) {
  const {data:devices,error}=await supabase.rpc('admin_list_rfid_devices');
  const heading='<div class="split-heading"><div><span class="eyebrow">EXTERNAL READERS</span><h2>RFID readers</h2><p>Your club\'s RFID readers and what each one does.</p></div></div>';
  if(error){if(missingReaderSql(error)){view.innerHTML=heading+readerSqlNotice;return;}throw error;}
  view.innerHTML=`${heading}
  <section class="panel narrow"><h3>How readers work</h3><ul class="reader-steps"><li><strong>Club admin reader</strong>: registers pigeons. Tap a pigeon's RFID tag and it fills the RFID tag field on Race entries. It never clocks.</li><li><strong>Member's reader</strong> (loft clock): clocks only that member's own pigeons. It never registers.</li><li>Readers are registered by the <strong>Super Admin</strong>, who also chooses who uses each one. Send them the reader's Device serial (shown at http://192.168.4.1 on the reader's Wi-Fi <strong>RFID-READER</strong>).</li></ul></section>
  <section class="panel"><div class="panel-heading"><h3>Club readers</h3><span class="count-pill">${devices.length} reader${devices.length===1?'':'s'}</span></div>
  <div class="table-scroll"><table><thead><tr><th>Reader</th><th>Serial</th><th>Used by</th><th>Does</th><th>Last tag</th></tr></thead><tbody>${devices.length?devices.map(device=>`<tr><td data-label="Reader"><strong>${escapeHTML(device.name)}</strong></td><td data-label="Serial"><code>${escapeHTML(formatSerial(device.serial))}</code></td><td data-label="Used by">${device.member_id?escapeHTML(device.member_name||'A member'):'Club admin'}</td><td data-label="Does">${device.member_id?'Clocking (own pigeons only)':'Registering pigeons'}</td><td data-label="Last tag">${lastTagCell(device)}</td></tr>`).join(''):'<tr><td class="empty-cell" colspan="5">No readers yet. Ask the Super Admin to register your reader\'s serial number.</td></tr>'}</tbody></table></div></section>`;
}
