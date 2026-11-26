// The push Edge Function, run in Node with a stand-in Deno, database and push
// service. The test plays the browser: it decrypts the notification (RFC 8291)
// and checks the VAPID signature (RFC 8292), as Chrome and Firefox do.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const b64url = bytes => Buffer.from(bytes).toString('base64url');
const hmac = async (key, data) => new Uint8Array(await subtle.sign('HMAC', await subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), data));
const cat = (...parts) => new Uint8Array(Buffer.concat(parts.map(p => Buffer.from(p))));

async function browser() {
  const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pub = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
  const auth = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return {
    sub: { p256dh: b64url(pub), auth: b64url(auth) },
    async decrypt(body) {
      const salt = body.slice(0, 16), idlen = body[20], asPublic = body.slice(21, 21 + idlen), sealed = body.slice(21 + idlen);
      const asKey = await subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
      const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: asKey }, pair.privateKey, 256));
      const ikm = (await hmac(await hmac(auth, shared), cat(enc.encode('WebPush: info\0'), pub, asPublic, [1]))).slice(0, 32);
      const prk = await hmac(salt, ikm);
      const cek = (await hmac(prk, cat(enc.encode('Content-Encoding: aes128gcm\0'), [1]))).slice(0, 16);
      const nonce = (await hmac(prk, cat(enc.encode('Content-Encoding: nonce\0'), [1]))).slice(0, 12);
      const plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), sealed));
      assert.equal(plain.at(-1), 2, 'last-record padding delimiter');
      return JSON.parse(new TextDecoder().decode(plain.slice(0, -1)));
    }
  };
}

async function loadFunction(db) {
  const calls = [];
  let handler;
  globalThis.Deno = { env: { get: name => ({ SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'svc' })[name] }, serve: fn => { handler = fn; } };
  globalThis.fetch = async (url, options = {}) => {
    url = String(url);
    const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) });
    if (url.startsWith('https://db.example/rest/v1/rpc/')) {
      const name = url.split('/').pop(), args = JSON.parse(options.body);
      calls.push({ rpc: name, args });
      if (name === 'push_keys') return json(db.keys);
      if (name === 'push_save_keys') { db.keys ??= { public: args.p_public, private: args.p_private }; db.functionUrl = args.p_function_url; return json(db.keys.public); }
      if (name === 'push_take') return json(db.outbox[args.p_id] ?? null);
      if (name === 'push_done') { db.done = args; return { ok: true, status: 204, json: async () => null, text: async () => '' }; }
    }
    calls.push({ push: url, headers: options.headers, body: new Uint8Array(options.body) });
    return json({}, url.includes('gone') ? 410 : 201);
  };
  const source = stripTypeScriptTypes(readFileSync(new URL('../../supabase/functions/avilonx-push/index.ts', import.meta.url), 'utf8'));
  await import(`data:text/javascript,${encodeURIComponent(source)}//${Math.random()}`);
  return { handler, calls };
}

const post = body => new Request('https://x.supabase.co/functions/v1/avilonx-push', { method: 'POST', body: JSON.stringify(body) });

test('push: makes keys once, encrypts for each device, signs with VAPID, forgets gone devices', async () => {
  const phone = await browser();
  const db = { keys: null, outbox: {} };
  const { handler, calls } = await loadFunction(db);

  let response = await handler(post({ action: 'keys' }));
  const { public: publicKey } = await response.json();
  assert.equal(Buffer.from(publicKey, 'base64url').length, 65, 'uncompressed P-256 public key for applicationServerKey');
  assert.equal(db.functionUrl, 'https://db.example/functions/v1/avilonx-push');
  response = await handler(post({ action: 'keys' }));
  assert.equal((await response.json()).public, publicKey, 'the same keys on the next call');

  db.outbox[7] = { title: '🕊 PH-1 was clocked', body: 'Batangas Derby · 09:20:53 PM', url: 'pages/member/history/index.html', tag: 'clock-1',
    subscriptions: [{ endpoint: 'https://push.example/send/abc', ...phone.sub }, { endpoint: 'https://push.example/gone/old', ...phone.sub }] };
  response = await handler(post({ outbox_id: 7 }));
  assert.deepEqual(await response.json(), { ok: true, sent: 1, gone: 1, failed: 0 });
  assert.deepEqual(db.done, { p_id: 7, p_error: null, p_gone: ['https://push.example/gone/old'] });

  const sent = calls.find(c => c.push === 'https://push.example/send/abc');
  assert.equal(sent.headers['Content-Encoding'], 'aes128gcm');
  assert.deepEqual(await phone.decrypt(sent.body), { title: '🕊 PH-1 was clocked', body: 'Batangas Derby · 09:20:53 PM', url: 'https://www.avilonx.site/pages/member/history/index.html', tag: 'clock-1' });

  const [, token, k] = sent.headers.Authorization.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, publicKey);
  const [h, p, s] = token.split('.');
  const claims = JSON.parse(Buffer.from(p, 'base64url'));
  assert.equal(claims.aud, 'https://push.example');
  assert.ok(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 24 * 3600);
  const verifyKey = await subtle.importKey('raw', Buffer.from(publicKey, 'base64url'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.ok(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verifyKey, Buffer.from(s, 'base64url'), enc.encode(`${h}.${p}`)), 'VAPID signature checks out');

  response = await handler(post({ outbox_id: 99 }));
  assert.deepEqual(await response.json(), { ok: true, skipped: true }, 'nothing queued: nothing sent');
  response = await handler(post({}));
  assert.equal(response.status, 400);
});
