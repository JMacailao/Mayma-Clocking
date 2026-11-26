// Settings → Notifications: turning push on subscribes this device with the
// Edge Function's key and saves it; a test can be sent; turning off removes it.
module.exports = async (page, { open, check, sample, OUT }) => {
  await page.addInitScript(() => {
    let permission = 'default';
    Object.defineProperty(window, 'Notification', { configurable: true, value: { get permission() { return permission; }, requestPermission: async () => (permission = 'granted') } });
    window.PushManager ||= function () {};
    const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/test-phone', options: {}, unsubscribe: async () => { window.__sub = null; return true; },
      toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'P'.repeat(87), auth: 'a'.repeat(22) } }; } };
    const reg = { pushManager: { getSubscription: async () => window.__sub || null, subscribe: async options => { window.__subOptions = options; return (window.__sub = sub); } } };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: async () => reg, register: async () => reg, ready: Promise.resolve(reg) } });
  });
  const key = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString('base64url');
  const setup = sample + `F.identity={profile:{role:'member',member_id:8,username:'ana',club_id:1}};
    F.rpc.push_public_key=null;F.functions={'avilonx-push':a=>a.action==='keys'?{ok:true,public:'${key}'}:{__error:{message:'bad'}}};
    F.saved=[];F.rpc.push_subscribe=a=>{F.saved.push(a.p_endpoint);return null;};F.rpc.push_unsubscribe=a=>{F.saved=F.saved.filter(e=>e!==a.p_endpoint);return null;};
    F.rpc.push_status=a=>({this_device:F.saved.includes(a.p_endpoint),devices:F.saved.length});F.rpc.push_test={ok:true};`;
  await open('/repo/pages/member/settings/page.js', setup);
  await page.waitForSelector('[data-push-on]', { timeout: 8000 }).catch(() => {});
  check(await page.locator('[data-push-panel]').isVisible() && /pigeons is clocked/.test(await page.locator('[data-push-panel]').innerText()), 'Notifications panel shows for members');
  await page.click('[data-push-on]');
  await page.waitForSelector('[data-push-test]', { timeout: 8000 }).catch(() => {});
  const ops = await page.evaluate(() => window.FAKE.ops.filter(o => o[0] !== 'select').map(o => o[1]));
  check(ops.includes('avilonx-push'), 'no key yet: the Edge Function made one');
  const options = await page.evaluate(() => ({ visible: window.__subOptions?.userVisibleOnly, key: Array.from(window.__subOptions?.applicationServerKey || []).length }));
  check(options.visible === true && options.key === 65, `subscribed with the 65-byte key (${JSON.stringify(options)})`);
  const saved = await page.evaluate(() => window.FAKE.ops.find(o => o[1] === 'push_subscribe')?.[2]);
  check(saved?.p_endpoint === 'https://fcm.googleapis.com/fcm/send/test-phone' && saved.p_p256dh.length === 87 && saved.p_auth.length === 22 && /·/.test(saved.p_device), 'device saved with its keys');
  check(/On/.test(await page.locator('[data-push-panel] .tag').innerText().catch(() => '')), 'shows On');
  await page.locator('[data-push-panel]').screenshot({ path: `${OUT}/push-settings-on.png` });
  await page.click('[data-push-test]'); await page.waitForTimeout(300);
  check(await page.evaluate(() => window.FAKE.ops.some(o => o[1] === 'push_test')), 'Send a test asks the database');
  await page.click('[data-push-off]');
  await page.waitForSelector('[data-push-on]', { timeout: 8000 }).catch(() => {});
  check(await page.evaluate(() => window.FAKE.saved.length === 0 && !window.__sub), 'Turn off removes the device');
};
