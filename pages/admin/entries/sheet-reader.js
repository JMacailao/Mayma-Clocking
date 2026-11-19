import { readDigitBox } from './digit-reader.js';
import { sheetRemarks, stickerFromText } from './sheet-parse.js';

let documentOcrPromise=null;
export function loadDocumentOCR(){
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
export function loadDocumentBarcodeReader(){
  if(!documentBarcodeReaderPromise)documentBarcodeReaderPromise=Promise.all([
    import('https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm'),
    import('https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/+esm')
  ]).then(([browserZXing,zxing])=>{
    const hints=new Map();hints.set(zxing.DecodeHintType.POSSIBLE_FORMATS,[browserZXing.BarcodeFormat.CODE_128,browserZXing.BarcodeFormat.CODE_39,browserZXing.BarcodeFormat.EAN_13,browserZXing.BarcodeFormat.EAN_8,browserZXing.BarcodeFormat.UPC_A,browserZXing.BarcodeFormat.UPC_E,browserZXing.BarcodeFormat.ITF,browserZXing.BarcodeFormat.CODABAR,browserZXing.BarcodeFormat.QR_CODE,browserZXing.BarcodeFormat.DATA_MATRIX,browserZXing.BarcodeFormat.PDF_417,browserZXing.BarcodeFormat.AZTEC]);hints.set(zxing.DecodeHintType.TRY_HARDER,true);
    return new browserZXing.BrowserMultiFormatReader(hints);
  }).catch(error=>{documentBarcodeReaderPromise=null;throw error;});
  return documentBarcodeReaderPromise;
}
export async function scanSheetBarcodes(source,rows,reader,onProgress=()=>{}){
  for(let index=0;index<rows.length;index++){
    const row=rows[index],region=row.barcodeRegion;
    if(!region){row.barcodeScanError='Barcode area could not be located. Enter or correct the barcode manually.';onProgress(index+1,rows.length);continue;}
    const left=Math.max(0,Math.floor(region.left)),top=Math.max(0,Math.floor(region.top)),right=Math.min(source.width,Math.ceil(region.right)),bottom=Math.min(source.height,Math.ceil(region.bottom)),width=right-left,height=bottom-top;
    if(width<8||height<8){row.barcodeScanError='Barcode area could not be located. Enter or correct the barcode manually.';onProgress(index+1,rows.length);continue;}
    // Several crops: the whole cell, inside its border lines, and the bars only (above the printed numbers).
    const cropOf=(x,y,w,h,threshold=false)=>{const scale=Math.min(3,Math.max(1,900/w)),crop=document.createElement('canvas');crop.width=Math.max(1,Math.round(w*scale)+40);crop.height=Math.max(1,Math.round(h*scale)+40);const context=crop.getContext('2d',{willReadFrequently:true});context.fillStyle='#fff';context.fillRect(0,0,crop.width,crop.height);context.drawImage(source,x,y,w,h,20,20,crop.width-40,crop.height-40);
      if(threshold){const pixels=context.getImageData(0,0,crop.width,crop.height),data=pixels.data;let sum=0;for(let i=0;i<data.length;i+=4)sum+=data[i]*.299+data[i+1]*.587+data[i+2]*.114;const cut=sum/(data.length/4)-25;for(let i=0;i<data.length;i+=4){const v=(data[i]*.299+data[i+1]*.587+data[i+2]*.114)<cut?0:255;data[i]=data[i+1]=data[i+2]=v;}context.putImageData(pixels,0,0);}
      return crop;};
    const inset=Math.round(Math.min(width,height)*.06),crops=[cropOf(left,top,width,height),cropOf(left+inset,top+inset,width-2*inset,height-2*inset),cropOf(left+inset,top+inset,width-2*inset,Math.round(height*.62)),cropOf(left+inset,top+inset,width-2*inset,Math.round(height*.62),true)];
    let result=null;
    search:for(const crop of crops)for(const angle of [0,180,90,270]){try{result=reader.decodeFromCanvas(angle?rotateDocumentCanvas(crop,angle):crop);break search;}catch{}}
    const value=result?.getText?.().trim().replace(/\s+/g,'')||'';
    if(value){row.barcode=value;row.barcodeDetected=true;row.barcodeScanError='';}
    else if(row.printedBarcode){row.barcode=row.printedBarcode;row.barcodeDetected=false;row.barcodeScanError='';}
    else{row.barcodeDetected=false;row.barcodeScanError='Barcode image was not detected. Type or correct the barcode.';}
    reader.reset?.();onProgress(index+1,rows.length);
  }
  return rows;
}
export async function documentFileToCanvas(file){
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
export function rotateDocumentCanvas(source,rotation){
  const sideways=rotation%180!==0,canvas=document.createElement('canvas');canvas.width=sideways?source.height:source.width;canvas.height=sideways?source.width:source.height;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.translate(canvas.width/2,canvas.height/2);context.rotate(rotation*Math.PI/180);context.drawImage(source,-source.width/2,-source.height/2);return canvas;
}
// Finds the loading form's table in a photo: long, thin ruled lines (the
// paper may be a little tilted, the desk around it dark). Returns the column
// lines and row lines, or null when no table is found.
export function detectTableGrid(canvas){
  const scale=Math.min(1,1400/Math.max(canvas.width,canvas.height)),W=Math.max(1,Math.round(canvas.width*scale)),H=Math.max(1,Math.round(canvas.height*scale));
  const small=document.createElement('canvas');small.width=W;small.height=H;const sctx=small.getContext('2d',{willReadFrequently:true});sctx.drawImage(canvas,0,0,W,H);
  const rgba=sctx.getImageData(0,0,W,H).data,gray=new Float32Array(W*H);
  for(let i=0;i<W*H;i++)gray[i]=rgba[i*4]*.299+rgba[i*4+1]*.587+rgba[i*4+2]*.114;
  // Dark compared with the neighbourhood (copes with shadows across the paper).
  const integral=new Float64Array((W+1)*(H+1));
  for(let y=0;y<H;y++){let row=0;for(let x=0;x<W;x++){row+=gray[y*W+x];integral[(y+1)*(W+1)+x+1]=integral[y*(W+1)+x+1]+row;}}
  const R=12,dark=new Uint8Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const x0=Math.max(0,x-R),x1=Math.min(W,x+R+1),y0=Math.max(0,y-R),y1=Math.min(H,y+R+1),sum=integral[y1*(W+1)+x1]-integral[y0*(W+1)+x1]-integral[y1*(W+1)+x0]+integral[y0*(W+1)+x0],mean=sum/((x1-x0)*(y1-y0));dark[y*W+x]=gray[y*W+x]<mean-14?1:0;}
  const D=5,isV=(x,y)=>x>=D&&x<W-D&&dark[y*W+x]&&!(dark[y*W+x-D]&&dark[y*W+x+D]),isH=(x,y)=>y>=D&&y<H-D&&dark[y*W+x]&&!(dark[(y-D)*W+x]&&dark[(y+D)*W+x]);
  const slopes=[-0.06,-0.045,-0.03,-0.02,-0.01,0,0.01,0.02,0.03,0.045,0.06];
  // Longest run along a (slightly tilted) line, allowing small gaps.
  const runFrom=(length,at)=>{let best=[0,0,0],start=-1,last=-1,gap=0;const close=()=>{if(start>=0&&last-start>best[0])best=[last-start,start,last];};for(let t=0;t<length;t++){if(at(t)){if(start<0)start=t;last=t;gap=0;}else if(start>=0&&++gap>10){close();start=-1;gap=0;}}close();return best;};
  const lines=(count,length,test)=>{const found=[];for(let p=0;p<count;p+=2){let best=null;for(const slope of slopes){const run=runFrom(length,t=>{const q=Math.round(p+t*slope);return q>=1&&q<count-1&&(test(q,t)||test(q-1,t)||test(q+1,t));});if(!best||run[0]>best.run)best={pos:p,slope,run:run[0],from:run[1],to:run[2]};}if(best.run>length*.3)found.push(best);}
    // Keep the strongest of lines that are close together.
    const kept=[];found.sort((a,b)=>b.run-a.run).forEach(line=>{if(!kept.some(other=>Math.abs(other.pos-line.pos)<length*.012+6))kept.push(line);});return kept.sort((a,b)=>a.pos-b.pos);};
  const horizontal=lines(H,W,(y,x)=>isH(x,y));
  const median=list=>{const sorted=[...list].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)];};
  const long=horizontal.filter(line=>line.run>W*.4);
  if(long.length<4)return null;
  const left=median(long.map(line=>line.from)),right=median(long.map(line=>line.to)),tableWidth=right-left;
  const rowLines=horizontal.filter(line=>line.run>tableWidth*.55).sort((a,b)=>a.pos-b.pos);
  const yOn=(line,x)=>line.pos+x*line.slope;
  // Each band between two row lines: where the column lines cross it (the
  // paper may curve, so this is worked out per band).
  const bands=[];
  for(let index=1;index<rowLines.length;index++){
    const a=rowLines[index-1],b=rowLines[index],profile=[];
    for(let x=Math.max(D,Math.round(left-25));x<Math.min(W-D,Math.round(right+25));x++){
      const top=Math.round(yOn(a,x))+4,bottom=Math.round(yOn(b,x))-4;if(bottom-top<6){profile.push([x,0]);continue;}
      let hit=0;for(let y=top;y<=bottom;y++)if(isV(x,y)||isV(x-1,y)||isV(x+1,y))hit++;profile.push([x,hit/(bottom-top+1)]);
    }
    const peaks=[];profile.forEach(([x,value],k)=>{if(value<.55)return;if(profile.slice(Math.max(0,k-6),k+7).some(([,other])=>other>value))return;if(peaks.length&&x-peaks[peaks.length-1]<15)return;peaks.push(x);});
    bands.push({a,b,peaks});
  }
  // Columns per band, using the loading form's layout: No. | Loft name | Pigeon
  // I.D. | Remarks | Sticker. The sticker's barcode shows as a run of many
  // close "lines": its first one is the Remarks|Sticker line.
  const layout=bands.map(band=>{
    const peaks=band.peaks;let best=null;
    for(let start=0;start<peaks.length;start++){let end=start;while(end+1<peaks.length&&peaks[end+1]-peaks[end]<38)end++;if(end-start>=3&&(!best||end-start>best[1]-best[0]))best=[start,end];}
    if(!best)return null;
    const before=peaks.slice(0,best[0]);if(before.length<2)return null;
    return {remarksSticker:peaks[best[0]],right:peaks[best[1]],pigeonRemarks:before[before.length-1],loftPigeon:before[before.length-2],earlier:before.slice(0,-2)};
  });
  const known=layout.filter(Boolean);
  if(known.length<2)return null;
  // The member (Loft name) column's width, from bands where its left line was found.
  const memberWidths=known.map(item=>{const left=[...item.earlier].reverse().find(x=>item.loftPigeon-x>30);return left===undefined?null:item.loftPigeon-left;}).filter(Boolean);
  const memberWidth=memberWidths.length?median(memberWidths):median(known.map(item=>item.pigeonRemarks-item.loftPigeon));
  const gap=(a,b)=>median(known.map(item=>item[b]-item[a]));
  const toFull=value=>value/scale;
  return {bands:bands.map((band,index)=>{
    let item=layout[index];
    if(!item){// No sticker barcode seen in this band (heading or empty row): use the usual layout.
      const loft=band.peaks.find(x=>Math.abs(x-median(known.map(k=>k.loftPigeon)))<40);if(loft===undefined)return null;
      item={loftPigeon:loft,pigeonRemarks:loft+gap('loftPigeon','pigeonRemarks'),remarksSticker:loft+gap('loftPigeon','remarksSticker'),right:loft+gap('loftPigeon','right'),earlier:band.peaks.filter(x=>x<loft-30)};
    }
    const left=[...item.earlier].reverse().find(x=>item.loftPigeon-x>memberWidth*.85&&item.loftPigeon-x<memberWidth*1.08);
    const memberLeft=left===undefined?item.loftPigeon-memberWidth:left;
    const columns=[memberLeft-40,memberLeft,item.loftPigeon,item.pigeonRemarks,item.remarksSticker,Math.max(item.right+6,item.remarksSticker+40)].map(toFull);
    const midX=(columns[1]+columns[5])/2*scale;
    return {columns,top:toFull(yOn(band.a,midX)),bottom:toFull(yOn(band.b,midX)),hasSticker:Boolean(layout[index])};
  }).filter(Boolean)};
}
// One entry per data row of the table found by detectTableGrid. The values
// are read later, cell by cell (refineHandwrittenEntryFields and the barcodes).
export function entrySheetRowsFromGrid(grid,canvas){
  const regions=grid.bands.map(band=>({band,region:j=>({left:band.columns[j],right:band.columns[j+1],top:band.top,bottom:band.bottom})}));
  const withBarcode=regions.filter(({band,region})=>band.bottom-band.top>=14&&(band.hasSticker||barcodeGraphicPresent(canvas,region(4).left,region(4).right,band.top,band.bottom)));
  const typical=withBarcode.length?withBarcode.map(({band})=>band.bottom-band.top).sort((a,b)=>a-b)[Math.floor(withBarcode.length/2)]:null;
  const results=[];
  for(const {band,region} of regions){
    const height=band.bottom-band.top;if(height<14)continue;
    const barcodeGraphic=withBarcode.some(item=>item.band===band);
    if(typical&&height<typical*.72)continue;// the heading row (LOFT NAME, PIGEON I.D, ...) is shorter
    // A data row has its sticker, or writing in the ring column and the usual row height.
    if(!barcodeGraphic&&!(typical&&height>typical*.6&&height<typical*1.6&&inkInRegion(canvas,region(2))&&inkInRegion(canvas,region(1))&&results.length))continue;
    results.push({id:`sheet-${Date.now()}-${results.length}-${Math.random().toString(36).slice(2,7)}`,sheetRow:String(results.length+1),member_no:'',memberConfidence:0,pigeon_ring:'',ringConfidence:0,remarks_text:'',remarksConfidence:0,memberRegion:region(1),ringRegion:region(2),remarksRegion:region(3),stickerTextRegion:{...region(4),top:band.top+(band.bottom-band.top)*.62},barcode:'',printedBarcode:'',barcodeDetected:false,barcodeScanError:'',barcodeRegion:region(4),errors:[],member:null,saved:false});
  }
  return results;
}
// Some writing in a cell (not just its border lines).
export function inkInRegion(canvas,region){
  const left=Math.max(0,Math.floor(region.left+6)),top=Math.max(0,Math.floor(region.top+6)),right=Math.min(canvas.width,Math.ceil(region.right-6)),bottom=Math.min(canvas.height,Math.ceil(region.bottom-6));
  if(right-left<6||bottom-top<6)return false;
  const data=canvas.getContext('2d',{willReadFrequently:true}).getImageData(left,top,right-left,bottom-top).data;let dark=0,total=0,sum=0;
  for(let i=0;i<data.length;i+=16){const g=data[i]*.299+data[i+1]*.587+data[i+2]*.114;sum+=g;total++;}
  const mean=sum/Math.max(1,total);for(let i=0;i<data.length;i+=16){const g=data[i]*.299+data[i+1]*.587+data[i+2]*.114;if(g<mean-40)dark++;}
  return dark/Math.max(1,total)>.004;
}
export function documentGridRules(canvas){
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
export function barcodeGraphicPresent(canvas,left,right,top,bottom){
  left=Math.max(0,Math.floor(left));right=Math.min(canvas.width,Math.ceil(right));top=Math.max(0,Math.floor(top));bottom=Math.min(canvas.height,Math.ceil(bottom));const width=right-left,height=bottom-top;if(width<32||height<20)return false;
  const context=canvas.getContext('2d',{willReadFrequently:true}),threshold=Math.max(14,Math.floor(width*.055));let barcodeLikeLines=0;
  for(const ratio of [.34,.5,.64]){const y=Math.min(bottom-3,Math.max(top+3,Math.round(top+height*ratio))),data=context.getImageData(left,y,width,1).data;let previous=null,transitions=0,dark=0;
    for(let x=0;x<width;x++){const offset=x*4,isDark=(data[offset]*.299+data[offset+1]*.587+data[offset+2]*.114)<135;if(isDark)dark++;if(previous!==null&&isDark!==previous)transitions++;previous=isDark;}
    if(transitions>=threshold&&dark>width*.07&&dark<width*.82)barcodeLikeLines++;
  }
  return barcodeLikeLines>=2;
}
export function entrySheetRowsFromOCR(ocrData,canvas){
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
    const numberText=cells[0].join(' ').match(/\d{1,4}/)?.[0]||String(results.length+1),memberNo=cells[1].join(' ').trim(),ring=cells[2].join('').replace(/\s+/g,'').trim(),barcode=stickerFromText(cells[4].join(' ')),remarksText=sheetRemarks(cells[3].join(' ')).join('/'),allCellText=cells.flat().join(' ').toLowerCase();
    if(!cells[0].join(' ').match(/\d/)&&((/member|loft/.test(allCellText)&&/ring|pigeon/.test(allCellText))||/sticker|barcode|remarks/.test(allCellText)))continue;
    const top=group.top??Math.min(...words.map(word=>word.bbox.y0)),bottom=group.bottom??Math.max(...words.map(word=>word.bbox.y1));
    results.push({id:`sheet-${Date.now()}-${results.length}-${Math.random().toString(36).slice(2,7)}`,sheetRow:numberText,member_no:memberNo,memberConfidence:cellConfidence(words,columns[1],columns[2]),pigeon_ring:ring,ringConfidence:cellConfidence(words,columns[2],columns[3]),memberRegion:{left:columns[1],right:columns[2],top,bottom},ringRegion:{left:columns[2],right:columns[3],top,bottom},remarks_text:remarksText,remarksConfidence:cellConfidence(words,columns[3],columns[4]),remarksRegion:{left:columns[3],right:columns[4],top,bottom},barcode,printedBarcode:barcode,barcodeDetected:false,barcodeScanError:'',barcodeRegion:{left:columns[4],right:columns[5],top,bottom},errors:[],member:null,saved:false});
  }
  return results;
}
// The writing inside a cell: its border lines left out and the blank paper
// around the writing trimmed, so small handwriting can be enlarged.
export function inkBox(source,region){
  const pad=Math.max(5,Math.round((region.bottom-region.top)*.08)),left=Math.max(0,Math.floor(region.left)+pad),top=Math.max(0,Math.floor(region.top)+pad),right=Math.min(source.width,Math.ceil(region.right)-pad),bottom=Math.min(source.height,Math.ceil(region.bottom)-pad),w=right-left,h=bottom-top;
  if(w<8||h<8)return null;
  const data=source.getContext('2d',{willReadFrequently:true}).getImageData(left,top,w,h).data;let sum=0;for(let i=0;i<data.length;i+=4)sum+=data[i]*.299+data[i+1]*.587+data[i+2]*.114;const cut=sum/(data.length/4)-45;
  let x0=w,y0=h,x1=-1,y1=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(data[i]*.299+data[i+1]*.587+data[i+2]*.114<cut){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}}
  if(x1<0)return {left,top,right,bottom};
  const margin=8;return {left:Math.max(left,left+x0-margin),top:Math.max(top,top+y0-margin),right:Math.min(right,left+x1+margin),bottom:Math.min(bottom,top+y1+margin)};
}
export function handwritingOCRBatch(source,rows,regionKey){
  const width=760,gap=24,crops=[];let height=12;
  rows.forEach((row,index)=>{const region=row[regionKey];if(!region)return;const cell=inkBox(source,region);if(!cell)return;const {left,top}=cell,cropWidth=cell.right-cell.left,cropHeight=cell.bottom-cell.top;if(cropWidth<8||cropHeight<8)return;const scale=Math.min(4,(width-32)/cropWidth,90/Math.max(1,cropHeight)*(cropHeight>cropWidth*.6?1.6:1)),drawWidth=Math.max(1,Math.round(cropWidth*scale)),drawHeight=Math.max(1,Math.round(cropHeight*scale));crops.push({row,index,left,top,cropWidth,cropHeight,drawWidth,drawHeight});height+=drawHeight+gap;});
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d',{willReadFrequently:true});context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);const placements=[];let y=6;
  for(const crop of crops){const x=Math.round((width-crop.drawWidth)/2);context.drawImage(source,crop.left,crop.top,crop.cropWidth,crop.cropHeight,x,y,crop.drawWidth,crop.drawHeight);placements.push({row:crop.row,index:crop.index,top:y,bottom:y+crop.drawHeight,x,w:crop.drawWidth});y+=crop.drawHeight+gap;}
  const pixels=context.getImageData(0,0,canvas.width,canvas.height),data=pixels.data;
  // Per crop: ink is clearly darker than that crop's paper (copes with shadows).
  // Per cell: the paper's brightness (most of the cell), ink clearly darker than that.
  for(const placement of placements){const y0=placement.top,y1=placement.bottom,xa=placement.x,xb=placement.x+placement.w,levels=[];for(let y=y0;y<y1;y+=2)for(let x=xa;x<xb;x+=2){const i=(y*width+x)*4;levels.push(data[i]*.299+data[i+1]*.587+data[i+2]*.114);}levels.sort((a,b)=>a-b);const paper=levels[Math.floor(levels.length*.7)]||255,cut=paper-Math.max(30,paper*.22);
    for(let y=y0;y<y1;y++)for(let x=xa;x<xb;x++){const i=(y*width+x)*4,gray=data[i]*.299+data[i+1]*.587+data[i+2]*.114,value=gray<cut?0:255;data[i]=data[i+1]=data[i+2]=value;}}
  context.putImageData(pixels,0,0);return {canvas,placements};
}
export async function refineHandwrittenEntryFields(worker,source,rows,members,onProgress=()=>{},onlyFields=null){
  if(!worker?.setParameters||!worker?.recognize)return;
  const ALNUM='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_/.';
  const numericMembers=members.length&&members.every(member=>/^\d+$/.test(String(member.member_no).trim()));
  // What each column can contain: member IDs digits only (when the club's are), remarks like P1/P2/P3/OCP.
  const settings={member_no:{tessedit_pageseg_mode:'6',tessedit_char_whitelist:numericMembers?'0123456789':ALNUM},pigeon_ring:{tessedit_pageseg_mode:'6',tessedit_char_whitelist:ALNUM},remarks_text:{tessedit_pageseg_mode:'6',tessedit_char_whitelist:'P0123456789/OC'},barcode:{tessedit_pageseg_mode:'6',tessedit_char_whitelist:'N0123456789-X'}};
  try{await worker.setParameters(settings.member_no);}catch{return;}
  const fields=[['member_no','memberRegion','memberConfidence','Member ID'],['pigeon_ring','ringRegion','ringConfidence','Ring number'],['remarks_text','remarksRegion','remarksConfidence','Remarks'],['barcode','stickerTextRegion','barcodeConfidence','Sticker number']],batchSize=24;
  for(const [field,regionKey,confidenceKey,label] of fields){
    if(onlyFields&&!onlyFields.includes(field))continue;
    try{await worker.setParameters(settings[field]);}catch{/* keep the previous settings */}
    // The sticker's printed number only where its barcode could not be decoded.
    const candidates=rows.filter(row=>row[regionKey]&&!(field==='barcode'&&row.barcodeDetected)),total=candidates.length;if(!total)continue;
    for(let offset=0;offset<total;offset+=batchSize){const batch=candidates.slice(offset,offset+batchSize),prepared=handwritingOCRBatch(source,batch,regionKey),{data}=await worker.recognize(prepared.canvas),words=data.words?.length?data.words:(data.lines||[]).flatMap(line=>line.words||[]);
      for(const placement of prepared.placements){let matches=words.filter(word=>{const center=(word.bbox.y0+word.bbox.y1)/2;return center>=placement.top-5&&center<=placement.bottom+5;}).sort((a,b)=>{const ay=(a.bbox.y0+a.bbox.y1)/2,by=(b.bbox.y0+b.bbox.y1)/2,line=Math.max(8,(a.bbox.y1-a.bbox.y0+b.bbox.y1-b.bbox.y0)/4);return Math.abs(ay-by)>line?ay-by:a.bbox.x0-b.bbox.x0;}),recognized=matches.map(word=>String(word.text||'').trim()).filter(Boolean).join(field==='pigeon_ring'?' ':'').replace(/[^A-Za-z0-9_./ -]/g,'').trim();if(!recognized)continue;const confidence=matches.length?matches.reduce((sum,word)=>sum+(Number(word.confidence)||0),0)/matches.length:Number(data.confidence)||0;
        const row=placement.row,current=String(row[field]||''),currentConfidence=Number(row[confidenceKey])||0;
        if(field==='member_no'){const numbered=recognized.match(/^(\d{1,2})\.(.+)$/);if(numbered&&numbered[1]===String(row.sheetRow))recognized=numbered[2];
          const isRegistered=value=>members.some(member=>String(member.member_no).trim().toUpperCase()===value.trim().toUpperCase()||String(member.id)===value.trim()),currentValid=isRegistered(current),candidateValid=isRegistered(recognized);
          if((candidateValid&&!currentValid)||(!current&&confidence>0)||(!currentValid&&!candidateValid&&confidence>currentConfidence+8)){row[field]=recognized;row[confidenceKey]=confidence;}
        }else if(field==='remarks_text'){const parsed=sheetRemarks(recognized).join('/');if(parsed&&(!current||confidence>currentConfidence+5)){row[field]=parsed;row[confidenceKey]=confidence;}}
        else if(field==='barcode'){const number=stickerFromText(recognized.replace(/-/g,' - ').replace(/\s-\s/g,'-'));if(number&&!row.barcodeDetected){row.barcode=number;row.barcodeScanError='';row[confidenceKey]=confidence;}}
        else if(!current||confidence>currentConfidence+5){row[field]=recognized;row[confidenceKey]=confidence;}
      }
      onProgress(label,Math.min(offset+batchSize,total),total);
    }
  }
}

