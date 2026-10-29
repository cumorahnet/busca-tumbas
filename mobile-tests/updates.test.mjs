import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync('mobile/updates.js','utf8');
function setup({remote={mayor:2,menor:57},host='buscatumbas.lat',offline=false}={}){
 const events={},requests=[],navigations=[],notices=[];const location={hostname:host,origin:'https://'+host,pathname:'/',search:'?x=1',hash:'#place',href:'https://'+host+'/?x=1#place',replace:u=>navigations.push(u)};
 const context={APP_VERSION:'v2.56.0',URL,AbortSignal,console,navigator:{onLine:!offline},fetch:async(url,options)=>{requests.push({url,options});return{ok:true,json:async()=>remote};},window:{location,confirm:()=>false,addEventListener:(n,f)=>events[n]=f},document:{visibilityState:'visible',addEventListener:(n,f)=>events[n]=f,body:{append:n=>notices.push(n)},createElement:()=>({style:{},setAttribute(){},append(...children){this.children=children;}})}};
 vm.runInNewContext(code,context);return {context,events,requests,navigations,notices};
}
const flush=()=>new Promise(r=>setImmediate(r));
test('PWA launch stays at the root of its installation origin and navigations bypass cache',()=>{
 const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest'));
 assert.equal(new URL(manifest.start_url,'https://buscatumbas.lat/manifest.webmanifest').href,'https://buscatumbas.lat/');
 assert.equal(manifest.id,'/');assert.equal(manifest.scope,'/');
 const version=JSON.parse(fs.readFileSync('version.json','utf8'));
 for(const file of ['index.html','www/index.html'])assert.ok(fs.readFileSync(file,'utf8').includes(version.mayor+'.'+version.menor+'.0'));
 assert.ok(!JSON.parse(fs.readFileSync('capacitor.config.json')).server);
 assert.ok(fs.readFileSync('sw.js','utf8').includes("fetch(event.request, {cache: 'no-store'})"));
});
test('new publication offers an update without reloading unsaved work',async()=>{
 const s=setup();await flush();assert.equal(s.requests[0].url,'https://buscatumbas.lat/version.json');assert.equal(s.requests[0].options.cache,'no-store');assert.equal(s.notices.length,1);assert.equal(s.navigations.length,0);
 const update=s.notices[0].children[1];update.onclick();assert.equal(s.navigations.length,0);s.context.window.confirm=()=>true;update.onclick();assert.equal(s.navigations[0],'https://buscatumbas.lat/?x=1&app_version=2.57#place');
});
test('resume rechecks once visible without duplicate notices',async()=>{
 const s=setup();await flush();s.context.document.visibilityState='hidden';await s.events.visibilitychange();assert.equal(s.requests.length,1);s.context.document.visibilityState='visible';await s.events.visibilitychange();assert.equal(s.requests.length,2);assert.equal(s.notices.length,1);
});
test('current or older publications, offline state and local bundles do not trigger reloads',async()=>{
 for(const options of [{remote:{mayor:2,menor:56}},{remote:{mayor:2,menor:55}},{remote:{mayor:'2',menor:57}},{offline:true},{host:'localhost'}]){const s=setup(options);await flush();assert.equal(s.notices.length,0);assert.equal(s.navigations.length,0);}
});
test('legacy hosting addresses migrate to the canonical domain preserving navigation',()=>{
 const s=setup({host:'buscatumbas-2e7cc.web.app'});assert.equal(s.navigations[0],'https://buscatumbas.lat/?x=1#place');assert.equal(s.requests.length,0);
});
