// Club admin and staff: one toolbar under the top bar on every page, always in
// view. Left: the page's own main action, Refresh, Show/Hide filters, a search
// that filters this page's lists, and More actions (Export, Print…). Right:
// Find a member, bird or race (Ctrl K), notifications and the account menu.
import { supabase, escapeHTML, formatDate, pageUrl as url } from './shared.js';

const icon = path => `<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">${path}</svg>`;
const ICONS = {
  plus: icon('<path d="M12 5v14M5 12h14"/>'),
  refresh: icon('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
  filter: icon('<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/>'),
  search: icon('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>'),
  more: icon('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'),
  bell: icon('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  chevron: icon('<path d="m7 10 5 5 5-5"/>'),
};

// Each page's main action: the label, the page element, and whether the
// toolbar presses it ('click') or takes you to it ('focus': its first field).
const PRIMARY = {
  dashboard: ['Create a race', null, 'create-race'],
  members: ['Add member', '[data-add-member]', 'click'],
  'bird-bonding': ['Bond a bird', '[data-bond-new]', 'click'],
  'race-points': ['Add race point', '#record-form', 'focus'],
  races: ['Create schedule', '[data-create-schedule]', 'click'],
  entries: ['New entry', '#entry-form', 'focus'],
  'entry-remarks': ['Add remark', '#remark-form', 'focus'],
  'race-day': ['Big screen', '[data-tv]', 'click'],
  clocking: ['Start scanning', '[data-radar-open]', 'click'],
  'show-up': ['Tap a tag', 'input[placeholder^="Or type the tag"]', 'focus'],
  results: ['Export Excel', '[data-export-race]', 'click'],
  'change-history': ['Show older changes', '[data-more]:not([hidden])', 'click'],
  'team-users': ['Add account', '[data-open-team-dialog]', 'click'],
  'club-settings': ['Save settings', '[data-save-settings]', 'click'],
};
// Page buttons the toolbar replaces, so they are not shown twice.
const DUPLICATES = '.schedule-toolbar [data-create-schedule],.birds-head [data-bond-new],.welcome-row>a.button[href*="races"]';
const FILTERS = '.schedule-filter,.birds-filters,.race-filter,.history-filter,.history-filters,.results-actions .field,[data-page-filters]';
const MORE_TEXT = /^(Export|Print|Big screen|Download|Template|Import)/i;

export function toolbarHtml(identity) {
  const name = identity?.profile?.username || 'Account';
  return `<div class="admin-toolbar" role="toolbar" aria-label="Page tools" data-admin-toolbar>
    <div class="tb-group tb-page">
      <button class="button tb-primary" type="button" data-tb-primary hidden>${ICONS.plus}<span data-tb-primary-label></span></button>
      <button class="button tb-button" type="button" data-tb-refresh title="Refresh">${ICONS.refresh}<span class="tb-label">Refresh</span></button>
      <button class="button tb-button" type="button" data-tb-filters aria-pressed="false" hidden>${ICONS.filter}<span class="tb-label" data-tb-filters-label>Hide filters</span></button>
      <label class="tb-search tb-page-search" data-tb-page-search-wrap hidden>${ICONS.search}<input type="search" data-tb-page-search placeholder="Search this page" aria-label="Search this page"></label>
      <div class="tb-menu-wrap" data-tb-more-wrap hidden><button class="button tb-button" type="button" data-tb-more aria-haspopup="menu" aria-expanded="false" title="More actions">${ICONS.more}<span class="tb-label">More actions</span>${ICONS.chevron}</button><div class="tb-menu" role="menu" data-tb-more-menu hidden></div></div>
    </div>
    <div class="tb-group tb-global">
      <button class="tb-round tb-find-toggle" type="button" data-tb-find-toggle aria-label="Find a member, bird or race">${ICONS.search}</button>
      <div class="tb-find" data-tb-find>
        <label class="tb-search">${ICONS.search}<input type="search" data-tb-find-input placeholder="Find a member, bird or race…" aria-label="Find a member, bird or race" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="tb-find-list"><kbd class="tb-kbd">Ctrl K</kbd></label>
        <ul class="tb-find-list" id="tb-find-list" role="listbox" data-tb-find-list hidden></ul>
      </div>
      <div class="tb-menu-wrap"><button class="tb-round" type="button" data-tb-bell aria-haspopup="dialog" aria-expanded="false" aria-label="Notifications">${ICONS.bell}<span class="tb-badge" data-tb-badge hidden></span></button><div class="tb-menu tb-bell-menu" data-tb-bell-menu hidden></div></div>
      <div class="tb-menu-wrap"><button class="tb-avatar" type="button" data-tb-account aria-haspopup="menu" aria-expanded="false" aria-label="Account: ${escapeHTML(name)}"><span>${escapeHTML(name.slice(0, 2).toUpperCase())}</span>${ICONS.chevron}</button><div class="tb-menu" role="menu" data-tb-account-menu hidden></div></div>
    </div>
  </div>`;
}

// Small pop-up menus: one open at a time, closed by Escape or a click outside.
function menu(button, panel, onOpen) {
  const close = () => { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); };
  button.addEventListener('click', event => {
    event.stopPropagation();
    const opening = panel.hidden;
    document.querySelectorAll('[data-admin-toolbar] .tb-menu').forEach(other => { other.hidden = true; });
    document.querySelectorAll('[data-admin-toolbar] [aria-expanded="true"]').forEach(other => other.setAttribute('aria-expanded', 'false'));
    if (opening) { onOpen?.(); panel.hidden = false; button.setAttribute('aria-expanded', 'true'); panel.querySelector('button,a')?.focus(); }
  });
  document.addEventListener('click', event => { if (!panel.hidden && !panel.contains(event.target)) close(); });
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { close(); button.focus(); } });
  return close;
}