// ---- Align on guide ------------------------------------------------------------
// The loading form's layout as parts of the table's width and height (No. |
// Loft name | Pigeon I.D. | Remarks | Sticker; a short heading row, then equal
// rows). Measured on the club's printed form.
export const FORM_GUIDE={columns:[0,.05,.392,.606,.8,1],header:.038,rows:15,margin:.03};

// The 4 corners of the table in the photo, as found by detectTableGrid, or a
// frame inside the photo when it was not found. Order: top-left, top-right,
// bottom-right, bottom-left.
export function tableCorners(canvas){
  try{
    const grid=detectTableGrid(canvas);
    if(grid?.bands?.length>=3){
      // The first band is the heading row (LOFT NAME, PIGEON I.D, ...): the table's top.
      const first=grid.bands[0],last=grid.bands[grid.bands.length-1];
      return [[first.columns[0],first.top],[first.columns[5],first.top],[last.columns[5],last.bottom],[last.columns[0],last.bottom]];
    }
  }catch{/* fall back to a frame */}
  const w=canvas.width,h=canvas.height;return [[w*.1,h*.15],[w*.9,h*.15],[w*.9,h*.92],[w*.1,h*.92]];
}

// Maps the unit square onto a quadrilateral (projective transform).
function squareToQuad(q){
  const [[x0,y0],[x1,y1],[x2,y2],[x3,y3]]=q,dx1=x1-x2,dx2=x3-x2,dy1=y1-y2,dy2=y3-y2,sx=x0-x1+x2-x3,sy=y0-y1+y2-y3;
  let g=0,h=0;
  if(Math.abs(sx)>1e-9||Math.abs(sy)>1e-9){const det=dx1*dy2-dx2*dy1;g=(sx*dy2-dx2*sy)/det;h=(dx1*sy-sx*dy1)/det;}
  return {a:x1-x0+g*x1,b:x3-x0+h*x3,c:x0,d:y1-y0+g*y1,e:y3-y0+h*y3,f:y0,g,h};
}
export function quadPoint(q,u,v){const m=squareToQuad(q),den=m.g*u+m.h*v+1;return [(m.a*u+m.b*v+m.c)/den,(m.d*u+m.e*v+m.f)/den];}

