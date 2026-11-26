import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewIssues, reviewHtml } from '../../pages/admin/results/review.js';

const row = (ring, velocity, verification = 'verified', member_id = 1) => ({ pigeon_ring: ring, member_id, member: { full_name: `M${member_id}` }, clock: verification ? { verification } : null, seconds: velocity == null ? null : velocity > 0 ? 3600 : -5, velocity: velocity > 0 ? velocity : null });
const race = { name: 'Derby', status: 'open', release_at_utc: '2026-11-26 00:00:00', requires_show_up: true };

test('review: too fast, before release, not shown up, offline reader, not clocked', () => {
  const rows = [row('A', 1000), row('B', 1050), row('C', 1100), row('D', 1900), row('E', -1), row('F', 990, 'provisional'), row('G', null, null, 2), row('H', 900, 'rejected')];
  const readers = [{ name: 'Loft 2', member_id: 2, member_name: 'M2', is_online: false, pending_taps: 4 }, { name: 'Loft 1', member_id: 1, is_online: false }];
  const issues = reviewIssues(race, rows, readers);
  const by = t => issues.find(i => i.title.includes(t));
  assert.equal(by('before the release').level, 'error');
  assert.deepEqual(by('too fast').items, ['D · M1: 1,900 m/min'], 'over 1.5 × the median');
  assert.equal(by('not shown up yet').items[0], 'F · M1');
  assert.match(by('offline').items[0], /Loft 2 · M2 · 4 taps waiting/);
  assert.equal(by('offline').items.length, 1, 'only readers of members with birds still flying');
  assert.equal(by('not clocked').level, 'info');
  assert.equal(by('rejected').items[0], 'H · M1');
  assert.match(reviewHtml(race, issues, s => s), /4 things to check/);
});

test('review: a clean closed race is ready', () => {
  const issues = reviewIssues({ ...race, status: 'closed' }, [row('A', 1000), row('B', 1020)], []);
  assert.deepEqual(issues, []);
  assert.match(reviewHtml({ ...race, status: 'closed' }, issues, s => s), /Ready\./);
  assert.equal(reviewIssues({ ...race, release_at_utc: null }, [], [])[0].title, 'No release time');
});
