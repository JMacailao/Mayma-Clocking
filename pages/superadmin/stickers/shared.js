import { escapeHTML, message, pageUrl } from '../../../assets/js/shared.js';

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

// Ticket size and A4 sheet layout: the smallest ticket that stays readable and
// scannable, 70 mm x 13 mm, printed in two columns, 21 down (42 per A4). Each ticket has
// two identical number stubs and, on the right, the barcode piece, split by
// thin grey dashed lines.
// Tested with the app's scanner on blurred, lower-resolution images: bars of
// about 0.28 mm (a 28 mm barcode) are the narrowest that read reliably, and a
// solid divider next to the barcode stops it reading, so the divider is dashed.
// Numbers are 7 pt. The page margins centre the grid.
export const CODES_PER_ROW=2,STICKER_ROWS=21,STICKERS_PER_PAGE=CODES_PER_ROW*STICKER_ROWS;
const PAGE_MARGIN='10.5mm 35mm';
// Barcode drawn without its own margin: the barcode piece keeps about 2.9 mm
// (10 bar widths) of white on each side, the quiet zone scanners need.
export const STICKER_BARCODE={height:28,width:1.2,margin:0};
export const DEFAULT_STICKER_LABEL='MAYMA';
// Layout shared by the screen preview and the printed/Word sheet, in real units.
const STICKER_CSS='.sticker-sheet{width:140mm;table-layout:fixed;border-collapse:collapse;background:#fff}.sticker-sheet>tbody>tr>td{height:12.8mm;max-height:12.8mm;padding:0;border:.5pt solid #e1e6e2;overflow:hidden;vertical-align:middle;text-align:center}.sticker-sheet>tbody>tr>td.sticker-number-part{width:17.8mm}.sticker-sheet>tbody>tr>td.sticker-number-part+td.sticker-number-part{border-left:.5pt dashed #999}.sticker-sheet>tbody>tr>td.sticker-code-part{width:33.8mm;border-left:.5pt dashed #999}.sticker-brand-line{display:block;height:2.4mm;line-height:2.4mm;margin-bottom:.6mm;white-space:nowrap;text-align:center}.sticker-logo{display:inline;height:2.3mm;width:auto;vertical-align:middle;margin-right:.5mm}.sticker-brand-text{display:inline;vertical-align:middle;font-family:Arial,Helvetica,sans-serif;font-size:5pt;font-weight:700;color:#555}.sticker-number{display:block;font-family:Arial,Helvetica,sans-serif;font-size:7pt;font-weight:700;line-height:1.1;color:#111;white-space:nowrap;text-align:center}.sticker-code-line{display:block;font-family:Arial,Helvetica,sans-serif;font-size:6.5pt;font-weight:700;line-height:1.1;color:#111;white-space:nowrap;text-align:center}.sticker-code-part img,.sticker-code-part svg{display:block;width:28mm;height:6.5mm;margin:0 auto .5mm}';

// The barcode printed on a sticker: the secret scratch code when there is one.
export const stickerBarcodeValue=code=>code.scratch||code.number;
// The two pieces of one code: the number piece on the left (the visible sticker
// number, used to register the race entry) and the barcode piece on the right
// (the sticker number on top, the barcode of the secret code, and the number the
// barcode decodes to underneath).
// barcode is an <img> (print) or <svg> (preview).
function stickerPieces(code,barcode,label,logo){
  const brand=logo||label?`<span class="sticker-brand-line">${logo?`<img class="sticker-logo" src="${logo}" alt="">`:''}${label?`<span class="sticker-brand-text">${escapeHTML(label)}</span>`:''}</span>`:'';
  const stub=`<td class="sticker-number-part">${brand}<span class="sticker-number">${escapeHTML(code.number)}</span></td>`;
  return `${stub}${stub}<td class="sticker-code-part">${barcode}<span class="sticker-code-line">${escapeHTML(stickerBarcodeValue(code))}</span></td>`;
}
// The app logo, cropped to its drawing and turned grey, as a small PNG data URL
// that works on screen, in the print window and in the Word file. '' if it
// cannot be loaded.
let stickerLogoPromise=null;
export function stickerLogoDataUrl(){
  if(!stickerLogoPromise)stickerLogoPromise=(async()=>{
    const image=new Image();image.src=pageUrl('assets/images/clocking-logo.png');await image.decode();
    const source=document.createElement('canvas');source.width=image.naturalWidth;source.height=image.naturalHeight;
    const sctx=source.getContext('2d',{willReadFrequently:true});sctx.drawImage(image,0,0);
    const {data,width,height}=sctx.getImageData(0,0,source.width,source.height);
    let left=width,right=-1,top=height,bottom=-1;
    for(let y=0;y<height;y+=2)for(let x=0;x<width;x+=2){const k=(y*width+x)*4;if(data[k+3]>20&&(data[k]<235||data[k+1]<235||data[k+2]<235)){if(x<left)left=x;if(x>right)right=x;if(y<top)top=y;if(y>bottom)bottom=y;}}
    if(right<left)return '';
    const cropW=right-left+1,cropH=bottom-top+1,outH=96,outW=Math.max(1,Math.round(cropW*outH/cropH));
    const out=document.createElement('canvas');out.width=outW;out.height=outH;const octx=out.getContext('2d');
    octx.fillStyle='#fff';octx.fillRect(0,0,outW,outH);octx.drawImage(source,left,top,cropW,cropH,0,0,outW,outH);
    const pixels=octx.getImageData(0,0,outW,outH);
    for(let k=0;k<pixels.data.length;k+=4){const grey=Math.round(.3*pixels.data[k]+.59*pixels.data[k+1]+.11*pixels.data[k+2]);pixels.data[k]=pixels.data[k+1]=pixels.data[k+2]=grey;}
    octx.putImageData(pixels,0,0);
    return out.toDataURL('image/png');
  })().catch(error=>{console.warn('Sticker logo could not load:',error);stickerLogoPromise=null;return '';});
  return stickerLogoPromise;
}
const emptyPieces='<td class="sticker-number-part sticker-empty" aria-hidden="true"></td><td class="sticker-number-part sticker-empty" aria-hidden="true"></td><td class="sticker-code-part sticker-empty" aria-hidden="true"></td>';
// Screen preview of one code (two cells).
export function stickerPreviewCell(code,label=DEFAULT_STICKER_LABEL,logo=''){
  if(!code)return emptyPieces;
  const value=stickerBarcodeValue(code);
  return stickerPieces(code,`<svg data-sticker-preview="${escapeHTML(value)}" aria-label="Barcode ${escapeHTML(value)}" preserveAspectRatio="none"></svg>`,label,logo);
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
export function wordStickerDocument(pages,label=DEFAULT_STICKER_LABEL,logo=''){
  const cell=code=>code?stickerPieces(code,`<img src="${code.image}" alt="">`,label,logo):emptyPieces;
  const sheets=pages.map(page=>`<section class="sticker-page">${stickerSheetTable(page,cell)}</section>`).join('');
  return `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Mayma barcode stickers</title><style>@page{size:210mm 297mm;margin:${PAGE_MARGIN}}body{font-family:Arial,sans-serif;margin:0}.sticker-page{page-break-after:always;break-after:page}.sticker-page:last-child{page-break-after:auto;break-after:auto}${STICKER_CSS}</style></head><body>${sheets}</body></html>`;
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
