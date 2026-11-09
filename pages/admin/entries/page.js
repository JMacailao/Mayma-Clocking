import { supabase, escapeHTML, message, dbError, number, tableRows } from '../../../assets/js/shared.js';

let spreadsheetParserPromise=null;
function loadSpreadsheetParser(){
  if(window.XLSX?.read)return Promise.resolve(window.XLSX);
  if(!spreadsheetParserPromise)spreadsheetParserPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';script.crossOrigin='anonymous';script.dataset.sheetjs='';
    script.onload=()=>window.XLSX?.read?resolve(window.XLSX):reject(new Error('The Excel reader did not load.'));
    script.onerror=()=>reject(new Error('Could not load the Excel reader. Check your internet connection.'));
    document.head.append(script);
  }).catch(error=>{spreadsheetParserPromise=null;document.querySelector('[data-sheetjs]')?.remove();throw error;});
  return spreadsheetParserPromise;
}
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

function distanceMeters(lat1,lon1,lat2,lon2){const rad=n=>n*Math.PI/180;const a=Math.sin(rad(lat2-lat1)/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(rad(lon2-lon1)/2)**2;return 6371008.8*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
function mountEntrySheetImport(view,races,members,entries){
  const existingForm=view.querySelector('#entry-form'),submitHandler=existingForm?.onsubmit;
  const raceOptions=races.map(race=>`<option value="${race.id}">${escapeHTML(race.name)}</option>`).join('');
  const importPanel=`<section class="panel entry-sheet-panel"><div class="panel-heading"><div><h3>Scan or upload a race sheet</h3><p class="small">Upload a photo/PDF to scan the sheet, or download the Excel template and import a completed workbook. Required columns: Member ID, Ring Number, and Barcode Number.</p></div></div><div class="entry-sheet-controls"><label class="field"><span>Race schedule</span><select data-sheet-race><option value="">Choose a race</option>${raceOptions}</select></label><label class="field"><span>Document photo or PDF</span><input type="file" data-sheet-file accept="image/*,.pdf,application/pdf" capture="environment"><small class="small">Reads handwritten IDs and ring numbers; review red rows because handwriting can be misread. PDF uploads read the first page. Rotate if the text is sideways.</small></label></div><div class="entry-sheet-actions"><button class="button secondary" type="button" data-download-entry-template>Download Excel template</button><button class="button secondary" type="button" data-open-entry-excel>Import Excel</button><input type="file" data-entry-excel accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" hidden></div><p class="small">Template columns: No. (optional), Member ID, Ring Number, Skip / Notes (ignored), Barcode Number. Enter barcode values as text to preserve leading zeroes. For barcode pictures, use an .xlsx file with the image in the Barcode Number cell; the importer will scan it.</p><div class="entry-sheet-actions"><button class="button secondary" type="button" data-rotate-sheet disabled>Rotate 90°</button><button class="button primary" type="button" data-read-sheet disabled>Read photo + scan barcodes</button></div><p class="entry-sheet-status" data-sheet-status aria-live="polite">Choose a race, then upload a photo/PDF or import an Excel file.</p><div class="entry-sheet-preview" data-sheet-preview hidden><canvas data-sheet-preview-canvas></canvas></div><section class="entry-sheet-review" data-sheet-review hidden><div class="panel-heading"><div><h3>Review race entries</h3><p class="small">All detected rows stay in the table. Red rows show errors; fix them before saving those entries.</p></div><span class="count-pill" data-sheet-count></span></div><div data-sheet-table></div><div class="form-actions"><button class="button secondary" type="button" data-clear-sheet>Clear scan</button><button class="button primary" type="button" data-save-sheet disabled>Save valid entries</button></div></section></section>`;
  view.innerHTML=view.innerHTML.replace('<section class="panel"><h3>Register a pigeon</h3>',`${importPanel}<section class="panel"><h3>Register a pigeon</h3>`);
  const newForm=view.querySelector('#entry-form');if(newForm&&submitHandler)newForm.onsubmit=submitHandler;
  const registeredPanel=[...view.querySelectorAll('.panel')].find(panel=>panel.querySelector('h3')?.textContent==='Registered pigeons');
  if(registeredPanel)registeredPanel.innerHTML='<div class="panel-heading"><h3>Registered pigeons</h3></div><div data-registered-entries></div>';
  const fileInput=view.querySelector('[data-sheet-file]'),excelFileInput=view.querySelector('[data-entry-excel]'),raceSelect=view.querySelector('[data-sheet-race]'),readButton=view.querySelector('[data-read-sheet]'),rotateButton=view.querySelector('[data-rotate-sheet]'),status=view.querySelector('[data-sheet-status]'),preview=view.querySelector('[data-sheet-preview]'),previewCanvas=view.querySelector('[data-sheet-preview-canvas]'),review=view.querySelector('[data-sheet-review]'),table=view.querySelector('[data-sheet-table]'),count=view.querySelector('[data-sheet-count]'),saveButton=view.querySelector('[data-save-sheet]');
  if(!fileInput)return;
  let sourceCanvas=null,rotation=0,rows=[],validationTimer=null,validationSequence=0;
  const drawRegistered=()=>{const mapped=entries.map(entry=>({...entry,member:members.find(member=>member.id===entry.member_id),race:races.find(race=>race.id===entry.race_id)}));view.querySelector('[data-registered-entries]').innerHTML=tableRows(mapped,[{key:'race',label:'Race',render:item=>escapeHTML(item.race?.name||'—')},{key:'member',label:'Member',render:item=>`${escapeHTML(item.member?.member_no||'—')} · ${escapeHTML(item.member?.full_name||'')}`},{key:'pigeon_ring',label:'Ring'},{key:'barcode',label:'Barcode'},{key:'distance_m',label:'Distance',render:item=>`${number(item.distance_m)} m`}],'No pigeons registered.',false);};
  drawRegistered();
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
      sheet['!cols']=[{wch:10},{wch:20},{wch:24},{wch:24},{wch:24}];instructions['!cols']=[{wch:100}];XLSX.utils.book_append_sheet(workbook,sheet,'Race Entries');XLSX.utils.book_append_sheet(workbook,instructions,'Instructions');XLSX.writeFile(workbook,'mayma-race-entries-template.xlsx');message('Race entry Excel template downloaded. Fill one pigeon per row, then import it for review.','success');
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
  view.querySelector('[data-clear-sheet]').onclick=()=>{rows=[];sourceCanvas=null;rotation=0;fileInput.value='';excelFileInput.value='';preview.hidden=true;review.hidden=true;readButton.disabled=true;rotateButton.disabled=true;saveButton.disabled=true;status.textContent='Choose a race, then upload a photo/PDF or import an Excel file.';};
  saveButton.onclick=async()=>{
    await validateRows();const race=races.find(item=>item.id===Number(raceSelect.value)),valid=rows.filter(row=>!row.saved&&!row.errors.length&&row.member);if(!race||!valid.length){message('There are no valid rows to save. Correct the red rows in the table.','error');return;}
    const payload=valid.map(row=>({race_id:race.id,member_id:row.member.id,pigeon_ring:row.pigeon_ring.trim().toUpperCase(),barcode:row.barcode.trim(),pooling:0,category:'Open Category',race_type:'Regular Race/Set',distance_m:distanceMeters(race.release_latitude,race.release_longitude,row.member.latitude,row.member.longitude)}));
    saveButton.disabled=true;saveButton.textContent='Saving…';const {error}=await supabase.from('race_entries').insert(payload);if(error){message(dbError(error),'error');await validateRows();return;}
    valid.forEach(row=>{row.saved=true;row.errors=[];});entries.unshift(...payload.map((entry,index)=>({...entry,id:`sheet-entry-${Date.now()}-${index}`})));drawRegistered();redrawRows();await validateRows();
    const errorsLeft=rows.filter(row=>!row.saved).length;status.textContent=errorsLeft?`Saved ${valid.length} pigeon${valid.length===1?'':'s'}; ${errorsLeft} row${errorsLeft===1?'':'s'} still have errors.`:`Saved ${valid.length} pigeon${valid.length===1?'':'s'}. All scanned items remain visible in the table.`;message(status.textContent,errorsLeft?'info':'success');
  };
}
export async function entriesPage(view) {
  const [{data:races,error:a},{data:members,error:b}]=await Promise.all([supabase.from('races').select('*').order('id',{ascending:false}),supabase.from('members').select('id,member_no,full_name,loft_name,latitude,longitude').order('member_no')]);if(a||b)throw a||b;
  const {data:entries,error}=await supabase.from('race_entries').select('*').order('id',{ascending:false});if(error)throw error;
  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">PIGEON ROSTER</span><h2>Race entries</h2><p>Register each pigeon once for the selected schedule.</p></div></div><section class="panel"><h3>Register a pigeon</h3><form id="entry-form" class="form-grid"><label class="field"><span>Race schedule</span><select name="race_id" required><option value="">Choose a race</option>${races.map(r=>`<option value="${r.id}">${escapeHTML(r.name)}</option>`).join('')}</select></label><label class="field"><span>Member</span><select name="member_id" required><option value="">Choose a member</option>${members.map(m=>`<option value="${m.id}">${escapeHTML(m.member_no)} · ${escapeHTML(m.full_name)}</option>`).join('')}</select></label><label class="field"><span>Ring number</span><input name="pigeon_ring" maxlength="80" required></label><label class="field"><span>Race barcode · global sticker</span><input name="barcode" maxlength="120" required autocomplete="off" autocapitalize="none" autocorrect="off" placeholder="Type or scan the registered number"><small class="small">Use a sticker registered by Super Admin. The same global barcode can be used by any club.</small></label><label class="field"><span>Category</span><select name="category"><option>Open Category</option><option>Young Bird</option><option>Old Bird</option><option>Special Category</option></select></label><label class="field"><span>Race type</span><select name="race_type"><option>Regular Race/Set</option><option>Training Toss</option><option>Special Race</option></select></label><label class="field"><span>Pooling</span><select name="pooling"><option value="0">No</option><option value="1">Yes</option></select></label><div class="form-actions"><button class="button primary">Save entry</button></div></form></section><section class="panel"><div class="panel-heading"><h3>Registered pigeons</h3></div>${tableRows(entries.map(e=>({...e,member:members.find(m=>m.id===e.member_id),race:races.find(r=>r.id===e.race_id)})),[{key:'race',label:'Race',render:r=>escapeHTML(r.race?.name||'—')},{key:'member',label:'Member',render:r=>`${escapeHTML(r.member?.member_no||'—')} · ${escapeHTML(r.member?.full_name||'')}`},{key:'pigeon_ring',label:'Ring'},{key:'barcode',label:'Barcode'},{key:'distance_m',label:'Distance',render:r=>`${number(r.distance_m)} m`}],'No pigeons registered.',false)}</section>`;
  view.querySelector('#entry-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,m=members.find(x=>x.id===Number(f.member_id.value)),r=races.find(x=>x.id===Number(f.race_id.value)),barcode=f.barcode.value.trim();if(!m||!r)return;const {data:sticker,error:stickerError}=await supabase.from('barcode_stickers').select('barcode_number').eq('barcode_number',barcode).maybeSingle();if(stickerError){message(stickerError.message.includes('barcode_stickers')?'The global sticker registry is not installed. Run sticker-barcodes.sql in Supabase SQL Editor.':stickerError.message,'error');return;}if(!sticker){message('This barcode is not registered. Ask the Super Admin to register it first.','error');return;}const {error}=await supabase.from('race_entries').insert({race_id:r.id,member_id:m.id,pigeon_ring:f.pigeon_ring.value.trim().toUpperCase(),barcode,pooling:Number(f.pooling.value),category:f.category.value,race_type:f.race_type.value,distance_m:distanceMeters(r.release_latitude,r.release_longitude,m.latitude,m.longitude)});if(error){message(dbError(error),'error');return;}location.reload();};
  mountEntrySheetImport(view,races,members,entries);
}
