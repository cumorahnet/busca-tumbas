"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const create = require("./public-catalog");
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
function setup(records) {
  const refs = [];
  const query = {
    where(...args) { refs.push(args); return this; },
    orderBy() { return this; }, limit() { return this; },
    doc(id) { return {get: async () => ({exists: !!records[id], id, data: () => records[id]})}; },
    async get() { return {docs: Object.entries(records).map(([id, data]) => ({id, data: () => data}))}; },
  };
  return {run: create({db: {collection: () => query}, HttpsError}), refs};
}
test("guests can browse sanitized records, without contributor accounts or hidden records", async () => {
  const s = setup({a: {nombre_finado: "Ana", contributor_email: "private@example.com", userId: "owner", contributorId: "owner", timestamp: {toMillis: () => 1000}}, b: {visibility: "private"}, c: {status: "rejected"}});
  const result = await s.run({data: {collection: "tumbas"}});
  assert.deepEqual(result.docs, [{id: "a", data: {nombre_finado: "Ana", timestamp: {seconds: 1}}}]);
  const one = await s.run({data: {collection: "tumbas", id: "a"}});
  assert.equal(one.docs[0].data.contributor_email, undefined);
  assert.deepEqual((await s.run({data: {collection: "tumbas", id: "b"}})).docs, []);
});
test("public queries cannot select private collections, account filters or arbitrary document paths", async () => {
  const s = setup({});
  for (const data of [{collection: "_entitlements"}, {collection: "tumbas", id: "../account"}, {collection: "tumbas", filters: [["contributor_email", "==", "private@example.com"]]}, {collection: "tumbas", order: ["contributor_email", "asc"]}]) {
    await assert.rejects(s.run({data}), error => error.code === "invalid-argument");
  }
  await s.run({data: {collection: "tumbas", filters: [["estado_panteon", "==", "Jalisco"]]}});
  assert.deepEqual(s.refs, [["estado_panteon", "==", "Jalisco"]]);
});
