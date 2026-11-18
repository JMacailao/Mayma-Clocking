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
export async function refineHandwrittenEntryFields(worker,source,rows,members,onProgress=()=>{}){
  if(!worker?.setParameters||!worker?.recognize)return;
  const ALNUM='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_/.';
  const numericMembers=members.length&&members.every(member=>/^\d+$/.test(String(member.member_no).trim()));
  // What each column can contain: member IDs digits only (when the club's are), remarks like P1/P2/P3/OCP.
  const settings={member_no:{tessedit_pageseg_mode:'6',tessedit_char_whitelist:numericMembers?'0123456789':ALNUM},pigeon_ring:{tessedit_pageseg_mode:'6',tessedit_char_whitelist:ALNUM},remarks_text:{tessedit_pageseg_mode:'6',tessedit_char_whitelist:'P0123456789/OC'},barcode:{tessedit_pageseg_mode:'6',tessedit_char_whitelist:'N0123456789-X'}};
  try{await worker.setParameters(settings.member_no);}catch{return;}
  const fields=[['member_no','memberRegion','memberConfidence','Member ID'],['pigeon_ring','ringRegion','ringConfidence','Ring number'],['remarks_text','remarksRegion','remarksConfidence','Remarks'],['barcode','stickerTextRegion','barcodeConfidence','Sticker number']],batchSize=24;
  for(const [field,regionKey,confidenceKey,label] of fields){
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
