import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('index.html','utf8').match(/async function deleteMyContribution\([^]*?\n}/)[0];
function setup({admin=true,owner='owner',confirm=true,fail=false}={}) {
    const calls=[],notices=[];
    const ctx={myContributions:[],auth:{currentUser:{uid:'owner'}},currentDetailTomb:{id:'record',contributorId:owner},currentCemeteryContribution:null,
        existingDuplicateAudit:{matches:[]},isSuperuserActive:()=>admin,tombOwnerId:item=>item.contributorId,
        confirm:()=>confirm,showToast:message=>notices.push(message),getFirebaseErrorMessage:error=>error.message,
        eliminarMiAportacionFunction:async data=>{calls.push(['delete',data]);if(fail)throw Error('Fallo de servidor');return {data:{deleted:true}};},
        closeRecordDetail:()=>calls.push(['close']),loadAdminStats:async()=>calls.push(['admin']),
        auditExistingDuplicatesAdmin:async()=>calls.push(['audit']),loadMyContributions:async()=>calls.push(['mine'])};
    vm.createContext(ctx);vm.runInContext(source,ctx);
    return {ctx,calls,notices};
}
test('admin deletes from duplicate detail with no personal contributions loaded and refreshes audit',async()=>{
    const s=setup({owner:'another-user'});
    await s.ctx.deleteMyContribution('tomb','record');
    assert.deepEqual(s.calls.map(call=>call[0]),['delete','close','admin','audit']);
    assert.equal(s.calls[0][1].recordId,'record');
});
test('owner cannot delete their contribution without administrator access',async()=>{
    const s=setup({admin:false});await s.ctx.deleteMyContribution('tomb','record');
    assert.deepEqual(s.calls,[]);
    assert.ok(s.notices.some(text=>text.includes('Solo el administrador')));
});
test('non-owner and cancelled confirmation never call deletion',async()=>{
    for(const options of [{admin:false,owner:'other'},{confirm:false}]) {
        const s=setup(options);await s.ctx.deleteMyContribution('tomb','record');assert.equal(s.calls.length,0);
    }
});
test('server failure is visible and does not close detail or refresh as a success',async()=>{
    const s=setup({fail:true});await s.ctx.deleteMyContribution('tomb','record');
    assert.deepEqual(s.calls.map(call=>call[0]),['delete']);assert.ok(s.notices.some(text=>text.includes('Fallo de servidor')));
});
