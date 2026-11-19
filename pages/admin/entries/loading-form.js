// AvilonX loading form: the club's loading form (No. · Loft name · Pigeon I.D ·
// Remarks · Sticker, 15 rows), printed by AvilonX so a scan or a photo can be
// read reliably: four black corner squares (the top-left one bigger, so the
// page's way up is known), boxes for the handwritten member ID and ring, tick
// boxes for the remarks and the sticker space.
//
// Every position is a fraction of the frame between the centres of the corner
// squares, so printing and reading use the same numbers (FORM_LAYOUT).
import { escapeHTML } from '../../../assets/js/shared.js';

export const FORM_LAYOUT={
  rows:15,
  // The table keeps clear of the corner squares (so they stay separate squares).
  table:{top:.13,header:.028,bottom:.97,left:.03,right:.97},
  columns:[.03,.08,.3,.6,.78,.97],       // No. | Loft name | Pigeon I.D | Remarks | Sticker
  // Boxes inside a row (x: fraction of the frame's width; y: fraction of the row's height).
  member:{count:5,x:.09,width:.036,gap:.004,top:.22,bottom:.82},
  prefix:{count:6,x:.315,width:.036,gap:.0035,top:.07,bottom:.45},
  number:{count:8,x:.315,width:.03,gap:.0035,top:.55,bottom:.93},
  remarks:{x:[.613,.697],y:[[.14,.44],[.56,.86]],width:.02,count:4},
  sticker:[.785,.965],
  marks:{big:9,small:6}                  // corner squares, millimetres
};

export const PAPERS={
  long:{label:'Long bond paper (8.5 × 13 in)',width:215.9,height:330.2},
  a4:{label:'A4',width:210,height:297},
  letter:{label:'Letter (8.5 × 11 in)',width:215.9,height:279.4}
};
const MARGIN=11;// millimetres from the paper edge to the corner squares' centres

const rowHeight=()=>(FORM_LAYOUT.table.bottom-FORM_LAYOUT.table.top-FORM_LAYOUT.table.header)/FORM_LAYOUT.rows;
const rowTop=index=>FORM_LAYOUT.table.top+FORM_LAYOUT.table.header+index*rowHeight();
const boxX=(field,k)=>field.x+k*(field.width+field.gap);

// Every box of one row, as fractions of the frame: {x0,x1,y0,y1}.
export function rowBoxes(index){
  const L=FORM_LAYOUT,top=rowTop(index),h=rowHeight(),y=(a,b)=>({y0:top+a*h,y1:top+b*h});
  const boxes=field=>Array.from({length:field.count},(_,k)=>({x0:boxX(field,k),x1:boxX(field,k)+field.width,...y(field.top,field.bottom)}));
  const remarks=[];L.remarks.y.forEach(([a,b])=>L.remarks.x.forEach(x=>remarks.push({x0:x,x1:x+L.remarks.width,...y(a,b)})));
  return {member:boxes(L.member),prefix:boxes(L.prefix),number:boxes(L.number),remarks:remarks.slice(0,L.remarks.count),
    cells:{member:{x0:L.columns[1],x1:L.columns[2],...y(0,1)},ring:{x0:L.columns[2],x1:L.columns[3],...y(0,1)},remarks:{x0:L.columns[3],x1:L.columns[4],...y(0,1)},sticker:{x0:L.sticker[0],x1:L.sticker[1],...y(.04,.96)}}};
}

