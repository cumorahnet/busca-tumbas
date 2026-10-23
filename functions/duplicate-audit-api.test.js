"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
test("audit endpoint returns pair evidence and prior administrative authorization without writes", async () => {
  const data = {nombre_finado:"Marce Mociño Ramírez",fecha_defuncion:"16 de Agosto de 1982",image_hash:"same"};
  const docs = [{id:"a",data:()=>data},{id:"b",data:()=>({...data,nombre_finado:"Marce Muciño Ramírez",resolvedDisputeId:"case1"})}];
  const db = {collection:name=>({get:async()=>({docs:name==="tumbas"?docs:[]}),
    doc:()=>({get:async()=>({data:()=>({decision:"distinct",status:"approved",resolution:"son personas distintas"})})})})};
  const context = {exports:{},db,requireAdmin:()=>{},onCall:(_options,fn)=>fn,require};
  const source = fs.readFileSync(__dirname+"/handlers.js","utf8");
  const endpoint = source.slice(source.indexOf("exports.auditarDuplicadosAdmin ="),source.indexOf("exports.obtenerEstadisticasAdmin ="));
  vm.runInNewContext(endpoint,context);
  const report = await context.exports.auditarDuplicadosAdmin({});
  assert.equal(report.records,2);
  assert.equal(report.totalMatches,1);
  assert.equal(report.matches[0].sameImageHash,true);
  assert.equal(report.matches[0].previousResolutions[0].note,"son personas distintas");
});
