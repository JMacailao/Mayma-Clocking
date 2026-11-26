// Distances are shown in km (Results and the public results).
module.exports = async (page, { open, check, sample }) => {
  await open('/repo/pages/admin/results/page.js', sample);
  const text = await page.locator('main, body').first().innerText();
  check(/90\.00 km/.test(text), `admin Results shows the distance in km (${(text.match(/[\d,.]+ k?m\b/) || [''])[0]})`);
  check(!/90,000 m\b/.test(text), 'no distance in metres left');
};
