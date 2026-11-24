import { supabase, escapeHTML, message, dbError } from '../../../assets/js/shared.js';

const missingSql=error=>/entry_remark_options|relation|schema cache/i.test(error?.message||'');

// The club administrator builds the list of remarks that appear as tick boxes
// when registering a pigeon on Race entries.
export async function render(view,identity) {
  const isAdmin=identity?.profile?.role==='admin';
  const heading='<div class="split-heading"><div><span class="eyebrow">RACE ENTRIES</span><h2>Entry remarks</h2><p>Tick boxes offered when registering a pigeon.</p></div></div>';
  const {data,error}=await supabase.from('entry_remark_options').select('id,label,sort_order,is_active').order('sort_order').order('label');
  if(error){if(missingSql(error)){view.innerHTML=`${heading}<div class="notice error">Remarks are not set up yet. Run entry-remarks.sql in the Supabase SQL Editor, then reload this page.</div>`;return;}throw error;}
  const remarks=data||[];

  const draw=()=>{
    view.innerHTML=`${heading}
    ${isAdmin?`<section class="panel narrow"><h3>Add a remark</h3><form id="remark-form" class="remark-add"><label class="field"><span>Remark</span><input name="label" required maxlength="60" placeholder="e.g. Vaccinated, Fee paid, Late entry"></label><button class="button primary">Add remark</button></form><p class="small">Suggestions: <span class="remark-suggestions">${['Vaccinated','Fee paid','Pooling paid','Late entry','Young bird','Re-ring','Needs checking'].filter(label=>!remarks.some(item=>item.label.toLowerCase()===label.toLowerCase())).map(label=>`<button class="text-button" type="button" data-suggest="${escapeHTML(label)}">+ ${escapeHTML(label)}</button>`).join('')}</span></p></section>`:'<div class="notice">Only the club administrator can change the remarks list.</div>'}
    <section class="panel narrow"><div class="panel-heading"><h3>Club remarks</h3><span class="count-pill">${remarks.length} remark${remarks.length===1?'':'s'}</span></div>
    ${remarks.length?`<ul class="remark-list">${remarks.map((remark,index)=>`<li class="${remark.is_active?'':'is-hidden'}" data-remark="${remark.id}"><span class="remark-label">${escapeHTML(remark.label)}${remark.is_active?'':' <span class="tag closed">Hidden</span>'}</span>${isAdmin?`<span class="remark-actions"><button class="text-button" type="button" data-move="-1" ${index===0?'disabled':''} aria-label="Move ${escapeHTML(remark.label)} up">↑</button><button class="text-button" type="button" data-move="1" ${index===remarks.length-1?'disabled':''} aria-label="Move ${escapeHTML(remark.label)} down">↓</button><button class="text-button" type="button" data-rename>Rename</button><button class="text-button" type="button" data-toggle>${remark.is_active?'Hide':'Show'}</button><button class="text-button danger-text" type="button" data-delete>Delete</button></span>`:''}</li>`).join('')}</ul><p class="small">Hidden remarks aren't offered for new entries. Saved entries don't change.</p>`:'<p class="small">No remarks yet.</p>'}</section>`;
    bind();
  };
  const reload=async()=>{const {data:fresh,error:reloadError}=await supabase.from('entry_remark_options').select('id,label,sort_order,is_active').order('sort_order').order('label');if(reloadError){message(dbError(reloadError),'error');return;}remarks.splice(0,remarks.length,...(fresh||[]));draw();};
  const duplicate=error=>error?.code==='23505'?'That remark is already on the list.':dbError(error);
  const add=async label=>{
    const clean=String(label||'').trim();if(!clean)return;
    const {error:addError}=await supabase.from('entry_remark_options').insert({label:clean,sort_order:(remarks.at(-1)?.sort_order??0)+1});
    if(addError){message(duplicate(addError),'error');return;}
    message(`Remark "${clean}" added.`,'success');await reload();view.querySelector('#remark-form [name=label]')?.focus();
  };
  function bind(){
    const form=view.querySelector('#remark-form');
    if(form)form.onsubmit=event=>{event.preventDefault();add(form.elements.label.value);};
    view.querySelectorAll('[data-suggest]').forEach(button=>button.onclick=()=>add(button.dataset.suggest));
    view.querySelectorAll('[data-remark]').forEach(row=>{
      const remark=remarks.find(item=>item.id===Number(row.dataset.remark)),index=remarks.indexOf(remark);
      row.querySelectorAll('[data-move]').forEach(button=>button.onclick=async()=>{
        const other=remarks[index+Number(button.dataset.move)];if(!other)return;
        // Swap positions; give distinct numbers first in case two share one.
        const order=remarks.map((item,position)=>({item,position}));
        const updates=order.map(({item,position})=>({id:item.id,sort_order:item===remark?index+Number(button.dataset.move):item===other?index:position}));
        for(const update of updates){const {error:moveError}=await supabase.from('entry_remark_options').update({sort_order:update.sort_order}).eq('id',update.id);if(moveError){message(dbError(moveError),'error');break;}}
        await reload();
      });
      const rename=row.querySelector('[data-rename]');
      if(rename)rename.onclick=async()=>{
        const label=prompt('Rename the remark:',remark.label);if(label===null||!label.trim()||label.trim()===remark.label)return;
        const {error:renameError}=await supabase.from('entry_remark_options').update({label:label.trim()}).eq('id',remark.id);
        if(renameError){message(duplicate(renameError),'error');return;}
        message('Remark renamed. Entries saved before keep the old name.','success');await reload();
      };
      const toggle=row.querySelector('[data-toggle]');
      if(toggle)toggle.onclick=async()=>{
        const {error:toggleError}=await supabase.from('entry_remark_options').update({is_active:!remark.is_active}).eq('id',remark.id);
        if(toggleError){message(dbError(toggleError),'error');return;}
        message(remark.is_active?`"${remark.label}" is hidden from new entries.`:`"${remark.label}" is offered again.`,'success');await reload();
      };
      const remove=row.querySelector('[data-delete]');
      if(remove)remove.onclick=async()=>{
        if(!confirm(`Delete the remark "${remark.label}"? Entries that already have it keep it.`))return;
        const {error:deleteError}=await supabase.from('entry_remark_options').delete().eq('id',remark.id);
        if(deleteError){message(dbError(deleteError),'error');return;}
        message(`Remark "${remark.label}" deleted.`,'success');await reload();
      };
    });
  }
  draw();
}
