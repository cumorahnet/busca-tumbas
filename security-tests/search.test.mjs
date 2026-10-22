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
 const ctx={document:{getElementById:id=>id.endsWith('-mode')&&!['search-nombres-mode','search-apellido-paterno-mode','search-apellido-materno-mode'].includes(id)?null:get(id)},Option:function(text,value){return {text,value,dataset:{}};},searchStateChoices:null,searchMunicipalityChoices:null,loadCemeteryCatalog:async()=>catalog,createSearchableLocationSelect:()=>({enable(){},disable(){},destroy(){}}),normalizeSearchText:value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(),normalizeWildcardSearchPattern:value=>value.trim(),hasSearchWildcards:()=>false,getWildcardLiteralPrefix:value=>value,catalogCollection:()=>query,db:{collection:()=>query},auth:{currentUser:{uid:'test'}},showToast:message=>notices.push(message),getFirebaseErrorMessage:err=>err.message,displaySearchResults:value=>{results=value;},console};
 vm.createContext(ctx);
 for (const name of ['isPublicTomb','normalizeSearchText','spanishPhoneticKey','editDistance','soundsSimilar','tombNamePartMatches','normalizeWildcardSearchPattern','hasSearchWildcards','getWildcardLiteralPrefix','matchesSearchPattern','matchesAllSearchTerms']) {
  vm.runInContext(source.match(new RegExp('function '+name+'\\([^]*?\\n}'))[0],ctx);
 }
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

test('name wildcards match words, accents and legacy full names in either match mode',()=>{
 const {ctx}=setup();
 for(const mode of ['exact','similar']) {
  assert.equal(ctx.tombNamePartMatches({nombres:'María Elena'},'nombres','MAR*',mode),true);
  assert.equal(ctx.tombNamePartMatches({nombres:'María Elena'},'nombres','Mar?a',mode),true);
  assert.equal(ctx.tombNamePartMatches({apellido_paterno:'López'},'apellido_paterno','L?pez',mode),true);
  assert.equal(ctx.tombNamePartMatches({nombre_finado:'Juan Hernández López'},'apellido_paterno','Hern*',mode),true);
  assert.equal(ctx.tombNamePartMatches({nombres:'Mario'},'nombres','Mar?a',mode),false);
  assert.equal(ctx.tombNamePartMatches({nombres:'Juan'},'nombres','Ju??n',mode),false);
  assert.equal(ctx.tombNamePartMatches({nombres:'Ana'},'nombres','Ana*',mode),true);
  assert.equal(ctx.tombNamePartMatches({nombres:'Ana'},'nombres','?',mode),false);
  assert.equal(ctx.tombNamePartMatches({nombres:'J'},'nombres','?',mode),true);
 }
});

test('guest search combines name and surname wildcards with a location',async()=>{
 const s=setup([{nombres:'María',apellido_paterno:'López',estado_panteon:'Jalisco'}, {nombres:'Marta',apellido_paterno:'López',estado_panteon:'Puebla'}, {nombres:'Mario',apellido_paterno:'López',estado_panteon:'Jalisco'}]);
 s.ctx.auth.currentUser=null;
 s.get('search-nombres').value='Mar?a';s.get('search-nombres').oninput();
 s.get('search-apellido-paterno').value='L?pez';s.get('search-apellido-paterno').oninput();
 s.get('search-estado-panteon').value='Jalisco';await s.get('search-estado-panteon').onchange();
 await s.ctx.performSearch();assert.deepEqual(Array.from(s.results(),row=>row.nombres),['María']);
});

test('cemetery wildcard patterns support contains, one character and literal punctuation safely',async()=>{
 const s=setup([{nombre_panteon:'Panteón Jardín Eterno'}, {nombre_panteon:'Panteón Municipal'}]);
 s.get('search-nombre-panteon').value='*ETERNO*';s.get('search-nombre-panteon').oninput();
 await s.ctx.performSearch();assert.equal(s.results().length,1);
 assert.equal(s.ctx.matchesSearchPattern('Panteón Municipal','Pante?n Mun*'),true);
 assert.equal(s.ctx.matchesSearchPattern('María','Mar?a'),true);
 assert.equal(s.ctx.matchesSearchPattern('María','Mar??a'),false);
 assert.equal(s.ctx.matchesSearchPattern('Panteón Municipal','*(a|b)*'),false);
});

test('guests can search without a Firebase account',async()=>{
 const s=setup(records);s.ctx.auth.currentUser=null;
 s.get('search-estado-panteon').value='Jalisco';await s.get('search-estado-panteon').onchange();
 await s.ctx.performSearch();assert.equal(s.results().length,2);
});

test('private, pending and rejected tombs stay out of catalog search results',async()=>{
 const s=setup([{nombre_finado:'Public',estado_panteon:'Jalisco'}, {nombre_finado:'Private',estado_panteon:'Jalisco',visibility:'private'}, {nombre_finado:'Pending',estado_panteon:'Jalisco',status:'pending'}, {nombre_finado:'Rejected',estado_panteon:'Jalisco',status:'rejected'}]);
 s.get('search-estado-panteon').value='Jalisco';await s.get('search-estado-panteon').onchange();
 await s.ctx.performSearch();assert.deepEqual(Array.from(s.results(),row=>row.nombre_finado),['Public']);
});
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

test('new search returns the page and the result list to the beginning after rendering',()=>{
 const frames=[];const calls=[];
 const list={scrollTop:450};
 const container={scrollIntoView:options=>calls.push(options)};
 const ctx={requestAnimationFrame:callback=>frames.push(callback),document:{getElementById:id=>id==='tomb-search-result-list'?list:container}};
 vm.createContext(ctx);
 vm.runInContext(source.slice(source.indexOf('function scrollToSearchResultsStart()'),source.indexOf('function displaySearchResults(')),ctx);
 ctx.scrollToSearchResultsStart();
 assert.equal(calls.length,0);
 frames.shift()();
 assert.equal(list.scrollTop,0);
 assert.equal(calls[0].block,'start');
 assert.equal(calls[0].behavior,'instant');
 ctx.document.getElementById=id=>id==='tomb-search-result-list'?null:container;
 ctx.scrollToSearchResultsStart();frames.shift()();
 assert.equal(calls.length,2);
});
