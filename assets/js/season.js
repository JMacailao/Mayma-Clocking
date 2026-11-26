// Season standings (season-standings.sql): loft points and ace pigeons for a year.
import { supabase, escapeHTML, number } from './shared.js';

export async function mountSeason(container, { memberId = null } = {}) {
  container.classList.add('season-panel');
  const load = async year => {
    const { data, error } = await supabase.rpc('season_standings', { p_year: year ?? null });
    if (error) { container.hidden = error.code === 'PGRST202'; container.innerHTML = `<h3>Season standings</h3><div class="notice error">${escapeHTML(error.message)}</div>`; return; }
    container.hidden = false;
    const years = [...new Set([data.year, ...(data.years || [])])].sort((a, b) => b - a);
    const mine = row => memberId && row.member_id === memberId ? ' class="is-mine"' : '';
    const speed = value => value == null ? '—' : number(value);
    container.innerHTML = `<div class="panel-heading"><div><h3>Season standings</h3><p class="small">${data.races} closed race${data.races === 1 ? '' : 's'} · 1st place 10 points down to 10th 1 point (best bird per loft)</p></div>
      <label class="field season-year"><span class="sr-only">Season</span><select data-season-year>${years.map(y => `<option value="${y}" ${y === data.year ? 'selected' : ''}>${y}</option>`).join('')}</select></label></div>
      ${data.lofts.length ? `<div class="table-scroll"><table class="season-table"><thead><tr><th>#</th><th>Loft</th><th>Points</th><th>Wins</th><th>Races</th><th>Birds clocked</th><th>Best m/min</th></tr></thead><tbody>
        ${data.lofts.map((l, i) => `<tr${mine(l)}><td>${i + 1}</td><td><strong>${escapeHTML(l.loft_name || '—')}</strong><br><span class="small">${escapeHTML(l.full_name)} · ${escapeHTML(l.member_no || '')}</span></td><td><strong>${l.points}</strong></td><td>${l.wins}</td><td>${l.races}</td><td>${l.birds_clocked}</td><td>${speed(l.best_speed)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="empty-cell">No closed races this season yet.</p>'}
      <h3 class="season-sub">Ace pigeons</h3><p class="small">Birds clocked in 2 or more races, by average speed.</p>
      ${data.aces.length ? `<div class="table-scroll"><table class="season-table"><thead><tr><th>#</th><th>Ring</th><th>Loft</th><th>Races</th><th>Average m/min</th><th>Best m/min</th><th>Best place</th></tr></thead><tbody>
        ${data.aces.map((a, i) => `<tr${mine(a)}><td>${i + 1}</td><td><strong>${escapeHTML(a.ring || '—')}</strong></td><td>${escapeHTML(a.loft_name || '—')}<br><span class="small">${escapeHTML(a.full_name)}</span></td><td>${a.races}</td><td><strong>${speed(a.average_speed)}</strong></td><td>${speed(a.best_speed)}</td><td>${a.best_place}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="empty-cell">No bird has 2 counted races yet.</p>'}`;
    container.querySelector('[data-season-year]').onchange = event => load(Number(event.target.value));
  };
  await load(null);
}
