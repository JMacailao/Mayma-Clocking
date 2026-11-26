// Band Assignments → Import Excel: bond many birds at once from a spreadsheet.
// Columns: Member ID, Ring number, Bird name, Colour, Sex, Hatch year, RFID tag.
// A row with an RFID tag is an RFID bond; without one it is a ring-number-only
// bond. Photos are added afterwards (Edit), so imported birds start with none.
import { supabase, escapeHTML, message, loadSpreadsheetParser } from '../../../assets/js/shared.js';
import { parseBirdRows, TEMPLATE } from './import-rows.js';

export function mountBirdImport({ button, templateButton, panel, members, birds, onDone }) {
  const file = Object.assign(document.createElement('input'), { type: 'file', accept: '.xlsx,.xls,.csv', hidden: true });
  panel.after(file);
  let pending = [];
  templateButton.onclick = async () => {
    const XLSX = await loadSpreadsheetParser(), book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(TEMPLATE), 'Birds');
    XLSX.writeFile(book, 'avilonx-birds-template.xlsx');
  };
  button.onclick = () => file.click();
  file.onchange = async () => {
    const chosen = file.files?.[0]; if (!chosen) return;
    panel.hidden = false; panel.innerHTML = '<p>Reading file…</p>';
    try {
      const XLSX = await loadSpreadsheetParser(), book = XLSX.read(await chosen.arrayBuffer(), { type: 'array' });
      const matrix = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, defval: '', raw: false, blankrows: false });
      const { rows, issues } = parseBirdRows(matrix, members, new Set(birds.map(b => String(b.ring_number).toUpperCase())));
      pending = rows;
      panel.innerHTML = `<div class="panel-heading"><h3>Import birds</h3><span class="count-pill">${rows.length} ready</span></div>
        ${issues.length ? `<div class="notice error"><strong>Fix these rows, then choose the file again:</strong><ul class="import-issue-list">${issues.slice(0, 20).map(x => `<li>Row ${x.rowNumber}: ${escapeHTML(x.errors.join('; '))}</li>`).join('')}</ul></div>` : ''}
        ${rows.length ? `<div class="table-scroll"><table><thead><tr><th>Row</th><th>Ring</th><th>Bird</th><th>Colour</th><th>Member</th><th>Bond</th></tr></thead><tbody>${rows.slice(0, 50).map(({ rowNumber, record: r }) => `<tr><td>${rowNumber}</td><td>${escapeHTML(r.ring_number)}</td><td>${escapeHTML(r.bird_name)}</td><td>${escapeHTML(r.color)}</td><td>${escapeHTML(members.find(m => m.id === r.member_id)?.full_name || '')}</td><td>${r.nfc_tag ? `RFID ${escapeHTML(r.nfc_tag)}` : 'Ring only'}</td></tr>`).join('')}</tbody></table></div>` : ''}
        <p class="small">Photos are added afterwards: open each bird and press Edit.</p>
        <div class="form-actions"><button class="button primary" type="button" data-import-go ${rows.length && !issues.length ? '' : 'disabled'}>Import ${rows.length} bird${rows.length === 1 ? '' : 's'}</button><button class="button secondary" type="button" data-import-cancel>Cancel</button></div>`;
      panel.querySelector('[data-import-cancel]').onclick = () => { pending = []; panel.hidden = true; };
      panel.querySelector('[data-import-go]').onclick = async event => {
        const go = event.currentTarget; go.disabled = true; go.textContent = 'Importing…';
        let saved = 0; const failed = [];
        for (let i = 0; i < pending.length; i += 50) {
          const chunk = pending.slice(i, i + 50);
          const { error } = await supabase.from('pigeons').insert(chunk.map(x => x.record));
          if (!error) { saved += chunk.length; continue; }
          // One bad row stops a chunk: save its rows one by one to find it.
          for (const one of chunk) {
            const { error: oneError } = await supabase.from('pigeons').insert(one.record);
            if (oneError) failed.push(`Row ${one.rowNumber}: ${oneError.message}`); else saved++;
          }
        }
        panel.hidden = !failed.length;
        if (failed.length) panel.innerHTML = `<div class="notice error"><strong>${saved} imported, ${failed.length} not:</strong><ul class="import-issue-list">${failed.slice(0, 20).map(f => `<li>${escapeHTML(f)}</li>`).join('')}</ul></div>`;
        message(`${saved} bird${saved === 1 ? '' : 's'} imported.${failed.length ? ` ${failed.length} could not be saved.` : ' Add their photos with Edit.'}`, failed.length ? 'error' : 'success');
        await onDone();
      };
    } catch (error) {
      panel.innerHTML = `<div class="notice error">${escapeHTML(error.message || 'This file could not be read.')}</div>`;
    } finally { file.value = ''; }
  };
}
