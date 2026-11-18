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
  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">SUPERADMIN · GLOBAL REGISTRY</span><h2>Generate Sticker</h2><p>Generate a batch of stickers and choose whether to register them for club use.</p></div></div><section class="panel narrow"><form id="sticker-batch-form" class="form-grid"><label class="field"><span>Sticker batch quantity</span><input name="quantity" type="number" min="1" max="500" step="1" inputmode="numeric" value="20" required></label><label class="field"><span>Label text</span><input name="sticker_label" maxlength="8" value="${DEFAULT_STICKER_LABEL}" autocomplete="off" autocapitalize="characters" spellcheck="false"><small class="small">Printed next to the logo above the sticker number. Up to 8 characters; leave blank for the logo only.</small></label><div class="field sticker-size-toggle"><button class="button secondary" type="button" data-size-toggle aria-expanded="false" aria-controls="sticker-size-panel">Sticker size</button></div><fieldset class="field sticker-size" id="sticker-size-panel" hidden><legend>Sticker size (cm)</legend><label class="sticker-size-preset"><span>Preset</span><select name="size_preset"><option value="">Custom</option>${STICKER_SIZE_PRESETS.map(p=>`<option value="${p.key}">${p.key} · ${p.name}: ${cm(p.heightMm)} × ${cm(p.refWidthMm+p.labelWidthMm)} cm (${stickerLayout(p).perPage} per A4)</option>`).join('')}</select></label><div class="sticker-size-modes"><label><input type="radio" name="size_mode" value="whole" checked> Whole stub: height and width</label><label><input type="radio" name="size_mode" value="columns"> Custom: left and right column</label></div><div class="sticker-size-grid"><label><span>Height</span><input name="size_height" type="number" min="0.5" max="3" step="0.05" inputmode="decimal"></label><label data-size-whole><span>Whole width</span><input name="size_width" type="number" min="1" max="28" step="0.05" inputmode="decimal"></label><label data-size-columns hidden><span>Left column (reference stub)</span><input name="size_left" type="number" min="1" max="28" step="0.05" inputmode="decimal"></label><label data-size-columns hidden><span>Right column (clocking label)</span><input name="size_right" type="number" min="1" max="28" step="0.05" inputmode="decimal"></label></div><p class="small" data-size-summary aria-live="polite"></p><button class="text-button" type="button" data-size-reset>Reset to 6.3 × 0.5 cm</button></fieldset><label class="field sticker-registration-choice"><span>Registry option</span><span class="sticker-registration-toggle"><input name="register_stickers" type="checkbox" checked><span><strong>Register stickers now</strong><small>Registered stickers can be used by any club. Turn this off to generate and print codes without registering them.</small></span></span></label><div class="form-actions"><button class="button primary" type="submit">Generate and register stickers</button></div></form><p class="small sticker-print-note">Each sticker gets the next 8-digit reference number for this year (6-digit serial + 2-digit year, e.g. 00012326) and a random 6-digit secret code for clocking. Stickers generated without registering are saved but inactive until a Super Admin registers them on Register Sticker. Each code prints as one sticker set on A4 landscape: a <strong>reference stub</strong> (left column) with the logo, a barcode of the sticker number and the number, scanned or typed to register the race entry; then one <strong>clocking label</strong> (right column) with a copy of the logo and sticker number joined to the barcode of the secret code, with the decoded secret code underneath. The member scans the clocking label's barcode to clock. Keep it hidden until clocking. Choose the size above; barcodes and text scale to fit. Print at 100% (actual size).</p></section><section class="panel" data-sticker-preview-panel hidden><div class="panel-heading"><div><h3>Generated sticker batch</h3><p class="small" data-sticker-batch-note></p></div><div class="sticker-actions"><button class="button secondary" type="button" data-export-word>Export Word</button><button class="button primary" type="button" data-print-stickers>Print</button></div></div><div data-sticker-preview></div></section>`;
  const form=view.querySelector('#sticker-batch-form'),previewPanel=view.querySelector('[data-sticker-preview-panel]'),preview=view.querySelector('[data-sticker-preview]'),registerToggle=form.elements.register_stickers,generateButton=form.querySelector('[type=submit]');let generatedCodes=[],generatedRegistered=true;
  registerToggle.onchange=()=>{generateButton.textContent=registerToggle.checked?'Generate and register stickers':'Generate without registering';};
  // Sticker size: whole width (split automatically) or custom left/right columns.
  const sizeFields=form.elements,summary=view.querySelector('[data-size-summary]');let layout=null;
  const toMm=value=>Math.round(Number(value)*10*100)/100;
  const applySize=size=>{sizeFields.size_height.value=cm(size.heightMm);sizeFields.size_width.value=cm(size.refWidthMm+size.labelWidthMm);sizeFields.size_left.value=cm(size.refWidthMm);sizeFields.size_right.value=cm(size.labelWidthMm);};
  const readSize=()=>{
    const heightMm=toMm(sizeFields.size_height.value);
    if(sizeFields.size_mode.value==='columns')return {heightMm,refWidthMm:toMm(sizeFields.size_left.value),labelWidthMm:toMm(sizeFields.size_right.value)};
    return splitWholeWidth(toMm(sizeFields.size_width.value),heightMm);
  };
  // Show/hide button for the size settings; it always names the current size.
  const sizeToggle=view.querySelector('[data-size-toggle]'),sizePanel=view.querySelector('#sticker-size-panel'),SIZE_OPEN_KEY='avilonx.stickerSizeOpen';
  const updateToggleLabel=()=>{const open=!sizePanel.hidden,preset=matchingPreset(layout),current=layout&&!layout.errors?`${preset?`${preset.key}, `:''}${cm(layout.setWidthMm)} × ${cm(layout.heightMm)} cm, ${layout.perPage} per A4`:'check the size';sizeToggle.textContent=`${open?'Hide':'Show'} sticker size (${current}) ${open?'▾':'▸'}`;sizeToggle.setAttribute('aria-expanded',String(open));};
  const setSizeOpen=open=>{sizePanel.hidden=!open;updateToggleLabel();try{localStorage.setItem(SIZE_OPEN_KEY,open?'1':'0');}catch{}};
  sizeToggle.onclick=()=>setSizeOpen(sizePanel.hidden);
  // Preset choices fill in height and both column widths; editing any number
  // afterwards shows "Custom" unless it still matches a preset.
  const matchingPreset=l=>l&&!l.errors?STICKER_SIZE_PRESETS.find(p=>Math.abs(p.heightMm-l.heightMm)<.01&&Math.abs(p.refWidthMm-l.refWidthMm)<.01&&Math.abs(p.labelWidthMm-l.labelWidthMm)<.01):null;
  sizeFields.size_preset.addEventListener('change',()=>{
    const preset=STICKER_SIZE_PRESETS.find(p=>p.key===sizeFields.size_preset.value);if(!preset)return;
    applySize(preset);form.querySelector('input[name=size_mode][value=columns]').checked=true;updateSize();
  });
  const updateSize=({rerender=true}={})=>{
    const columns=sizeFields.size_mode.value==='columns';
    view.querySelectorAll('[data-size-columns]').forEach(el=>el.hidden=!columns);view.querySelector('[data-size-whole]').hidden=columns;
    const size=readSize();
    layout=size.tooNarrowMm?{errors:[`The whole stub must be at least ${cm(size.tooNarrowMm)} cm wide at this height, or the barcodes are too small to scan.`]}:stickerLayout(size);
    if(layout.errors){summary.textContent=layout.errors.join(' ');summary.className='small notice error';sizePanel.hidden=false;sizeFields.size_preset.value='';updateToggleLabel();return;}
    summary.className='small';
    summary.textContent=`${cm(layout.setWidthMm)} × ${cm(layout.heightMm)} cm: left ${cm(layout.refWidthMm)} cm + right ${cm(layout.labelWidthMm)} cm. Fits ${layout.perPage} per A4 (${layout.perRow} across × ${layout.rows} down). Barcodes ${cm(layout.refBarcode.widthMm)} and ${cm(layout.clockBarcode.widthMm)} × ${cm(layout.clockBarcode.heightMm)} cm; text ${layout.textPt} pt.`;
    if(!columns){sizeFields.size_left.value=cm(layout.refWidthMm);sizeFields.size_right.value=cm(layout.labelWidthMm);}
    else sizeFields.size_width.value=cm(layout.setWidthMm);
    try{localStorage.setItem(SIZE_KEY,JSON.stringify({mode:sizeFields.size_mode.value,heightMm:layout.heightMm,refWidthMm:layout.refWidthMm,labelWidthMm:layout.labelWidthMm}));}catch{}
    sizeFields.size_preset.value=matchingPreset(layout)?.key||'';
    updateToggleLabel();
    if(rerender&&generatedCodes.length)showBatch().catch(error=>message(error.message,'error'));
  };
  const saved=savedSize();
  applySize(saved&&saved.heightMm?saved:DEFAULT_STICKER_SIZE);
  if(saved?.mode==='columns')form.querySelector('input[name=size_mode][value=columns]').checked=true;
  ['size_height','size_width','size_left','size_right'].forEach(name=>sizeFields[name].addEventListener('input',()=>updateSize()));
  form.querySelectorAll('input[name=size_mode]').forEach(radio=>radio.addEventListener('change',()=>updateSize()));
  view.querySelector('[data-size-reset]').onclick=()=>{applySize(DEFAULT_STICKER_SIZE);form.querySelector('input[name=size_mode][value=whole]').checked=true;updateSize();};
  updateSize({rerender:false});
  try{if(localStorage.getItem(SIZE_OPEN_KEY)==='1')setSizeOpen(true);}catch{}
  const requireLayout=()=>{if(!layout||layout.errors)throw new Error(layout?.errors?.join(' ')||'Choose a sticker size first.');return layout;};
  const stickerLabelText=()=>form.elements.sticker_label.value.trim().toUpperCase().slice(0,8);
  form.elements.sticker_label.addEventListener('input',()=>{if(generatedCodes.length)showBatch().catch(error=>message(error.message,'error'));});
  const showBatch=async()=>{
    if(layout?.errors){previewPanel.hidden=false;preview.innerHTML=`<p class="notice error">${layout.errors.join(' ')}</p>`;return;}
    const logo=await stickerLogoDataUrl();
    previewPanel.hidden=false;view.querySelector('[data-sticker-batch-note]').textContent=`${generatedCodes.length} stickers · ${generatedRegistered?'registered globally and ready for club use':'not registered; unavailable to clubs until registered'} · ${cm(layout.setWidthMm)} × ${cm(layout.heightMm)} cm · ${layout.perPage} per A4 page`;
    preview.innerHTML=stickerPreviewStyle(layout)+stickerGroups(generatedCodes,layout).map(group=>`<div class="sticker-preview-page">${stickerSheetTable(group,code=>stickerPreviewCell(code,stickerLabelText(),logo),layout)}</div>`).join('');
    await loadBarcodeRenderer();drawStickerPreviews(preview);
  };
  form.onsubmit=async event=>{event.preventDefault();const quantity=Number(form.elements.quantity.value),shouldRegister=registerToggle.checked;if(!Number.isInteger(quantity)||quantity<1||quantity>500){message('Choose a batch quantity from 1 to 500.','error');return;}generateButton.disabled=true;registerToggle.disabled=true;generateButton.textContent=shouldRegister?'Generating and registering…':'Generating without registration…';const {data,error}=await supabase.rpc('superadmin_generate_sticker_batch',{p_quantity:quantity,p_register:shouldRegister});generateButton.disabled=false;registerToggle.disabled=false;generateButton.textContent=registerToggle.checked?'Generate and register stickers':'Generate without registering';if(error){message(authError(error),'error');return;}generatedCodes=(data||[]).map(row=>({number:String(row.barcode_number),scratch:row.scratch_code?String(row.scratch_code):''}));if(generatedCodes.some(code=>!code.scratch)){message('The scratch codes were not returned. Re-run sticker-barcodes.sql in the Supabase SQL Editor, then generate a new batch.','error');return;}generatedRegistered=Boolean(data?.[0]?.registered);if(generatedCodes.length!==quantity){message('The sticker numbers could not be loaded. Check the batch result before trying again.','error');return;}if(generatedRegistered!==shouldRegister){message('The generated batch registration result did not match the selected option. Check the sticker registry before using these codes.','error');return;}try{await showBatch();message(shouldRegister?`${generatedCodes.length} unique stickers generated and registered globally.`:`${generatedCodes.length} sticker numbers generated but not registered. They cannot be used for race entries until registered.`,shouldRegister?'success':'info');}catch(renderError){message(shouldRegister?`The stickers were registered, but the barcode preview could not load: ${renderError.message}`:`Sticker numbers were generated but not registered; the barcode preview could not load: ${renderError.message}`,'error');}};
  const buildDocument=async()=>{
    if(!generatedCodes.length)throw new Error('Generate a sticker batch first.');
    const sheetLayout=requireLayout();const pages=[];for(const group of stickerGroups(generatedCodes,sheetLayout)){const cells=await Promise.all(group.map(async code=>({...code,image:await barcodePngDataUrl(stickerBarcodeValue(code),STICKER_BARCODE),refImage:await barcodePngDataUrl(code.number,STICKER_BARCODE)})));pages.push(cells);}
    return wordStickerDocument(pages,stickerLabelText(),await stickerLogoDataUrl(),sheetLayout);
  };
  view.querySelector('[data-export-word]').onclick=async event=>{const button=event.currentTarget;button.disabled=true;button.textContent='Preparing Word…';try{const html=await buildDocument(),blob=new Blob(['\ufeff',html],{type:'application/msword;charset=utf-8'}),link=document.createElement('a'),objectUrl=URL.createObjectURL(blob);link.href=objectUrl;link.download=`avilonx-stickers-${new Date().toISOString().slice(0,10)}.doc`;link.click();URL.revokeObjectURL(objectUrl);message('Word sticker sheet downloaded. Open it in Word and print on A4 label paper.','success');}catch(error){message(error.message,'error');}finally{button.disabled=false;button.textContent='Export Word';}};
  view.querySelector('[data-print-stickers]').onclick=async event=>{const button=event.currentTarget,printWindow=window.open('','_blank');if(!printWindow){message('Allow pop-ups to open the print sheet. You can export Word instead.','error');return;}button.disabled=true;button.textContent='Preparing…';try{const html=await buildDocument();printWindow.onload=()=>setTimeout(()=>printWindow.print(),250);printWindow.document.open();printWindow.document.write(html);printWindow.document.close();}catch(error){printWindow.close();message(error.message,'error');}finally{button.disabled=false;button.textContent='Print';}};
}
