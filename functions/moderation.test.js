"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function setup(ownerClaims = {}, candidates = []) {
  const writes = [];
  const record = {userId: "owner", contributorId: "owner", nombre_finado: "Original", imageUrl: "photo"};
  const snapshot = {exists: true, data: () => record};
  const db = {collection: (collection) => ({path: collection, get: async () => ({docs: candidates}),
    doc: (id = "generated") => ({path: `${collection}/${id}`, get: async () => snapshot})}),
    runTransaction: async (callback) => callback({get: async (ref) => ref.path.includes("/") ? snapshot : {docs: candidates},
      set: (ref, data) => writes.push([ref.path, data]), update: (ref, data) => writes.push([ref.path, data])})};
  const modules = {
    "./account-profile":require("./account-profile"), "./user-audit":()=>({run:(_operation,request,handler)=>handler(request)}),
    "./superuser-password": require("./superuser-password"),
    "firebase-functions/v2/firestore": {onDocumentWrittenWithAuthContext: (_options, handler) => handler},
    "firebase-functions/v2/https": {onRequest: handler => handler, onCall: (_opts, callback) => callback, HttpsError},
    "firebase-functions/params": {defineSecret: () => ({})},
    "firebase-functions/v2": {setGlobalOptions: () => {}},
    "firebase-admin/app": {initializeApp: () => {}},
    "firebase-admin/firestore": {getFirestore: () => db, FieldValue: {serverTimestamp: () => "timestamp"}},
    "firebase-admin/storage": {getStorage:()=>({bucket:()=>({})})},
    "firebase-admin/auth": {getAuth: () => ({getUser: async () => ({customClaims: ownerClaims})})},
  };
  const ctx = {exports: {}, require: (name) => modules[name] || (["./record-writes", "./duplicates", "./similarity", "./tomb-history", "./photo-download", "./public-catalog"].includes(name) ? require(name) : undefined)};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(__dirname + "/handlers.js", "utf8"), ctx);
  const auth = {uid: "admin", token: {email_verified: true, profile_complete:true, platform_admin: true,
    superuser_session: true, superuser_until: Date.now() / 1000 + 60}};
  return {writes, record, editTomb: changes => ctx.exports.actualizarAportacionTumba({auth:{uid:"owner",token:{email_verified:true,profile_complete:true}},data:{recordId:"record",changes}}), run: (data, session = auth) => ctx.exports.gestionarAporteAdmin({auth: session,
    data: {recordType: "tomb", recordId: "record", note: "Dato incorrecto", ...data}})};
}
test("ordinary and expired sessions cannot moderate", async () => {
  const s = setup();
  await assert.rejects(s.run({action: "reject"}, {uid: "owner", token: {email_verified: true, profile_complete:true}}), {code: "permission-denied"});
  await assert.rejects(s.run({action: "reject"}, {uid: "admin", token: {email_verified: true, profile_complete:true,
    platform_admin: true, superuser_session: true, superuser_until: 1}}), {code: "permission-denied"});
  assert.equal(s.writes.length, 0);
});
test("edits preserve authorship and photo and atomically notify and audit", async () => {
  const s = setup();
  await s.run({action: "edit", changes: {nombre_finado: "Corregido"}});
  const update = s.writes.find(([path]) => path === "tumbas/record")[1];
  assert.equal(update.nombre_finado, "Corregido");
  assert.equal(update.userId, undefined);
  assert.equal(update.imageUrl, undefined);
  assert.ok(s.writes.some(([path, data]) => path.startsWith("correction_requests/") && data.tombOwnerId === "owner"));
  assert.ok(s.writes.some(([path, data]) => path.startsWith("_adminAudit/") && data.before.nombre_finado === "Original"));
  await assert.rejects(s.run({action: "edit", changes: {userId: "admin"}}), {code: "invalid-argument"});
});

test("administrative edits reject duplicate tombs and cemeteries before any write", async () => {
  const tomb = setup({}, [{id: "other", data: () => ({nombre_finado: "María Hernández", fecha_defuncion: "1990-11-27"})}]);
  await assert.rejects(tomb.run({action: "edit", changes: {nombre_finado: "MARIA HERNANDEZ", fecha_defuncion: "27 NOV 1990"}}), {code: "already-exists"});
  assert.equal(tomb.writes.length, 0);
  const cemetery = setup({}, [{id: "other", data: () => ({name: "Panteón Municipal", locality: "Centro"})}]);
  await assert.rejects(cemetery.run({recordType: "cemetery", action: "edit", changes: {name: "PANTEON MUNICIPAL", locality: "Centro"}}), {code: "already-exists"});
  assert.equal(cemetery.writes.length, 0);
});

test("both owner and admin edits detect the live spelling variant before writing", async () => {
  const candidates = [{id:"other",data:()=>({nombre_finado:"Marce Mociño Ramírez",fecha_defuncion:"16 de Agosto de 1982"})}];
  const changes = {nombre_finado:"Marce Muciño Ramírez",fecha_defuncion:"16 de Agosto de 1982"};
  const owner = setup({},candidates);
  assert.equal((await owner.editTomb(changes)).duplicate.id,"other");
  assert.equal(owner.writes.length,0);
  const admin = setup({},candidates);
  await assert.rejects(admin.run({action:"edit",changes}),{code:"already-exists"});
  assert.equal(admin.writes.length,0);
});
test("suspensions have bounded duration and can be lifted; administrative accounts protected", async () => {
  const s = setup();
  await s.run({action: "suspend", days: 7});
  const until = s.writes.find(([path]) => path === "_moderation/owner")[1].suspendedUntil;
  assert.ok(until.getTime() > Date.now() + 6 * 86400000);
  await assert.rejects(s.run({action: "suspend", days: 999}), {code: "invalid-argument"});
  const lift = setup();
  await lift.run({action: "lift"});
  assert.equal(lift.writes.find(([path]) => path === "_moderation/owner")[1].suspendedUntil.getTime(), 0);
  await assert.rejects(setup({platform_admin: true}).run({action: "suspend", days: 1}), {code: "failed-precondition"});
});
test("withdrawal is reversible and warnings do not modify the record", async () => {
  const s = setup();
  await s.run({action: "reject"});
  assert.equal(s.writes[0][1].status, "rejected");
  const restore = setup();
  await restore.run({action: "restore"});
  assert.equal(restore.writes.find(([path]) => path === "tumbas/record")[1].status, "published");
  const warn = setup();
  await warn.run({action: "warn"});
  assert.ok(warn.writes.every(([path]) => path !== "tumbas/record"));
  await assert.rejects(warn.run({action: "warn", note: ""}), {code: "invalid-argument"});
});
