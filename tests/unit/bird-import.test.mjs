import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBirdRows, TEMPLATE, NO_PHOTO } from '../../pages/admin/birds/import-rows.js';

const members = [{ id: 7, member_no: 'M-01', loft_name: 'Blue Sky Loft' }, { id: 8, member_no: 'M-02', loft_name: 'Sea Breeze Loft' }];

test('bird import: template rows become RFID and ring-only bonds', () => {
  const { rows, issues } = parseBirdRows(TEMPLATE, members);
  assert.deepEqual(issues, []);
  assert.deepEqual(rows.map(r => [r.record.member_id, r.record.ring_number, r.record.bond_type, r.record.nfc_tag, r.record.sex, r.record.loft_name, r.record.photo_path]),
    [[7, 'PH-2026-000123', 'rfid', '843519DB', 'cock', 'Blue Sky Loft', NO_PHOTO], [8, 'PH-2026-000124', 'ring', null, 'hen', 'Sea Breeze Loft', NO_PHOTO]]);
});

test('bird import: every problem is reported with its row', () => {
  const matrix = [['member no', 'Ring', 'Name', 'Color', 'Gender', 'Year', 'RFID'],
    ['M-09', 'a1', 'X', 'Blue', '', '', ''], ['m-01', 'PH-1', 'Y', 'Blue', 'x', '1800', 'ZZ'], ['M-01', 'ph-1', 'Z', 'Red', '', '', ''], ['M-02', 'OLD', 'W', 'Red', '', '', ''], ['', '', '', '', '', '', '']];
  const { rows, issues } = parseBirdRows(matrix, members, new Set(['OLD']));
  assert.equal(rows.length, 0, 'every row has a problem');
  assert.deepEqual(issues.map(i => i.rowNumber), [2, 3, 4, 5], 'the empty row is skipped');
  assert.match(issues.find(i => i.rowNumber === 2).errors[0], /M-09.*not in this club/);
  const row3 = issues.find(i => i.rowNumber === 3)?.errors.join('; ') ?? '';
  assert.match(row3, /sex "x"/); assert.match(row3, /hatch year/); assert.match(row3, /RFID tag "ZZ"/);
  assert.match(issues.find(i => i.rowNumber === 4).errors[0], /listed twice/);
  assert.match(issues.find(i => i.rowNumber === 5).errors[0], /already bonded/);
  assert.match(parseBirdRows([['Ring']], members).issues[0].errors[0], /Missing columns: Member ID, Bird name, Colour/);
});
