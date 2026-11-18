// Module hooks for the unit tests: https:// imports (CDN libraries) resolve to
// a stand-in module instead of being downloaded.
const STUB = 'data:text/javascript,' + encodeURIComponent(
  'export const createClient=()=>({auth:{},from:()=>({}),rpc:async()=>({data:null,error:null}),storage:{from:()=>({})},channel:()=>({on(){return this;},subscribe(){return this;}})});export default {};'
);
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('https://')) return { url: STUB, shortCircuit: true };
  return next(specifier, context);
}
