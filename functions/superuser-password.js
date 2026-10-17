"use strict";
const {scrypt, timingSafeEqual, randomBytes, createHash} = require("node:crypto");
const {promisify} = require("node:util");
const {Buffer} = require("node:buffer");
const derive = promisify(scrypt);
async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await derive(password, salt, 64);
  return {salt, hash: hash.toString("hex")};
}
async function verifyPassword(password, record) {
  if (typeof password !== "string" || password.length < 16 || password.length > 128 ||
      !/^[a-f0-9]{32}$/.test(record?.salt || "") || !/^[a-f0-9]{128}$/.test(record?.hash || "")) return false;
  const hash = await derive(password, record.salt, 64);
  return timingSafeEqual(hash, Buffer.from(record.hash, "hex"));
}
function elevated(token) {
  return token?.platform_admin === true && token.superuser_session === true &&
    Number.isFinite(token.superuser_until) && token.superuser_until > Date.now() / 1000;
}
function attemptKey(value) {
  return createHash("sha256").update(value).digest("hex");
}
module.exports = {hashPassword, verifyPassword, elevated, attemptKey};
