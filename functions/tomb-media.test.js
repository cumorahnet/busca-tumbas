"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const factory = require("./tomb-media");
class HttpsError extends Error {constructor(code,message){super(message);this.code=code;}}
function setup(location=null, suspended=false) {
  const record={nombre_finado:"Original",fecha_defuncion:"1980",contributorId:"owner",imageUrl:"original-photo",geolocation:location};
  const rows=new Map([["tumbas/tomb",record]]);
  if(suspended)rows.set("_moderation/visitor",{suspendedUntil:{toMillis:()=>Date.now()+60000}});
  const ref=path=>({path,collection:name=>({doc:id=>ref(`${path}/${name}/${id}`)})});
  let queue=Promise.resolve();
  const db={collection:name=>({doc:id=>ref(`${name}/${id}`)}),runTransaction:fn=>{
    const run=queue.then(()=>fn({get:async reference=>({exists:rows.has(reference.path),data:()=>rows.get(reference.path)}),
      update:(reference,patch)=>rows.set(reference.path,{...rows.get(reference.path),...patch}),
      create:(reference,value)=>rows.set(reference.path,value)}));queue=run.catch(()=>{});return run;
  }};
  const files=[];
  const handler=factory({db,bucket:{file:path=>({getMetadata:async()=>{files.push(path);return [{contentType:"image/jpeg",size:100}];}})},
    FieldValue:{serverTimestamp:()=>"now"},HttpsError,requireUser:request=>{if(!request.auth)throw new HttpsError("unauthenticated","login");return request.auth.uid;}});
  return {rows,files,run:data=>handler({auth:{uid:"visitor",token:{name:"Visitante"}},data:{recordId:"tomb",...data}})};
}
test("another user adds photo without modifying identity, original photo or authorship",async()=>{
  const s=setup();const before={...s.rows.get("tumbas/tomb")};
  await s.run({photoId:"photo1"});await s.run({photoId:"photo1"});
  assert.deepEqual(s.rows.get("tumbas/tomb"),before);
  assert.equal(s.rows.get("tumbas/tomb/photos/photo1").contributorId,"visitor");
  assert.equal(s.files[0],"tomb_extra_images/tomb/visitor/photo1/image.jpg");
  assert.equal(s.rows.size,2);
});
test("only one simultaneous location contribution succeeds, including coordinates zero",async()=>{
  const s=setup();
  const results=await Promise.allSettled([s.run({geolocation:{latitude:0,longitude:0}}),s.run({geolocation:{latitude:1,longitude:2}})]);
  assert.equal(results.filter(item=>item.status==="fulfilled").length,1);
  assert.deepEqual(s.rows.get("tumbas/tomb").geolocation,{latitude:0,longitude:0});
  assert.equal(s.rows.get("tumbas/tomb").nombre_finado,"Original");
});
test("camera photo stores GPS and completes missing tomb location atomically",async()=>{
  const s=setup();const geolocation={latitude:19.5,longitude:-99.2};
  const capture={source:"camera",capturedAt:Date.now(),accuracy:7};
  await s.run({photoId:"camera",geolocation,capture});
  assert.deepEqual(s.rows.get("tumbas/tomb").geolocation,geolocation);
  assert.deepEqual(s.rows.get("tumbas/tomb/photos/camera").geolocation,geolocation);
  assert.deepEqual(s.rows.get("tumbas/tomb/photos/camera").capture,capture);
  assert.equal(s.rows.get("tumbas/tomb").nombre_finado,"Original");
});

test("camera GPS belongs to the photo and never replaces an existing tomb location",async()=>{
  const original={latitude:1,longitude:2};const s=setup(original);
  await s.run({photoId:"camera",geolocation:{latitude:3,longitude:4},capture:{source:"camera",capturedAt:Date.now()}});
  assert.deepEqual(s.rows.get("tumbas/tomb").geolocation,original);
  assert.deepEqual(s.rows.get("tumbas/tomb/photos/camera").geolocation,{latitude:3,longitude:4});
});

test("existing location, invalid coordinates, identity fields and suspension are rejected",async()=>{
  await assert.rejects(setup({latitude:1,longitude:2}).run({geolocation:{latitude:2,longitude:3}}),{code:"already-exists"});
  for(const data of [{geolocation:{latitude:91,longitude:0}},{geolocation:{latitude:null,longitude:0}},{photoId:"p",nombre_finado:"Changed"},{photoId:"../foreign"}]) {
    await assert.rejects(setup().run(data),{code:"invalid-argument"});
  }
  await assert.rejects(setup(null,true).run({photoId:"p"}),{code:"permission-denied"});
});
