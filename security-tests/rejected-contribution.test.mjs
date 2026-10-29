import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync('index.html','utf8');
const extract=name=>source.match(new RegExp('(?:async )?function '+name+'\\([^]*?\\n}'))[0];
test('a rejected place owner gets the correction and resubmission form; another user cannot open it',()=>{
 const content={innerHTML:''};const context={currentCemeteryContribution:{id:'place',status:'rejected',contributorId:'owner',name:'Iglesia',locality:'Centro'},auth:{currentUser:{uid:'owner'}},isSuperuserActive:()=>false,escapeHtml:s=>String(s??''),recordDetailPhotoHtml:()=>'',document:{getElementById:()=>content}};
 vm.createContext(context);vm.runInContext(extract('enableMyCemeteryEditing'),context);context.enableMyCemeteryEditing();assert.match(content.innerHTML,/CORREGIR Y REENVIAR A REVISIÓN/);assert.match(content.innerHTML,/data-cemetery-edit/);context.auth.currentUser.uid='intruder';content.innerHTML='';context.enableMyCemeteryEditing();assert.equal(content.innerHTML,'');
});
test('rejection appears as an unread message with its reason in the existing inbox',()=>{
 const list={innerHTML:''};const context={auth:{currentUser:{uid:'owner'}},document:{getElementById:()=>list},correctionInboxItems:[{id:'notice',status:'open',readBy:['admin'],tombName:'Lugar',kind:'moderation',action:'reject',description:'Tu aportación fue rechazada. Motivo: fotografía incorrecta'}],escapeHtml:s=>s,inlineJsValue:s=>JSON.stringify(s)};vm.createContext(context);vm.runInContext(extract('renderCorrectionInbox'),context);context.renderCorrectionInbox();assert.match(list.innerHTML,/Sin leer/);assert.match(list.innerHTML,/fotografía incorrecta/);assert.match(list.innerHTML,/openCorrectionThread/);
});
