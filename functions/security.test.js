"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const context = {exports: {}, require: (name) => {
  const modules = {
    "firebase-functions/v2/https": {onCall: (_options, handler) => handler, HttpsError},
    "firebase-functions/params": {defineSecret: () => ({value: () => "test"})},
    "firebase-functions/v2": {setGlobalOptions: () => {}},
    "firebase-admin/app": {initializeApp: () => {}},
    "firebase-admin/firestore": {getFirestore: () => ({}), FieldValue: {}},
    "firebase-admin/storage": {},
    "firebase-admin/auth": {},
  };
  if (!modules[name]) throw new Error("Unexpected module: " + name);
  return modules[name];
}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname + "/index.js", "utf8"), context);
for (const [name, handler] of Object.entries(context.exports)) {
  test(name + " rejects anonymous and unverified users, including admin email", async () => {
    await assert.rejects(handler({}), {code: "unauthenticated"});
    for (const email of ["user@example.com", "cumorahnet@gmail.com"]) {
      await assert.rejects(handler({auth: {uid: "user", token: {email, email_verified: false}}}), {code: "permission-denied"});
    }
  });
}
for (const name of ["activarPlusAdmin", "obtenerEstadisticasAdmin", "eliminarRegistroAdmin", "vaciarBaseAdmin"]) {
  test(name + " rejects a verified non-admin", async () => {
    await assert.rejects(context.exports[name]({auth: {uid: "user", token: {email: "user@example.com", email_verified: true}}}), {code: "permission-denied"});
  });
}
test("coordinates reject null, empty strings, booleans and out of range values", () => {
  for (const value of [null, "", false, {}, undefined, Infinity, 91]) {
    assert.throws(() => context.validateCoordinates(value, 0), {code: "invalid-argument"});
  }
  assert.equal(context.validateCoordinates(0, -180).longitude, -180);
});

for (const name of ["activarPlusAdmin", "obtenerEstadisticasAdmin", "eliminarRegistroAdmin", "vaciarBaseAdmin"]) {
  test(name + " denies the old admin email without a server-issued role", async () => {
    await assert.rejects(context.exports[name]({auth: {uid: "ordinary-user", token: {email: "cumorahnet@gmail.com", email_verified: true}}}), {code: "permission-denied"});
  });
}
test("global role must be boolean true and email verified", () => {
  for (const role of [undefined, false, "true", "platform_admin"]) {
    assert.throws(() => context.requireAdmin({auth: {uid: "user", token: {email_verified: true, platform_admin: role}}}), {code: "permission-denied"});
  }
  assert.doesNotThrow(() => context.requireAdmin({auth: {uid: "dedicated", token: {email_verified: true, platform_admin: true}}}));
});
