// In-memory stand-in for supabase-js used by the page tests. Tables come from
// window.FAKE.tables, RPC answers from window.FAKE.rpc (functions or values).
const F=window.FAKE||(window.FAKE={});F.tables=F.tables||{};F.rpc=F.rpc||{};F.ops=[];F.channels=[];
let nextId=1000;
function query(table){
  let rows=null,filters=[],orderBy=null,limitN=null,mode='select',payload=null,single=false;
  const apply=list=>{let out=list.filter(row=>filters.every(f=>f(row)));if(orderBy){const [k,asc]=orderBy;out=[...out].sort((a,b)=>(a[k]>b[k]?1:a[k]<b[k]?-1:0)*(asc?1:-1));}if(limitN!=null)out=out.slice(0,limitN);return out;};
  const run=()=>{
    const list=F.tables[table]||(F.tables[table]=[]);
    if(F.fail?.[table])return {data:null,error:{message:F.fail[table]}};
    if(mode==='insert'){const items=(Array.isArray(payload)?payload:[payload]).map(item=>({id:nextId++,created_at:new Date().toISOString(),...item}));list.push(...items);F.ops.push(['insert',table,payload]);return {data:single?items[0]:items,error:null};}
    if(mode==='update'){const hit=apply(list);hit.forEach(row=>Object.assign(row,payload));F.ops.push(['update',table,payload]);return {data:hit,error:null};}
    if(mode==='delete'){const hit=apply(list);F.tables[table]=list.filter(row=>!hit.includes(row));F.ops.push(['delete',table]);return {data:hit,error:null};}
    const out=apply(list);return {data:single?(out[0]||null):out,error:null,count:out.length};
  };
  const q={
    select:()=>q,insert:v=>{mode='insert';payload=v;return q;},update:v=>{mode='update';payload=v;return q;},delete:()=>{mode='delete';return q;},upsert:v=>{mode='insert';payload=v;return q;},
    eq:(k,v)=>{filters.push(r=>r[k]==v);return q;},neq:(k,v)=>{filters.push(r=>r[k]!=v);return q;},in:(k,v)=>{filters.push(r=>v.includes(r[k]));return q;},
    gte:(k,v)=>{filters.push(r=>r[k]>=v);return q;},lte:(k,v)=>{filters.push(r=>r[k]<=v);return q;},gt:(k,v)=>{filters.push(r=>r[k]>v);return q;},is:(k,v)=>{filters.push(r=>(r[k]??null)===v);return q;},
    order:(k,o={})=>{orderBy=[k,o.ascending!==false];return q;},limit:n=>{limitN=n;return q;},range:()=>q,
    maybeSingle:()=>{single=true;return q;},single:()=>{single=true;return q;},
    then:(a,b)=>Promise.resolve(run()).then(a,b)
  };
  return q;
}
export const createClient=()=>({
  auth:{getSession:async()=>({data:{session:F.session||null}}),signOut:async()=>({error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  from:query,
  rpc:async(name,args)=>{F.ops.push(['rpc',name,args]);const r=F.rpc[name];if(r===undefined)return {data:null,error:{message:`Could not find the function public.${name}`}};const v=typeof r==='function'?await r(args):r;return v&&v.__error?{data:null,error:v.__error}:{data:v,error:null};},
  storage:{from:()=>({createSignedUrls:async paths=>({data:paths.map(path=>({path,signedUrl:F.photo||'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="%237b9cc8"/></svg>'})),error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
  channel:name=>{const ch={name,handlers:[],on(evt,filter,cb){ch.handlers.push(cb);return ch;},subscribe(cb){cb&&cb('SUBSCRIBED');return ch;},unsubscribe(){}};F.channels.push(ch);return ch;},
  removeChannel:()=>{}
});
