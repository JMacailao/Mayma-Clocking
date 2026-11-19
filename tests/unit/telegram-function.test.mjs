// The Telegram Edge Function, run in Node with a stand-in Deno, Telegram and Supabase.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

async function loadFunction() {
  const calls = [];
  let handler;
  globalThis.Deno = {
    env: { get: name => ({ TELEGRAM_BOT_TOKEN: 'BOT', AVILONX_TELEGRAM_SECRET: 'sekret', SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'svc' })[name] },
    serve: fn => { handler = fn; }
  };
  globalThis.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url: String(url), body, headers: options.headers });
    const json = data => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
    if (String(url).includes('/rpc/telegram_link_by_code')) return json(body.p_code === 'goodcode0123456789' ? { ok: true, member: 'Ana Cruz' } : { ok: false });
    if (String(url).includes('/rpc/telegram_take_message')) return json({ chat_id: 42, text: 'PH-1 was clocked' });
    if (String(url).includes('/rpc/')) return json(1);
    return json({ ok: true });
  };
  const source = stripTypeScriptTypes(readFileSync(new URL('../../supabase/functions/avilonx-telegram/index.ts', import.meta.url), 'utf8'));
  await import(`data:text/javascript,${encodeURIComponent(source)}`);
  return { handler, calls };
}

test('Telegram bot: setup, connecting a member, sending a result, refusing strangers', async () => {
  const { handler, calls } = await loadFunction();
  const base = 'https://x.supabase.co/functions/v1/avilonx-telegram';

  let response = await handler(new Request(`${base}?setup=sekret`));
  assert.equal(response.status, 200);
  assert.deepEqual(calls.at(-1).body, { url: base, secret_token: 'sekret', allowed_updates: ['message'] }, 'webhook points back to the function');

  response = await handler(new Request(base, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'sekret' }, body: JSON.stringify({ message: { chat: { id: 42 }, text: '/start goodcode0123456789' } }) }));
  assert.equal(response.status, 200);
  assert.deepEqual(calls.find(c => c.url.endsWith('/rpc/telegram_link_by_code')).body, { p_code: 'goodcode0123456789', p_chat_id: 42 });
  assert.match(calls.at(-1).body.text, /Connected ✅ Ana Cruz/);

  response = await handler(new Request(base, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'wrong' }, body: '{}' }));
  assert.equal(response.status, 403, 'fake Telegram requests are refused');

  response = await handler(new Request(base, { method: 'POST', headers: { authorization: 'Bearer wrong' }, body: JSON.stringify({ outbox_id: 7 }) }));
  assert.equal(response.status, 403, 'only the database may ask to send');

  const before = calls.length;
  response = await handler(new Request(base, { method: 'POST', headers: { authorization: 'Bearer sekret' }, body: JSON.stringify({ outbox_id: 7 }) }));
  assert.equal(response.status, 200);
  const sent = calls.slice(before);
  assert.deepEqual(sent.find(c => c.url.includes('/sendMessage')).body, { chat_id: 42, text: 'PH-1 was clocked' });
  assert.deepEqual(sent.find(c => c.url.endsWith('/rpc/telegram_mark_sent')).body, { p_id: 7, p_error: null });
});
