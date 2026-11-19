import { supabase, escapeHTML, message, formatDate } from '../../../assets/js/shared.js';

// Settings → Telegram: members who own a loft RFID reader can get each clock
// result on Telegram. Hidden for everyone else.
export async function mountTelegram(container){
  const {data:status,error}=await supabase.rpc('member_telegram_status');
  if(error||!status?.eligible){container.hidden=true;return;}
  container.hidden=false;
  const draw=state=>{
    container.innerHTML=`<div class="panel-heading"><h3>Telegram results</h3>${state.linked?'<span class="telegram-state is-on">Connected</span>':''}</div>
      <p class="small">Because you have a loft RFID reader, you can get a Telegram message each time one of your pigeons is clocked: the race, time, flight time, speed and how it was clocked.</p>
      ${!state.ready?'<div class="notice">Telegram is not set up yet. The AvilonX Super Admin turns it on.</div>':state.linked
        ?`<p>Messages go to your Telegram${state.linked_at?` (connected ${escapeHTML(formatDate(state.linked_at))})`:''}.</p><div class="form-actions"><button class="button secondary" type="button" data-telegram-unlink>Disconnect Telegram</button></div>`
        :`<ol class="telegram-steps"><li>Press <strong>Connect Telegram</strong>. Telegram opens the AvilonX bot.</li><li>Press <strong>Start</strong> in Telegram. You get "Connected ✅".</li><li>Come back here and press <strong>Check</strong>.</li></ol><div class="form-actions"><button class="button primary" type="button" data-telegram-link>Connect Telegram</button><button class="button secondary" type="button" data-telegram-refresh>Check</button></div>`}`;
    container.querySelector('[data-telegram-link]')?.addEventListener('click',async()=>{
      const {data,error:linkError}=await supabase.rpc('member_telegram_link');
      if(linkError){message(linkError.message,'error');return;}
      // Opened in Telegram (app or web); the link works for 30 minutes.
      window.open(data.url,'_blank','noopener')||(location.href=data.url);
      message('Telegram opened: press Start there, then come back and press Check.','info');
    });
    container.querySelector('[data-telegram-refresh]')?.addEventListener('click',refresh);
    container.querySelector('[data-telegram-unlink]')?.addEventListener('click',async()=>{
      if(!confirm('Stop AvilonX messages on Telegram?'))return;
      const {error:unlinkError}=await supabase.rpc('member_telegram_unlink');
      if(unlinkError){message(unlinkError.message,'error');return;}
      message('Telegram disconnected.','success');refresh();
    });
  };
  const refresh=async()=>{const {data}=await supabase.rpc('member_telegram_status');if(data)draw(data);if(data?.linked)message('Telegram is connected.','success');};
  draw(status);
}
