"use strict";
const {createHash} = require("node:crypto");
const validUid = uid => typeof uid === "string" && uid.length > 0 && uid.length <= 128 && !uid.includes("/") && !uid.includes("@");
function safe(value, key = "") {
  if (/password|secret|token|credential|fingerprint|image_hash/i.test(key)) return "[dato protegido]";
  if (value == null) return null;
  if (value.toMillis) return new Date(value.toMillis()).toISOString();
  if (Array.isArray(value)) return value.map(item => safe(item));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,safe(v,k)]));
  return value;
}
module.exports = ({db, FieldValue, HttpsError, requireUser, requireAdmin}) => {
  const events = uid => db.collection("_userAudit").doc(uid).collection("events");
  async function run(operation, request, handler) {
    const uid = requireUser(request);
    const ref = events(uid).doc();
    // Persist intent before running a mutation, including destructive operations.
    await ref.set({action:operation, actorId:uid, actorName:request.auth.token.name || "Usuario",
      target:request.data?.recordId || request.data?.caseId || null, source:"operation",
      status:"started", createdAt:FieldValue.serverTimestamp(), changes:[]});
    try {
      const result = await handler(request);
      await ref.update({status:"completed", completedAt:FieldValue.serverTimestamp()});
      return result;
    } catch (error) {
      await ref.update({status:"failed", errorCode:error.code || "internal", completedAt:FieldValue.serverTimestamp()});
      throw error;
    }
  }
  async function capture(event, nested = false) {
    if (!event.data) return;
    const collection = event.params.collectionId;
    // Audit sinks never trigger new audit events. Profiles are audited atomically.
    if (["_databaseAudit", "_userAudit"].includes(collection) ||
        ["history", "events"].includes(event.params.subcollectionId)) return;
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;
    if (collection === "_accountProfiles" && after?.auditEntryId && after.auditEntryId !== before?.auditEntryId) return;
    const protectedCollection = /credential|secret|attempt|rateLimit/i.test(collection);
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
    const changes = [...keys].filter(key => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]))
        .map(field => ({field, before:protectedCollection ? "[dato protegido]" : safe(before?.[field],field), after:protectedCollection ? "[dato protegido]" : safe(after?.[field],field)}));
    if (!changes.length) return;
    let actorId = event.authType === "unknown" && validUid(event.authId) ? event.authId : null;
    if (!actorId && after) {
      for (const key of ["auditActorId", "last_updated_by", "updatedBy", "reviewedBy", "resolvedBy", "actor"]) {
        if (validUid(after[key]) && (!before || JSON.stringify(before[key]) !== JSON.stringify(after[key]) ||
            JSON.stringify(before.updatedAt || before.last_updated) !== JSON.stringify(after.updatedAt || after.last_updated))) {
          actorId = after[key]; break;
        }
      }
      const messages = after.messages || [];
      if (!actorId && messages.length > (before?.messages || []).length) actorId = messages.at(-1)?.senderId || null;
      if (!actorId && !before) actorId = after.contributorId || after.userId || after.requesterId || null;
    }
    if (!validUid(actorId)) actorId = null;
    const affected = new Set([actorId]);
    for (const data of [before,after]) if (data) {
      [data.uid, data.userId, data.contributorId, data.owner, data.tombOwnerId, data.requesterId,
        data.original?.userId, data.original?.contributorId,
        ...(data.participants || [])].filter(validUid).forEach(uid => affected.add(uid));
    }
    if (["_moderation","_entitlements","_accountProfiles"].includes(collection)) affected.add(event.params.documentId);
    const id = createHash("sha256").update(event.id).digest("hex");
    const entry = {action:!before ? "created" : !after ? "deleted" : "updated", source:"database",
      actorId, actorName:actorId ? "Usuario" : "Sistema (consultar operación relacionada)",
      target:nested ? `${collection}/${event.params.documentId}/${event.params.subcollectionId}/${event.params.childId}` : `${collection}/${event.params.documentId}`,
      createdAt:new Date(event.time), changes, sourceEventId:event.id};
    const batch = db.batch();
    batch.set(db.collection("_databaseAudit").doc(id), entry);
    [...affected].filter(validUid).forEach(uid => batch.set(events(uid).doc(id), entry));
    await batch.commit();
  }
  async function list(request) {
    const caller = requireUser(request);
    const uid = request.data?.uid || caller;
    if (!validUid(uid)) throw new HttpsError("invalid-argument", "Usuario no válido.");
    if (uid !== caller) requireAdmin(request);
    let query = events(uid).orderBy("createdAt", "desc");
    if (request.data?.after) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(request.data.after)) throw new HttpsError("invalid-argument", "Página no válida.");
      const cursor = await events(uid).doc(request.data.after).get();
      if (!cursor.exists) throw new HttpsError("invalid-argument", "Página no válida.");
      query = query.startAfter(cursor);
    }
    const snapshot = await query.limit(50).get();
    return {uid, entries:snapshot.docs.map(doc => ({id:doc.id,...doc.data(),createdAt:doc.data().createdAt?.toMillis?.() || null})),
      after:snapshot.size === 50 ? snapshot.docs.at(-1).id : null};
  }
  function addDeletion(writer, snapshot, request) {
    const uid = requireUser(request);
    const data = snapshot.data();
    const audit = db.collection("_databaseAudit").doc();
    const entry = {action:"deleted",source:"database",actorId:uid,actorName:request.auth.token.name || "Administrador",
      target:snapshot.ref.path,createdAt:FieldValue.serverTimestamp(),
      changes:Object.entries(data).map(([field,before]) => ({field,before:safe(before,field),after:null}))};
    writer.set(audit,entry);
    const users = new Set([uid,data.contributorId,data.userId]);
    [...users].filter(validUid).forEach(owner => writer.set(events(owner).doc(audit.id),entry));
    writer.delete(snapshot.ref);
  }
  async function remove(ref, request, beforeDelete) {
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new HttpsError("not-found","El registro ya no existe.");
      if (beforeDelete) await beforeDelete(transaction, snapshot);
      addDeletion(transaction,snapshot,request);
    });
  }
  return {run, capture, list, remove, addDeletion};
};
module.exports.safe = safe;
