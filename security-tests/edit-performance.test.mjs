import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('index.html','utf8');
const source=html.match(/async function saveTombDetailEdits\([^]*?\n}/)[0];
function setup({duplicate=false,hashError=false}={}) {
 const values={nombres:'Ana',apellido_paterno:'Perez',apellido_materno:'',fecha_nacimiento:'',fecha_defuncion:'',edad_defuncion:'',nombre_panteon:'Central',estado_panteon:'Hidalgo',municipio_panteon:'Ajacuba',colonia_panteon:''};
 const calls=[],notices=[];
 const ctx={currentDetailTomb:{id:'record',userId:'owner'},auth:{currentUser:{uid:'owner'}},tombOwnerId:t=>t.userId,isSuperuserActive:()=>false,
 document:{querySelectorAll:()=>Object.entries(values).map(([key,value])=>({dataset:{tombEdit:key},value}))},
 calculateAgeFromDates:()=>null,isValidDisplayedDate:()=>true,formatProperName:x=>x,parseSpanishDateToISO:()=>null,composeDeceasedName:()=> 'Ana Perez',buildTombIdentity:()=> 'identity',buildPersonIdentity:()=> 'person',normalizeSearchText:x=>x,
 sha256Hex:async()=>{if(hashError)throw Error('hash failure');return 'hash';},
 db:{collection(){throw Error('Full catalogue read is forbidden');}},
 actualizarAportacionTumbaFunction:async data=>{calls.push(data);return {data:duplicate?{duplicate:{id:'other'}}:{}};},
 showTombEditDuplicate:id=>calls.push(id),renderTombDetail:()=>calls.push('render'),showToast:message=>notices.push(message),getFirebaseErrorMessage:e=>e.message};
 vm.createContext(ctx);vm.runInContext(source,ctx);return {ctx,calls,notices};
}
test('editing delegates uniqueness to the server without reading the full catalogue',async()=>{
 const s=setup();await s.ctx.saveTombDetailEdits();assert.equal(s.calls[0].recordId,'record');assert.ok(s.calls.includes('render'));
});
test('server duplicates remain reviewable and do not update the displayed record',async()=>{
 const s=setup({duplicate:true});await s.ctx.saveTombDetailEdits();assert.ok(s.calls.includes('other'));assert.ok(!s.calls.includes('render'));
});
test('hash failures show feedback instead of escaping as unhandled rejections',async()=>{
 const s=setup({hashError:true});await s.ctx.saveTombDetailEdits();assert.equal(s.calls.length,0);assert.ok(s.notices.some(x=>x.includes('hash failure')));
});
