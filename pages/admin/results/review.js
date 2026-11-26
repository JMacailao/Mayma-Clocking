// Results review checklist: what to look at before a race's results are final.
// rows: the results page's rows for ONE race ({clock, seconds, velocity, show, member, pigeon_ring, remarks}).
// readers: admin_list_rfid_devices() rows. Each issue: {level: 'error'|'warn'|'info', title, items[]}.
export const TOO_FAST = 2000; // m/min: faster than any racing pigeon over a race distance

const median = values => { const s = [...values].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function reviewIssues(race, rows, readers = []) {
  const issues = [];
  const name = r => `${r.pigeon_ring || '—'} · ${r.member?.full_name || r.member?.member_no || 'member'}`;
  if (!race.release_at_utc) issues.push({ level: 'error', title: 'No release time', items: ['Set the release time on Race schedules: no speed can be worked out without it.'] });
  const clocked = rows.filter(r => r.clock && r.clock.verification !== 'rejected');

  const early = clocked.filter(r => race.release_at_utc && !(r.seconds > 0));
  if (early.length) issues.push({ level: 'error', title: `${early.length} clocked before the release time`, items: early.map(name) });

  const speeds = clocked.map(r => r.velocity).filter(v => v > 0);
  const limit = speeds.length >= 3 ? Math.min(TOO_FAST, median(speeds) * 1.5) : TOO_FAST;
  const fast = clocked.filter(r => r.velocity > limit);
  if (fast.length) issues.push({ level: 'warn', title: `${fast.length} speed${fast.length === 1 ? '' : 's'} look too fast`, items: fast.map(r => `${name(r)}: ${Math.round(r.velocity).toLocaleString('en-PH')} m/min`), note: `Over ${Math.round(limit).toLocaleString('en-PH')} m/min. Check the distance, the loft coordinates and the clocking.` });

  if (race.requires_show_up !== false) {
    const waiting = clocked.filter(r => r.clock.verification === 'provisional');
    if (waiting.length) issues.push({ level: race.status === 'closed' ? 'info' : 'warn', title: race.status === 'closed' ? `${waiting.length} disqualified: never shown up` : `${waiting.length} not shown up yet`, items: waiting.map(name), note: race.status === 'closed' ? '' : 'They are disqualified when the race is closed.' });
  }

  const flyingMembers = new Set(rows.filter(r => !r.clock).map(r => r.member_id));
  const offline = readers.filter(d => d.member_id && flyingMembers.has(d.member_id) && (!d.is_online || d.pending_taps > 0));
  if (race.status === 'open' && offline.length) issues.push({ level: 'warn', title: `${offline.length} loft reader${offline.length === 1 ? '' : 's'} offline or still sending`, items: offline.map(d => `${d.name} · ${d.member_name || ''}${d.pending_taps ? ` · ${d.pending_taps} taps waiting` : ''}`), note: 'Taps saved on a reader are only accepted until the race is closed.' });

  const flying = rows.filter(r => !r.clock);
  if (flying.length) issues.push({ level: 'info', title: `${flying.length} not clocked`, items: flying.map(name) });

  const rejected = rows.filter(r => r.clock?.verification === 'rejected');
  if (rejected.length) issues.push({ level: 'info', title: `${rejected.length} rejected by the club`, items: rejected.map(name) });
  return issues;
}

export function reviewHtml(race, issues, esc) {
  const blocking = issues.filter(i => i.level !== 'info').length;
  const head = blocking
    ? `<strong>${blocking} thing${blocking === 1 ? '' : 's'} to check</strong> before the results of ${esc(race.name)} are final.`
    : `<strong>Ready.</strong> Nothing to check for ${esc(race.name)}${race.status === 'closed' ? '.' : '. Close it on Race schedules when every pigeon is in.'}`;
  return `<div class="review-head ${blocking ? 'is-warn' : 'is-ok'}">${head}</div>${issues.length ? `<ul class="review-list">${issues.map(i => `<li class="review-item is-${i.level}"><details${i.level === 'info' ? '' : ' open'}><summary>${esc(i.title)}</summary>${i.note ? `<p class="small">${esc(i.note)}</p>` : ''}<ul>${i.items.slice(0, 30).map(item => `<li>${esc(item)}</li>`).join('')}${i.items.length > 30 ? `<li>… and ${i.items.length - 30} more</li>` : ''}</ul></details></li>`).join('')}</ul>` : ''}`;
}
