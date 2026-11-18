// Login page: sign-in card and public results side by side.
module.exports = async (page, { app, check, BASE }) => {
  await app(`F.rpc.has_admin_account=true;F.rpc.public_result_clubs=[{id:1,name:'Club'}];`);
  await page.goto(`${BASE}/repo/pages/login/index.html`); await page.waitForSelector('#login-form');
  check(JSON.stringify(await page.locator('.login-tab').allInnerTexts()) === '["Club team","Member"]', 'Club team and Member tabs');
  check((await page.locator('.login-results h1').innerText()) === 'Public race results', 'public results are on the page');
  await page.click('[data-show-password]');
  check((await page.locator('[name=password]').getAttribute('type')) === 'text', 'the eye shows the password');
  await page.click('[data-audience=member]');
  check((await page.locator('#login-title').innerText()) === 'Member sign in', 'member sign-in');
};
