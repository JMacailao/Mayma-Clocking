import { supabase, escapeHTML, message, dbError, number, formatDate, ringLabel, tableRows, loadSpreadsheetParser } from '../../../assets/js/shared.js';
import { formatNfcUid } from '../../../assets/js/nfc.js';
import { entrySheetRowsFromWorksheet, extractExcelBarcodeImages, decodeExcelBarcodeImages } from './excel-import.js';
import { FORM_GUIDE, tableCorners, quadPoint, straightenTable, entrySheetRowsFromGuide, loadDocumentOCR, loadDocumentBarcodeReader, scanSheetBarcodes, documentFileToCanvas, rotateDocumentCanvas, detectTableGrid, entrySheetRowsFromGrid, entrySheetRowsFromOCR, refineHandwrittenEntryFields } from './sheet-reader.js';
import { sheetRemarks, sheetMember, sheetBird } from './sheet-parse.js';
import { tagExpired, clockWays, distanceMeters } from './entry-helpers.js';

export function mountEntrySheetImport(view,races,members,entries,readerByMember=new Map(),birds=null,remarkLabels=[],stickerRule='required'){
  const birdById=new Map((birds||[]).map(bird=>[bird.id,bird]));
  const existingForm=view.querySelector('#entry-form');
  const importPanel=`<div class="entry-sheet-panel"><p class="entry-tab-intro" data-sheet-only>Upload a photo or PDF of the loading form. Columns are read left to right: <strong>member ID</strong> (Loft name), <strong>ring number</strong> (Pigeon I.D.), <strong>remarks</strong> (P1/P2/P3) and the <strong>sticker</strong> (its barcode, or the printed reference number).</p><p class="entry-tab-intro" data-excel-only>Download the Excel template, fill it in, then import it. Required columns: Member ID, Ring Number, and Barcode Number.</p><div class="entry-sheet-controls" data-sheet-only><label class="field"><span>Document photo or PDF</span><input type="file" data-sheet-file accept="image/*,.pdf,application/pdf"><small class="small">Handwriting can be misread: review red rows before saving. PDF uploads read the first page. Rotate if the text is sideways.</small></label></div><div class="entry-sheet-actions" data-excel-only><button class="button secondary" type="button" data-download-entry-template>Download Excel template</button><button class="button secondary" type="button" data-open-entry-excel>Import Excel</button><input type="file" data-entry-excel accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" hidden></div><p class="small" data-excel-only>Template columns: No. (optional), Member ID, Ring Number, Remarks (optional, e.g. P1/P2/P3), Barcode Number. Enter barcode values as text to preserve leading zeroes. For barcode pictures, use an .xlsx file with the image in the Barcode Number cell; the importer will scan it.</p><div class="entry-sheet-actions" data-sheet-only><button class="button secondary" type="button" data-sheet-camera>Take photo with guide</button><button class="button secondary" type="button" data-sheet-align disabled>Align on guide</button><button class="button secondary" type="button" data-rotate-sheet disabled>Rotate 90°</button><button class="button primary" type="button" data-read-sheet disabled>Read photo + scan barcodes</button></div><p class="entry-sheet-status" data-sheet-status aria-live="polite">Choose the race schedule above, then upload a photo/PDF or import an Excel file.</p><div class="entry-sheet-grid-note" data-sheet-grid-note data-sheet-only hidden></div><div class="entry-sheet-preview" data-sheet-preview data-sheet-only hidden><canvas data-sheet-preview-canvas></canvas></div><section class="entry-sheet-review" data-sheet-review hidden><div class="panel-heading"><div><h3>Review race entries</h3><p class="small">All detected rows stay in the table. Red rows show errors; fix them before saving those entries.</p></div><span class="count-pill" data-sheet-count></span></div><div data-sheet-table></div><div class="form-actions"><button class="button secondary" type="button" data-clear-sheet>Clear scan</button><button class="button primary" type="button" data-save-sheet disabled>Save valid entries</button></div></section></div>`;
  // Insert the panel without re-rendering the page, so the handlers already set
  // on the entry form (save, camera scan, NFC) keep working.
  const importPane=view.querySelector('[data-entry-pane="import"]');
  if(importPane)importPane.insertAdjacentHTML('beforeend',importPanel);
  else if(existingForm)existingForm.closest('section').insertAdjacentHTML('beforebegin',importPanel);
  else view.insertAdjacentHTML('afterbegin',importPanel);
  const fileInput=view.querySelector('[data-sheet-file]'),excelFileInput=view.querySelector('[data-entry-excel]'),raceSelect=view.querySelector('[data-sheet-race]'),readButton=view.querySelector('[data-read-sheet]'),rotateButton=view.querySelector('[data-rotate-sheet]'),status=view.querySelector('[data-sheet-status]'),preview=view.querySelector('[data-sheet-preview]'),previewCanvas=view.querySelector('[data-sheet-preview-canvas]'),review=view.querySelector('[data-sheet-review]'),table=view.querySelector('[data-sheet-table]'),count=view.querySelector('[data-sheet-count]'),saveButton=view.querySelector('[data-save-sheet]'),gridNote=view.querySelector('[data-sheet-grid-note]'),cameraButton=view.querySelector('[data-sheet-camera]'),alignButton=view.querySelector('[data-sheet-align]');
  // After Align on guide: the straightened table and its row count, used when its lines are not found.
  let alignedGuide=null;
  if(!fileInput)return;
  let sourceCanvas=null,rotation=0,rows=[],validationTimer=null,validationSequence=0;
  const drawRegistered=()=>{const raceId=Number(raceSelect.value),mapped=entries.filter(entry=>!raceId||Number(entry.race_id)===raceId).map(entry=>({...entry,member:members.find(member=>member.id===entry.member_id),race:races.find(race=>race.id===entry.race_id)}));view.querySelector('[data-registered-entries]').innerHTML=tableRows(mapped,[{key:'race',label:'Race',render:item=>escapeHTML(item.race?.name||'—')},{key:'member',label:'Member',render:item=>`<span title="${escapeHTML(item.member?.member_no||'')}">${escapeHTML(item.member?.full_name||item.member?.member_no||'—')}</span>`},{key:'pigeon_ring',label:'Ring number',render:r=>{const bird=r.pigeon_id&&birdById.get(r.pigeon_id);return `${escapeHTML(ringLabel(r.pigeon_ring,r.remarks))}${bird?`<br><span class="small">${escapeHTML(bird.bird_name)} · ${escapeHTML(bird.color)}</span>`:''}`;}},{key:'barcode',label:'Sticker barcode',render:r=>escapeHTML(r.barcode||'—')},{key:'nfc_tag',label:'NFC tag',render:r=>r.nfc_tag?`${escapeHTML(formatNfcUid(r.nfc_tag))}${r.nfc_expires_at?`<br><span class="small ${tagExpired(r)?'tag-expired':''}">${tagExpired(r)?'Expired':'Expires'} ${escapeHTML(formatDate(r.nfc_expires_at))}</span>`:''}${r.nfc_read_with?`<br><span class="small">via ${({wireless:'wireless reader',wired:'USB reader',phone:'Android phone'})[r.nfc_read_with]||escapeHTML(r.nfc_read_with)}</span>`:''}`:'—'},{key:'clock_with',label:'Clock with',render:r=>escapeHTML(clockWays(r,readerByMember).join(' · ')||'—')},{key:'distance_m',label:'Distance',render:item=>`${number(item.distance_m)} m`}],raceId?'No pigeons registered for this race yet.':'No pigeons registered.',false);};
  drawRegistered();raceSelect.addEventListener('change',drawRegistered);
  // A small picture of the cell as written on the sheet, to check what was read.
  let cellSource=null;
  const cellImage=(row,key)=>{const g=row[key];if(!cellSource||!g)return '';if(!row.pictures)row.pictures={};if(!(key in row.pictures)){try{const w=Math.max(1,Math.round(g.right-g.left)),h=Math.max(1,Math.round(g.bottom-g.top)),scale=Math.min(1,220/w),c=document.createElement('canvas');c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));c.getContext('2d').drawImage(cellSource,g.left,g.top,w,h,0,0,c.width,c.height);row.pictures[key]=c.toDataURL('image/jpeg',.7);}catch{row.pictures[key]='';}}return row.pictures[key]?`<img class="entry-sheet-cell" src="${row.pictures[key]}" alt="">`:'';};
  const redrawRows=()=>{
    review.hidden=!rows.length;count.textContent=`${rows.length} row${rows.length===1?'':'s'}`;
    table.innerHTML=rows.length?`<div class="table-scroll entry-sheet-table"><table><thead><tr><th>Sheet row</th><th>Member ID</th><th>Ring</th><th>Remarks</th><th>Sticker</th><th>Error / status</th><th></th></tr></thead><tbody>${rows.map(row=>`<tr data-sheet-row="${escapeHTML(row.id)}" class="${row.saved?'is-saved':row.errors?.length?'has-errors':''}"><td data-label="Sheet row"><span class="entry-sheet-row-number">${escapeHTML(row.sheetRow)}</span></td><td data-label="Member ID">${cellImage(row,'memberRegion')}<input class="entry-sheet-input" data-sheet-field="member_no" data-sheet-id="${escapeHTML(row.id)}" maxlength="120" value="${escapeHTML(row.member_no)}" aria-label="Member ID, source row ${escapeHTML(row.sheetRow)}" ${row.saved?'disabled':''}></td><td data-label="Ring">${cellImage(row,'ringRegion')}<input class="entry-sheet-input" data-sheet-field="pigeon_ring" data-sheet-id="${escapeHTML(row.id)}" maxlength="80" value="${escapeHTML(row.pigeon_ring)}" aria-label="Ring number, source row ${escapeHTML(row.sheetRow)}" ${row.saved?'disabled':''}></td><td data-label="Remarks">${cellImage(row,'remarksRegion')}<input class="entry-sheet-input entry-sheet-remarks" data-sheet-field="remarks_text" data-sheet-id="${escapeHTML(row.id)}" maxlength="120" value="${escapeHTML(row.remarks_text||'')}" placeholder="P1/P2" aria-label="Remarks, source row ${escapeHTML(row.sheetRow)}" ${row.saved?'disabled':''}></td><td data-label="Sticker">${cellImage(row,'barcodeRegion')}<input class="entry-sheet-input" data-sheet-field="barcode" data-sheet-id="${escapeHTML(row.id)}" maxlength="120" value="${escapeHTML(row.barcode)}" aria-label="Barcode, source row ${escapeHTML(row.sheetRow)}" ${row.saved?'disabled':''}></td><td data-label="Error / status"><span class="entry-sheet-row-status ${row.saved?'is-saved':row.errors?.length?'has-error':''}" data-sheet-row-status="${escapeHTML(row.id)}">${row.saved?'Saved':'Checking…'}</span></td><td data-label="Remove"><button class="text-button danger-text" type="button" data-remove-sheet-row="${escapeHTML(row.id)}" ${row.saved?'disabled':''}>Remove</button></td></tr>`).join('')}</tbody></table></div>`:'';
    table.querySelectorAll('[data-sheet-field]').forEach(input=>input.addEventListener('input',()=>{const row=rows.find(item=>item.id===input.dataset.sheetId);if(row){row[input.dataset.sheetField]=input.value;if(input.dataset.sheetField==='barcode')row.barcodeScanError='';}clearTimeout(validationTimer);validationTimer=setTimeout(()=>validateRows(),400);}));
    table.querySelectorAll('[data-remove-sheet-row]').forEach(button=>button.onclick=()=>{rows=rows.filter(row=>row.id!==button.dataset.removeSheetRow);redrawRows();validateRows();});
  };
  async function validateRows(){
    const sequence=++validationSequence,raceId=Number(raceSelect.value),codes=[...new Set(rows.filter(row=>!row.saved).map(row=>row.barcode.trim()).filter(code=>code&&code.length<=120))],registered=new Set();let registryError=null;
    for(let offset=0;offset<codes.length;offset+=100){const {data,error}=await supabase.from('barcode_stickers').select('barcode_number').in('barcode_number',codes.slice(offset,offset+100));if(error){registryError=error;break;}for(const sticker of data||[])registered.add(sticker.barcode_number);}
    if(sequence!==validationSequence)return;
    const raceEntries=entries.filter(entry=>entry.race_id===raceId),seenRings=new Set(),seenCodes=new Set();let ready=0,savedCount=0,errorCount=0;
    for(const row of rows){
      const indicator=table.querySelector(`[data-sheet-row-status="${row.id}"]`),rowElement=table.querySelector(`[data-sheet-row="${row.id}"]`);
      if(row.saved){row.errors=[];savedCount++;if(indicator){indicator.textContent='Saved';indicator.classList.remove('has-error','is-ready');indicator.classList.add('is-saved');}rowElement?.classList.remove('has-errors');rowElement?.classList.add('is-saved');continue;}
      const errors=[],memberCode=row.member_no.trim(),ring=row.pigeon_ring.trim().toUpperCase(),barcode=row.barcode.trim();
      row.member=sheetMember(members,memberCode);
      if(!raceId)errors.push('Choose a race.');
      if(!memberCode||!row.member)errors.push('Member ID is not registered in this club.');
      if(!ring)errors.push('Ring number is missing.');
      // With bird bonding, each row must be one of the member's active bonded birds.
      row.pigeon_id=null;
      if(birds&&ring&&row.member){const bird=sheetBird(birds,row.member.id,ring);if(bird){row.pigeon_id=bird.id;row.bondedRing=bird.ring_number;}else errors.push('Ring is not bonded to this member. Bond it on Bird bonding first.');}
      row.remarks=sheetRemarks(row.remarks_text);
      if(remarkLabels.length){const unknown=row.remarks.filter(token=>!remarkLabels.some(label=>label.toUpperCase()===token));if(unknown.length)errors.push(`Remark ${unknown.join(', ')} is not in the club's remarks list (Entry remarks).`);row.remarks=row.remarks.map(token=>remarkLabels.find(label=>label.toUpperCase()===token)||token);}
      // Club settings: an RFID bird may go without a sticker when the club made it optional.
      const rfidBird=row.pigeon_id&&birds?.find(item=>item.id===row.pigeon_id)?.nfc_tag&&birds.find(item=>item.id===row.pigeon_id).bond_type!=='ring';
      row.noSticker=!barcode&&stickerRule==='optional'&&Boolean(rfidBird);
      if(!barcode&&!row.noSticker)errors.push(row.barcodeScanError||'Barcode is missing.');
      else if(row.barcodeScanError)errors.push(row.barcodeScanError);
      if(barcode.length>120)errors.push('Barcode is longer than 120 characters.');
      if(registryError&&barcode)errors.push('Could not verify the sticker registry. Check the connection.');
      else if(barcode&&!registered.has(barcode))errors.push('Barcode is not registered by Super Admin.');
      const savedRing=String(row.bondedRing||ring).toUpperCase();if(ring&&raceEntries.some(entry=>String(entry.pigeon_ring||'').toUpperCase()===savedRing||(row.pigeon_id&&entry.pigeon_id===row.pigeon_id)))errors.push('Ring is already registered for this race.');
      if(barcode&&raceEntries.some(entry=>entry.barcode===barcode))errors.push('Barcode is already registered for this race.');
      if(ring&&seenRings.has(ring))errors.push('Ring is duplicated in this scan.');
      if(barcode&&seenCodes.has(barcode))errors.push('Barcode is duplicated in this scan.');
      if(ring)seenRings.add(ring);if(barcode)seenCodes.add(barcode);row.errors=errors;if(!errors.length)ready++;else errorCount++;
      if(indicator){indicator.textContent=errors.length?errors.join(' '):row.noSticker?'Ready to save · no sticker: clocked by RFID only':'Ready to save';indicator.classList.toggle('has-error',errors.length>0);indicator.classList.toggle('is-ready',!errors.length);indicator.classList.remove('is-saved');}
      rowElement?.classList.toggle('has-errors',errors.length>0);rowElement?.classList.remove('is-saved');
    }
    saveButton.disabled=!ready||!raceId;saveButton.textContent=ready?`Save ${ready} valid entr${ready===1?'y':'ies'}`:'Save valid entries';count.textContent=`${rows.length} items · ${savedCount} saved · ${ready} ready · ${errorCount} errors`;
  }
  // The preview shows the table the reader found: each row's Member ID, Ring,
  // Remarks and Sticker cells, so the photo can be rotated or retaken before reading.
  const COLUMN_STYLES=[['Member ID','#2563eb'],['Ring','#16a34a'],['Remarks','#f97316'],['Sticker','#9333ea']];
  const drawGridOverlay=(context,found)=>{
    const keys=['memberRegion','ringRegion','remarksRegion','barcodeRegion'],line=Math.max(2,Math.round(context.canvas.width/450));
    found.forEach((row,index)=>keys.forEach((key,k)=>{const g=row[key];if(!g)return;const [label,colour]=COLUMN_STYLES[k];context.fillStyle=`${colour}22`;context.strokeStyle=colour;context.lineWidth=line;context.fillRect(g.left,g.top,g.right-g.left,g.bottom-g.top);context.strokeRect(g.left+line,g.top+line,g.right-g.left-2*line,g.bottom-g.top-2*line);
      if(!index){const size=Math.max(14,Math.round(context.canvas.width/70));context.font=`700 ${size}px sans-serif`;const width=context.measureText(label).width+size;context.fillStyle=colour;context.fillRect(g.left,g.top-size*1.6,width,size*1.5);context.fillStyle='#fff';context.fillText(label,g.left+size/2,g.top-size*.45);}}));
    const size=Math.max(14,Math.round(context.canvas.width/70));context.font=`700 ${size}px sans-serif`;found.forEach(row=>{const g=row.memberRegion;context.fillStyle='#0f2a44';context.fillText(row.sheetRow,g.left-size*1.6,(g.top+g.bottom)/2+size/3);});
  };
  const drawPreview=()=>{if(!sourceCanvas)return;const rotated=rotateDocumentCanvas(sourceCanvas,rotation);previewCanvas.width=rotated.width;previewCanvas.height=rotated.height;const context=previewCanvas.getContext('2d');context.drawImage(rotated,0,0);preview.hidden=false;rotateButton.disabled=false;readButton.disabled=false;alignButton.disabled=false;
    let found=[];try{const grid=detectTableGrid(rotated);found=grid?entrySheetRowsFromGrid(grid,rotated):[];}catch(error){console.warn('Table check failed:',error);}
    if(!found.length&&alignedGuide&&!rotation)found=entrySheetRowsFromGuide(rotated,alignedGuide);
    if(found.length)drawGridOverlay(context,found);
    gridNote.hidden=false;gridNote.className=`entry-sheet-grid-note ${found.length?'is-ok':'is-bad'}`;
    gridNote.innerHTML=found.length?`<strong>${alignedGuide&&!rotation?'Aligned on the guide':'Table found'}: ${found.length} row${found.length===1?'':'s'}.</strong> Check that the coloured boxes sit on the Member ID, Ring, Remarks and Sticker columns. If they do not, press <strong>Align on guide</strong>, rotate the photo, or take a new one straight on.`:'<strong>Table not found.</strong> Rotate the photo until the text is upright, or take a new photo straight on with the whole form inside and no shadows, or press <strong>Align on guide</strong> and place the corners yourself. The text can still be read without the table, but less reliably.';};
  view.querySelector('[data-download-entry-template]').onclick=async event=>{
    const button=event.currentTarget;button.disabled=true;
    try{
      const XLSX=await loadSpreadsheetParser(),workbook=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([['No.','Member ID','Ring Number','Remarks','Barcode Number']]),instructions=XLSX.utils.aoa_to_sheet([['Race entry Excel template'],['Fill one pigeon per row on the Race Entries sheet.'],['Required: Member ID, Ring Number, Barcode Number.'],['No. and Remarks are optional. Remarks: the club\'s remarks separated by /, for example P1/P2/P3.'],['Member ID must already exist in this club.'],['Barcode Number must already be registered by Super Admin.'],['Enter barcode values as Text to preserve leading zeroes.'],['Barcode pictures in the Barcode Number column are decoded when importing .xlsx files.'],['Import the completed workbook in Admin → Race entries, review red errors, then save valid entries.']]);
      sheet['!cols']=[{wch:10},{wch:20},{wch:24},{wch:24},{wch:24}];instructions['!cols']=[{wch:100}];XLSX.utils.book_append_sheet(workbook,sheet,'Race Entries');XLSX.utils.book_append_sheet(workbook,instructions,'Instructions');XLSX.writeFile(workbook,'avilonx-race-entries-template.xlsx');message('Race entry Excel template downloaded. Fill one pigeon per row, then import it for review.','success');
    }catch(error){message(error.message||'Could not create the Excel template.','error');}
    finally{button.disabled=false;}
  };
  view.querySelector('[data-open-entry-excel]').onclick=()=>{if(!Number(raceSelect.value)){message('Choose the race schedule for this file first.','error');raceSelect.focus();return;}excelFileInput.click();};
  excelFileInput.onchange=async()=>{
    const file=excelFileInput.files?.[0];if(!file)return;
    status.textContent='Reading the Excel file…';saveButton.disabled=true;
    try{
      if(file.size>10*1024*1024)throw new Error('Choose an Excel file smaller than 10 MB.');
      const XLSX=await loadSpreadsheetParser(),fileBuffer=await file.arrayBuffer();rows=entrySheetRowsFromWorksheet(XLSX,fileBuffer);sourceCanvas=null;rotation=0;fileInput.value='';preview.hidden=true;readButton.disabled=true;rotateButton.disabled=true;
      const missingCodes=rows.filter(row=>!row.barcode.trim());
      if(missingCodes.length){
        if(/\.xlsx$/i.test(file.name)){
          try{
            status.textContent='Looking for barcode pictures in the Barcode Number column…';const images=await extractExcelBarcodeImages(fileBuffer,rows[0]?.barcodeExcelColumn);
            if(images.length){const imageRows=new Set(images.map(image=>image.rowNumber)),barcodeReader=await loadDocumentBarcodeReader();await decodeExcelBarcodeImages(images,rows,barcodeReader,(current,total)=>{status.textContent=`Scanning barcode pictures… ${current} of ${total}`;});for(const row of missingCodes)if(!row.barcode.trim()&&!row.barcodeScanError)row.barcodeScanError=imageRows.has(row.sourceRowNumber)?'Barcode picture could not be decoded. Type the printed number or upload a clear photo/PDF.':'No barcode picture or number was found in this row.';}
            else missingCodes.forEach(row=>row.barcodeScanError='Barcode number is blank and no embedded picture was found. Type the number or upload a clear photo/PDF.');
          }catch(error){console.warn('Embedded Excel barcode scan failed:',error);missingCodes.forEach(row=>{if(!row.barcode.trim())row.barcodeScanError='Could not scan the barcode picture in this workbook. Type the printed number or upload a clear photo/PDF.';});}
        }else missingCodes.forEach(row=>row.barcodeScanError='Barcode number is blank. For barcode pictures, import as .xlsx or upload a clear photo/PDF.');
      }
      redrawRows();status.textContent=`Loaded ${rows.length} item${rows.length===1?'':'s'} from Excel. Red rows show errors; review them before saving.`;await validateRows();review.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){rows=[];redrawRows();status.textContent=error.message||'Could not read this Excel file.';message(status.textContent,'error');}
    finally{excelFileInput.value='';}
  };
  fileInput.onchange=async()=>{const file=fileInput.files?.[0];if(!file)return;alignedGuide=null;rows=[];redrawRows();readButton.disabled=true;rotateButton.disabled=true;status.textContent='Preparing the document…';try{sourceCanvas=await documentFileToCanvas(file);rotation=0;drawPreview();status.textContent=`${file.name} is ready. Rotate if needed, then read it.`;}catch(error){sourceCanvas=null;preview.hidden=true;status.textContent=error.message;message(error.message,'error');}};
  // Camera with a guide: line the form up with the frame; the boxes turn green
  // when the table is found, then take the photo.
  cameraButton.onclick=async()=>{
    if(!navigator.mediaDevices?.getUserMedia){message('This browser cannot open the camera here. Use Choose File (it can take a photo on phones).','error');return;}
    let stream=null,timer=null,busy=false;
    const dialog=document.createElement('dialog');dialog.className='sheet-camera';
    dialog.innerHTML='<div class="sheet-camera-stage"><video playsinline muted autoplay></video><canvas class="sheet-camera-overlay"></canvas><div class="sheet-camera-frame" aria-hidden="true"><span>Member ID</span><span>Ring</span><span>Remarks</span><span>Sticker</span></div></div><p class="sheet-camera-status" data-camera-status>Hold the form upright inside the frame, straight on, with good light.</p><div class="sheet-camera-actions"><button type="button" class="button secondary" data-camera-cancel>Cancel</button><button type="button" class="button primary" data-camera-take>Take photo</button></div>';
    document.body.append(dialog);
    const video=dialog.querySelector('video'),overlay=dialog.querySelector('.sheet-camera-overlay'),cameraStatus=dialog.querySelector('[data-camera-status]');
    const close=()=>{clearInterval(timer);stream?.getTracks().forEach(track=>track.stop());dialog.close();dialog.remove();};
    dialog.querySelector('[data-camera-cancel]').onclick=close;dialog.addEventListener('cancel',close);
    try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:2560},height:{ideal:1920}},audio:false});}catch(error){dialog.remove();message('The camera could not be opened. Allow camera access, or use Choose File.','error');return;}
    video.srcObject=stream;try{dialog.showModal();}catch{dialog.setAttribute('open','');}
    // Live check: find the table in the camera picture about twice a second.
    timer=setInterval(()=>{
      if(busy||!video.videoWidth)return;busy=true;
      try{const scale=Math.min(1,900/Math.max(video.videoWidth,video.videoHeight)),frame=document.createElement('canvas');frame.width=Math.round(video.videoWidth*scale);frame.height=Math.round(video.videoHeight*scale);frame.getContext('2d').drawImage(video,0,0,frame.width,frame.height);
        const grid=detectTableGrid(frame),found=grid?entrySheetRowsFromGrid(grid,frame):[];
        overlay.width=frame.width;overlay.height=frame.height;const context=overlay.getContext('2d');context.clearRect(0,0,overlay.width,overlay.height);if(found.length)drawGridOverlay(context,found);
        dialog.classList.toggle('is-found',found.length>0);cameraStatus.textContent=found.length?`Table found: ${found.length} row${found.length===1?'':'s'}. Hold still and take the photo.`:'Looking for the table… keep the whole form inside the frame, upright and straight on.';
      }catch(error){console.warn('Live table check failed:',error);}finally{busy=false;}
    },500);
    dialog.querySelector('[data-camera-take]').onclick=()=>{
      if(!video.videoWidth)return;const scale=Math.min(1,2600/Math.max(video.videoWidth,video.videoHeight)),canvas=document.createElement('canvas');canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);canvas.getContext('2d',{willReadFrequently:true}).drawImage(video,0,0,canvas.width,canvas.height);
      close();rows=[];redrawRows();sourceCanvas=canvas;rotation=0;alignedGuide=null;fileInput.value='';drawPreview();status.textContent='Photo taken. Check the boxes on the preview, then read it.';
    };
  };
  // Align on guide: drag the 4 corners onto the table's corners; the guide's
  // columns and rows follow, then the table is straightened before reading.
  alignButton.onclick=()=>{
    if(!sourceCanvas)return;
    const photo=rotateDocumentCanvas(sourceCanvas,rotation),corners=tableCorners(photo);
    const dialog=document.createElement('dialog');dialog.className='sheet-align';
    dialog.innerHTML=`<div class="sheet-align-head"><strong>Align on guide</strong><span>Drag the 4 round handles onto the corners of the table (from the top of the LOFT NAME heading to the bottom of the last row). The coloured guide shows where each column and row is read.</span></div>
      <div class="sheet-align-stage"><canvas></canvas></div>
      <div class="sheet-align-actions"><label class="field"><span>Rows on the form</span><input type="number" min="1" max="60" step="1" value="${alignedGuide?.rows||FORM_GUIDE.rows}" data-align-rows inputmode="numeric"></label><button type="button" class="button secondary" data-align-rotate>Rotate 90°</button><button type="button" class="button secondary" data-align-reset>Find again</button><span class="sheet-align-spacer"></span><button type="button" class="button secondary" data-align-cancel>Cancel</button><button type="button" class="button primary" data-align-apply>Use this alignment</button></div>`;
    document.body.append(dialog);
    const canvas=dialog.querySelector('canvas'),rowsInput=dialog.querySelector('[data-align-rows]');
    let image=photo,points=corners,drag=-1;
    const guide=()=>({...FORM_GUIDE,rows:Math.max(1,Math.min(60,Math.round(Number(rowsInput.value)||FORM_GUIDE.rows)))});
    const draw=()=>{
      canvas.width=image.width;canvas.height=image.height;const c=canvas.getContext('2d');c.drawImage(image,0,0);
      const g=guide(),line=Math.max(2,Math.round(image.width/500)),at=(u,v)=>quadPoint(points,u,v);
      c.fillStyle='#0f2a4433';c.beginPath();c.rect(0,0,image.width,image.height);points.slice().reverse().forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill('evenodd');
      const colours=['#64748b','#2563eb','#16a34a','#f97316','#9333ea'];
      for(let k=0;k<5;k++){c.fillStyle=`${colours[k]}26`;c.beginPath();[[g.columns[k],0],[g.columns[k+1],0],[g.columns[k+1],1],[g.columns[k],1]].forEach(([u,v],i)=>{const [x,y]=at(u,v);i?c.lineTo(x,y):c.moveTo(x,y);});c.closePath();c.fill();}
      c.lineWidth=line;c.strokeStyle='#f05a00';
      const segment=(a,b)=>{c.beginPath();const p=at(...a),q=at(...b);c.moveTo(p[0],p[1]);c.lineTo(q[0],q[1]);c.stroke();};
      g.columns.forEach(u=>segment([u,0],[u,1]));
      const rowLines=[0,g.header,...Array.from({length:g.rows},(_,i)=>g.header+(1-g.header)*(i+1)/g.rows)];
      c.strokeStyle='#f05a00aa';c.lineWidth=Math.max(1,line*.6);rowLines.forEach(v=>segment([0,v],[1,v]));
      const size=Math.max(14,Math.round(image.width/60));c.font=`700 ${size}px sans-serif`;
      ['Member ID','Ring','Remarks','Sticker'].forEach((label,k)=>{const [x,y]=at((g.columns[k+1]+g.columns[k+2])/2,g.header/2);c.fillStyle=colours[k+1];const w=c.measureText(label).width+size*.8;c.fillRect(x-w/2,y-size*.75,w,size*1.5);c.fillStyle='#fff';c.fillText(label,x-w/2+size*.4,y+size*.35);});
      const r=Math.max(12,Math.round(image.width/55));points.forEach(([x,y])=>{c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle='#f05a00';c.fill();c.lineWidth=line;c.strokeStyle='#fff';c.stroke();});
    };
    const toCanvas=event=>{const box=canvas.getBoundingClientRect();return [(event.clientX-box.left)*canvas.width/box.width,(event.clientY-box.top)*canvas.height/box.height];};
    canvas.addEventListener('pointerdown',event=>{const [x,y]=toCanvas(event),reach=Math.max(28,canvas.width/18);let best=-1,distance=Infinity;points.forEach(([px,py],i)=>{const d=Math.hypot(px-x,py-y);if(d<distance){distance=d;best=i;}});if(distance<=reach*2.2){drag=best;canvas.setPointerCapture(event.pointerId);event.preventDefault();}});
    canvas.addEventListener('pointermove',event=>{if(drag<0)return;const [x,y]=toCanvas(event);points=points.map((p,i)=>i===drag?[Math.max(0,Math.min(canvas.width,x)),Math.max(0,Math.min(canvas.height,y))]:p);draw();});
    const stop=()=>{drag=-1;};canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);
    rowsInput.addEventListener('input',draw);
    dialog.querySelector('[data-align-rotate]').onclick=()=>{rotation=(rotation+90)%360;image=rotateDocumentCanvas(sourceCanvas,rotation);points=tableCorners(image);draw();};
    dialog.querySelector('[data-align-reset]').onclick=()=>{points=tableCorners(image);draw();};
    const close=()=>{dialog.close();dialog.remove();};
    dialog.querySelector('[data-align-cancel]').onclick=()=>{close();drawPreview();};dialog.addEventListener('cancel',()=>dialog.remove());
    dialog.querySelector('[data-align-apply]').onclick=()=>{
      const straight=straightenTable(image,points);close();
      rows=[];redrawRows();sourceCanvas=straight;rotation=0;alignedGuide=guide();drawPreview();
      status.textContent='Aligned: the table was straightened. Check the boxes on the preview, then read it.';
    };
    draw();try{dialog.showModal();}catch{dialog.setAttribute('open','');}
  };
  rotateButton.onclick=()=>{rotation=(rotation+90)%360;drawPreview();status.textContent=`Preview rotated ${rotation}°. Read it when the text is upright.`;};
  readButton.onclick=async()=>{
    if(!sourceCanvas)return;if(!Number(raceSelect.value)){message('Choose the race schedule for this sheet first.','error');raceSelect.focus();return;}
    readButton.disabled=true;rotateButton.disabled=true;status.textContent='Loading the document reader…';let worker=null;
    try{
      const OCR=await loadDocumentOCR();worker=await OCR.createWorker('eng',1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',langPath:'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int',logger:progress=>{if(progress.status==='recognizing text')status.textContent=`Reading document… ${Math.round((progress.progress||0)*100)}%`;else if(progress.status)status.textContent=`${progress.status}…`;}});
      const rotated=rotateDocumentCanvas(sourceCanvas,rotation),grid=detectTableGrid(rotated);cellSource=rotated;
      // A photo of the loading form: rows from its ruled table, then each cell read on its own.
      if(grid)rows=entrySheetRowsFromGrid(grid,rotated);
      if((!grid||!rows.length)&&alignedGuide&&!rotation)rows=entrySheetRowsFromGuide(rotated,alignedGuide);
      if(!rows.length){const result=await worker.recognize(rotated);rows=entrySheetRowsFromOCR(result.data,rotated);}
      if(!rows.length){status.textContent='No rows were detected. Rotate the document or use a clearer scan, then try again.';review.hidden=true;return;}
      status.textContent=`Detected ${rows.length} item${rows.length===1?'':'s'}. Checking handwritten IDs and ring numbers…`;
      status.textContent=`Detected ${rows.length} item${rows.length===1?'':'s'}. Scanning each barcode…`;
      try{const barcodeReader=await loadDocumentBarcodeReader();await scanSheetBarcodes(rotated,rows,barcodeReader,(current,total)=>{status.textContent=`Scanning barcode images… ${current} of ${total}`;});}
      catch(error){console.warn('Race-sheet barcode decoding is unavailable:',error);rows.forEach(row=>{row.barcodeDetected=false;row.barcodeScanError='Barcode scanner could not load. Type or confirm this barcode manually.';});}
      status.textContent='Reading the handwriting…';
      try{await refineHandwrittenEntryFields(worker,rotated,rows,members,(field,current,total)=>{status.textContent=`Reading ${field.toLowerCase()}… ${current} of ${total}`;});}catch(error){console.warn('Handwriting OCR refinement failed:',error);}
      redrawRows();
      redrawRows();status.textContent=`Scanned ${rows.length} item${rows.length===1?'':'s'}. Red rows show the errors to fix; review the OCR values before saving.`;await validateRows();review.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){status.textContent=error.message||'Could not read this document.';message(status.textContent,'error');}
    finally{if(worker)await worker.terminate();readButton.disabled=!sourceCanvas;rotateButton.disabled=!sourceCanvas;}
  };
  raceSelect.onchange=()=>{if(rows.length)validateRows();};
  view.querySelector('[data-clear-sheet]').onclick=()=>{rows=[];sourceCanvas=null;rotation=0;fileInput.value='';excelFileInput.value='';preview.hidden=true;review.hidden=true;readButton.disabled=true;rotateButton.disabled=true;saveButton.disabled=true;status.textContent='Choose the race schedule above, then upload a photo/PDF or import an Excel file.';};
  saveButton.onclick=async()=>{
    await validateRows();const race=races.find(item=>item.id===Number(raceSelect.value)),valid=rows.filter(row=>!row.saved&&!row.errors.length&&row.member);if(!race||!valid.length){message('There are no valid rows to save. Correct the red rows in the table.','error');return;}
    const payload=valid.map(row=>({race_id:race.id,member_id:row.member.id,pigeon_ring:String(row.bondedRing||row.pigeon_ring).trim().toUpperCase(),barcode:row.barcode.trim()||null,...(row.remarks?.length?{remarks:row.remarks}:{}),pooling:0,category:'Open Category',race_type:'Regular Race/Set',distance_m:distanceMeters(race.release_latitude,race.release_longitude,row.member.latitude,row.member.longitude),...(row.pigeon_id?{pigeon_id:row.pigeon_id}:{})}));
    saveButton.disabled=true;saveButton.textContent='Saving…';const {error}=await supabase.from('race_entries').insert(payload);if(error){message(dbError(error),'error');await validateRows();return;}
    valid.forEach(row=>{row.saved=true;row.errors=[];});entries.unshift(...payload.map((entry,index)=>({...entry,id:`sheet-entry-${Date.now()}-${index}`})));drawRegistered();redrawRows();await validateRows();
    const errorsLeft=rows.filter(row=>!row.saved).length;status.textContent=errorsLeft?`Saved ${valid.length} pigeon${valid.length===1?'':'s'}; ${errorsLeft} row${errorsLeft===1?'':'s'} still have errors.`:`Saved ${valid.length} pigeon${valid.length===1?'':'s'}. All scanned items remain visible in the table.`;message(status.textContent,errorsLeft?'info':'success');
  };
}
