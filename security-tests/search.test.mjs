import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('index.html','utf8');
function setup(records=[]) {
 const nodes=new Map();
 const get=id=>{if(!nodes.has(id)) nodes.set(id,{value:'',checked:false,disabled:false,style:{},innerHTML:'',options:[],replaceChildren(...options){this.options=options;this.value=options[0]?.value||'';},add(option){this.options.push(option);}}); return nodes.get(id);};
 for(const key of ['nombres','apellido-paterno','apellido-materno']) get('search-'+key+'-mode').value='exact';
 const where=[];let results=null;const notices=[];
 const query={where(field,operator,value){where.push([field,operator,value]);return this;},orderBy(){return this;},async get(){return {forEach(callback){records.filter(record=>where.every(([field,operator,value])=>operator==='==' ? record[field]===value : true)).forEach((record,index)=>callback({id:String(index),data:()=>record}));}};}};
 const catalog=[{state:'Jalisco',stateCode:'14',municipality:'Guadalajara'},{state:'Jalisco',stateCode:'14',municipality:'Zapopan'},{state:'Puebla',stateCode:'21',municipality:'Puebla'}];
 const ctx={document:{getElementById:id=>id.endsWith('-mode')&&!['search-nombres-mode','search-apellido-paterno-mode','search-apellido-materno-mode'].includes(id)?null:get(id)},Option:function(text,value){return {text,value,dataset:{}};},searchStateChoices:null,searchMunicipalityChoices:null,loadCemeteryCatalog:async()=>catalog,createSearchableLocationSelect:()=>({enable(){},disable(){},destroy(){}}),normalizeSearchText:value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(),normalizeWildcardSearchPattern:value=>value.trim(),hasSearchWildcards:()=>false,getWildcardLiteralPrefix:value=>value,db:{collection:()=>query},auth:{currentUser:{uid:'test'}},showToast:message=>notices.push(message),getFirebaseErrorMessage:err=>err.message,displaySearchResults:value=>{results=value;},console};
 vm.createContext(ctx);
 vm.runInContext(source.slice(source.indexOf('function searchCriterionFields()'),source.indexOf('function selectSearchTombMode()')),ctx);
 vm.runInContext(source.slice(source.indexOf('async function performSearch()'),source.indexOf('function displaySearchResults(')),ctx);
 ctx.resetSearchCriteria();
 return {ctx,get,where,notices,catalog,results:()=>results};
}
test('all criteria start unchecked and fields remain editable',async()=>{
 const s=setup();await s.ctx.loadSearchLocationChoices();
 for(const [key,fields] of Object.entries(s.ctx.searchCriterionFields())) {
  assert.equal(s.get('enable-'+key+'-search').checked,false,key);
  assert.equal(s.get('enable-'+key+'-search').disabled,true,key);
  for(const id of fields) assert.equal(s.get(id).disabled,false,id);
 }
});
test('typing enables a criterion; clearing disables it without locking the input',()=>{
 const s=setup();const input=s.get('search-nombres');const check=s.get('enable-nombres-search');
 input.value='Juan';input.oninput();assert.equal(check.checked,true);assert.equal(check.disabled,false);
 s.ctx.setSearchCriterion('nombres',false);assert.equal(input.value,'Juan');assert.equal(input.disabled,false);
 input.value='   ';input.oninput();assert.equal(check.checked,false);assert.equal(check.disabled,true);
});
test('date range stays active while either bound has a value',()=>{
 const s=setup();const from=s.get('search-fecha-nacimiento-desde');const to=s.get('search-fecha-nacimiento-hasta');
 from.value='1900-01-01';from.oninput();assert.equal(s.get('enable-birth-date-search').checked,true);
 to.value='1950-01-01';to.oninput();from.value='';from.oninput();assert.equal(s.get('enable-birth-date-search').checked,true);
 to.value='';to.oninput();assert.equal(s.get('enable-birth-date-search').checked,false);
});
const records=[{nombre_finado:'One',estado_panteon:'Jalisco',municipio_panteon:'Guadalajara'},{nombre_finado:'Two',estado_panteon:'Jalisco',municipio_panteon:'Zapopan',pais_panteon:'Mexico'},{nombre_finado:'Three',estado_panteon:'Puebla',municipio_panteon:'Puebla',pais_panteon:'Mexico'},{nombre_finado:'Four',estado_panteon:'Texas',municipio_panteon:'Austin',pais_panteon:'Estados Unidos'}];
test('state-only search needs neither country, municipality nor names',async()=>{
 const s=setup(records);s.get('search-estado-panteon').value='Jalisco';await s.get('search-estado-panteon').onchange();
 await s.ctx.performSearch();assert.deepEqual(Array.from(s.results(),row=>row.nombre_finado),['One','Two']);
 assert.equal(s.get('enable-municipality-search').checked,false);
});
test('state plus municipality search combines both criteria',async()=>{
 const s=setup(records);s.get('search-estado-panteon').value='Jalisco';await s.get('search-estado-panteon').onchange();
 s.get('search-municipio-panteon').value='Zapopan';s.get('search-municipio-panteon').onchange();
 await s.ctx.performSearch();assert.equal(s.results().length,1);assert.equal(s.results()[0].nombre_finado,'Two');
});
test('country-only search includes legacy Mexico records and excludes other countries',async()=>{
 const s=setup(records);s.get('search-pais-panteon').value='Mexico';s.get('search-pais-panteon').onchange();
 await s.ctx.performSearch();assert.equal(s.results().length,3);
});
test('changing state clears the former municipality and leaves it optional',async()=>{
 const s=setup();s.get('search-municipio-panteon').value='Zapopan';s.get('search-municipio-panteon').onchange();
 s.get('search-estado-panteon').value='Puebla';await s.get('search-estado-panteon').onchange();
 assert.equal(s.get('search-municipio-panteon').value,'');assert.equal(s.get('enable-municipality-search').checked,false);
 assert.deepEqual(s.get('search-municipio-panteon').options.map(option=>option.value),['','Puebla']);
});
test('empty search does not query the database',async()=>{
 const s=setup(records);await s.ctx.performSearch();assert.equal(s.results(),null);assert.ok(s.notices.length);
});
