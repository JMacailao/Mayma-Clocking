import { supabase, escapeHTML, formatDate, number, tableRows, distanceKm, formatDateSeconds } from '../../assets/js/shared.js';

function publicResultsMarkup() {
 return `<div class="public-results-content"><form class="form-grid public-results-filter" data-public-results-form><label class="field"><span>Club</span><select name="club_id" required><option value="">Choose a club</option></select></label><label class="field"><span>Race date (Philippines)</span><input name="race_date" type="date" required></label><div class="form-actions"><button class="button primary" type="submit">Show results</button></div></form><div class="notice error public-results-error" data-public-results-error role="alert" hidden><span data-error-text></span><button class="text-button" type="button" data-retry-clubs>Try again</button></div><div class="public-results-toolbar" data-public-results-toolbar hidden><span data-public-results-count></span><label class="field"><span>Speed order</span><select data-speed-order><option value="desc">Fastest first</option><option value="asc">Slowest first</option></select></label></div><p class="small public-results-legend" data-public-results-legend hidden><strong>Rank</strong> by speed in each race. <strong>Provisional</strong>: clocked, not yet checked by the club at Show up. <strong>Open</strong>: the race is still on, so results can change; <strong>Closed · final</strong>: the race is over. <strong>DQ</strong>: disqualified, not brought to the club for Show up before the race closed (not ranked).</p><div data-public-results-table><div class="public-results-empty"><svg class="results-podium" viewBox="0 0 120 90" fill="none" aria-hidden="true"><path d="M60 6v8M44 14l4 5M76 14l-4 5M36 26h7M77 26h7" stroke="#8aa0b6" stroke-width="2.4" stroke-linecap="round"/><path d="m60 18 3.6 7.4 8.1 1.2-5.9 5.7 1.4 8.1L60 36.6l-7.2 3.8 1.4-8.1-5.9-5.7 8.1-1.2z" stroke="#f05a00" stroke-width="2.6" stroke-linejoin="round"/><path d="M47 48h26v30H47zM21 60h26v18H21zM73 60h26v18H73z" stroke="#00345f" stroke-width="3" stroke-linejoin="round"/><ellipse cx="60" cy="82" rx="46" ry="4" fill="#e3eaf1"/></svg><p>Choose a club and race date to view results.</p></div></div><p class="public-results-note">Clockings remain provisional until verified by the club.</p></div>`;
}
async function mountPublicResults(panel) {
 panel.innerHTML=publicResultsMarkup();
 const form=panel.querySelector('[data-public-results-form]'),clubSelect=form.elements.club_id,errorBox=panel.querySelector('[data-public-results-error]'),errorText=panel.querySelector('[data-error-text]'),retryButton=panel.querySelector('[data-retry-clubs]'),toolbar=panel.querySelector('[data-public-results-toolbar]'),count=panel.querySelector('[data-public-results-count]'),sortOrder=panel.querySelector('[data-speed-order]'),table=panel.querySelector('[data-public-results-table]');
 let rows=[];
 const setError=text=>{errorText.textContent=text;errorBox.hidden=!text;};
 const draw=()=>{
  const direction=sortOrder.value==='asc'?1:-1;
  const sorted=rows.slice().sort((a,b)=>{const byRace=String(a.race_name||'').localeCompare(String(b.race_name||''));if(byRace)return byRace;if(Boolean(a.disqualified)!==Boolean(b.disqualified))return a.disqualified?1:-1;const av=a.speed_m_per_min,bv=b.speed_m_per_min;if(av==null&&bv!=null)return 1;if(av!=null&&bv==null)return -1;if(av==null&&bv==null)return 0;return (Number(av)-Number(bv))*direction;});
  count.textContent=`${rows.length} result${rows.length===1?'':'s'}`;
  table.innerHTML=tableRows(sorted,[{key:'rank',label:'Rank',render:r=>r.rank?`<strong class="public-rank">${escapeHTML(String(r.rank))}</strong>`:'—'},{key:'race_name',label:'Race'},{key:'loft_name',label:'Loft'},{key:'distance_m',label:'Distance',render:r=>distanceKm(r.distance_m)},{key:'pigeon_ring',label:'Pigeon ring',render:r=>escapeHTML(r.pigeon_ring||'—')},{key:'barcode',label:'Code',render:r=>escapeHTML(r.barcode||'—')},{key:'arrival_at_utc',label:'Arrival · PH',render:r=>escapeHTML(formatDateSeconds(r.arrival_at_utc))},{key:'flight_seconds',label:'Flight',render:r=>escapeHTML(formatFlight(r.flight_seconds))},{key:'speed_m_per_min',label:`Speed · m/min ${direction<0?'↓':'↑'}`,render:r=>r.speed_m_per_min==null?'—':number(r.speed_m_per_min)},{key:'race_status',label:'Status',render:r=>r.disqualified?'<span class="tag rejected" title="Disqualified: not brought to the club for Show up before the race closed">DQ</span>':r.race_status==='closed'?'<span class="tag closed">Closed · final</span>':'<span class="tag">Open</span>'},{key:'verification',label:'Verified',render:r=>r.verification==='verified'?'<span class="tag verified">✓ Verified</span>':r.disqualified?'<span class="tag pending">Not verified</span>':'<span class="tag pending">Provisional</span>'}], 'No results were found for that club and date.',false)+resultCards(sorted);
 };
 const loadClubs=async()=>{
  retryButton.disabled=true;setError('');clubSelect.disabled=true;clubSelect.innerHTML='<option value="">Loading clubs…</option>';
  const {data,error}=await supabase.rpc('public_result_clubs');
  if(error){clubSelect.innerHTML='<option value="">Clubs unavailable</option>';setError('Public results are not configured yet. Ask the administrator to run public-results.sql in Supabase.');console.error('Could not load public result clubs:',error);retryButton.disabled=false;return;}
  clubSelect.innerHTML='<option value="">Choose a club</option>';
  (data||[]).forEach(club=>{const option=document.createElement('option');option.value=club.club_id;option.textContent=club.club_name;clubSelect.append(option);});
  clubSelect.disabled=false;retryButton.disabled=false;
  if(!data?.length)setError('No clubs are available yet.');
 };
 retryButton.onclick=loadClubs;
 sortOrder.onchange=draw;
 form.onsubmit=async event=>{
  event.preventDefault();const button=form.querySelector('[type="submit"]');button.disabled=true;button.textContent='Loading results…';setError('');rows=[];toolbar.hidden=true;table.innerHTML='<p class="public-results-empty">Loading results…</p>';
  const {data,error}=await supabase.rpc('public_race_results',{p_club_id:Number(clubSelect.value),p_race_date:form.elements.race_date.value});
  button.disabled=false;button.textContent='Show results';
  if(error){setError('Could not load these results. Check your connection and try again.');table.innerHTML='';toolbar.hidden=true;panel.querySelector('[data-public-results-legend]').hidden=true;console.error('Could not load public race results:',error);return;}
  rows=(data||[]).map(row=>({...row,speed_m_per_min:row.speed_m_per_min==null?null:Number(row.speed_m_per_min)}));sortOrder.value='desc';toolbar.hidden=false;panel.querySelector('[data-public-results-legend]').hidden=!rows.length;draw();
 };
 await loadClubs();
}
// Phones only (CSS swaps them for the table): one compact card per bird.
function resultCards(sorted) {
 if(!sorted.length)return '';
 const pill=r=>r.disqualified?'<span class="pc-pill is-dq" title="Disqualified: not brought to the club for Show up before the race closed">DQ</span>':r.verification==='verified'?'<span class="pc-pill is-ok">✓ Verified</span>':'<span class="pc-pill">Provisional</span>';
 return `<ul class="public-cards">${sorted.map(r=>`<li class="public-card${r.disqualified?' is-dq':''}"><div class="pc-head"><span class="pc-rank" aria-label="Rank">${r.rank?escapeHTML(String(r.rank)):'–'}</span><strong class="pc-loft">${escapeHTML(String(r.loft_name||'—').toUpperCase())}</strong></div><div class="pc-line pc-mono"><span>${escapeHTML(r.pigeon_ring||'—')}</span><span>${escapeHTML(formatDateSeconds(r.arrival_at_utc))}</span></div><div class="pc-line"><span>${escapeHTML(r.race_name||'—')}</span><span>${escapeHTML(distanceKm(r.distance_m))}</span><span>${escapeHTML(formatFlight(r.flight_seconds))}</span></div><div class="pc-line"><span class="pc-label">Speed</span><strong class="pc-mono">${r.speed_m_per_min==null?'—':`${escapeHTML(number(r.speed_m_per_min))} m/min`}</strong>${pill(r)}</div><div class="pc-line"><span class="pc-status${r.race_status==='closed'?' is-closed':''}">${r.disqualified?'Not ranked':r.race_status==='closed'?'Closed · final':'Open'}</span>${r.barcode?`<span class="pc-label">Code</span><span>${escapeHTML(r.barcode)}</span>`:''}</div></li>`).join('')}</ul>`;
}
function formatFlight(seconds) {
 if(seconds==null||!Number.isFinite(Number(seconds))||Number(seconds)<0)return '—';
 const total=Math.round(Number(seconds)),hours=Math.floor(total/3600),minutes=Math.floor((total%3600)/60),remainder=total%60;
 return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(remainder).padStart(2,'0')}`;
}
export { mountPublicResults };
