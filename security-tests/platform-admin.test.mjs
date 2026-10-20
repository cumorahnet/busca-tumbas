import test from 'node:test';
import assert from 'node:assert/strict';
import {setPlatformAdmin} from '../scripts/set-platform-admin.mjs';
const user = {uid:'existing-user',email:'buscatumbas@cumorahnet.com',disabled:false,emailVerified:true,customClaims:{plus:true}};
test('same normal account can receive global claim without changing credentials',async()=>{
 const calls=[]; let current={...user};
 const auth={getUser:async uid=>{assert.equal(uid,user.uid);return current;},setCustomUserClaims:async(uid,claims)=>{calls.push(claims);current={...current,customClaims:claims};}};
 await setPlatformAdmin(auth,user.uid,user.email,false);
 assert.deepEqual(calls,[{plus:true,platform_admin:true}]);
 await setPlatformAdmin(auth,user.uid,user.email,false);
 assert.equal(calls.length,1);
});
test('check reads an ordinary account without granting privileges',async()=>{
 const auth={getUser:async()=>user};
 assert.equal(await setPlatformAdmin(auth,user.uid,user.email,true),user);
});
test('identity mismatch, disabled users and organization roles are rejected before writing',async()=>{
 for(const patch of [{email:'other@example.com'},{disabled:true},{customClaims:{role:'admin'}},{customClaims:{schoolKey:'school'}},{customClaims:{platform_admin:false}}]) {
  await assert.rejects(setPlatformAdmin({getUser:async()=>({...user,...patch})},user.uid,user.email,false));
 }
});
