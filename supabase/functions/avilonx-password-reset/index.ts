// AvilonX Clocking: forgot password and email confirmation emails (Supabase
// Edge Function). Setup: docs/PASSWORD-RESET.md.
//
// Deploy as "avilonx-password-reset" with JWT verification OFF (visitors who
// forgot their password are not signed in). Secrets (Edge Functions → Secrets):
//   RESEND_API_KEY   from resend.com (Sending access, domain avilonx.site)
//   RESET_FROM       e.g. AvilonX <noreply@avilonx.site>
//   SITE_URL         optional, default https://www.avilonx.site
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
//
// POST { action: "reset", username }      from the login page (anyone). The
//   answer is always { ok: true }, so it never tells whether a username exists.
// POST { action: "confirm", member_id }   from Members or Settings, signed in
//   (the member, or the club's administrator or staff): sends the link that
//   confirms the member's email.
// The links are made by the database (password-reset.sql), which also limits
// them to 3 of each kind per member per day.
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("RESET_FROM") ?? "AvilonX <noreply@avilonx.site>";
const SITE = (Deno.env.get("SITE_URL") ?? "https://www.avilonx.site").replace(/\/+$/, "");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const escapeHTML = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

async function rpc(name: string, args: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message ?? `${name}: ${response.status}`);
  return data;
}

// The signed-in account that called, from its Supabase access token.
async function caller(request: Request): Promise<string | null> {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  return (await response.json())?.id ?? null;
}

function emailHtml(title: string, lines: string[], button: string, link: string, foot: string) {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f6f9;font-family:Arial,Helvetica,sans-serif;color:#1e293b">
<table role="presentation" width="100%" style="max-width:480px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px"><tr><td style="padding:28px">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;color:#64748b">AVILONX RACE CLOCKING</p>
<h1 style="margin:0 0 16px;font-size:20px">${escapeHTML(title)}</h1>
${lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">${l}</p>`).join("")}
<p style="margin:20px 0"><a href="${link}" style="display:inline-block;padding:12px 22px;background:#00345f;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">${escapeHTML(button)}</a></p>
<p style="margin:0 0 12px;font-size:13px;color:#64748b;line-height:1.5">${foot}</p>
<p style="margin:0;font-size:12px;color:#94a3b8;word-break:break-all">${link}</p>
</td></tr></table></body></html>`;
}

async function send(to: string, subject: string, html: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (!response.ok) throw new Error(`Resend: ${response.status} ${await response.text()}`);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  if (!RESEND_KEY || !SERVICE_KEY) return reply({ error: "Password reset email is not set up yet (RESEND_API_KEY)." }, 503);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return reply({ error: "Bad request" }, 400); }

  if (body.action === "reset") {
    const username = String(body.username ?? "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username)) return reply({ ok: true });
    try {
      const link = await rpc("password_reset_issue", { p_username: username });
      if (link?.token) {
        const url = `${SITE}/pages/reset-password/index.html?reset=${link.token}`;
        await send(link.email, "Reset your AvilonX password", emailHtml("Reset your password", [
          `Hi ${escapeHTML(String(link.name ?? ""))},`,
          `Someone asked to reset the password of your AvilonX member account <strong>${escapeHTML(String(link.username))}</strong>. Tap the button to choose a new password.`,
        ], "Choose a new password", url, "The link works once, for 1 hour. If you did not ask for this, ignore this email: your password stays the same."));
      }
    } catch (error) {
      console.error(error);
    }
    return reply({ ok: true });
  }

  if (body.action === "confirm") {
    const userId = await caller(request);
    if (!userId) return reply({ error: "Sign in first." }, 401);
    try {
      const link = await rpc("email_confirm_issue", { p_user_id: userId, p_member_id: Number(body.member_id) });
      if (link?.confirmed) return reply({ ok: true, confirmed: true, email: link.email });
      const url = `${SITE}/pages/reset-password/index.html?confirm=${link.token}`;
      await send(link.email, "Confirm your email for AvilonX", emailHtml("Confirm your email", [
        `Hi ${escapeHTML(String(link.name ?? ""))},`,
        "This email was added to your AvilonX member account for password resets. Tap the button to confirm it.",
      ], "Confirm my email", url, "The link works for 3 days. If you don't know AvilonX, ignore this email."));
      return reply({ ok: true, sent: true, email: link.email });
    } catch (error) {
      console.error(error);
      return reply({ error: error instanceof Error ? error.message : "Could not send the email." }, 400);
    }
  }

  return reply({ error: "Unknown action" }, 400);
});
