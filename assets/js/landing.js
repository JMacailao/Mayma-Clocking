import './error-report.js';
// Landing page (index.html): the winding "How it works" line, today's races,
// the demo video, the club request form and the English / Tagalog switch.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const rpc = async (name, args = {}) => {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || `Request failed (${response.status})`);
  return data;
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---- English / Tagalog (same choice as inside the app) --------------------------------
const KEY = 'avilonx.lang';
const getLang = () => { try { return localStorage.getItem(KEY) === 'tl' ? 'tl' : 'en'; } catch { return 'en'; } };
const TL = {
  'How it works': 'Paano gumagana', 'Features': 'Mga feature', 'Android app': 'Android app', 'Contact': 'Kontak', 'Sign in': 'Mag-sign in',
  'Pigeon racing club system': 'Sistema para sa pigeon racing club',
  'Every race,': 'Bawat karera,', 'accounted for.': 'may tamang talaan.',
  'Schedule races, register birds, clock arrivals by RFID, NFC or sticker, and publish results. One system for the club team and every member, timed by the server.':
    'Mag-iskedyul ng karera, magrehistro ng ibon, mag-clock ng dating gamit ang RFID, NFC o sticker, at maglabas ng resulta. Iisang sistema para sa club at bawat miyembro, oras mula sa server.',
  'Sign in to the clocking app': 'Mag-sign in sa clocking app', 'See public race results': 'Tingnan ang resulta ng karera',
  'Server time': 'Oras ng server', 'No phone clock tricks': 'Walang daya sa oras ng telepono', '3 ways': '3 paraan', 'RFID, NFC, sticker': 'RFID, NFC, sticker', 'Live': 'Live', 'Race day board': 'Board sa araw ng karera',
  'Racing today': 'May karera ngayon', 'All public results →': 'Lahat ng resulta →',
  'From schedule to results, step by step': 'Mula iskedyul hanggang resulta, hakbang-hakbang', 'Follow one race through AvilonX.': 'Sundan ang isang karera sa AvilonX.',
  'Schedule the race': 'I-iskedyul ang karera',
  'Pick the release point, release time, open and end dates. Distances to every loft are worked out from GPS coordinates.': 'Piliin ang release point, oras ng release, at petsa ng bukas at sara. Kinukuwenta ang layo sa bawat loft mula sa GPS.',
  'Register the birds': 'Irehistro ang mga ibon',
  'Enter each pigeon with its RFID tag or race sticker. Only bonded birds can be entered, so every entry belongs to the right member.': 'Ilagay ang bawat kalapati kasama ang RFID tag o sticker. Mga na-bond na ibon lang ang puwede, kaya tama ang may-ari ng bawat entry.',
  'Release and forecast': 'Release at forecast',
  'Once the birds are released, members see a speed forecast: when a bird flying 1,200 m/min should be home.': 'Pagka-release, makikita ng miyembro ang forecast: kailan dapat dumating ang ibong lumilipad nang 1,200 m/min.',
  'Clock the arrival': 'I-clock ang dating',
  "The loft RFID reader, an Android phone with NFC, or the sticker scratch code. Each clocking gets the server's time, not the phone's.": 'RFID reader sa loft, Android phone na may NFC, o scratch code ng sticker. Oras ng server ang itinatala, hindi ng telepono.',
  'Follow race day live': 'Subaybayan nang live ang karera',
  'Arrivals, speeds and loft reader status update as they happen. Put it on the big screen at the club.': 'Agad lumalabas ang mga dating, bilis at status ng reader. Ipakita sa malaking screen sa club.',
  'Verify show up': 'I-verify ang show up',
  'Members bring clocked birds to the club. Tap the tag to verify; birds not shown before the race closes are disqualified.': 'Dinadala ng miyembro ang na-clock na ibon sa club. I-tap ang tag para i-verify; diskwalipikado ang hindi naipakita bago magsara ang karera.',
  'Publish the results': 'Ilabas ang resulta',
  'Ranked by speed, exported to Excel or PDF, and open to the public by club and race date.': 'Nakaayos ayon sa bilis, puwedeng i-export sa Excel o PDF, at bukas sa publiko ayon sa club at petsa.',
  'See it in action': 'Panoorin', 'Clock a pigeon in 10 seconds': 'Mag-clock ng kalapati sa 10 segundo',
  'Choose the race, type or scan the sticker code, submit. The server records the time and the receipt shows the flight time and speed at once.': 'Piliin ang karera, i-type o i-scan ang code ng sticker, i-submit. Itinatala ng server ang oras at agad lumalabas sa resibo ang tagal ng lipad at bilis.',
  'Same steps on any phone': 'Parehong hakbang sa kahit anong telepono', 'Loft readers and NFC clock with no typing at all': 'Sa loft reader at NFC, walang kailangang i-type',
  'Results are provisional until the club verifies them': 'Pansamantala ang resulta hanggang ma-verify ng club', 'Pause': 'I-pause', 'Play': 'I-play',
  'Everything a racing club needs': 'Lahat ng kailangan ng racing club',
  'Server-timed clocking': 'Clocking na may oras ng server', 'Every clocking is stamped by the server, so results are fair.': 'Bawat clocking ay may oras mula sa server, kaya patas ang resulta.',
  'RFID and NFC': 'RFID at NFC', "Wi-Fi and USB loft readers, or an Android phone's NFC.": 'Wi-Fi at USB na reader sa loft, o NFC ng Android phone.',
  'Stickers and Eclock': 'Sticker at Eclock', 'Scratch codes for clubs without readers.': 'Scratch code para sa club na walang reader.',
  'Live race day': 'Live na araw ng karera', 'Arrivals and speeds the moment birds are clocked.': 'Dating at bilis sa sandaling ma-clock ang ibon.',
  'Show up checks': 'Show up', 'Verify clocked birds at the club before the race closes.': 'I-verify sa club ang na-clock na ibon bago magsara ang karera.',
  'Excel and PDF': 'Excel at PDF', 'Export entries, race day and results in one click.': 'I-export ang entry, karera at resulta sa isang click.',
  'Members and team': 'Miyembro at team', 'Accounts for admins, staff and members, with change history.': 'Account para sa admin, staff at miyembro, may kasaysayan ng pagbabago.',
  'Many clubs': 'Maraming club', 'Each club has its own data, members and logo.': 'Bawat club ay may sariling datos, miyembro at logo.',
  'Clock from the loft with your phone': 'Mag-clock mula sa loft gamit ang telepono',
  'Install AvilonX on Android to clock with NFC, see your history and check results. On other phones, open the site and add it to your home screen.': 'I-install ang AvilonX sa Android para mag-clock gamit ang NFC, makita ang kasaysayan at resulta. Sa ibang telepono, buksan ang site at idagdag sa home screen.',
  'Download for Android': 'I-download para sa Android', 'Open in the browser': 'Buksan sa browser',
  'For clubs': 'Para sa mga club', 'Get AvilonX for your club': 'Kunin ang AvilonX para sa club mo',
  'Tell us about your club. We will contact you to set up your club account, members and race points.': 'Sabihin sa amin ang tungkol sa club mo. Kokontakin ka namin para i-set up ang account, mga miyembro at race point.',
  'Your own club account and logo': 'Sariling account at logo ng club', 'Help setting up members and lofts': 'Tulong sa pag-set up ng miyembro at loft', 'Works with stickers even without readers': 'Gumagana sa sticker kahit walang reader',
  'Your name': 'Pangalan mo', 'Club name': 'Pangalan ng club', 'Mobile number': 'Numero ng mobile', 'Email (optional)': 'Email (opsyonal)', 'Message (optional)': 'Mensahe (opsyonal)',
  'How many members, where you race…': 'Ilang miyembro, saan kayo nagkakarera…', 'Send request': 'Ipadala',
  '© AvilonX Clocking': '© AvilonX Clocking', 'Server timestamp · Provisional results until reviewed': 'Oras mula sa server · Pansamantala ang resulta hangga\'t hindi nasusuri',
  'clocked': 'na-clock', 'entries': 'entry', 'best m/min': 'pinakamabilis m/min', 'Released': 'Na-release', 'Practice': 'Practice',
  'Request sent. We will contact you soon.': 'Naipadala. Kokontakin ka namin sa lalong madaling panahon.', 'Sending…': 'Ipinapadala…',
  'Enter your name and your club\'s name.': 'Ilagay ang pangalan mo at ng club.', 'Enter a mobile number or an email so we can reach you.': 'Maglagay ng numero o email para makontak ka namin.',
};
const tl = text => (getLang() === 'tl' && Object.hasOwn(TL, text) ? TL[text] : text);
function translate(root) {
  if (getLang() !== 'tl') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue.trim();
    if (text && Object.hasOwn(TL, text) && !node.parentElement.closest('[data-no-translate],script,style')) node.nodeValue = node.nodeValue.replace(text, TL[text]);
  }
  root.querySelectorAll('[placeholder]').forEach(el => { const v = el.getAttribute('placeholder'); if (Object.hasOwn(TL, v)) el.setAttribute('placeholder', TL[v]); });
}
document.documentElement.lang = getLang() === 'tl' ? 'tl' : 'en';
translate(document.body);
document.querySelectorAll('.lp-lang [data-lang]').forEach(button => {
  button.setAttribute('aria-pressed', String(button.dataset.lang === getLang()));
  button.addEventListener('click', () => {
    if (button.dataset.lang === getLang()) return;
    try { localStorage.setItem(KEY, button.dataset.lang); } catch { /* storage unavailable */ }
    location.reload();
  });
});

