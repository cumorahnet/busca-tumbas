"use strict";
// Definitions are loaded during discovery and after the serving process is ready.

const {onCall: firebaseOnCall, onRequest, HttpsError} = require("firebase-functions/v2/https");
const {onDocumentWrittenWithAuthContext} = require("firebase-functions/v2/firestore");
const {defineSecret} = require("firebase-functions/params");
const {setGlobalOptions} = require("firebase-functions/v2");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue, GeoPoint} = require("firebase-admin/firestore");
const {getStorage} = require("firebase-admin/storage");
const {getAuth} = require("firebase-admin/auth");
const {verifyPassword, elevated, attemptKey} = require("./superuser-password");

initializeApp();
setGlobalOptions({
  region: "us-central1",
  maxInstances: 20,
  timeoutSeconds: 60,
  memory: "256MiB",
});

const db = getFirestore();
const userAudit = require("./user-audit")({db, FieldValue, HttpsError, requireUser, requireAdmin});
const adminConsole = require("./admin-console")({db, auth:{
  listUsers:(...args) => getAuth().listUsers(...args), getUser:uid => getAuth().getUser(uid),
  updateUser:(...args) => getAuth().updateUser(...args), deleteUser:uid => getAuth().deleteUser(uid),
  revokeRefreshTokens:uid => getAuth().revokeRefreshTokens(uid),
}, FieldValue, HttpsError, requireAdmin});
exports.listarUsuariosAdmin = onCall({enforceAppCheck:false}, adminConsole.users);
exports.gestionarUsuarioAdmin = onCall({auditOperation:"gestionarUsuarioAdmin", enforceAppCheck:false}, adminConsole.manageUser);
exports.obtenerHistorialRegistroAdmin = onCall({enforceAppCheck:false}, adminConsole.history);
function onCall(options, handler) {
  const {auditOperation, ...settings} = options;
  return firebaseOnCall(settings, auditOperation ? request => userAudit.run(auditOperation, request, handler) : handler);
}
exports.registrarActividadBase = onDocumentWrittenWithAuthContext({document:"{collectionId}/{documentId}", retry:true}, userAudit.capture);
exports.registrarActividadDetalle = onDocumentWrittenWithAuthContext({document:"{collectionId}/{documentId}/{subcollectionId}/{childId}", retry:true}, event => userAudit.capture(event, true));
exports.obtenerHistorialUsuario = onCall({enforceAppCheck:false}, userAudit.list);
exports.buscarUsuarioHistorialAdmin = onCall({enforceAppCheck:false}, async request => {
  requireAdmin(request);
  const query = typeof request.data?.query === "string" ? request.data.query.trim() : "";
  if (!query || query.length > 254 || query.includes("/")) throw new HttpsError("invalid-argument", "Escribe el correo o identificador del usuario.");
  try {
    const user = await (query.includes("@") ? getAuth().getUserByEmail(query) : getAuth().getUser(query));
    return {uid:user.uid, name:user.displayName || user.email || user.uid};
  } catch { throw new HttpsError("not-found", "No se encontró la cuenta."); }
});
const accountProfile = require("./account-profile")({db, FieldValue, HttpsError, requireUser,
  requireVerified, requireAdmin, getUser: uid => getAuth().getUser(uid),
  setClaims:async (uid, claims) => getAuth().setCustomUserClaims(uid, {...(await getAuth().getUser(uid)).customClaims, ...claims})});
exports.obtenerMiCuenta = onCall({enforceAppCheck:false}, accountProfile.get);
exports.actualizarMiCuenta = onCall({enforceAppCheck:false}, accountProfile.update);
const tombHistory = require("./tomb-history")({db, FieldValue, HttpsError, requireUser, enforceRateLimit,
  getUser:uid => getAuth().getUser(uid)});
exports.registrarHistorialTumba = onDocumentWrittenWithAuthContext({document:"tumbas/{recordId}", retry:true}, tombHistory.auditTomb);
exports.registrarHistorialFotografia = onDocumentWrittenWithAuthContext({document:"tumbas/{recordId}/photos/{photoId}", retry:true}, tombHistory.auditPhoto);
exports.obtenerHistorialTumba = onCall({enforceAppCheck:false}, tombHistory.list);
exports.contactarColaboradorTumba = onCall({auditOperation:"contactarColaboradorTumba", enforceAppCheck:false}, tombHistory.contact);
exports.descargarFotografiaTumba = onRequest(require("./photo-download")({db, bucket:getStorage().bucket(),
  verifyIdToken:(token, revoked) => getAuth().verifyIdToken(token, revoked)}));
exports.consultarCatalogoPublico = onCall({enforceAppCheck: false}, require('./public-catalog')({
  db, HttpsError,
  photoUrl: storagePath => require('firebase-admin/storage').getDownloadURL(getStorage().bucket().file(storagePath)),
}));
exports.aportarFotoOUbicacionTumba = onCall({auditOperation:"aportarFotoOUbicacionTumba", enforceAppCheck:false}, async request => {
  requireUser(request);
  return require("./tomb-media")({db, bucket:getStorage().bucket(), FieldValue, HttpsError, requireUser})(request);
});
Object.assign(exports, require("./record-writes")({db, onCall, HttpsError, FieldValue, GeoPoint, requireUser, requireAdmin}));
const INEGI_TOKEN = defineSecret("INEGI_TOKEN");
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const CONTRIBUTIONS_PER_REWARD = 10;
const REWARD_DAYS = 30;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

