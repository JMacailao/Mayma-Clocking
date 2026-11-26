// AvilonX Clocking: push notifications for the website and the Android app
// (Supabase Edge Function, Web Push with VAPID; see push.sql).
//
// Deploy as "avilonx-push" with JWT verification OFF (the database calls it).
// No secrets to set: the first call makes the Web Push keys and saves them in
// the database. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
//
//   POST { action: "keys" }     makes the keys if there are none, answers { public }
//   POST { outbox_id }          sends that queued notification to all the person's devices
// Anyone may call it: it only makes keys once and only sends what the database queued.
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CONTACT = Deno.env.get("PUSH_CONTACT") ?? "mailto:admin@avilonx.site";
const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://www.avilonx.site").replace(/\/+$/, "");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function rpc(name: string, args: Record<string, unknown> = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error(`${name}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

// ---- Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) with WebCrypto -------------------
const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (text: string) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=")), c => c.charCodeAt(0));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0; for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

export async function makeKeys() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { public: b64url(publicRaw), private: await crypto.subtle.exportKey("jwk", pair.privateKey) };
}

async function vapidHeader(endpoint: string, keys: { public: string; private: JsonWebKey }) {
  const key = await crypto.subtle.importKey("jwk", keys.private, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64url(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: CONTACT })));
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${body}`)));
  return `vapid t=${head}.${body}.${b64url(signature)}, k=${keys.public}`;
}

export async function encrypt(payload: Uint8Array, p256dh: string, authSecret: string) {
  const uaPublic = unb64url(p256dh), auth = unb64url(authSecret);
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));
  const ikm = (await hmac(await hmac(auth, shared), concat(enc.encode("WebPush: info\0"), uaPublic, asPublic, new Uint8Array([1])))).slice(0, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, concat(payload, new Uint8Array([2]))));
  const header = new Uint8Array(21); header.set(salt); new DataView(header.buffer).setUint32(16, 4096); header[20] = asPublic.length;
  return concat(header, asPublic, sealed);
}

async function sendOne(sub: { endpoint: string; p256dh: string; auth: string }, payload: Uint8Array, keys: { public: string; private: JsonWebKey }) {
  const response = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidHeader(sub.endpoint, keys),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "high",
    },
    body: await encrypt(payload, sub.p256dh, sub.auth),
  });
  return response.status;
}

let keysCache: { public: string; private: JsonWebKey } | null = null;
async function getKeys(create: boolean) {
  if (keysCache) return keysCache;
  const saved = await rpc("push_keys");
  if (saved?.public) return (keysCache = saved);
  if (!create) return null;
  const made = await makeKeys();
  const kept = await rpc("push_save_keys", { p_public: made.public, p_private: made.private, p_function_url: `${SUPABASE_URL}/functions/v1/avilonx-push` });
  // Another call may have saved keys first: use whatever the database kept.
  return kept === made.public ? (keysCache = made) : (keysCache = await rpc("push_keys"));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return reply({ ok: false, message: "Use POST." }, 405);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  try {
    if (body.action === "keys") return reply({ ok: true, public: (await getKeys(true))!.public });
    const id = Number(body.outbox_id);
    if (!Number.isInteger(id) || id <= 0) return reply({ ok: false, message: "outbox_id missing" }, 400);
    const queued = await rpc("push_take", { p_id: id });
    if (!queued) return reply({ ok: true, skipped: true });
    const keys = await getKeys(true);
    const payload = enc.encode(JSON.stringify({ title: queued.title, body: queued.body, url: queued.url ? `${SITE_URL}/${queued.url}` : SITE_URL, tag: queued.tag }));
    const gone: string[] = []; const failed: string[] = [];
    await Promise.all((queued.subscriptions ?? []).map(async (sub: { endpoint: string; p256dh: string; auth: string }) => {
      try {
        const status = await sendOne(sub, payload, keys!);
        if (status === 404 || status === 410) gone.push(sub.endpoint);
        else if (status >= 400) failed.push(String(status));
      } catch (error) { failed.push(String((error as Error)?.message ?? error)); }
    }));
    await rpc("push_done", { p_id: id, p_error: failed.length ? `Push service: ${failed.join(", ")}` : null, p_gone: gone });
    return reply({ ok: true, sent: (queued.subscriptions ?? []).length - gone.length - failed.length, gone: gone.length, failed: failed.length });
  } catch (error) {
    console.error("push failed", error);
    return reply({ ok: false, message: "Push could not be sent." }, 502);
  }
});
