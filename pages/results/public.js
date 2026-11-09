import { supabase, escapeHTML, formatDate, number, tableRows } from '../../assets/js/shared.js';

function publicResultsMarkup() {
 return `<div class="public-results-content"><form class="form-grid public-results-filter" data-public-results-form><label class="field"><span>Club</span><select name="club_id" required><option value="">Choose a club</option></select></label><label class="field"><span>Race date · Philippines</span><input name="race_date" type="date" required></label><div class="form-actions"><button class="button primary" type="submit">Show results</button></div></form><p class="public-results-note">Clockings remain provisional until verified by the club.</p><div class="notice error public-results-error" data-public-results-error role="alert" hidden><span data-error-text></span><button class="text-button" type="button" data-retry-clubs>Try again</button></div><div class="public-results-toolbar" data-public-results-toolbar hidden><span data-public-results-count></span><label class="field"><span>Speed order</span><select data-speed-order><option value="desc">Fastest first</option><option value="asc">Slowest first</option></select></label></div><div data-public-results-table><p class="public-results-empty">Choose a club and race date to view results.</p></div></div>`;
}
async function mountPublicResults(panel) {
 panel.innerHTML=publicResultsMarkup();
 const form=panel.querySelector('[data-public-results-form]'),clubSelect=form.elements.club_id,errorBox=panel.querySelector('[data-public-results-error]'),errorText=panel.querySelector('[data-error-text]'),retryButton=panel.querySelector('[data-retry-clubs]'),toolbar=panel.querySelector('[data-public-results-toolbar]'),count=panel.querySelector('[data-public-results-count]'),sortOrder=panel.querySelector('[data-speed-order]'),table=panel.querySelector('[data-public-results-table]');
 let rows=[];
 const setError=text=>{errorText.textContent=text;errorBox.hidden=!text;};
 const draw=()=>{
  const direction=sortOrder.value==='asc'?1:-1;
  const sorted=rows.slice().sort((a,b)=>{const av=a.speed_m_per_min,bv=b.speed_m_per_min;if(av==null&&bv!=null)return 1;if(av!=null&&bv==null)return -1;if(av==null&&bv==null)return 0;return (Number(av)-Number(bv))*direction;});
  count.textContent=`${rows.length} result${rows.length===1?'':'s'}`;
  table.innerHTML=tableRows(sorted,[{key:'race_name',label:'Race'},{key:'loft_name',label:'Loft'},{key:'distance_m',label:'Distance',render:r=>`${number(r.distance_m)} m`},{key:'pigeon_ring',label:'Pigeon ring',render:r=>escapeHTML(r.pigeon_ring||'—')},{key:'barcode',label:'Code',render:r=>escapeHTML(r.barcode||'—')},{key:'arrival_at_utc',label:'Arrival · PH',render:r=>escapeHTML(formatDate(r.arrival_at_utc))},{key:'flight_seconds',label:'Flight',render:r=>escapeHTML(formatFlight(r.flight_seconds))},{key:'speed_m_per_min',label:`Speed · m/min ${direction<0?'↓':'↑'}`,render:r=>r.speed_m_per_min==null?'—':number(r.speed_m_per_min)}], 'No results were found for that club and date.',false);
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
  if(error){setError('Could not load these results. Check your connection and try again.');table.innerHTML='';console.error('Could not load public race results:',error);return;}
  rows=(data||[]).map(row=>({...row,speed_m_per_min:row.speed_m_per_min==null?null:Number(row.speed_m_per_min)}));sortOrder.value='desc';toolbar.hidden=false;draw();
 };
 await loadClubs();
}
function formatFlight(seconds) {
 if(seconds==null||!Number.isFinite(Number(seconds))||Number(seconds)<0)return '—';
 const total=Math.round(Number(seconds)),hours=Math.floor(total/3600),minutes=Math.floor((total%3600)/60),remainder=total%60;
 return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(remainder).padStart(2,'0')}`;
}
export { mountPublicResults };
