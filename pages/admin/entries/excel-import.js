import { normalizeImportHeader } from '../../../assets/js/shared.js';
import { rotateDocumentCanvas } from './sheet-reader.js';
import { sheetRemarks } from './sheet-parse.js';

let spreadsheetZipReaderPromise=null;
export function loadSpreadsheetZipReader(){
  if(window.JSZip?.loadAsync)return Promise.resolve(window.JSZip);
  if(!spreadsheetZipReaderPromise)spreadsheetZipReaderPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';script.crossOrigin='anonymous';script.dataset.jszip='';
    script.onload=()=>window.JSZip?.loadAsync?resolve(window.JSZip):reject(new Error('The Excel image reader did not load.'));
    script.onerror=()=>reject(new Error('Could not load the Excel image reader. Check your internet connection.'));
    document.head.append(script);
  }).catch(error=>{spreadsheetZipReaderPromise=null;document.querySelector('[data-jszip]')?.remove();throw error;});
  return spreadsheetZipReaderPromise;
}
export function entrySheetRowsFromWorksheet(XLSX,arrayBuffer){
  const workbook=XLSX.read(arrayBuffer,{type:'array',cellDates:false});
  if(!workbook.SheetNames?.length)throw new Error('The Excel file has no worksheet.');
  const sheet=workbook.Sheets[workbook.SheetNames[0]],matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false,blankrows:true});
  if(!matrix.length)throw new Error('The first worksheet is empty.');
  const aliases={sheetRow:['no','number','row','rownumber','sheetrow'],memberNo:['memberid','memberno','membernumber','loftname','loft'],ring:['ring','ringnumber','pigeonring','pigeonringnumber','pigeonid'],barcode:['barcode','barcodenumber','stickercode','stickernumber','sticker','stickerreferencenumber','referencenumber'],remarks:['remarks','remark','skipnotes','notes']};
  const headerRowIndex=matrix.slice(0,10).findIndex(row=>{const headers=new Set(row.map(normalizeImportHeader));return aliases.memberNo.some(name=>headers.has(name))&&aliases.ring.some(name=>headers.has(name))&&aliases.barcode.some(name=>headers.has(name));});
  if(headerRowIndex<0)throw new Error('Could not find the required headings in the first 10 rows. Use the template columns Member ID, Ring Number, and Barcode Number.');
  const header=matrix[headerRowIndex].map(normalizeImportHeader),findColumn=names=>header.findIndex(value=>names.includes(value)),columns={sheetRow:findColumn(aliases.sheetRow),memberNo:findColumn(aliases.memberNo),ring:findColumn(aliases.ring),barcode:findColumn(aliases.barcode),remarks:findColumn(aliases.remarks)};
  const cell=(row,column)=>column<0?'':String(row[column]??'').trim(),dataRows=matrix.slice(headerRowIndex+1).map((row,index)=>({row,rowNumber:headerRowIndex+index+2})).filter(item=>item.row.some(value=>String(value??'').trim()!==''));
  if(!dataRows.length)throw new Error('No entry rows were found below the headings. Add one pigeon per row.');
  if(dataRows.length>1000)throw new Error('Import up to 1,000 race entries at a time. Split the worksheet into smaller batches.');
  const barcodeValue=value=>/^(?:=|#(?:N\/A|VALUE!|NAME\?|REF!|DIV\/0!))/i.test(value)||/(?:DISPIMG|IMAGE)\s*\(/i.test(value)?'':value;
  return dataRows.map((item,index)=>({id:`sheet-${Date.now()}-${index}-${Math.random().toString(36).slice(2,7)}`,sheetRow:cell(item.row,columns.sheetRow)||String(item.rowNumber),sourceRowNumber:item.rowNumber,barcodeExcelColumn:columns.barcode,member_no:cell(item.row,columns.memberNo),pigeon_ring:cell(item.row,columns.ring),remarks_text:sheetRemarks(cell(item.row,columns.remarks)).join('/'),barcode:barcodeValue(cell(item.row,columns.barcode)),barcodeDetected:false,barcodeScanError:'',barcodeRegion:null,errors:[],member:null,saved:false}));
}
export const EXCEL_RELATIONSHIP_NAMESPACE='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export function excelXMLNodes(node,localName){return Array.from(node.getElementsByTagNameNS('*',localName));}
export function parseExcelXML(xml,label){const documentXml=new DOMParser().parseFromString(xml,'application/xml');if(documentXml.getElementsByTagName('parsererror').length)throw new Error(`Could not read ${label} from the Excel workbook.`);return documentXml;}
export function excelRelationshipMap(documentXml){return new Map(excelXMLNodes(documentXml,'Relationship').map(relation=>[relation.getAttribute('Id'),{target:relation.getAttribute('Target'),type:relation.getAttribute('Type')}]));}
export function excelNamespacedAttribute(node,namespace,localName){const direct=node.getAttributeNS?.(namespace,localName);if(direct)return direct;return Array.from(node.attributes||[]).find(attribute=>attribute.localName===localName&&attribute.namespaceURI===namespace)?.value||Array.from(node.attributes||[]).find(attribute=>attribute.name?.split(':').pop()===localName)?.value||'';}
export function resolveExcelZipPath(baseDirectory,target){
  const pieces=String(target||'').startsWith('/')?[]:String(baseDirectory||'').split('/').filter(Boolean),targetPieces=String(target||'').replace(/^\//,'').split('/');
  for(const encoded of targetPieces){if(!encoded||encoded==='.')continue;if(encoded==='..'){pieces.pop();continue;}let piece=encoded;try{piece=decodeURIComponent(encoded);}catch{}pieces.push(piece);}
  return pieces.join('/');
}
export function excelRelsPath(partPath){const slash=partPath.lastIndexOf('/');return `${partPath.slice(0,slash)}/_rels/${partPath.slice(slash+1)}.rels`;}
export function excelDirectChild(parent,localName){return Array.from(parent.children||parent.childNodes||[]).find(child=>child.nodeType===1&&child.localName===localName)||null;}
export function excelCellAddress(reference){const match=String(reference||'').match(/^([A-Z]+)(\d+)$/i);if(!match)return null;let column=0;for(const letter of match[1].toUpperCase())column=column*26+letter.charCodeAt(0)-64;return {column:column-1,row:Number(match[2])};}
export function excelImageMimeType(imagePath){const extension=imagePath.split('.').pop().toLowerCase();return ({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',bmp:'image/bmp',webp:'image/webp',svg:'image/svg+xml',tif:'image/tiff',tiff:'image/tiff'})[extension]||'application/octet-stream';}
export async function extractExcelCellBarcodeImages(zip,worksheetXml,barcodeColumn){
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
export async function extractExcelBarcodeImages(arrayBuffer,barcodeColumn){
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
export async function decodeExcelBarcodeImages(images,rows,reader,onProgress=()=>{}){
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
