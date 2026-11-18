import { supabase, message, authError } from '../../../../assets/js/shared.js';
import { loadBarcodeRenderer, barcodePngDataUrl, stickerGroups, stickerSheetTable, wordStickerDocument, stickerPreviewCell, drawStickerPreviews, stickerPreviewStyle, stickerBarcodeValue, STICKER_BARCODE, DEFAULT_STICKER_LABEL, stickerLogoDataUrl, stickerLayout, stickerMinimumWidths, DEFAULT_STICKER_SIZE, STICKER_SIZE_PRESETS } from '../shared.js';

// Sizes are shown and entered in centimetres, e.g. 6.3 or 0.5.
const cm=mm=>String(Math.round(mm/10*100)/100);
const SIZE_KEY='avilonx.stickerSize';
const savedSize=()=>{try{return JSON.parse(localStorage.getItem(SIZE_KEY)||'null');}catch{return null;}};
// Splits a whole width between the left and right columns in the default
// proportions (2.85 : 3.45), moving width across when a column would fall below
// the smallest size that still scans.
function splitWholeWidth(totalMm,heightMm){
  const min=stickerMinimumWidths(heightMm),round=v=>Math.round(v*100)/100;
  const ratio=DEFAULT_STICKER_SIZE.refWidthMm/(DEFAULT_STICKER_SIZE.refWidthMm+DEFAULT_STICKER_SIZE.labelWidthMm);
  let left=Math.max(min.refWidthMm,totalMm*ratio),right=totalMm-left;
  if(right<min.labelWidthMm){right=min.labelWidthMm;left=totalMm-right;}
  if(!(left>=min.refWidthMm))return {heightMm,refWidthMm:totalMm*ratio,labelWidthMm:totalMm*(1-ratio),tooNarrowMm:round(min.refWidthMm+min.labelWidthMm)};
  return {heightMm,refWidthMm:round(left),labelWidthMm:round(right)};
}
export async function render(view){
  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">SUPERADMIN · GLOBAL REGISTRY</span><h2>Generate Sticker</h2></div></div><div class="sticker-generator"><section class="panel sticker-settings"><h3>Batch settings</h3><form id="sticker-batch-form" class="sticker-settings-form"><div class="sticker-settings-row"><label class="field"><span>Sticker batch quantity</span><input name="quantity" type="number" min="1" max="500" step="1" inputmode="numeric" value="20" required></label><label class="field"><span>Label text</span><input name="sticker_label" maxlength="8" value="${DEFAULT_STICKER_LABEL}" autocomplete="off" autocapitalize="characters" spellcheck="false" title="Printed next to the logo. Up to 8 characters; leave blank for the logo only."></label></div><div class="sticker-settings-row sticker-settings-row-wide"><label class="field"><span>Sticker size (preset)</span><select name="size_preset"><option value="">Custom</option>${STICKER_SIZE_PRESETS.map(p=>`<option value="${p.key}">${p.key} · ${p.name}</option>`).join('')}</select></label><label class="field"><span>Paper (A4)</span><select name="size_orientation"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label></div><div class="sticker-size-modes" role="radiogroup" aria-label="How to set the size"><label><input type="radio" name="size_mode" value="whole" checked> Whole stub: height and width</label><label><input type="radio" name="size_mode" value="columns"> Custom columns</label></div><div class="sticker-size-grid"><label class="field"><span>Height</span><span class="input-unit"><input name="size_height" type="number" min="0.5" max="28" step="0.05" inputmode="decimal"><span>cm</span></span></label><label class="field" data-size-whole><span>Whole width</span><span class="input-unit"><input name="size_width" type="number" min="0.5" max="28" step="0.05" inputmode="decimal"><span>cm</span></span></label><label class="field" data-size-columns hidden><span>Left stub</span><span class="input-unit"><input name="size_left" type="number" min="0.5" max="28" step="0.05" inputmode="decimal"><span>cm</span></span></label><label class="field" data-size-columns hidden><span>Right label</span><span class="input-unit"><input name="size_right" type="number" min="0.5" max="28" step="0.05" inputmode="decimal"><span>cm</span></span></label></div><p class="small sticker-size-summary" data-size-summary aria-live="polite"></p><button class="text-button" type="button" data-size-reset>Reset to 6.3 × 0.5 cm</button><hr class="sticker-settings-rule"><label class="sticker-registration-toggle"><input name="register_stickers" type="checkbox" checked><span><strong>Register stickers now</strong><small>Registered stickers can be used by any club.</small></span></label><button class="button primary sticker-generate-button" type="submit">Generate and register stickers</button><details class="sticker-help"><summary>How the stickers work</summary><p class="small">Each sticker gets the next 8-digit reference number for this year (6-digit serial + 2-digit year, e.g. 00012326) and a random 6-digit secret code. The <strong>reference stub</strong> (left) has a barcode of the number, scanned or typed to register the race entry. The <strong>clocking label</strong> (right) has the barcode of the secret code, which the member scans to clock; keep it hidden until clocking. Stickers generated without registering are saved but inactive until registered on Register Sticker. Barcodes and text scale to the chosen size.</p></details></form></section><section class="panel sticker-batch" data-sticker-preview-panel><div class="sticker-batch-head"><div><h3>Generated sticker batch</h3><p class="small" data-sticker-batch-note>No batch yet.</p></div><div class="sticker-actions"><button class="button secondary" type="button" data-export-word disabled>Export Word</button><button class="button primary" type="button" data-print-stickers disabled>Print</button></div></div><div class="sticker-preview-frame" data-sticker-preview><p class="sticker-preview-empty">Generate a batch to see the stickers here.</p></div><div class="sticker-batch-foot"><span class="sticker-foot-item"><span aria-hidden="true">▥</span> <strong data-foot-size>—</strong> per sticker</span><span class="sticker-foot-item"><span aria-hidden="true">▯</span> <strong data-foot-perpage>—</strong> per A4 sheet</span><span class="sticker-foot-note">Print at 100% scale</span></div></section></div>`;
  const form=view.querySelector('#sticker-batch-form'),preview=view.querySelector('[data-sticker-preview]'),registerToggle=form.elements.register_stickers,generateButton=form.querySelector('[type=submit]');let generatedCodes=[],generatedRegistered=true;
  registerToggle.onchange=()=>{generateButton.textContent=registerToggle.checked?'Generate and register stickers':'Generate without registering';};
  // Sticker size: whole width (split automatically) or custom left/right columns.
  const sizeFields=form.elements,summary=view.querySelector('[data-size-summary]');let layout=null;
  const toMm=value=>Math.round(Number(value)*10*100)/100;
  const applySize=size=>{sizeFields.size_height.value=cm(size.heightMm);sizeFields.size_width.value=cm(size.refWidthMm+size.labelWidthMm);sizeFields.size_left.value=cm(size.refWidthMm);sizeFields.size_right.value=cm(size.labelWidthMm);};
  const readSize=()=>{
    const heightMm=toMm(sizeFields.size_height.value);
    const orientation=sizeFields.size_orientation.value;
    if(sizeFields.size_mode.value==='columns')return {heightMm,refWidthMm:toMm(sizeFields.size_left.value),labelWidthMm:toMm(sizeFields.size_right.value),orientation};
    return {...splitWholeWidth(toMm(sizeFields.size_width.value),heightMm),orientation};
  };
  // Footer under the preview: size per sticker and how many fit per sheet.
  const footSize=view.querySelector('[data-foot-size]'),footPerPage=view.querySelector('[data-foot-perpage]'),exportButton=view.querySelector('[data-export-word]'),printButton=view.querySelector('[data-print-stickers]');
  const updateToggleLabel=()=>{
    const ok=layout&&!layout.errors;
    footSize.textContent=ok?`${cm(layout.setWidthMm)} × ${cm(layout.heightMm)} cm`:'—';
    footPerPage.textContent=ok?`${layout.perPage}`:'—';
    footPerPage.parentElement.title=ok?`${layout.perRow} across × ${layout.rows} down, A4 ${layout.orientation}`:'';
    exportButton.disabled=printButton.disabled=!ok||!generatedCodes.length;
  };
  // Preset choices fill in height and both column widths; editing any number
  // afterwards shows "Custom" unless it still matches a preset.
  const matchingPreset=l=>l&&!l.errors?STICKER_SIZE_PRESETS.find(p=>Math.abs(p.heightMm-l.heightMm)<.01&&Math.abs(p.refWidthMm-l.refWidthMm)<.01&&Math.abs(p.labelWidthMm-l.labelWidthMm)<.01):null;
  const refreshPresetLabels=()=>{const orientation=sizeFields.size_orientation.value;[...sizeFields.size_preset.options].forEach(option=>{const p=STICKER_SIZE_PRESETS.find(x=>x.key===option.value);if(p){option.textContent=`${p.key} · ${p.name}`;option.title=`${cm(p.heightMm)} × ${cm(p.refWidthMm+p.labelWidthMm)} cm, ${stickerLayout({...p,orientation}).perPage} per A4 ${orientation}`;}});};
  sizeFields.size_orientation.addEventListener('change',()=>{refreshPresetLabels();updateSize();});
  sizeFields.size_preset.addEventListener('change',()=>{
    const preset=STICKER_SIZE_PRESETS.find(p=>p.key===sizeFields.size_preset.value);if(!preset)return;
    applySize(preset);form.querySelector('input[name=size_mode][value=columns]').checked=true;updateSize();
  });
  const updateSize=({rerender=true}={})=>{
    const columns=sizeFields.size_mode.value==='columns';
    view.querySelectorAll('[data-size-columns]').forEach(el=>el.hidden=!columns);view.querySelector('[data-size-whole]').hidden=columns;
    const size=readSize();
    layout=size.tooNarrowMm?{errors:[`The whole stub must be at least ${cm(size.tooNarrowMm)} cm wide at this height, or the barcodes are too small to scan.`]}:stickerLayout(size);
    if(layout.errors){summary.textContent=layout.errors.join(' ');summary.className='small notice error sticker-size-summary';sizeFields.size_preset.value='';updateToggleLabel();return;}
    summary.className='small sticker-size-summary';
    summary.textContent=`${cm(layout.setWidthMm)} × ${cm(layout.heightMm)} cm: left ${cm(layout.refWidthMm)} cm + right ${cm(layout.labelWidthMm)} cm. Fits ${layout.perPage} per A4 ${layout.orientation} (${layout.perRow} across × ${layout.rows} down). Barcodes ${cm(layout.refBarcode.widthMm)} and ${cm(layout.clockBarcode.widthMm)} × ${cm(layout.clockBarcode.heightMm)} cm; text ${layout.textPt} pt.`;
    if(!columns){sizeFields.size_left.value=cm(layout.refWidthMm);sizeFields.size_right.value=cm(layout.labelWidthMm);}
    else sizeFields.size_width.value=cm(layout.setWidthMm);
    try{localStorage.setItem(SIZE_KEY,JSON.stringify({mode:sizeFields.size_mode.value,orientation:layout.orientation,heightMm:layout.heightMm,refWidthMm:layout.refWidthMm,labelWidthMm:layout.labelWidthMm}));}catch{}
    sizeFields.size_preset.value=matchingPreset(layout)?.key||'';
    updateToggleLabel();
    if(rerender&&generatedCodes.length)showBatch().catch(error=>message(error.message,'error'));
  };
  const saved=savedSize();
  applySize(saved&&saved.heightMm?saved:DEFAULT_STICKER_SIZE);
  if(saved?.orientation==='landscape')sizeFields.size_orientation.value='landscape';
  if(saved?.mode==='columns')form.querySelector('input[name=size_mode][value=columns]').checked=true;
  ['size_height','size_width','size_left','size_right'].forEach(name=>sizeFields[name].addEventListener('input',()=>updateSize()));
  form.querySelectorAll('input[name=size_mode]').forEach(radio=>radio.addEventListener('change',()=>updateSize()));
  view.querySelector('[data-size-reset]').onclick=()=>{applySize(DEFAULT_STICKER_SIZE);form.querySelector('input[name=size_mode][value=whole]').checked=true;updateSize();};
  refreshPresetLabels();
  updateSize({rerender:false});
  const requireLayout=()=>{if(!layout||layout.errors)throw new Error(layout?.errors?.join(' ')||'Choose a sticker size first.');return layout;};
  const stickerLabelText=()=>form.elements.sticker_label.value.trim().toUpperCase().slice(0,8);
  form.elements.sticker_label.addEventListener('input',()=>{if(generatedCodes.length)showBatch().catch(error=>message(error.message,'error'));});
  const showBatch=async()=>{
    if(layout?.errors){preview.innerHTML=`<p class="notice error">${layout.errors.join(' ')}</p>`;return;}
    const logo=await stickerLogoDataUrl();
    view.querySelector('[data-sticker-batch-note]').textContent=generatedRegistered?`${generatedCodes.length} registered stickers`:`${generatedCodes.length} stickers, not registered (clubs cannot use them until registered)`;updateToggleLabel();
    preview.innerHTML=stickerPreviewStyle(layout)+stickerGroups(generatedCodes,layout).map(group=>`<div class="sticker-preview-page">${stickerSheetTable(group,code=>stickerPreviewCell(code,stickerLabelText(),logo),layout)}</div>`).join('');
    await loadBarcodeRenderer();drawStickerPreviews(preview);fitPreview();
  };
  // Scale the preview pages down so a whole sheet fits the frame's width.
  const fitPreview=()=>{
    const pages=[...preview.querySelectorAll('.sticker-preview-page')];if(!pages.length)return;
    pages.forEach(page=>page.style.zoom='');
    const available=preview.clientWidth-24,widest=Math.max(...pages.map(page=>page.scrollWidth));
    const scale=widest>available&&available>0?available/widest:1;
    pages.forEach(page=>page.style.zoom=String(Math.floor(scale*1000)/1000));
  };
  window.addEventListener('resize',fitPreview);
  form.onsubmit=async event=>{event.preventDefault();const quantity=Number(form.elements.quantity.value),shouldRegister=registerToggle.checked;if(!Number.isInteger(quantity)||quantity<1||quantity>500){message('Choose a batch quantity from 1 to 500.','error');return;}generateButton.disabled=true;registerToggle.disabled=true;generateButton.textContent=shouldRegister?'Generating and registering…':'Generating without registration…';const {data,error}=await supabase.rpc('superadmin_generate_sticker_batch',{p_quantity:quantity,p_register:shouldRegister});generateButton.disabled=false;registerToggle.disabled=false;generateButton.textContent=registerToggle.checked?'Generate and register stickers':'Generate without registering';if(error){message(authError(error),'error');return;}generatedCodes=(data||[]).map(row=>({number:String(row.barcode_number),scratch:row.scratch_code?String(row.scratch_code):''}));if(generatedCodes.some(code=>!code.scratch)){message('The scratch codes were not returned. Re-run sticker-barcodes.sql in the Supabase SQL Editor, then generate a new batch.','error');return;}generatedRegistered=Boolean(data?.[0]?.registered);if(generatedCodes.length!==quantity){message('The sticker numbers could not be loaded. Check the batch result before trying again.','error');return;}if(generatedRegistered!==shouldRegister){message('The generated batch registration result did not match the selected option. Check the sticker registry before using these codes.','error');return;}try{await showBatch();message(shouldRegister?`${generatedCodes.length} unique stickers generated and registered globally.`:`${generatedCodes.length} sticker numbers generated but not registered. They cannot be used for race entries until registered.`,shouldRegister?'success':'info');}catch(renderError){message(shouldRegister?`The stickers were registered, but the barcode preview could not load: ${renderError.message}`:`Sticker numbers were generated but not registered; the barcode preview could not load: ${renderError.message}`,'error');}};
  const buildDocument=async()=>{
    if(!generatedCodes.length)throw new Error('Generate a sticker batch first.');
    const sheetLayout=requireLayout();const pages=[];for(const group of stickerGroups(generatedCodes,sheetLayout)){const cells=await Promise.all(group.map(async code=>({...code,image:await barcodePngDataUrl(stickerBarcodeValue(code),STICKER_BARCODE),refImage:await barcodePngDataUrl(code.number,STICKER_BARCODE)})));pages.push(cells);}
    return wordStickerDocument(pages,stickerLabelText(),await stickerLogoDataUrl(),sheetLayout);
  };
  view.querySelector('[data-export-word]').onclick=async event=>{const button=event.currentTarget;button.disabled=true;button.textContent='Preparing Word…';try{const html=await buildDocument(),blob=new Blob(['\ufeff',html],{type:'application/msword;charset=utf-8'}),link=document.createElement('a'),objectUrl=URL.createObjectURL(blob);link.href=objectUrl;link.download=`avilonx-stickers-${new Date().toISOString().slice(0,10)}.doc`;link.click();URL.revokeObjectURL(objectUrl);message('Word sticker sheet downloaded. Open it in Word and print on A4 label paper.','success');}catch(error){message(error.message,'error');}finally{button.disabled=false;button.textContent='Export Word';}};
  view.querySelector('[data-print-stickers]').onclick=async event=>{const button=event.currentTarget,printWindow=window.open('','_blank');if(!printWindow){message('Allow pop-ups to open the print sheet. You can export Word instead.','error');return;}button.disabled=true;button.textContent='Preparing…';try{const html=await buildDocument();printWindow.onload=()=>setTimeout(()=>printWindow.print(),250);printWindow.document.open();printWindow.document.write(html);printWindow.document.close();}catch(error){printWindow.close();message(error.message,'error');}finally{button.disabled=false;button.textContent='Print';}};
}
