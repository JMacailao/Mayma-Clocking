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
// Rendered as a PNG at 4x its natural size, keeping the aspect ratio, so the
// bars stay sharp when printed small.
export async function barcodePngDataUrl(code,options){
  await loadBarcodeRenderer();
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');drawBarcode(svg,code,options);
  const markup=new XMLSerializer().serializeToString(svg),blob=new Blob([markup],{type:'image/svg+xml;charset=utf-8'}),objectUrl=URL.createObjectURL(blob);
  try{
    const image=new Image();image.src=objectUrl;
    if(image.decode)await image.decode();else await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;});
    const scale=4,canvas=document.createElement('canvas');canvas.width=Math.max(1,image.naturalWidth*scale);canvas.height=Math.max(1,image.naturalHeight*scale);
    const context=canvas.getContext('2d');if(!context)throw new Error('Could not prepare barcode images.');
    context.imageSmoothingEnabled=false;context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/png');
  }finally{URL.revokeObjectURL(objectUrl);}
}

// Sticker size and A4 sheet layout. Each code is printed as two 4 cm x 1 cm
// pieces side by side: a barcode piece and a number piece. An A4 page with 1 cm
// margins holds 2 codes (4 pieces) per row and 27 rows.
export const CODES_PER_ROW=2,STICKER_ROWS=27,STICKERS_PER_PAGE=CODES_PER_ROW*STICKER_ROWS;
// Compact barcode for the small label: thin bars, no quiet-zone margin (the
// sticker's own padding provides it).
export const STICKER_BARCODE={height:28,width:1.2,margin:0};
export const DEFAULT_STICKER_LABEL='MAYMA';
// Layout shared by the screen preview and the printed/Word sheet, in real units.
const STICKER_CSS='.sticker-sheet{width:16cm;table-layout:fixed;border-collapse:collapse;background:#fff}.sticker-sheet>tbody>tr>td{width:3.97cm;height:.97cm;max-height:.97cm;padding:0;border:.5pt solid #cbd3cd;overflow:hidden;vertical-align:middle;text-align:center}.sticker-code-part img,.sticker-code-part svg{display:block;width:3.6cm;height:.5cm;margin:0 auto .03cm}.sticker-code-text{width:3.75cm;margin:0 auto;border-collapse:collapse;table-layout:fixed}.sticker-code-text td{padding:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;line-height:12px;color:#111;white-space:nowrap;overflow:hidden}.sticker-code-text td{text-align:center}.sticker-code-text .left{width:2.25cm;text-align:left}.sticker-code-text .right{width:1.5cm;text-align:right}.sticker-tag{width:3.75cm;margin:0 auto;border-collapse:collapse;table-layout:fixed}.sticker-tag td{padding:0;vertical-align:middle;white-space:nowrap;overflow:hidden}.sticker-tag .sticker-number{text-align:left;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;color:#111}.sticker-tag .sticker-brand-cell{width:1.5cm;text-align:right}.sticker-brand{display:inline-block;padding:.06cm .1cm;background:#111;color:#fff;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;line-height:12px;letter-spacing:.02em;-webkit-print-color-adjust:exact;print-color-adjust:exact}';

// The barcode printed on a sticker: the secret scratch code when there is one.
export const stickerBarcodeValue=code=>code.scratch||code.number;
// The two pieces of one code. barcode is an <img> (print) or <svg> (preview).
function stickerPieces(code,barcode,label){
  const text=code.scratch?`<table class="sticker-code-text"><tr><td class="left">${escapeHTML(code.number)}</td><td class="right">${escapeHTML(code.scratch)}</td></tr></table>`:`<table class="sticker-code-text"><tr><td>${escapeHTML(code.number)}</td></tr></table>`;
  const brand=label?`<td class="sticker-brand-cell"><span class="sticker-brand">${escapeHTML(label)}</span></td>`:'';
  return `<td class="sticker-code-part">${barcode}${text}</td><td class="sticker-number-part"><table class="sticker-tag"><tr><td class="sticker-number">${escapeHTML(code.number)}</td>${brand}</tr></table></td>`;
}
const emptyPieces='<td class="sticker-empty" aria-hidden="true"></td><td class="sticker-empty" aria-hidden="true"></td>';
// Screen preview of one code (two cells).
export function stickerPreviewCell(code,label=DEFAULT_STICKER_LABEL){
  if(!code)return emptyPieces;
  const value=stickerBarcodeValue(code);
  return stickerPieces(code,`<svg data-sticker-preview="${escapeHTML(value)}" aria-label="Barcode ${escapeHTML(value)}" preserveAspectRatio="xMidYMid meet"></svg>`,label);
}
export function drawStickerPreviews(root){
  root.querySelectorAll('[data-sticker-preview]').forEach(svg=>{drawBarcode(svg,svg.dataset.stickerPreview,STICKER_BARCODE);const w=svg.getAttribute('width'),h=svg.getAttribute('height');if(w&&h){svg.setAttribute('viewBox',`0 0 ${parseFloat(w)} ${parseFloat(h)}`);svg.removeAttribute('width');svg.removeAttribute('height');}});
}
export function stickerGroups(codes){const pages=[];for(let i=0;i<codes.length;i+=STICKERS_PER_PAGE)pages.push(codes.slice(i,i+STICKERS_PER_PAGE));return pages;}
// renderCode(code) returns the two <td> pieces of one code (or of an empty slot).
export function stickerSheetTable(codes,renderCode){
  const cells=[...codes];const rows=Math.ceil(cells.length/CODES_PER_ROW)||1;while(cells.length<rows*CODES_PER_ROW)cells.push(null);
  return `<table class="sticker-sheet"><tbody>${Array.from({length:rows},(_,row)=>`<tr>${cells.slice(row*CODES_PER_ROW,(row+1)*CODES_PER_ROW).map(code=>renderCode(code)).join('')}</tr>`).join('')}</tbody></table>`;
}
export const stickerPreviewStyle=()=>`<style>${STICKER_CSS}</style>`;
export function wordStickerDocument(pages,label=DEFAULT_STICKER_LABEL){
  const cell=code=>code?stickerPieces(code,`<img src="${code.image}" alt="">`,label):'<td></td><td></td>';
  const sheets=pages.map(page=>`<section class="sticker-page">${stickerSheetTable(page,cell)}</section>`).join('');
  return `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Mayma barcode stickers</title><style>@page{size:21cm 29.7cm;margin:1cm}body{font-family:Arial,sans-serif;margin:0}.sticker-page{page-break-after:always;break-after:page}.sticker-page:last-child{page-break-after:auto;break-after:auto}${STICKER_CSS}</style></head><body>${sheets}</body></html>`;
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
