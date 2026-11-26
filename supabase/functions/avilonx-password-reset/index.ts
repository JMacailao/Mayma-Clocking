// AvilonX Clocking: "Forgot password?" by email, sent from a Gmail account
// (Supabase Edge Function).
//
// Deploy as "avilonx-password-reset" with JWT verification OFF (people who
// forgot their password are not signed in). Secrets (Edge Functions → Secrets):
//   GMAIL_USER          the Gmail address that sends, e.g. avilonx.noreply@gmail.com
//   GMAIL_APP_PASSWORD  an App Password of that Google account (16 letters)
//   SITE_URL            optional, default https://www.avilonx.site
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
//
//   POST { action: "request", username }        emails a one-time link (30 minutes)
//   POST { action: "reset", token, password }   sets the new password
// The request answer is the same whether or not the username exists.
import nodemailer from "npm:nodemailer@6.9.16";

const GMAIL_USER = Deno.env.get("GMAIL_USER") ?? "";
const GMAIL_APP_PASSWORD = (Deno.env.get("GMAIL_APP_PASSWORD") ?? "").replace(/\s+/g, "");
const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://www.avilonx.site").replace(/\/+$/, "");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function rpc(name: string, args: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error(`${name}: ${response.status} ${await response.text()}`);
  return response.json();
}

const mailer = () => nodemailer.createTransport({
  host: "smtp.gmail.com", port: 465, secure: true,
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
});

async function sendLink(email: string, username: string, token: string) {
  const link = `${SITE_URL}/pages/login/index.html?reset=${encodeURIComponent(token)}`;
  await mailer().sendMail({
    from: `AvilonX <${GMAIL_USER}>`,
    to: email,
    subject: "Reset your AvilonX password",
    text: `Hello ${username},\n\nTo set a new AvilonX password, open this link (valid for 30 minutes, once):\n${link}\n\nYour username stays ${username}. If you did not ask for this, ignore this email.`,
    html: `<p>Hello ${username},</p><p>To set a new AvilonX password, open this link (valid for 30 minutes, once):</p><p><a href="${link}">Set a new password</a></p><p>Your username stays <strong>${username}</strong>. If you did not ask for this, ignore this email.</p>`,
  });
}

const SENT = { ok: true, message: "If this account has a recovery email, a reset link is on its way. No email? Ask your club administrator." };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return reply({ ok: false, message: "Use POST." }, 405);
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return reply({ ok: false, message: "Password reset by email is not set up yet. Ask your club administrator." }, 503);
  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { return reply({ ok: false, message: "Bad request." }, 400); }

  if (body.action === "request") {
    const username = String(body.username ?? "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username)) return reply(SENT);
    try {
      const reset = await rpc("_password_reset_start", { p_username: username });
      if (reset?.email && reset?.token) await sendLink(reset.email, reset.username ?? username, reset.token);
    } catch (error) {
      console.error("password reset request failed", error);
      return reply({ ok: false, message: "The email could not be sent. Try again later or ask your club administrator." }, 502);
    }
    return reply(SENT);
  }

  if (body.action === "reset") {
    const token = String(body.token ?? ""), password = String(body.password ?? "");
    if (!/^[0-9a-f]{64}$/.test(token)) return reply({ ok: false, message: "This link is not valid. Ask for a new one." }, 400);
    try {
      const result = await rpc("_password_reset_finish", { p_token: token, p_password: password });
      return reply(result, result?.ok ? 200 : 400);
    } catch (error) {
      console.error("password reset failed", error);
      return reply({ ok: false, message: "The password could not be changed. Try again." }, 502);
    }
  }

  return reply({ ok: false, message: "Unknown action." }, 400);
});