// The table cut out of the photo and straightened to a rectangle, with a thin
// margin of the photo around it (so its border lines are kept).
export function straightenTable(canvas,corners,width=1400,margin=FORM_GUIDE.margin){
  const top=Math.hypot(corners[1][0]-corners[0][0],corners[1][1]-corners[0][1]),bottom=Math.hypot(corners[2][0]-corners[3][0],corners[2][1]-corners[3][1]);
  const leftSide=Math.hypot(corners[3][0]-corners[0][0],corners[3][1]-corners[0][1]),rightSide=Math.hypot(corners[2][0]-corners[1][0],corners[2][1]-corners[1][1]);
  const W=Math.round(width),H=Math.max(1,Math.round(W*((leftSide+rightSide)/2)/Math.max(1,(top+bottom)/2))),span=1+2*margin;
  const source=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height),src=source.data,sw=canvas.width,sh=canvas.height;
  const out=document.createElement('canvas');out.width=W;out.height=H;const context=out.getContext('2d',{willReadFrequently:true}),image=context.createImageData(W,H),dst=image.data;
  const m=squareToQuad(corners);
  for(let y=0;y<H;y++){const v=(y+.5)/H*span-margin;for(let x=0;x<W;x++){const u=(x+.5)/W*span-margin,den=m.g*u+m.h*v+1,sx=(m.a*u+m.b*v+m.c)/den,sy=(m.d*u+m.e*v+m.f)/den,o=(y*W+x)*4;
    if(sx<0||sy<0||sx>=sw-1||sy>=sh-1){dst[o]=dst[o+1]=dst[o+2]=255;dst[o+3]=255;continue;}
    const x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0,i=(y0*sw+x0)*4,j=i+sw*4;
    for(let k=0;k<3;k++)dst[o+k]=(src[i+k]*(1-fx)+src[i+4+k]*fx)*(1-fy)+(src[j+k]*(1-fx)+src[j+4+k]*fx)*fy;dst[o+3]=255;}}
  context.putImageData(image,0,0);return out;
}