function requireVerified(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  if (request.auth.token.email_verified !== true) {
    throw new HttpsError(
        "permission-denied",
        "Debes verificar tu correo electrónico.",
    );
  }
  return request.auth.uid;
}

function requireUser(request) {
  const uid = requireVerified(request);
  if (request.auth.token.profile_complete !== true && !elevated(request.auth.token)) {
    throw new HttpsError("failed-precondition", "Completa todos los datos de tu cuenta antes de continuar.");
  }
  return uid;
}

function requireAdmin(request) {
  requireUser(request);
  if (!elevated(request.auth.token)) {
    throw new HttpsError("permission-denied", "Acceso exclusivo del administrador.");
  }
}

exports.autorizarSuperusuario = onCall({enforceAppCheck: false}, async (request) => {
  const email = typeof request.data?.email === "string" ? request.data.email.trim().toLowerCase() : "";
  const password = request.data?.password;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof password !== "string" || password.length < 16 || password.length > 128) {
    throw new HttpsError("invalid-argument", "Introduce tu correo y contraseña de superusuario (16–128 caracteres).");
  }
  const now = Date.now();
  async function limit(key, maximum) {
    const limiterRef = db.collection("_superuserAttempts").doc(key);
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(limiterRef);
    const current = snapshot.exists ? snapshot.data() : {};
    const active = Number(current.until) > now;
    if (active && Number(current.count) >= maximum) {
      throw new HttpsError("resource-exhausted", "Demasiados intentos. Espera 15 minutos.");
    }
    transaction.set(limiterRef, {count: active ? Number(current.count) + 1 : 1,
      until: active ? current.until : now + 15 * 60 * 1000});
    });
  }
  await limit("ip-" + attemptKey(request.rawRequest?.ip || "unknown"), 20);
  const denied = () => new HttpsError("permission-denied", "Correo o contraseña de superusuario incorrectos.");
  let user;
  try {
    user = await getAuth().getUserByEmail(email);
  } catch (error) {
    if (error.code === "auth/user-not-found") throw denied();
    throw new HttpsError("unavailable", "No se pudo verificar el acceso. Intenta nuevamente.");
  }
  if (user.disabled || !user.emailVerified || user.customClaims?.platform_admin !== true) throw denied();
  const uid = user.uid;
  await limit(uid, 5);
  const credentialRef = db.collection("_superuserCredentials").doc(uid);
  const snapshot = await credentialRef.get();
  if (!snapshot.exists || !await verifyPassword(password, snapshot.data())) {
    throw denied();
  }
  const token = await getAuth().createCustomToken(uid, {superuser_session: true,
    superuser_until: Math.floor(now / 1000) + 3600});
  return {token};
});

function validDateMilliseconds(value) {
  const milliseconds = value?.toMillis?.() || new Date(value || 0).getTime();
  return Number.isFinite(milliseconds) ? milliseconds : 0;
}

async function countRewardableContributions(uid) {
  const [byContributor, byOwner, approvedCemeteries] = await Promise.all([
    db.collection("tumbas").where("contributorId", "==", uid).get(),
    db.collection("tumbas").where("userId", "==", uid).get(),
    db.collection("cemeteries")
        .where("contributorId", "==", uid)
        .where("status", "==", "approved").get(),
  ]);
  const tombIds = new Set([
    ...byContributor.docs.map((document) => document.id),
    ...byOwner.docs.map((document) => document.id),
  ]);
  return tombIds.size + approvedCemeteries.size;
}

function getMonetizationPolicy(now = Date.now(), config = require("./monetization-config.json")) {
  const start = Date.parse(config.launchStartsAt);
  const end = Date.parse(config.launchEndsAt);
  const validWindow = Number.isFinite(start) && Number.isFinite(end) && end > start;
  const afterGrace = validWindow && now >= end;
  return {
    launchActive: validWindow && now >= start && now < end,
    launchStartsAt: config.launchStartsAt,
    launchEndsAt: config.launchEndsAt,
    reviewAt: config.reviewAt,
    adsEnabled: afterGrace && config.adsEnabled === true,
    plusSalesEnabled: afterGrace && config.adsEnabled === true && config.plusSalesEnabled === true,
  };
}

exports.obtenerEstadoBeneficios = onCall(
    {enforceAppCheck: false},
    async (request) => {
      const uid = requireUser(request);
      const policy = getMonetizationPolicy();
      const contributionCount = await countRewardableContributions(uid);
      const earnedMilestones = Math.floor(
          contributionCount / CONTRIBUTIONS_PER_REWARD,
      );
      const reference = db.collection("_entitlements").doc(uid);
      const now = Date.now();
      const result = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference);
        const current = snapshot.exists ? snapshot.data() : {};
        const grantedMilestones = Math.max(
            0,
            Number(current.contributionMilestonesGranted || 0),
        );
        const pendingMilestones = Math.max(0, earnedMilestones - grantedMilestones);
        const newMilestones = policy.adsEnabled ? pendingMilestones : 0;
        let contributionAdFreeUntil = validDateMilliseconds(
            current.contributionAdFreeUntil,
        );
        const paidUntil = validDateMilliseconds(current.paidUntil);
        if (newMilestones > 0) {
          contributionAdFreeUntil = Math.max(
              now,
              contributionAdFreeUntil,
              paidUntil,
          ) +
            newMilestones * REWARD_DAYS * DAY_IN_MILLISECONDS;
        }
        const adFreeUntil = Math.max(contributionAdFreeUntil, paidUntil);
        transaction.set(reference, {
          contributionCount,
          contributionMilestonesGranted: Math.max(
              grantedMilestones,
              grantedMilestones + newMilestones,
          ),
          contributionAdFreeUntil: contributionAdFreeUntil ?
            new Date(contributionAdFreeUntil) : null,
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
        return {adFreeUntil, paidUntil, newMilestones, pendingMilestones: pendingMilestones - newMilestones};
      });
      const isAdmin = elevated(request.auth.token);
      return {
        adFree: !policy.adsEnabled || isAdmin || result.adFreeUntil > now,
        monetization: policy,
        pendingRewardMonths: result.pendingMilestones,
        source: policy.launchActive ? "launch" : !policy.adsEnabled ? "paused" : isAdmin ? "admin" :
          (result.paidUntil > now ? "paid" :
            (result.adFreeUntil > now ? "contributions" : "free")),
        contributionCount,
        contributionsPerReward: CONTRIBUTIONS_PER_REWARD,
        contributionsToNextReward: CONTRIBUTIONS_PER_REWARD -
          (contributionCount % CONTRIBUTIONS_PER_REWARD),
        adFreeUntil: result.adFreeUntil ?
          new Date(result.adFreeUntil).toISOString() : null,
        rewardDays: REWARD_DAYS,
        newlyGrantedMonths: result.newMilestones,
      };
    },
);

