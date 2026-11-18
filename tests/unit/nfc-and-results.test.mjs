// Tag IDs from readers, and the race ranking used by Race day, Results and exports.
import '../support/register.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const { normalizeNfcUid, uidCandidates, formatNfcUid } = await import('../../assets/js/nfc.js');
const { raceRows, showUpKey, flightText } = await import('../../assets/js/race-export.js');
const { ringLabel } = await import('../../assets/js/shared.js');

test('tag IDs: hex in any form, wrong lengths refused', () => {
  assert.equal(normalizeNfcUid('84:35:19:db'), '843519DB');
  assert.equal(normalizeNfcUid('04 A2 3B 1C 5D 80 00'), '04A23B1C5D8000');
  assert.equal(normalizeNfcUid(''), '');
  assert.equal(normalizeNfcUid('12345'), null);
  assert.equal(formatNfcUid('843519DB'), '84:35:19:DB');
});

test('USB readers: decimal and reversed byte order are understood', () => {
  const candidates = uidCandidates('843519DB');
  assert.deepEqual(candidates, ['843519DB', 'DB193584']);
  // 0x843519DB = 2218072539
  assert.ok(uidCandidates('2218072539').includes('843519DB'));
});

test('ring label with remarks', () => {
  assert.equal(ringLabel('12345', ['P1', 'P2', 'P3']), '12345 P1/P2/P3');
  assert.equal(ringLabel('12345', []), '12345');
});

test('race ranking: fastest first, rejected and disqualified not ranked', () => {
  const race = { id: 1, status: 'closed', release_at_utc: '2026-11-18 00:00:00' };
  const entries = [1, 2, 3, 4].map(id => ({ id, race_id: 1, member_id: 1, pigeon_ring: `R${id}`, distance_m: 60000 }));
  const clocks = [
    { race_entry_id: 1, received_at_utc: '2026-11-18 01:00:00', verification: 'verified' },
    { race_entry_id: 2, received_at_utc: '2026-11-18 00:50:00', verification: 'verified' },
    { race_entry_id: 3, received_at_utc: '2026-11-18 00:40:00', verification: 'provisional' },
    { race_entry_id: 4, received_at_utc: '2026-11-18 00:30:00', verification: 'rejected' }
  ];
  const rows = raceRows(race, entries, clocks, [{ id: 1, full_name: 'A' }]);
  assert.deepEqual(rows.filter(row => row.rank).map(row => [row.entry.pigeon_ring, row.rank]), [['R2', 1], ['R1', 2]]);
  assert.equal(rows.find(row => row.entry.id === 3).show, 'disqualified', 'race closed without show-up');
  assert.equal(Math.round(rows.find(row => row.entry.id === 2).speed), 1200);
  assert.equal(showUpKey(null, race), 'none');
  assert.equal(flightText(3661), '01:01:01');
});
