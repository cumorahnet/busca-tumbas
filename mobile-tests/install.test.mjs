import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const script=fs.readFileSync('mobile/install.js','utf8');
function setup(options={}) {
 const handlers={},storage=options.storage||new Map(),nodes=new Map(),calls=[];
 function node(id){if(!nodes.has(id))nodes.set(id,{hidden:false,disabled:false,open:false,textContent:'',attrs:{},events:{},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,v){this.events[k]=v},querySelector(){return this.label||(this.label={textContent:''})},showModal(){this.open=true;calls.push('dialog')},close(){this.open=false}});return nodes.get(id)}
 const actions=[node('action-auth'),node('action-header')];
 const media={matches:Boolean(options.standalone),addEventListener(k,v){this.change=v}};
 const ctx={console,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
  document:{visibilityState:'visible',addEventListener:(k,v)=>{handlers[k]=v},documentElement:{dataset:{temporaryInstall:options.enabled===false?'off':'on'}},getElementById:node,querySelectorAll:()=>actions},
  navigator:{userAgent:options.userAgent||(options.ios?'iPhone Safari':'Android Chrome'),platform:'',maxTouchPoints:0,standalone:Boolean(options.iosStandalone),serviceWorker:{register:(url,args)=>{calls.push(['worker',url,args.scope]);return Promise.resolve()}}},
  window:{isSecureContext:true,Capacitor:{isNativePlatform:()=>Boolean(options.native)},matchMedia:()=>media,addEventListener:(k,v)=>{handlers[k]=v},setTimeout:fn=>fn()}};
 vm.runInNewContext(script,ctx);return {handlers,storage,node,calls,actions,media};
}
function promptEvent(outcome='dismissed') {let prompts=0,prevented=0;return {preventDefault(){prevented++},async prompt(){prompts++},userChoice:Promise.resolve({outcome}),get prompts(){return prompts},get prevented(){return prevented}}}
test('desktop returning after uninstall keeps installation accessible without a native event',async()=>{
 const s=setup({userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome',storage:new Map([['buscatumbas_pwa_install_seen_v1','seen']])});
 s.handlers['buscatumbas:ready']();s.handlers.load();
 assert.ok(!s.calls.includes('dialog'));
 assert.ok(s.actions.every(b=>!b.hidden&&b.attrs['aria-hidden']==='false'));
 await s.actions[0].events.click();
 assert.equal(s.node('pwa-install-dialog').open,true);
 assert.equal(s.node('pwa-install-confirm').hidden,true);
 assert.match(s.node('pwa-install-instructions').textContent,/menú de tu navegador/);
 const event=promptEvent();s.handlers.beforeinstallprompt(event);
 await s.actions[1].events.click();assert.equal(event.prompts,1);
});
test('first mobile visit opens once without invoking native prompt; second visit keeps actions',()=>{
 const s=setup();s.handlers['buscatumbas:ready']();s.handlers.load();assert.equal(s.calls.filter(x=>x==='dialog').length,1);
 s.node('pwa-install-dismiss').events.click();assert.equal(s.node('pwa-install-dialog').open,false);
 const second=setup({storage:s.storage});second.handlers['buscatumbas:ready']();assert.ok(!second.calls.includes('dialog'));assert.ok(second.actions.every(b=>!b.hidden));
});
test('late native event survives dismissal and is only prompted from a user click',async()=>{
 const s=setup();s.handlers['buscatumbas:ready']();s.node('pwa-install-dismiss').events.click();
 const event=promptEvent();s.handlers.beforeinstallprompt(event);assert.equal(event.prevented,1);assert.equal(event.prompts,0);
 await s.actions[0].events.click();assert.equal(event.prompts,1);assert.equal(s.node('pwa-install-confirm').hidden,true);assert.ok(s.actions.every(b=>!b.hidden));
 await s.actions[1].events.click();assert.equal(event.prompts,1);assert.equal(s.node('pwa-install-dialog').open,true);
});
test('accepting and appinstalled hide all actions and dialogs',async()=>{
 const s=setup();s.handlers['buscatumbas:ready']();const event=promptEvent('accepted');s.handlers.beforeinstallprompt(event);
 await s.node('pwa-install-confirm').events.click();assert.ok(s.actions.every(b=>b.hidden));s.handlers.appinstalled();assert.equal(s.node('pwa-install-dialog').open,false);assert.ok(s.actions.every(b=>b.hidden));
});
test('Android Chrome recovers installation when returning after an interrupted install or uninstall',async()=>{
 for(const resume of [s=>s.handlers.visibilitychange(),s=>s.handlers.pageshow({persisted:true})]) {
  const s=setup();const event=promptEvent('accepted');s.handlers.beforeinstallprompt(event);
  await s.actions[0].events.click();assert.ok(s.actions.every(b=>b.hidden));
  resume(s);assert.ok(s.actions.every(b=>!b.hidden));
  s.handlers.appinstalled();assert.ok(s.actions.every(b=>b.hidden));
  resume(s);assert.ok(s.actions.every(b=>!b.hidden));
  await s.actions[0].events.click();assert.equal(s.node('pwa-install-dialog').open,true);
  s.media.matches=true;resume(s);s.media.change();assert.ok(s.actions.every(b=>b.hidden));
 }
});
test('iPhone provides manual instructions and never calls native prompt',async()=>{
 const s=setup({ios:true});s.handlers['buscatumbas:ready']();assert.match(s.node('pwa-install-instructions').textContent,/Compartir.*Agregar a pantalla/);assert.equal(s.node('pwa-install-confirm').hidden,true);
 const event=promptEvent();s.handlers.beforeinstallprompt(event);await s.actions[0].events.click();assert.equal(event.prompts,0);
});
test('installed web apps, iOS standalone, native Android and disabled bridge never show offers',()=>{
 for(const options of [{standalone:true},{iosStandalone:true},{native:true},{enabled:false}]) {
  const s=setup(options);s.handlers['buscatumbas:ready']?.();assert.ok(s.actions.every(b=>b.hidden));assert.ok(!s.calls.includes('dialog'));assert.ok(!s.calls.some(c=>Array.isArray(c)&&c[0]==='worker'));
 }
});
test('prompt errors fall back to instructions and a rejected event cannot be reused',async()=>{
 const s=setup();const event=promptEvent();event.prompt=async()=>{throw Error('unavailable')};s.handlers.beforeinstallprompt(event);
 await s.actions[0].events.click();assert.match(s.node('pwa-install-status').textContent,/no pudo/);assert.equal(s.node('pwa-install-dialog').open,true);assert.equal(s.node('pwa-install-confirm').hidden,true);
});
test('manifest icons have genuine PNG signatures and the declared sizes',()=>{
 const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
 for(const icon of manifest.icons){const png=fs.readFileSync(icon.src.split('?')[0]);assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(icon.sizes,png.readUInt32BE(16)+'x'+png.readUInt32BE(20));}
 assert.ok(manifest.icons.some(i=>i.sizes==='192x192'));assert.ok(manifest.icons.some(i=>i.sizes==='512x512'));
 const s=setup();assert.ok(s.calls.some(c=>Array.isArray(c)&&c[0]==='worker'&&c[1]==='sw.js'&&c[2]==='./'));
});