// Rows from the guide alone, for a straightened table whose lines were not found.
export function entrySheetRowsFromGuide(canvas,guide=FORM_GUIDE){
  // The table inside the margin left by straightenTable.
  const m=guide.margin||0,span=1+2*m,left=canvas.width*m/span,tableW=canvas.width/span,tableTop=canvas.height*m/span,tableH=canvas.height/span;
  const top=tableTop+tableH*guide.header,rowHeight=(tableH*(1-guide.header))/guide.rows,x=guide.columns.map(part=>left+part*tableW),results=[];
  for(let index=0;index<guide.rows;index++){
    const rowTop=top+index*rowHeight,rowBottom=rowTop+rowHeight,region=j=>({left:x[j],right:x[j+1],top:rowTop,bottom:rowBottom});
    results.push({id:`sheet-${Date.now()}-${index}-${Math.random().toString(36).slice(2,7)}`,sheetRow:String(index+1),member_no:'',memberConfidence:0,pigeon_ring:'',ringConfidence:0,remarks_text:'',remarksConfidence:0,memberRegion:region(1),ringRegion:region(2),remarksRegion:region(3),stickerTextRegion:{...region(4),top:rowTop+rowHeight*.62},barcode:'',printedBarcode:'',barcodeDetected:false,barcodeScanError:'',barcodeRegion:region(4),errors:[],member:null,saved:false});
  }
  return results;
}