// ---- How it works: the winding line through the step dots ---------------------------
const snake = document.querySelector('[data-snake]');
if (snake) {
  const svg = snake.querySelector('svg');
  const paths = svg.querySelectorAll('path');
  const draw = () => {
    const box = snake.getBoundingClientRect();
    const dots = [...snake.querySelectorAll('.lp-dot')].map(dot => {
      const r = dot.getBoundingClientRect();
      return [r.left + r.width / 2 - box.left, r.top + r.height / 2 - box.top];
    });
    if (dots.length < 2) return;
    // Each segment swings out to one side, alternating, so the line winds like a snake.
    const swing = Math.min(70, box.width * 0.06);
    let d = `M${dots[0][0]} ${dots[0][1]}`;
    for (let i = 1; i < dots.length; i++) {
      const [x0, y0] = dots[i - 1], [x1, y1] = dots[i];
      const side = i % 2 ? 1 : -1, bend = (y1 - y0) * 0.45;
      d += ` C${x0 + side * swing} ${y0 + bend} ${x1 + side * swing} ${y1 - bend} ${x1} ${y1}`;
    }
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    paths.forEach(path => path.setAttribute('d', d));
  };
  new ResizeObserver(draw).observe(snake);
  draw();
}

// ---- Racing today ---------------------------------------------------------------------
const today = document.querySelector('[data-today]');
if (today) {
  rpc('public_races_today').then(races => {
    if (!Array.isArray(races) || !races.length) return;
    const time = value => new Date(`${String(value).replace(' ', 'T')}Z`).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
    today.querySelector('[data-today-list]').innerHTML = races.map(r => `<li>
      <strong>${esc(r.race_name)}${r.is_practice ? ` <span class="tag">${esc(tl('Practice'))}</span>` : ''}</strong>
      <span class="small">${esc(r.club_name)} · ${esc(r.release_location)} · ${esc(tl('Released'))} ${esc(time(r.release_at_utc))}</span>
      <div class="lp-today-stats"><span><b>${Number(r.clocked)}/${Number(r.entries)}</b>${esc(tl('clocked'))}</span><span><b>${r.best_speed == null ? '—' : Number(r.best_speed).toLocaleString('en-PH', { maximumFractionDigits: 3 })}</b>${esc(tl('best m/min'))}</span></div>
    </li>`).join('');
    today.hidden = false;
  }).catch(error => console.warn('Racing today unavailable:', error));
}

