// My coordinates (club admin and members): the phone's GPS position in
// degrees, minutes and seconds (seconds with 2 decimals), to copy or check on
// a map. Nothing is saved.
import { escapeHTML } from './shared.js';

// 12.879519, 'latitude' → { hemisphere: 'N', degrees: 12, minutes: 52, seconds: '46.27' }
export function dmsParts(value, axis) {
  const decimal = Number(value);
  if (value === null || value === undefined || String(value).trim() === '' || !Number.isFinite(decimal)) return null;
  const total = Math.round(Math.abs(decimal) * 3600 * 100) / 100;
  const degrees = Math.floor(total / 3600), minutes = Math.floor((total - degrees * 3600) / 60), seconds = (total - degrees * 3600 - minutes * 60).toFixed(2);
  return { hemisphere: axis === 'latitude' ? (decimal < 0 ? 'S' : 'N') : (decimal < 0 ? 'W' : 'E'), degrees, minutes, seconds };
}
// 12.879519, 'latitude' → N 12°52'46.27
export function dmsText(value, axis) {
  const p = dmsParts(value, axis);
  return p ? `${p.hemisphere} ${p.degrees}°${String(p.minutes).padStart(2, '0')}'${p.seconds.padStart(5, '0')}` : '—';
}

export function render(view) {
  view.innerHTML = `<div class="split-heading"><div><h2>My coordinates</h2><p>Stand where you want the location (for example at your loft), then press the button. Your phone's GPS is used.</p></div></div>
  <section class="panel my-coords">
    <button class="button primary my-coords-get" type="button" data-get-coords>Get my coordinates</button>
    <p class="my-coords-status" data-coords-status role="status"></p>
    <div class="my-coords-result" data-coords-result hidden>
      <dl class="my-coords-values"><div><dt>Latitude</dt><dd data-coords-lat></dd></div><div><dt>Longitude</dt><dd data-coords-lng></dd></div></dl>
      <p class="small my-coords-extra" data-coords-extra></p>
      <div class="form-actions"><button class="button secondary" type="button" data-copy-coords>Copy</button><a class="button secondary" data-map-coords target="_blank" rel="noopener">Open in Google Maps</a></div>
    </div>
  </section>`;
  const button = view.querySelector('[data-get-coords]'), status = view.querySelector('[data-coords-status]'), result = view.querySelector('[data-coords-result]');
  let text = '';
  const say = (message, kind = '') => { status.textContent = message; status.className = `my-coords-status${kind ? ` is-${kind}` : ''}`; };
  button.onclick = () => {
    if (!('geolocation' in navigator)) { say('This browser cannot read the location. Use Chrome or Safari on your phone.', 'error'); return; }
    if (!window.isSecureContext) { say('The location works only on a secure (https://) address.', 'error'); return; }
    button.disabled = true; say('Getting your location… keep the phone still, outdoors if you can.');
    navigator.geolocation.getCurrentPosition(position => {
      const { latitude, longitude, accuracy } = position.coords;
      const lat = dmsText(latitude, 'latitude'), lng = dmsText(longitude, 'longitude');
      text = `${lat}  ${lng}`;
      view.querySelector('[data-coords-lat]').textContent = lat;
      view.querySelector('[data-coords-lng]').textContent = lng;
      view.querySelector('[data-coords-extra]').innerHTML = `Decimal: ${escapeHTML(latitude.toFixed(6))}, ${escapeHTML(longitude.toFixed(6))}${Number.isFinite(accuracy) ? ` · accurate to about ${escapeHTML(String(Math.round(accuracy)))} m` : ''}`;
      view.querySelector('[data-map-coords]').href = `https://www.google.com/maps?q=${latitude.toFixed(7)},${longitude.toFixed(7)}`;
      result.hidden = false; button.disabled = false; button.textContent = 'Get my coordinates again';
      say(accuracy > 50 ? 'Done. The phone is not very sure of the spot: go outdoors and try again for a better reading.' : 'Done.', accuracy > 50 ? 'warn' : 'ok');
    }, error => {
      button.disabled = false;
      say(error.code === 1 ? 'Location is blocked. Allow location for AvilonX in your phone or browser settings, then try again.'
        : error.code === 3 ? 'The phone took too long to find its location. Go outdoors, turn on Location (GPS) and try again.'
          : 'Could not get your location. Turn on Location (GPS) and try again.', 'error');
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  };
  view.querySelector('[data-copy-coords]').onclick = async () => {
    try { await navigator.clipboard.writeText(text); say('Copied.', 'ok'); } catch { say(`Copy this: ${text}`, ''); }
  };
}
