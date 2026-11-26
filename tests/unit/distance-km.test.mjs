// Distances are stored in metres and shown in km everywhere (rounded to 2 decimals).
import '../support/register.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const { distanceKm } = await import('../../assets/js/shared.js');

test('distances show in km with 2 decimals', () => {
  assert.equal(distanceKm(177864.714), '177.86 km');
  assert.equal(distanceKm(84355.165), '84.36 km');
  assert.equal(distanceKm(1234567.89), '1,234.57 km');
  assert.equal(distanceKm(900), '0.90 km');
  assert.equal(distanceKm('90000'), '90.00 km', 'numbers from the database come as text');
  assert.equal(distanceKm(null), '—');
  assert.equal(distanceKm(undefined), '—');
  assert.equal(distanceKm(''), '—');
});
