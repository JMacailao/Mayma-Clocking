import { renderCrud } from '../crud.js';
export function render(view,canManageAccounts){return renderCrud(view,'members',canManageAccounts);}
