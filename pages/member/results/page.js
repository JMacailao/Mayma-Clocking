import { mountPublicResults } from '../../results/public.js';

export async function render(view) {
  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">CLUB RESULTS</span><h2>Race results</h2><p>Choose a club and date to view the public race results.</p></div></div><section class="panel"><div data-member-public-results></div></section>`;
  await mountPublicResults(view.querySelector('[data-member-public-results]'));
}
