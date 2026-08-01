"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

test("Node runtime supports fetch and AbortController", () => {
  assert.equal(typeof fetch, "function");
  assert.equal(typeof AbortController, "function");
});