// ---- AvilonX loading form (printed by loading-form.js) -----------------------
// Finds the 4 black corner squares; the biggest is the top-left one, so the
// page's way up is known whatever way the photo or scan was taken. Returns the
// squares' centres in page order (top-left, top-right, bottom-right,
// bottom-left), or null when this is not an AvilonX form.
export function findFormMarks(canvas){
  const scale=Math.min(1,1000/Math.max(canvas.width,canvas.height)),W=Math.max(1,Math.round(canvas.width*scale)),H=Math.max(1,Math.round(canvas.height*scale));
  const small=document.createElement('canvas');small.width=W;small.height=H;const context=small.getContext('2d',{willReadFrequently:true});context.drawImage(canvas,0,0,W,H);
  const rgba=context.getImageData(0,0,W,H).data,dark=new Uint8Array(W*H);
  const levels=[];for(let i=0;i<W*H;i+=7)levels.push(rgba[i*4]*.299+rgba[i*4+1]*.587+rgba[i*4+2]*.114);levels.sort((a,b)=>a-b);
  const paper=levels[Math.floor(levels.length*.75)]||255,cut=Math.min(110,paper*.45);
  for(let i=0;i<W*H;i++)dark[i]=(rgba[i*4]*.299+rgba[i*4+1]*.587+rgba[i*4+2]*.114)<cut?1:0;
  // Solid dark blobs that are about square.
  const label=new Int32Array(W*H),candidates=[],stack=[];let next=0;
  for(let start=0;start<W*H;start++){
    if(!dark[start]||label[start])continue;
    next++;label[start]=next;stack.push(start);let count=0,x0=W,x1=0,y0=H,y1=0,sx=0,sy=0,edge=false;
    while(stack.length){const p=stack.pop(),x=p%W,y=(p-x)/W;count++;sx+=x;sy+=y;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;if(x===0||y===0||x===W-1||y===H-1)edge=true;
      for(const q of [p-1,p+1,p-W,p+W]){if(q<0||q>=W*H||label[q]||!dark[q])continue;if((q===p-1&&x===0)||(q===p+1&&x===W-1))continue;label[q]=next;stack.push(q);}}
    const w=x1-x0+1,h=y1-y0+1;
    if(edge||w<6||h<6||w>Math.min(W,H)*.12||h>Math.min(W,H)*.12)continue;
    if(w/h<.6||w/h>1.65||count/(w*h)<.78)continue;
    candidates.push({x:sx/count/scale,y:sy/count/scale,area:count/(scale*scale)});
  }
  if(candidates.length<4)return null;
  // The square nearest each corner of the picture.
  const corners=[[0,0],[canvas.width,0],[canvas.width,canvas.height],[0,canvas.height]].map(([cx,cy])=>candidates.reduce((best,c)=>{const d=Math.hypot(c.x-cx,c.y-cy);return !best||d<best.d?{...c,d}:best;},null));
  if(new Set(corners).size<4||corners.some((c,i)=>corners.findIndex(o=>o.x===c.x&&o.y===c.y)!==i))return null;
  // The top-left square is bigger. A photo taken at an angle makes the near
  // corners look bigger, so each square is measured against the page around
  // it (the two sides of the page that meet at that corner).
  const side=(a,b)=>Math.hypot(corners[a].x-corners[b].x,corners[a].y-corners[b].y);
  const relative=corners.map((c,i)=>c.area/(side(i,(i+1)%4)*side(i,(i+3)%4)));
  const order=[0,1,2,3].sort((a,b)=>relative[b]-relative[a]),big=order[0];
  // When the bigger square is unclear (a blurry photo), the corners are still
  // returned, marked unsure: orientForm then tries the four ways up.
  const sure=relative[big]>=relative[order[1]]*1.3;
  const span=Math.hypot(corners[0].x-corners[2].x,corners[0].y-corners[2].y);
  if(span<Math.hypot(canvas.width,canvas.height)*.35)return null;
  const marks=[0,1,2,3].map(k=>{const c=corners[(big+k)%4];return [c.x,c.y];});
  marks.sure=sure;
  return marks;
}

