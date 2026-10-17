"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {hashPassword,verifyPassword,elevated} = require("./superuser-password");
test("password hashes use separate salts and reject wrong passwords",async()=>{
  const password = "Distinct-admin-password-123";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first.hash,second.hash);
  assert.equal(await verifyPassword(password,first),true);
  assert.equal(await verifyPassword("Other-admin-password-123",first),false);
  assert.equal(await verifyPassword(password,{}),false);
  assert.equal(await verifyPassword(null,first),false);
});
test("permanent claim and expired or forged elevation do not authorize administration",()=>{
  const valid = {platform_admin:true,superuser_session:true,superuser_until:Date.now()/1000+60};
  assert.equal(elevated(valid),true);
  for (const patch of [{superuser_session:false},{superuser_until:0},{superuser_until:"9999999999"},{platform_admin:false}]) {
    assert.equal(elevated({...valid,...patch}),false);
  }
  assert.equal(elevated({platform_admin:true}),false);
});
