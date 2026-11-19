// Reads one handwritten digit (0–9) from a box of the AvilonX loading form.
//
// A small neural network trained on handwritten digits (MNIST, from the `mnist`
// npm package) with the digits tilted, moved and drawn thinner or thicker, so
// it copes with real pens. The weights are in digit-model.js; they are made by
// tools/digit-model/train.py. Everything runs in the browser, offline.
//
// The steps below must match tools/digit-model/prep.py exactly.
import { DIGIT_MODELS } from './digit-model.js';

// Ink weights (0..1) of a box: its inner part, judged against its own paper.
function boxInk(canvas,box){
  const w=Math.round(box.right-box.left),h=Math.round(box.bottom-box.top);
  const top=Math.trunc(h*.12),side=Math.trunc(w*.15),iw=w-2*side,ih=h-2*top;
  if(iw<4||ih<4)return null;
  const data=canvas.getContext('2d',{willReadFrequently:true}).getImageData(Math.round(box.left)+side,Math.round(box.top)+top,iw,ih).data;
  const gray=new Float32Array(iw*ih);for(let i=0;i<gray.length;i++)gray[i]=data[i*4]*.299+data[i*4+1]*.587+data[i*4+2]*.114;
  const sorted=Float32Array.from(gray).sort(),paper=percentile(sorted,80);
  const ink=new Float32Array(iw*ih);for(let i=0;i<ink.length;i++)ink[i]=Math.min(1,Math.max(0,(paper*.8-gray[i])/(paper*.35)));
  removeBorderLines(ink,iw,ih,canvas,box,side,top,paper);
  return {ink,w:iw,h:ih};
}
// A box a little off its print has part of its border inside: a straight line
// along the whole box, near an edge. Handwriting never runs the box's full
// height (or width), so such lines are wiped before reading.
function removeBorderLines(ink,w,h,canvas,box,side,top,paper){
  const fw=Math.round(box.right-box.left),fh=Math.round(box.bottom-box.top),x0=Math.round(box.left),y0=Math.round(box.top);
  const d=canvas.getContext('2d',{willReadFrequently:true}).getImageData(x0,y0,fw,fh).data,cut=paper*.8-paper*.35*.35;
  const dark=(x,y)=>x>=0&&y>=0&&x<fw&&y<fh&&(d[(y*fw+x)*4]*.299+d[(y*fw+x)*4+1]*.587+d[(y*fw+x)*4+2]*.114)<cut?1:0;
  for(let x=0;x<w;x++){if(x>=w*.3&&x<w*.7)continue;const fx=x+side;let n=0;for(let y=0;y<fh;y++)n+=dark(fx-1,y)|dark(fx,y)|dark(fx+1,y);
    if(n>fh*.88)for(const dx of [-1,0,1])if(x+dx>=0&&x+dx<w)for(let y=0;y<h;y++)ink[y*w+x+dx]=0;}
  for(let y=0;y<h;y++){if(y>=h*.3&&y<h*.7)continue;const fy=y+top;let n=0;for(let x=0;x<fw;x++)n+=dark(x,fy-1)|dark(x,fy)|dark(x,fy+1);
    if(n>fw*.88)for(const dy of [-1,0,1])if(y+dy>=0&&y+dy<h)for(let x=0;x<w;x++)ink[(y+dy)*w+x]=0;}
}
// numpy's default (linear) percentile.
function percentile(sorted,p){const k=(sorted.length-1)*p/100,f=Math.floor(k),c=Math.min(sorted.length-1,f+1);return sorted[f]+(sorted[c]-sorted[f])*(k-f);}

// Area-average resize.
function areaResize(a,h,w,nh,nw){
  const out=new Float32Array(nh*nw);
  for(let i=0;i<nh;i++){const y0=i*h/nh,y1=(i+1)*h/nh;
    for(let j=0;j<nw;j++){const x0=j*w/nw,x1=(j+1)*w/nw;let acc=0,area=0;
      for(let y=Math.floor(y0);y<Math.ceil(y1);y++){const fy=Math.min(y1,y+1)-Math.max(y0,y);if(fy<=0)continue;
        for(let x=Math.floor(x0);x<Math.ceil(x1);x++){const fx=Math.min(x1,x+1)-Math.max(x0,x);if(fx<=0)continue;acc+=a[y*w+x]*fx*fy;area+=fx*fy;}}
      out[i*nw+j]=area?acc/area:0;}}
  return out;
}
// Python's round(): halves go to the even number.
const roundHalfEven=v=>{const f=Math.floor(v),d=v-f;return d>.5?f+1:d<.5?f:(f%2===0?f:f+1);};

