"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const factory = require("./user-audit");
class HttpsError extends Error {constructor(code,message) {super(message);this.code=code;}}
function setup() {
  const rows = new Map();let sequence = 0;
  const ref = path => ({path,id:path.split("/").at(-1),collection:name=>collection(path+"/"+name),
    get:async()=>({id:path.split("/").at(-1),exists:rows.has(path),data:()=>rows.get(path)}),
    set:async data=>rows.set(path,data), update:async data=>rows.set(path,{...rows.get(path),...data})});
  function collection(path) {
    const query = {doc:id=>ref(path+"/"+(id || "id"+(++sequence))),orderBy:()=>query,limit:()=>query,
      get:async()=>({size:0,docs:[]})};return query;
  }
  const db = {collection,batch:()=>({set:(target,data)=>rows.set(target.path,data),commit:async()=>{}})};
  const api=factory({db,HttpsError,FieldValue:{serverTimestamp:()=>new Date("2026-10-22")},
    requireUser:request=>{if(!request.auth)throw new HttpsError("unauthenticated","Login");return request.auth.uid;},
    requireAdmin:request=>{if(!request.auth.admin)throw new HttpsError("permission-denied","Admin");}});
  const request={auth:{uid:"editor",token:{name:"Editora"}},data:{recordId:"record"}};
  const event=(before,after,id="event")=>({id,time:"2026-10-22T12:00:00Z",params:{collectionId:"tumbas",documentId:"record"},
    authType:"unknown",authId:"editor",data:{before:{exists:!!before,data:()=>before},after:{exists:!!after,data:()=>after}}});
  return {api,rows,request,event,ref};
}
test("database changes retain exact before/after values for actor and owner, with retry deduplication",async()=>{
  const s=setup();const event=s.event({userId:"owner",name:"Anterior"},{userId:"owner",name:"Nuevo"});
  await s.api.capture(event);await s.api.capture(event);
  assert.equal(s.rows.size,3);
  const entry=[...s.rows.values()][0];
  assert.deepEqual(entry.changes,[{field:"name",before:"Anterior",after:"Nuevo"}]);
  assert.equal(entry.actorId,"editor");assert.equal(entry.target,"tumbas/record");
  assert.ok([...s.rows.keys()].some(key=>key.startsWith("_userAudit/owner/events/")));
});
test("a user cannot request someone else's history; administrators can",async()=>{
  const s=setup();
  await assert.rejects(s.api.list({...s.request,data:{uid:"owner"}}),{code:"permission-denied"});
  assert.equal((await s.api.list({...s.request,auth:{...s.request.auth,admin:true},data:{uid:"owner"}})).uid,"owner");
  await assert.rejects(s.api.list({data:{uid:"owner"}}),{code:"unauthenticated"});
});
test("audit sinks do not recurse, nested histories are excluded and secrets are protected",async()=>{
  const s=setup();const event=s.event(null,{passwordHash:"private",salt:"private-salt",uid:"owner"});
  event.params.collectionId="_superuserCredentials";
  await s.api.capture(event);
  assert.doesNotMatch(JSON.stringify([...s.rows.values()]),/private-salt|"private"/);
  const count=s.rows.size;
  event.params.collectionId="_databaseAudit";await s.api.capture(event);assert.equal(s.rows.size,count);
  event.params={collectionId:"tumbas",documentId:"record",subcollectionId:"history",childId:"entry"};
  await s.api.capture(event,true);assert.equal(s.rows.size,count);
});
test("operations persist authenticated actor before a mutation, and failures remain failures",async()=>{
  const s=setup();
  await assert.rejects(s.api.run("delete",s.request,async()=>{assert.equal(s.rows.size,1);throw new HttpsError("denied","Denied");}));
  const entry=[...s.rows.values()][0];assert.equal(entry.status,"failed");assert.equal(entry.actorId,"editor");
});
test("deletions save the original values and trusted administrator in the same batch",()=>{
  const s=setup();const pending=[];
  s.api.addDeletion({set:(ref,data)=>pending.push({path:ref.path,data}),delete:ref=>pending.push({deleted:ref.path})},
    {ref:s.ref("tumbas/record"),data:()=>({userId:"owner",nombre_finado:"Original"})},s.request);
  assert.equal(pending.length,4);assert.equal(pending.at(-1).deleted,"tumbas/record");
  assert.equal(pending[0].data.actorId,"editor");
  assert.deepEqual(pending[0].data.changes.find(change=>change.field==="nombre_finado"),{field:"nombre_finado",before:"Original",after:null});
});
