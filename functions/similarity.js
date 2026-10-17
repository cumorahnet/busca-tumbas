"use strict";
const {normalize, dateKey} = require("./duplicates");

function textSimilarity(a, b) {
  a = normalize(a); b = normalize(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  let row = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return 1 - row[b.length] / Math.max(a.length, b.length);
}

function assessSimilarity(a, b, cemetery = false) {
  const fields = [];
  const add = (label, left, right, weight, compare = textSimilarity) => {
    if (!left && !right) return;
    const similarity = left && right ? compare(left, right) : 0;
    fields.push({label, left: left || null, right: right || null, weight, similarity});
  };
  const equal = (left, right) => normalize(left) === normalize(right) ? 1 : 0;
  if (cemetery) {
    const names = (data) => [data.name, data.inegiName, ...(data.aliases || [])].filter(Boolean);
    const nameScore = Math.max(0, ...names(a).flatMap(left => names(b).map(right => textSimilarity(left, right))));
    add("Nombre del lugar", a.name, b.name, 40, () => nameScore);
    add("Estado", a.stateCode || a.state, b.stateCode || b.state, 10, equal);
    add("Municipio", a.municipalityCode || a.municipality, b.municipalityCode || b.municipality, 15, equal);
    add("Localidad", a.locality, b.locality, 25);
    const point = data => data.location && Number.isFinite(data.location.latitude) && Number.isFinite(data.location.longitude) ?
      `${data.location.latitude},${data.location.longitude}` : null;
    if (point(a) && point(b)) add("Ubicación GPS", point(a), point(b), 10, () => {
      const rad = Math.PI / 180;
      const p = a.location; const q = b.location;
      const distance = Math.hypot(p.latitude - q.latitude,
        (p.longitude - q.longitude) * Math.cos((p.latitude + q.latitude) / 2 * rad)) * rad * 6371000;
      return distance <= 150 ? 1 : Math.max(0, 1 - (distance - 150) / 1000);
    });
    if (a.inegiCemeteryId && b.inegiCemeteryId) add("Referencia INEGI", a.inegiCemeteryId, b.inegiCemeteryId, 20, equal);
    if (a.inegiCemeteryId && a.inegiCemeteryId === b.inegiCemeteryId) {
      return {score: 1, exact: true, fields, reason: "Misma referencia INEGI"};
    }
  } else {
    const name = data => data.nombre_finado || [data.nombres, data.apellido_paterno, data.apellido_materno].filter(Boolean).join(" ");
    const dates = (left, right) => left === right ? 1 :
      left.startsWith(right + "-") || right.startsWith(left + "-") ? 0.75 : 0;
    add("Nombre de la persona", name(a), name(b), 50);
    add("Nacimiento", dateKey(a.fecha_nacimiento || a.fecha_nacimiento_iso), dateKey(b.fecha_nacimiento || b.fecha_nacimiento_iso), 15, dates);
    add("Defunción", dateKey(a.fecha_defuncion || a.fecha_defuncion_iso), dateKey(b.fecha_defuncion || b.fecha_defuncion_iso), 20, dates);
    const place = data => [data.nombre_panteon, data.estado_panteon, data.municipio_panteon, data.colonia_panteon].filter(Boolean).join(" | ");
    add("Panteón y localidad", place(a), place(b), 15);
    if (a.pais_panteon || b.pais_panteon) add("País", a.pais_panteon || "México", b.pais_panteon || "México", 5, equal);
  }
  const total = fields.reduce((sum, field) => sum + field.weight, 0);
  const score = total ? fields.reduce((sum, field) => sum + field.weight * field.similarity, 0) / total : 0;
  return {score, exact: fields.length > 0 && fields.every(field => field.similarity === 1), fields};
}

function suggestsDuplicate(assessment, cemetery = false) {
  if (assessment.score <= 0.5) return false;
  if (cemetery) return true;
  const name = assessment.fields.find(field => field.label === "Nombre de la persona");
  return name?.similarity > 0.8 && assessment.fields.some(field =>
    ["Nacimiento", "Defunción"].includes(field.label) && field.left && field.right && field.similarity > 0.8);
}

function similarityReason(assessment) {
  const matching = assessment.fields.filter(field => field.similarity > 0.5).map(field => field.label);
  const differences = assessment.fields.filter(field => field.similarity < 1).map(field => field.label);
  return `Posible duplicado: ${(assessment.score * 100).toFixed(2)} % de similitud, superior al 50 %. ` +
    `Coincidencias principales: ${matching.join(", ") || "datos de identidad"}. ` +
    `Datos por aclarar: ${differences.join(", ") || "identidad de las publicaciones"}.`;
}

module.exports = {assessSimilarity, textSimilarity, similarityReason, suggestsDuplicate};
