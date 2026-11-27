// Signs out after 15 minutes without any action (tap, click, typing, scroll),
// for admins, members and the Super Admin. One timer for all open tabs: the
// last action is kept in localStorage. A minute before, a notice offers to
// stay signed in. The race-day Big screen (a TV that nobody touches) keeps
// the session.
export const IDLE_MINUTES = 15;
const KEY = 'avilonx.lastActivity', WARN_MS = 60_000;

const read = () => { try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; } };
export function markActive(at = Date.now()) { try { localStorage.setItem(KEY, String(at)); } catch { /* storage unavailable */ } }
export function forgetActivity() { try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ } }

// Milliseconds without action, counting every tab (and this one's own last action).
export const idleFor = (local, now = Date.now()) => now - Math.max(local || 0, read());

export function watchIdle(onTimeout, { minutes = IDLE_MINUTES } = {}) {
  const limit = minutes * 60_000;
  let local = Date.now(), lastWrite = 0, notice = null, done = false;
  // Coming back to an old session (closed the app, came back later): sign out now.
  if (read() && idleFor(0) >= limit) { done = true; forgetActivity(); onTimeout(); return () => {}; }
  markActive(local);
  const active = () => {
    local = Date.now();
    if (local - lastWrite > 10_000) { lastWrite = local; markActive(local); }
    if (notice) { notice.remove(); notice = null; }
  };
  const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'];
  events.forEach(name => addEventListener(name, active, { passive: true, capture: true }));
  const showNotice = left => {
    if (!notice) {
      notice = document.createElement('div');
      notice.className = 'idle-notice'; notice.setAttribute('role', 'alertdialog'); notice.setAttribute('aria-live', 'assertive');
      notice.innerHTML = '<p><strong>Still there?</strong> <span data-idle-left></span></p><button class="button primary" type="button">Stay signed in</button>';
      notice.querySelector('button').onclick = active;
      // Inside an open pop-up when there is one (the rest of the page cannot be clicked then).
      ([...document.querySelectorAll('dialog[open]')].find(dialog => dialog.matches(':modal')) || document.body).append(notice);
    }
    notice.querySelector('[data-idle-left]').textContent = `For your security you will be signed out in ${Math.max(1, Math.ceil(left / 1000))} seconds.`;
  };
  const check = () => {
    if (done) return;
    if (document.body.classList.contains('raceday-tv-on')) { active(); return; }
    const idle = idleFor(local), left = limit - idle;
    if (left <= 0) {
      done = true; clearInterval(timer); events.forEach(name => removeEventListener(name, active, { capture: true }));
      notice?.remove(); forgetActivity(); onTimeout(); return;
    }
    if (left <= WARN_MS) showNotice(left); else if (notice) { notice.remove(); notice = null; }
  };
  const timer = setInterval(check, 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  return () => { done = true; clearInterval(timer); events.forEach(name => removeEventListener(name, active, { capture: true })); notice?.remove(); };
}
