// Super Admin → Setup checklist.
module.exports = async (page, { open, check }) => {
  await open('/repo/pages/superadmin/setup/page.js', `F.rpc.setup_status={'multi-club':true,'nfc-tags':true};`);
  check((await page.locator('.setup-list li').count()) >= 15, 'lists every setup part');
  check((await page.locator('.setup-list li.is-ok').count()) === 2, 'marks the two parts that are done');
  check(/not set up/.test(await page.locator('.setup-summary').innerText()), 'summary says what is missing');
  await open('/repo/pages/superadmin/setup/page.js', '');
  check(/avilonx-update\.sql/.test(await page.locator('.notice.error').innerText()), 'explains what to run when the check is not installed');
};