exports.activarPlusAdmin = onCall(
    {auditOperation:"activarPlusAdmin", enforceAppCheck: false},
    async (request) => {
      requireAdmin(request);
      if (!getMonetizationPolicy().plusSalesEnabled) {
        throw new HttpsError("failed-precondition", "Las activaciones de Plus están pausadas durante el lanzamiento y hasta habilitar su venta.");
      }
      const uid = String(request.data?.uid || "").trim();
      const days = Number(request.data?.days);
      if (!/^[A-Za-z0-9_-]{20,128}$/.test(uid) ||
          ![30, 90, 365].includes(days)) {
        throw new HttpsError(
            "invalid-argument",
            "Indica un usuario válido y 30, 90 o 365 días.",
        );
      }
      await getAuth().getUser(uid);
      const reference = db.collection("_entitlements").doc(uid);
      const paidUntil = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference);
        const current = snapshot.exists ? snapshot.data() : {};
        const currentUntil = validDateMilliseconds(current.paidUntil);
        const contributionUntil = validDateMilliseconds(
            current.contributionAdFreeUntil,
        );
        const updatedUntil = Math.max(
            Date.now(),
            currentUntil,
            contributionUntil,
        ) +
          days * DAY_IN_MILLISECONDS;
        transaction.set(reference, {
          paidUntil: new Date(updatedUntil),
          paymentSource: "manual_admin",
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
        return updatedUntil;
      });
      return {paidUntil: new Date(paidUntil).toISOString()};
    },
);

exports.enviarNotaError = onCall({auditOperation:"enviarNotaError", enforceAppCheck: false}, async (request) => {
  requireUser(request);
  await enforceRateLimit(request.auth.uid, "error_note", 20);
  return require("./error-notes").submit(db, request, FieldValue, HttpsError);
});

exports.obtenerNotasErrorAdmin = onCall({enforceAppCheck: false}, async (request) => {
  requireAdmin(request);
  return {cases: await require("./error-notes").list(db)};
});

exports.resolverNotasErrorAdmin = onCall({auditOperation:"resolverNotasErrorAdmin", enforceAppCheck: false}, async (request) => {
  requireAdmin(request);
  const {caseId, note} = request.data || {};
  if (typeof caseId !== "string" || !/^(tomb|cemetery)_[A-Za-z0-9_-]{1,128}$/.test(caseId) ||
      typeof note !== "string" || !note.trim() || note.length > 1000) {
    throw new HttpsError("invalid-argument", "Indica el caso y el resultado de la revisión.");
  }
  await db.runTransaction(async (transaction) => {
    const reference = db.collection("_errorReviews").doc(caseId);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists || snapshot.data().status !== "pending") {
      throw new HttpsError("failed-precondition", "El caso no está pendiente.");
    }
    transaction.update(reference, {status: "reviewed", resolution: note.trim(),
      reviewedBy: request.auth.uid, reviewedAt: FieldValue.serverTimestamp()});
    transaction.set(db.collection("_adminAudit").doc(), {action: "review_error_notes",
      caseId, actor: request.auth.uid, note: note.trim(), createdAt: FieldValue.serverTimestamp()});
  });
  return {ok: true};
});

exports.auditarDuplicadosAdmin = onCall({auditOperation:"auditarDuplicadosAdmin", enforceAppCheck: false}, async (request) => {
  requireAdmin(request);
  const {findExistingDuplicates} = require("./duplicate-audit");
  const [tombs, cemeteries] = await Promise.all([
    db.collection("tumbas").get(), db.collection("cemeteries").get(),
  ]);
  const scan = (snapshot, cemetery) => findExistingDuplicates(snapshot.docs.map(doc => ({id:doc.id, data:doc.data()})), cemetery);
  const tombResult = scan(tombs, false);
  const cemeteryResult = scan(cemeteries, true);
  const matches = [...tombResult.matches, ...cemeteryResult.matches];
  const recordData = new Map([...tombs.docs.map(doc => [`tomb:${doc.id}`,doc.data()]),
    ...cemeteries.docs.map(doc => [`cemetery:${doc.id}`,doc.data()])]);
  const shown = matches.slice(0, 200);
  const resolutionIds = [...new Set(shown.flatMap(match => [match.first,match.second]
      .map(record => recordData.get(`${match.recordType}:${record.id}`)?.resolvedDisputeId).filter(Boolean)))];
  const resolutions = new Map(await Promise.all(resolutionIds.map(async id => {
    const doc = await db.collection("_duplicateDisputes").doc(id).get();
    const data = doc.data();
    return [id, data ? {decision:data.decision || null, note:data.resolution || null, status:data.status} : null];
  })));
  for (const match of shown) match.previousResolutions = [match.first,match.second].map(record =>
    resolutions.get(recordData.get(`${match.recordType}:${record.id}`)?.resolvedDisputeId)).filter(Boolean);
  return {records: tombResult.records + cemeteryResult.records,
    comparisons: tombResult.comparisons + cemeteryResult.comparisons, totalMatches: matches.length,
    matches: shown, checkedAt: new Date().toISOString()};
});

