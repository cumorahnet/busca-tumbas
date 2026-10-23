"use strict";

const target = process.env.FUNCTION_TARGET;
if (!target || process.env.FUNCTIONS_CONTROL_API === "true") {
  // Firebase discovery needs all endpoint metadata before deploying.
  module.exports = require("./handlers");
} else {
  // Let Functions Framework start its HTTP listener before loading Admin SDK
  // and the complete endpoint registry. This also applies to CloudEvent targets.
  let implementation;
  exports[target] = (...args) => {
    if (!implementation) {
      const started = Date.now();
      try {
        const handler = require("./handlers")[target];
        if (typeof handler !== "function") throw new Error(`Unknown function target: ${target}`);
        implementation = handler;
        console.info("Function handlers loaded", {target, durationMs:Date.now() - started});
      } catch (error) {
        console.error("Function initialization failed", {target, message:error.message});
        throw error;
      }
    }
    return implementation(...args);
  };
  console.info("Function server bootstrap ready", {target});
}
