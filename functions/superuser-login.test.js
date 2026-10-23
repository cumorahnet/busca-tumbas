"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const {hashPassword} = require("./superuser-password");
class HttpsError extends Error {constructor(code,message){super(message);this.code=code;}}
function harness(record, count=0, eligible=true, patch={}) {
  const issued=[];
  const refs={};
  const db={collection:name=>({doc:uid=>{
    const ref={name,uid,get:async()=>({exists:!!record,data:()=>record})};refs[name]=ref;return ref;
  }}),runTransaction:async fn=>fn({get:async()=>({exists:true,data:()=>({count,until:Date.now()+60000})}),set:(_ref,data)=>{count=data.count;}})};
  const auth={getUserByEmail:async email=>{
    assert.equal(email,"buscatumbas@cumorahnet.com");
    if (patch.missing) throw Object.assign(Error(),{code:"auth/user-not-found"});
    return {uid:"same-user",disabled:false,emailVerified:true,customClaims:{platform_admin:eligible},...patch};
  },createCustomToken:async(uid,claims)=>{issued.push({uid,claims});return "custom-token";}};
  const modules={"firebase-functions/v2/firestore":{onDocumentWrittenWithAuthContext:(_options,handler)=>handler},"firebase-functions/v2/https":{onRequest:handler=>handler,onCall:(_options,fn)=>fn,HttpsError},"firebase-functions/params":{defineSecret:()=>({})},"firebase-functions/v2":{setGlobalOptions:()=>{}},"firebase-admin/app":{initializeApp:()=>{}},"firebase-admin/firestore":{getFirestore:()=>db,FieldValue:{}},"firebase-admin/storage":{getStorage:()=>({bucket:()=>({})})},"firebase-admin/auth":{getAuth:()=>auth},"./superuser-password":require("./superuser-password")};
  const context={exports:{},require:name=>modules[name] || (["./account-profile", "./user-audit", "./record-writes", "./duplicates", "./tomb-history", "./photo-download", "./public-catalog"].includes(name) ? require(name) : undefined)};vm.createContext(context);
  vm.runInContext(fs.readFileSync(__dirname+"/handlers.js","utf8"),context);
  return {login:context.exports.autorizarSuperusuario,issued};
}
const request=password=>({data:{email:"buscatumbas@cumorahnet.com",password},rawRequest:{ip:"127.0.0.1"}});
test("correct superuser password issues a token without a previous user session",async()=>{
  const password="Independent-super-password-123";
  const {login,issued}=harness(await hashPassword(password));
  assert.equal((await login(request(password))).token,"custom-token");
  assert.equal(issued[0].uid,"same-user");
  assert.equal(issued[0].claims.superuser_session,true);
  assert.ok(issued[0].claims.superuser_until>Date.now()/1000);
});
test("disabled, unverified and unknown accounts are denied without revealing identity",async()=>{
  const record=await hashPassword("Independent-super-password-123");
  for (const patch of [{disabled:true},{emailVerified:false},{missing:true}]) {
    const {login,issued}=harness(record,0,true,patch);
    await assert.rejects(login(request("Independent-super-password-123")),{code:"permission-denied",message:"Correo o contraseña de superusuario incorrectos."});
    assert.equal(issued.length,0);
  }
});
test("malformed requests and exhausted IP limits cannot issue tokens",async()=>{
  const {login,issued}=harness(null,20);
  await assert.rejects(login({}),{code:"invalid-argument"});
  await assert.rejects(login(request("Independent-super-password-123")),{code:"resource-exhausted"});
  assert.equal(issued.length,0);
});
test("wrong password, missing configuration, excess attempts and ineligible account never issue tokens",async()=>{
  const record=await hashPassword("Independent-super-password-123");
  for(const [credential,count,eligible,code] of [[record,0,true,"permission-denied"],[null,0,true,"permission-denied"],[record,5,true,"resource-exhausted"],[record,0,false,"permission-denied"]]) {
    const {login,issued}=harness(credential,count,eligible);
    await assert.rejects(login(request("Incorrect-super-password-123")),{code});
    assert.equal(issued.length,0);
  }
});
