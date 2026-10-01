"use strict";

const eslint = require("@eslint/js");

module.exports = [
  {
    ignores: ["node_modules/**"],
  },
  {
    files: ["**/*.js"],
    ...eslint.configs.recommended,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        __dirname: "readonly",
        exports: "readonly",
        AbortController: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        fetch: "readonly",
        module: "readonly",
        process: "readonly",
        require: "readonly",
        setTimeout: "readonly",
      },
    },
  },
];
