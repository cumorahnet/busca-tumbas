"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const factory = require("./tomb-history");
class HttpsError extends Error {constructor(code, text) {super(text);this.code=code;}}
function setup() {
  const rows=new Map([["tumbas/tomb", {nombre_finado:"Ana", userId:"owner", timestamp:new Date("2026-01-01"), status:"published"}]]);
  const timestamps = data => Object.fromEntries(Object.entries(data).map(([key, item]) => [key, item instanceof Date ? {toDate:() => item} : item]));
  const snapshot = path => ({id:path.split("/").at(-1), exists:rows.has(path), data:() => rows.has(path) ? timestamps(rows.get(path)) : undefined});
  const ref = path => ({path, id:path.split("/").at(-1), collection:name => collection(`${path}/${name}`), get:async () => snapshot(path), set:async data => rows.set(path, data)});
  function collection(path) {
    let maximum=Infinity;let cursor;
    const query={doc:id => ref(`${path}/${id}`), orderBy() {return this;}, limit(count) {maximum=count;return this;}, startAfter(doc) {cursor=doc.id;return this;},
      async get() {
        let docs=[...rows.keys()].filter(key => key.startsWith(path+"/") && key.split("/").length===path.split("/").length+1)
            .sort((a,b) => Number(rows.get(b).changedAt)-Number(rows.get(a).changedAt)).map(snapshot);
        if(cursor) docs=docs.slice(docs.findIndex(doc => doc.id===cursor)+1);
        docs=docs.slice(0,maximum);return {docs, empty:!docs.length};
      }};
    return query;
  }
  const db={collection, runTransaction:async fn => fn({get:async reference => snapshot(reference.path), set:(reference,data) => rows.set(reference.path,data)})};
  const api=factory({db, HttpsError, FieldValue:{serverTimestamp:() => new Date("2026-10-21T20:00:00Z")}, enforceRateLimit:async () => {},
    getUser:async uid => ({uid, displayName:uid==="editor" ? "Editora" : "Colaborador", email:"private@example.com"}),
    requireUser:request => {if(!request.auth?.token.email_verified) throw new HttpsError("unauthenticated","login");return request.auth.uid;}});
  const event=(before,after,id="event1") => ({id, time:"2026-10-21T18:00:00Z", params:{recordId:"tomb"}, authType:"service_account", authId:"service@example.com",
    data:{before:{exists:!!before, data:() => before}, after:{exists:!!after, data:() => after}}});
  const auth={uid:"viewer",token:{name:"Visitante",email_verified:true}};
  return {rows, api, event, auth};
}
test("history keeps old and new values, trusted editor and event time, and retries do not duplicate", async () => {
  const s=setup();const before={nombres:"Ana", last_updated:{toDate:() => new Date("2026-01-01")}};
  const after={nombres:"Ana María", nombres_lower:"ana maria", last_updated_by:"editor", last_updated:{toDate:() => new Date("2026-10-21")}};
  const event=s.event(before,after);await s.api.auditTomb(event);await s.api.auditTomb(event);
  const entries=[...s.rows.entries()].filter(([key]) => key.includes("/history/"));
  assert.equal(entries.length,1);
  const entry=entries[0][1];assert.equal(entry.actorUid,"editor");assert.equal(entry.actorName,"Editora");
  assert.equal(entry.changedAt.toISOString(),new Date(event.time).toISOString());
  assert.deepEqual(entry.changes,[{field:"nombres",before:"Ana",after:"Ana María"}]);
  const listed=await s.api.list({data:{recordId:"tomb"}});
  assert.equal(listed.entries[0].actorName,"Editora");
  assert.equal(listed.entries[0].actorUid,undefined);
  assert.doesNotMatch(JSON.stringify(listed),/private@example|service@example/);
});
test("photos, locations and system changes have separate and accurate attribution", async () => {
  const s=setup();await s.api.auditPhoto(s.event(null,{contributorId:"editor"},"photo"));
  await s.api.auditTomb(s.event({}, {geolocation:{latitude:1,longitude:2},geolocationContributorId:"editor"},"gps"));
  await s.api.auditTomb(s.event({nombres:"Ana"},{nombres:"Otra",last_updated_by:"old-editor"},"system"));
  const entries=[...s.rows.values()].filter(value => value.action);
  assert.equal(entries.find(value => value.action==="photo_added").actorUid,"editor");
  assert.equal(entries.find(value => value.changes[0].field==="geolocation").actorUid,"editor");
  assert.equal(entries.find(value => value.sourceEventId==="system").actorUid,null);
});
test("legacy records show only known last edit metadata and private records stay private", async () => {
  const s=setup();s.rows.set("tumbas/tomb",{...s.rows.get("tumbas/tomb"),last_updated:new Date("2026-10-20"),last_updated_by:"editor"});
  const result=await s.api.list({data:{recordId:"tomb"}});
  assert.equal(result.entries[0].action,"legacy_edit");assert.deepEqual(result.entries[0].changes,[]);
  assert.equal(result.initial.id,"original");
  s.rows.set("tumbas/tomb",{visibility:"private"});
  await assert.rejects(s.api.list({data:{recordId:"tomb"}}),{code:"not-found"});
});
test("private contact resolves the recipient from the history, never from client-supplied accounts", async () => {
  const s=setup();await s.api.auditTomb(s.event({nombres:"Ana"},{nombres:"Ana María",last_updated_by:"editor",last_updated:new Date()},"edit"));
  const eventId=[...s.rows.keys()].find(key => key.includes("/history/")).split("/").at(-1);
  const listed=await s.api.list({auth:s.auth,data:{recordId:"tomb"}});
  const request={auth:s.auth,data:{recordId:"tomb",entryId:eventId,contactKey:listed.entries[0].contactKey,purpose:"thanks",message:"Gracias",targetUid:"victim"}};
  const result=await s.api.contact(request);await s.api.contact(request);
  const thread=s.rows.get(`correction_requests/${result.threadId}`);
  assert.deepEqual(thread.participants,["viewer","editor"]);
  assert.equal(thread.messages.length,2);assert.equal(thread.kind,"contact");
  assert.match(thread.description,/Agradecimiento/);
  await assert.rejects(s.api.contact({data:request.data}),{code:"unauthenticated"});
});

test("a stale contact entry cannot redirect a message to a changed contributor", async () => {
  const s=setup();const listed=await s.api.list({data:{recordId:"tomb"}});
  s.rows.set("tumbas/tomb",{...s.rows.get("tumbas/tomb"),userId:"another"});
  await assert.rejects(s.api.contact({auth:s.auth,data:{recordId:"tomb",entryId:"original",contactKey:listed.initial.contactKey,purpose:"question",message:"Consulta"}}),{code:"failed-precondition"});
  assert.equal([...s.rows.keys()].some(key=>key.startsWith("correction_requests/")),false);
});
