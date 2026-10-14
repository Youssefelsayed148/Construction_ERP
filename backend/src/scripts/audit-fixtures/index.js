'use strict';

// Happy-path fixtures for the R2 mutation audit registry (mutation-audit.pg.test.js).
// Each entry is `async (ctx) => ({ path, body, status })` and must create its own
// prerequisites on the throwaway database through ctx helpers. No placeholders,
// disabled entries or 4xx allowances. Aliases (v1 mounts) need their own entry.
// Keep one file per route family; add the file name here.
const FAMILIES = ['commercial'];

module.exports = Object.assign({}, ...FAMILIES.map(name => require(`./${name}`)));
