// AvilonX Clocking: Telegram bot for loft reader owners (Supabase Edge Function).
//
// Deploy as "avilonx-telegram" with JWT verification OFF (Telegram cannot send
// a Supabase login). Secrets (Edge Functions → Secrets):
//   TELEGRAM_BOT_TOKEN       from @BotFather
//   AVILONX_TELEGRAM_SECRET  shown on Super Admin → Telegram bot
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
//
// It answers three kinds of request:
//   GET  ?setup=<secret>        connects the bot to this function (once)
//   POST from Telegram          /start <code> connects a member, /stop disconnects
//   POST from the database      { outbox_id } sends that message
const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const SECRET = Deno.env.get("AVILONX_TELEGRAM_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const reply = (body: unknown, status = 200) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": typeof body === "string" ? "text/plain" : "application/json" } });

async function rpc(name: string, args: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error(`${name}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

async function telegram(method: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return response.json();
}

Deno.serve(async (request) => {
  if (!TOKEN || !SECRET) return reply("Set TELEGRAM_BOT_TOKEN and AVILONX_TELEGRAM_SECRET in Edge Functions → Secrets.", 500);
  const url = new URL(request.url);

  // Once, from the Super Admin's link: tell Telegram to send messages here.
  if (request.method === "GET") {
    if (url.searchParams.get("setup") !== SECRET) return reply("AvilonX Telegram bot is running.");
    const here = `${url.origin}${url.pathname}`;
    const result = await telegram("setWebhook", { url: here, secret_token: SECRET, allowed_updates: ["message"] });
    return reply(result.ok ? "Connected: the bot now answers /start and /stop. You can close this page." : `Telegram said: ${result.description}`, result.ok ? 200 : 400);
  }
  if (request.method !== "POST") return reply("Method not allowed", 405);

  // From Telegram (it sends the secret in this header).
  const telegramSecret = request.headers.get("x-telegram-bot-api-secret-token");
  if (telegramSecret !== null) {
    if (telegramSecret !== SECRET) return reply("Forbidden", 403);
    const update = await request.json();
    const message = update?.message;
    const chatId = message?.chat?.id;
    const text = String(message?.text ?? "").trim();
    if (!chatId) return reply({ ok: true });
    try {
      if (text.startsWith("/start")) {
        const code = text.split(/\s+/)[1] ?? "";
        const linked = code ? await rpc("telegram_link_by_code", { p_code: code, p_chat_id: chatId }) : null;
        await telegram("sendMessage", {
          chat_id: chatId,
          text: linked?.ok
            ? `Connected ✅ ${linked.member}\n\nYou will get a message here each time one of your pigeons is clocked. Send /stop to turn it off.`
            : "To connect, open AvilonX → Settings → Telegram and press Connect Telegram (the link works for 30 minutes).",
        });
      } else if (text.startsWith("/stop")) {
        const count = await rpc("telegram_unlink_chat", { p_chat_id: chatId });
        await telegram("sendMessage", { chat_id: chatId, text: count ? "Stopped: no more AvilonX messages here. Connect again from AvilonX → Settings." : "This chat is not connected to AvilonX." });
      } else {
        await telegram("sendMessage", { chat_id: chatId, text: "This bot sends AvilonX clocking results. Connect from AvilonX → Settings → Telegram. Send /stop to turn it off." });
      }
    } catch (error) {
      console.error(error);
    }
    return reply({ ok: true });
  }

  // From the database: send one queued message.
  if (request.headers.get("authorization") !== `Bearer ${SECRET}`) return reply("Forbidden", 403);
  const { outbox_id } = await request.json().catch(() => ({}));
  if (!outbox_id) return reply("outbox_id missing", 400);
  const queued = await rpc("telegram_take_message", { p_id: outbox_id });
  if (!queued?.chat_id) return reply({ ok: true, skipped: true });
  const sent = await telegram("sendMessage", { chat_id: queued.chat_id, text: queued.text });
  await rpc("telegram_mark_sent", { p_id: outbox_id, p_error: sent.ok ? null : String(sent.description ?? "Telegram refused the message") });
  return reply({ ok: Boolean(sent.ok) });
});
