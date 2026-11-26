import { mountPublicResults } from '../../results/public.js';
import { mountSeason } from '../../../assets/js/season.js';

export async function render(view,identity) {
  view.innerHTML=`<div class="split-heading"><div><h2>Race results</h2></div></div><section class="panel"><div data-member-public-results></div></section><section class="panel" data-season hidden></section>`;
  mountSeason(view.querySelector('[data-season]'),{memberId:identity?.profile?.member_id??null}).catch(error=>console.warn('Season standings unavailable:',error));
  await mountPublicResults(view.querySelector('[data-member-public-results]'));
}
