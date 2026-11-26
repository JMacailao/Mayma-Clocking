// Sends errors that break a page to the database (error-log.sql), so the Super
// Admin sees them on Club accounts → App errors. Only the error message, where
// it happened, the page and the browser are sent; never form contents.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const MAX_PER_PAGE = 10;
let sent = 0;
const seen = new Set();

function accessToken() {
  try {
    const key = Object.keys(localStorage).find(name => /^sb-.*-auth-token$/.test(name));
    return key ? JSON.parse(localStorage.getItem(key))?.access_token || null : null;
  } catch { return null; }
}

export function reportError(message, source = '') {
  message = String(message || '').slice(0, 500);
  // "Script error." comes from other sites' scripts (extensions, ads): nothing to learn from it.
  if (!message || /^Script error\.?$/i.test(message) || /ResizeObserver loop/.test(message) || sent >= MAX_PER_PAGE || seen.has(message)) return;
  seen.add(message); sent++;
  const page = location.pathname.replace(/^.*?(pages\/|index\.html|$)/, '$1') || 'index.html';
  const token = accessToken() || SUPABASE_KEY;
  fetch(`${SUPABASE_URL}/rest/v1/rpc/log_client_error`, {
    method: 'POST', keepalive: true,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_message: message, p_source: String(source || '').slice(0, 300), p_page: page.slice(0, 200), p_user_agent: navigator.userAgent.slice(0, 300), p_app_version: document.documentElement.dataset.appVersion || '' }),
  }).catch(() => {});
}

if (!window.__avilonxErrors) {
  window.__avilonxErrors = true;
  window.addEventListener('error', event => {
    if (event.target && event.target !== window) return; // a missing image or script file
    reportError(event.message, event.filename ? `${event.filename.split('/').slice(-2).join('/')}:${event.lineno}:${event.colno}` : '');
  });
  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason;
    // Network drops are expected on phones in the field.
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(String(reason?.message || reason))) return;
    reportError(reason?.message || String(reason), (reason?.stack || '').split('\n')[1]?.trim() || '');
  });
}
