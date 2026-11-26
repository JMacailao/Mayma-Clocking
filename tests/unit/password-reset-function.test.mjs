// The password-reset Edge Function, run in Node with stand-ins for Deno, Gmail and Supabase.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

async function loadFunction(env = { GMAIL_USER: 'club@gmail.com', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop', SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'svc' }) {
  const rpcs = [], mails = [];
  let handler;
  globalThis.Deno = { env: { get: name => env[name] }, serve: fn => { handler = fn; } };
  globalThis.__mailer = { createTransport: options => ({ sendMail: async mail => { mails.push({ options, mail }); } }) };
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body);
    rpcs.push({ url: String(url), body, headers: options.headers });
    const json = data => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
    if (String(url).endsWith('/_password_reset_start')) return json(body.p_username === 'clubadmin' ? { email: 'admin@gmail.com', username: 'clubadmin', token: 'a'.repeat(64) } : null);
    if (String(url).endsWith('/_password_reset_finish')) return json(body.p_token === 'a'.repeat(64) && body.p_password.length >= 8 ? { ok: true, username: 'clubadmin' } : { ok: false, message: 'This link has expired or was already used. Ask for a new one.' });
    throw new Error('unexpected ' + url);
  };
  let source = stripTypeScriptTypes(readFileSync(new URL('../../supabase/functions/avilonx-password-reset/index.ts', import.meta.url), 'utf8'));
  source = source.replace(/^import nodemailer from "npm:nodemailer@[^"]+";$/m, 'const nodemailer = globalThis.__mailer;');
  // A fresh copy each time (settings are read when the function starts).
  await import(`data:text/javascript,${encodeURIComponent(source + `\n// ${Math.random()}`)}`);
  const post = body => handler(new Request('https://x.supabase.co/functions/v1/avilonx-password-reset', { method: 'POST', body: JSON.stringify(body) }));
  return { handler, post, rpcs, mails };
}

test('Forgot password: emails a link for known usernames, same answer for unknown ones', async () => {
  const { post, rpcs, mails } = await loadFunction();
  const known = await (await post({ action: 'request', username: ' ClubAdmin ' })).json();
  assert.equal(known.ok, true);
  assert.equal(rpcs[0].body.p_username, 'clubadmin');
  assert.equal(rpcs[0].headers.Authorization, 'Bearer svc', 'uses the service key, never the visitor');
  assert.equal(mails.length, 1);
  assert.deepEqual([mails[0].options.host, mails[0].options.port, mails[0].options.auth.user, mails[0].options.auth.pass], ['smtp.gmail.com', 465, 'club@gmail.com', 'abcdefghijklmnop']);
  assert.equal(mails[0].mail.to, 'admin@gmail.com');
  assert.match(mails[0].mail.text, new RegExp(`https://www\\.avilonx\\.site/pages/login/index\\.html\\?reset=${'a'.repeat(64)}`));
  const unknown = await (await post({ action: 'request', username: 'nobody' })).json();
  assert.deepEqual(unknown, known, 'unknown usernames get the same answer');
  assert.equal(mails.length, 1, 'and no email');
  const bad = await (await post({ action: 'request', username: '<script>' })).json();
  assert.deepEqual(bad, known);
});

test('Reset: valid link sets the password; bad links and short passwords are refused', async () => {
  const { post } = await loadFunction();
  const ok = await post({ action: 'reset', token: 'a'.repeat(64), password: 'newpass123' });
  assert.equal(ok.status, 200); assert.equal((await ok.json()).username, 'clubadmin');
  const used = await post({ action: 'reset', token: 'b'.repeat(64), password: 'newpass123' });
  assert.equal(used.status, 400); assert.match((await used.json()).message, /expired or was already used/);
  const malformed = await post({ action: 'reset', token: 'xyz', password: 'newpass123' });
  assert.equal(malformed.status, 400);
});

test('Not set up, preflight and wrong methods', async () => {
  const { handler, post } = await loadFunction({ SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'svc' });
  const off = await post({ action: 'request', username: 'clubadmin' });
  assert.equal(off.status, 503); assert.match((await off.json()).message, /not set up yet/);
  const pre = await handler(new Request('https://x/f', { method: 'OPTIONS' }));
  assert.equal(pre.status, 204); assert.equal(pre.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal((await handler(new Request('https://x/f'))).status, 405);
});
