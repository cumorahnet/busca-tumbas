"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const factory = require("./admin-console");
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const request = data => ({auth:{uid:"admin",token:{name:"Administradora"}},data});
function setup() {
  const writes = [], calls = [];
  const ref = {get:async () => ({data:() => ({phone:"1234567",country:"México"})}),
    set:async data => writes.push(data), update:async data => writes.push(data), doc:() => ref, collection:() => ref};
  const db = {collection:() => ref};
  const auth = {getUser:async uid => ({uid,displayName:"Ana Pérez",disabled:false,customClaims:{}}),
    updateUser:async (...args) => calls.push(["update",...args]),
    deleteUser:async uid => calls.push(["delete",uid]), revokeRefreshTokens:async uid => calls.push(["revoke",uid])};
  const api = factory({db,auth,FieldValue:{serverTimestamp:() => "now"},HttpsError,
    requireAdmin:req => {if (req.auth?.uid !== "admin") throw new HttpsError("permission-denied","Admin only");}});
  return {api,auth,db,writes,calls};
}
test("all console operations enforce the administrator check before accessing data", async () => {
  const {api,calls,writes} = setup();
  for (const operation of Object.values(api)) await assert.rejects(operation({data:{}}), {code:"permission-denied"});
  assert.deepEqual(calls, []); assert.deepEqual(writes, []);
});
test("user search includes non-contributors, normalizes accents, and preserves page cursors", async () => {
  const {api,auth} = setup();
  auth.listUsers = async (limit, token) => {
    assert.equal(limit,50);
    return !token ? {users:[{uid:"one",displayName:"Other"}],pageToken:"next"} :
      {users:[{uid:"two",displayName:"José López",email:"jose@example.com",disabled:false,
        metadata:{creationTime:"Sun, 25 Oct 2026 12:00:00 GMT"}}],pageToken:"last"};
  };
  const result = await api.users(request({query:"jose",status:"active"}));
  assert.deepEqual(result.users.map(user => user.uid), ["two"]);
  assert.equal(result.after,"last");
  assert.equal(result.users[0].email,"jose@example.com");
  assert.equal(result.users[0].createdAt,"Sun, 25 Oct 2026 12:00:00 GMT");
});

test("account totals include every Auth page, including disabled accounts and non-contributors", async () => {
  const {api,auth} = setup();
  const cursors = [];
  auth.listUsers = async (limit, token) => {
    assert.equal(limit,1000); cursors.push(token);
    return token ? {users:[{uid:"suspended",disabled:true}]} :
      {users:[{uid:"no-contributions"},{uid:"admin"}],pageToken:"next"};
  };
  assert.equal(await api.countAccounts(request({})),3);
  assert.deepEqual(cursors,[undefined,"next"]);
});

test("empty Auth returns zero and an Auth failure cannot become a partial total", async () => {
  const {api,auth} = setup();
  auth.listUsers = async () => ({users:[]});
  assert.equal(await api.countAccounts(request({})),0);
  auth.listUsers = async (_limit, token) => {
    if (token) throw new Error("Auth unavailable");
    return {users:[{uid:"one"}],pageToken:"next"};
  };
  await assert.rejects(api.countAccounts(request({})), /Auth unavailable/);
});

