import { supabase, escapeHTML, message } from '../../../assets/js/shared.js';

// Club administrator: settings that change how the club works.
export async function render(view,identity){
  const clubId=identity?.profile?.club_id;
  const {data:club,error}=await supabase.from('clubs').select('*').eq('id',clubId).maybeSingle();
  const missing=error||!club||!('rfid_entry_sticker' in club);
  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">ADMINISTRATION</span><h2>Club settings</h2><p>How ${escapeHTML(club?.name||'your club')} works. Only the club administrator can change these.</p></div></div>
  ${missing?'<div class="notice error">Club settings are not set up yet. Run <strong>avilonx-update.sql</strong> in the Supabase SQL Editor, then reload this page.</div>':''}
  <section class="panel settings-panel"><h3>Race entries</h3>
    <fieldset class="settings-choice" ${missing?'disabled':''}><legend>Sticker for RFID entries</legend>
      <label><input type="radio" name="rfid_entry_sticker" value="required"><span><strong>Required</strong>Every RFID entry also needs the pigeon's sticker. The entry cannot be saved without it.</span></label>
      <label><input type="radio" name="rfid_entry_sticker" value="optional"><span><strong>Optional</strong>An RFID entry can be saved without a sticker. A warning pops up first, because without a sticker the pigeon can only be clocked by its RFID tag (loft reader or phone).</span></label>
    </fieldset>
    <p class="small">Sticker entries and ring-number-only birds always need their sticker.</p>
  </section>
  <section class="panel settings-panel"><h3>Loading form</h3>
    <p class="small">Race entries → Scan race sheet → <strong>Print loading form</strong> prints the club's loading form with these boxes, one character per box. All the club's remarks (Entry remarks) are printed as tick boxes.</p>
    ${club&&!('form_member_boxes' in club)?'<div class="notice error">Loading form settings are not set up yet. Run <strong>avilonx-update.sql</strong> in the Supabase SQL Editor.</div>':''}
    <div class="settings-boxes" ${club&&'form_member_boxes' in club?'':'hidden'}>
      <label class="field"><span>Member ID boxes</span><input type="number" min="1" max="8" step="1" inputmode="numeric" name="form_member_boxes" value="${club?.form_member_boxes??5}"></label>
      <label class="field"><span>Pigeon I.D: letter boxes</span><input type="number" min="0" max="8" step="1" inputmode="numeric" name="form_prefix_boxes" value="${club?.form_prefix_boxes??6}"><small class="small">0 = no letters line</small></label>
      <label class="field"><span>Pigeon I.D: number boxes</span><input type="number" min="1" max="10" step="1" inputmode="numeric" name="form_number_boxes" value="${club?.form_number_boxes??8}"></label>
    </div>
    <p class="small">Changed the boxes or the remarks? Print the forms again: a form is read with the settings it was printed with.</p>
  </section>
  <section class="panel settings-panel"><h3>Accounts</h3>
    ${club&&!('single_device' in club)?'<div class="notice error">One device per account is not set up yet. Run <strong>avilonx-update.sql</strong> in the Supabase SQL Editor.</div>':''}
    <fieldset class="settings-choice" ${club&&'single_device' in club?'':'disabled'}><legend>Devices per account</legend>
      <label><input type="radio" name="single_device" value="off"><span><strong>Any number of devices</strong>An account can be signed in on several phones and computers at the same time.</span></label>
      <label><input type="radio" name="single_device" value="on"><span><strong>One device per account</strong>Each account (administrators, staff and members) can be signed in on one device at a time. Signing in on another device asks first; confirming signs the other device out.</span></label>
    </fieldset>
    <div class="form-actions"><button class="button primary" type="button" data-save-settings ${missing?'disabled':''}>Save settings</button></div>
  </section>`;
  const current=club?.rfid_entry_sticker||'required',devices=club?.single_device?'on':'off';
  const deviceRadio=view.querySelector(`[name=single_device][value="${devices}"]`);if(deviceRadio)deviceRadio.checked=true;
  const radio=view.querySelector(`[name=rfid_entry_sticker][value="${current}"]`);if(radio)radio.checked=true;
  view.querySelector('[data-save-settings]').onclick=async event=>{
    const button=event.currentTarget,value=view.querySelector('[name=rfid_entry_sticker]:checked')?.value;if(!value)return;
    button.disabled=true;
    let {error:saveError}=await supabase.rpc('admin_update_club_settings',{p_rfid_entry_sticker:value});
    if(!saveError&&'form_member_boxes' in (club||{})){
      const count=name=>Number(view.querySelector(`[name=${name}]`).value);
      const boxes=[count('form_member_boxes'),count('form_prefix_boxes'),count('form_number_boxes')];
      if(boxes.some(n=>!Number.isInteger(n))||boxes[0]<1||boxes[0]>8||boxes[1]<0||boxes[1]>8||boxes[2]<1||boxes[2]>10){button.disabled=false;message('Member ID: 1 to 8 boxes. Ring letters: 0 to 8. Ring numbers: 1 to 10.','error');return;}
      ({error:saveError}=await supabase.rpc('admin_update_form_settings',{p_member_boxes:boxes[0],p_prefix_boxes:boxes[1],p_number_boxes:boxes[2]}));
    }
    const single=view.querySelector('[name=single_device]:checked')?.value;
    if(!saveError&&single&&'single_device' in (club||{})&&(single==='on')!==Boolean(club.single_device)){({error:saveError}=await supabase.rpc('admin_set_single_device',{p_on:single==='on'}));if(!saveError)club.single_device=single==='on';}
    button.disabled=false;
    if(saveError){message(/admin_update_club_settings|function/i.test(saveError.message||'')?'Club settings are not set up yet. Run avilonx-update.sql in the Supabase SQL Editor.':saveError.message,'error');return;}
    message(`Settings saved: sticker ${value==='optional'?'optional (with a warning)':'required'} for RFID entries; ${single==='on'?'one device per account':'any number of devices per account'}.`,'success');
  };
}