// The digit as a 28×28 picture (ink = 1), centred like the training digits.
export function boxTo28(canvas,box){
  const src=boxInk(canvas,box);if(!src)return null;
  const {ink,w,h}=src;let x0=w,x1=-1,y0=h,y1=-1,count=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(ink[y*w+x]>.35){count++;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
  if(count<3)return null;
  const ch=y1-y0+1,cw=x1-x0+1,crop=new Float32Array(ch*cw);
  for(let y=0;y<ch;y++)for(let x=0;x<cw;x++)crop[y*cw+x]=ink[(y+y0)*w+x+x0];
  const s=20/Math.max(ch,cw),nh=Math.max(1,roundHalfEven(ch*s)),nw=Math.max(1,roundHalfEven(cw*s)),small=areaResize(crop,ch,cw,nh,nw);
  let m=0,my=0,mx=0;for(let y=0;y<nh;y++)for(let x=0;x<nw;x++){const v=small[y*nw+x];m+=v;my+=v*y;mx+=v*x;}
  let oy=roundHalfEven(13.5-my/m),ox=roundHalfEven(13.5-mx/m);oy=Math.min(Math.max(oy,0),28-nh);ox=Math.min(Math.max(ox,0),28-nw);
  const out=new Float32Array(784);
  for(let y=0;y<nh;y++)for(let x=0;x<nw;x++)out[(y+oy)*28+x+ox]=Math.min(1,Math.max(0,small[y*nw+x]));
  return out;
}

// The networks' numbers, unpacked once (stored as bytes with a scale per layer).
let unpacked=null;
function models(){
  if(unpacked)return unpacked;
  unpacked=DIGIT_MODELS.map(model=>{
    const bytes=Uint8Array.from(atob(model.data),ch=>ch.charCodeAt(0)),signed=new Int8Array(bytes.buffer),weights={channels:model.channels};let offset=0;
    for(const [name,size,scale] of model.layers){const values=new Float32Array(size);for(let i=0;i<size;i++)values[i]=signed[offset+i]*scale;weights[name]=values;offset+=size;}
    return weights;
  });
  return unpacked;
}

// conv (k×k, same padding) + ReLU + 2×2 max pool. x: [cin][n][n].
function convPool(x,cin,n,w,b,cout,k){
  const pad=(k-1)>>1,out=new Float32Array(cout*(n/2)*(n/2));
  const z=new Float32Array(n*n);
  for(let o=0;o<cout;o++){
    z.fill(b[o]);
    for(let c=0;c<cin;c++)for(let i=0;i<k;i++)for(let j=0;j<k;j++){
      const wv=w[o*cin*k*k+c*k*k+i*k+j];if(!wv)continue;
      for(let y=0;y<n;y++){const sy=y+i-pad;if(sy<0||sy>=n)continue;const row=c*n*n+sy*n;
        for(let xx=0;xx<n;xx++){const sx=xx+j-pad;if(sx<0||sx>=n)continue;z[y*n+xx]+=wv*x[row+sx];}}
    }
    const h=n/2;for(let y=0;y<h;y++)for(let xx=0;xx<h;xx++){const a=z[2*y*n+2*xx],bb=z[2*y*n+2*xx+1],c=z[(2*y+1)*n+2*xx],d=z[(2*y+1)*n+2*xx+1];out[o*h*h+y*h+xx]=Math.max(0,a,bb,c,d);}
  }
  return out;
}

// Chances (0..1) of each digit 0–9 for a 28×28 picture.
// (Each network's chances, averaged.)
export function digitChances(picture){
  const all=models(),chances=new Array(10).fill(0);
  for(const W of all){
    const [c1,c2]=W.channels,p1=convPool(picture,1,28,W.w1,W.b1,c1,5),p2=convPool(p1,c1,14,W.w2,W.b2,c2,3),scores=new Float32Array(10);
    for(let o=0;o<10;o++){let s=W.b3[o];for(let i=0;i<p2.length;i++)s+=W.w3[o*p2.length+i]*p2[i];scores[o]=s;}
    const top=Math.max(...scores),e=scores.map(v=>Math.exp(v-top)),sum=e.reduce((a,b)=>a+b,0);
    for(let i=0;i<10;i++)chances[i]+=e[i]/sum/all.length;
  }
  return chances;
}

// The picture moved by (dx, dy) pixels and turned by `angle` degrees (bilinear).
export function movePicture(picture,dx,dy,angle=0){
  const out=new Float32Array(784),a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  for(let y=0;y<28;y++)for(let x=0;x<28;x++){
    const ux=x-13.5-dx,uy=y-13.5-dy,sx=c*ux+s*uy+13.5,sy=-s*ux+c*uy+13.5,x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0;
    const at=(xx,yy)=>xx<0||yy<0||xx>27||yy>27?0:picture[yy*28+xx];
    out[y*28+x]=at(x0,y0)*(1-fx)*(1-fy)+at(x0+1,y0)*fx*(1-fy)+at(x0,y0+1)*(1-fx)*fy+at(x0+1,y0+1)*fx*fy;
  }
  return out;
}

// The picture read several times (as written, moved a pixel each way, turned a
// little) and the chances averaged: steadier than one reading.
const VARIANTS=[[0,0,0],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,7],[0,0,-7]];
export function classifyDigit(picture){
  const chances=new Array(10).fill(0);
  for(const [dx,dy,angle] of VARIANTS){const one=digitChances(dx||dy||angle?movePicture(picture,dx,dy,angle):picture);for(let i=0;i<10;i++)chances[i]+=one[i]/VARIANTS.length;}
  let digit=0;for(let i=1;i<10;i++)if(chances[i]>chances[digit])digit=i;
  return {digit,confidence:chances[digit],chances};
}

// Reads a box: {digit, confidence, chances} or null when the box is empty.
export function readDigitBox(canvas,box){
  const picture=boxTo28(canvas,box);
  return picture?classifyDigit(picture):null;
}