const go = href => { const link = Object.assign(document.createElement('a'), { href: url(href) }); document.body.append(link); link.click(); link.remove(); };

export function mountToolbar(identity) {
  const bar = document.querySelector('[data-admin-toolbar]'); if (!bar) return;
  const $ = selector => bar.querySelector(selector);
  const view = () => document.querySelector('.page-view');

  $('[data-tb-refresh]').onclick = () => window.dispatchEvent(new Event('app:refresh'));

  // Show / Hide the page's filters (remembered).
  const filtersButton = $('[data-tb-filters]');
  const setFiltersHidden = hidden => {
    document.body.classList.toggle('filters-hidden', hidden);
    filtersButton.setAttribute('aria-pressed', String(hidden));
    $('[data-tb-filters-label]').textContent = hidden ? 'Show filters' : 'Hide filters';
    filtersButton.title = hidden ? 'Show filters' : 'Hide filters';
    try { localStorage.setItem('avilonx.filtersHidden', hidden ? '1' : ''); } catch { /* storage unavailable */ }
  };
  filtersButton.onclick = () => setFiltersHidden(!document.body.classList.contains('filters-hidden'));
  try { setFiltersHidden(localStorage.getItem('avilonx.filtersHidden') === '1'); } catch { /* storage unavailable */ }

  // Search this page: hides list rows and cards that do not contain the text.
  const pageSearch = $('[data-tb-page-search]');
  pageSearch.addEventListener('input', () => applyPageSearch(view(), pageSearch.value));

  // More actions: the page's own Export / Print / Import buttons.
  menu($('[data-tb-more]'), $('[data-tb-more-menu]'));

  // Account menu.
  const role = identity?.profile?.role;
  const accountMenu = $('[data-tb-account-menu]');
  accountMenu.innerHTML = `<div class="tb-menu-head"><strong>${escapeHTML(identity?.profile?.username || 'Account')}</strong><span>${role === 'staff' ? 'Club staff' : 'Club administrator'}${identity?.club?.name ? ` · ${escapeHTML(identity.club.name)}` : ''}</span></div>
    ${role === 'admin' ? `<a role="menuitem" href="${url('pages/admin/settings/index.html')}">Club settings</a><a role="menuitem" href="${url('pages/admin/users/index.html')}">Team accounts</a>` : ''}
    <a role="menuitem" href="${url('pages/admin/history/index.html')}">Change history</a>
    <button role="menuitem" type="button" data-tb-signout>Sign out</button>`;
  const closeAccount = menu($('[data-tb-account]'), accountMenu);
  accountMenu.addEventListener('click', event => { if (event.target.closest('a')) closeAccount(); });
  accountMenu.querySelector('[data-tb-signout]').onclick = () => document.querySelector('#sign-out')?.click();

  mountBell($('[data-tb-bell]'), $('[data-tb-bell-menu]'), $('[data-tb-badge]'), role);
  mountFind($('[data-tb-find-input]'), $('[data-tb-find-list]'));
  // Phones: Find opens across the toolbar from its search button.
  const findInput = $('[data-tb-find-input]');
  $('[data-tb-find-toggle]').onclick = () => { bar.classList.add('is-finding'); findInput.focus(); };
  findInput.addEventListener('blur', () => setTimeout(() => bar.classList.remove('is-finding'), 160));
}