// The form straightened the right way up: {corners, page, code}. With unsure
// corners, each of the four ways is tried: the one whose form code reads wins,
// else the one where the printed boxes line up best with the layout.
export function orientForm(canvas,marks,{layout,boxesOf,codeCells,decode}){
  const straight=corners=>({corners,page:straightenForm(canvas,corners)});
  if(marks.sure!==false){const one=straight(marks);return {...one,code:codeCells?readFormCode(one.page,codeCells,decode):null};}
  let best=null;
  for(let k=0;k<4;k++){
    const corners=[0,1,2,3].map(i=>marks[(i+k)%4]),one=straight(corners);
    if(one.page.width>one.page.height)continue;// the form is always upright (portrait)
    const code=codeCells?readFormCode(one.page,codeCells,decode):null;
    if(code)return {...one,code};
    const score=layout?boxOutlineScore(one.page,layout,boxesOf):0;
    if(!best||score>best.score)best={...one,code:null,score};
  }
  return best;
}
// Share of the layout's box outlines that fall on printed lines (a pixel of slack).
function boxOutlineScore(page,layout,boxesOf){
  const W=page.width,H=page.height,data=page.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
  const levels=[];for(let i=0;i<data.length;i+=4*101)levels.push(data[i]*.299+data[i+1]*.587+data[i+2]*.114);levels.sort((a,b)=>a-b);
  const cut=(levels[Math.floor(levels.length*.85)]||255)*.82,dark=(x,y)=>{x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=W||y>=H)return 0;const i=(y*W+x)*4;return data[i]*.299+data[i+1]*.587+data[i+2]*.114<cut?1:0;};
  // Outlines dark and box centres light (blur and the table lines make dark
  // pixels common, so the centres keep the score honest).
  let hits=0,all=0,inside=0,centres=0;
  for(let r=0;r<layout.rows;r++){const b=boxesOf(r);for(const box of [...b.member,...b.prefix,...b.number]){const x0=box.x0*W,x1=box.x1*W,y0=box.y0*H,y1=box.y1*H;
    for(let k=0;k<=8;k++){const fx=x0+(x1-x0)*k/8,fy=y0+(y1-y0)*k/8;for(const [x,y] of [[fx,y0],[fx,y1],[x0,fy],[x1,fy]]){all++;let on=0;for(let dy=-1;dy<=1&&!on;dy++)for(let dx=-1;dx<=1&&!on;dx++)on=dark(x+dx,y+dy);hits+=on;}}
    for(let k=1;k<=3;k++)for(let j=1;j<=3;j++){centres++;inside+=dark(x0+(x1-x0)*(.25+k*.125),y0+(y1-y0)*(.25+j*.125));}}}
  return (all?hits/all:0)-(centres?inside/centres:0);
}

// Straightens an AvilonX form and lists its rows, with every box as a region
// (pixels) and the remarks that are ticked. pageLayout = formLayout(...) and
// boxesOf = index => rowBoxes(index, pageLayout) (from loading-form.js).
export const straightenForm=(canvas,marks)=>straightenTable(canvas,marks,1400,0);

// How sharp the straightened form is: the strength of its edges (box lines,
// writing) against its contrast. Blurry or far-away photos score low.
export function formSharpness(page){
  const W=page.width,H=page.height,x0=Math.round(W*.05),x1=Math.round(W*.6),y0=Math.round(H*.15),y1=Math.round(H*.6);
  const d=page.getContext('2d',{willReadFrequently:true}).getImageData(x0,y0,x1-x0,y1-y0).data,w=x1-x0,h=y1-y0,g=i=>d[i*4]*.299+d[i*4+1]*.587+d[i*4+2]*.114;
  const edges=[];let lo=255,hi=0;
  for(let y=1;y<h-1;y+=2)for(let x=1;x<w-1;x+=2){const i=y*w+x,v=g(i);if(v<lo)lo=v;if(v>hi)hi=v;edges.push(Math.abs(4*v-g(i-1)-g(i+1)-g(i-w)-g(i+w)));}
  edges.sort((a,b)=>b-a);
  const strong=edges.slice(0,Math.max(1,Math.floor(edges.length*.01)));
  return strong.reduce((a,b)=>a+b,0)/strong.length/Math.max(1,hi-lo);
}

// The form code at the bottom right (see FORM_CODE in loading-form.js): its
// squares as 0/1 on the straightened page, tried at small shifts. Returns what
// readFormCodeBits makes of them, or null (forms printed before the code).
export function readFormCode(page,cells,decode){
  const W=page.width,H=page.height,context=page.getContext('2d',{willReadFrequently:true});
  const xs=cells.map(c=>c.x0),ys=cells.map(c=>c.y0);
  const left=Math.max(0,Math.floor((Math.min(...xs)-.01)*W)),top=Math.max(0,Math.floor((Math.min(...ys)-.01)*H)),right=Math.min(W,Math.ceil((Math.max(...cells.map(c=>c.x1))+.01)*W)),bottom=Math.min(H,Math.ceil((Math.max(...cells.map(c=>c.y1))+.01)*H));
  if(right-left<10||bottom-top<4)return null;
  const data=context.getImageData(left,top,right-left,bottom-top).data,w=right-left,gray=(x,y)=>{const i=((y-top)*w+(x-left))*4;return data[i]*.299+data[i+1]*.587+data[i+2]*.114;};
  const levels=[];for(let i=0;i<data.length;i+=12)levels.push(data[i]*.299+data[i+1]*.587+data[i+2]*.114);levels.sort((a,b)=>a-b);
  const paper=levels[Math.floor(levels.length*.9)]||255;
  const cellW=(cells[0].x1-cells[0].x0)*W,cellH=(cells[0].y1-cells[0].y0)*H;
  for(const dy of [0,-.3,.3,-.6,.6])for(const dx of [0,-.3,.3]){
    const bits=cells.map(cell=>{
      const x0=Math.round(cell.x0*W+dx*cellW+cellW*.25),x1=Math.round(cell.x1*W+dx*cellW-cellW*.25),y0=Math.round(cell.y0*H+dy*cellH+cellH*.25),y1=Math.round(cell.y1*H+dy*cellH-cellH*.25);
      let sum=0,n=0;for(let y=Math.max(top,y0);y<=Math.min(bottom-1,y1);y++)for(let x=Math.max(left,x0);x<=Math.min(right-1,x1);x++){sum+=gray(x,y);n++;}
      return n&&sum/n<paper*.6?1:0;
    });
    const found=decode(bits);if(found)return found;
  }
  return null;
}

