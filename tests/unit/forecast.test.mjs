import test from 'node:test';
import assert from 'node:assert/strict';
import { speedForecast, phClock, flightClock, FORECAST_SPEEDS } from '../../assets/js/forecast.js';

test('matches the club SMS forecast (Happy valle, 36477.43 m, released 06:10:00 PH)', () => {
  // 06:10:00 Philippine time = 22:10:00 UTC the day before.
  const rows = speedForecast('2026-11-18 22:10:00', 36477.43);
  const expected = { 1400: '06:36:03', 1300: '06:38:03', 1200: '06:40:23', 1100: '06:43:09', 1000: '06:46:28', 900: '06:50:31', 800: '06:55:35', 700: '07:02:06', 600: '07:10:47', 500: '07:22:57' };
  assert.deepEqual(rows.map(r => r.speed), FORECAST_SPEEDS);
  for (const r of rows) assert.equal(phClock(r.arrivalMs), expected[r.speed], `${r.speed} m/min`);
  assert.equal(flightClock(rows[0].flightSeconds), '00:26:03');
});

test('no forecast without a release time or a distance', () => {
  assert.deepEqual(speedForecast(null, 36477), []);
  assert.deepEqual(speedForecast('2026-11-18 22:10:00', 0), []);
  assert.deepEqual(speedForecast('2026-11-18 22:10:00', null), []);
});

test('times that carry a zone are kept as they are', () => {
  assert.equal(phClock(speedForecast('2026-11-18T22:10:00Z', 60000, [1000])[0].arrivalMs), '07:10:00');
});
