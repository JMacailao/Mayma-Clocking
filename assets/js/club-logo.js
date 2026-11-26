// Club logos (club-logo.sql): a public image per club, shown in the top bar.
import { supabase } from './shared.js';

export const LOGO_BUCKET='club-logos';

export const clubLogoUrl=path=>path?supabase.storage.from(LOGO_BUCKET).getPublicUrl(path)?.data?.publicUrl||'':'';

// The top bar's logo spot: shows the club's logo, or nothing.
export function showClubLogo(path,root=document){
  const spot=root.querySelector('[data-club-logo]');if(!spot)return;
  const url=clubLogoUrl(path);
  spot.hidden=!url;
  spot.innerHTML=url?`<img src="${url.replace(/"/g,'&quot;')}" alt="" width="32" height="32">`:'';
}

// At most 256 px on its long side, as PNG (keeps transparency).
export async function shrinkLogo(file){
  if(!file)throw new Error('Choose an image.');
  if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw new Error('Choose a PNG, JPG or WebP image.');
  const url=URL.createObjectURL(file);
  try{
    const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('This image could not be opened. Try another one.'));img.src=url;});
    const scale=Math.min(1,256/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob)throw new Error('This image could not be prepared. Try another one.');
    return blob;
  }finally{URL.revokeObjectURL(url);}
}

// Uploads a new logo for the club (or removes it with file = null) and saves it.
export async function saveClubLogo(clubId,file){
  let path=null;
  if(file){
    const blob=await shrinkLogo(file);
    path=`${clubId}/${Date.now()}.png`;
    const {error}=await supabase.storage.from(LOGO_BUCKET).upload(path,blob,{contentType:'image/png',upsert:false});
    if(error)throw new Error(/bucket|not found/i.test(error.message||'')?'Club logos are not set up yet. Run avilonx-update.sql in the Supabase SQL Editor.':`The logo could not be uploaded: ${error.message}`);
  }
  const {data,error}=await supabase.rpc('admin_set_club_logo',{p_path:path});
  if(error){if(path)await supabase.storage.from(LOGO_BUCKET).remove([path]);throw new Error(error.code==='PGRST202'?'Club logos are not set up yet. Run avilonx-update.sql in the Supabase SQL Editor.':error.message);}
  if(data?.replaced_path)await supabase.storage.from(LOGO_BUCKET).remove([data.replaced_path]);
  return path;
}
