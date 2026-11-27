// Every page on a 320px touch phone: no sideways scrolling (content wider than
// the screen must scroll inside its own box), and every button, field and link
// button at least 44 × 44 px so a fingertip hits it.
const fs = require('node:fs'), path = require('node:path');
const PAGES = {
  admin: ['admin/dashboard', 'admin/raceday', 'admin/members', 'admin/birds', 'admin/race-points', 'admin/coordinates', 'admin/races', 'admin/entries', 'admin/remarks', 'admin/clocking', 'admin/showup', 'admin/readers', 'admin/results', 'admin/history', 'admin/users', 'admin/settings'],
  member: ['member/dashboard', 'member/history', 'member/clocking', 'member/pigeons', 'member/coordinates', 'member/results', 'member/settings'],
  superadmin: ['superadmin/clubs', 'superadmin/stickers/register', 'superadmin/nfc', 'superadmin/readers', 'superadmin/stickers/generate', 'superadmin/setup'],
  visitor: ['login']
};
module.exports = async (page, { check, sample, BASE }) => {
  const browser = page.context().browser(), fake = fs.readFileSync(path.join(__dirname, 'fake-supabase.js'), 'utf8');
  for (const [role, list] of Object.entries(PAGES)) {
    const profile = role === 'member' ? { id: 'u', role, member_id: 8, username: 'ana', club_id: 1, is_active: true } : role === 'admin' ? { id: 'u', role, username: 'admin', club_id: 1, is_active: true } : { id: 'u', role: 'superadmin', username: 'super', is_active: true };
    for (const name of list) {
      const context = await browser.newContext({ viewport: { width: 320, height: 720 }, hasTouch: true, isMobile: true });
      await context.route('https://cdn.jsdelivr.net/**', route => route.request().url().includes('supabase-js') ? route.fulfill({ contentType: 'text/javascript', body: fake }) : route.abort());
      await context.route(/^https:\/\/(?!cdn\.jsdelivr\.net)/, route => route.abort());
      await context.addInitScript(`window.FAKE={tables:{},rpc:{}};(function(F){${sample}
        ${role === 'visitor' ? '' : "F.session={user:{id:'u'}};"}F.tables.app_profiles=[${JSON.stringify(profile)}];F.tables.clubs=[{id:1,name:'Club'}];F.tables.race_points=[{id:1,location:'Batangas',latitude:13,longitude:121}];
        F.tables.members.forEach(m=>{m.latitude=14;m.longitude=121;m.club_id=1;});F.rpc.setup_status={};F.rpc.superadmin_list_rfid_devices=[];F.rpc.member_list_rfid_devices=[];F.rpc.public_result_clubs=[];F.tables.clubs[0].rfid_entry_sticker='required';
      })(window.FAKE);`);
      const tab = await context.newPage();
      tab.on('dialog', d => d.dismiss().catch(() => {}));
      await tab.goto(`${BASE}/repo/pages/${name}/index.html`, { timeout: 15000 }).catch(() => {});
      await tab.waitForFunction(() => (document.querySelector('.page-view, .login-card')?.innerText.trim().length || 0) > 20, null, { timeout: 8000 }).catch(() => {});
      await tab.waitForTimeout(600);
      const r = await tab.evaluate(() => {
        const W = innerWidth, small = [];
        for (const el of document.querySelectorAll('button, select, textarea, input:not([type=checkbox]):not([type=radio]):not([type=hidden]), a.button, [role=button], [role=tab]')) {
          if (!el.offsetParent || el.closest('#app-sidebar')) continue;
          const b = el.getBoundingClientRect();
          if (b.height < 44 || b.width < 44) small.push(`"${(el.innerText || el.value || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 20)}" ${Math.round(b.width)}×${Math.round(b.height)}`);
        }
        return { width: document.documentElement.scrollWidth, W, small: [...new Set(small)] };
      });
      check(r.width <= r.W, `${name}: page scrolls sideways at 320px (${r.width}px wide)`);
      check(!r.small.length, `${name}: controls under 44px on a phone: ${r.small.slice(0, 5).join(', ')}`);
      await context.close();
    }
  }
};