exports.obtenerEstadisticasAdmin = onCall(
    {enforceAppCheck: false},
    async (request) => {
      requireAdmin(request);
      const [snapshot, cemeterySnapshot, totalAccounts] = await Promise.all([
        db.collection("tumbas").orderBy("timestamp", "desc").get(),
        db.collection("cemeteries").get(),
        adminConsole.countAccounts(request),
      ]);
      const contributors = new Map();
      const records = [];
      snapshot.forEach((document) => {
        const data = document.data();
        const contributorId = String(data.contributorId || data.userId || "sin-autor");
        const current = contributors.get(contributorId) || {
          uid: contributorId,
          name: data.contributor_name || data.contributor_email || "No identificado",
          email: data.contributor_email || "",
          contributions: 0,
          lastContribution: null,
        };
        current.contributions += 1;
        const timestamp = data.timestamp?.toDate?.()?.toISOString() || null;
        if (!current.lastContribution && timestamp) current.lastContribution = timestamp;
        contributors.set(contributorId, current);
        records.push({
          id: document.id,
          contributorId,
          type: "tomb",
          person: data.nombre_finado || "Sin nombre",
          birth: data.fecha_nacimiento || "",
          death: data.fecha_defuncion || "",
          locality: data.colonia_panteon || "",
          cemeteryId: data.cemetery_id || "",
          cemetery: data.nombre_panteon || "Sin panteón",
          state: data.estado_panteon || "",
          municipality: data.municipio_panteon || "",
          photoUrl: data.imageUrl || "",
          status: data.status || "published",
          timestamp,
        });
      });
      cemeterySnapshot.forEach((document) => {
        const data = document.data();
        const contributorId = String(data.contributorId || "sin-autor");
        const current = contributors.get(contributorId) || {
          uid: contributorId,
          name: data.contributorName || data.contributorEmail || "No identificado",
          email: data.contributorEmail || "",
          contributions: 0,
          lastContribution: null,
        };
        current.contributions += 1;
        const timestamp = data.createdAt?.toDate?.()?.toISOString() || null;
        if (!current.lastContribution && timestamp) current.lastContribution = timestamp;
        contributors.set(contributorId, current);
        records.push({
          id: document.id,
          contributorId,
          type: "cemetery",
          person: "Aporte de lugar",
          placeType: data.placeType || "cemetery",
          otherPlaceType: data.otherPlaceType || "",
          locality: data.locality || "",
          cemetery: data.name || "Sin nombre",
          state: data.state || "",
          municipality: data.municipality || "",
          photoUrl: data.photoUrl || "",
          status: data.status || "pending",
          timestamp,
        });
      });
      const contributorIds = [...contributors.keys()]
          .filter((uid) => uid !== "sin-autor");
      for (let offset = 0; offset < contributorIds.length; offset += 100) {
        const identifiers = contributorIds.slice(offset, offset + 100)
            .map((uid) => ({uid}));
        const users = await getAuth().getUsers(identifiers);
        users.users.forEach((user) => {
          const contributor = contributors.get(user.uid);
          if (!contributor) return;
          contributor.name = user.customClaims?.platform_admin === true ?
            (user.displayName || "Administrador de Busca Tumbas") :
            (user.displayName || user.email || contributor.name);
          contributor.email = user.email || contributor.email;
        });
      }
      records.forEach((record) => {
        record.contributor =
          contributors.get(record.contributorId)?.name || "No identificado";
        record.contributorUid = record.contributorId;
        delete record.contributorId;
      });
      records.sort((first, second) => String(second.timestamp || "")
          .localeCompare(String(first.timestamp || "")));
      return {
        totalRecords: snapshot.size,
        totalAccounts,
        totalCemeteryContributions: cemeterySnapshot.size,
        totalContributors: contributors.size,
        contributors: [...contributors.values()]
            .sort((a, b) => b.contributions - a.contributions),
        records,
      };
    },
);

exports.eliminarRegistroAdmin = onCall(
    {auditOperation:"eliminarRegistroAdmin", enforceAppCheck: false},
    async (request) => {
      requireAdmin(request);
      const recordId = String(request.data?.recordId || "");
      if (!/^[A-Za-z0-9_-]{20,128}$/.test(recordId)) {
        throw new HttpsError("invalid-argument", "Identificador no válido.");
      }
      const reference = db.collection("tumbas").doc(recordId);
      const snapshot = await reference.get();
      if (!snapshot.exists) throw new HttpsError("not-found", "El registro no existe.");
      const userId = snapshot.data().userId;
      await userAudit.remove(reference, request);
      if (userId) {
        await getStorage().bucket()
            .file(`tumbas_images/${userId}/${recordId}.jpg`)
            .delete({ignoreNotFound: true});
      }
      return {deleted: true};
    },
);

