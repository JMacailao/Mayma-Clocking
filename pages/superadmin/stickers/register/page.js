import { supabase, escapeHTML, message, formatDate, tableRows } from '../../../../assets/js/shared.js';
import { loadBarcodeRenderer, drawBarcode, bindStickerScanner, STICKER_BARCODE } from '../shared.js';

// Same rule as public.normalize_sticker_code(): surrounding spaces removed, leading zeros kept.
const normalizeCode=value=>String(value??'').trim();
const isStickerNumber=code=>/^\d{8}$/.test(code);
const isSecretCode=code=>/^\d{6}$/.test(code);

export async function render(view,setPageCleanup){
  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">SUPERADMIN · GLOBAL REGISTRY</span><h2>Register Sticker</h2><p>Register a sticker number with its secret barcode code so any club can use it.</p></div></div><section class="panel narrow"><div class="callout"><span class="callout-icon">◎</span><span>Sticker numbers are 8 digits (a 6-digit serial and the 2-digit year, for example 00012326); secret codes are 6 digits. The sticker number goes on the race entry; the secret code is the number inside the sticker's barcode, which members scan to clock. To activate a sticker that was generated without registering, enter its number and leave the secret code blank.</span></div><form id="sticker-register-form" class="form-grid"><label class="field"><span>Sticker number</span><div class="barcode-entry"><input id="sticker-barcode-number" name="barcode_number" maxlength="8" inputmode="numeric" autocomplete="off" spellcheck="false" required placeholder="e.g. 00012326"><button class="barcode-scan-button" data-sticker-scan-for="barcode_number" type="button" aria-label="Scan sticker number with camera" title="Scan sticker number"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 12h8M10 9v6M14 9v6"/></svg></button></div></label><label class="field"><span>Secret code (barcode)</span><div class="barcode-entry"><input id="sticker-scratch-code" name="scratch_code" maxlength="6" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="e.g. 482715"><button class="barcode-scan-button" data-sticker-scan-for="scratch_code" type="button" aria-label="Scan the sticker's barcode with camera" title="Scan barcode"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 12h8M10 9v6M14 9v6"/></svg></button></div><small class="small">Scan the sticker's barcode to fill this in. It is stored secretly and cannot be viewed later.</small></label><div class="form-actions"><button class="button primary" type="submit">Register sticker</button></div></form></section><section class="panel"><div class="panel-heading"><div><h3>This season's stickers</h3><p class="small">Latest 100. Inactive stickers were generated without registering; clubs cannot use them until registered.</p></div><span class="count-pill" data-sticker-count>Loading…</span></div><div data-sticker-table></div></section><section class="panel narrow"><h3>Start a new sticker season</h3><p class="small">Archives every sticker of this season. Stickers from this season stop working; new stickers continue with new numbers. Clubs must close every draft and open race that uses stickers first.</p><form id="sticker-season-form" class="form-grid"><label class="field"><span>Type NEW SEASON to confirm</span><input name="confirm" autocomplete="off" autocapitalize="characters" spellcheck="false" required></label><div class="form-actions"><button class="button secondary danger-text" type="submit">Start new season</button></div></form></section><dialog class="scanner-dialog scanner-camera-dialog" id="sticker-camera-dialog" aria-label="Scan sticker barcode"><div class="scanner-dialog-content"><div class="scanner-preview"><div class="scanner-placeholder" id="sticker-camera-placeholder"><span class="scanner-placeholder-mark" aria-hidden="true">⌗</span><span>Camera preview will appear here.</span></div><video id="sticker-camera" playsinline autoplay muted hidden aria-label="Live barcode camera preview"></video><div class="scanner-top-controls"><button class="scanner-close-button" type="button" data-close-sticker-camera aria-label="Close scanner">×</button><span class="scanner-live-indicator"><span></span>Scan barcode</span></div><div class="scanner-viewfinder" aria-hidden="true"><span class="scanner-corner top-left"></span><span class="scanner-corner top-right"></span><span class="scanner-corner bottom-left"></span><span class="scanner-corner bottom-right"></span></div><div class="scanner-bottom-controls"><p class="barcode-scan-status" id="sticker-camera-status" aria-live="polite" aria-atomic="true" hidden></p></div></div></div></dialog>`;
  const form=view.querySelector('#sticker-register-form'),input=form.elements.barcode_number,table=view.querySelector('[data-sticker-table]'),count=view.querySelector('[data-sticker-count]'),seasonForm=view.querySelector('#sticker-season-form');
  const drawPreviews=async()=>{try{await loadBarcodeRenderer();table.querySelectorAll('[data-sticker-preview]').forEach(svg=>drawBarcode(svg,svg.dataset.stickerPreview,STICKER_BARCODE));}catch(error){message(error.message,'error');}};
  const load=async()=>{
    const [{data,error,count:total},{count:active}]=await Promise.all([
      supabase.from('barcode_stickers').select('barcode_number,source,created_at,has_scratch_code,is_registered',{count:'exact'}).order('created_at',{ascending:false}).limit(100),
      supabase.from('barcode_stickers').select('barcode_number',{count:'exact',head:true}).eq('is_registered',true)
    ]);
    if(error){table.innerHTML=`<p class="notice error">${escapeHTML(error.message)}. Run the updated sticker-barcodes.sql in your Supabase SQL Editor.</p>`;count.textContent='—';return;}
    count.textContent=`${(total||0).toLocaleString()} this season · ${(active||0).toLocaleString()} active`;
    table.innerHTML=tableRows(data||[],[
      {key:'barcode_number',label:'Sticker number',render:r=>`<strong>${escapeHTML(r.barcode_number)}</strong>`},
      {key:'is_registered',label:'Status',render:r=>r.is_registered?'<span class="tag verified">Active</span>':'<span class="tag pending">Not registered</span>'},
      {key:'has_scratch_code',label:'Secret code',render:r=>r.has_scratch_code?'<span class="tag verified">Set</span>':'<span class="tag pending">None · clocks by number</span>'},
      {key:'source',label:'Added via',render:r=>escapeHTML(r.source==='generated'?'Generated batch':r.source==='legacy'?'Existing race entry':'Manual or camera scan')},
      {key:'created_at',label:'Added',render:r=>escapeHTML(formatDate(r.created_at))}
    ],'No stickers this season yet.',false);
    await drawPreviews();
  };
  form.onsubmit=async event=>{
    event.preventDefault();
    const code=normalizeCode(input.value),scratch=normalizeCode(form.elements.scratch_code.value);
    if(!isStickerNumber(code)){message('Sticker numbers are 8 digits: a 6-digit serial and the 2-digit year, for example 00012326.','error');input.focus();return;}
    if(scratch&&!isSecretCode(scratch)){message('Secret codes are 6 digits, for example 482715.','error');form.elements.scratch_code.focus();return;}
    if(scratch&&scratch===code){message('The secret code must be different from the sticker number.','error');return;}
    const submit=form.querySelector('[type=submit]');submit.disabled=true;submit.textContent='Registering…';
    const {error}=await supabase.rpc('superadmin_register_sticker',{p_barcode_number:code,p_scratch_code:scratch||null});
    submit.disabled=false;submit.textContent='Register sticker';
    if(error){message(error.code==='PGRST202'?'Run the updated sticker-barcodes.sql in the Supabase SQL Editor first.':error.message,'error');return;}
    form.reset();await load();message(`Sticker ${code} is registered and active. Clubs can use it on race entries.`,'success');
  };
  seasonForm.onsubmit=async event=>{
    event.preventDefault();
    if(seasonForm.elements.confirm.value.trim().toUpperCase()!=='NEW SEASON'){message('Type NEW SEASON to confirm.','error');return;}
    const submit=seasonForm.querySelector('[type=submit]');submit.disabled=true;submit.textContent='Starting…';
    const {data,error}=await supabase.rpc('superadmin_start_sticker_season');
    submit.disabled=false;submit.textContent='Start new season';
    if(error){message(error.message,'error');return;}
    seasonForm.reset();await load();message(`New season started. ${Number(data||0).toLocaleString()} stickers were archived and no longer work.`,'success');
  };
  setPageCleanup(bindStickerScanner(view,form));
  await load();
}
