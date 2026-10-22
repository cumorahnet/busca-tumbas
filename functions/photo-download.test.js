"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {Buffer} = require("node:buffer");
const create = require("./photo-download");
function setup(overrides = {}) {
  const bytes = Buffer.from([255, 216, 255, 217]);
  let reads = 0;
  const handler = create({
    db:{collection:() => ({doc:() => ({get:async () => ({exists:true, data:() => ({imageUrl:"https://firebasestorage.googleapis.com/v0/b/test.bucket/o/tumbas_images%2Fowner%2Fphoto.jpg?token=old", ...overrides.tomb})})})})},
    bucket:{name:"test.bucket", file:path => {reads++; assert.equal(path, "tumbas_images/owner/photo.jpg"); return {getMetadata:async () => [{contentType:"image/jpeg; charset=binary", size:bytes.length, ...overrides.metadata}], download:async () => [bytes]};}},
    verifyIdToken:async (token, revoked) => {assert.equal(token, "valid"); assert.equal(revoked, true); return {uid:"viewer", email_verified:true, profile_complete:true, ...overrides.user};},
  });
  const run = async (request = {}) => {
    const response = {headers:{}, set(key, value) {this.headers[key]=value; return this;}, status(code) {this.code=code; return this;}, send(body) {this.body=body; return this;}};
    await handler({method:"GET", query:{recordId:"tomb"}, headers:{authorization:"Bearer valid"}, ...request}, response);
    return response;
  };
  return {run, bytes, reads:() => reads};
}
test("verified users receive the original image bytes from the app origin", async () => {
  const s=setup(); const response=await s.run();
  assert.equal(response.code, 200);
  assert.deepEqual(response.body, s.bytes);
  assert.equal(response.headers["Content-Type"], "image/jpeg");
  assert.match(response.headers["Cache-Control"], /no-store/);
  assert.match(response.headers["Content-Disposition"], /attachment/);
});
test("anonymous and unverified downloads are denied before reading storage", async () => {
  const s=setup();assert.equal((await s.run({headers:{}})).code, 401);assert.equal(s.reads(), 0);
  const unverified=setup({user:{email_verified:false}});assert.equal((await unverified.run()).code, 401);assert.equal(unverified.reads(), 0);
  const incomplete=setup({user:{profile_complete:false}});assert.equal((await incomplete.run()).code,401);assert.equal(incomplete.reads(),0);
});
test("downloads reject arbitrary hosts, buckets, paths, private records and non-images", async () => {
  for (const imageUrl of ["https://example.com/private", "https://firebasestorage.googleapis.com/v0/b/other/o/tumbas_images%2Fa%2Fb", "https://firebasestorage.googleapis.com/v0/b/test.bucket/o/private%2Fa.jpg"]) {
    const s=setup({tomb:{imageUrl}});assert.equal((await s.run()).code,404);assert.equal(s.reads(),0);
  }
  assert.equal((await setup({tomb:{visibility:"private", userId:"owner"}}).run()).code,404);
  assert.equal((await setup({metadata:{contentType:"text/html"}}).run()).code,422);
  assert.equal((await setup({metadata:{size:9*1024*1024}}).run()).code,422);
});
