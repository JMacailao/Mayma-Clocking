// Every page opens for its role (sign-in, menu and page content, no errors).
const fs = require('node:fs'), path = require('node:path');
const PAGES = {
  admin: ['admin/dashboard', 'admin/raceday', 'admin/members', 'admin/birds', 'admin/race-points', 'admin/coordinates', 'admin/races', 'admin/entries', 'admin/remarks', 'admin/clocking', 'admin/showup', 'admin/readers', 'admin/results', 'admin/history', 'admin/users', 'admin/settings'],
  member: ['member/dashboard', 'member/history', 'member/clocking', 'member/pigeons', 'member/coordinates', 'member/results', 'member/settings'],
  superadmin: ['superadmin/clubs', 'superadmin/stickers/register', 'superadmin/nfc', 'superadmin/readers', 'superadmin/stickers/generate', 'superadmin/setup']
};
module.exports = async (page, { check, sample, BASE }) => {
  const browser = page.context().browser(), fake = fs.readFileSync(path.join(__dirname, 'fake-supabase.js'), 'utf8');
  for (const [role, list] of Object.entries(PAGES)) {
    const profile = role === 'member' ? { id: 'u', role, member_id: 8, username: 'ana', club_id: 1, is_active: true } : role === 'admin' ? { id: 'u', role, username: 'admin', club_id: 1, is_active: true } : { id: 'u', role, username: 'super', is_active: true };
    for (const name of list) {
      const context = await browser.newContext();
      await context.route('https://cdn.jsdelivr.net/**', route => route.request().url().includes('supabase-js') ? route.fulfill({ contentType: 'text/javascript', body: fake }) : route.abort());
      await context.route(/^https:\/\/(?!cdn\.jsdelivr\.net)/, route => route.abort());
      await context.addInitScript(`window.FAKE={tables:{},rpc:{}};(function(F){${sample}
        F.session={user:{id:'u'}};F.tables.app_profiles=[${JSON.stringify(profile)}];F.tables.clubs=[{id:1,name:'Club'}];F.tables.race_points=[{id:1,location:'Batangas',latitude:13,longitude:121}];
        F.tables.members.forEach(m=>{m.latitude=14;m.longitude=121;m.club_id=1;});F.rpc.setup_status={};F.rpc.superadmin_list_rfid_devices=[];F.rpc.member_list_rfid_devices=[];F.rpc.public_result_clubs=[];F.tables.clubs[0].rfid_entry_sticker='required';
      })(window.FAKE);`);
      const tab = await context.newPage(), errors = [];
      tab.on('pageerror', e => errors.push(e.message)); tab.on('dialog', d => d.dismiss().catch(() => {}));
      await tab.goto(`${BASE}/repo/pages/${name}/index.html`, { timeout: 15000 }).catch(() => {});
      await tab.waitForFunction(() => document.querySelector('.page-view')?.innerText.trim().length > 20, null, { timeout: 8000 }).catch(() => {});
      const text = (await tab.locator('.page-view').innerText().catch(() => '')).trim();
      check(text.length > 20, `${name} shows its content`);
      check((await tab.locator('.sidebar .nav-link.active').count()) === 1, `${name} highlights its menu item`);
      const real = errors.filter(e => !/AudioContext|vibrate/.test(e));
      check(!real.length, `${name} has no errors: ${real.join(' | ')}`);
      await context.close();
    }
  }
};
