import { escapeHTML, message } from '../../../assets/js/shared.js';

let barcodeRendererPromise=null;
export function loadBarcodeRenderer(){
  if(window.JsBarcode)return Promise.resolve(window.JsBarcode);
  if(!barcodeRendererPromise)barcodeRendererPromise=new Promise((resolve,reject)=>{
    let script=document.querySelector('[data-jsbarcode]');
    if(!script){script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/jsbarcode@3.12.1/dist/JsBarcode.all.min.js';script.crossOrigin='anonymous';script.dataset.jsbarcode='';document.head.append(script);}
    script.addEventListener('load',()=>window.JsBarcode?resolve(window.JsBarcode):reject(new Error('The barcode renderer did not load.')),{once:true});
    script.addEventListener('error',()=>reject(new Error('Could not load the barcode renderer. Check your internet connection.')),{once:true});
    if(window.JsBarcode)resolve(window.JsBarcode);
  }).catch(error=>{barcodeRendererPromise=null;throw error;});
  return barcodeRendererPromise;
}
export function drawBarcode(svg,code,{height=54,width=1.8}={}){
  window.JsBarcode(svg,String(code),{format:'CODE128',displayValue:false,margin:3,width,height,lineColor:'#17231d',background:'#ffffff'});
  svg.setAttribute('role','img');svg.setAttribute('aria-label',`Barcode ${code}`);
}
export async function barcodePngDataUrl(code,options){
  await loadBarcodeRenderer();
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');drawBarcode(svg,code,options);
  const markup=new XMLSerializer().serializeToString(svg),blob=new Blob([markup],{type:'image/svg+xml;charset=utf-8'}),objectUrl=URL.createObjectURL(blob);
  try{
    const image=new Image();image.src=objectUrl;
    if(image.decode)await image.decode();else await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;});
    const canvas=document.createElement('canvas');canvas.width=Math.max(480,image.naturalWidth*2);canvas.height=Math.max(150,image.naturalHeight*2);
    const context=canvas.getContext('2d');if(!context)throw new Error('Could not prepare barcode images.');
    context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/png');
  }finally{URL.revokeObjectURL(objectUrl);}
}
export const SCRATCH_BARCODE={height:34,width:1.4};
// Screen preview of one sticker: the visible sticker number on the left and the
// hidden scratch code (to be covered with scratch-off foil) on the right.
export function stickerPreviewCell(code){
  if(!code)return '<td class="sticker-cell sticker-empty" aria-hidden="true"></td>';
  const scratch=code.scratch?`<div class="sticker-scratch"><span class="sticker-scratch-title">SCRATCH TO CLOCK</span><svg data-sticker-scratch="${escapeHTML(code.scratch)}" aria-label="Scratch code ${escapeHTML(code.scratch)}"></svg><strong>${escapeHTML(code.scratch)}</strong></div>`:'';
  return `<td class="sticker-cell"><div class="sticker-label"><div class="sticker-main"><svg data-sticker-preview="${escapeHTML(code.number)}" aria-label="Barcode ${escapeHTML(code.number)}"></svg><strong>${escapeHTML(code.number)}</strong></div>${scratch}</div></td>`;
}
export function drawStickerPreviews(root){
  root.querySelectorAll('[data-sticker-preview]').forEach(svg=>drawBarcode(svg,svg.dataset.stickerPreview));
  root.querySelectorAll('[data-sticker-scratch]').forEach(svg=>drawBarcode(svg,svg.dataset.stickerScratch,SCRATCH_BARCODE));
}
export function stickerGroups(codes){const pages=[];for(let i=0;i<codes.length;i+=20)pages.push(codes.slice(i,i+20));return pages;}
export function stickerSheetTable(codes,renderCell){
  const cells=[...codes];while(cells.length<20)cells.push(null);
  return `<table class="sticker-sheet"><tbody>${Array.from({length:10},(_,row)=>`<tr>${cells.slice(row*2,row*2+2).map(renderCell).join('')}</tr>`).join('')}</tbody></table>`;
}
export function wordStickerDocument(pages){
  const cell=code=>{
    if(!code)return '<td class="sticker-cell"></td>';
    const main=`<img class="sticker-main-img" src="${code.image}" alt=""><div class="sticker-number">${escapeHTML(code.number)}</div>`;
    if(!code.scratch)return `<td class="sticker-cell">${main}</td>`;
    return `<td class="sticker-cell"><table class="sticker-label"><tr><td class="sticker-main">${main}</td><td class="sticker-scratch"><div class="sticker-scratch-title">SCRATCH TO CLOCK</div><img class="sticker-scratch-img" src="${code.scratchImage}" alt=""><div class="sticker-scratch-number">${escapeHTML(code.scratch)}</div></td></tr></table></td>`;
  };
  const sheets=pages.map(page=>`<section class="sticker-page">${stickerSheetTable(page,cell)}</section>`).join('');
  return `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Mayma barcode stickers</title><style>@page{size:21cm 29.7cm;margin:1cm}body{font-family:Arial,sans-serif;margin:0}.sticker-page{page-break-after:always;break-after:page}.sticker-page:last-child{page-break-after:auto;break-after:auto}.sticker-sheet{width:19cm;height:27.7cm;table-layout:fixed;border-collapse:collapse}.sticker-cell{width:9.5cm;height:2.77cm;border:.5pt solid #cbd3cd;text-align:center;vertical-align:middle;padding:2mm}.sticker-cell img{display:block;object-fit:contain;margin:0 auto 1mm}.sticker-main-img{width:7.5cm;height:1.25cm}.sticker-number{font-size:12px;font-weight:700;line-height:1.1}.sticker-label{width:100%;border-collapse:collapse;table-layout:fixed}.sticker-label td{vertical-align:middle;text-align:center;padding:0}.sticker-label .sticker-main{width:5.4cm}.sticker-label .sticker-main-img{width:5cm;height:1.2cm}.sticker-label .sticker-number{font-size:12px}.sticker-scratch{width:3.4cm;border:1pt dashed #6b7570;padding:1mm!important}.sticker-scratch-title{font-size:6pt;font-weight:700;letter-spacing:.5pt;color:#4a544f;margin-bottom:.5mm}.sticker-scratch-img{width:3cm;height:.8cm}.sticker-scratch-number{font-size:12px;font-weight:700;line-height:1.1}</style></head><body>${sheets}</body></html>`;
}
// Each button with data-sticker-scan-for="<input name>" opens the camera and
// fills that input with the scanned code.
export function bindStickerScanner(view,form){
  const buttons=[...view.querySelectorAll('[data-sticker-scan-for]')];let input=null,button=buttons[0];
  const dialog=view.querySelector('#sticker-camera-dialog'),camera=view.querySelector('#sticker-camera'),placeholder=view.querySelector('#sticker-camera-placeholder'),status=view.querySelector('#sticker-camera-status');
  let stream=null,controls=null,active=false,starting=false,session=0;
  const setStatus=text=>{status.textContent=text;status.hidden=!text;};
  const stop=(text='Camera stopped.')=>{session++;active=false;starting=false;controls?.stop();controls=null;camera.pause();stream?.getTracks().forEach(track=>track.stop());camera.srcObject?.getTracks().forEach(track=>track.stop());camera.srcObject=null;stream=null;camera.hidden=true;placeholder.hidden=false;button.disabled=false;button.removeAttribute('aria-busy');if(dialog.open)dialog.close();setStatus(text);};
  const capture=(value,scanControls)=>{const code=String(value||'').trim();if(!code||!active)return;session++;active=false;starting=false;(scanControls||controls)?.stop();controls=null;camera.pause();stream?.getTracks().forEach(track=>track.stop());camera.srcObject=null;stream=null;camera.hidden=true;placeholder.hidden=false;button.disabled=false;button.removeAttribute('aria-busy');if(dialog.open)dialog.close();input.value=code;input.focus();message('Code captured. Review it, then register the sticker.','info');};
  const cameraMessage=error=>{
    if(!window.isSecureContext)return 'Camera access needs a secure HTTPS page. Type the barcode number manually if HTTPS is unavailable.';
    if(!navigator.mediaDevices?.getUserMedia)return 'This browser does not provide camera access. Type the barcode number manually.';
    if(error?.name==='NotAllowedError'||error?.name==='PermissionDeniedError')return 'Camera permission was blocked. Allow camera access in browser settings, then try again.';
    if(error?.name==='NotFoundError'||error?.name==='DevicesNotFoundError')return 'No camera was found on this device.';
    if(error?.name==='NotReadableError'||error?.name==='TrackStartError')return 'The camera is busy in another app. Close it and try again.';
    if(error instanceof TypeError)return 'The barcode scanner could not load. Check your internet connection.';
    return 'Could not start the camera. Check permission and try again.';
  };
  const start=async()=>{
    if(active||starting)return;
    dialog.showModal();placeholder.querySelector('span:last-child').textContent='Waiting for camera access…';setStatus('Starting camera…');
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){placeholder.querySelector('span:last-child').textContent=cameraMessage();setStatus(cameraMessage());return;}
    const current=++session;starting=true;button.disabled=true;button.setAttribute('aria-busy','true');
    try{
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
      if(current!==session){stream.getTracks().forEach(track=>track.stop());return;}
      camera.srcObject=stream;camera.hidden=false;placeholder.hidden=true;camera.play().catch(()=>{});setStatus('Loading scanner…');
      const {BrowserMultiFormatReader}=await import('https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm');
      if(current!==session){stream.getTracks().forEach(track=>track.stop());return;}
      active=true;setStatus('Camera on. Hold the barcode steady in the frame.');
      controls=await new BrowserMultiFormatReader().decodeFromStream(stream,camera,(result,_error,scanControls)=>{if(result)capture(result.getText(),scanControls);});
      if(current!==session||!active){controls?.stop();return;}
      starting=false;button.disabled=false;button.removeAttribute('aria-busy');setStatus('Camera on. Hold the barcode steady in the frame.');
    }catch(error){
      if(current!==session)return;active=false;starting=false;controls?.stop();controls=null;stream?.getTracks().forEach(track=>track.stop());stream=null;camera.pause();camera.srcObject=null;camera.hidden=true;placeholder.hidden=false;placeholder.querySelector('span:last-child').textContent=cameraMessage(error);button.disabled=false;button.removeAttribute('aria-busy');setStatus(cameraMessage(error));console.error('Sticker barcode scanner could not start:',error);
    }
  };
  buttons.forEach(scanButton=>scanButton.onclick=()=>{if(active||starting)return;button=scanButton;input=form.elements[scanButton.dataset.stickerScanFor];start();});
  view.querySelectorAll('[data-close-sticker-camera]').forEach(el=>el.addEventListener('click',()=>stop()));
  dialog.addEventListener('cancel',event=>{event.preventDefault();stop();});
  dialog.addEventListener('click',event=>{if(event.target===dialog)stop();});
  const visibility=()=>{if(document.hidden&&(active||starting))stop('Camera stopped.');};
  document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',stop);
  return()=>{document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',stop);stop('');};
}
