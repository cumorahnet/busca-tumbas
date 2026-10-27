"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const config = require("./monetization-config.json");
function setup(options = {}) {
  let now = Date.parse("2026-10-20T12:00:00-06:00");
  let stored = {};
  const policy = {...config};
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const documents = name => name === "tumbas" ? options.tombs || Array.from({length:20}, (_,i)=>({id:String(i)})) : options.cemeteries || [];
  const db = {collection: name => ({where() { return this; }, get: async () => ({docs: documents(name), size:documents(name).length}), doc: () => ({})}),
    runTransaction: async fn => fn({get: async () => ({exists: true, data:()=>stored}), set: (_ref, data) => {stored={...stored,...data};}})};
  const modules = {
    "./admin-console":require("./admin-console"),
    "./account-profile":require("./account-profile"), "./user-audit":()=>({run:(_operation,request,handler)=>handler(request)}),
    "./tomb-history":require("./tomb-history"), "./photo-download":require("./photo-download"), "./public-catalog":require("./public-catalog"),
    "./record-writes": () => ({}), "./superuser-password": {elevated: token => token.platform_admin === true}, "./monetization-config.json": policy,
    "firebase-functions/v2/firestore": {onDocumentWrittenWithAuthContext: (_options, handler) => handler},
    "firebase-functions/v2/https": {onRequest: handler => handler, onCall: (_options, handler) => handler, HttpsError},
    "firebase-functions/params": {defineSecret: () => ({})}, "firebase-functions/v2": {setGlobalOptions() {}},
    "firebase-admin/app": {initializeApp() {}}, "firebase-admin/firestore": {getFirestore:()=>db,FieldValue:{serverTimestamp:()=>new Date(now)}},
    "firebase-admin/storage": {getStorage:()=>({bucket:()=>({})})}, "firebase-admin/auth": {getAuth:()=>({getUser:async()=>({metadata:{creationTime: options.createdAt}})})}
  };
  const ctx={exports:{},require:name=>{if(!(name in modules))throw Error(name);return modules[name];},Date:class extends Date {static now(){return now;}}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+"/handlers.js","utf8"),ctx);
  const request={auth:{uid:"a".repeat(28),token:{email_verified:true,profile_complete:true}},data:{uid:"b".repeat(28),days:30}};
  return {ctx,request,policy,setNow:value=>{now=Date.parse(value);},stored:()=>stored};
}
test("launch includes January 1 and blocks monetization even if switches are enabled early",()=>{
  const s=setup();assert.equal(config.launchEndsAt,"2027-01-02T00:00:00-06:00");
  s.policy.adsEnabled=s.policy.plusSalesEnabled=true;
  assert.equal(s.ctx.getMonetizationPolicy().launchActive,true);assert.equal(s.ctx.getMonetizationPolicy().adsEnabled,false);assert.equal(s.ctx.getMonetizationPolicy().plusSalesEnabled,false);
  s.setNow(config.launchEndsAt);assert.equal(s.ctx.getMonetizationPolicy().launchActive,false);assert.equal(s.ctx.getMonetizationPolicy().adsEnabled,true);
});

const datedTombs = (count, timestamp) => Array.from({length:count}, (_, i) => ({id:String(i), data:()=>({status:"published",timestamp:new Date(timestamp)})}));
test("50 distinct first-month contributions earn one year from the actual 50th contribution",async()=>{
  const tombs = datedTombs(49,"2026-10-10T12:00:00Z");
  const s=setup({createdAt:"2026-10-01T12:00:00Z",tombs});
  let result=await s.ctx.exports.obtenerEstadoBeneficios(s.request);
  assert.equal(result.firstMonthReward.count,49);assert.equal(result.firstMonthReward.qualified,false);
  tombs.push(...datedTombs(1,"2026-10-15T12:00:00Z").map(doc=>({...doc,id:"fiftieth"})));
  result=await s.ctx.exports.obtenerEstadoBeneficios(s.request);
  assert.equal(result.firstMonthReward.count,50);assert.equal(result.firstMonthReward.newlyGranted,true);
  assert.equal(result.firstMonthReward.adFreeUntil,"2027-10-15T12:00:00.000Z");
  s.setNow("2027-02-01T00:00:00Z");s.policy.adsEnabled=true;
  result=await s.ctx.exports.obtenerEstadoBeneficios(s.request);
  assert.equal(result.adFree,true);assert.equal(result.source,"first-month");assert.equal(result.firstMonthReward.newlyGranted,false);
  tombs.pop();result=await s.ctx.exports.obtenerEstadoBeneficios(s.request);
  assert.equal(result.firstMonthReward.adFreeUntil,"2027-10-15T12:00:00.000Z");
});

test("the first month excludes the deadline, future, rejected, pre-account and undated records",async()=>{
  const tombs=datedTombs(49,"2026-10-10T12:00:00Z");
  for(const [id,data] of Object.entries({boundary:{timestamp:new Date("2026-11-01T12:00:00Z")},before:{timestamp:new Date("2026-09-30T12:00:00Z")},future:{timestamp:new Date("2026-10-25T12:00:00Z")},rejected:{status:"rejected",timestamp:new Date("2026-10-15T12:00:00Z")},undated:{}}))tombs.push({id,data:()=>data});
  const s=setup({createdAt:"2026-10-01T12:00:00Z",tombs});
  const result=await s.ctx.exports.obtenerEstadoBeneficios(s.request);
  assert.equal(result.firstMonthReward.count,49);assert.equal(result.firstMonthReward.qualified,false);
});

test("approved places combine with deduplicated tombs; month and year clamp at calendar boundaries",async()=>{
  const s=setup({createdAt:"2026-01-31T12:00:00Z",tombs:datedTombs(49,"2026-02-02T12:00:00Z"),cemeteries:[{id:"place",data:()=>({createdAt:new Date("2026-02-10T12:00:00Z")})}]});
  s.setNow("2026-03-01T00:00:00Z");const result=await s.ctx.exports.obtenerEstadoBeneficios(s.request);
  assert.equal(result.firstMonthReward.count,50);assert.equal(result.firstMonthReward.deadline,"2026-02-28T12:00:00.000Z");
  assert.equal(result.firstMonthReward.adFreeUntil,"2027-02-10T12:00:00.000Z");
  assert.equal(new Date(s.ctx.addCalendarMonths(Date.parse("2028-02-29T12:00:00Z"),12)).toISOString(),"2029-02-28T12:00:00.000Z");
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