export function readFormLayout(canvas,marks,pageLayout,boxesOf,straightened=null){
  const page=straightened||straightenForm(canvas,marks),W=page.width,H=page.height;
  const px=b=>({left:b.x0*W,right:b.x1*W,top:b.y0*H,bottom:b.y1*H});
  const inner=(r,inset)=>{const dx=(r.right-r.left)*inset,dy=(r.bottom-r.top)*inset;return {left:r.left+dx,right:r.right-dx,top:r.top+dy,bottom:r.bottom-dy};};
  const context=page.getContext('2d',{willReadFrequently:true}),data=context.getImageData(0,0,W,H).data;
  // Ink map judged against the paper around each spot (shadows on a photo
  // make one part of the page darker than another).
  const gray=new Float32Array(W*H);for(let i=0;i<W*H;i++)gray[i]=data[i*4]*.299+data[i*4+1]*.587+data[i*4+2]*.114;
  const tile=48,tw=Math.ceil(W/tile),th=Math.ceil(H/tile),paperAt=new Float32Array(tw*th);
  for(let ty=0;ty<th;ty++)for(let tx=0;tx<tw;tx++){const v=[];for(let y=ty*tile;y<Math.min(H,(ty+1)*tile);y+=3)for(let x=tx*tile;x<Math.min(W,(tx+1)*tile);x+=3)v.push(gray[y*W+x]);v.sort((a,b)=>a-b);paperAt[ty*tw+tx]=v[Math.floor(v.length*.85)]||255;}
  const ink=new Uint8Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const tx=Math.min(tw-1,Math.floor(x/tile)),ty=Math.min(th-1,Math.floor(y/tile)),bg=paperAt[ty*tw+tx];ink[y*W+x]=gray[y*W+x]<bg*.7&&gray[y*W+x]<bg-35?1:0;}
  const inkAt=(x,y)=>{x=Math.round(x);y=Math.round(y);return x>=0&&y>=0&&x<W&&y<H?ink[y*W+x]:0;};
  // Printed outlines are thin and grey: a lighter test, made a pixel thicker so the search can't step over them.
  const line=new Uint8Array(W*H),thick=new Uint8Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const bg=paperAt[Math.min(th-1,Math.floor(y/tile))*tw+Math.min(tw-1,Math.floor(x/tile))];line[y*W+x]=gray[y*W+x]<bg*.86?1:0;}
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;thick[i]=line[i]|line[i-1]|line[i+1]|line[i-W]|line[i+W];}
  const lineAt=(map,x,y)=>{x=Math.round(x);y=Math.round(y);return x>=0&&y>=0&&x<W&&y<H?map[y*W+x]:0;};
  // A bent page or a photo at an angle leaves the boxes a little off from
  // where the corners put them, so each group of boxes in a row is moved to
  // where its printed outlines really are.
  const outline=boxes=>{const points=[];boxes.forEach(r=>{const w=r.right-r.left,h=r.bottom-r.top,n=Math.max(6,Math.round(Math.max(w,h)/3));for(let k=0;k<=n;k++){const fx=r.left+w*k/n,fy=r.top+h*k/n;points.push([fx,r.top],[fx,r.bottom],[r.left,fy],[r.right,fy]);}});return points;};
  const snap=boxes=>{
    if(!boxes.length)return boxes;
    const points=outline(boxes),reach=Math.round(Math.min(40,Math.max(...boxes.map(r=>r.bottom-r.top))*.75));
    const score=(map,dx,dy)=>{let n=0;for(const [x,y] of points)n+=lineAt(map,x+dx,y+dy);return n;};
    let best={dx:0,dy:0,n:score(thick,0,0)};
    for(let dy=-reach;dy<=reach;dy+=2)for(let dx=-reach;dx<=reach;dx+=2){const n=score(thick,dx,dy);if(n>best.n)best={dx,dy,n};}
    const coarse=best;best={...coarse,n:-1};
    for(let dy=coarse.dy-2;dy<=coarse.dy+2;dy++)for(let dx=coarse.dx-2;dx<=coarse.dx+2;dx++){const n=score(line,dx,dy);if(n>best.n)best={dx,dy,n};}
    if(best.n<points.length*.25)return boxes;// outlines not found: keep the boxes where they were
    // Then each box on its own, a few pixels at most (the print and the photo never line up perfectly).
    return boxes.map(r=>{
      const moved={...r,left:r.left+best.dx,right:r.right+best.dx,top:r.top+best.dy,bottom:r.bottom+best.dy},own=outline([moved]);
      const fit=(dx,dy)=>{let n=0;for(const [x,y] of own)n+=lineAt(line,x+dx,y+dy);return n;};
      let mine={dx:0,dy:0,n:fit(0,0)};
      for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const n=fit(dx,dy);if(n>mine.n)mine={dx,dy,n};}
      return {...moved,left:moved.left+mine.dx,right:moved.right+mine.dx,top:moved.top+mine.dy,bottom:moved.bottom+mine.dy};
    });
  };
  // Share of ink inside a box. Straight lines near its edges are its printed
  // border (when the box sits a little off), not writing, and are left out.
  const inkShare=r=>{
    const g=inner(r,.14),x0=Math.floor(g.left),y0=Math.floor(g.top),w=Math.max(1,Math.floor(g.right-g.left)),h=Math.max(1,Math.floor(g.bottom-g.top));
    const cell=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)cell[y*w+x]=inkAt(x0+x,y0+y);
    // A border runs the box's whole height (or width); handwriting does not.
    const edgeW=Math.ceil(w*.25),edgeH=Math.ceil(h*.25),fullTop=Math.floor(r.top),fullH=Math.max(1,Math.floor(r.bottom-r.top)),fullLeft=Math.floor(r.left),fullW=Math.max(1,Math.floor(r.right-r.left));
    // (A pixel either side is allowed: on a bent page the lines slant a little.)
    const lineCols=[],lineRows=[];
    for(let x=0;x<w;x++){if(x>=edgeW&&x<w-edgeW)continue;let n=0;for(let y=0;y<fullH;y++)n+=inkAt(x0+x-1,fullTop+y)|inkAt(x0+x,fullTop+y)|inkAt(x0+x+1,fullTop+y);if(n>fullH*.88)lineCols.push(x);}
    for(let y=0;y<h;y++){if(y>=edgeH&&y<h-edgeH)continue;let n=0;for(let x=0;x<fullW;x++)n+=inkAt(fullLeft+x,y0+y-1)|inkAt(fullLeft+x,y0+y)|inkAt(fullLeft+x,y0+y+1);if(n>fullW*.88)lineRows.push(y);}
    for(const x of lineCols)for(const dx of [-1,0,1])if(x+dx>=0&&x+dx<w)for(let y=0;y<h;y++)cell[y*w+x+dx]=0;
    for(const y of lineRows)for(const dy of [-1,0,1])if(y+dy>=0&&y+dy<h)for(let x=0;x<w;x++)cell[(y+dy)*w+x]=0;
    let dark=0;for(let i=0;i<cell.length;i++)dark+=cell[i];
    // The biggest connected stroke: writing is one stroke covering much of the box; specks are not.
    const seen=new Uint8Array(cell.length),stack=[];let tallest=0;
    for(let start=0;start<cell.length;start++){if(!cell[start]||seen[start])continue;seen[start]=1;stack.push(start);let top=h,bottom=-1,left=w,right=-1;
      while(stack.length){const p=stack.pop(),x=p%w,y=(p-x)/w;if(y<top)top=y;if(y>bottom)bottom=y;if(x<left)left=x;if(x>right)right=x;
        for(const q of [p-1,p+1,p-w,p+w]){if(q<0||q>=cell.length||seen[q]||!cell[q])continue;if((q===p-1&&x===0)||(q===p+1&&x===w-1))continue;seen[q]=1;stack.push(q);}}
      tallest=Math.max(tallest,Math.max((bottom-top+1)/h,(right-left+1)/w));}
    return {share:dark/cell.length,stroke:tallest};
  };
  // A box has writing with enough ink, or a long thin stroke (a 1).
  const isWritten=ink=>ink.share>.03||(ink.share>.012&&ink.stroke>.45);
  const rows=[];
  for(let index=0;index<pageLayout.rows;index++){
    const b=boxesOf(index),member=snap(b.member.map(px)),ring=snap([...b.prefix,...b.number].map(px)),prefix=ring.slice(0,b.prefix.length),number=ring.slice(b.prefix.length);
    const remarkBoxes=snap(b.remarks.map(px));
    // A row is filled when several boxes have writing, or one has plenty of
    // ink: a lone faint mark is a smudge or a bit of a printed line.
    const inks=new Map([...member,...prefix,...number].map(box=>[box,inkShare(box)]));
    const writtenBoxes=[...inks.values()].filter(isWritten);
    const filled=writtenBoxes.length>=2||writtenBoxes.some(ink=>ink.share>.06);
    const used=box=>filled&&isWritten(inks.get(box));
    const ticked=b.remarks.filter((box,i)=>inkShare(remarkBoxes[i]).share>.08).map(box=>box.label);
    const sticker=px(b.cells.sticker);
    const hasSticker=barcodeGraphicPresent(page,sticker.left,sticker.right,sticker.top,sticker.bottom);
    const memberUsed=member.filter(used),ringUsed=[...prefix,...number].filter(used);
    if(!memberUsed.length&&!ringUsed.length&&!hasSticker)continue;// empty row
    rows.push({id:`sheet-${Date.now()}-${index}-${Math.random().toString(36).slice(2,7)}`,sheetRow:String(index+1),form:true,
      memberBoxes:member.filter(used),prefixBoxes:prefix.filter(used),numberBoxes:number.filter(used),
      member_no:'',memberConfidence:0,pigeon_ring:'',ringConfidence:0,remarks_text:ticked.join('/'),remarksConfidence:100,
      memberRegion:px(b.cells.member),ringRegion:px(b.cells.ring),remarksRegion:px(b.cells.remarks),barcodeRegion:sticker,
      stickerTextRegion:{...sticker,top:sticker.top+(sticker.bottom-sticker.top)*.62},
      barcode:'',printedBarcode:'',barcodeDetected:false,barcodeScanError:'',errors:[],member:null,saved:false});
  }
  // The handwriting on clean paper: ink black, everything else white.
  const inkPage=document.createElement('canvas');inkPage.width=W;inkPage.height=H;
  const inkContext=inkPage.getContext('2d'),inkImage=inkContext.createImageData(W,H);
  for(let i=0;i<W*H;i++){const v=ink[i]?0:255;inkImage.data[i*4]=inkImage.data[i*4+1]=inkImage.data[i*4+2]=v;inkImage.data[i*4+3]=255;}
  inkContext.putImageData(inkImage,0,0);
  return {page,inkPage,rows};
}