// ---- Demo video: plays while on screen (not with reduced motion); can be paused -------
const video = document.querySelector('[data-demo]'), toggle = document.querySelector('[data-demo-toggle]');
if (video && toggle) {
  let userPaused = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sync = () => { const label = video.paused ? 'Play' : 'Pause'; toggle.textContent = tl(label); toggle.setAttribute('aria-label', `${tl(label)} demo`); };
  video.addEventListener('play', sync); video.addEventListener('pause', sync); sync();
  toggle.addEventListener('click', () => { userPaused = !video.paused; if (video.paused) video.play().catch(() => {}); else video.pause(); });
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !userPaused) video.play().catch(() => {});
    else if (!entry.isIntersecting) video.pause();
  }, { threshold: 0.4 }).observe(video);
}

// ---- Get AvilonX for your club --------------------------------------------------------
const form = document.querySelector('[data-contact-form]');
if (form) {
  const status = form.querySelector('[data-contact-status]');
  const say = (text, kind) => { status.textContent = tl(text); status.className = `lp-form-status${kind ? ` is-${kind}` : ''}`; };
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const f = form.elements, value = name => f[name].value.trim();
    if (value('contact_name').length < 2 || value('club_name').length < 2) { say("Enter your name and your club's name.", 'error'); (value('contact_name').length < 2 ? f.contact_name : f.club_name).focus(); return; }
    if (value('phone').replace(/\D/g, '').length < 7 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value('email'))) { say('Enter a mobile number or an email so we can reach you.', 'error'); f.phone.focus(); return; }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true; say('Sending…');
    try {
      await rpc('submit_club_request', { p_contact_name: value('contact_name'), p_club_name: value('club_name'), p_phone: value('phone'), p_email: value('email'), p_message: value('message'), p_website: f.website.value });
      form.reset(); say('Request sent. We will contact you soon.', 'ok');
    } catch (error) {
      say(error.message, 'error');
    } finally { button.disabled = false; }
  });
}
