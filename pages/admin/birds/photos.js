import { supabase } from '../../../assets/js/shared.js';

// Bird bonding helpers shared with Race entries, Show up and My pigeons:
// colours, private photo links and photo shrinking.
export const BIRD_COLOURS=['Blue bar','Blue check','Dark check','Red check','Red bar','Mealy','Grizzle','Black','White','Pied','Silver','Other'];
export const PHOTO_BUCKET='pigeon-photos';

// Signed links to private bird photos, one hour.
export async function birdPhotoUrls(paths){
  const unique=[...new Set(paths.filter(path=>path&&path!=='no-photo-yet'))];  // imported birds have no photo yet
  if(!unique.length)return new Map();
  const {data,error}=await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(unique,3600);
  if(error)return new Map();
  return new Map((data||[]).filter(item=>item.signedUrl).map(item=>[item.path,item.signedUrl]));
}

// Shrinks a photo to at most 1000 px on its long side as a JPEG (about 150 KB).
export async function shrinkPhoto(file){
  if(!file)return null;
  if(!/^image\//.test(file.type))throw new Error('Choose a photo (JPEG, PNG or similar).');
  const url=URL.createObjectURL(file);
  try{
    const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('This photo could not be opened. Try another one.'));img.src=url;});
    const scale=Math.min(1,1000/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.82));
    if(!blob)throw new Error('This photo could not be prepared. Try another one.');
    return blob;
  }finally{URL.revokeObjectURL(url);}
}