test("admin statistics return the Auth total independently of contributions", async () => {
  const fs = require("node:fs"), vm = require("node:vm");
  const source = fs.readFileSync(__dirname + "/handlers.js", "utf8");
  const handler = source.slice(source.indexOf("exports.obtenerEstadisticasAdmin ="), source.indexOf("exports.eliminarRegistroAdmin ="));
  const empty = {size:0,forEach() {}};
  const query = {orderBy() {return this;},get:async () => empty};
  const context = {exports:{},onCall:(_options, fn) => fn,requireAdmin() {},
    db:{collection:() => query},adminConsole:{countAccounts:async req => {assert.equal(req.auth.uid,"admin");return 1234;}}};
  vm.runInNewContext(handler,context);
  const result = await context.exports.obtenerEstadisticasAdmin(request({}));
  assert.equal(result.totalAccounts,1234);
  assert.equal(result.totalContributors,0);
  assert.equal(result.totalRecords,0);
});
test("user scans are bounded and expose the continuation even when no matches exist", async () => {
  const {api,auth} = setup(); let calls=0;
  auth.listUsers = async () => ({users:[],pageToken:String(++calls)});
  const result = await api.users(request({query:"missing"}));
  assert.equal(calls,10); assert.equal(result.after,"10");
});
test("administrative accounts and the current account cannot be changed or deleted", async () => {
  const {api,auth,calls} = setup();
  for (const action of ["edit","suspend","restore","delete"]) {
    await assert.rejects(api.manageUser(request({uid:"admin",action})),{code:"failed-precondition"});
    auth.getUser = async uid => ({uid,customClaims:{platform_admin:true}});
    await assert.rejects(api.manageUser(request({uid:"another-admin",action})),{code:"failed-precondition"});
  }
  assert.equal(calls.length,0);
});
test("editing validates profile data, updates Auth and the profile, and records before/after changes", async () => {
  const {api,writes,calls} = setup();
  await assert.rejects(api.manageUser(request({uid:"member",action:"edit",name:""})),{code:"invalid-argument"});
  await api.manageUser(request({uid:"member",action:"edit",name:" Ana López ",phone:"7654321",country:"México",state:"Jalisco",municipality:"Guadalajara"}));
  assert.deepEqual(calls[0],["update","member",{displayName:"Ana López"}]);
  assert.ok(writes[0].changes.some(change => change.field === "phone" && change.before === "1234567" && change.after === "7654321"));
  assert.equal(writes[1].displayName,"Ana López");
  assert.equal(writes.at(-1).status,"completed");
});
test("deleting a user revokes access and removes only Auth, preserving contributions and audit", async () => {
  const {api,calls,writes} = setup();
  await api.manageUser(request({uid:"member",action:"delete"}));
  assert.deepEqual(calls,[["update","member",{disabled:true}],["revoke","member"],["delete","member"]]);
  assert.equal(writes[0].action,"admin_user_delete");
  assert.equal(writes.at(-1).status,"completed");
});
test("record histories are scoped to the requested entity and redact secrets", async () => {
  const {api,db} = setup(); const steps=[];
  const query = {where:(...args) => {steps.push(args);return query;},orderBy:() => query,limit:() => query,
    get:async () => ({size:1,docs:[{id:"event",data:() => ({createdAt:{toMillis:() => 1000},secret:"private",changes:[]})}]})};
  db.collection = name => {assert.equal(name,"_databaseAudit");return query;};
  const result = await api.history(request({recordType:"cemetery",recordId:"cemetery1"}));
  assert.deepEqual(steps,[["target","==","cemeteries/cemetery1"]]);
  assert.equal(result.entries[0].secret,"[dato protegido]");
  assert.equal(result.entries[0].createdAt,"1970-01-01T00:00:01.000Z");
});

for (const linked of [true,false]) test(`cemetery deletion ${linked ? "blocks linked tombs" : "allows an unlinked cemetery"} inside its deletion transaction`, async () => {
  const fs = require("node:fs"), vm = require("node:vm");
  const source = fs.readFileSync(__dirname + "/handlers.js","utf8");
  const handler = source.slice(source.indexOf("exports.eliminarMiAportacion ="),source.indexOf("exports.actualizarAportacionTumba ="));
  let removed=false, read=false;
  const ref = {get:async () => ({exists:true,data:() => ({name:"Panteón"})})};
  const query = {where:(field,op,id) => {assert.equal(field,"cemetery_id");assert.equal(id,"cem1");return query;},limit:() => query};
  const context = {exports:{},onCall:(_options,fn) => fn,HttpsError,requireAdmin:() => {},
    db:{collection:name => name === "tumbas" ? query : {doc:() => ref}},
    userAudit:{remove:async (_ref,_request,guard) => {
      await guard({get:async actual => {assert.equal(actual,query);read=true;return {empty:!linked};}});
      removed=true;
    }}};
  vm.runInNewContext(handler,context);
  const operation = context.exports.eliminarMiAportacion(request({recordType:"cemetery",recordId:"cem1"}));
  if (linked) await assert.rejects(operation,{code:"failed-precondition"}); else await operation;
  assert.equal(read,true);assert.equal(removed,!linked);
});
