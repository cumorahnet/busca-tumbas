"use strict";
const {normalize, dateKey, tombDuplicate, cemeteryDuplicate} = require("./duplicates");
const {assessSimilarity, suggestsDuplicate} = require("./similarity");

// Shared dates are mandatory for fuzzy tomb matches. Equal names also cover
// exact/compatible identities with incomplete dates. Each pair is assessed once.
function findExistingDuplicates(records, cemetery = false) {
  records = records.filter(record => record.data.status !== "rejected");
  const buckets = new Map();
  const pairs = new Set();
  const matches = [];
  let comparisons = 0;
  for (let i = 0; i < records.length; i++) {
    const {data} = records[i];
    const keys = cemetery ? [
      `region:${normalize(data.stateCode || data.state)}|${normalize(data.municipalityCode || data.municipality)}`,
      ...(data.inegiCemeteryId ? [`inegi:${data.inegiCemeteryId}`] : []),
    ] : [
      `name:${normalize(data.nombre_finado || [data.nombres, data.apellido_paterno, data.apellido_materno].filter(Boolean).join(" "))}`,
      ...[["birth", data.fecha_nacimiento || data.fecha_nacimiento_iso], ["death", data.fecha_defuncion || data.fecha_defuncion_iso]]
          .filter(([, value]) => dateKey(value)).map(([key, value]) => `${key}:${dateKey(value)}`),
    ];
    for (const key of keys.filter(key => !key.endsWith(":"))) {
      const group = buckets.get(key) || [];
      for (const j of group) {
        const pair = `${j}:${i}`;
        if (pairs.has(pair)) continue;
        pairs.add(pair);
        comparisons++;
        const first = records[j];
        const assessment = assessSimilarity(first.data, data, cemetery);
        const exactIdentity = cemetery ? cemeteryDuplicate(first.data, data) : tombDuplicate(first.data, data);
        // Place audits use their identity rule; unlike tombs they have no dates.
        if (!(exactIdentity || (!cemetery && suggestsDuplicate(assessment)))) continue;
        const publication = record => ({id: record.id, name: record.data.nombre_finado || record.data.name || "Sin nombre",
          birth: record.data.fecha_nacimiento || record.data.fecha_nacimiento_iso || null,
          death: record.data.fecha_defuncion || record.data.fecha_defuncion_iso || null,
          cemetery: record.data.nombre_panteon || record.data.name || null,
          photoUrl: record.data.imageUrl || record.data.photoUrl || null});
        matches.push({recordType: cemetery ? "cemetery" : "tomb", first: publication(first), second: publication(records[i]),
          similarity: assessment.score * 100, nameSimilarity: (assessment.fields.find(field => field.label === "Nombre de la persona" || field.label === "Nombre del lugar")?.similarity || 0) * 100,
          fields: assessment.fields, exactIdentity,
          sameImageHash: Boolean(data.image_hash && data.image_hash === first.data.image_hash)});
      }
      group.push(i);
      buckets.set(key, group);
    }
  }
  return {records: records.length, comparisons, matches: matches.sort((a, b) => b.similarity - a.similarity)};
}
module.exports = {findExistingDuplicates};
