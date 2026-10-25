"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {dateKey, tombDuplicate, cemeteryDuplicate} = require("./duplicates");
const factory = require("./record-writes");
class HttpsError extends Error {constructor(code, message) {super(message); this.code = code;}}

test("dates and accents cannot disguise the same tomb", () => {
  assert.equal(dateKey("05 MAY 1965"), "1965-05-05");
  assert.equal(dateKey("5 de mayo de 1965"), "1965-05-05");
  assert.equal(dateKey("NOV 1985"), "1985-11");
  assert.equal(dateKey("1910"), "1910");
  const unknown = {nombre_finado: "Ana López", nombre_panteon: "Municipal", estado_panteon: "Jalisco", municipio_panteon: "Guadalajara"};
  assert.ok(tombDuplicate(unknown, {...unknown, edad_defuncion: 80}));
  assert.ok(tombDuplicate({nombre_finado: "José López", fecha_nacimiento: "1910", fecha_defuncion: "1980"},
      {nombre_finado: "Jose Lopez", fecha_defuncion: "12 ENE 1980"}));
  assert.ok(tombDuplicate({nombre_finado: "MARIA RODRIGUEZ", fecha_defuncion: "27 NOV 1990"},
      {nombre_finado: "María Rodríguez", fecha_defuncion: "1990-11-27"}));
  assert.ok(!tombDuplicate({nombre_finado: "María Rodríguez", fecha_defuncion: "1990"},
      {nombre_finado: "María Rodríguez", fecha_defuncion: "1991"}));
});

test("cemetery identity ignores GPS jitter and respects different municipalities", () => {
  const place = {name: "Panteón Municipal", stateCode: "15", municipalityCode: "001", locality: "Rancho Nuevo"};
  assert.ok(cemeteryDuplicate(place, {...place, name: "PANTEON MUNICIPAL", location: {latitude: 19, longitude: -99}}));
  assert.ok(!cemeteryDuplicate(place, {...place, municipalityCode: "002"}));
  assert.ok(cemeteryDuplicate({...place, inegiCemeteryId: "123"}, {...place, name: "Nuevo nombre", inegiCemeteryId: "123"}));
});

function harness() {
  const rows = new Map();
  const revisions = new Map();
  const snapshot = path => ({id: path.split("/").at(-1), exists: rows.has(path), data: () => rows.get(path),
    updateTime: {seconds: 1, nanoseconds: revisions.get(path) || 0}});
  const db = {collection: (path) => ({path, doc: (id = "generated") => ({path: `${path}/${id}`, get: async () => snapshot(`${path}/${id}`)}),
    where: (field, _op, value) => ({path, field, value})})};
  let queue = Promise.resolve();
  db.runTransaction = (fn) => {
    const result = queue.then(async () => {
      const writes = [];
      const outcome = await fn({get: async (ref) => ref.path.includes("/") ?
        snapshot(ref.path) :
        {docs: [...rows].filter(([path, data]) => path.startsWith(ref.path + "/") && (!ref.field || data[ref.field] === ref.value)).map(([path, data]) =>
          ({id: path.split("/")[1], data: () => data, updateTime: snapshot(path).updateTime}))},
      create: (ref, data) => writes.push([ref.path, data]),
      set: (ref, data) => writes.push([ref.path, data]),
      update: (ref, data) => writes.push([ref.path, {...rows.get(ref.path), ...data}])});
      for (const [path, data] of writes) {rows.set(path, data); revisions.set(path, (revisions.get(path) || 0) + 1);}
      return outcome;
    });
    queue = result.catch(() => {});
    return result;
  };
  const api = factory({db, onCall: (_options, fn) => fn, HttpsError,
    FieldValue: {serverTimestamp: () => 1}, GeoPoint: class {constructor(latitude, longitude) {this.latitude = latitude; this.longitude = longitude;}}, requireUser: (request) => request.auth.uid,
    requireAdmin: (request) => {if (request.auth.uid !== "admin") throw new HttpsError("permission-denied", "Admin only");}});
  const request = (recordId, data, uid = "owner") => ({auth: {uid, token: {}}, data: {recordId, data}});
  return {api, rows, request, revisions};
}

