import { supabase, escapeHTML, message, dbError, number, formatDate, ringLabel, tableRows, loadSpreadsheetParser, normalizeImportHeader, pageUrl } from '../../../assets/js/shared.js';
import { bindStickerScanner, stickerScannerDialogHtml } from '../../superadmin/stickers/shared.js';
import { birdPhotoUrls } from '../birds/page.js';
import { normalizeNfcUid, formatNfcUid, startPhoneNfc, NFC_HELP, readerHelperLink, listenForReaderKeys, listenForDeviceScans, usbReaderStatus } from '../../../assets/js/nfc.js';

let spreadsheetZipReaderPromise=null;
function loadSpreadsheetZipReader(){
  if(window.JSZip?.loadAsync)return Promise.resolve(window.JSZip);
  if(!spreadsheetZipReaderPromise)spreadsheetZipReaderPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';script.crossOrigin='anonymous';script.dataset.jszip='';
    script.onload=()=>window.JSZip?.loadAsync?resolve(window.JSZip):reject(new Error('The Excel image reader did not load.'));
    script.onerror=()=>reject(new Error('Could not load the Excel image reader. Check your internet connection.'));
    document.head.append(script);
  }).catch(error=>{spreadsheetZipReaderPromise=null;document.querySelector('[data-jszip]')?.remove();throw error;});
  return spreadsheetZipReaderPromise;
}
let documentOcrPromise=null;
function loadDocumentOCR(){
  if(window.Tesseract?.createWorker)return Promise.resolve(window.Tesseract);
  if(!documentOcrPromise)documentOcrPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';script.crossOrigin='anonymous';script.dataset.tesseract='';
    script.onload=()=>window.Tesseract?.createWorker?resolve(window.Tesseract):reject(new Error('The document reader did not load.'));
    script.onerror=()=>reject(new Error('Could not load the document reader. Check your internet connection.'));
    document.head.append(script);
  }).catch(error=>{documentOcrPromise=null;document.querySelector('[data-tesseract]')?.remove();throw error;});
  return documentOcrPromise;
}
let documentBarcodeReaderPromise=null;
function loadDocumentBarcodeReader(){
  if(!documentBarcodeReaderPromise)documentBarcodeReaderPromise=Promise.all([
    import('https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm'),
    import('https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/+esm')
  ]).then(([browserZXing,zxing])=>{
    const hints=new Map();hints.set(zxing.DecodeHintType.POSSIBLE_FORMATS,[browserZXing.BarcodeFormat.CODE_128,browserZXing.BarcodeFormat.CODE_39,browserZXing.BarcodeFormat.EAN_13,browserZXing.BarcodeFormat.EAN_8,browserZXing.BarcodeFormat.UPC_A,browserZXing.BarcodeFormat.UPC_E,browserZXing.BarcodeFormat.ITF,browserZXing.BarcodeFormat.CODABAR,browserZXing.BarcodeFormat.QR_CODE,browserZXing.BarcodeFormat.DATA_MATRIX,browserZXing.BarcodeFormat.PDF_417,browserZXing.BarcodeFormat.AZTEC]);hints.set(zxing.DecodeHintType.TRY_HARDER,true);
    return new browserZXing.BrowserMultiFormatReader(hints);
  }).catch(error=>{documentBarcodeReaderPromise=null;throw error;});
  return documentBarcodeReaderPromise;
}
async function scanSheetBarcodes(source,rows,reader,onProgress=()=>{}){
  for(let index=0;index<rows.length;index++){
    const row=rows[index],region=row.barcodeRegion;
    if(!region){row.barcodeScanError='Barcode area could not be located. Enter or correct the barcode manually.';onProgress(index+1,rows.length);continue;}
    const left=Math.max(0,Math.floor(region.left)),top=Math.max(0,Math.floor(region.top)),right=Math.min(source.width,Math.ceil(region.right)),bottom=Math.min(source.height,Math.ceil(region.bottom)),width=right-left,height=bottom-top;
    if(width<8||height<8){row.barcodeScanError='Barcode area could not be located. Enter or correct the barcode manually.';onProgress(index+1,rows.length);continue;}
    const scale=Math.min(3,Math.max(1,900/width)),crop=document.createElement('canvas');crop.width=Math.max(1,Math.round(width*scale));crop.height=Math.max(1,Math.round(height*scale));crop.getContext('2d').drawImage(source,left,top,width,height,0,0,crop.width,crop.height);
    let result=null;
    for(const angle of [0,90,270,180]){try{result=reader.decodeFromCanvas(angle?rotateDocumentCanvas(crop,angle):crop);break;}catch{}}
    const value=result?.getText?.().trim().replace(/\s+/g,'')||'';
    if(value){row.barcode=value;row.barcodeDetected=true;row.barcodeScanError='';}
    else{row.barcodeDetected=false;row.barcodeScanError='Barcode image was not detected. Type or correct the barcode.';}
    reader.reset?.();onProgress(index+1,rows.length);
  }
  return rows;
}
async function documentFileToCanvas(file){
  if(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf')){
    const pdfjs=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
    const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
    const page=await pdf.getPage(1),initial=page.getViewport({scale:1.7}),scale=Math.min(1,2600/Math.max(initial.width,initial.height)),viewport=page.getViewport({scale:1.7*scale});
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;return canvas;
  }
  if(!file.type.startsWith('image/'))throw new Error('Choose a photo or a PDF document.');
  let bitmap=null,image=null,objectUrl=null,width,height;
  try{
    if(window.createImageBitmap){try{bitmap=await createImageBitmap(file);width=bitmap.width;height=bitmap.height;}catch{bitmap=null;}}
    if(!bitmap){objectUrl=URL.createObjectURL(file);image=new Image();image.src=objectUrl;if(image.decode)await image.decode();else await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;});width=image.naturalWidth;height=image.naturalHeight;}
    const scale=Math.min(1,2600/Math.max(width,height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    canvas.getContext('2d',{willReadFrequently:true}).drawImage(bitmap||image,0,0,canvas.width,canvas.height);return canvas;
  }finally{bitmap?.close();if(objectUrl)URL.revokeObjectURL(objectUrl);}
}
function rotateDocumentCanvas(source,rotation){
  const sideways=rotation%180!==0,canvas=document.createElement('canvas');canvas.width=sideways?source.height:source.width;canvas.height=sideways?source.width:source.height;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.translate(canvas.width/2,canvas.height/2);context.rotate(rotation*Math.PI/180);context.drawImage(source,-source.width/2,-source.height/2);return canvas;
}
function documentGridRules(canvas){
  const {width,height}=canvas,rgba=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,width,height).data,xDark=new Uint32Array(width),yDark=new Uint32Array(height);let xSamples=0,ySamples=0;
  for(let y=0;y<height;y+=2){for(let x=0;x<width;x+=2){const i=(y*width+x)*4,gray=rgba[i]*.299+rgba[i+1]*.587+rgba[i+2]*.114;if(gray<145){xDark[x]++;yDark[y]++;}}}
  xSamples=Math.ceil(height/2);ySamples=Math.ceil(width/2);
  const collect=(counts,samples,size)=>{
    const density=Array.from(counts,amount=>amount/samples),peaks=[];
    for(let i=4;i<size-4;i+=2){const value=(density[i-2]+density[i]+density[i+2])/3;if(value<.28||value<density[i-4]||value<density[i+4])continue;peaks.push({position:i,strength:value});}
    const merged=[];for(const peak of peaks){const previous=merged[merged.length-1];if(previous&&peak.position-previous.position<=Math.max(7,size*.004)){if(peak.strength>previous.strength)merged[merged.length-1]=peak;}else merged.push(peak);}
    return merged;
  };
  return {vertical:collect(xDark,xSamples,width),horizontal:collect(yDark,ySamples,height)};
}
function barcodeGraphicPresent(canvas,left,right,top,bottom){
  left=Math.max(0,Math.floor(left));right=Math.min(canvas.width,Math.ceil(right));top=Math.max(0,Math.floor(top));bottom=Math.min(canvas.height,Math.ceil(bottom));const width=right-left,height=bottom-top;if(width<32||height<20)return false;
  const context=canvas.getContext('2d',{willReadFrequently:true}),threshold=Math.max(14,Math.floor(width*.055));let barcodeLikeLines=0;
  for(const ratio of [.34,.5,.64]){const y=Math.min(bottom-3,Math.max(top+3,Math.round(top+height*ratio))),data=context.getImageData(left,y,width,1).data;let previous=null,transitions=0,dark=0;
    for(let x=0;x<width;x++){const offset=x*4,isDark=(data[offset]*.299+data[offset+1]*.587+data[offset+2]*.114)<135;if(isDark)dark++;if(previous!==null&&isDark!==previous)transitions++;previous=isDark;}
    if(transitions>=threshold&&dark>width*.07&&dark<width*.82)barcodeLikeLines++;
  }
  return barcodeLikeLines>=2;
}
function entrySheetRowsFromOCR(ocrData,canvas){
  const rules=documentGridRules(canvas),fallback=[0,.13,.35,.55,.76,1].map(ratio=>Math.round(canvas.width*ratio));
  let columns=fallback;
  if(rules.vertical.length>=6){columns=rules.vertical.sort((a,b)=>b.strength-a.strength).slice(0,6).sort((a,b)=>a.position-b.position).map(rule=>rule.position);}
  const allWords=ocrData.words?.length?ocrData.words:(ocrData.lines||[]).flatMap(line=>line.words||[]),wordCenterY=word=>(word.bbox.y0+word.bbox.y1)/2;
  let groups=[],hasRowRules=false;
  if(rules.horizontal.length>=2){
    const yBounds=[0,...rules.horizontal.map(rule=>rule.position),canvas.height];
    for(let index=1;index<yBounds.length;index++){const top=yBounds[index-1],bottom=yBounds[index];if(bottom-top<12)continue;const words=allWords.filter(word=>wordCenterY(word)>=top&&wordCenterY(word)<bottom),barcodeGraphic=barcodeGraphicPresent(canvas,columns[4],columns[5],top,bottom);if(words.length||barcodeGraphic)groups.push({words,top,bottom,barcodeGraphic});}
    hasRowRules=groups.length>0;
  }
  if(!groups.length)groups=(ocrData.lines||[]).map(line=>({words:line.words||[],top:line.bbox?.y0,bottom:line.bbox?.y1})).filter(group=>group.words.length);
  if(!groups.length&&allWords.length){
    const sorted=[...allWords].sort((a,b)=>wordCenterY(a)-wordCenterY(b)),lineHeight=sorted.map(word=>Math.max(1,word.bbox.y1-word.bbox.y0)).sort((a,b)=>a-b)[Math.floor(sorted.length/2)]||18;
    for(const word of sorted){const center=wordCenterY(word),group=groups.find(row=>Math.abs(row.center-center)<lineHeight*1.8);if(group){const count=group.words.length;group.words.push(word);group.center=(group.center*count+center)/(count+1);group.top=Math.min(group.top,word.bbox.y0);group.bottom=Math.max(group.bottom,word.bbox.y1);}else groups.push({center,top:word.bbox.y0,bottom:word.bbox.y1,words:[word]});}
  }
  if(!hasRowRules&&groups.length===1){groups[0].top=0;groups[0].bottom=canvas.height;}
  if(!hasRowRules&&groups.length>1){groups.sort((a,b)=>((a.top??wordCenterY(a.words[0]))+(a.bottom??wordCenterY(a.words[0])))-((b.top??wordCenterY(b.words[0]))+(b.bottom??wordCenterY(b.words[0]))));const centers=groups.map(group=>group.words.reduce((sum,word)=>sum+wordCenterY(word),0)/group.words.length);groups.forEach((group,index)=>{const center=centers[index],previous=index?centers[index-1]:null,next=index<centers.length-1?centers[index+1]:null;group.top=previous===null?Math.max(0,center-(next-center)/2):(previous+center)/2;group.bottom=next===null?Math.min(canvas.height,center+(center-previous)/2):(center+next)/2;});}
  const cellWords=(words,left,right)=>words.filter(word=>{const x=(word.bbox.x0+word.bbox.x1)/2;return x>=left&&x<right;}).sort((a,b)=>a.bbox.x0-b.bbox.x0),cellText=(words,left,right)=>cellWords(words,left,right).map(word=>String(word.text||'').trim()).filter(Boolean),cellConfidence=(words,left,right)=>{const matches=cellWords(words,left,right);return matches.length?matches.reduce((sum,word)=>sum+(Number(word.confidence)||0),0)/matches.length:0;};
  const results=[];
  for(const group of groups){
    const words=group.words;
    const cells=Array.from({length:5},(_,index)=>cellText(words,columns[index],columns[index+1]));
    if(!cells.some(cell=>cell.length)&&!group.barcodeGraphic)continue;
    const numberText=cells[0].join(' ').match(/\d{1,4}/)?.[0]||String(results.length+1),memberNo=cells[1].join(' ').trim(),ring=cells[2].join('').replace(/\s+/g,'').trim(),barcode=cells[4].join('').replace(/\s+/g,'').trim(),allCellText=cells.flat().join(' ').toLowerCase();
    if(!cells[0].join(' ').match(/\d/)&&/member/.test(allCellText)&&/ring/.test(allCellText)&&/barcode/.test(allCellText))continue;
    const top=group.top??Math.min(...words.map(word=>word.bbox.y0)),bottom=group.bottom??Math.max(...words.map(word=>word.bbox.y1));
    results.push({id:`sheet-${Date.now()}-${results.length}-${Math.random().toString(36).slice(2,7)}`,sheetRow:numberText,member_no:memberNo,memberConfidence:cellConfidence(words,columns[1],columns[2]),pigeon_ring:ring,ringConfidence:cellConfidence(words,columns[2],columns[3]),memberRegion:{left:columns[1],right:columns[2],top,bottom},ringRegion:{left:columns[2],right:columns[3],top,bottom},barcode,barcodeDetected:false,barcodeScanError:'',barcodeRegion:{left:columns[4],right:columns[5],top,bottom},errors:[],member:null,saved:false});
  }
  return results;
}
function handwritingOCRBatch(source,rows,regionKey){
  const width=760,gap=24,crops=[];let height=12;
  rows.forEach((row,index)=>{const region=row[regionKey];if(!region)return;const left=Math.max(0,Math.floor(region.left)+4),top=Math.max(0,Math.floor(region.top)+4),right=Math.min(source.width,Math.ceil(region.right)-4),bottom=Math.min(source.height,Math.ceil(region.bottom)-4),cropWidth=right-left,cropHeight=bottom-top;if(cropWidth<8||cropHeight<8)return;const scale=Math.min(3,(width-32)/cropWidth),drawWidth=Math.max(1,Math.round(cropWidth*scale)),drawHeight=Math.max(1,Math.round(cropHeight*scale));crops.push({row,index,left,top,cropWidth,cropHeight,drawWidth,drawHeight});height+=drawHeight+gap;});
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d',{willReadFrequently:true});context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);const placements=[];let y=6;
  for(const crop of crops){const x=Math.round((width-crop.drawWidth)/2);context.drawImage(source,crop.left,crop.top,crop.cropWidth,crop.cropHeight,x,y,crop.drawWidth,crop.drawHeight);placements.push({row:crop.row,index:crop.index,top:y,bottom:y+crop.drawHeight});y+=crop.drawHeight+gap;}
  const pixels=context.getImageData(0,0,canvas.width,canvas.height),data=pixels.data;for(let index=0;index<data.length;index+=4){const gray=data[index]*.299+data[index+1]*.587+data[index+2]*.114,value=gray<192?0:255;data[index]=data[index+1]=data[index+2]=value;}context.putImageData(pixels,0,0);return {canvas,placements};
}
async function refineHandwrittenEntryFields(worker,source,rows,members,onProgress=()=>{}){
  if(!worker?.setParameters||!worker?.recognize)return;
  try{await worker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_/.'});}catch{return;}
  const fields=[['member_no','memberRegion','memberConfidence','Member ID'],['pigeon_ring','ringRegion','ringConfidence','Ring number']],batchSize=24;
  for(const [field,regionKey,confidenceKey,label] of fields){const candidates=rows.filter(row=>row[regionKey]),total=candidates.length;
    for(let offset=0;offset<total;offset+=batchSize){const batch=candidates.slice(offset,offset+batchSize),prepared=handwritingOCRBatch(source,batch,regionKey),{data}=await worker.recognize(prepared.canvas),words=data.words?.length?data.words:(data.lines||[]).flatMap(line=>line.words||[]);
      for(const placement of prepared.placements){const matches=words.filter(word=>{const center=(word.bbox.y0+word.bbox.y1)/2;return center>=placement.top-5&&center<=placement.bottom+5;}).sort((a,b)=>a.bbox.x0-b.bbox.x0),recognized=matches.map(word=>String(word.text||'').trim()).filter(Boolean).join('').replace(/[^A-Za-z0-9_./-]/g,'');if(!recognized)continue;const confidence=matches.length?matches.reduce((sum,word)=>sum+(Number(word.confidence)||0),0)/matches.length:Number(data.confidence)||0;
        const row=placement.row,current=String(row[field]||''),currentConfidence=Number(row[confidenceKey])||0;
        if(field==='member_no'){
          const isRegistered=value=>members.some(member=>String(member.member_no).trim().toUpperCase()===value.trim().toUpperCase()||String(member.id)===value.trim()),currentValid=isRegistered(current),candidateValid=isRegistered(recognized);
          if((candidateValid&&!currentValid)||(!current&&confidence>0)||(!currentValid&&!candidateValid&&confidence>currentConfidence+8)){row[field]=recognized;row[confidenceKey]=confidence;}
        }else if(!current||confidence>currentConfidence+5){row[field]=recognized;row[confidenceKey]=confidence;}
      }
      onProgress(label,Math.min(offset+batchSize,total),total);
    }
  }
}
function entrySheetRowsFromWorksheet(XLSX,arrayBuffer){
  const workbook=XLSX.read(arrayBuffer,{type:'array',cellDates:false});
  if(!workbook.SheetNames?.length)throw new Error('The Excel file has no worksheet.');
  const sheet=workbook.Sheets[workbook.SheetNames[0]],matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false,blankrows:true});
  if(!matrix.length)throw new Error('The first worksheet is empty.');
  const aliases={sheetRow:['no','number','row','rownumber','sheetrow'],memberNo:['memberid','memberno','membernumber'],ring:['ring','ringnumber','pigeonring','pigeonringnumber'],barcode:['barcode','barcodenumber','stickercode','stickernumber']};
  const headerRowIndex=matrix.slice(0,10).findIndex(row=>{const headers=new Set(row.map(normalizeImportHeader));return aliases.memberNo.some(name=>headers.has(name))&&aliases.ring.some(name=>headers.has(name))&&aliases.barcode.some(name=>headers.has(name));});
  if(headerRowIndex<0)throw new Error('Could not find the required headings in the first 10 rows. Use the template columns Member ID, Ring Number, and Barcode Number.');
  const header=matrix[headerRowIndex].map(normalizeImportHeader),findColumn=names=>header.findIndex(value=>names.includes(value)),columns={sheetRow:findColumn(aliases.sheetRow),memberNo:findColumn(aliases.memberNo),ring:findColumn(aliases.ring),barcode:findColumn(aliases.barcode)};
  const cell=(row,column)=>column<0?'':String(row[column]??'').trim(),dataRows=matrix.slice(headerRowIndex+1).map((row,index)=>({row,rowNumber:headerRowIndex+index+2})).filter(item=>item.row.some(value=>String(value??'').trim()!==''));
  if(!dataRows.length)throw new Error('No entry rows were found below the headings. Add one pigeon per row.');
  if(dataRows.length>1000)throw new Error('Import up to 1,000 race entries at a time. Split the worksheet into smaller batches.');
  const barcodeValue=value=>/^(?:=|#(?:N\/A|VALUE!|NAME\?|REF!|DIV\/0!))/i.test(value)||/(?:DISPIMG|IMAGE)\s*\(/i.test(value)?'':value;
  return dataRows.map((item,index)=>({id:`sheet-${Date.now()}-${index}-${Math.random().toString(36).slice(2,7)}`,sheetRow:cell(item.row,columns.sheetRow)||String(item.rowNumber),sourceRowNumber:item.rowNumber,barcodeExcelColumn:columns.barcode,member_no:cell(item.row,columns.memberNo),pigeon_ring:cell(item.row,columns.ring),barcode:barcodeValue(cell(item.row,columns.barcode)),barcodeDetected:false,barcodeScanError:'',barcodeRegion:null,errors:[],member:null,saved:false}));
}
const EXCEL_RELATIONSHIP_NAMESPACE='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
function excelXMLNodes(node,localName){return Array.from(node.getElementsByTagNameNS('*',localName));}
function parseExcelXML(xml,label){const documentXml=new DOMParser().parseFromString(xml,'application/xml');if(documentXml.getElementsByTagName('parsererror').length)throw new Error(`Could not read ${label} from the Excel workbook.`);return documentXml;}
function excelRelationshipMap(documentXml){return new Map(excelXMLNodes(documentXml,'Relationship').map(relation=>[relation.getAttribute('Id'),{target:relation.getAttribute('Target'),type:relation.getAttribute('Type')}]));}
function excelNamespacedAttribute(node,namespace,localName){const direct=node.getAttributeNS?.(namespace,localName);if(direct)return direct;return Array.from(node.attributes||[]).find(attribute=>attribute.localName===localName&&attribute.namespaceURI===namespace)?.value||Array.from(node.attributes||[]).find(attribute=>attribute.name?.split(':').pop()===localName)?.value||'';}
function resolveExcelZipPath(baseDirectory,target){
  const pieces=String(target||'').startsWith('/')?[]:String(baseDirectory||'').split('/').filter(Boolean),targetPieces=String(target||'').replace(/^\//,'').split('/');
  for(const encoded of targetPieces){if(!encoded||encoded==='.')continue;if(encoded==='..'){pieces.pop();continue;}let piece=encoded;try{piece=decodeURIComponent(encoded);}catch{}pieces.push(piece);}
  return pieces.join('/');
}
function excelRelsPath(partPath){const slash=partPath.lastIndexOf('/');return `${partPath.slice(0,slash)}/_rels/${partPath.slice(slash+1)}.rels`;}
function excelDirectChild(parent,localName){return Array.from(parent.children||parent.childNodes||[]).find(child=>child.nodeType===1&&child.localName===localName)||null;}
function excelCellAddress(reference){const match=String(reference||'').match(/^([A-Z]+)(\d+)$/i);if(!match)return null;let column=0;for(const letter of match[1].toUpperCase())column=column*26+letter.charCodeAt(0)-64;return {column:column-1,row:Number(match[2])};}
function excelImageMimeType(imagePath){const extension=imagePath.split('.').pop().toLowerCase();return ({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',bmp:'image/bmp',webp:'image/webp',svg:'image/svg+xml',tif:'image/tiff',tiff:'image/tiff'})[extension]||'application/octet-stream';}
async function extractExcelCellBarcodeImages(zip,worksheetXml,barcodeColumn){
  const readText=async path=>{const part=zip.file(path);return part?part.async('string'):null;},cellImagesText=await readText('xl/cellimages.xml'),relationshipsText=await readText('xl/_rels/cellimages.xml.rels');if(!cellImagesText||!relationshipsText)return [];
  const cellImagesXml=parseExcelXML(cellImagesText,'in-cell pictures'),relationships=excelRelationshipMap(parseExcelXML(relationshipsText,'in-cell picture links')),imageByToken=new Map();
  for(const cellImage of excelXMLNodes(cellImagesXml,'cellImage')){
    const blip=excelXMLNodes(cellImage,'blip')[0],relationId=blip?excelNamespacedAttribute(blip,EXCEL_RELATIONSHIP_NAMESPACE,'embed'):'',relation=relationships.get(relationId);if(!relation?.target)continue;
    const props=excelXMLNodes(cellImage,'cNvPr')[0];if(!props)continue;const imagePath=resolveExcelZipPath('xl',relation.target),part=zip.file(imagePath);if(!part)continue;
    const image={bytes:await part.async('uint8array'),mimeType:excelImageMimeType(imagePath)};
    for(const token of [props.getAttribute('name'),props.getAttribute('descr'),props.getAttribute('title')].filter(Boolean))imageByToken.set(token,image);
  }
  const images=[];
  for(const cell of excelXMLNodes(worksheetXml,'c')){
    const position=excelCellAddress(cell.getAttribute('r'));if(!position||position.column!==barcodeColumn)continue;
    const formula=excelXMLNodes(cell,'f')[0]?.textContent||'',token=formula.match(/(?:DISPIMG|IMAGE)\s*\(\s*["']([^"']+)["']/i)?.[1],image=token?imageByToken.get(token):null;if(image)images.push({...image,rowNumber:position.row});
  }
  return images;
}
async function extractExcelBarcodeImages(arrayBuffer,barcodeColumn){
  const JSZip=await loadSpreadsheetZipReader(),zip=await JSZip.loadAsync(arrayBuffer),readText=async path=>{const part=zip.file(path);return part?part.async('string'):null;};
  const workbookText=await readText('xl/workbook.xml');if(!workbookText)return [];
  const workbookXml=parseExcelXML(workbookText,'worksheet metadata'),firstSheet=excelXMLNodes(workbookXml,'sheet')[0];if(!firstSheet)return [];
  const workbookRelsText=await readText('xl/_rels/workbook.xml.rels');if(!workbookRelsText)return [];
  const workbookRelations=excelRelationshipMap(parseExcelXML(workbookRelsText,'workbook links')),sheetRelId=excelNamespacedAttribute(firstSheet,EXCEL_RELATIONSHIP_NAMESPACE,'id'),sheetRelation=workbookRelations.get(sheetRelId);if(!sheetRelation)return [];
  const worksheetPath=resolveExcelZipPath('xl',sheetRelation.target),worksheetText=await readText(worksheetPath);if(!worksheetText)return [];
  const worksheetXml=parseExcelXML(worksheetText,'worksheet'),drawingNode=excelXMLNodes(worksheetXml,'drawing')[0];if(!drawingNode)return extractExcelCellBarcodeImages(zip,worksheetXml,barcodeColumn);
  const worksheetRelsText=await readText(excelRelsPath(worksheetPath));if(!worksheetRelsText)return extractExcelCellBarcodeImages(zip,worksheetXml,barcodeColumn);
  const worksheetRelations=excelRelationshipMap(parseExcelXML(worksheetRelsText,'worksheet links')),drawingRelId=excelNamespacedAttribute(drawingNode,EXCEL_RELATIONSHIP_NAMESPACE,'id'),drawingRelation=worksheetRelations.get(drawingRelId);if(!drawingRelation)return extractExcelCellBarcodeImages(zip,worksheetXml,barcodeColumn);
  const drawingPath=resolveExcelZipPath(worksheetPath.slice(0,worksheetPath.lastIndexOf('/')),drawingRelation.target),drawingText=await readText(drawingPath);if(!drawingText)return extractExcelCellBarcodeImages(zip,worksheetXml,barcodeColumn);
  const drawingXml=parseExcelXML(drawingText,'barcode pictures'),drawingRelsText=await readText(excelRelsPath(drawingPath)),drawingRelations=drawingRelsText?excelRelationshipMap(parseExcelXML(drawingRelsText,'picture links')):new Map(),imageRows=[];
  for(const anchor of [...excelXMLNodes(drawingXml,'oneCellAnchor'),...excelXMLNodes(drawingXml,'twoCellAnchor')]){
    const from=excelDirectChild(anchor,'from'),to=excelDirectChild(anchor,'to');if(!from)continue;
    const fromCol=Number(excelDirectChild(from,'col')?.textContent),fromRow=Number(excelDirectChild(from,'row')?.textContent),toCol=to?Number(excelDirectChild(to,'col')?.textContent):fromCol;
    if(!Number.isFinite(fromCol)||!Number.isFinite(fromRow)||!(fromCol<=barcodeColumn&&(toCol>barcodeColumn||fromCol===barcodeColumn)))continue;
    const blip=excelXMLNodes(anchor,'blip')[0],imageRelId=blip?excelNamespacedAttribute(blip,EXCEL_RELATIONSHIP_NAMESPACE,'embed'):'',imageRelation=drawingRelations.get(imageRelId);if(!imageRelation?.target)continue;
    const imagePath=resolveExcelZipPath(drawingPath.slice(0,drawingPath.lastIndexOf('/')),imageRelation.target),imagePart=zip.file(imagePath);if(!imagePart)continue;
    imageRows.push({rowNumber:fromRow+1,bytes:await imagePart.async('uint8array'),mimeType:excelImageMimeType(imagePath)});
  }
  return imageRows.concat(await extractExcelCellBarcodeImages(zip,worksheetXml,barcodeColumn));
}
async function decodeExcelBarcodeImages(images,rows,reader,onProgress=()=>{}){
  let decoded=0;
  for(let index=0;index<images.length;index++){
    const image=images[index],row=rows.find(item=>item.sourceRowNumber===image.rowNumber);if(!row||row.barcode.trim()){onProgress(index+1,images.length);continue;}
    let bitmap=null,objectUrl='';
    try{
      const blob=new Blob([image.bytes],{type:image.mimeType});if(window.createImageBitmap)bitmap=await createImageBitmap(blob);
      const canvas=document.createElement('canvas');
      if(bitmap){const scale=Math.min(4,Math.max(1,1100/bitmap.width));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d',{willReadFrequently:true}).drawImage(bitmap,0,0,canvas.width,canvas.height);}
      else{objectUrl=URL.createObjectURL(blob);const imageElement=new Image();imageElement.src=objectUrl;if(imageElement.decode)await imageElement.decode();else await new Promise((resolve,reject)=>{imageElement.onload=resolve;imageElement.onerror=reject;});const scale=Math.min(4,Math.max(1,1100/imageElement.naturalWidth));canvas.width=Math.max(1,Math.round(imageElement.naturalWidth*scale));canvas.height=Math.max(1,Math.round(imageElement.naturalHeight*scale));canvas.getContext('2d',{willReadFrequently:true}).drawImage(imageElement,0,0,canvas.width,canvas.height);}
      let result=null;for(const angle of [0,90,270,180]){try{result=reader.decodeFromCanvas(angle?rotateDocumentCanvas(canvas,angle):canvas);break;}catch{}}
      const code=result?.getText?.().trim().replace(/\s+/g,'')||'';
      if(code){row.barcode=code;row.barcodeDetected=true;row.barcodeScanError='';decoded++;}else row.barcodeScanError='Barcode picture could not be decoded. Type the printed number or upload a clear photo/PDF.';
    }catch{row.barcodeScanError='Barcode picture could not be read. Type the printed number or upload a clear photo/PDF.';}
    finally{bitmap?.close();if(objectUrl)URL.revokeObjectURL(objectUrl);reader.reset?.();onProgress(index+1,images.length);}
  }
  return decoded;
}

const tagExpired=entry=>Boolean(entry.nfc_expires_at)&&new Date(entry.nfc_expires_at)<=new Date();
// The ways a registered pigeon can be clocked. The first to reach AvilonX is its receipt.
function clockWays(entry,readerByMember){
  const ways=[];
  if(entry.nfc_tag&&!tagExpired(entry)){if(readerByMember.has(Number(entry.member_id)))ways.push('Loft reader');ways.push('Phone NFC');}
  if(entry.barcode)ways.push('Sticker');
  return ways;
}
function distanceMeters(lat1,lon1,lat2,lon2){const rad=n=>n*Math.PI/180;const a=Math.sin(rad(lat2-lat1)/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(rad(lon2-lon1)/2)**2;return 6371008.8*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
function mountEntrySheetImport(view,races,members,entries,readerByMember=new Map(),birds=null){
  const birdById=new Map((birds||[]).map(bird=>[bird.id,bird]));
  const existingForm=view.querySelector('#entry-form');
  const importPanel=`<div class="entry-sheet-panel"><p class="entry-tab-intro" data-sheet-only>Upload a photo or PDF of the race sheet. Handwritten member IDs and ring numbers are read and the barcodes scanned.</p><p class="entry-tab-intro" data-excel-only>Download the Excel template, fill it in, then import it. Required columns: Member ID, Ring Number, and Barcode Number.</p><div class="entry-sheet-controls" data-sheet-only><label class="field"><span>Document photo or PDF</span><input type="file" data-sheet-file accept="image/*,.pdf,application/pdf" capture="environment"><small class="small">Reads handwritten IDs and ring numbers; review red rows because handwriting can be misread. PDF uploads read the first page. Rotate if the text is sideways.</small></label></div><div class="entry-sheet-actions" data-excel-only><button class="button secondary" type="button" data-download-entry-template>Download Excel template</button><button class="button secondary" type="button" data-open-entry-excel>Import Excel</button><input type="file" data-entry-excel accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" hidden></div><p class="small" data-excel-only>Template columns: No. (optional), Member ID, Ring Number, Skip / Notes (ignored), Barcode Number. Enter barcode values as text to preserve leading zeroes. For barcode pictures, use an .xlsx file with the image in the Barcode Number cell; the importer will scan it.</p><div class="entry-sheet-actions" data-sheet-only><button class="button secondary" type="button" data-rotate-sheet disabled>Rotate 90°</button><button class="button primary" type="button" data-read-sheet disabled>Read photo + scan barcodes</button></div><p class="entry-sheet-status" data-sheet-status aria-live="polite">Choose the race schedule above, then upload a photo/PDF or import an Excel file.</p><div class="entry-sheet-preview" data-sheet-preview data-sheet-only hidden><canvas data-sheet-preview-canvas></canvas></div><section class="entry-sheet-review" data-sheet-review hidden><div class="panel-heading"><div><h3>Review race entries</h3><p class="small">All detected rows stay in the table. Red rows show errors; fix them before saving those entries.</p></div><span class="count-pill" data-sheet-count></span></div><div data-sheet-table></div><div class="form-actions"><button class="button secondary" type="button" data-clear-sheet>Clear scan</button><button class="button primary" type="button" data-save-sheet disabled>Save valid entries</button></div></section></div>`;
  // Insert the panel without re-rendering the page, so the handlers already set
  // on the entry form (save, camera scan, NFC) keep working.
  const importPane=view.querySelector('[data-entry-pane="import"]');
  if(importPane)importPane.insertAdjacentHTML('beforeend',importPanel);
  else if(existingForm)existingForm.closest('section').insertAdjacentHTML('beforebegin',importPanel);
  else view.insertAdjacentHTML('afterbegin',importPanel);
  const fileInput=view.querySelector('[data-sheet-file]'),excelFileInput=view.querySelector('[data-entry-excel]'),raceSelect=view.querySelector('[data-sheet-race]'),readButton=view.querySelector('[data-read-sheet]'),rotateButton=view.querySelector('[data-rotate-sheet]'),status=view.querySelector('[data-sheet-status]'),preview=view.querySelector('[data-sheet-preview]'),previewCanvas=view.querySelector('[data-sheet-preview-canvas]'),review=view.querySelector('[data-sheet-review]'),table=view.querySelector('[data-sheet-table]'),count=view.querySelector('[data-sheet-count]'),saveButton=view.querySelector('[data-save-sheet]');
  if(!fileInput)return;
  let sourceCanvas=null,rotation=0,rows=[],validationTimer=null,validationSequence=0;
  const drawRegistered=()=>{const raceId=Number(raceSelect.value),mapped=entries.filter(entry=>!raceId||Number(entry.race_id)===raceId).map(entry=>({...entry,member:members.find(member=>member.id===entry.member_id),race:races.find(race=>race.id===entry.race_id)}));view.querySelector('[data-registered-entries]').innerHTML=tableRows(mapped,[{key:'race',label:'Race',render:item=>escapeHTML(item.race?.name||'—')},{key:'member',label:'Member',render:item=>`<span title="${escapeHTML(item.member?.member_no||'')}">${escapeHTML(item.member?.full_name||item.member?.member_no||'—')}</span>`},{key:'pigeon_ring',label:'Ring number',render:r=>{const bird=r.pigeon_id&&birdById.get(r.pigeon_id);return `${escapeHTML(ringLabel(r.pigeon_ring,r.remarks))}${bird?`<br><span class="small">${escapeHTML(bird.bird_name)} · ${escapeHTML(bird.color)}</span>`:''}`;}},{key:'barcode',label:'Sticker barcode',render:r=>escapeHTML(r.barcode||'—')},{key:'nfc_tag',label:'NFC tag',render:r=>r.nfc_tag?`${escapeHTML(formatNfcUid(r.nfc_tag))}${r.nfc_expires_at?`<br><span class="small ${tagExpired(r)?'tag-expired':''}">${tagExpired(r)?'Expired':'Expires'} ${escapeHTML(formatDate(r.nfc_expires_at))}</span>`:''}${r.nfc_read_with?`<br><span class="small">via ${({wireless:'wireless reader',wired:'USB reader',phone:'Android phone'})[r.nfc_read_with]||escapeHTML(r.nfc_read_with)}</span>`:''}`:'—'},{key:'clock_with',label:'Clock with',render:r=>escapeHTML(clockWays(r,readerByMember).join(' · ')||'—')},{key:'distance_m',label:'Distance',render:item=>`${number(item.distance_m)} m`}],raceId?'No pigeons registered for this race yet.':'No pigeons registered.',false);};
  drawRegistered();raceSelect.addEventListener('change',drawRegistered);
  const redrawRows=()=>{
    review.hidden=!rows.length;count.textContent=`${rows.length} row${rows.length===1?'':'s'}`;
    table.innerHTML=rows.length?`<div class="table-scroll entry-sheet-table"><table><thead><tr><th>Sheet row</th><th>Member ID</th><th>Ring</th><th>Barcode</th><th>Error / status</th><th></th></tr></thead><tbody>${rows.map(row=>`<tr data-sheet-row="${escapeHTML(row.id)}" class="${row.saved?'is-saved':row.errors?.length?'has-errors':''}"><td data-label="Sheet row"><span class="entry-sheet-row-number">${escapeHTML(row.sheetRow)}</span></td><td data-label="Member ID"><input class="entry-sheet-input" data-sheet-field="member_no" data-sheet-id="${escapeHTML(row.id)}" maxlength="120" value="${escapeHTML(row.member_no)}" aria-label="Member ID, source row ${escapeHTML(row.sheetRow)}" ${row.saved?'disabled':''}></td><td data-label="Ring"><input class="entry-sheet-input" data-sheet-field="pigeon_ring" data-sheet-id="${escapeHTML(row.id)}" maxlength="80" value="${escapeHTML(row.pigeon_ring)}" aria-label="Ring number, source row ${escapeHTML(row.sheetRow)}" ${row.saved?'disabled':''}></td><td data-label="Barcode"><input class="entry-sheet-input" data-sheet-field="barcode" data-sheet-id="${escapeHTML(row.id)}" maxlength="120" value="${escapeHTML(row.barcode)}" aria-label="Barcode, source row ${escapeHTML(row.sheetRow)}" ${row.saved?'disabled':''}></td><td data-label="Error / status"><span class="entry-sheet-row-status ${row.saved?'is-saved':row.errors?.length?'has-error':''}" data-sheet-row-status="${escapeHTML(row.id)}">${row.saved?'Saved':'Checking…'}</span></td><td data-label="Remove"><button class="text-button danger-text" type="button" data-remove-sheet-row="${escapeHTML(row.id)}" ${row.saved?'disabled':''}>Remove</button></td></tr>`).join('')}</tbody></table></div>`:'';
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
      row.member=members.find(member=>String(member.member_no).trim().toUpperCase()===memberCode.toUpperCase())||members.find(member=>String(member.id)===memberCode)||null;
      if(!raceId)errors.push('Choose a race.');
      if(!memberCode||!row.member)errors.push('Member ID is not registered in this club.');
      if(!ring)errors.push('Ring number is missing.');
      // With bird bonding, each row must be one of the member's active bonded birds.
      row.pigeon_id=null;
      if(birds&&ring&&row.member){const bird=birds.find(item=>item.member_id===row.member.id&&item.status==='active'&&String(item.ring_number).toUpperCase()===ring);if(bird)row.pigeon_id=bird.id;else errors.push('Ring is not bonded to this member. Bond it on Bird bonding first.');}
      if(!barcode)errors.push(row.barcodeScanError||'Barcode is missing.');
      else if(row.barcodeScanError)errors.push(row.barcodeScanError);
      if(barcode.length>120)errors.push('Barcode is longer than 120 characters.');
      if(registryError&&barcode)errors.push('Could not verify the sticker registry. Check the connection.');
      else if(barcode&&!registered.has(barcode))errors.push('Barcode is not registered by Super Admin.');
      if(ring&&raceEntries.some(entry=>String(entry.pigeon_ring||'').toUpperCase()===ring))errors.push('Ring is already registered for this race.');
      if(barcode&&raceEntries.some(entry=>entry.barcode===barcode))errors.push('Barcode is already registered for this race.');
      if(ring&&seenRings.has(ring))errors.push('Ring is duplicated in this scan.');
      if(barcode&&seenCodes.has(barcode))errors.push('Barcode is duplicated in this scan.');
      if(ring)seenRings.add(ring);if(barcode)seenCodes.add(barcode);row.errors=errors;if(!errors.length)ready++;else errorCount++;
      if(indicator){indicator.textContent=errors.length?errors.join(' '):'Ready to save';indicator.classList.toggle('has-error',errors.length>0);indicator.classList.toggle('is-ready',!errors.length);indicator.classList.remove('is-saved');}
      rowElement?.classList.toggle('has-errors',errors.length>0);rowElement?.classList.remove('is-saved');
    }
    saveButton.disabled=!ready||!raceId;saveButton.textContent=ready?`Save ${ready} valid entr${ready===1?'y':'ies'}`:'Save valid entries';count.textContent=`${rows.length} items · ${savedCount} saved · ${ready} ready · ${errorCount} errors`;
  }
  const drawPreview=()=>{if(!sourceCanvas)return;const rotated=rotateDocumentCanvas(sourceCanvas,rotation);previewCanvas.width=rotated.width;previewCanvas.height=rotated.height;previewCanvas.getContext('2d').drawImage(rotated,0,0);preview.hidden=false;rotateButton.disabled=false;readButton.disabled=false;};
  view.querySelector('[data-download-entry-template]').onclick=async event=>{
    const button=event.currentTarget;button.disabled=true;
    try{
      const XLSX=await loadSpreadsheetParser(),workbook=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([['No.','Member ID','Ring Number','Skip / Notes','Barcode Number']]),instructions=XLSX.utils.aoa_to_sheet([['Race entry Excel template'],['Fill one pigeon per row on the Race Entries sheet.'],['Required: Member ID, Ring Number, Barcode Number.'],['No. and Skip / Notes are optional; Skip / Notes is ignored.'],['Member ID must already exist in this club.'],['Barcode Number must already be registered by Super Admin.'],['Enter barcode values as Text to preserve leading zeroes.'],['Barcode pictures in the Barcode Number column are decoded when importing .xlsx files.'],['Import the completed workbook in Admin → Race entries, review red errors, then save valid entries.']]);
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
  fileInput.onchange=async()=>{const file=fileInput.files?.[0];if(!file)return;rows=[];redrawRows();readButton.disabled=true;rotateButton.disabled=true;status.textContent='Preparing the document…';try{sourceCanvas=await documentFileToCanvas(file);rotation=0;drawPreview();status.textContent=`${file.name} is ready. Rotate if needed, then read it.`;}catch(error){sourceCanvas=null;preview.hidden=true;status.textContent=error.message;message(error.message,'error');}};
  rotateButton.onclick=()=>{rotation=(rotation+90)%360;drawPreview();status.textContent=`Preview rotated ${rotation}°. Read it when the text is upright.`;};
  readButton.onclick=async()=>{
    if(!sourceCanvas)return;if(!Number(raceSelect.value)){message('Choose the race schedule for this sheet first.','error');raceSelect.focus();return;}
    readButton.disabled=true;rotateButton.disabled=true;status.textContent='Loading the document reader…';let worker=null;
    try{
      const OCR=await loadDocumentOCR();worker=await OCR.createWorker('eng',1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',langPath:'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int',logger:progress=>{if(progress.status==='recognizing text')status.textContent=`Reading document… ${Math.round((progress.progress||0)*100)}%`;else if(progress.status)status.textContent=`${progress.status}…`;}});
      const rotated=rotateDocumentCanvas(sourceCanvas,rotation),result=await worker.recognize(rotated);rows=entrySheetRowsFromOCR(result.data,rotated);
      if(!rows.length){status.textContent='No rows were detected. Rotate the document or use a clearer scan, then try again.';review.hidden=true;return;}
      status.textContent=`Detected ${rows.length} item${rows.length===1?'':'s'}. Checking handwritten IDs and ring numbers…`;
      try{await refineHandwrittenEntryFields(worker,rotated,rows,members,(field,current,total)=>{status.textContent=`Reading ${field.toLowerCase()}… ${current} of ${total}`;});}catch(error){console.warn('Handwriting OCR refinement failed:',error);}
      redrawRows();
      status.textContent=`Detected ${rows.length} item${rows.length===1?'':'s'}. Scanning each barcode…`;
      try{const barcodeReader=await loadDocumentBarcodeReader();await scanSheetBarcodes(rotated,rows,barcodeReader,(current,total)=>{status.textContent=`Scanning barcode images… ${current} of ${total}`;});}
      catch(error){console.warn('Race-sheet barcode decoding is unavailable:',error);rows.forEach(row=>{row.barcodeDetected=false;row.barcodeScanError='Barcode scanner could not load. Type or confirm this barcode manually.';});}
      redrawRows();status.textContent=`Scanned ${rows.length} item${rows.length===1?'':'s'}. Red rows show the errors to fix; review the OCR values before saving.`;await validateRows();review.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){status.textContent=error.message||'Could not read this document.';message(status.textContent,'error');}
    finally{if(worker)await worker.terminate();readButton.disabled=!sourceCanvas;rotateButton.disabled=!sourceCanvas;}
  };
  raceSelect.onchange=()=>{if(rows.length)validateRows();};
  view.querySelector('[data-clear-sheet]').onclick=()=>{rows=[];sourceCanvas=null;rotation=0;fileInput.value='';excelFileInput.value='';preview.hidden=true;review.hidden=true;readButton.disabled=true;rotateButton.disabled=true;saveButton.disabled=true;status.textContent='Choose the race schedule above, then upload a photo/PDF or import an Excel file.';};
  saveButton.onclick=async()=>{
    await validateRows();const race=races.find(item=>item.id===Number(raceSelect.value)),valid=rows.filter(row=>!row.saved&&!row.errors.length&&row.member);if(!race||!valid.length){message('There are no valid rows to save. Correct the red rows in the table.','error');return;}
    const payload=valid.map(row=>({race_id:race.id,member_id:row.member.id,pigeon_ring:row.pigeon_ring.trim().toUpperCase(),barcode:row.barcode.trim(),pooling:0,category:'Open Category',race_type:'Regular Race/Set',distance_m:distanceMeters(race.release_latitude,race.release_longitude,row.member.latitude,row.member.longitude),...(row.pigeon_id?{pigeon_id:row.pigeon_id}:{})}));
    saveButton.disabled=true;saveButton.textContent='Saving…';const {error}=await supabase.from('race_entries').insert(payload);if(error){message(dbError(error),'error');await validateRows();return;}
    valid.forEach(row=>{row.saved=true;row.errors=[];});entries.unshift(...payload.map((entry,index)=>({...entry,id:`sheet-entry-${Date.now()}-${index}`})));drawRegistered();redrawRows();await validateRows();
    const errorsLeft=rows.filter(row=>!row.saved).length;status.textContent=errorsLeft?`Saved ${valid.length} pigeon${valid.length===1?'':'s'}; ${errorsLeft} row${errorsLeft===1?'':'s'} still have errors.`:`Saved ${valid.length} pigeon${valid.length===1?'':'s'}. All scanned items remain visible in the table.`;message(status.textContent,errorsLeft?'info':'success');
  };
}
export async function entriesPage(view,setPageCleanup=()=>{}) {
  const [{data:races,error:a},{data:members,error:b}]=await Promise.all([supabase.from('races').select('*').order('id',{ascending:false}),supabase.from('members').select('id,member_no,full_name,loft_name,latitude,longitude').order('member_no')]);if(a||b)throw a||b;
  const {data:entries,error}=await supabase.from('race_entries').select('*').order('id',{ascending:false});if(error)throw error;
  // The club's remarks, ticked per entry (built on Entry remarks). Missing table = no remarks yet.
  let remarkOptions=[];
  try{const {data:options,error:remarkError}=await supabase.from('entry_remark_options').select('label').eq('is_active',true).order('sort_order').order('label');if(!remarkError)remarkOptions=(options||[]).map(option=>option.label);}catch{/* entry-remarks.sql not run yet */}
  // Bonded birds (Bird bonding). When bonding is set up, entries must use one of them.
  let birds=null,birdPhotos=new Map();
  try{const {data:bonded,error:birdError}=await supabase.from('pigeons').select('*').order('ring_number');if(!birdError){birds=bonded||[];birdPhotos=await birdPhotoUrls(birds.filter(bird=>bird.status==='active').map(bird=>bird.photo_path));}}catch{/* bird-bonding.sql not run yet */}
  const birdById=new Map((birds||[]).map(bird=>[bird.id,bird]));
  // Members who clock with their own RFID reader (loft clock). Their pigeons need an RFID tag.
  const readerByMember=new Map();
  try{const {data:readers,error:readerError}=await supabase.rpc('admin_list_rfid_devices');if(!readerError)(readers||[]).filter(reader=>reader.member_id).forEach(reader=>readerByMember.set(Number(reader.member_id),reader));}catch{/* rfid-devices.sql not run yet */}
  const RACE_KEY='avilonx.entries.race';let initialRaceId=null;
  try{const stored=Number(sessionStorage.getItem(RACE_KEY));if(races.some(race=>race.id===stored))initialRaceId=stored;}catch{/* storage unavailable */}
  view.innerHTML=`<div class="split-heading"><div><h2>Race entries</h2></div></div><div class="entry-race-bar"><label for="entry-race">Race schedule</label><select id="entry-race" name="race_id" form="entry-form" data-sheet-race required><option value="">Choose a race</option>${races.map((r,i)=>`<option value="${r.id}" ${r.id===initialRaceId||(!initialRaceId&&i===0)?'selected':''}>${escapeHTML(r.name)}</option>`).join('')}</select></div><section class="panel entry-tabs" data-entry-tabs data-tab="register"><div class="entry-tab-bar" role="tablist" aria-label="Ways to add entries"><button type="button" role="tab" data-entry-tab="rfid" aria-selected="true"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 9.5a4 4 0 0 1 0 5M11.5 7a8 8 0 0 1 0 10M15 4.5a12 12 0 0 1 0 15"/><circle cx="4.5" cy="12" r="1"/></svg><span>RFID entries</span></button><button type="button" role="tab" data-entry-tab="sticker" aria-selected="false"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 9v6M10.5 9v6M13 9v6M16 9v6"/></svg><span>Sticker entries</span></button><button type="button" role="tab" data-entry-tab="sheet" aria-selected="false"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg><span>Scan race sheet</span></button><button type="button" role="tab" data-entry-tab="excel" aria-selected="false"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9.5 12l5 6M14.5 12l-5 6"/></svg><span>Import Excel</span></button></div><div class="entry-tab-pane" data-entry-pane="register" role="tabpanel"><p class="entry-tab-intro rfid-only">RFID entries: choose the reader, tap the bird's bonded RFID tag, then scan or type its sticker.</p><p class="entry-tab-intro sticker-only">Sticker entries: type the bonded bird's ring number, then scan or type its sticker.</p><form id="entry-form" class="entry-form-grid" data-mode="rfid"><label class="field span-3"><span>Member</span><select name="member_id" required><option value="">Choose a member</option>${members.map(m=>`<option value="${m.id}">${escapeHTML(m.member_no)} · ${escapeHTML(m.full_name)}${readerByMember.has(m.id)?' · RFID reader':''}</option>`).join('')}</select><small class="small member-reader-note" data-member-reader hidden></small><div class="entry-last-race" data-last-race hidden></div></label><label class="field span-3"><span>Ring number</span><input name="pigeon_ring" maxlength="80" required autocapitalize="characters" ${birds?'placeholder="Filled by the RFID tap, or type it to enter by sticker"':''}></label>${birds?`<div class="field span-6"><span id="entry-bird-label">Bird</span><div class="entry-bird-tap rfid-only" data-bird-tap role="status"><strong>Tap the bird's bonded RFID tag</strong><span>on the reader chosen below. The bird, its ring and NFC number then appear here.</span></div><div class="entry-bird-tap sticker-only" data-bird-tap role="status"><strong>Type the bonded bird's ring number</strong><span>in Ring number above. The bird then appears here; then scan or type its sticker.</span></div><div class="entry-bird-preview" data-bird-preview hidden></div><input type="hidden" name="pigeon_id"><small class="small" data-bird-hint>Only bonded birds can be entered. Bond new birds on <strong>Bird bonding</strong>.</small></div>`:''}<div class="field span-6 reader-choice rfid-only" role="radiogroup" aria-labelledby="reader-choice-label"><span id="reader-choice-label">Which RFID reader are you using?</span><div class="reader-choice-options"><label><input type="radio" name="nfc_read_with" value="wireless"><span><strong>Wireless</strong> ESP8266 Wi-Fi reader</span></label><label><input type="radio" name="nfc_read_with" value="wired"><span><strong>Wired</strong> USB reader</span></label><label><input type="radio" name="nfc_read_with" value="phone"><span><strong>Android phone</strong> NFC</span></label></div><small class="small usb-reader-status" data-usb-status hidden></small><small class="small" data-reader-choice-hint>Choose the reader, then tap the pigeon's RFID tag. Only that reader fills the NFC tag field. ACR122U on a Windows laptop: <a href="${pageUrl('tools/nfc-reader/acr122u-avilonx-helper.zip')}" download>download its helper</a>, start it and choose Wired.</small></div><label class="field span-3 rfid-only"><span>NFC tag</span><div class="input-with-button"><input name="nfc_tag" maxlength="40" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" placeholder="Tap the tag or use a USB reader"><button type="button" data-tap-nfc aria-label="Read NFC tag with this phone" title="Read NFC tag with this phone"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 9.5a4 4 0 0 1 0 5M11.5 7a8 8 0 0 1 0 10M15 4.5a12 12 0 0 1 0 15"/><circle cx="4.5" cy="12" r="1"/></svg></button></div><span class="nfc-expiry"><span>RFID tag expires</span><select name="nfc_expiry_days" aria-label="RFID tag expires"><option value="">No expiry</option><option value="1">After 1 day</option><option value="2">After 2 days</option><option value="3">After 3 days</option><option value="5">After 5 days</option><option value="7">After 7 days</option><option value="14">After 14 days</option><option value="custom">Custom…</option></select><input name="nfc_expiry_custom" type="number" min="1" max="365" step="1" inputmode="numeric" placeholder="days" aria-label="RFID tag expires after this many days" hidden></span><small class="small entry-field-hint">Counted from saving. After it, the tag no longer clocks this pigeon (reader or phone); the sticker still works. Windows with an ACR122U? ${readerHelperLink()}</small></label><label class="field span-3"><span>Sticker reference number</span><div class="input-with-button"><input name="barcode" maxlength="120" inputmode="numeric" autocomplete="off" autocapitalize="none" autocorrect="off" placeholder="Scan the barcode or type the number"><button data-sticker-scan-for="barcode" type="button" aria-label="Scan the sticker's reference barcode with camera" title="Scan reference barcode"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 9v6M10.5 9v6M13 9v6M16 9v6"/></svg></button></div></label><details class="entry-more span-6" data-entry-more><summary>More options <span class="small" data-more-summary></span></summary><div class="entry-more-grid"><label class="field span-2"><span>Category</span><select name="category"><option>Open Category</option><option>Young Bird</option><option>Old Bird</option><option>Special Category</option></select></label><label class="field span-2"><span>Race type</span><select name="race_type"><option>Regular Race/Set</option><option>Training Toss</option><option>Special Race</option></select></label><label class="field span-2"><span>Pooling</span><select name="pooling"><option value="0">No</option><option value="1">Yes</option></select></label></div></details>${remarkOptions.length?`<div class="field span-6 entry-remarks" role="group" aria-labelledby="entry-remarks-label"><span id="entry-remarks-label">Remarks <span class="small">(tick as many as apply)</span></span><div class="entry-remarks-options">${remarkOptions.map(label=>`<label><input type="checkbox" name="remarks" value="${escapeHTML(label)}"><span>${escapeHTML(label)}</span></label>`).join('')}</div></div>`:''}<div class="form-actions"><button class="button primary">Save entry</button></div></form></div><div class="entry-tab-pane" data-entry-pane="import" role="tabpanel" hidden></div></section><section class="panel" data-registered-panel><div class="panel-heading"><h3>Registered pigeons</h3></div><div data-registered-entries></div></section>`;
  view.querySelector('#entry-form').onsubmit=async e=>{e.preventDefault();
    // Both RFID entries and Sticker entries need the pigeon's sticker.
    const mode=e.currentTarget.dataset.mode||'rfid';if(mode==='sticker'&&!birds)e.currentTarget.nfc_tag.value='';
    if(mode==='rfid'&&birds&&!birdById.get(tappedBirdId)){message('Tap the bird\'s bonded RFID tag on the chosen reader first.','error');return;}
    if(!e.currentTarget.barcode.value.trim()){message(mode==='rfid'?'Now scan or type the bird\'s sticker reference number: RFID entries need the sticker too.':'Scan or type the sticker reference number.','error');e.currentTarget.barcode.focus();return;}
    if(mode==='rfid'&&!birds&&!e.currentTarget.nfc_tag.value.trim()){message('Tap the pigeon\'s RFID tag on the chosen reader.','error');return;}
   const f=e.currentTarget,m=members.find(x=>x.id===Number(f.member_id.value)),r=races.find(x=>x.id===Number(f.race_id.value)),barcode=f.barcode.value.trim(),nfcTag=normalizeNfcUid(f.nfc_tag.value);if(!m||!r)return;if(nfcTag===null){message(NFC_HELP,'error');f.nfc_tag.focus();return;}if(mode!=='sticker'&&readerByMember.has(m.id)&&!nfcTag&&!confirm(`${m.full_name} has an RFID loft reader. Without an RFID tag this pigeon can only be clocked with its sticker, not by the reader or an Android phone. Save anyway?`)){f.nfc_tag.focus();return;}if(!birds&&!barcode&&!nfcTag){message('Tap the pigeon\'s NFC tag or enter a registered sticker barcode.','error');return;}if(barcode){const {data:sticker,error:stickerError}=await supabase.from('barcode_stickers').select('barcode_number,is_registered').eq('barcode_number',barcode).maybeSingle();if(stickerError){message(stickerError.message.includes('barcode_stickers')?'The global sticker registry is not installed. Run sticker-barcodes.sql in Supabase SQL Editor.':stickerError.message,'error');return;}if(!sticker||sticker.is_registered===false){message(`Sticker ${barcode} is not registered this season. Ask the Super Admin to register it first.`,'error');return;}}if(nfcTag){const {data:tag,error:tagError}=await supabase.from('nfc_tags').select('tag_uid').eq('tag_uid',nfcTag).maybeSingle();if(tagError){message(tagError.message.includes('nfc_tags')?'The NFC tag registry is not installed. Run nfc-tags.sql in Supabase SQL Editor.':tagError.message,'error');return;}if(!tag){message(`NFC tag ${formatNfcUid(nfcTag)} is not registered. Ask the Super Admin to register it first.`,'error');return;}}const entry={race_id:r.id,member_id:m.id,pigeon_ring:f.pigeon_ring.value.trim().toUpperCase(),barcode:barcode||null,pooling:Number(f.pooling.value),category:f.category.value,race_type:f.race_type.value,distance_m:distanceMeters(r.release_latitude,r.release_longitude,m.latitude,m.longitude)};const ticked=[...f.querySelectorAll('[name=remarks]:checked')].map(box=>box.value);if(ticked.length)entry.remarks=ticked;
    if(birds&&tagBusyText(currentBird())){message(tagBusyText(currentBird()),'error');return;}
    if(birds){const bird=currentBird();if(!bird||bird.member_id!==m.id){message(mode==='rfid'?'Tap the bird\'s bonded RFID tag on the chosen reader first.':'Type the ring number of one of this member\'s bonded birds.','error');return;}if(mode==='rfid'&&bird.id!==tappedBirdId){message('Tap the bird\'s bonded RFID tag on the chosen reader first.','error');return;}if(bird.id!==tappedBirdId&&!barcode){message(`${bird.ring_number} was entered by ring number, so it is clocked with its sticker. Scan or type the sticker reference number.`,'error');f.barcode.focus();return;}entry.pigeon_id=bird.id;entry.pigeon_ring=bird.ring_number;const chosenReader=f.querySelector('[name=nfc_read_with]:checked')?.value;if(chosenReader||bird.nfc_read_with)entry.nfc_read_with=chosenReader||bird.nfc_read_with;}
    if(nfcTag&&!birds){entry.nfc_tag=nfcTag;const readWith=f.querySelector('[name=nfc_read_with]:checked')?.value;if(!readWith){message('Choose which RFID reader you are using: Wireless, Wired or Android phone.','error');f.querySelector('[name=nfc_read_with]').focus();return;}entry.nfc_read_with=readWith;}
    const expiryChoice=f.nfc_expiry_days.value,expiryDays=expiryChoice==='custom'?Number(f.nfc_expiry_custom.value):Number(expiryChoice);
    if(expiryChoice==='custom'&&!(Number.isInteger(expiryDays)&&expiryDays>=1&&expiryDays<=365)){message('Enter the number of days the RFID tag stays valid (1 to 365).','error');f.nfc_expiry_custom.focus();return;}
    if(mode==='rfid'&&nfcTag&&expiryDays)entry.nfc_expires_at=new Date(Date.now()+expiryDays*86400000).toISOString();const submitButton=f.querySelector('button.primary');submitButton.disabled=true;const {data:savedEntry,error}=await supabase.from('race_entries').insert(entry).select().single();submitButton.disabled=false;if(error){message(error.code==='23505'&&birds?'This bird is already entered in this race.':error.code==='23505'&&nfcTag?'That NFC tag or barcode is already used in this race.':error.code==='PGRST204'?'Run nfc-tags.sql in the Supabase SQL Editor to enable NFC tags.':dbError(error),'error');return;}
    // Stay on this race (and member) so the next pigeon can be added straight away.
    entries.unshift(savedEntry||{...entry,id:`new-${Date.now()}`});view.querySelector('#entry-race').dispatchEvent(new Event('change'));
    f.pigeon_ring.value='';f.nfc_tag.value='';f.barcode.value='';f.querySelectorAll('[name=remarks]').forEach(box=>{box.checked=false;});
    if(f.pigeon_id){tappedBirdId=null;view.querySelector('#entry-race').dispatchEvent(new Event('change'));}else f.pigeon_ring.focus();
    message(`Pigeon ${ringLabel(entry.pigeon_ring,entry.remarks)} registered for ${r.name}.`,'success');};
  const entryForm=view.querySelector('#entry-form'),tapButton=view.querySelector('[data-tap-nfc]');
  // Show whether the chosen member has an RFID loft reader. The RFID tag is
  // recommended for them (reader and Android phone), and a sticker still works.
  const readerNote=view.querySelector('[data-member-reader]');
  const showMemberReader=()=>{
    const reader=readerByMember.get(Number(entryForm.elements.member_id.value));
    readerNote.hidden=!entryForm.elements.member_id.value;
    readerNote.classList.toggle('has-reader',Boolean(reader));
    readerNote.textContent=reader?`Has an RFID loft reader (${reader.name}). Add this pigeon's RFID tag so the reader and an Android phone can clock it; a sticker also works as a backup.`:'No RFID loft reader: clocks with a sticker, or by tapping the RFID/NFC tag on an Android phone.';
  };
  entryForm.elements.member_id.addEventListener('change',showMemberReader);
  // The member's birds from their last race (not yet entered in this one):
  // one click fills the ring number, then only the new sticker is needed.
  const lastRaceBox=view.querySelector('[data-last-race]');
  const showLastRace=()=>{
    if(!lastRaceBox||!birds){if(lastRaceBox)lastRaceBox.hidden=true;return;}
    const memberId=Number(entryForm.elements.member_id.value),raceId=Number(view.querySelector('#entry-race').value);
    const previous=entries.filter(entry=>Number(entry.member_id)===memberId&&Number(entry.race_id)!==raceId&&entry.pigeon_id);
    const lastRaceId=previous.map(entry=>Number(entry.race_id)).sort((a,b)=>b-a)[0];
    const inThis=new Set(entries.filter(entry=>Number(entry.race_id)===raceId).map(entry=>entry.pigeon_id));
    const list=[...new Set(previous.filter(entry=>Number(entry.race_id)===lastRaceId).map(entry=>entry.pigeon_id))].map(id=>birdById.get(id)).filter(bird=>bird&&bird.status==='active'&&!inThis.has(bird.id));
    lastRaceBox.hidden=!memberId||!list.length;if(lastRaceBox.hidden)return;
    const lastRace=races.find(race=>race.id===lastRaceId);
    lastRaceBox.innerHTML=`<span class="small">From ${escapeHTML(lastRace?.name||'the last race')}: click a bird, then scan its new sticker.</span><div>${list.map(bird=>`<button type="button" class="entry-chip" data-last-bird="${bird.id}">${escapeHTML(bird.ring_number)} <span>${escapeHTML(bird.bird_name)}</span></button>`).join('')}</div>`;
    lastRaceBox.querySelectorAll('[data-last-bird]').forEach(button=>button.onclick=()=>{
      const bird=birdById.get(Number(button.dataset.lastBird));if(!bird)return;
      if(entryForm.dataset.mode!=='sticker')switchTab('sticker');
      entryForm.elements.member_id.value=String(bird.member_id);
      entryForm.elements.pigeon_ring.value=bird.ring_number;entryForm.elements.pigeon_ring.dispatchEvent(new Event('input'));
      entryForm.elements.barcode.focus();message(`${bird.ring_number} · ${bird.bird_name}: now scan or type its new sticker.`,'info');
    });
  };
  entryForm.elements.member_id.addEventListener('change',showLastRace);
  // Bonded birds are identified only by tapping their bonded RFID tag on the
  // chosen reader; there is no list to choose from.
  const birdSelect=entryForm.elements.pigeon_id,birdPreview=view.querySelector('[data-bird-preview]'),birdTaps=[...view.querySelectorAll('[data-bird-tap]')];
  let tappedBirdId=null;
  const enteredInRace=()=>{const raceId=Number(view.querySelector('#entry-race').value);return new Set(entries.filter(entry=>Number(entry.race_id)===raceId&&entry.pigeon_id).map(entry=>entry.pigeon_id));};
  const ringBird=()=>{const ring=String(entryForm.elements.pigeon_ring.value||'').trim().toUpperCase();if(!ring)return null;const memberId=Number(entryForm.elements.member_id.value);return birds.find(bird=>bird.status==='active'&&String(bird.ring_number).toUpperCase()===ring&&(!memberId||bird.member_id===memberId))||null;};
  const currentBird=()=>birdById.get(tappedBirdId)||ringBird();
  // Same rule as the database (rfid-tag-in-use.sql): a tag still active in
  // another race (not closed, not expired) cannot be entered in a new one.
  const tagBusyText=bird=>{
    if(!bird?.nfc_tag||bird.bond_type==='ring')return '';
    const raceId=Number(view.querySelector('#entry-race').value),now=Date.now();
    const other=entries.find(entry=>entry.nfc_tag===bird.nfc_tag&&Number(entry.race_id)!==raceId&&(!entry.nfc_expires_at||new Date(entry.nfc_expires_at)>now)&&races.find(race=>race.id===Number(entry.race_id))?.status!=='closed');
    if(!other)return '';
    const race=races.find(item=>item.id===Number(other.race_id));
    return `RFID tag still active in ${race?.name||'another race'} ${other.nfc_expires_at?`until ${formatDate(other.nfc_expires_at)}`:'until that race is closed'}: it cannot be entered in this race yet.`;
  };
  const showBird=()=>{
    if(!birdSelect)return;
    const bird=currentBird();
    if(tappedBirdId)entryForm.elements.pigeon_ring.value=bird?.ring_number||'';
    entryForm.elements.nfc_tag.value=bird?.nfc_tag?formatNfcUid(bird.nfc_tag):'';
    entryForm.elements.nfc_tag.placeholder=bird?(bird.nfc_tag?'':'No RFID bonded: use a sticker'):'Shown after tapping the bird\'s tag';
    birdTaps.forEach(prompt=>{prompt.hidden=Boolean(bird);});birdPreview.hidden=!bird;
    if(bird){const photo=birdPhotos.get(bird.photo_path),owner=members.find(member=>member.id===bird.member_id);birdPreview.innerHTML=`${photo?`<img src="${escapeHTML(photo)}" alt="Photo of ${escapeHTML(bird.bird_name)}">`:''}<div><strong>${escapeHTML(bird.ring_number)} · ${escapeHTML(bird.bird_name)}</strong><span>${escapeHTML(bird.color)} · ${escapeHTML(bird.loft_name)}${owner?` · ${escapeHTML(owner.full_name)}`:''}</span>${tagBusyText(bird)?`<span class="entry-bird-warning">${escapeHTML(tagBusyText(bird))}</span>`:''}<span class="entry-bird-nfc">${bird.id===tappedBirdId?`NFC ${escapeHTML(formatNfcUid(bird.nfc_tag))} · tapped ✓`:`Entered by ring number: clocked with its sticker${bird.nfc_tag?` (bonded NFC ${escapeHTML(formatNfcUid(bird.nfc_tag))})`:''}`}</span></div><button class="text-button" type="button" data-clear-bird>Change</button>`;birdPreview.querySelector('[data-clear-bird]').onclick=()=>{tappedBirdId=null;entryForm.elements.pigeon_ring.value='';showBird();message('Tap the bird\'s RFID tag again, or type its ring number.','info');};}
  };
  const fillBirds=()=>{
    if(!birdSelect)return;
    const memberId=Number(entryForm.elements.member_id.value),entered=enteredInRace();
    const tapped=birdById.get(tappedBirdId);
    if(tapped&&(tapped.member_id!==memberId||entered.has(tapped.id)))tappedBirdId=null;
    birdSelect.value=tappedBirdId||'';
    showBird();
  };
  if(birdSelect){
    entryForm.elements.nfc_tag.readOnly=true;
    entryForm.elements.member_id.addEventListener('change',fillBirds);
    entryForm.elements.pigeon_ring.addEventListener('input',()=>{
      const tapped=birdById.get(tappedBirdId),ring=entryForm.elements.pigeon_ring.value.trim().toUpperCase();
      if(tapped&&String(tapped.ring_number).toUpperCase()!==ring)tappedBirdId=null;
      if(!entryForm.elements.member_id.value){const bird=ringBird();if(bird){entryForm.elements.member_id.value=String(bird.member_id);entryForm.elements.member_id.dispatchEvent(new Event('change'));}}
      showBird();
    });
    view.querySelector('#entry-race').addEventListener('change',fillBirds);
    fillBirds();
  }
  const applyEntryMode=()=>{
    const rfid=entryForm.dataset.mode==='rfid';
    tappedBirdId=null;entryForm.elements.pigeon_ring.value='';entryForm.elements.nfc_tag.value='';entryForm.elements.barcode.value='';
    entryForm.elements.pigeon_ring.readOnly=Boolean(birds)&&rfid;
    entryForm.elements.pigeon_ring.placeholder=birds?(rfid?'Filled by the RFID tap':'Type the bonded bird\'s ring number'):'';
    if(birdSelect)showBird();
  };
  entryForm.addEventListener('entry-mode',applyEntryMode);applyEntryMode();
  entryForm.elements.nfc_expiry_days.addEventListener('change',()=>{const custom=entryForm.elements.nfc_expiry_custom;custom.hidden=entryForm.elements.nfc_expiry_days.value!=='custom';custom.required=!custom.hidden;if(!custom.hidden)custom.focus();});
  // A USB reader in keyboard mode presses Enter after the tag ID; keep it in the field instead of submitting the form.
  // A tag read by the chosen reader. With bird bonding it picks the bonded bird
  // (and its member); otherwise it fills the NFC tag field.
  const handleTag=(uid,from,candidates=[uid])=>{
    // A USB reader may type the ID in another form: use the one that is bonded.
    uid=candidates.find(item=>birds?.some(bird=>bird.status==='active'&&bird.nfc_tag===item))||uid;
    const label=formatNfcUid(uid),by=from?` by ${from}`:'';
    if(!birds){entryForm.elements.nfc_tag.value=label;message(`NFC tag ${label} read${by}.`,'success');return;}
    const bird=birds.find(item=>item.status==='active'&&item.nfc_tag===uid);
    if(!bird){message(`RFID tag ${label} (read${by}) is not bonded to an active bird. Bond the bird on Bird bonding first.`,'error');return;}
    if(enteredInRace().has(bird.id)){message(`${bird.ring_number} (${bird.bird_name}) is already entered in this race.`,'error');return;}
    tappedBirdId=bird.id;birdSelect.value=String(bird.id);
    entryForm.elements.member_id.value=String(bird.member_id);entryForm.elements.member_id.dispatchEvent(new Event('change'));
    showBird();
    message(`RFID tag ${label} read${by}: ${bird.ring_number} · ${bird.bird_name}.`,'success');
  };
  // A tag tapped while on Sticker entries: it is an RFID entry, so switch to
  // RFID entries first (the page works out which kind of entry it is).
  let switchTab=()=>{};
  const tabIsRegister=()=>!view.querySelector('[data-entry-pane="register"]').hidden;
  const tapFromReader=(uid,from,candidates)=>{if(entryForm.dataset.mode!=='rfid'&&birds){switchTab('rfid');message('RFID tag tapped: switched to RFID entries.','info');}handleTag(uid,from,candidates);};
  entryForm.elements.nfc_tag.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();const uid=normalizeNfcUid(entryForm.elements.nfc_tag.value);if(uid)handleTag(uid,'');else if(uid===null)message(NFC_HELP,'error');}});
  let stopEntryNfc=()=>{},nfcTimer=null,disposed=false;
  view.insertAdjacentHTML('beforeend',stickerScannerDialogHtml());const stopStickerScanner=bindStickerScanner(view,entryForm);
  // Only the reader chosen above fills the tag field.
  const readerChoice=()=>entryForm.querySelector('[name=nfc_read_with]:checked')?.value||'';
  const READER_KEY='avilonx.entries.reader',readerHint=view.querySelector('[data-reader-choice-hint]');
  const READER_HINTS={wireless:'Tap the tag on the club admin\'s ESP8266 wireless reader. It is read by itself.',wired:'Tap the tag on the USB reader plugged into this computer.',phone:'Press the NFC button in the RFID field, then hold the tag to the back of the Android phone (Chrome).'};
  const applyReaderChoice=()=>{const choice=readerChoice();const usbLine=view.querySelector('[data-usb-status]');if(usbLine){usbLine.hidden=choice!=='wired';if(choice==='wired'&&!usbLine.textContent){usbLine.className='small usb-reader-status';usbLine.textContent='USB reader: waiting for a tap. What it types will show here.';}}readerHint.textContent=(READER_HINTS[choice]||'Choose the reader, then tap the pigeon\'s RFID tag. Only that reader is used.')+(birds&&choice?' Tapping a bonded bird\'s tag selects that bird.':'');if(choice==='wired'||!choice)readerHint.insertAdjacentHTML('beforeend',` ACR122U on a Windows laptop? <a href="${pageUrl('tools/nfc-reader/acr122u-avilonx-helper.zip')}" download><strong>Download the ACR122U helper</strong></a> and install it once (it starts with Windows).`);if(tapButton)tapButton.hidden=choice!=='phone';try{if(choice)localStorage.setItem(READER_KEY,choice);}catch{/* storage unavailable */}};
  try{const saved=localStorage.getItem(READER_KEY);const radio=saved&&entryForm.querySelector(`[name=nfc_read_with][value="${saved}"]`);if(radio)radio.checked=true;}catch{/* storage unavailable */}
  entryForm.querySelectorAll('[name=nfc_read_with]').forEach(radio=>radio.addEventListener('change',applyReaderChoice));applyReaderChoice();
  const usbStatus=view.querySelector('[data-usb-status]');
  const stopReaderKeys=listenForReaderKeys((uid,info)=>{if(readerChoice()!=='wired'||!tabIsRegister())return false;tapFromReader(uid,'the USB reader',info.candidates);},{takeFromTextFields:true,helper:()=>readerChoice()==='wired'&&tabIsRegister(),onBurst:burst=>{if(readerChoice()==='wired'){usbStatus.hidden=false;usbReaderStatus(usbStatus)(burst);}}});
  const stopDeviceScans=listenForDeviceScans((uid,reader)=>{if(readerChoice()!=='wireless'||!tabIsRegister())return;tapFromReader(uid,reader);});
  setPageCleanup(()=>{disposed=true;stopEntryNfc();clearTimeout(nfcTimer);stopStickerScanner();stopReaderKeys();stopDeviceScans();});
  if(tapButton)tapButton.onclick=async()=>{tapButton.disabled=true;message('Hold the pigeon\'s NFC tag against the back of the phone…','info');let stop=()=>{};try{stop=await startPhoneNfc(uid=>{stop();tapButton.disabled=false;handleTag(uid,'the phone');},error=>message(error.message,'error'));stopEntryNfc=stop;if(disposed){stop();return;}nfcTimer=setTimeout(()=>{if(tapButton.disabled){stop();tapButton.disabled=false;}},30000);}catch(error){tapButton.disabled=false;message(error.message,'error');}};
  mountEntrySheetImport(view,races,members,entries,readerByMember,birds);
  view.querySelector('#entry-race').addEventListener('change',()=>showLastRace());
  entryForm.addEventListener('entry-mode',()=>showLastRace());
  // More options: show the current choices in its heading.
  const moreSummary=view.querySelector('[data-more-summary]');
  const showMore=()=>{if(moreSummary)moreSummary.textContent=`(${entryForm.elements.category.value} · ${entryForm.elements.race_type.value} · ${entryForm.elements.pooling.value==='1'?'pooling':'no pooling'})`;};
  ['category','race_type','pooling'].forEach(name=>entryForm.elements[name].addEventListener('change',showMore));showMore();
  view.querySelector('#entry-race').addEventListener('change',event=>{try{sessionStorage.setItem(RACE_KEY,event.target.value);}catch{/* storage unavailable */}});
  const tabs=view.querySelector('[data-entry-tabs]'),tabButtons=[...view.querySelectorAll('[data-entry-tab]')];
  const ENTRY_TAB_KEY='avilonx.entries.tab',form=view.querySelector('#entry-form');
  const showTab=tab=>{
    const register=tab==='rfid'||tab==='sticker';
    tabs.dataset.tab=register?'register':tab;tabButtons.forEach(button=>button.setAttribute('aria-selected',String(button.dataset.entryTab===tab)));
    view.querySelector('[data-entry-pane="register"]').hidden=!register;view.querySelector('[data-entry-pane="import"]').hidden=register;
    if(register&&form.dataset.mode!==tab){form.dataset.mode=tab;form.dispatchEvent(new CustomEvent('entry-mode'));}
    if(register)try{localStorage.setItem(ENTRY_TAB_KEY,tab);}catch{/* storage unavailable */}
  };
  try{const saved=localStorage.getItem(ENTRY_TAB_KEY);if(saved==='sticker')showTab('sticker');}catch{/* storage unavailable */}
  tabButtons.forEach(button=>button.onclick=()=>showTab(button.dataset.entryTab));
  switchTab=showTab;
}
