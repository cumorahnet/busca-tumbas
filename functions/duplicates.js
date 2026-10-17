"use strict";

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function dateKey(value) {
  const text = normalize(value);
  if (!text) return "";
  const iso = String(value).trim().match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
  if (iso) return iso.slice(1).filter(Boolean).join("-");
  const match = text.match(/^(?:(\d{1,2})\s+(?:de\s+)?)?([a-z]+)\s+(?:de\s+)?(\d{4})$/);
  if (!match) return text;
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const month = months.findIndex((item) => item.startsWith(match[2]));
  if (month < 0) return text;
  return [match[3], String(month + 1).padStart(2, "0"),
    ...(match[1] ? [match[1].padStart(2, "0")] : [])].join("-");
}

function tombKeys(data) {
  const name = normalize(data.nombre_finado ||
    [data.nombres, data.apellido_paterno, data.apellido_materno].filter(Boolean).join(" "));
  // Human-readable dates carry partial precision; never invent missing components.
  const birth = dateKey(data.fecha_nacimiento || data.fecha_nacimiento_iso);
  const death = dateKey(data.fecha_defuncion || data.fecha_defuncion_iso);
  return {identity: [name, birth, death, data.nombre_panteon,
    data.estado_panteon, data.municipio_panteon, data.colonia_panteon,
    data.pais_panteon || "México"].map(normalize).join("|"),
  person: name && (birth || death) ? [name, birth, death].join("|") : ""};
}

function cemeteryDuplicate(a, b) {
  if (a.inegiCemeteryId && a.inegiCemeteryId === b.inegiCemeteryId) return true;
  const region = (data) => [data.stateCode || data.state, data.municipalityCode || data.municipality]
      .map(normalize).join("|");
  if (region(a) !== region(b)) return false;
  const names = (data) => [data.name, data.inegiName, ...(data.aliases || [])].map(normalize).filter(Boolean);
  const sharedName = names(a).some((name) => names(b).includes(name));
  if (!sharedName) return false;
  if (normalize(a.locality) === normalize(b.locality)) return true;
  const point = (data) => ({lat: data.location?.latitude, lon: data.location?.longitude});
  const p = point(a); const q = point(b);
  if (![p.lat, p.lon, q.lat, q.lon].every(Number.isFinite)) return false;
  const rad = Math.PI / 180;
  const x = (p.lon - q.lon) * Math.cos((p.lat + q.lat) / 2 * rad);
  return Math.hypot(p.lat - q.lat, x) * rad * 6371000 < 150;
}

function tombDuplicate(a, b) {
  const x = tombKeys(a); const y = tombKeys(b);
  if (x.identity === y.identity || Boolean(x.person && x.person === y.person)) return true;
  const name = (data) => normalize(data.nombre_finado ||
    [data.nombres, data.apellido_paterno, data.apellido_materno].filter(Boolean).join(" "));
  const [nameA, birthA, deathA] = [name(a), dateKey(a.fecha_nacimiento || a.fecha_nacimiento_iso),
    dateKey(a.fecha_defuncion || a.fecha_defuncion_iso)];
  const [nameB, birthB, deathB] = [name(b), dateKey(b.fecha_nacimiento || b.fecha_nacimiento_iso),
    dateKey(b.fecha_defuncion || b.fecha_defuncion_iso)];
  const compatible = (left, right) => !left || !right || left === right ||
    left.startsWith(right + "-") || right.startsWith(left + "-");
  const place = (data) => [data.nombre_panteon, data.estado_panteon, data.municipio_panteon,
    data.pais_panteon || "México"].map(normalize);
  const placeA = place(a); const placeB = place(b);
  const samePlace = placeA.every(Boolean) && placeA.join("|") === placeB.join("|");
  return Boolean(nameA) && nameA === nameB && compatible(birthA, birthB) && compatible(deathA, deathB) &&
    Boolean(birthA && birthB || deathA && deathB || samePlace);
}

module.exports = {normalize, dateKey, tombKeys, tombDuplicate, cemeteryDuplicate};