// The printable page (HTML). remarks: up to 4 labels, e.g. ['P1','P2','P3','OCP'].
export function loadingFormHtml({clubName='',race=null,remarks=[],paper='long',copies=1}={}){
  const P=PAPERS[paper]||PAPERS.long,FW=P.width-2*MARGIN,FH=P.height-2*MARGIN,L=FORM_LAYOUT;
  const at=(fx,fy)=>`left:${(MARGIN+fx*FW).toFixed(2)}mm;top:${(MARGIN+fy*FH).toFixed(2)}mm`;
  const size=(fw,fh)=>`width:${(fw*FW).toFixed(2)}mm;height:${(fh*FH).toFixed(2)}mm`;
  const box=(b,cls='box')=>`<div class="${cls}" style="${at(b.x0,b.y0)};${size(b.x1-b.x0,b.y1-b.y0)}"></div>`;
  const labels=[...remarks,'P1','P2','P3','OCP'].filter((v,i,a)=>v&&a.indexOf(v)===i).slice(0,L.remarks.count);
  const releaseDate=race?.release_at_utc?new Date(`${String(race.release_at_utc).replace(' ','T')}Z`).toLocaleDateString('en-PH',{timeZone:'Asia/Manila',year:'numeric',month:'short',day:'numeric'}):'';
  const mark=(fx,fy,mm)=>`<div class="mark" style="left:${(MARGIN+fx*FW-mm/2).toFixed(2)}mm;top:${(MARGIN+fy*FH-mm/2).toFixed(2)}mm;width:${mm}mm;height:${mm}mm"></div>`;
  const page=()=>{
    let html=mark(0,0,L.marks.big)+mark(1,0,L.marks.small)+mark(1,1,L.marks.small)+mark(0,1,L.marks.small);
    html+=`<div class="title" style="${at(.08,.004)};width:${(.84*FW).toFixed(2)}mm">${escapeHTML(clubName||'Pigeon racing club')}</div>`;
    html+=`<div class="subtitle" style="${at(.08,.036)};width:${(.84*FW).toFixed(2)}mm">LOADING FORM</div>`;
    const field=(label,value,fx,fy,fw)=>`<div class="field" style="${at(fx,fy)};width:${(fw*FW).toFixed(2)}mm"><span>${label}:</span><b>${escapeHTML(value||'')}</b></div>`;
    html+=field('LAP',race?.name,.04,.068,.44)+field('DATE',releaseDate,.53,.068,.43)+field('RACE POINT',race?.release_location,.04,.098,.44)+field('RACE CATEGORY','',.53,.098,.43);
    // Table: heading row and grid lines.
    const T=L.table,top=T.top,head=T.header,C=L.columns,tableW=T.right-T.left,tableH=T.bottom-top;
    html+=`<div class="grid" style="${at(T.left,top)};${size(tableW,tableH)}"></div>`;
    C.slice(1,-1).forEach(x=>{html+=`<div class="vline" style="${at(x,top)};height:${(tableH*FH).toFixed(2)}mm"></div>`;});
    html+=`<div class="hline" style="${at(T.left,top+head)};width:${(tableW*FW).toFixed(2)}mm"></div>`;
    [['',C[0],C[1]],['LOFT NAME',C[1],C[2]],['PIGEON I.D',C[2],C[3]],['REMARKS',C[3],C[4]],['STICKER',C[4],C[5]]].forEach(([text,a,b])=>{html+=`<div class="th" style="${at(a,top)};${size(b-a,head)}">${text}</div>`;});
    for(let r=0;r<L.rows;r++){
      const y=rowTop(r),b=rowBoxes(r);
      if(r)html+=`<div class="hline" style="${at(T.left,y)};width:${(tableW*FW).toFixed(2)}mm"></div>`;
      html+=`<div class="no" style="${at(C[0],y)};${size(C[1]-C[0],rowHeight())}">${r+1}.</div>`;
      html+=b.member.map(x=>box(x)).join('')+b.prefix.map(x=>box(x,'box letter')).join('')+b.number.map(x=>box(x)).join('');
      b.remarks.forEach((x,i)=>{html+=box(x,'tick')+`<div class="tick-label" style="${at(x.x1+.006,x.y0)};height:${((x.y1-x.y0)*FH).toFixed(2)}mm">${escapeHTML(labels[i]||'')}</div>`;});
    }
    html+=`<div class="foot" style="${at(.05,.976)};width:${(.9*FW).toFixed(2)}mm">AvilonX loading form · Loft name: member ID · Pigeon I.D: letters on top, numbers below · one character per box, in capitals · tick the remarks · keep the 4 black squares visible when scanning</div>`;
    return `<section class="page">${html}</section>`;
  };
  return `<!doctype html><html><head><meta charset="utf-8"><title>Loading form${race?` · ${escapeHTML(race.name)}`:''}</title><style>
  @page{size:${P.width}mm ${P.height}mm;margin:0}
  *{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{position:relative;width:${P.width}mm;height:${P.height}mm;overflow:hidden;page-break-after:always;break-after:page}
  .page>*{position:absolute}
  .mark{background:#000}
  .title{text-align:center;font-weight:700;font-size:5.4mm}
  .subtitle{text-align:center;font-size:4.4mm}
  .field{display:flex;gap:2mm;align-items:flex-end;font-size:4mm;border-bottom:.3mm solid #000;padding-bottom:.6mm}.field b{font-weight:700}
  .grid{border:.45mm solid #000}.vline{width:0;border-left:.35mm solid #000}.hline{height:0;border-top:.35mm solid #000}
  .th{display:flex;align-items:center;justify-content:center;font-weight:700;font-style:italic;font-size:3.6mm}
  .no{display:flex;align-items:center;justify-content:center;font-size:4.2mm}
  .box{border:.3mm solid #555;border-radius:.6mm}.box.letter{border-color:#777}
  .tick{border:.35mm solid #000;border-radius:.4mm}
  .tick-label{display:flex;align-items:center;font-size:3.4mm;font-weight:700}
  .hint{font-size:2mm;color:#666}
  .foot{font-size:2.3mm;color:#555;text-align:center}
  @media screen{body{background:#e9edf2}.page{margin:8mm auto;background:#fff;box-shadow:0 2px 12px #0003}}
  </style></head><body>${Array.from({length:Math.max(1,copies)},page).join('')}</body></html>`;
}

// Opens the form in a new window and the print dialog (print to paper or save as PDF).
export function printLoadingForm(options){
  const win=window.open('','_blank');
  if(!win)throw new Error('The browser blocked the new window. Allow pop-ups for AvilonX, then try again.');
  win.document.open();win.document.write(loadingFormHtml(options));win.document.close();
  win.addEventListener('load',()=>setTimeout(()=>win.print(),300));
  return win;
}