exports.eliminarMiAportacion = onCall({auditOperation:"eliminarMiAportacion", enforceAppCheck: false}, async (request) => {
  requireAdmin(request);
  const {recordType, recordId} = request.data || {};
  if (!["tomb", "cemetery"].includes(recordType) ||
      typeof recordId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(recordId)) {
    throw new HttpsError("invalid-argument", "Aportación no válida.");
  }
  const reference = db.collection(recordType === "tomb" ? "tumbas" : "cemeteries").doc(recordId);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "La aportación ya no existe.");
  const record = snapshot.data();
  await userAudit.remove(reference, request, recordType === "cemetery" ? async transaction => {
    const linked = await transaction.get(db.collection("tumbas").where("cemetery_id", "==", recordId).limit(1));
    if (!linked.empty) throw new HttpsError("failed-precondition", "Este panteón tiene tumbas vinculadas. Reasígnalas antes de eliminarlo.");
  } : null);
  if (recordType === "tomb") {
    const owner = record.userId || record.contributorId;
    if (owner) await getStorage().bucket()
        .file(`tumbas_images/${owner}/${recordId}.jpg`)
        .delete({ignoreNotFound: true});
  } else if (record.photoUrl && record.contributorId) {
    const prefix = `cemetery_images/${record.contributorId}/`;
    try {
      const photoPath = decodeURIComponent(new URL(record.photoUrl).pathname.split("/o/")[1] || "");
      if (photoPath.startsWith(prefix)) {
        await getStorage().bucket().file(photoPath).delete({ignoreNotFound: true});
      }
    } catch (error) {
      console.warn("No se pudo determinar una ruta propia para la foto del panteón:", error);
    }
  }
  return {deleted: true};
});

exports.actualizarAportacionTumba = onCall({auditOperation:"actualizarAportacionTumba", enforceAppCheck: false}, async (request) => {
  const uid = requireUser(request);
  const {recordId, changes} = request.data || {};
  if (typeof recordId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(recordId) ||
      !changes || typeof changes !== "object" || Array.isArray(changes)) {
    throw new HttpsError("invalid-argument", "Datos de edición no válidos.");
  }
  const allowed = ["nombre_finado", "nombre_finado_lower", "nombres", "nombres_lower",
    "apellido_paterno", "apellido_paterno_lower", "apellido_materno", "apellido_materno_lower",
    "fecha_nacimiento", "fecha_nacimiento_iso", "fecha_nacimiento_estimada",
    "fecha_defuncion", "fecha_defuncion_iso", "edad_defuncion", "nombre_panteon",
    "nombre_panteon_lower", "estado_panteon", "estado_panteon_lower", "municipio_panteon",
    "municipio_panteon_lower", "colonia_panteon", "record_key", "person_key"];
  if (!Object.keys(changes).length || Object.keys(changes).some((key) => !allowed.includes(key))) {
    throw new HttpsError("invalid-argument", "Campos de edición no válidos.");
  }
  const reference = db.collection("tumbas").doc(recordId);
  let duplicate = null;
  await db.runTransaction(async (transaction) => {
    const lock = db.collection("_uniquenessLocks").doc("tumbas");
    await transaction.get(lock);
    const currentSnapshot = await transaction.get(reference);
    if (!currentSnapshot.exists) throw new HttpsError("not-found", "El registro ya no existe.");
    const current = currentSnapshot.data();
    const admin = elevated(request.auth.token);
    if (!admin && (current.contributorId || current.userId) !== uid) {
      throw new HttpsError("permission-denied", "No puedes editar esta aportación.");
    }
    const updated = {...current, ...changes};
    const records = await transaction.get(db.collection("tumbas"));
    duplicate = records.docs.find((doc) => {
      if (doc.id === recordId) return false;
      const {assessSimilarity, suggestsDuplicate} = require("./similarity");
      return require("./duplicates").tombDuplicate(updated, doc.data()) || suggestsDuplicate(assessSimilarity(updated, doc.data()));
    }) || null;
    if (duplicate) return;
    transaction.update(reference, {...changes, last_updated: FieldValue.serverTimestamp(), last_updated_by: uid});
    transaction.set(lock, {updatedAt: FieldValue.serverTimestamp()});
  });
  if (duplicate) {
    const data = duplicate.data();
    return {duplicate: {id: duplicate.id, nombre_finado: data.nombre_finado || null,
      fecha_nacimiento: data.fecha_nacimiento || null, fecha_defuncion: data.fecha_defuncion || null,
      nombre_panteon: data.nombre_panteon || null, estado_panteon: data.estado_panteon || null,
      municipio_panteon: data.municipio_panteon || null}};
  }
  return {updated: true};
});

