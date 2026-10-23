"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(__dirname + "/index.js", "utf8");
function setup(env, load) {
  let loads = 0;
  const output = {exports:{}};
  const logs = [];
  const context = {module:output,exports:output.exports,process:{env},console:{info:(...args)=>logs.push(args),error:(...args)=>logs.push(args)},
    require:name=>{assert.equal(name,"./handlers");loads++;return load();}};
  vm.runInNewContext(source,context);
  return {get exports() {return output.exports;},loads:()=>loads,logs};
}
test("the serving bootstrap does not load handlers or Admin SDK before the first request",async()=>{
  const calls=[];
  const s=setup({FUNCTION_TARGET:"obtenerMiCuenta"},()=>({obtenerMiCuenta:async(...args)=>{calls.push(args);return "ok";}}));
  assert.equal(s.loads(),0);
  const req={headers:{}},res={};
  assert.equal(await s.exports.obtenerMiCuenta(req,res),"ok");
  assert.equal(await s.exports.obtenerMiCuenta(req,res),"ok");
  assert.equal(s.loads(),1);assert.deepEqual(calls,[[req,res],[req,res]]);
});
test("CloudEvents reach the existing Firebase decoder unchanged",async()=>{
  const event={id:"event",data:{value:{fields:{}}}};
  const s=setup({FUNCTION_TARGET:"registrarActividadBase"},()=>({registrarActividadBase:async value=>{assert.equal(value,event);}}));
  assert.equal(s.loads(),0);await s.exports.registrarActividadBase(event);assert.equal(s.loads(),1);
});
test("discovery retains the complete registered endpoint metadata",()=>{
  const definitions={one:{__endpoint:{platform:"gcfv2"}},two:()=>{}};
  for(const env of [{},{FUNCTION_TARGET:"one",FUNCTIONS_CONTROL_API:"true"}]) {
    const s=setup(env,()=>definitions);assert.equal(s.exports,definitions);assert.equal(s.loads(),1);
  }
});
test("a failed initialization is logged and can be retried on the next request",()=>{
  let attempts=0;
  const s=setup({FUNCTION_TARGET:"one"},()=>{if(!attempts++)throw Error("temporary initialization failure");return {one:()=>"recovered"};});
  assert.throws(()=>s.exports.one(),/temporary initialization failure/);
  assert.equal(s.exports.one(),"recovered");assert.equal(s.loads(),2);
  assert.ok(s.logs.some(args=>args[0]==="Function initialization failed"));
});
test("unknown targets fail explicitly instead of silently accepting a request",()=>{
  const s=setup({FUNCTION_TARGET:"missing"},()=>({}));
  assert.throws(()=>s.exports.missing(),/Unknown function target/);
});
