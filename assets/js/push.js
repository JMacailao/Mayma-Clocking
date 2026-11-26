// Settings → Notifications: turns push notifications on or off for this phone or
// computer (push.sql, supabase/functions/avilonx-push). Works in the browser, the
// installed website and the Android app (its notifications show as the app's).
import { supabase, message } from './shared.js';

const ROOT = new URL('../../', import.meta.url);
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
const iPhoneNotInstalled = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator.standalone || matchMedia('(display-mode: standalone)').matches);
const bytes = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=')), c => c.charCodeAt(0));
const deviceName = () => {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Computer';
  return `${os} · ${/Edg\//.test(ua) ? 'Edge' : /Firefox/.test(ua) ? 'Firefox' : /Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'browser'}`;
};

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration(ROOT.href);
  return existing || navigator.serviceWorker.register(new URL('sw.js', ROOT).href, { scope: ROOT.href, updateViaCache: 'none' });
}

async function publicKey() {
  const { data, error } = await supabase.rpc('push_public_key');
  if (error) throw new Error(error.code === 'PGRST202' ? 'Notifications are not set up yet. Run avilonx-update.sql in the Supabase SQL Editor.' : error.message);
  if (data) return data;
  // First use: the Edge Function makes the keys.
  const made = await supabase.functions.invoke('avilonx-push', { body: { action: 'keys' } });
  if (made.error || !made.data?.public) throw new Error('Notifications are not set up yet. Deploy the avilonx-push Edge Function.');
  return made.data.public;
}

export async function turnOn() {
  if (!supported()) throw new Error('This browser cannot show notifications.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them for AvilonX in your browser or phone settings, then try again.');
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const key = await publicKey();
  let sub = await reg.pushManager.getSubscription();
  if (sub && sub.options?.applicationServerKey && btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))) !== btoa(String.fromCharCode(...bytes(key)))) {
    await sub.unsubscribe(); sub = null;
  }
  sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(key) });
  const json = sub.toJSON();
  const { error } = await supabase.rpc('push_subscribe', { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth, p_device: deviceName() });
  if (error) throw new Error(error.message);
  return sub;
}

export async function turnOff() {
  const reg = await navigator.serviceWorker.getRegistration(ROOT.href);
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.rpc('push_unsubscribe', { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}

async function currentState() {
  if (!supported()) return { supported: false };
  const reg = await navigator.serviceWorker.getRegistration(ROOT.href);
  const sub = await reg?.pushManager.getSubscription();
  const { data } = await supabase.rpc('push_status', { p_endpoint: sub?.endpoint ?? null });
  return { supported: true, on: Boolean(sub && data?.this_device && Notification.permission === 'granted'), blocked: Notification.permission === 'denied' };
}

// The Settings panel. `what` says which notifications this person gets.
export async function mountPush(container, { what }) {
  container.hidden = false;
  const draw = state => {
    container.innerHTML = `<div class="panel-heading"><h3>Notifications</h3>${state.on ? '<span class="tag active">On</span>' : ''}</div>
      <p class="small">${what}</p>
      ${!state.supported
        ? `<div class="notice">${iPhoneNotInstalled() ? 'On iPhone, first add AvilonX to your Home Screen (Share → Add to Home Screen), then open it from there.' : 'This browser cannot show notifications. Use Chrome, Edge, Firefox or the AvilonX Android app.'}</div>`
        : `${state.blocked ? '<div class="notice warning">Notifications are blocked for AvilonX. Allow them in your browser or phone settings.</div>' : ''}
           <div class="form-actions">${state.on
             ? '<button class="button secondary" type="button" data-push-test>Send a test</button><button class="button secondary" type="button" data-push-off>Turn off on this device</button>'
             : '<button class="button primary" type="button" data-push-on>Turn on notifications</button>'}</div>`}`;
    const busy = async (button, work) => {
      button.disabled = true;
      try { await work(); } catch (error) { message(error.message || String(error), 'error'); }
      button.disabled = false;
      draw(await currentState().catch(() => state));
    };
    container.querySelector('[data-push-on]')?.addEventListener('click', event => busy(event.currentTarget, async () => { await turnOn(); message('Notifications are on for this device.', 'success'); }));
    container.querySelector('[data-push-off]')?.addEventListener('click', event => busy(event.currentTarget, async () => { await turnOff(); message('Notifications are off for this device.', 'success'); }));
    container.querySelector('[data-push-test]')?.addEventListener('click', event => busy(event.currentTarget, async () => {
      const { error } = await supabase.rpc('push_test');
      if (error) throw new Error(error.message);
      message('Test sent. It should arrive in a few seconds.', 'success');
    }));
  };
  draw(await currentState().catch(() => ({ supported: supported(), on: false })));
}