// After each page is shown: its main action, filters, search and More actions.
export function syncToolbar(view, page) {
  const bar = document.querySelector('[data-admin-toolbar]'); if (!bar || !view) return;
  const $ = selector => bar.querySelector(selector);
  const [label, selector, mode] = PRIMARY[page] || [];
  const target = mode === 'create-race' ? true : selector && view.querySelector(selector);
  const primary = $('[data-tb-primary]');
  primary.hidden = !target;
  if (target) {
    $('[data-tb-primary-label]').textContent = label;
    primary.title = label; primary.setAttribute('aria-label', label);
    primary.onclick = () => {
      if (mode === 'create-race') { try { sessionStorage.setItem('avilonx.openCreate', '1'); } catch { /* storage unavailable */ } go('pages/admin/races/index.html'); return; }
      const element = view.querySelector(selector); if (!element) return;
      if (mode === 'click') { element.click(); return; }
      const field = element.matches('input,select,textarea') ? element : element.querySelector('input:not([type=hidden]):not([type=radio]):not([type=checkbox]),select,textarea');
      element.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
      field?.focus({ preventScroll: true });
    };
  }
  view.querySelectorAll(DUPLICATES).forEach(button => button.classList.add('tb-duplicate'));

  $('[data-tb-filters]').hidden = !view.querySelector(FILTERS);

  const hasLists = Boolean(view.querySelector('table tbody tr,.public-cards li'));
  const searchWrap = $('[data-tb-page-search-wrap]'), pageSearch = $('[data-tb-page-search]');
  searchWrap.hidden = !hasLists;
  let pending = ''; try { pending = sessionStorage.getItem('avilonx.findTerm') || ''; sessionStorage.removeItem('avilonx.findTerm'); } catch { /* storage unavailable */ }
  pageSearch.value = pending;
  view._tbSearchObserver?.disconnect();
  if (hasLists) {
    // Lists redraw when the page filters or saves: search again.
    const observer = new MutationObserver(() => { if (pageSearch.value) applyPageSearch(view, pageSearch.value); });
    observer.observe(view, { childList: true, subtree: true });
    view._tbSearchObserver = observer;
    if (pending) applyPageSearch(view, pending);
  }

  const actions = [...view.querySelectorAll('button,a.button')].filter(el => MORE_TEXT.test(el.textContent.trim()) && !el.closest('dialog,.tb-menu') && !el.disabled);
  const moreWrap = $('[data-tb-more-wrap]'), moreMenu = $('[data-tb-more-menu]');
  moreMenu.innerHTML = actions.map((el, i) => `<button role="menuitem" type="button" data-tb-action="${i}">${escapeHTML(el.textContent.trim())}</button>`).join('') + '<button role="menuitem" type="button" data-tb-print>Print this page</button><button role="menuitem" type="button" data-tb-menu-refresh>Refresh</button>';
  moreMenu.querySelectorAll('[data-tb-action]').forEach(item => item.onclick = () => { moreMenu.hidden = true; actions[Number(item.dataset.tbAction)].click(); });
  moreMenu.querySelector('[data-tb-print]').onclick = () => { moreMenu.hidden = true; window.print(); };
  moreMenu.querySelector('[data-tb-menu-refresh]').onclick = () => { moreMenu.hidden = true; window.dispatchEvent(new Event('app:refresh')); };
  moreWrap.hidden = false;
}

export function applyPageSearch(view, text) {
  if (!view) return;
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  view.querySelectorAll('table tbody tr,.public-cards li').forEach(row => {
    if (row.querySelector('.empty-cell')) return;
    const hide = words.length > 0 && !words.every(word => row.textContent.toLowerCase().includes(word));
    row.classList.toggle('tb-hidden', hide);
  });
}

