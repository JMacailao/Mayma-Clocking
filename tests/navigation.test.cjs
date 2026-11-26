const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

function setup(role = 'admin') {
  const listeners = {}, nodes = {};
  function element() {
    const attrs = {}, classes = new Set();
    return { dataset: {}, innerHTML: '', textContent: '', hidden: false,
      classList: { toggle(k, v) { if (v) classes.add(k); else classes.delete(k); }, contains: k => classes.has(k) },
      setAttribute(k, v) { attrs[k] = v; }, removeAttribute(k) { delete attrs[k]; }, getAttribute: k => attrs[k],
      replaceWith(next) { nodes['.page-view'] = next; }, querySelector: () => element() };
  }
  const body = element(); body.dataset = { base: '../../../', role };
  for (const key of ['.page-view', '.sidebar', '.member-bottom-nav', '.topbar h1', '[data-message]']) nodes[key] = element();
  const location = { href: `https://example.com/Mayma-Clocking/pages/${role}/dashboard/index.html`, origin: 'https://example.com' };
  const context = { URL, console, setTimeout, clearTimeout, body, location, supabase: {}, escapeHTML: String, fail: () => {},
    // Helpers app.js imports from i18n.js and update-check.js.
    syncToolbar: () => {}, toolbarHtml: () => '', mountToolbar: () => {}, startTranslation: () => {}, languageSwitchHtml: () => '', bindLanguageSwitch: () => {}, startUpdateCheck: () => {}, watchDevice: () => {}, releaseDevice: async () => {},
    history: { pushState(_, __, href) { location.href = href; } },
    document: { body, createElement: element, querySelector: key => nodes[key], querySelectorAll: () => [], addEventListener: (key, fn) => listeners[key] = fn },
    window: { scrollTo() {}, addEventListener: (key, fn) => listeners[key] = fn } };
  vm.createContext(context);
  const source = fs.readFileSync('assets/js/app.js', 'utf8').replace(/^import .*\n/gm, '').replace(/main\(\);\s*$/, '');
  vm.runInContext(source, context);
  context.renderPage = async view => { view.innerHTML = 'Loaded'; };
  const identity = { profile: { role, is_active: true } };
  context.getIdentity = async () => identity;
  return { context, nodes, listeners, identity };
}

test('admin and member navigation keep shell nodes mounted during delayed content', async () => {
  for (const role of ['admin', 'member']) {
    const {context:c,nodes,identity} = setup(role);
    const sidebar=nodes['.sidebar'], bottom=nodes['.member-bottom-nav'];
    let finish;
    c.renderPage = view => new Promise(resolve => { finish = () => { view.innerHTML='Loaded';resolve(); }; });
    const route = c.routeFor(`https://example.com/Mayma-Clocking/pages/${role}/results/index.html`);
    const pending = c.navigateRoute(route,{identity});
    assert.match(nodes['.page-view'].innerHTML,/Loading page/);
    assert.equal(nodes['.page-view'].getAttribute('aria-busy'),'true');
    assert.equal(nodes['.sidebar'],sidebar);assert.equal(nodes['.member-bottom-nav'],bottom);
    finish();await pending;
    assert.equal(nodes['.page-view'].innerHTML,'Loaded');
    assert.equal(nodes['.page-view'].getAttribute('aria-busy'),undefined);
  }
});

test('every role has a bottom bar: four pages plus More, current page marked', () => {
  const {context:c}=setup();
  for (const [role,inBar,notInBar] of [['admin','clocking','members'],['member','clocking','pigeons'],['superadmin','clubs','setup']]) {
    const html=c.bottomNav(inBar,role);
    assert.equal((html.match(/class="member-bottom-link[ "]/g)||[]).length,5,role);
    assert.equal((html.match(/<a class="member-bottom-link"/g)||[]).length,4,role);
    assert.match(html,/data-open-menu[^>]*aria-controls="app-sidebar"/);
    assert.match(html,/aria-current="page"/);assert.doesNotMatch(html,/is-active/);
    // A page reached through More highlights More instead.
    const other=c.bottomNav(notInBar,role);
    assert.doesNotMatch(other,/aria-current/);assert.match(other,/member-bottom-link is-active" data-open-menu/);
  }
});

test('route matching rejects external origins and preserves repository base at different depths',()=>{
  const {context:c}=setup('superadmin');
  assert.equal(c.routeFor('https://other.test/Mayma-Clocking/pages/admin/results/index.html'),null);
  c.location.href='https://example.com/Mayma-Clocking/pages/superadmin/stickers/register/index.html';
  assert.equal(c.routeFor('https://example.com/Mayma-Clocking/pages/superadmin/clubs/index.html').view,'clubs');
});

test('latest navigation wins when identity requests resolve out of order',async()=>{
  const {context:c,nodes,identity}=setup();
  const pending=[];c.getIdentity=()=>new Promise(resolve=>pending.push(resolve));
  c.renderPage=async(view,role,who,page)=>{view.innerHTML=page;};
  const a=c.navigateRoute(c.routeFor('https://example.com/Mayma-Clocking/pages/admin/races/index.html'));
  const b=c.navigateRoute(c.routeFor('https://example.com/Mayma-Clocking/pages/admin/results/index.html'));
  pending[1](identity);await b;pending[0](identity);await a;
  assert.equal(nodes['.page-view'].innerHTML,'results');
});

test('failed route keeps navigation and exposes retry',async()=>{
  const {context:c,nodes,identity}=setup();const sidebar=nodes['.sidebar'];
  c.renderPage=async()=>{throw new Error('offline');};
  await c.navigateRoute(c.routeFor(c.location.href),{identity});
  assert.equal(nodes['.sidebar'],sidebar);assert.match(nodes['.page-view'].innerHTML,/data-retry-page/);
});

test('staff cannot navigate into account management',async()=>{
  const {context:c}=setup();c.getIdentity=async()=>({profile:{role:'staff',is_active:true}});
  let rendered=false;c.renderPage=async()=>{rendered=true;};
  await c.navigateRoute(c.routeFor('https://example.com/Mayma-Clocking/pages/admin/users/index.html'));
  assert.equal(rendered,false);assert.match(c.location.href,/admin\/dashboard/);
});

test('back navigation reuses content loader without adding history',async()=>{
  const {context:c,listeners,nodes}=setup();
  c.history.pushState=()=>{throw new Error('Back must not push');};
  listeners.popstate();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(nodes['.page-view'].innerHTML,'Loaded');
});
