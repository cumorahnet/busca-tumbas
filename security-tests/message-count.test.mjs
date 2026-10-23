import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('index.html','utf8');
const source=html.match(/function updateMessagesCount\(\) {[^]*?\n}/)[0];
function setup(admin=false){
    const badge={setAttribute(name,value){this[name]=value;}};
    const ctx={auth:{currentUser:{uid:'member',emailVerified:true}},myDuplicateDisputes:[],adminDuplicateDisputes:[],correctionInboxItems:[],isSuperuserActive:()=>admin,document:{getElementById:()=>badge}};
    vm.createContext(ctx);vm.runInContext(source,ctx);return {ctx,badge};
}
test('counts only open unread conversations and drops the count after reading or resolving',()=>{
    const {ctx,badge}=setup();
    ctx.correctionInboxItems=[{status:'open',readBy:[]},{status:'open',readBy:['member']},{status:'resolved',readBy:[]}];
    ctx.updateMessagesCount();assert.equal(badge.textContent,'1');assert.equal(badge.hidden,false);
    ctx.correctionInboxItems[0].readBy=['member'];ctx.updateMessagesCount();assert.equal(badge.textContent,'0');assert.equal(badge.hidden,true);
    ctx.correctionInboxItems[0]={status:'open',readBy:[]};ctx.updateMessagesCount();assert.equal(badge.textContent,'1');
    ctx.correctionInboxItems[0].status='resolved';ctx.updateMessagesCount();assert.equal(badge.hidden,true);
});
test('counts only pending disputes once, including administrator cases',()=>{
    const {ctx,badge}=setup(true);
    ctx.myDuplicateDisputes=[{id:'shared',status:'pending'},{id:'done',status:'approved'},{id:'rejected',status:'rejected'}];
    ctx.adminDuplicateDisputes=[{id:'shared',status:'pending'},{id:'other',status:'pending'},{id:'closed',status:'approved'}];
    ctx.updateMessagesCount();assert.equal(badge.textContent,'2');
    ctx.myDuplicateDisputes[0].status='approved';ctx.adminDuplicateDisputes.forEach(item=>item.status='approved');ctx.updateMessagesCount();assert.equal(badge.hidden,true);
});
test('regular members do not count administrator cases and signed out users have no badge',()=>{
    const {ctx,badge}=setup();ctx.adminDuplicateDisputes=[{id:'admin',status:'pending'}];ctx.updateMessagesCount();assert.equal(badge.hidden,true);
    ctx.correctionInboxItems=[{status:'open',readBy:[]}];ctx.auth.currentUser=null;ctx.updateMessagesCount();assert.equal(badge.hidden,true);
});