// Find a member, bird or race from any page (Ctrl K or /).
function mountFind(input, list) {
  let data = null, items = [], active = -1;
  const load = async () => {
    if (data) return data;
    const [members, birds, races] = await Promise.all([
      supabase.from('members').select('id,member_no,full_name,loft_name'),
      supabase.from('pigeons').select('id,ring_number,bird_name,member_id'),
      supabase.from('races').select('id,name,status,release_location'),
    ]);
    data = { members: members.data || [], birds: birds.data || [], races: races.data || [] };
    return data;
  };
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
  const draw = async () => {
    const term = input.value.trim().toLowerCase();
    if (!term) { close(); return; }
    const { members, birds, races } = await load();
    const has = (...values) => values.some(value => String(value ?? '').toLowerCase().includes(term));
    const memberName = id => members.find(m => m.id === id)?.full_name || '';
    items = [
      ...members.filter(m => has(m.full_name, m.member_no, m.loft_name)).slice(0, 5).map(m => ({ kind: 'Member', title: m.full_name, sub: `${m.member_no || ''} · ${m.loft_name || ''}`, href: 'pages/admin/members/index.html', view: 'members', term: m.member_no || m.full_name })),
      ...birds.filter(b => has(b.ring_number, b.bird_name)).slice(0, 5).map(b => ({ kind: 'Bird', title: b.ring_number, sub: [b.bird_name, memberName(b.member_id)].filter(Boolean).join(' · '), href: 'pages/admin/birds/index.html', view: 'bird-bonding', term: b.ring_number })),
      ...races.filter(r => has(r.name, r.release_location)).slice(0, 5).map(r => ({ kind: 'Race', title: r.name, sub: `${r.release_location || ''} · ${r.status}`, href: 'pages/admin/races/index.html', view: 'races', term: r.name, all: true })),
    ];
    active = items.length ? 0 : -1;
    list.innerHTML = items.length ? items.map((item, i) => `<li role="option" id="tb-find-${i}" aria-selected="${i === active}" data-find="${i}"><span class="tb-kind">${item.kind}</span><span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.sub)}</small></span></li>`).join('') : '<li class="tb-find-empty">Nothing found.</li>';
    list.hidden = false; input.setAttribute('aria-expanded', 'true');
    list.querySelectorAll('[data-find]').forEach(li => li.onmousedown = event => { event.preventDefault(); pick(Number(li.dataset.find)); });
  };
  const pick = i => {
    const item = items[i]; if (!item) return;
    try { sessionStorage.setItem('avilonx.findTerm', item.term); if (item.all) sessionStorage.setItem('avilonx.racesShowAll', '1'); } catch { /* storage unavailable */ }
    input.value = ''; close(); input.blur();
    if (document.body.dataset.view === item.view) window.dispatchEvent(new Event('app:refresh')); else go(item.href);
  };
  const move = step => {
    if (!items.length) return;
    active = (active + step + items.length) % items.length;
    list.querySelectorAll('[data-find]').forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
    input.setAttribute('aria-activedescendant', `tb-find-${active}`);
  };
  let timer;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(draw, 120); });
  input.addEventListener('focus', () => { load().catch(() => {}); if (input.value) draw(); });
  input.addEventListener('blur', () => setTimeout(close, 150));
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
    else if (event.key === 'Enter') { event.preventDefault(); pick(active); }
    else if (event.key === 'Escape') { input.value = ''; close(); }
  });
  document.addEventListener('keydown', event => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey)) || (event.key === '/' && !typing)) { event.preventDefault(); input.focus(); input.select(); }
  });
}

// Notifications: the club's latest clockings; the badge counts new ones.
function mountBell(button, panel, badge, role) {
  const SEEN = 'avilonx.bellSeen';
  const seen = () => { try { return Number(localStorage.getItem(SEEN)) || 0; } catch { return 0; } };
  let latest = [];
  const load = async () => {
    const { data: clocks } = await supabase.from('clock_events').select('id,race_entry_id,pigeon_ring,received_at_utc,verification').order('received_at_utc', { ascending: false }).limit(8);
    latest = clocks || [];
    const fresh = latest.filter(c => new Date(`${String(c.received_at_utc).replace(' ', 'T')}Z`).getTime() > seen()).length;
    badge.hidden = !fresh; badge.textContent = fresh > 9 ? '9+' : String(fresh);
  };
  menu(button, panel, () => {
    panel.innerHTML = `<div class="tb-menu-head"><strong>Latest clockings</strong><a href="${url('pages/admin/raceday/index.html')}">Race day →</a></div>${latest.length
      ? `<ul class="tb-bell-list">${latest.map(c => `<li><strong>${escapeHTML(c.pigeon_ring || '—')}</strong><span>${escapeHTML(formatDate(c.received_at_utc))}</span><span class="tag ${c.verification === 'verified' ? 'verified' : c.verification === 'rejected' ? 'rejected' : 'provisional'}">${escapeHTML(c.verification)}</span></li>`).join('')}</ul>`
      : '<p class="tb-empty">No clockings yet.</p>'}<a class="tb-menu-foot" href="${url(role === 'admin' ? 'pages/admin/settings/index.html' : 'pages/admin/dashboard/index.html')}">Push notifications on this device…</a>`;
    try { localStorage.setItem(SEEN, String(Date.now())); } catch { /* storage unavailable */ }
    badge.hidden = true;
  });
  load().catch(() => {});
  setInterval(() => { if (!document.hidden) load().catch(() => {}); }, 60000);
}
