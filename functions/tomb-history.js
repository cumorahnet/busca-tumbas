"use strict";
const {createHash} = require("node:crypto");
const {elevated} = require("./superuser-password");
const fields = ["nombre_finado", "nombres", "apellido_paterno", "apellido_materno", "fecha_nacimiento", "fecha_defuncion",
  "fecha_nacimiento_estimada", "edad_defuncion", "nombre_panteon", "pais_panteon", "estado_panteon", "municipio_panteon",
  "colonia_panteon", "geolocation", "panteon_geolocation", "imageUrl", "status", "visibility"];
const cleanName = value => typeof value === "string" && !value.includes("@") ? value.trim().slice(0, 200) || "Colaborador" : "Colaborador";
const contactKey = (recordId, entryId, uid) => uid ? createHash("sha256").update(`${recordId}|${entryId}|${uid}`).digest("hex") : null;
function value(item) {
  if (item == null) return null;
  if (Number.isFinite(item.latitude) && Number.isFinite(item.longitude)) return {latitude:item.latitude, longitude:item.longitude};
  if (item.toDate) return item.toDate().toISOString();
  return item;
}
function changes(before, after) {
  return fields.filter(field => JSON.stringify(value(before?.[field])) !== JSON.stringify(value(after?.[field])))
      .map(field => ({field, before:field === "imageUrl" ? (before?.[field] ? "Fotografía anterior" : null) : value(before?.[field]),
        after:field === "imageUrl" ? (after?.[field] ? "Fotografía actual" : null) : value(after?.[field])}));
}
function actorFor(event, before, after, photo) {
  if (event.authId && event.authType === "unknown" && !event.authId.includes("@") && !event.authId.includes("/")) return event.authId;
  if (photo) return !before ? after?.contributorId : null;
  if (after?.last_updated_by && JSON.stringify(value(before?.last_updated)) !== JSON.stringify(value(after.last_updated))) return after.last_updated_by;
  if (after?.geolocationContributorId && JSON.stringify(value(before?.geolocation)) !== JSON.stringify(value(after.geolocation))) return after.geolocationContributorId;
  return !before ? after?.contributorId || after?.userId || null : null;
}
const publicRecord = data => data && !["private", "hidden"].includes(data.visibility) && !["rejected", "deleted", "pending", "hidden"].includes(data.status);
module.exports = ({db, getUser, HttpsError, FieldValue, requireUser, enforceRateLimit}) => {
  const reference = id => db.collection("tumbas").doc(id);
  const validId = id => typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id);
  const displayName = async uid => {
    try { return cleanName((await getUser(uid)).displayName); } catch { return "Colaborador (cuenta no disponible)"; }
  };
  async function record(request) {
    const id = request.data?.recordId;
    if (!validId(id)) throw new HttpsError("invalid-argument", "Tumba no válida.");
    const snapshot = await reference(id).get();
    const data = snapshot.data();
    const owner = data?.contributorId || data?.userId;
    const owns = !!owner && request.auth?.token.email_verified === true && owner === request.auth.uid;
    if (!snapshot.exists || !publicRecord(data) && !owns && !elevated(request.auth?.token)) throw new HttpsError("not-found", "La tumba no está disponible.");
    return {ref:reference(id), data};
  }
  async function audit(event, photo = false) {
    if (!event.data) return;
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;
    const delta = photo ? [{field:"photograph", before:before ? "Fotografía registrada" : null, after:after ? "Fotografía añadida" : null}] : changes(before, after);
    if (!delta.length) return;
    const actorUid = actorFor(event, before, after, photo) || null;
    const id = createHash("sha256").update(event.id).digest("hex");
    const eventRef = reference(event.params.recordId).collection("history").doc(id);
    const entry = {action:photo ? (!before ? "photo_added" : !after ? "photo_removed" : "photo_updated") : !before ? "created" : !after ? "deleted" : "edited",
      actorUid, actorName:actorUid ? await displayName(actorUid) : "Mantenimiento del sistema",
      changedAt:new Date(event.time), changes:delta, sourceEventId:event.id};
    // Stable event IDs make retries harmless; the timestamp comes from Firestore.
    await eventRef.set(entry);
  }
  async function list(request) {
    const {ref, data} = await record(request);
    let query = ref.collection("history").orderBy("changedAt", "desc");
    const after = request.data?.after;
    if (after !== undefined) {
      if (!validId(after)) throw new HttpsError("invalid-argument", "Página no válida.");
      const cursor = await ref.collection("history").doc(after).get();
      if (!cursor.exists) throw new HttpsError("invalid-argument", "Página no válida.");
      query = query.startAfter(cursor);
    }
    const snapshot = await query.limit(20).get();
    const entries = snapshot.docs.map(doc => {
      const entry = doc.data();
      return {id:doc.id, action:entry.action, actorName:cleanName(entry.actorName),
        changedAt:entry.changedAt?.toDate?.().toISOString() || null, changes:entry.changes || [],
        canContact:!!entry.actorUid && entry.actorUid !== request.auth?.uid, contactKey:contactKey(ref.id, doc.id, entry.actorUid)};
    });
    let initial = null;
    if (!after) {
      const uid = data.contributorId || data.userId;
      initial = {id:"original", action:"original", actorName:uid ? await displayName(uid) : "Colaborador no identificado",
        changedAt:data.timestamp?.toDate?.().toISOString() || null, changes:[], canContact:!!uid && uid !== request.auth?.uid, contactKey:contactKey(ref.id, "original", uid)};
      // Baselines describe known metadata only; never invent a retrospective diff.
      if (data.last_updated && snapshot.empty) entries.unshift({id:"legacy-last-edit", action:"legacy_edit",
        actorName:data.last_updated_by ? await displayName(data.last_updated_by) : "Colaborador no identificado",
        changedAt:data.last_updated.toDate?.().toISOString() || null, changes:[],
        canContact:!!data.last_updated_by && data.last_updated_by !== request.auth?.uid, contactKey:contactKey(ref.id, "legacy-last-edit", data.last_updated_by)});
    }
    return {entries, initial, after:snapshot.docs.at(-1)?.id || null, more:snapshot.docs.length === 20};
  }
  async function contact(request) {
    const uid = requireUser(request);
    await enforceRateLimit(uid, "tomb_contact", 20);
    const {ref, data} = await record(request);
    const {entryId, purpose, message} = request.data || {};
    if (!validId(entryId) || !["thanks", "question", "dispute"].includes(purpose) || typeof message !== "string" || !message.trim() || message.length > 1500) throw new HttpsError("invalid-argument", "Escribe un mensaje y selecciona su motivo.");
    let target;
    if (entryId === "original") target = data.contributorId || data.userId;
    else if (entryId === "legacy-last-edit") target = data.last_updated_by;
    else target = (await ref.collection("history").doc(entryId).get()).data()?.actorUid;
    if (!target || target === uid) throw new HttpsError("failed-precondition", "No se puede contactar a este colaborador desde ese cambio.");
    if (request.data.contactKey !== contactKey(ref.id, entryId, target)) throw new HttpsError("failed-precondition", "El autor registrado cambió. Vuelve a abrir el historial antes de contactar.");
    const recipient = await getUser(target).catch(() => null);
    if (!recipient || recipient.disabled) throw new HttpsError("failed-precondition", "La cuenta de este colaborador ya no está disponible.");
    const id = createHash("sha256").update(`contact|${ref.id}|${uid}|${target}`).digest("hex");
    const thread = db.collection("correction_requests").doc(id);
    const labels = {thanks:"Agradecimiento", question:"Consulta", dispute:"Controversia"};
    const senderName = cleanName(request.auth.token.name);
    await db.runTransaction(async transaction => {
      const existing = await transaction.get(thread);
      const messages = existing.data()?.messages || [];
      if (messages.length >= 100) throw new HttpsError("resource-exhausted", "La conversación alcanzó su límite de mensajes.");
      const next = {senderId:uid, senderName, text:message.trim(), createdAt:Date.now()};
      transaction.set(thread, {recordType:"tomb", kind:"contact", tombId:ref.id, tombName:data.nombre_finado || "Tumba",
        tombOwnerId:target, requesterId:uid, requesterName:senderName, description:existing.data()?.description || `${labels[purpose]}: ${next.text}`, contactPurpose:purpose,
        participants:[uid, target], readBy:[uid], status:"open", messages:[...messages, next],
        createdAt:existing.data()?.createdAt || FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp()});
    });
    return {threadId:thread.id};
  }
  return {auditTomb:event => audit(event), auditPhoto:event => audit(event, true), list, contact};
};
module.exports.changes = changes;
module.exports.actorFor = actorFor;
