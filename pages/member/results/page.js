import { mountPublicResults } from '../../results/public.js';

export async function render(view) {
  view.innerHTML=`<div class="split-heading"><div><h2>Race results</h2></div></div><section class="panel"><div data-member-public-results></div></section>`;
  await mountPublicResults(view.querySelector('[data-member-public-results]'));
}
