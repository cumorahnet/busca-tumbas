"use strict";
const {tombDuplicate, cemeteryDuplicate, normalize} = require("./duplicates");
const {assessSimilarity, similarityReason, suggestsDuplicate} = require("./similarity");
const {createHash} = require("node:crypto");

module.exports = function recordWrites({db, onCall, HttpsError, FieldValue, GeoPoint, requireUser, requireAdmin}) {
  const cemeteryFields = ["country", "name", "normalizedName", "stateCode", "state", "municipalityCode",
    "municipality", "locality", "address", "notes", "location", "photoUrl", "inegiCemeteryId",
    "inegiName", "normalizedInegiName", "aliases", "correctionType", "placeType", "otherPlaceType"];
  const tombFields = ["imageUrl", "geolocation", "panteon_geolocation", "nombre_finado", "nombres",
    "apellido_paterno", "apellido_materno", "fecha_nacimiento", "fecha_nacimiento_iso",
    "fecha_defuncion", "fecha_defuncion_iso", "edad_defuncion", "fecha_nacimiento_estimada",
    "nombre_panteon", "pais_panteon", "estado_panteon", "municipio_panteon", "colonia_panteon",
    "inegi_denue_id", "cemetery_id", "cemetery_source", "record_key", "person_key",
    "image_hash", "image_fingerprint", "nombre_finado_lower", "nombres_lower",
    "apellido_paterno_lower", "apellido_materno_lower", "nombre_panteon_lower",
    "estado_panteon_lower", "municipio_panteon_lower"];
  const writable = (data, allowed) => {
    if (!data || typeof data !== "object" || Array.isArray(data) ||
        Object.keys(data).some((key) => !allowed.includes(key))) {
      throw new HttpsError("invalid-argument", "Campos no válidos.");
    }
    for (const [key, value] of Object.entries(data)) {
      if (["location", "geolocation", "panteon_geolocation"].includes(key)) {
        if (value === null) continue;
        if (!value || !Number.isFinite(value.latitude) || !Number.isFinite(value.longitude) ||
            Math.abs(value.latitude) > 90 || Math.abs(value.longitude) > 180) {
          throw new HttpsError("invalid-argument", "Ubicación no válida.");
        }
      } else if (key === "aliases") {
        if (!Array.isArray(value) || value.length > 10 ||
            value.some((item) => typeof item !== "string" || item.length > 150)) {
          throw new HttpsError("invalid-argument", "Alias no válidos.");
        }
      } else if (key === "fecha_nacimiento_estimada") {
        if (typeof value !== "boolean") throw new HttpsError("invalid-argument", "Indicador no válido.");
      } else if (key === "edad_defuncion") {
        if (value !== null && (!Number.isInteger(value) || value < 0 || value > 130)) {
          throw new HttpsError("invalid-argument", "Edad no válida.");
        }
      } else if (value !== null && (typeof value !== "string" || value.length > 2048)) {
        throw new HttpsError("invalid-argument", "Valor no válido.");
      }
    }
    return {...data};
  };

  const save = async (request, cemetery, edit = false) => {
    const uid = requireUser(request);
    const {recordId, data} = request.data || {};
    if (typeof recordId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(recordId)) {
      throw new HttpsError("invalid-argument", "Identificador no válido.");
    }
    const fields = writable(data, edit ? ["name", "normalizedName", "aliases", "locality", "address", "notes", "location"] :
      cemetery ? cemeteryFields : tombFields);
    if (cemetery ? typeof fields.name !== "string" || fields.name.trim().length < 3 ||
        fields.name.length > 150 || !fields.locality : !normalize(fields.nombre_finado)) {
      throw new HttpsError("invalid-argument", "Completa los datos de identidad.");
    }
    if (!edit && !(cemetery ? fields.photoUrl : fields.imageUrl)) {
      throw new HttpsError("invalid-argument", "Falta la fotografía.");
    }
    if (cemetery && !edit && fields.country !== undefined &&
        (typeof fields.country !== "string" || !fields.country.trim() || fields.country.length > 100 ||
        fields.inegiCemeteryId && normalize(fields.country) !== "mexico")) {
      throw new HttpsError("invalid-argument", "País no válido para el lugar.");
    }
    if (cemetery && !edit && (!fields.stateCode || !fields.municipalityCode ||
        !["cemetery", "church", "hospital", "convent", "other"].includes(fields.placeType) ||
        fields.placeType === "other" && (!fields.otherPlaceType?.trim() || fields.otherPlaceType.length > 100) ||
        fields.inegiCemeteryId && fields.placeType !== "cemetery")) {
      throw new HttpsError("invalid-argument", "Completa la ubicación y el tipo de lugar.");
    }
    for (const key of Object.keys(fields).filter((key) => key.endsWith("_lower"))) {
      fields[key] = normalize(fields[key.slice(0, -6)]) || null;
    }
    if (cemetery) fields.normalizedName = normalize(fields.name);
    const collection = cemetery ? "cemeteries" : "tumbas";
    const reference = db.collection(collection).doc(recordId);
    const disputeId = createHash("sha256").update(`${collection}|${uid}|${recordId}`).digest("hex");
    const disputeRef = db.collection("_duplicateDisputes").doc(disputeId);
    const result = await db.runTransaction(async (transaction) => {
      // All creates and identity edits share this lock, including an empty catalogue.
      const lock = db.collection("_uniquenessLocks").doc(collection);
      await transaction.get(lock);
      const moderation = await transaction.get(db.collection("_moderation").doc(uid));
      if (moderation.exists && moderation.data().suspendedUntil?.toMillis() > Date.now()) {
        throw new HttpsError("permission-denied", "Tu cuenta está suspendida.");
      }
      const current = await transaction.get(reference);
      if (edit && !current.exists) throw new HttpsError("not-found", "El registro ya no existe.");
      if (edit && (current.data().contributorId !== uid || current.data().status !== "pending")) {
        throw new HttpsError("permission-denied", "No puedes editar este lugar.");
      }
      const candidate = {...(edit ? current.data() : {}), ...fields};
      const records = await transaction.get(db.collection(collection));
      const pending = !edit ? await transaction.get(db.collection("_duplicateDisputes").where("status", "==", "pending")) : null;
      const comparisons = records.docs.filter(doc => !edit || doc.id !== recordId)
          .map(doc => ({recordId: doc.id, photoUrl: doc.data().photoUrl || doc.data().imageUrl || null,
            identityDuplicate: cemetery && cemeteryDuplicate(candidate, doc.data()),
            ...assessSimilarity(candidate, doc.data(), cemetery)}));
      const duplicate = comparisons.find(item => item.exact || item.identityDuplicate);
      if (duplicate) throw new HttpsError("already-exists", cemetery ?
        "Coincidencia del 100 %: este panteón o lugar ya está registrado." :
        "Coincidencia del 100 %: esta persona o tumba ya está registrada.", {recordId: duplicate.recordId, similarity: 100});
      if (pending) {
        const samePending = pending.docs.find(doc => doc.data().recordType === (cemetery ? "cemetery" : "tomb") &&
          (assessSimilarity(candidate, doc.data().candidate, cemetery).exact ||
          cemetery && cemeteryDuplicate(candidate, doc.data().candidate)));
        if (samePending) {
          if (samePending.id === disputeId && samePending.data().contributorId === uid) {
            return {disputed: true, disputeId, similarity: samePending.data().similarity, status: "pending"};
          }
          throw new HttpsError("already-exists", "Coincidencia del 100 % con una propuesta que ya está en disputa.");
        }
      }
      const matches = comparisons.filter(item => suggestsDuplicate(item, cemetery)).sort((a, b) => b.score - a.score);
      const existingDispute = !edit && matches.length ? await transaction.get(disputeRef) : null;
      if (edit && matches.length && records.docs.some(doc => doc.id !== recordId &&
          (cemetery ? cemeteryDuplicate(candidate, doc.data()) : tombDuplicate(candidate, doc.data())))) {
        throw new HttpsError("already-exists", "Los cambios coinciden con otro registro.");
      }
      const now = FieldValue.serverTimestamp();
      const published = cemetery ? {...fields, source: "community", status: "pending",
        contributorId: uid, contributorName: request.auth.token.name || request.auth.token.email || "Colaborador",
        contributorEmail: request.auth.token.email || null, createdAt: now, updatedAt: now} :
        {...fields, userId: uid, contributorId: uid, contributor_name: request.auth.token.name ||
          request.auth.token.email || "Colaborador", contributor_email: request.auth.token.email || null,
        visibility: "public", status: "published", timestamp: now};
      if (!edit && matches.length) {
        if (existingDispute?.exists) {
          if (existingDispute.data().status !== "pending") {
            throw new HttpsError("failed-precondition", "Esta propuesta ya fue revisada. Consulta la resolución en Mis aportaciones.");
          }
          return {disputed: true, disputeId, similarity: existingDispute.data().similarity, status: existingDispute.data().status};
        }
        transaction.create(disputeRef, {recordType: cemetery ? "cemetery" : "tomb", recordId,
          contributorId: uid, contributorName: request.auth.token.name || "Colaborador",
          candidate: published, matches: matches.slice(0, 20), matchesCount: matches.length,
          similarity: matches[0].score * 100, reason: similarityReason(matches[0]), status: "pending",
          adminUnread: true, messages: [], createdAt: now, updatedAt: now});
        transaction.set(lock, {updatedAt: now});
        return {disputed: true, disputeId, similarity: matches[0].score * 100, status: "pending"};
      }
      if (!edit && current.exists) throw new HttpsError("already-exists", "El identificador ya está ocupado.");
      if (published.location) published.location = new GeoPoint(published.location.latitude, published.location.longitude);
      if (edit) transaction.update(reference, {...fields, auditActorId: uid, updatedAt: now});
      else transaction.create(reference, published);
      transaction.set(lock, {updatedAt: now});
      return {saved: true, recordId};
    });
    return result;
  };
  const caseReference = (caseId) => {
    if (typeof caseId !== "string" || !/^[a-f0-9]{64}$/.test(caseId)) {
      throw new HttpsError("invalid-argument", "Disputa no válida.");
    }
    return db.collection("_duplicateDisputes").doc(caseId);
  };
  const noteText = (note) => {
    if (typeof note !== "string" || !note.trim() || note.length > 1500) {
      throw new HttpsError("invalid-argument", "Escribe una aclaración (hasta 1500 caracteres).");
    }
    return note.trim();
  };
  const reply = async (request) => {
    const uid = requireUser(request);
    const {caseId, note} = request.data || {};
    const reference = caseReference(caseId);
    const text = noteText(note);
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) throw new HttpsError("not-found", "La disputa no existe.");
      const dispute = snapshot.data();
      const isOwner = dispute.contributorId === uid;
      if (!isOwner) requireAdmin(request);
      if (dispute.status !== "pending") throw new HttpsError("failed-precondition", "La disputa ya está resuelta.");
      if (dispute.messages.length >= 100) throw new HttpsError("resource-exhausted", "Se alcanzó el límite de aclaraciones.");
      transaction.update(reference, {messages: [...dispute.messages, {senderId: uid,
        senderName: isOwner ? "Aportador" : "Administración", text, createdAt: Date.now()}],
      adminUnread: isOwner, updatedAt: FieldValue.serverTimestamp()});
    });
    return {ok: true};
  };
  const resolve = async (request) => {
    requireAdmin(request);
    const {caseId, decision, note, matchedRecordId, matchedRevision} = request.data || {};
    if (!["distinct", "duplicate", "replace"].includes(decision)) throw new HttpsError("invalid-argument", "Resolución no válida.");
    if (decision !== "distinct" && (typeof matchedRecordId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(matchedRecordId) ||
        !matchedRevision || !Number.isInteger(matchedRevision.seconds) || !Number.isInteger(matchedRevision.nanoseconds))) {
      throw new HttpsError("invalid-argument", "Compara y selecciona la publicación correcta antes de resolver.");
    }
    const reference = caseReference(caseId);
    const text = noteText(note);
    const alternativeId = createHash("sha256").update(`resolved|${caseId}`).digest("hex");
    const audit = db.collection("_adminAudit").doc();
    return db.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) throw new HttpsError("not-found", "La disputa no existe.");
      const dispute = snapshot.data();
      if (dispute.status !== "pending") throw new HttpsError("failed-precondition", "La disputa ya está resuelta.");
      const cemetery = dispute.recordType === "cemetery";
      const collection = cemetery ? "cemeteries" : "tumbas";
      const lock = db.collection("_uniquenessLocks").doc(collection);
      await transaction.get(lock);
      const records = await transaction.get(db.collection(collection));
      const selected = records.docs.find(doc => doc.id === matchedRecordId);
      if (decision !== "distinct") {
        if (!(dispute.matches || []).some(match => match.recordId === matchedRecordId) || !selected) {
          throw new HttpsError("failed-precondition", "La publicación elegida ya no está disponible. Actualiza la comparación.");
        }
        if (selected.updateTime.seconds !== matchedRevision.seconds || selected.updateTime.nanoseconds !== matchedRevision.nanoseconds) {
          throw new HttpsError("failed-precondition", "La publicación cambió desde que la comparaste. Vuelve a revisarla.");
        }
      }
      const targetId = records.docs.some(doc => doc.id === dispute.recordId) ? alternativeId : dispute.recordId;
      const target = db.collection(collection).doc(targetId);
      const targetSnapshot = await transaction.get(target);
      if (decision === "distinct" && (targetSnapshot.exists || records.docs.some(doc =>
        assessSimilarity(dispute.candidate, doc.data(), cemetery).exact))) {
        throw new HttpsError("already-exists", "Coincidencia del 100 %: no se puede aprobar como un registro diferente.");
      }
      if (decision === "replace" && records.docs.some(doc => doc.id !== matchedRecordId &&
          assessSimilarity(dispute.candidate, doc.data(), cemetery).exact)) {
        throw new HttpsError("already-exists", "La propuesta coincide al 100 % con otra publicación. No se puede sustituir esta entrada.");
      }
      const now = FieldValue.serverTimestamp();
      if (decision === "distinct" || decision === "replace") {
        const candidate = {...dispute.candidate, resolvedDisputeId: caseId};
        if (candidate.location) candidate.location = new GeoPoint(candidate.location.latitude, candidate.location.longitude);
        if (cemetery) Object.assign(candidate, {createdAt: now, updatedAt: now});
        else Object.assign(candidate, {timestamp:now, last_updated:now, last_updated_by:request.auth.uid});
        if (decision === "replace") {
          // Keep the canonical ID so tomb/cemetery references remain valid.
          transaction.create(db.collection("_mergedRecords").doc(`dispute_${caseId}`), {
            original: selected.data(), canonicalId: matchedRecordId, collection,
            disputeId: caseId, replacedBy: request.auth.uid, mergedAt: now});
          if (cemetery) candidate.status = selected.data().status === "approved" ? "approved" : "pending";
          transaction.set(db.collection(collection).doc(matchedRecordId), candidate);
        } else transaction.create(target, candidate);
      }
      const status = decision === "duplicate" ? "rejected" : "approved";
      transaction.update(reference, {status,
        resolution: text, decision, selectedPublication: decision === "replace" ? "candidate" : decision === "duplicate" ? "existing" : "both",
        matchedRecordId: matchedRecordId || null,
        publishedRecordId: decision === "replace" ? matchedRecordId : decision === "distinct" ? targetId : null,
        reviewedBy: request.auth.uid, reviewedAt: now, updatedAt: now, adminUnread: false});
      transaction.set(lock, {updatedAt: now});
      transaction.set(audit, {action: "resolve_duplicate_dispute", caseId, decision, note: text,
        matchedRecordId: matchedRecordId || null, ...(decision === "replace" ? {before: selected.data()} : {}),
        actor: request.auth.uid, contributorId: dispute.contributorId, createdAt: now});
      return {ok: true, status};
    });
  };
  return {
    crearAportacionTumba: onCall({auditOperation:"crearAportacionTumba", enforceAppCheck: false}, (request) => save(request, false)),
    crearAportacionPanteon: onCall({auditOperation:"crearAportacionPanteon", enforceAppCheck: false}, (request) => save(request, true)),
    actualizarAportacionPanteon: onCall({auditOperation:"actualizarAportacionPanteon", enforceAppCheck: false}, (request) => save(request, true, true)),
    aclararDisputaDuplicado: onCall({auditOperation:"aclararDisputaDuplicado", enforceAppCheck: false}, reply),
    resolverDisputaDuplicado: onCall({auditOperation:"resolverDisputaDuplicado", enforceAppCheck: false}, resolve),
    obtenerComparacionDisputa: onCall({enforceAppCheck: false}, async request => {
      requireAdmin(request);
      const snapshot = await caseReference(request.data?.caseId).get();
      if (!snapshot.exists) throw new HttpsError("not-found", "La disputa no existe.");
      const dispute = snapshot.data();
      const cemetery = dispute.recordType === "cemetery";
      const collection = cemetery ? "cemeteries" : "tumbas";
      const matches = await Promise.all((dispute.matches || []).map(async match => {
        const current = await db.collection(collection).doc(match.recordId).get();
        if (!current.exists) return {...match, missing: true, publication: null};
        const data = current.data();
        const keys = ["nombre_finado", "nombres", "apellido_paterno", "apellido_materno", "fecha_nacimiento",
          "fecha_defuncion", "edad_defuncion", "nombre_panteon", "estado_panteon", "municipio_panteon", "colonia_panteon",
          "pais_panteon", "name", "state", "municipality", "locality", "address", "notes", "imageUrl", "photoUrl",
          "inegiName", "contributor_name", "contributorName", "status"];
        return {...match, publication: Object.fromEntries(keys.filter(key => data[key] !== undefined).map(key => [key, data[key]])),
          revision: {seconds: current.updateTime.seconds, nanoseconds: current.updateTime.nanoseconds},
          currentComparison: assessSimilarity(dispute.candidate, data, cemetery)};
      }));
      return {caseId: snapshot.id, reason: dispute.reason || similarityReason(dispute.matches[0]), matches};
    }),
  };
};
