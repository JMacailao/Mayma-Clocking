const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function worker({online=true,cached=true}={}) {
  const events={}, calls=[];
  const cache={add:async url=>calls.push(['cache',url]),match:async()=>cached?new Response('offline notice'):undefined};
  const context={URL,Response,self:{location:{href:'https://example.com/Mayma-Clocking/sw.js'},clients:{claim:async()=>calls.push(['claim'])},addEventListener:(key,fn)=>events[key]=fn},
    caches:{open:async()=>cache,keys:async()=>['other-app-v1','avilonx-offline:/other/:v1','avilonx-offline:/Mayma-Clocking/:old','avilonx-offline:/Mayma-Clocking/:v1'],delete:async key=>calls.push(['delete',key])},
    fetch:async request=>{calls.push(['fetch',request.url]);if(!online)throw new Error('offline');return new Response('live page');}};
  vm.runInNewContext(fs.readFileSync('sw.js','utf8'),context);
  return {events,calls};
}

test('manifest has installable icons and stays within a repository subpath',()=>{
  const m=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
  assert.equal(m.name,'AvilonX');assert.equal(m.display,'standalone');
  const base='https://example.com/Mayma-Clocking/manifest.webmanifest';
  assert.equal(new URL(m.scope,base).pathname,'/Mayma-Clocking/');
  assert.equal(new URL(m.start_url,base).pathname,'/Mayma-Clocking/pages/login/index.html');
  for(const size of [192,512])assert.ok(m.icons.some(i=>i.sizes===`${size}x${size}`&&i.purpose==='any'));
  assert.ok(m.icons.some(i=>i.purpose==='maskable'));
  for(const icon of m.icons){const bytes=fs.readFileSync(icon.src);const size=Number(icon.sizes.split('x')[0]);assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);}
});

test('every entry HTML has working manifest and bootstrap paths',()=>{
  const files=['index.html'];
  function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(entry.name==='index.html')files.push(file);}}walk('pages');
  for(const file of files){const html=fs.readFileSync(file,'utf8');for(const [pattern,expected] of [[/rel="manifest" href="([^"]+)"/,'manifest.webmanifest'],[/defer src="([^"]*pwa.js)"/,'assets/js/pwa.js']]){const match=html.match(pattern);assert.ok(match,file);assert.equal(path.normalize(path.join(path.dirname(file),match[1])),expected);}}
});

test('installation caches only the public offline page',async()=>{
  const {events,calls}=worker();let pending;events.install({waitUntil:p=>pending=p});await pending;
  assert.deepEqual(calls,[['cache','https://example.com/Mayma-Clocking/offline.html']]);
});

test('API reads, writes and unrelated URLs bypass the worker',()=>{
  const {events,calls}=worker();
  for(const request of [
    {method:'POST',mode:'cors',url:'https://project.supabase.co/rest/v1/rpc/submit_member_clock'},
    {method:'GET',mode:'cors',url:'https://project.supabase.co/rest/v1/members'},
    {method:'GET',mode:'cors',url:'https://example.com/Mayma-Clocking/assets/js/app.js'},
    {method:'GET',mode:'navigate',url:'https://example.com/another-app/'},
  ])events.fetch({request,respondWith:()=>assert.fail('Must not intercept '+request.url)});
  assert.equal(calls.length,0);
});

test('navigation uses live network; failures show a non-clockable notice',async()=>{
  for(const online of [true,false]){const {events}=worker({online});let response;
    events.fetch({request:{method:'GET',mode:'navigate',url:'https://example.com/Mayma-Clocking/pages/member/clocking/index.html'},respondWith:p=>response=p});
    assert.equal(await (await response).text(),online?'live page':'offline notice');
  }
});

test('missing fallback cache returns a clear 503 response',async()=>{
  const {events}=worker({online:false,cached:false});let response;
  events.fetch({request:{method:'GET',mode:'navigate',url:'https://example.com/Mayma-Clocking/'},respondWith:p=>response=p});
  const result=await response;assert.equal(result.status,503);assert.match(await result.text(),/Clocking needs an internet connection/);
});

test('activation removes only older offline caches for this app scope',async()=>{
  const {events,calls}=worker();let pending;events.activate({waitUntil:p=>pending=p});await pending;
  assert.deepEqual(calls.filter(([action])=>action==='delete'),[['delete','avilonx-offline:/Mayma-Clocking/:old']]);
});
