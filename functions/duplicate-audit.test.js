"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {findExistingDuplicates} = require("./duplicate-audit");
const {assessSimilarity, suggestsDuplicate} = require("./similarity");
const {tombDuplicate} = require("./duplicates");
const first = {nombre_finado:"Marce Mociño Ramírez",fecha_nacimiento:"2 de Junio de 1962",fecha_defuncion:"16 de Agosto de 1982",image_hash:"same"};
const second = {...first,nombre_finado:"Marce Muciño Ramírez"};
test("audit finds the live typo pair once despite two matching dates", () => {
  const result = findExistingDuplicates([{id:"a",data:first},{id:"b",data:second}]);
  assert.equal(result.matches.length,1);
  assert.equal(result.comparisons,1);
  assert.equal(result.matches[0].nameSimilarity,95);
  assert.equal(result.matches[0].sameImageHash,true);
});
test("indexed audit matches exhaustive results including missing and partial dates", () => {
  const data = [first,second,{...first,fecha_nacimiento:null}, {...first,fecha_nacimiento:"1962"},
    {nombre_finado:"Otra persona",fecha_defuncion:first.fecha_defuncion},
    {nombre_finado:"Sin fechas",nombre_panteon:"Municipal",estado_panteon:"Hidalgo",municipio_panteon:"Ajacuba"}];
  data.push({...data[5]});
  const records = data.map((value,i) => ({id:String(i),data:value}));
  const expected = [];
  for (let i=0;i<data.length;i++) for (let j=i+1;j<data.length;j++) {
    if (tombDuplicate(data[i],data[j]) || suggestsDuplicate(assessSimilarity(data[i],data[j]))) expected.push(`${i}:${j}`);
  }
  const result = findExistingDuplicates(records);
  assert.deepEqual(result.matches.map(pair=>`${pair.first.id}:${pair.second.id}`).sort(), expected.sort());
});
test("different names and dates avoid a full quadratic comparison", () => {
  const records = Array.from({length:1000},(_,i)=>({id:String(i),data:{nombre_finado:`Persona ${i}`,fecha_defuncion:String(1000+i)}}));
  const result = findExistingDuplicates(records);
  assert.equal(result.comparisons,0);
  assert.equal(result.matches.length,0);
});

test("withdrawn records no longer appear in active duplicate reviews", () => {
  const result = findExistingDuplicates([{id:"a",data:first},{id:"b",data:{...second,status:"rejected"}}]);
  assert.equal(result.matches.length,0);
});
