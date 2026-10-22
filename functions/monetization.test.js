"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const config = require("./monetization-config.json");
function setup() {
  let now = Date.parse("2026-10-20T12:00:00-06:00");
  let stored = {};
  const policy = {...config};
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const db = {collection: name => ({where() { return this; }, get: async () => ({docs: name === "tumbas" ? Array.from({length:20}, (_,i)=>({id:String(i)})) : [], size:0}), doc: () => ({})}),
    runTransaction: async fn => fn({get: async () => ({exists: true, data:()=>stored}), set: (_ref, data) => {stored={...stored,...data};}})};
  const modules = {
    "./account-profile":require("./account-profile"), "./user-audit":()=>({run:(_operation,request,handler)=>handler(request)}),
    "./tomb-history":require("./tomb-history"), "./photo-download":require("./photo-download"), "./public-catalog":require("./public-catalog"),
    "./record-writes": () => ({}), "./superuser-password": {elevated: token => token.platform_admin === true}, "./monetization-config.json": policy,
    "firebase-functions/v2/firestore": {onDocumentWrittenWithAuthContext: (_options, handler) => handler},
    "firebase-functions/v2/https": {onRequest: handler => handler, onCall: (_options, handler) => handler, HttpsError},
    "firebase-functions/params": {defineSecret: () => ({})}, "firebase-functions/v2": {setGlobalOptions() {}},
    "firebase-admin/app": {initializeApp() {}}, "firebase-admin/firestore": {getFirestore:()=>db,FieldValue:{serverTimestamp:()=>new Date(now)}},
    "firebase-admin/storage": {getStorage:()=>({bucket:()=>({})})}, "firebase-admin/auth": {getAuth:()=>({getUser:async()=>({})})}
  };
  const ctx={exports:{},require:name=>{if(!(name in modules))throw Error(name);return modules[name];},Date:class extends Date {static now(){return now;}}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+"/index.js","utf8"),ctx);
  const request={auth:{uid:"a".repeat(28),token:{email_verified:true,profile_complete:true}},data:{uid:"b".repeat(28),days:30}};
  return {ctx,request,policy,setNow:value=>{now=Date.parse(value);},stored:()=>stored};
}
test("launch lasts 90 days and blocks monetization even if switches are enabled early",()=>{
  const s=setup();assert.equal((Date.parse(config.launchEndsAt)-Date.parse(config.launchStartsAt))/86400000,90);
  s.policy.adsEnabled=s.policy.plusSalesEnabled=true;
  assert.equal(s.ctx.getMonetizationPolicy().launchActive,true);assert.equal(s.ctx.getMonetizationPolicy().adsEnabled,false);assert.equal(s.ctx.getMonetizationPolicy().plusSalesEnabled,false);
  s.setNow(config.launchEndsAt);assert.equal(s.ctx.getMonetizationPolicy().launchActive,false);assert.equal(s.ctx.getMonetizationPolicy().adsEnabled,true);
});
test("expiry alone does not activate ads or Plus; invalid configuration stays disabled",()=>{
  const s=setup();s.setNow("2027-02-01T00:00:00-06:00");assert.equal(s.ctx.getMonetizationPolicy().adsEnabled,false);assert.equal(s.ctx.getMonetizationPolicy().plusSalesEnabled,false);
  s.policy.launchEndsAt="invalid";s.policy.adsEnabled=true;assert.equal(s.ctx.getMonetizationPolicy().adsEnabled,false);
});
test("launch keeps everyone ad-free and defers rewards until advertising actually begins",async()=>{
  const s=setup();let result=await s.ctx.exports.obtenerEstadoBeneficios(s.request);
  assert.equal(result.adFree,true);assert.equal(result.source,"launch");assert.equal(result.pendingRewardMonths,2);assert.equal(result.newlyGrantedMonths,0);assert.equal(s.stored().contributionMilestonesGranted,0);
  s.setNow("2027-02-01T00:00:00-06:00");result=await s.ctx.exports.obtenerEstadoBeneficios(s.request);assert.equal(result.source,"paused");assert.equal(result.pendingRewardMonths,2);
  s.policy.adsEnabled=true;result=await s.ctx.exports.obtenerEstadoBeneficios(s.request);assert.equal(result.adFree,true);assert.equal(result.newlyGrantedMonths,2);assert.equal(Date.parse(result.adFreeUntil)-Date.parse("2027-02-01T00:00:00-06:00"),60*86400000);
  result=await s.ctx.exports.obtenerEstadoBeneficios(s.request);assert.equal(result.newlyGrantedMonths,0);
});
test("Plus activation is blocked server-side until both switches and the grace date permit it",async()=>{
  const s=setup();s.request.auth.token.platform_admin=true;
  await assert.rejects(s.ctx.exports.activarPlusAdmin(s.request),{code:"failed-precondition"});
  s.setNow(config.launchEndsAt);s.policy.adsEnabled=true;await assert.rejects(s.ctx.exports.activarPlusAdmin(s.request),{code:"failed-precondition"});
  s.policy.plusSalesEnabled=true;const result=await s.ctx.exports.activarPlusAdmin(s.request);assert.ok(result.paidUntil);
});
