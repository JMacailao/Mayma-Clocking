import test from 'node:test';
import assert from 'node:assert/strict';
import { digitsScore, lettersDistance, pickBest, matchFormRows } from '../../pages/admin/entries/form-match.js';

// A box read as `digit` with chance `p` (the rest shared by the others), or with an explicit second guess.
const box = (digit, p = .97, other = null, q = 0) => { const chances = new Array(10).fill((1 - p - q) / (other === null ? 9 : 8)); chances[digit] = p; if (other !== null) chances[other] = q; return { digit, confidence: p, chances }; };
const boxes = (text, p) => [...text].map(d => box(Number(d), p));
const members = [{ id: 1, member_no: '11001' }, { id: 2, member_no: '11007' }, { id: 3, member_no: '0161' }, { id: 4, member_no: '252' }];
const birds = [
  { id: 10, member_id: 1, ring_number: '11235461', status: 'active' },
  { id: 11, member_id: 1, ring_number: '11235467', status: 'active' },
  { id: 12, member_id: 3, ring_number: 'MCHPFC 0088', status: 'active' },
  { id: 13, member_id: 3, ring_number: 'JAPAN 0088', status: 'active' },
  { id: 14, member_id: 4, ring_number: 'PHI-2024-516372', status: 'active' },
  { id: 15, member_id: 4, ring_number: '999999', status: 'retired' }
];
const formRow = (member, ring, extra = {}) => ({ member_no: member.map(b => b.digit).join(''), member_no_digits: member, ring_number: ring.map(b => b.digit).join(''), ring_number_digits: ring, pigeon_ring: ring.map(b => b.digit).join(''), prefixBoxes: [], ...extra });

test('a clear reading fits its own digits best', () => {
  assert.ok(digitsScore(boxes('11001'), '11001') > digitsScore(boxes('11001'), '11007'));
  assert.ok(digitsScore(boxes('161'), '0161', d => d === '0' ? Math.log(.6) : null) > digitsScore(boxes('161'), '0161'), 'leading zeros cost little when allowed');
});

test('one unclear digit is settled by the registered members', () => {
  // The last box could be a 1 or a 4; only 11001 is registered:
  const unclear = [...boxes('1100'), box(1, .55, 4, .4)];
  const [row] = matchFormRows([formRow(unclear, boxes('11235461'))], members, birds);
  assert.equal(row.member_no, '11001');
  assert.equal(row.memberSure, true);
  // A digit misread outright is corrected when only one member fits.
  const [fixed] = matchFormRows([formRow([box(5, .6, 2, .35), box(5, .9), box(2, .95)], boxes('516372'))], members, birds);
  assert.equal(fixed.member_no, '252');
  assert.equal(fixed.memberMatched, true);
});

test('two members that fit about as well are left for the admin', () => {
  const [row] = matchFormRows([formRow([...boxes('1100'), box(1, .5, 7, .48)], boxes('11235461'))], members, birds);
  assert.equal(row.memberSure, false);
  assert.equal(row.member_no, '11001', 'what was read stays');
});

test('a member that is not registered is not forced', () => {
  const [row] = matchFormRows([formRow(boxes('98765'), boxes('11235461'))], members, birds);
  assert.equal(row.member_no, '98765');
  assert.equal(row.memberSure, false);
});

test('member IDs with leading zeros and rings with letters or a year', () => {
  const [a] = matchFormRows([formRow(boxes('161'), boxes('0088'), { prefixBoxes: [{}], ring_prefix: 'MCHPFG' })], members, birds);
  assert.equal(a.member_no, '0161');
  assert.equal(a.pigeon_ring, 'MCHPFC 0088', 'the letters decide between two rings with the same number');
  const [b] = matchFormRows([formRow(boxes('252'), boxes('516372'))], members, birds);
  assert.equal(b.pigeon_ring, 'PHI-2024-516372', 'the year may be left off');
});

test('the ring is one of the member\'s active bonded birds', () => {
  const [row] = matchFormRows([formRow(boxes('11001'), [...boxes('1123546'), box(1, .55, 7, .4)])], members, birds);
  assert.equal(row.pigeon_ring, '11235461');
  const [none] = matchFormRows([formRow(boxes('252'), boxes('999999'))], members, birds);
  assert.equal(none.ringSure, false, 'retired birds are not offered');
  const [noBonding] = matchFormRows([formRow(boxes('11001'), boxes('11235461'))], members, null);
  assert.equal(noBonding.ringSure, undefined, 'clubs without bonding keep the reading');
});

test('helpers', () => {
  assert.equal(lettersDistance('MCHPFG', 'MCHPFC'), 1);
  assert.equal(pickBest([], 3), null);
  assert.equal(pickBest([{ item: 1, score: -1 }], 0), null);
});
