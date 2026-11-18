// Reading a scanned loading form: remarks, member IDs, rings and sticker numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sheetRemarks, sheetMember, sheetBird, stickerFromText, compactCode } from '../../pages/admin/entries/sheet-parse.js';

test('remarks: handwritten P1/P2/P3 with common misreads', () => {
  assert.deepEqual(sheetRemarks('P2'), ['P2']);
  assert.deepEqual(sheetRemarks('Pl/Pz'), ['P1', 'P2']);
  assert.deepEqual(sheetRemarks('P1 / P2 / P3'), ['P1', 'P2', 'P3']);
  assert.deepEqual(sheetRemarks('P1/P2/P3/0CP'), ['P1', 'P2', 'P3', 'OCP']);
  assert.deepEqual(sheetRemarks('p1|p2'), ['P1', 'P2']);
  assert.deepEqual(sheetRemarks('P1,P2,P1'), ['P1', 'P2']);
  assert.deepEqual(sheetRemarks(''), []);
});

test('member: by member number, also without leading zeros or prefixes', () => {
  const members = [{ id: 1, member_no: '161' }, { id: 2, member_no: 'M-252' }, { id: 3, member_no: '044' }];
  assert.equal(sheetMember(members, '161')?.id, 1);
  assert.equal(sheetMember(members, '252')?.id, 2);
  assert.equal(sheetMember(members, 'M252')?.id, 2);
  assert.equal(sheetMember(members, '44')?.id, 3);
  assert.equal(sheetMember(members, '999'), null);
  assert.equal(sheetMember(members, ''), null);
});

test('ring: the member\'s bonded bird, exact or by its number alone, never a guess', () => {
  const birds = [
    { id: 10, member_id: 1, status: 'active', ring_number: 'MCHPFC-0088' },
    { id: 11, member_id: 3, status: 'active', ring_number: 'WING MASTER 45386' },
    { id: 12, member_id: 3, status: 'active', ring_number: 'WING MASTER 45388' },
    { id: 13, member_id: 3, status: 'retired', ring_number: 'OLD 1' }
  ];
  assert.equal(sheetBird(birds, 1, 'MCHPFC0088')?.id, 10);
  assert.equal(sheetBird(birds, 1, '0088')?.id, 10);
  assert.equal(sheetBird(birds, 3, '45386')?.id, 11);
  assert.equal(sheetBird(birds, 3, 'WINGMASTER45388')?.id, 12);
  assert.equal(sheetBird(birds, 3, '4538'), null, 'ambiguous: two birds end in 4538x');
  assert.equal(sheetBird(birds, 1, '45386'), null, 'another member\'s bird');
  assert.equal(sheetBird(birds, 3, 'OLD 1'), null, 'retired birds are not entered');
});

test('sticker reference number from the printed text', () => {
  assert.equal(stickerFromText('05674104-X N05723993'), 'N05723993');
  assert.equal(stickerFromText('05674104-X'), '05674104-X');
  assert.equal(stickerFromText('nothing here'), '');
  assert.equal(compactCode(' ph-2026 / 01 '), 'PH202601');
});
