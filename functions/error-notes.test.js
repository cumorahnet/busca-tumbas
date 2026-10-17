"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {submit} = require("./error-notes");
class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function setup() {
  const docs = new Map([["tumbas/record", {userId: "owner", nombre_finado: "Persona"}],
    ["cemeteries/cemetery", {contributorId: "owner", name: "Panteón"}]]);
  let id = 0;
  function collection(path) {
    return {doc: (key = `generated${++id}`) => ({id: key, path: `${path}/${key}`,
      collection: (child) => collection(`${path}/${key}/${child}`)})};
  }
  const db = {collection, runTransaction: async (callback) => callback({
    get: async (ref) => ({exists: docs.has(ref.path), data: () => docs.get(ref.path)}),
    set: (ref, data, opts) => docs.set(ref.path, {...(opts?.merge ? docs.get(ref.path) : {}), ...data}),
  })};
  const run = (uid, data = {}) => submit(db, {auth: {uid, token: {}},
    data: {recordId: "record", description: "Fecha incorrecta", ...data}},
  {serverTimestamp: () => "timestamp"}, HttpsError);
  return {docs, run};
}
test("third distinct reporter escalates, duplicates cannot increment the count", async () => {
  const {docs, run} = setup();
  assert.deepEqual(await run("one"), {count: 1, escalated: false});
  await assert.rejects(run("one"), {code: "already-exists"});
  assert.deepEqual(await run("two"), {count: 2, escalated: false});
  assert.deepEqual(await run("three"), {count: 3, escalated: true});
  assert.equal(docs.get("_errorReviews/tomb_record").status, "pending");
  const threads = [...docs.entries()].filter(([path]) => path.startsWith("correction_requests/"));
  assert.equal(threads.length, 3);
  assert.deepEqual(threads[0][1].participants, ["owner", "one"]);
  assert.equal(docs.get("tumbas/record").nombre_finado, "Persona");
  // Resolving a conversation cannot cancel the administrative case.
  threads[0][1].status = "resolved";
  assert.equal(docs.get("_errorReviews/tomb_record").status, "pending");
  docs.get("_errorReviews/tomb_record").status = "reviewed";
  assert.deepEqual(await run("four"), {count: 4, escalated: true});
  assert.equal(docs.get("_errorReviews/tomb_record").status, "pending");
});
test("invalid reports, missing entries and self reports produce no notes", async () => {
  const {docs, run} = setup();
  await assert.rejects(run("owner"), {code: "failed-precondition"});
  await assert.rejects(run("one", {recordId: "absent"}), {code: "not-found"});
  await assert.rejects(run("one", {description: " "}), {code: "invalid-argument"});
  await assert.rejects(run("one", {description: "a".repeat(1501)}), {code: "invalid-argument"});
  assert.equal(docs.size, 2);
});
test("cemetery notes use the actual contributor and a separate counter", async () => {
  const {docs, run} = setup();
  await run("one", {recordType: "cemetery", recordId: "cemetery"});
  assert.equal(docs.get("_errorReviews/cemetery_cemetery").owner, "owner");
  assert.equal(docs.has("_errorReviews/tomb_record"), false);
});
