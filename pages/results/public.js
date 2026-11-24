import { supabase, escapeHTML, formatDate, number } from '../../assets/js/shared.js';

// Arrival time of day in Philippine time, to the second (the race date is chosen above).
const TIME_FORMAT=new Intl.DateTimeFormat('en-PH',{timeStyle:'medium',timeZone:'Asia/Manila'});

function publicResultsMarkup() {
 return `<div class="public-results-content"><form class="form-grid public-results-filter" data-public-results-form><label class="field"><span>Club</span><select name="club_id" required><option value="">Choose a club</option></select></label><label class="field"><span>Race date (Philippines)</span><input name="race_date" type="date" required></label><div class="form-actions"><button class="button primary" type="submit">Show results</button></div></form><div class="notice error public-results-error" data-public-results-error role="alert" hidden><span data-error-text></span><button class="text-button" type="button" data-retry-clubs>Try again</button></div><div class="public-results-toolbar" data-public-results-toolbar hidden><span data-public-results-count></span><label class="field"><span>Speed order</span><select data-speed-order aria-label="Speed order"><option value="desc">Fastest first</option><option value="asc">Slowest first</option></select></label></div><p class="small public-results-legend" data-public-results-legend hidden><span class="public-mark is-ok">✓</span> verified at Show up · <span class="public-mark">P</span> provisional · <span class="public-mark is-dq">DQ</span> disqualified, not ranked · <strong>Open</strong> races can still change.</p><div data-public-results-table><div class="public-results-empty"><svg class="results-podium" viewBox="0 0 120 90" fill="none" aria-hidden="true"><path d="M60 6v8M44 14l4 5M76 14l-4 5M36 26h7M77 26h7" stroke="#8aa0b6" stroke-width="2.4" stroke-linecap="round"/><path d="m60 18 3.6 7.4 8.1 1.2-5.9 5.7 1.4 8.1L60 36.6l-7.2 3.8 1.4-8.1-5.9-5.7 8.1-1.2z" stroke="#f05a00" stroke-width="2.6" stroke-linejoin="round"/><path d="M47 48h26v30H47zM21 60h26v18H21zM73 60h26v18H73z" stroke="#00345f" stroke-width="3" stroke-linejoin="round"/><ellipse cx="60" cy="82" rx="46" ry="4" fill="#e3eaf1"/></svg><p>Choose a club and race date to view results.</p></div></div><p class="public-results-note">Clockings remain provisional until verified by the club.</p></div>`;
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
  table.innerHTML=resultsTable(sorted);
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
// One line per bird (24px), under a thin heading line per race. Stays a table
// on phones: long Loft and Ring names shorten with "…".
function resultsTable(sorted) {
 if(!sorted.length)return '<p class="public-results-empty">No results were found for that club and date.</p>';
 const mark=r=>r.disqualified?'<span class="public-mark is-dq" title="Disqualified: not brought to the club for Show up before the race closed">DQ</span>':r.verification==='verified'?'<span class="public-mark is-ok" title="Verified at Show up">✓</span>':'<span class="public-mark" title="Provisional: not yet checked by the club">P</span>';
 let race=null,body='';
 for(const r of sorted){
  if(r.race_name!==race){race=r.race_name;body+=`<tr class="public-race"><th colspan="6" scope="colgroup">${escapeHTML(race||'Race')} <span>${r.race_status==='closed'?'Final':'Open'}</span></th></tr>`;}
  body+=`<tr${r.disqualified?' class="is-dq"':''}><td class="pr-rank">${r.rank?escapeHTML(String(r.rank)):'–'}</td><td class="pr-loft" title="${escapeHTML(r.loft_name||'')}">${escapeHTML(r.loft_name||'—')}</td><td class="pr-ring" title="${escapeHTML(r.pigeon_ring||'')}">${escapeHTML(r.pigeon_ring||'—')}</td><td class="pr-time">${escapeHTML(formatDate(r.arrival_at_utc,TIME_FORMAT))}</td><td class="pr-speed">${r.speed_m_per_min==null?'—':escapeHTML(number(r.speed_m_per_min))}</td><td class="pr-mark">${mark(r)}</td></tr>`;
 }
 return `<table class="public-table"><thead><tr><th class="pr-rank" scope="col">#</th><th class="pr-loft" scope="col">Loft</th><th class="pr-ring" scope="col">Ring</th><th class="pr-time" scope="col">Arrival</th><th class="pr-speed" scope="col">m/min</th><th class="pr-mark" scope="col"><span class="sr-only">Status</span></th></tr></thead><tbody>${body}</tbody></table>`;
}
export { mountPublicResults };
