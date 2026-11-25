// Short videos of clockings (clock-videos.sql). A member adds one after
// clocking, from the receipt or Clocking history; the club plays it on Show up.
import { supabase, escapeHTML, message } from './shared.js';

export const VIDEO_BUCKET='clock-videos';
export const MAX_VIDEO_SECONDS=30;
export const MAX_VIDEO_BYTES=50*1024*1024;
const EXT={'video/mp4':'mp4','video/quicktime':'mov','video/webm':'webm','video/3gpp':'3gp','video/x-matroska':'mkv'};

// Length of a video file in seconds, read from its metadata.
export function videoDuration(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file),video=document.createElement('video');
    const done=value=>{URL.revokeObjectURL(url);video.removeAttribute('src');video.load();value instanceof Error?reject(value):resolve(value);};
    video.preload='metadata';video.muted=true;
    video.onloadedmetadata=()=>{
      if(Number.isFinite(video.duration)){done(video.duration);return;}
      // Some recordings (webm from Android Chrome) report Infinity until the end is reached.
      video.ondurationchange=()=>{if(Number.isFinite(video.duration)){video.ondurationchange=null;done(video.duration);}};
      video.currentTime=Number.MAX_SAFE_INTEGER;
      setTimeout(()=>{if(video.ondurationchange)done(NaN);},4000);
    };
    video.onerror=()=>done(new Error('This video could not be opened. Record it again or choose another one.'));
    video.src=url;
  });
}

// Checks a chosen video: a video file, at most 30 seconds and 50 MB.
export async function checkVideo(file){
  if(!file)throw new Error('Choose a video.');
  if(file.type&&!/^video\//.test(file.type))throw new Error('Choose a video file.');
  if(file.size>MAX_VIDEO_BYTES)throw new Error(`This video is ${Math.round(file.size/1048576)} MB. Keep it under 50 MB: record ${MAX_VIDEO_SECONDS} seconds or less.`);
  const seconds=await videoDuration(file);
  if(!(seconds>0))throw new Error('This video could not be read. Record it again or choose another one.');
  if(seconds>MAX_VIDEO_SECONDS+0.5)throw new Error(`This video is ${Math.round(seconds)} seconds. Keep it to ${MAX_VIDEO_SECONDS} seconds or less.`);
  return seconds;
}

// Opens the camera (or the video library) and returns the chosen file, or null.
// Must be called straight from a tap, before any await.
export function chooseVideo(){
  return new Promise(resolve=>{
    const input=document.createElement('input');
    input.type='file';input.accept='video/*';input.setAttribute('capture','environment');input.hidden=true;
    input.addEventListener('change',()=>{resolve(input.files?.[0]||null);input.remove();},{once:true});
    input.addEventListener('cancel',()=>{resolve(null);input.remove();},{once:true});
    document.body.append(input);input.click();
  });
}

// Uploads a checked video for one of the member's clocks and saves it.
export async function uploadClockVideo(file,{clockId,clubId,memberId}){
  const seconds=await checkVideo(file);
  const type=EXT[file.type]?file.type:'video/mp4';
  const path=`${clubId}/${memberId}/${clockId}/${Date.now()}.${EXT[type]}`;
  const {error:uploadError}=await supabase.storage.from(VIDEO_BUCKET).upload(path,file,{contentType:type,upsert:false});
  if(uploadError)throw new Error(/bucket|not found/i.test(uploadError.message||'')?'Clocking videos are not set up yet. Ask your club to run avilonx-update.sql.':`The video could not be uploaded: ${uploadError.message}`);
  const {data,error}=await supabase.rpc('member_save_clock_video',{p_clock_id:clockId,p_path:path,p_duration:Math.round(seconds*100)/100,p_size:file.size});
  if(error){await supabase.storage.from(VIDEO_BUCKET).remove([path]);throw new Error(error.code==='PGRST202'?'Clocking videos are not set up yet. Ask your club to run avilonx-update.sql.':error.message);}
  if(data?.replaced_path)await supabase.storage.from(VIDEO_BUCKET).remove([data.replaced_path]);
  return {path,seconds};
}

// The whole member flow from a tap: choose, check, upload, tell the member.
// target is {clockId,clubId,memberId}, or an async function returning it
// (looked up while the camera is open). Returns true when a video was saved.
export async function addClockVideo(button,target){
  const picking=chooseVideo();
  const label=button.textContent;
  try{
    const where=typeof target==='function'?await target():target;
    const file=await picking;if(!file)return false;
    if(!where?.clockId)throw new Error('This clocking could not be found. Add the video from Clocking history.');
    button.disabled=true;button.textContent='Uploading video…';
    await uploadClockVideo(file,where);message('Video saved. Your club can see it.','success');return true;
  }catch(error){message(error.message,'error');return false;}
  finally{button.disabled=false;button.textContent=label;}
}

// Videos saved for these clocks, as a Map of clock id → video row. Empty when not set up.
export async function clockVideos(clockIds){
  const ids=[...new Set(clockIds.filter(Boolean))];if(!ids.length)return new Map();
  const {data,error}=await supabase.from('clock_videos').select('clock_event_id,storage_path,duration_seconds,created_at').in('clock_event_id',ids);
  if(error)return new Map();
  return new Map((data||[]).map(row=>[row.clock_event_id,row]));
}

// Plays a clocking video in a dialog (signed link, one hour).
export async function playClockVideo(video,title){
  const {data,error}=await supabase.storage.from(VIDEO_BUCKET).createSignedUrl(video.storage_path,3600);
  if(error||!data?.signedUrl){message('This video could not be opened. Try again.','error');return;}
  let dialog=document.querySelector('dialog.clock-video-dialog');
  if(!dialog){
    dialog=document.createElement('dialog');dialog.className='clock-video-dialog';dialog.setAttribute('closedby','any');dialog.setAttribute('aria-labelledby','clock-video-title');
    // Light dismiss where closedby is not supported yet (Safari): a tap on the backdrop closes it.
    if(!('closedBy' in HTMLDialogElement.prototype))dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientY<r.top||event.clientY>r.bottom||event.clientX<r.left||event.clientX>r.right)dialog.close();});
    dialog.addEventListener('close',()=>{dialog.querySelector('video')?.pause();});
    document.body.append(dialog);
  }
  dialog.innerHTML=`<div class="clock-video-head"><h2 id="clock-video-title">${escapeHTML(title||'Clocking video')}</h2><form method="dialog"><button class="button secondary" type="submit">Close</button></form></div><video controls playsinline preload="metadata" width="640" height="360" src="${escapeHTML(data.signedUrl)}"></video>${video.duration_seconds?`<p class="small">${escapeHTML(String(Math.round(Number(video.duration_seconds))))} seconds</p>`:''}`;
  dialog.showModal();
}
