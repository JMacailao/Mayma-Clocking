// Distances are stored in metres and shown in km everywhere (to the metre).
import '../support/register.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const { distanceKm } = await import('../../assets/js/shared.js');

test('distances show in km with 3 decimals', () => {
  assert.equal(distanceKm(177864.714), '177.865 km');
  assert.equal(distanceKm(84355.165), '84.355 km');
  assert.equal(distanceKm(1234567.89), '1,234.568 km');
  assert.equal(distanceKm(900), '0.900 km');
  assert.equal(distanceKm('90000'), '90.000 km', 'numbers from the database come as text');
  assert.equal(distanceKm(null), '—');
  assert.equal(distanceKm(undefined), '—');
  assert.equal(distanceKm(''), '—');
});
