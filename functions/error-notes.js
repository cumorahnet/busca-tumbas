"use strict";

// All counts and notifications are committed together, including concurrent reports.
exports.submit = async (db, request, FieldValue, HttpsError) => {
  const {recordType = "tomb", recordId, description} = request.data || {};
  if (!["tomb", "cemetery"].includes(recordType) ||
      typeof recordId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(recordId) ||
      typeof description !== "string" || !description.trim() || description.length > 1500) {
    throw new HttpsError("invalid-argument", "Describe el error (hasta 1500 caracteres).");
  }
  const uid = request.auth.uid;
  const reference = db.collection(recordType === "tomb" ? "tumbas" : "cemeteries").doc(recordId);
  const caseRef = db.collection("_errorReviews").doc(`${recordType}_${recordId}`);
  const reporterRef = caseRef.collection("reporters").doc(uid);
  const threadRef = db.collection("correction_requests").doc();
  return db.runTransaction(async (transaction) => {
    const [record, review, reporter] = await Promise.all([
      transaction.get(reference), transaction.get(caseRef), transaction.get(reporterRef),
    ]);
    if (!record.exists) throw new HttpsError("not-found", "La entrada ya no existe.");
    const owner = record.data().contributorId || record.data().userId;
    if (!owner || owner === uid) throw new HttpsError("failed-precondition", "Solo puedes avisar sobre entradas de otro usuario.");
    if (reporter.exists) throw new HttpsError("already-exists", "Ya enviaste una nota sobre esta entrada. Puedes continuar en tu conversación.");
    const name = record.data().nombre_finado || record.data().name || "Entrada";
    const requesterName = String(request.auth.token.name || "Colaborador").slice(0, 200);
    const count = (review.data()?.count || 0) + 1;
    const now = FieldValue.serverTimestamp();
    transaction.set(threadRef, {
      recordType, tombId: recordId, tombName: name, tombOwnerId: owner,
      requesterId: uid, requesterName, description: description.trim(),
      status: "open", participants: [owner, uid], readBy: [uid],
      messages: [{senderId: uid, senderName: requesterName,
        text: description.trim(), createdAt: Date.now()}], createdAt: now, updatedAt: now,
    });
    transaction.set(reporterRef, {threadId: threadRef.id, createdAt: now});
    transaction.set(caseRef, {recordType, recordId, name, owner, count,
      status: count >= 3 ? "pending" : "collecting", updatedAt: now,
      ...(count === 3 ? {escalatedAt: now} : {}),
    }, {merge: true});
    return {count, escalated: count >= 3};
  });
};

exports.list = async (db) => {
  const snapshot = await db.collection("_errorReviews").where("status", "==", "pending").get();
  return Promise.all(snapshot.docs.map(async (doc) => {
    const reporters = await doc.ref.collection("reporters").get();
    const threads = await Promise.all(reporters.docs.map(async (reporter) => {
      const thread = await db.collection("correction_requests").doc(reporter.data().threadId).get();
      if (!thread.exists) return null;
      const data = thread.data();
      return {id: thread.id, requesterName: data.requesterName,
        description: data.description, status: data.status, messages: data.messages || []};
    }));
    const data = doc.data();
    return {id: doc.id, recordType: data.recordType, recordId: data.recordId,
      name: data.name, count: data.count, notes: threads.filter(Boolean)};
  }));
};
