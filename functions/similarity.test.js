"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {assessSimilarity, suggestsDuplicate} = require("./similarity");

test("tomb suggestions require strictly over 80% name and a matching date", () => {
  const a = {nombre_finado: "abcdefghij", fecha_nacimiento: "1910", fecha_defuncion: "1980"};
  const check = b => suggestsDuplicate(assessSimilarity(a, b));
  assert.equal(check({...a, nombre_finado: "abcdefghxy"}), false); // exactly 80%
  assert.equal(check({...a, nombre_finado: "abcdefgxyz"}), false);
  assert.equal(check({...a, nombre_finado: "abcdefghik"}), true);
  assert.equal(check({nombre_finado: a.nombre_finado}), false);
  assert.equal(check({...a, fecha_nacimiento: "1911", fecha_defuncion: "1981"}), false);
  assert.equal(check({...a, fecha_nacimiento: "1910-02-03", fecha_defuncion: null}), false);
  assert.equal(check({...a, fecha_nacimiento: null}), true);
  assert.equal(check({...a, fecha_defuncion: null}), true);
  assert.equal(suggestsDuplicate({score:0.5, fields:[{label:"Nombre de la persona",similarity:1},{label:"Nacimiento",left:"1910",right:"1910",similarity:1}]}), false);
});

test("equivalent spelling and dates yield 100%; partial or conflicting dates require review", () => {
  const a = {nombre_finado: "María Hernández", fecha_nacimiento: "1910", fecha_defuncion: "05 MAY 1965"};
  assert.ok(assessSimilarity(a, {...a, nombre_finado: "MARIA HERNANDEZ", fecha_defuncion: "1965-05-05"}).exact);
  for (const b of [{...a, fecha_nacimiento: "1910-02-03"}, {...a, fecha_nacimiento: null}, {...a, fecha_defuncion: "1966-05-05"}]) {
    const result = assessSimilarity(a, b);
    assert.ok(result.score > 0.5 && result.score < 1);
    assert.equal(result.exact, false);
  }
});

test("strict half threshold and missing identity cannot manufacture exact matches", () => {
  assert.equal(assessSimilarity({nombre_finado: "abcd"}, {nombre_finado: "abxy"}).score, 0.5);
  assert.equal(assessSimilarity({}, {}).exact, false);
  assert.equal(assessSimilarity({}, {}).score, 0);
});

test("cemetery name changes require dispute; identical INEGI references prove exact identity", () => {
  const a = {name: "Panteón Municipal", stateCode: "15", municipalityCode: "001", locality: "Centro"};
  const changed = assessSimilarity(a, {...a, name: "Panteón Municipal San José"}, true);
  assert.ok(changed.score > 0.5 && changed.score < 1);
  assert.ok(assessSimilarity(a, {...a, name: "PANTEON MUNICIPAL", location: {latitude: 19, longitude: -99}}, true).exact);
  assert.ok(assessSimilarity({...a, inegiCemeteryId: "123"}, {...a, name: "Otro nombre", inegiCemeteryId: "123"}, true).exact);
  assert.equal(assessSimilarity({...a, location:{latitude:19,longitude:-99}},
      {...a, location:{latitude:20,longitude:-100}}, true).exact, false);
});