exports.gestionarAporteAdmin = onCall({auditOperation:"gestionarAporteAdmin", enforceAppCheck: false}, async (request) => {
  requireAdmin(request);
  const {recordType, recordId, action, note, days, changes} = request.data || {};
  if (!["tomb", "cemetery"].includes(recordType) ||
      typeof recordId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(recordId) ||
      !["edit", "warn", "reject", "restore", "suspend", "lift"].includes(action)) {
    throw new HttpsError("invalid-argument", "Acción o registro no válido.");
  }
  if (typeof note !== "string" || !note.trim() || note.length > 1000) {
    throw new HttpsError("invalid-argument", "Indica el motivo (hasta 1000 caracteres).");
  }
  if (action === "suspend" && ![1, 7, 30].includes(days)) {
    throw new HttpsError("invalid-argument", "Selecciona 1, 7 o 30 días.");
  }
  const allowed = recordType === "cemetery" ?
    ["name", "normalizedName", "aliases", "locality", "address", "notes", "location"] :
    ["nombre_finado", "nombre_finado_lower", "nombres", "nombres_lower",
      "apellido_paterno", "apellido_paterno_lower", "apellido_materno", "apellido_materno_lower",
      "fecha_nacimiento", "fecha_nacimiento_iso", "fecha_nacimiento_estimada",
      "fecha_defuncion", "fecha_defuncion_iso", "edad_defuncion", "nombre_panteon",
      "nombre_panteon_lower", "estado_panteon", "estado_panteon_lower", "municipio_panteon",
      "municipio_panteon_lower", "colonia_panteon", "record_key", "person_key"];
  if (action === "edit") {
    if (!changes || typeof changes !== "object" || Array.isArray(changes) ||
        !Object.keys(changes).length || Object.keys(changes).some((key) => !allowed.includes(key))) {
      throw new HttpsError("invalid-argument", "Campos de edición no válidos.");
    }
    for (const [key, value] of Object.entries(changes)) {
      const valid = key === "location" ? value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude) &&
          Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180 : key === "aliases" ? Array.isArray(value) && value.length <= 10 &&
          value.every((item) => typeof item === "string" && item.length <= 150) :
        key === "edad_defuncion" ? value === null || Number.isInteger(value) && value >= 0 && value <= 130 :
        key === "fecha_nacimiento_estimada" ? typeof value === "boolean" :
        value === null || typeof value === "string" && value.length <= 500;
      if (!valid) throw new HttpsError("invalid-argument", `Valor no válido: ${key}.`);
    }
    if (recordType === "cemetery" &&
        (typeof changes.name !== "string" || changes.name.trim().length < 3 || changes.name.length > 150 ||
         typeof changes.locality !== "string" || !changes.locality.trim())) {
      throw new HttpsError("invalid-argument", "Escribe el nombre y la localidad.");
    }
  }

  const reference = db.collection(recordType === "tomb" ? "tumbas" : "cemeteries").doc(recordId);
  const audit = db.collection("_adminAudit").doc();
  const notification = db.collection("correction_requests").doc();
  const until = action === "suspend" ? new Date(Date.now() + days * DAY_IN_MILLISECONDS) : null;
  await db.runTransaction(async (transaction) => {
    const lock = db.collection("_uniquenessLocks").doc(recordType === "tomb" ? "tumbas" : "cemeteries");
    if (action === "edit" || action === "restore") await transaction.get(lock);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw new HttpsError("not-found", "El aporte ya no existe.");
    const record = snapshot.data();
    if (action === "edit" || action === "restore") {
      const candidates = await transaction.get(db.collection(recordType === "tomb" ? "tumbas" : "cemeteries"));
      const candidate = {...record, ...(action === "edit" ? changes : {})};
      const {tombDuplicate, cemeteryDuplicate} = require("./duplicates");
      const {assessSimilarity, suggestsDuplicate} = require("./similarity");
      if (candidates.docs.some((doc) => doc.id !== recordId &&
          (recordType === "tomb" ? tombDuplicate(candidate, doc.data()) || suggestsDuplicate(assessSimilarity(candidate, doc.data())) : cemeteryDuplicate(candidate, doc.data())))) {
        throw new HttpsError("already-exists", "Ya existe un registro con esta identidad.");
      }
    }
    const owner = record.contributorId || record.userId;
    if (!owner) throw new HttpsError("failed-precondition", "El aporte no tiene autor identificado.");
    if (action === "edit" || action === "restore") transaction.set(lock, {updatedAt: FieldValue.serverTimestamp()});
    if (["suspend", "lift"].includes(action)) {
      const user = await getAuth().getUser(owner);
      if (user.customClaims?.platform_admin === true || owner === request.auth.uid) {
        throw new HttpsError("failed-precondition", "No puedes suspender una cuenta administrativa.");
      }
      transaction.set(db.collection("_moderation").doc(owner), {
        suspendedUntil: until || new Date(0), reason: note.trim(),
        updatedBy: request.auth.uid, updatedAt: FieldValue.serverTimestamp(),
      });
    }
    let update = {};
    if (action === "edit") update = {...changes};
    if (action === "reject") update = {status: "rejected"};
    if (action === "restore") update = {status: recordType === "tomb" ? "published" : "approved"};
    if (Object.keys(update).length) transaction.update(reference, {
      ...update,
      ...(recordType === "tomb" ? {last_updated: FieldValue.serverTimestamp(), last_updated_by: request.auth.uid} :
        {updatedAt: FieldValue.serverTimestamp(), reviewedAt: FieldValue.serverTimestamp(), reviewedBy: request.auth.uid}),
    });
    const labels = {edit: "Corrección administrativa", warn: "Llamada de atención",
      reject: "Aporte retirado", restore: "Aporte restaurado",
      suspend: "Suspensión de aportaciones", lift: "Suspensión levantada"};
    const message = `${labels[action]}: ${note.trim()}${until ? ` Hasta ${until.toISOString()}. Puedes consultar tus aportes y responder aquí.` : ""}`;
    if (owner !== request.auth.uid) transaction.set(notification, {
      tombId: recordId, recordType, tombName: record.nombre_finado || record.name || "Aporte",
      tombOwnerId: owner, requesterId: request.auth.uid, requesterName: "Administración de Busca Tumbas",
      description: message, status: "open", participants: [owner, request.auth.uid],
      readBy: [request.auth.uid], messages: [{senderId: request.auth.uid,
        senderName: "Administración de Busca Tumbas", text: message, createdAt: Date.now()}],
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(audit, {recordType, recordId, action, note: note.trim(), owner,
      actor: request.auth.uid, before: record, changes: update,
      suspendedUntil: until, createdAt: FieldValue.serverTimestamp()});
  });
  return {ok: true};
});

exports.vaciarBaseAdmin = onCall(
    {auditOperation:"vaciarBaseAdmin", enforceAppCheck: false, timeoutSeconds: 540, memory: "512MiB"},
    async (request) => {
      requireAdmin(request);
      if (request.data?.confirmation !== "BORRAR TODOS LOS REGISTROS") {
        throw new HttpsError("failed-precondition", "La confirmación no coincide.");
      }
      let deleted = 0;
      while (true) {
        const snapshot = await db.collection("tumbas").limit(100).get();
        if (snapshot.empty) break;
        const batch = db.batch();
        snapshot.docs.forEach((document) => userAudit.addDeletion(batch, document, request));
        await batch.commit();
        deleted += snapshot.size;
      }
      await getStorage().bucket().deleteFiles({prefix: "tumbas_images/"});
      return {deleted};
    },
);

async function enforceRateLimit(uid, action, maximum) {
  const now = Date.now();
  const reference = db.doc(`_rateLimits/${uid}_${action}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const data = snapshot.exists ? snapshot.data() : {};
    const windowStart = data.windowStart?.toMillis?.() || 0;
    const inCurrentWindow = now - windowStart < 60000;
    const count = inCurrentWindow ? Number(data.count || 0) : 0;
    if (count >= maximum) {
      throw new HttpsError(
          "resource-exhausted",
          "Has realizado demasiadas solicitudes. Espera un minuto.",
      );
    }
    transaction.set(reference, {
      count: count + 1,
      windowStart: inCurrentWindow ? data.windowStart : new Date(now),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

function validateCoordinates(latitude, longitude) {
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    throw new HttpsError("invalid-argument", "Las coordenadas deben ser numeros.");
  }
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
      !Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new HttpsError("invalid-argument", "Las coordenadas no son válidas.");
  }
  return {latitude: lat, longitude: lon};
}

async function fetchJson(url, serviceName) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {"Accept": "application/json"},
    });
    if (!response.ok) {
      throw new HttpsError(
          "unavailable",
          `${serviceName} respondió con el código ${response.status}.`,
      );
    }
    return await response.json();
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("unavailable", `${serviceName} no está disponible.`);
  } finally {
    clearTimeout(timer);
  }
}

function normalizeDenueItem(item) {
  const latitude = Number(item.Latitud);
  const longitude = Number(item.Longitud);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    id: String(item.Id || `${latitude},${longitude}`),
    nombre: String(item.Nombre || "Panteón sin nombre").trim(),
    colonia: String(item.Colonia || "").trim(),
    ubicacion: String(item.Ubicacion || "").trim(),
    latitude,
    longitude,
  };
}

function catalogRows(payload) {
  return Array.isArray(payload?.datos) ? payload.datos : [];
}

exports.listarUbicacionesINEGI = onCall(
    {enforceAppCheck: false},
    async (request) => {
      const uid = requireUser(request);
      await enforceRateLimit(uid, "catalogo_inegi", 20);

      const entityCode = String(request.data?.entityCode || "").trim();
      if (entityCode && !/^(0[1-9]|[12]\d|3[0-2])$/.test(entityCode)) {
        throw new HttpsError("invalid-argument", "La clave del estado no es válida.");
      }

      const url = entityCode ?
        `https://gaia.inegi.org.mx/wscatgeo/v2/mgem/${entityCode}` :
        "https://gaia.inegi.org.mx/wscatgeo/v2/mgee/";
      const payload = await fetchJson(url, "Catálogo de INEGI");
      const locations = catalogRows(payload).map((item) => ({
        code: String(entityCode ? item.cve_mun : item.cve_ent || "").trim(),
        name: String(item.nomgeo || "").trim(),
      })).filter((item) => item.code && item.name);
      return {locations};
    },
);

exports.buscarPanteonesINEGIV2 = onCall(
    {secrets: [INEGI_TOKEN], enforceAppCheck: false},
    async (request) => {
      const uid = requireUser(request);
      await enforceRateLimit(uid, "inegi", 12);

      const token = INEGI_TOKEN.value();
      const locationQuery = String(request.data?.locationQuery || "")
          .trim().slice(0, 100);
      const entityCode = String(request.data?.entityCode || "").trim();
      const municipalityName = String(request.data?.municipalityName || "")
          .trim().slice(0, 100);
      const hasCoordinates = request.data?.latitude !== undefined &&
        request.data?.longitude !== undefined;

      if (!hasCoordinates &&
          (!/^(0[1-9]|[12]\d|3[0-2])$/.test(entityCode) ||
           municipalityName.length < 2) &&
          locationQuery.length < 3) {
        throw new HttpsError(
            "invalid-argument",
            "Proporciona coordenadas o un municipio/estado.",
        );
      }

      const conditions = ["panteon", "cementerio"];
      let urls;
      if (hasCoordinates) {
        const coordinates = validateCoordinates(
            request.data.latitude,
            request.data.longitude,
        );
        urls = conditions.map((condition) =>
          "https://www.inegi.org.mx/app/api/denue/v1/consulta/Buscar/" +
          `${encodeURIComponent(condition)}/` +
          `${coordinates.latitude},${coordinates.longitude}/5000/` +
          encodeURIComponent(token));
      } else {
        const stateFilter = /^(0[1-9]|[12]\d|3[0-2])$/.test(entityCode) ?
          entityCode : "00";
        const selectedLocation = municipalityName || locationQuery;
        urls = conditions.map((condition) => {
          const terms = `${condition},${selectedLocation}`;
          return "https://www.inegi.org.mx/app/api/denue/v1/consulta/" +
            `BuscarEntidad/${encodeURIComponent(terms)}/${stateFilter}/1/100/` +
            encodeURIComponent(token);
        });
      }

      const responses = await Promise.all(
          urls.map((url) => fetchJson(url, "INEGI")),
      );
      const unique = new Map();
      responses.flat().forEach((item) => {
        const normalized = normalizeDenueItem(item);
        if (normalized) unique.set(normalized.id, normalized);
      });
      return {cemeteries: [...unique.values()].slice(0, 100)};
    },
);

exports.escanearLapidaGemini = onCall(
    {
      secrets: [GEMINI_API_KEY],
      enforceAppCheck: false,
      timeoutSeconds: 90,
      memory: "512MiB",
    },
    async (request) => {
      const uid = requireUser(request);
      const moderation = await db.collection("_moderation").doc(uid).get();
      if (moderation.data()?.suspendedUntil?.toMillis?.() > Date.now()) {
        throw new HttpsError("permission-denied", "Tus aportaciones están suspendidas temporalmente. Revisa los avisos de administración.");
      }
      await enforceRateLimit(uid, "gemini", 8);

      const base64Image = String(request.data?.base64Image || "");
      if (!base64Image || base64Image.length > 12_000_000) {
        throw new HttpsError(
            "invalid-argument",
            "La imagen está vacía o excede el tamaño permitido.",
        );
      }

      const prompt = [
        "Analiza todas las lápidas/personas distintas que sean legibles en la imagen.",
        "Devuelve exclusivamente JSON válido con una propiedad personas, que sea un arreglo de registros; cada registro lleva: nombres, apellido_paterno, apellido_materno, nombre_finado, fecha_nacimiento, fecha_defuncion, edad_defuncion, nombre_panteon.",
        "Si sólo hay una persona, personas debe contener un elemento. No combines datos de personas distintas.",
        "Si no se identifica ninguna persona con certeza, devuelve personas como arreglo vacío.",
        "Separa el nombre de la persona: nombres contiene uno o varios nombres; " +
          "apellido_paterno y apellido_materno contienen un apellido cada uno.",
        "nombre_finado debe contener el nombre completo en el mismo orden visible.",
        "Usa ortografía española correcta, incluidas tildes en nombres y apellidos, aunque falten en la lápida. Corrige sólo errores ortográficos inequívocos; conserva variantes de nombres, iniciales y apellidos dudosos sin inventar ni completar la identidad.",
        "Para cada fecha conserva sólo la precisión visible y claramente legible en la lápida:",
        "YYYY si sólo aparece el año; YYYY-MM si aparecen mes y año;",
        "YYYY-MM-DD únicamente si aparecen año, mes y día.",
        "Si la fecha no aparece, es ilegible o no puedes distinguir con certeza sus cifras, devuelve null para esa fecha.",
        "Nunca deduzcas ni calcules una fecha de nacimiento usando la edad o la fecha de defunción.",
        "edad_defuncion debe ser un número entero sólo si la edad aparece en la lápida.",
        "Nunca adivines ni completes cifras, mes o día que no sean visibles y legibles.",
        "Usa null cuando un dato no aparezca; no inventes información.",
      ].join(" ");

      const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
        "gemini-3.1-flash-lite:generateContent?key=" +
        encodeURIComponent(GEMINI_API_KEY.value());
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 70000);
      try {
        const response = await fetch(url, {
          method: "POST",
          signal: controller.signal,
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            contents: [{
              parts: [
                {text: prompt},
                {inline_data: {mime_type: "image/jpeg", data: base64Image}},
              ],
            }],
            generationConfig: {
              responseMimeType: "application/json",
            },
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new HttpsError(
              "unavailable",
              "Gemini rechazó la solicitud.",
          );
        }
        const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
          throw new HttpsError(
              "internal",
              "Gemini no devolvió datos reconocibles.",
          );
        }
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          throw new HttpsError("internal", "Gemini devolvió JSON inválido.");
        }
        const normalizePerson = (person) => {
          if (!person || typeof person !== "object" || Array.isArray(person)) return null;
          const detectedAge = Number.parseInt(person.edad_defuncion, 10);
          return {
            nombres: person.nombres || null,
            apellido_paterno: person.apellido_paterno || null,
            apellido_materno: person.apellido_materno || null,
            nombre_finado: person.nombre_finado || null,
            fecha_nacimiento: person.fecha_nacimiento || null,
            fecha_defuncion: person.fecha_defuncion || null,
            edad_defuncion: Number.isInteger(detectedAge) && detectedAge >= 0 && detectedAge <= 130 ? detectedAge : null,
            nombre_panteon: person.nombre_panteon || null,
          };
        };
        const people = Array.isArray(data.personas)
          ? data.personas.map(normalizePerson).filter(Boolean).slice(0, 20)
          : [normalizePerson(data)].filter(Boolean);
        if (!people.length) {
          throw new HttpsError("not-found", "No se reconocieron personas legibles. Intenta acercar o recortar una lápida.");
        }
        return {
          personas: people,
        };
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("unavailable", "Gemini no está disponible.");
      } finally {
        clearTimeout(timer);
      }
    },
);
