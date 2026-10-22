"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const factory = require("./account-profile");
function setup({fail = false, existing = false} = {}) {
  const writes = [];
  const ref = {collection: () => ({doc: () => ({id:"history"})})};
  const api = factory({db:{collection: name => {
    assert.ok(["_accountProfiles","_userAudit"].includes(name));
    return {doc: uid => {assert.equal(uid, "member"); return ref;}};
  }, runTransaction: async callback => {
    const pending = [];
    const result = await callback({get:async () => ({data:() => existing ? {displayName:"Nuevo Nombre",phone:"5512345678",municipality:"Ajacuba",state:"Hidalgo",country:"México",termsAcceptedAt:"date"} : {displayName:"Anterior"}}),
      set: (target, data) => pending.push({target, data})});
    if (fail) throw Error("Transaction failed");
    writes.push(...pending);
    return result;
  }}, FieldValue:{serverTimestamp:() => "server-time"},
  HttpsError:class extends Error {constructor(code,message) {super(message);this.code=code;}},
  requireVerified:request => {if (!request.auth) throw Error("unauthenticated");return request.auth.uid;},
  setClaims:async (uid, claims) => {assert.equal(uid,"member");assert.equal(claims.profile_complete,true);},
  getUser:async uid => {assert.equal(uid,"member");return {displayName:"Anterior",email:"member@example.com"};}});
  const data = {displayName:"Nuevo Nombre", phone:"5512345678", municipality:"Ajacuba", state:"Hidalgo", country:"México",termsAccepted:true};
  return {api,writes,request:{auth:{uid:"member"},data}};
}
test("profile and exact before/after audit are committed together for the authenticated user", async () => {
  const s=setup();
  s.request.data.uid="victim";
  await assert.rejects(s.api.update(s.request), {code:"invalid-argument"});
  delete s.request.data.uid;
  const result=await s.api.update(s.request);
  assert.equal(result.saved,true);
  assert.equal(s.writes.length,3);
  assert.equal(s.writes[1].data.actorId,"member");
  assert.deepEqual(s.writes[1].data.changes[0],{field:"displayName",before:"Anterior",after:"Nuevo Nombre"});
});
test("empty names, oversized fields and anonymous changes are rejected", async () => {
  for (const change of [{displayName:" "},{phone:"x".repeat(41)},{country:42},{municipality:""},{state:""},{country:""},{termsAccepted:false}]) {
    const s=setup();Object.assign(s.request.data,change);
    await assert.rejects(s.api.update(s.request));assert.equal(s.writes.length,0);
  }
  const s=setup();delete s.request.auth;
  await assert.rejects(s.api.update(s.request));assert.equal(s.writes.length,0);
});
test("failed transactions do not leave an unaudited profile", async () => {
  const s=setup({fail:true});
  await assert.rejects(s.api.update(s.request));assert.equal(s.writes.length,0);
});
test("unchanged profile produces no spurious history entry", async () => {
  const s=setup({existing:true});
  assert.equal((await s.api.update(s.request)).saved,false);assert.equal(s.writes.length,0);
});
