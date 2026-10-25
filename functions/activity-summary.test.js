"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const {isActivity,describeActivity,meaningfulChanges}=require('./activity-summary');
const factory=require('./user-audit');
const change=(field,after,before=null)=>({field,before,after});
const entry=(target,action,changes)=>({source:'database',target,action,changes});
test('timestamps, normalized fields and read receipts do not become personal activity',()=>{
 for(const target of ['_entitlements/user','tumbas/t','correction_requests/c']){
  assert.equal(isActivity(entry(target,'updated',[change('updatedAt','new'),change('readBy',['user']),change('nombre_finado_lower','pedro')])),false);
 }
 assert.equal(isActivity(entry('_entitlements/user','updated',[change('tier','plus')])),true);
});
test('contributions, deletions and location edits identify the actual subject',()=>{
 assert.equal(describeActivity(entry('tumbas/t','created',[change('nombre_finado','Pedro')])),'Se aportó la tumba de Pedro');
 assert.equal(describeActivity(entry('tumbas/t','deleted',[change('nombre_finado',null,'Pedro')])),'Se eliminó la tumba de Pedro');
 assert.equal(describeActivity(entry('tumbas/t','updated',[change('geolocation',{latitude:20,longitude:-103})]),{nombre_finado:'Pedro'}),'Se completó la ubicación GPS de la tumba de Pedro');
 assert.equal(describeActivity(entry('tumbas/t/photos/p','created',[change('storagePath','path')]),{nombre_finado:'Pedro'}),'Se agregó una fotografía a la tumba de Pedro');
 for(const [placeType,label] of [['cemetery','el panteón'],['church','la iglesia'],['hospital','el hospital'],['convent','el convento'],['other','el lugar']]){
  assert.equal(describeActivity(entry('cemeteries/c','created',[change('name','San José'),change('placeType',placeType)])),`Se aportó ${label} San José`);
 }
});
test('suggestions explain what was proposed and failures never claim success',()=>{
 const correction=entry('correction_requests/c','created',[change('tombName','Pedro'),change('description','Corregir la fecha a 1980')]);
 assert.equal(describeActivity(correction),'Se sugirió una corrección sobre Pedro: «Corregir la fecha a 1980»');
 const failed={source:'operation',action:'crearAportacionTumba',status:'failed',changes:[]};
 assert.equal(isActivity(failed),true);assert.equal(describeActivity(failed),'No se pudo registrar una tumba');
 assert.equal(isActivity({...failed,status:'completed'}),false);
 assert.equal(meaningfulChanges(entry('tumbas/t','updated',[change('name','Nuevo'),change('updatedAt','date')])).length,1);
});
function listHarness(raw){
 const contexts={'tumbas/pedro':{nombre_finado:'Pedro'}};let reads=0;
 function ref(path,id){return {id,get:async()=>{reads++;return {id,exists:!!contexts[path+'/'+id],data:()=>contexts[path+'/'+id]};}};}
 function collection(path){let offset=0,limit=100;const q={doc:id=>({id,collection:name=>collection(path+'/'+id+'/'+name),get:async()=>({id,exists:raw.some(e=>e.id===id)})}),orderBy:()=>q,limit:n=>{limit=n;return q;},startAfter:doc=>{offset=raw.findIndex(e=>e.id===doc.id)+1;return q;},get:async()=>({docs:raw.slice(offset,offset+limit).map(e=>({id:e.id,data:()=>e})),size:Math.min(limit,raw.length-offset)})};
 if(!path.startsWith('_userAudit'))return {doc:id=>ref(path,id)};return q;}
 const api=factory({db:{collection},FieldValue:{},HttpsError:class extends Error{},requireUser:r=>r.auth.uid,requireAdmin:()=>{throw Error('Forbidden');}});
 return {api,reads:()=>reads};
}
test('history passes technical pages, enriches old edits and returns only useful changes',async()=>{
 const noise=Array.from({length:120},(_,i)=>({id:'noise'+i,...entry('_entitlements/user','updated',[change('updatedAt','date')])}));
 const h=listHarness([...noise,{id:'real',...entry('tumbas/pedro','updated',[change('geolocation',{latitude:20,longitude:-103}),change('updatedAt','date')])}]);
 const result=await h.api.list({auth:{uid:'user'},data:{}});
 assert.equal(result.entries.length,1);assert.equal(result.entries[0].summary,'Se completó la ubicación GPS de la tumba de Pedro');assert.equal(result.entries[0].changes.length,1);assert.equal(result.after,null);assert.equal(h.reads(),1);
});
test('filtered pagination preserves the next useful event and bounds scanning of noise',async()=>{
 const rows=Array.from({length:51},(_,i)=>({id:'event'+i,...entry('tumbas/pedro','created',[change('nombre_finado','Pedro')])}));
 let h=listHarness(rows);const first=await h.api.list({auth:{uid:'user'},data:{}});assert.equal(first.entries.length,50);assert.equal(first.after,'event49');
 const next=await h.api.list({auth:{uid:'user'},data:{after:first.after}});assert.equal(next.entries.length,1);assert.equal(next.entries[0].id,'event50');assert.equal(next.after,null);
 h=listHarness(Array.from({length:501},(_,i)=>({id:'noise'+i,...entry('_entitlements/user','updated',[change('updatedAt','date')])})));
 const bounded=await h.api.list({auth:{uid:'user'},data:{}});assert.equal(bounded.entries.length,0);assert.equal(bounded.after,'noise499');
});
test('failed operations cannot use guessed target IDs to retrieve private record names',async()=>{
 const h=listHarness([{id:'failed',source:'operation',action:'crearAportacionTumba',status:'failed',target:'pedro',changes:[]}]);
 const result=await h.api.list({auth:{uid:'user'},data:{}});assert.equal(h.reads(),0);assert.ok(!result.entries[0].summary.includes('Pedro'));
});
