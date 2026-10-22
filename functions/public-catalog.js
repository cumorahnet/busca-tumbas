"use strict";

// A public projection prevents account emails, ownership IDs and moderation data
// from being exposed when browsing without a session.
const tombFields = ["timestamp", "imageUrl", "geolocation", "panteon_geolocation",
  "nombre_finado", "nombres", "apellido_paterno", "apellido_materno",
  "fecha_nacimiento", "fecha_defuncion", "fecha_nacimiento_iso", "fecha_defuncion_iso", "fecha_nacimiento_estimada", "edad_defuncion",
  "nombres_lower", "apellido_paterno_lower", "apellido_materno_lower", "nombre_finado_lower",
  "nombre_panteon", "pais_panteon", "estado_panteon", "municipio_panteon", "colonia_panteon"];
const cemeteryFields = ["name", "aliases", "country", "state", "municipality", "stateCode", "municipalityCode", "locality", "placeType"];
const filterFields = new Set(["nombre_panteon_lower", "fecha_nacimiento_iso", "fecha_defuncion_iso",
  "nombres_lower", "apellido_paterno_lower", "apellido_materno_lower", "nombre_finado_lower",
  "pais_panteon", "estado_panteon", "municipio_panteon", "estado_panteon_lower", "municipio_panteon_lower"]);

function serialize(value) {
  if (value?.toMillis) return {seconds: Math.floor(value.toMillis() / 1000)};
  if (value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude)) return {latitude: value.latitude, longitude: value.longitude};
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  return value;
}
function project(data, fields) {
  return Object.fromEntries(fields.filter(key => data[key] !== undefined).map(key => [key, serialize(data[key])]));
}
function visible(data) {
  return !["private", "hidden"].includes(data.visibility) && !["rejected", "deleted", "hidden", "pending"].includes(data.status);
}
module.exports = ({db, HttpsError, photoUrl}) => async request => {
  const input = request.data || {};
  const collection = input.collection;
  if (!["tumbas", "cemeteries", "photos"].includes(collection)) throw new HttpsError("invalid-argument", "Catálogo no válido.");
  const idValid = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,1500}$/.test(value);
  if (input.id !== undefined && !idValid(input.id) || input.after !== undefined && !idValid(input.after)) throw new HttpsError("invalid-argument", "Registro no válido.");
  let reference;
  if (collection === "photos") {
    if (!idValid(input.tombId)) throw new HttpsError("invalid-argument", "Tumba no válida.");
    const tomb = await db.collection("tumbas").doc(input.tombId).get();
    if (!tomb.exists || !visible(tomb.data())) return {docs: [], more: false};
    reference = tomb.ref.collection("photos");
  } else reference = db.collection(collection);
  if (input.id) {
    if (collection !== "tumbas") throw new HttpsError("invalid-argument", "Registro no válido.");
    const doc = await reference.doc(input.id).get();
    return {docs: doc.exists && visible(doc.data()) ? [{id: doc.id, data: project(doc.data(), tombFields)}] : [], more: false};
  }
  if (!Array.isArray(input.filters || []) || (input.filters || []).length > 8) throw new HttpsError("invalid-argument", "Filtros no válidos.");
  let query = reference;
  for (const filter of input.filters || []) {
    if (collection !== "tumbas" || !Array.isArray(filter) || filter.length !== 3 || !filterFields.has(filter[0]) ||
      !["==", ">=", "<=", ">", "<"].includes(filter[1]) || typeof filter[2] !== "string" || filter[2].length > 200) {
      throw new HttpsError("invalid-argument", "Filtro no válido.");
    }
    query = query.where(...filter);
  }
  const orders = input.orders || (input.order ? [input.order] : []);
  if (!Array.isArray(orders) || orders.length > 2) throw new HttpsError("invalid-argument", "Orden no válido.");
  for (const order of orders) {
    if (!Array.isArray(order) || order.length !== 2 || !["timestamp", "createdAt", ...filterFields].includes(order[0]) || !["asc", "desc"].includes(order[1])) throw new HttpsError("invalid-argument", "Orden no válido.");
    query = query.orderBy(...order);
  }
  if (input.after) {
    const cursor = await reference.doc(input.after).get();
    if (!cursor.exists) throw new HttpsError("invalid-argument", "Página no válida.");
    query = query.startAfter(cursor);
  }
  const limit = Math.min(100, Math.max(1, Number.isInteger(input.limit) ? input.limit : 100));
  const snapshot = await query.limit(limit).get();
  const docs = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!visible(data)) continue;
    if (collection === "photos") {
      const safe = project(data, ["createdAt", "geolocation"]);
      if (data.capture) safe.capture = project(data.capture, ["source", "capturedAt"]);
      safe.url = await photoUrl(data.storagePath).catch(() => null);
      docs.push({id: doc.id, data: safe});
    } else docs.push({id: doc.id, data: project(data, collection === "tumbas" ? tombFields : cemeteryFields)});
  }
  return {docs, more: snapshot.docs.length === limit, after: snapshot.docs.at(-1)?.id || null};
};
module.exports.project = project;
module.exports.visible = visible;
module.exports.tombFields = tombFields;