// Reads the handwritten boxes of AvilonX form rows: each field's boxes are put
// side by side as one word, the words of all rows stacked, and read at once
// with only the characters that field can hold.
export async function readFormHandwriting(worker,page,rows,onProgress=()=>{},inkPage=page){
  // Digits: the handwritten digit reader, box by box, on the photo itself.
  for(const [field,key,label,confidence] of [['member_no','memberBoxes','Member ID','memberConfidence'],['ring_number','numberBoxes','Ring numbers','ringConfidence']]){
    rows.forEach(row=>{
      const read=(row[key]||[]).map(box=>readDigitBox(page,box)).filter(Boolean);
      row[field]=read.map(r=>r.digit).join('');
      row[`${field}_digits`]=read;// each box: {digit, confidence, chances} (for matching and the review)
      row[confidence]=read.length?Math.round(Math.min(...read.map(r=>r.confidence))*100):0;
    });
    onProgress(label);
  }
  // Letters: Tesseract, on clean paper (ink only).
  if(worker?.recognize)for(const [field,key,allowed,label] of [['ring_prefix','prefixBoxes','ABCDEFGHIJKLMNOPQRSTUVWXYZ','Ring letters']]){
    const items=rows.filter(row=>row[key]?.length);if(!items.length)continue;
    try{await worker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:allowed});}catch{/* keep the previous settings */}
    // Each box trimmed to its handwriting and set like normal text (Tesseract
    // reads digits far apart badly).
    const source=inkPage.getContext('2d',{willReadFrequently:true});
    const glyph=box=>{
      const dx=(box.right-box.left)*.17,dy=(box.bottom-box.top)*.14,x0=Math.floor(box.left+dx),y0=Math.floor(box.top+dy),w=Math.max(1,Math.floor(box.right-box.left-2*dx)),h=Math.max(1,Math.floor(box.bottom-box.top-2*dy));
      const d=source.getImageData(x0,y0,w,h).data,levels=[];for(let i=0;i<d.length;i+=8)levels.push(d[i]*.299+d[i+1]*.587+d[i+2]*.114);levels.sort((a,b)=>a-b);
      const paper=levels[Math.floor(levels.length*.7)]||255,cut=paper-Math.max(30,paper*.22);let left=w,right=-1,top=h,bottom=-1;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(d[i]*.299+d[i+1]*.587+d[i+2]*.114<cut){if(x<left)left=x;if(x>right)right=x;if(y<top)top=y;if(y>bottom)bottom=y;}}
      if(right<0)return null;
      return {sx:x0+left-1,sy:y0+top-1,sw:right-left+3,sh:bottom-top+3};
    };
    const charH=56,gap=12,lineGap=40,strips=items.map(row=>{const glyphs=row[key].map(glyph).filter(Boolean);return {row,glyphs,width:glyphs.reduce((sum,g)=>sum+Math.max(charH*.3,g.sw*charH/g.sh)+gap,0)+3*gap};});
    const width=Math.max(...strips.map(s=>s.width)),canvas=document.createElement('canvas');canvas.width=Math.ceil(width);canvas.height=items.length*(charH+lineGap)+lineGap;
    const c=canvas.getContext('2d',{willReadFrequently:true});c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);
    strips.forEach((strip,i)=>{const y=lineGap+i*(charH+lineGap);strip.top=y;strip.bottom=y+charH;let x=2*gap;
      strip.glyphs.forEach(g=>{const dw=g.sw*charH/g.sh,slot=Math.max(charH*.3,dw);c.drawImage(inkPage,g.sx,g.sy,g.sw,g.sh,x+(slot-dw)/2,y,dw,charH);x+=slot+gap;});});
    // Ink black, paper white (per strip).
    const image=c.getImageData(0,0,canvas.width,canvas.height),d=image.data;
    strips.forEach(strip=>{const levels=[];for(let y=strip.top;y<strip.bottom;y+=2)for(let x=0;x<strip.width;x+=2){const i=(y*canvas.width+x)*4;levels.push(d[i]*.299+d[i+1]*.587+d[i+2]*.114);}levels.sort((a,b)=>a-b);const paper=levels[Math.floor(levels.length*.7)]||255,cut=paper-Math.max(30,paper*.22);
      for(let y=strip.top;y<strip.bottom;y++)for(let x=0;x<canvas.width;x++){const i=(y*canvas.width+x)*4,v=(d[i]*.299+d[i+1]*.587+d[i+2]*.114)<cut?0:255;d[i]=d[i+1]=d[i+2]=v;}});
    c.putImageData(image,0,0);
    const {data}=await worker.recognize(canvas),words=data.words?.length?data.words:(data.lines||[]).flatMap(line=>line.words||[]);
    strips.forEach(strip=>{const text=words.filter(word=>{const cy=(word.bbox.y0+word.bbox.y1)/2;return cy>=strip.top-12&&cy<=strip.bottom+12;}).sort((a,b)=>a.bbox.x0-b.bbox.x0).map(word=>String(word.text||'')).join('').replace(new RegExp(`[^${allowed}]`,'g'),'');strip.row[field]=text;});
    onProgress(label);
  }
  rows.forEach(row=>{row.member_no=row.member_no||'';row.pigeon_ring=[row.ring_prefix,row.ring_number].filter(Boolean).join(' ');});
}
