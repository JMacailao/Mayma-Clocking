import test from 'node:test';
import assert from 'node:assert/strict';
import { unsureFields, rowNeedsCheck, nextRowToCheck } from '../../pages/admin/entries/sheet-check.js';

test('unsure boxes: digit reader, matching and text reader', () => {
  assert.deepEqual(unsureFields({ member_no: '161', member_no_digits: [{ confidence: .95 }, { confidence: .5 }], memberSure: true }), []);
  assert.deepEqual(unsureFields({ member_no: '161', member_no_digits: [{ confidence: .95 }, { confidence: .5 }] }), ['member_no']);
  assert.deepEqual(unsureFields({ pigeon_ring: 'PH 1', ringSure: false }), ['pigeon_ring']);
  assert.deepEqual(unsureFields({ remarks_text: 'P1', remarksConfidence: 40, barcode: '123', barcodeConfidence: 60 }), ['remarks_text', 'barcode']);
  assert.deepEqual(unsureFields({ barcode: '123', barcodeConfidence: 60, barcodeDetected: true }), []);
  assert.deepEqual(unsureFields({ member_no: '', memberSure: false }), [], 'an empty box is an error, not unsure');
  assert.deepEqual(unsureFields({ pigeon_ring: 'PH 1', ringSure: false, checked: { pigeon_ring: true } }), []);
  assert.deepEqual(unsureFields({ member_no: 'M-01' }), [], 'Excel and typed rows are never unsure');
  assert.deepEqual(unsureFields({ pigeon_ring: 'PH 1', ringSure: false, saved: true }), []);
});

test('next and previous row to check', () => {
  const rows = [{ id: 'a' }, { id: 'b', errors: ['x'] }, { id: 'c' }, { id: 'd', pigeon_ring: 'P', ringSure: false }];
  assert.equal(rowNeedsCheck(rows[0]), false);
  assert.equal(nextRowToCheck(rows, null, 1).id, 'b');
  assert.equal(nextRowToCheck(rows, 'b', 1).id, 'd');
  assert.equal(nextRowToCheck(rows, 'd', 1).id, 'b', 'wraps around');
  assert.equal(nextRowToCheck(rows, null, -1).id, 'd');
  assert.equal(nextRowToCheck(rows, 'b', -1).id, 'd');
  assert.equal(nextRowToCheck([{ id: 'a' }], null, 1), null);
});
