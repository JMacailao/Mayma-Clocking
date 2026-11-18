import test from 'node:test';
import assert from 'node:assert/strict';
import { tagExpired, clockWays, distanceMeters } from '../../pages/admin/entries/entry-helpers.js';

test('tag expiry', () => {
  assert.equal(tagExpired({ nfc_expires_at: null }), false);
  assert.equal(tagExpired({ nfc_expires_at: new Date(Date.now() - 1000).toISOString() }), true);
  assert.equal(tagExpired({ nfc_expires_at: new Date(Date.now() + 60000).toISOString() }), false);
});

test('ways a pigeon can be clocked', () => {
  const readers = new Map([[7, { name: 'Loft' }]]);
  assert.deepEqual(clockWays({ member_id: 7, nfc_tag: '843519DB', barcode: '1' }, readers).includes('Loft reader'), true);
  assert.equal(clockWays({ member_id: 8, nfc_tag: null, barcode: '1' }, readers).includes('Loft reader'), false);
});

test('distance between two points (metres)', () => {
  const d = distanceMeters(13.41, 121.18, 13.94, 121.16);
  assert.ok(d > 58000 && d < 60000, `got ${d}`);
  assert.equal(Math.round(distanceMeters(13, 121, 13, 121)), 0);
});
