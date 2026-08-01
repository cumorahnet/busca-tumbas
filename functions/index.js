"use strict";

const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const {setGlobalOptions} = require("firebase-functions/v2");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {getStorage} = require("firebase-admin/storage");
const {getAuth} = require("firebase-admin/auth");

initializeApp();
setGlobalOptions({
  region: "us-central1",
  maxInstances: 20,
  timeoutSeconds: 60,
  memory: "256MiB",
});

const db = getFirestore();
const INEGI_TOKEN = defineSecret("INEGI_TOKEN");
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const ADMIN_EMAIL = "cumorahnet@gmail.com";

function requireUser(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const email = String(request.auth.token.email || "").toLowerCase();
  if (request.auth.token.email_verified !== true && email !== ADMIN_EMAIL) {
    throw new HttpsError(
        "permission-denied",
        "Debes verificar tu correo electrónico.",
    );
  }
  return request.auth.uid;
}

function requireAdmin(request) {
  requireUser(request);
  const email = String(request.auth.token.email || "").toLowerCase();
  if (email !== ADMIN_EMAIL) {
    throw new HttpsError("permission-denied", "Acceso exclusivo del administrador.");
  }
}

exports.obtenerEstadisticasAdmin = onCall(
    {enforceAppCheck: false},
    async (request) => {
      requireAdmin(request);
      const [snapshot, cemeterySnapshot] = await Promise.all([
        db.collection("tumbas").orderBy("timestamp", "desc").get(),
        db.collection("cemeteries").get(),
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
          cemetery: data.nombre_panteon || "Sin panteón",
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
          person: "Aporte de panteón",
          cemetery: data.name || "Sin nombre",
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
          contributor.name = user.email?.toLowerCase() === ADMIN_EMAIL ?
            (user.displayName || "Administrador de Busca Tumbas") :
            (user.displayName || user.email || contributor.name);
          contributor.email = user.email || contributor.email;
        });
      }
      const adminContributor = [...contributors.values()].find(
          (item) => item.email.toLowerCase() === ADMIN_EMAIL,
      );
      if (adminContributor && adminContributor.name === "No identificado") {
        adminContributor.name = "Administrador de Busca Tumbas";
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
        totalCemeteryContributions: cemeterySnapshot.size,
        totalContributors: contributors.size,
        contributors: [...contributors.values()]
            .sort((a, b) => b.contributions - a.contributions),
        records,
      };
    },
);

exports.eliminarRegistroAdmin = onCall(
    {enforceAppCheck: false},
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
      await reference.delete();
      if (userId) {
        await getStorage().bucket()
            .file(`tumbas_images/${userId}/${recordId}.jpg`)
            .delete({ignoreNotFound: true});
      }
      return {deleted: true};
    },
);

exports.vaciarBaseAdmin = onCall(
    {enforceAppCheck: false, timeoutSeconds: 540, memory: "512MiB"},
    async (request) => {
      requireAdmin(request);
      if (request.data?.confirmation !== "BORRAR TODOS LOS REGISTROS") {
        throw new HttpsError("failed-precondition", "La confirmación no coincide.");
      }
      let deleted = 0;
      while (true) {
        const snapshot = await db.collection("tumbas").limit(400).get();
        if (snapshot.empty) break;
        const batch = db.batch();
        snapshot.docs.forEach((document) => batch.delete(document.ref));
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
      await enforceRateLimit(uid, "gemini", 8);

      const base64Image = String(request.data?.base64Image || "");
      if (!base64Image || base64Image.length > 12_000_000) {
        throw new HttpsError(
            "invalid-argument",
            "La imagen está vacía o excede el tamaño permitido.",
        );
      }

      const prompt = [
        "Analiza la imagen de una lápida mexicana.",
        "Devuelve exclusivamente JSON válido con estas propiedades:",
        "nombre_finado, fecha_nacimiento, fecha_defuncion, edad_defuncion, nombre_panteon.",
        "Para cada fecha conserva sólo la precisión visible en la lápida:",
        "YYYY si sólo aparece el año; YYYY-MM si aparecen mes y año;",
        "YYYY-MM-DD únicamente si aparecen año, mes y día.",
        "edad_defuncion debe ser un número entero sólo si la edad aparece en la lápida.",
        "Nunca inventes ni completes un mes o día que no sea visible.",
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
              payload.error?.message || "Gemini rechazó la solicitud.",
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
        const detectedAge = Number.parseInt(data.edad_defuncion, 10);
        return {
          nombre_finado: data.nombre_finado || null,
          fecha_nacimiento: data.fecha_nacimiento || null,
          fecha_defuncion: data.fecha_defuncion || null,
          edad_defuncion: Number.isInteger(detectedAge) &&
            detectedAge >= 0 && detectedAge <= 130 ? detectedAge : null,
          nombre_panteon: data.nombre_panteon || null,
        };
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("unavailable", "Gemini no está disponible.");
      } finally {
        clearTimeout(timer);
      }
    },
);
