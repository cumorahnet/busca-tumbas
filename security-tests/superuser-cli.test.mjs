import test from 'node:test';
import assert from 'node:assert/strict';
import {inspect,validateAccount,validateConfig} from '../scripts/superuser-admin.mjs';
const config={uid:'dedicated',email:'technical@example.com'};
const account={uid:config.uid,email:config.email,disabled:false,customClaims:{platform_admin:true}};
test('configuration rejects wrong projects, malformed identity and the normal account',()=>{
 const valid={...config,projectId:'demo-project'};
 assert.doesNotThrow(()=>validateConfig(valid,'demo-project','contact@example.com'));
 for(const patch of [{projectId:'other'},{email:''},{email:null},{uid:'../admin'},{uid:null}]) {
  assert.throws(()=>validateConfig({...valid,...patch},'demo-project','contact@example.com'),/CONFIGURE_DEDICATED_EMAIL_AND_UID/);
 }
 assert.throws(()=>validateConfig(valid,'demo-project',config.email.toUpperCase()),/NORMAL_ACCOUNT_MUST_REMAIN_SEPARATE/);
});
test('diagnostic only reads Auth and does not write',async()=>{
 const calls=[];
 const auth=new Proxy({getUser:async()=>{calls.push('uid');return account;},getUserByEmail:async()=>{calls.push('email');return account;}},{get(target,name){assert.ok(name in target, 'Unexpected write: '+String(name));return target[name];}});
 assert.equal(await inspect(auth,config,'--check'),account);
 assert.deepEqual(calls,['uid','email']);
});
test('only user-not-found represents an absent account',async()=>{
 for(const code of ['auth/insufficient-permission','auth/internal-error']) {
  await assert.rejects(inspect({getUser:async()=>{throw Object.assign(Error(),{code});}},config,'--check'),{code});
 }
 const missing=async()=>{throw Object.assign(Error(),{code:'auth/user-not-found'});};
 assert.equal(await inspect({getUser:missing,getUserByEmail:missing},config,'--check'),null);
});
test('email collisions and incompatible roles are never overwritten',async()=>{
 await assert.rejects(inspect({getUser:async()=>account,getUserByEmail:async()=>({...account,uid:'ordinary-user'})},config,'--create'),/EMAIL_IN_USE/);
 assert.throws(()=>validateAccount({...account,customClaims:{community_admin:true}},config,'--complete'),/ROLE_CONFLICT/);
 assert.throws(()=>validateAccount({...account,customClaims:{}},config,'--create'),/ROLE_MISSING/);
 assert.throws(()=>validateAccount({...account,disabled:true},config,'--check'),/ACCOUNT_DISABLED/);
});
test('partial recovery requires explicit mode and a disabled dedicated account',()=>{
 const partial={...account,disabled:true,customClaims:{},displayName:'Busca Tumbas - superusuario independiente'};
 assert.doesNotThrow(()=>validateAccount(partial,config,'--complete'));
 assert.throws(()=>validateAccount(partial,config,'--create'),/ACCOUNT_DISABLED/);
 assert.throws(()=>validateAccount({...partial,disabled:false},config,'--complete'),/NOT_PARTIAL_SETUP/);
 assert.throws(()=>validateAccount({...partial,email:'other@example.com'},config,'--complete'),/IDENTITY_CONFLICT/);
});