test("duplicate tomb creates with different IDs and date formats have only one winner", async () => {
  const {api, rows, request} = harness();
  const record = {nombre_finado: "María Rodríguez", fecha_defuncion: "27 NOV 1990", imageUrl: "photo"};
  const results = await Promise.allSettled([
    api.crearAportacionTumba(request("first", record)),
    api.crearAportacionTumba(request("second", {...record, fecha_defuncion: "1990-11-27"})),
  ]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(results.find((item) => item.status === "rejected").reason.code, "already-exists");
  assert.equal([...rows.keys()].filter((key) => key.startsWith("tumbas/")).length, 1);
  assert.ok(rows.has("_uniquenessLocks/tumbas"));
});

test("cemetery creation and edits cannot duplicate another place or change ownership", async () => {
  const {api, rows, request} = harness();
  const place = {name: "Panteón Municipal", stateCode: "15", municipalityCode: "001", locality: "Centro", photoUrl: "photo", placeType: "cemetery"};
  await api.crearAportacionPanteon(request("first", place));
  await assert.rejects(api.crearAportacionPanteon(request("second", {...place, name: "PANTEON MUNICIPAL"})), {code: "already-exists"});
  const dispute = await api.crearAportacionPanteon(request("second", {...place, name: "Panteón San José"}));
  assert.ok(dispute.disputed);
  await api.resolverDisputaDuplicado({auth: {uid: "admin"}, data: {caseId: dispute.disputeId,
    decision: "distinct", note: "Panteones diferentes, documentos contrastados"}});
  await assert.rejects(api.actualizarAportacionPanteon(request("second", {name: place.name, locality: place.locality})), {code: "already-exists"});
  await assert.rejects(api.actualizarAportacionPanteon(request("first", {name: "Otro", locality: "Centro"}, "intruder")), {code: "permission-denied"});
  await assert.rejects(api.crearAportacionTumba(request("forged", {nombre_finado: "Persona", imageUrl: "photo", userId: "victim"})), {code: "invalid-argument"});
  assert.equal(rows.get("cemeteries/first").contributorId, "owner");
});

test("tomb suggestions do not hold records with weak names or missing/conflicting dates", async () => {
  for (const candidate of [
    {nombre_finado: "abcdefghxy", fecha_defuncion: "1980"},
    {nombre_finado: "abcdefghik"},
    {nombre_finado: "abcdefghik", fecha_defuncion: "1981"},
    {nombre_finado: "abcdefghik", fecha_defuncion: "1980-02-03"},
  ]) {
    const {api, rows, request} = harness();
    await api.crearAportacionTumba(request("original", {nombre_finado: "abcdefghij", fecha_defuncion: "1980", imageUrl: "photo"}));
    assert.ok((await api.crearAportacionTumba(request("new", {...candidate, imageUrl:"photo2"}))).saved);
    assert.equal([...rows.keys()].filter(key => key.startsWith("_duplicateDisputes/")).length, 0);
  }
});

test("live Marce spelling variant is retained as a dispute rather than published", async () => {
  const {api,rows,request} = harness();
  const data = {nombre_finado:"Marce Mociño Ramírez",fecha_nacimiento:"2 de Junio de 1962",fecha_defuncion:"16 de Agosto de 1982",imageUrl:"photo"};
  await api.crearAportacionTumba(request("original",data));
  const result = await api.crearAportacionTumba(request("typo",{...data,nombre_finado:"Marce Muciño Ramírez"}));
  assert.equal(result.disputed,true);
  assert.equal(rows.has("tumbas/typo"),false);
});

test("strict global, name and date thresholds dispute privately; exact identity blocks", async () => {
  const {api, rows, request} = harness();
  await api.crearAportacionTumba(request("first", {nombre_finado: "abcdefghij", fecha_defuncion: "1980", imageUrl: "photo"}));
  assert.ok((await api.crearAportacionTumba(request("half", {nombre_finado: "abxy", imageUrl: "photo"}))).saved);
  const result = await api.crearAportacionTumba(request("similar", {nombre_finado: "abcdefghik", fecha_defuncion: "1980", imageUrl: "new-photo"}));
  assert.ok(result.similarity > 90 && result.similarity < 100);
  assert.equal(result.disputed, true);
  assert.equal(rows.has("tumbas/similar"), false);
  const stored = rows.get("_duplicateDisputes/" + result.disputeId);
  assert.equal(stored.adminUnread, true);
  assert.equal(stored.status, "pending");
  assert.equal(stored.candidate.imageUrl, "new-photo");
  const retry = await api.crearAportacionTumba(request("similar", {nombre_finado: "abcdefghik", fecha_defuncion: "1980", imageUrl: "new-photo"}));
  assert.equal(retry.disputeId, result.disputeId);
  assert.equal([...rows.keys()].filter(key => key.startsWith("_duplicateDisputes/")).length, 1);
  await assert.rejects(api.crearAportacionTumba(request("exact-pending", {nombre_finado: "abcdefghik", fecha_defuncion: "1980", imageUrl: "photo"}, "other")), {code: "already-exists"});
  await assert.rejects(api.crearAportacionTumba(request("exact", {nombre_finado: "ABCDEFGHIJ", fecha_defuncion: "1980", imageUrl: "photo"})), {code: "already-exists"});
});

test("clarifications and resolution enforce owner/admin access; exact duplicates cannot be approved", async () => {
  const {api, rows, request} = harness();
  await api.crearAportacionTumba(request("first", {nombre_finado: "abcdefghij", fecha_defuncion: "1980", imageUrl: "photo"}));
  const result = await api.crearAportacionTumba(request("similar", {nombre_finado: "abcdefghik", fecha_defuncion: "1980", imageUrl: "photo"}));
  const data = {caseId: result.disputeId, note: "La fecha de la foto confirma que es otra persona"};
  await assert.rejects(api.aclararDisputaDuplicado({auth: {uid: "intruder"}, data}), {code: "permission-denied"});
  await api.aclararDisputaDuplicado({auth: {uid: "owner"}, data});
  assert.equal(rows.get("_duplicateDisputes/" + result.disputeId).messages.length, 1);
  await assert.rejects(api.resolverDisputaDuplicado({auth: {uid: "owner"}, data: {...data, decision: "distinct"}}), {code: "permission-denied"});
  rows.set("tumbas/now-exact", {nombre_finado: "abcdefghik", fecha_defuncion: "1980", imageUrl: "another-photo"});
  await assert.rejects(api.resolverDisputaDuplicado({auth: {uid: "admin"}, data: {...data, decision: "distinct"}}), {code: "already-exists"});
  assert.equal(rows.get("_duplicateDisputes/" + result.disputeId).status, "pending");
  const comparison = await api.obtenerComparacionDisputa({auth: {uid: "admin"}, data: {caseId: result.disputeId}});
  await api.resolverDisputaDuplicado({auth: {uid: "admin"}, data: {...data, decision: "duplicate",
    matchedRecordId: comparison.matches[0].recordId, matchedRevision: comparison.matches[0].revision}});
  assert.equal(rows.get("_duplicateDisputes/" + result.disputeId).status, "rejected");
  assert.equal(rows.has("tumbas/similar"), false);
  assert.ok(rows.has("_adminAudit/generated"));
  rows.delete("tumbas/now-exact");
  await assert.rejects(api.crearAportacionTumba(request("similar", {nombre_finado: "abcdefghik", fecha_defuncion: "1980", imageUrl: "photo"})), {code: "failed-precondition"});
});

test("visual selection can replace the existing record with archive, stable ID and fresh revision", async () => {
  const {api, rows, request, revisions} = harness();
  await api.crearAportacionTumba(request("original", {nombre_finado: "abcdefghij", fecha_defuncion: "1980", imageUrl: "original-photo"}));
  const disputed = await api.crearAportacionTumba(request("proposed", {nombre_finado: "abcdefghik", fecha_defuncion: "1980", imageUrl: "correct-photo"}, "new-author"));
  await assert.rejects(api.obtenerComparacionDisputa({auth: {uid: "new-author"}, data: {caseId: disputed.disputeId}}), {code: "permission-denied"});
  let compared = await api.obtenerComparacionDisputa({auth: {uid: "admin"}, data: {caseId: disputed.disputeId}});
  assert.equal(compared.matches[0].publication.imageUrl, "original-photo");
  assert.match(compared.reason, /superior al 50/);
  const data = {caseId: disputed.disputeId, decision: "replace", note: "La nueva foto permite leer el nombre correctamente",
    matchedRecordId: "original", matchedRevision: compared.matches[0].revision};
  await assert.rejects(api.resolverDisputaDuplicado({auth: {uid: "admin"}, data: {...data, matchedRecordId: "forged"}}), {code: "failed-precondition"});
  revisions.set("tumbas/original", 2);
  await assert.rejects(api.resolverDisputaDuplicado({auth: {uid: "admin"}, data}), {code: "failed-precondition"});
  assert.equal(rows.has("_mergedRecords/dispute_" + disputed.disputeId), false);
  compared = await api.obtenerComparacionDisputa({auth: {uid: "admin"}, data: {caseId: disputed.disputeId}});
  await api.resolverDisputaDuplicado({auth: {uid: "admin"}, data: {...data, matchedRevision: compared.matches[0].revision}});
  assert.equal(rows.get("tumbas/original").nombre_finado, "abcdefghik");
  assert.equal(rows.get("tumbas/original").imageUrl, "correct-photo");
  assert.equal(rows.get("tumbas/original").contributorId, "new-author");
  assert.equal(rows.get("_mergedRecords/dispute_" + disputed.disputeId).original.imageUrl, "original-photo");
  assert.equal(rows.get("_duplicateDisputes/" + disputed.disputeId).selectedPublication, "candidate");
  assert.equal([...rows.keys()].filter(path => path.startsWith("tumbas/")).length, 1);
});

test('place photos preserve country and cannot link a foreign place to INEGI', async () => {
  const {api, rows, request} = harness();
  const place = {name:'San Jose',stateCode:'Region',municipalityCode:'Centro',locality:'Centro',photoUrl:'photo',placeType:'church',country:'Guatemala',location:{latitude:14.56,longitude:-90.73}};
  await api.crearAportacionPanteon(request('foreign',place));
  assert.equal(rows.get('cemeteries/foreign').country,'Guatemala');
  assert.equal(rows.get('cemeteries/foreign').location.latitude,14.56);
  const result=await api.crearAportacionPanteon(request('other-country',{...place,country:'Mexico'}));
  assert.equal(result.saved,true);
  await assert.rejects(api.crearAportacionPanteon(request('invalid-link',{...place,placeType:'cemetery',inegiCemeteryId:'mexican-catalogue'})),{code:'invalid-argument'});
});
