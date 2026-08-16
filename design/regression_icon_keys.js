// Regression guard for the bug reported 2026-08-09 ("殘留側邊欄"): ICONS.calendar was referenced
// (used by 時程設定 nav item) but never defined in the ICONS object. React silently rendered an
// empty <path d={undefined}/> — no console error, no crash, just a missing icon that threw off
// row alignment and read as a broken/leftover sidebar. This class of bug (referencing an ICONS.x
// key that doesn't exist) produces no error signal at all, so it needs its own static check.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'prototype.html'), 'utf8');

const iconsBlockMatch = src.match(/const ICONS = \{([\s\S]*?)\n\};/);
if (!iconsBlockMatch) {
  console.error('REGRESSION FAILED: could not find `const ICONS = {...}` block — did it get renamed?');
  process.exit(1);
}
const definedKeys = new Set(
  [...iconsBlockMatch[1].matchAll(/^\s*([A-Za-z0-9_]+):/gm)].map(m => m[1])
);

const usedKeys = new Set(
  [...src.matchAll(/ICONS\.([A-Za-z0-9_]+)/g)].map(m => m[1])
);

const missing = [...usedKeys].filter(k => !definedKeys.has(k));

if (missing.length) {
  console.error('REGRESSION FAILED: these ICONS.<key> are referenced but never defined:', missing.join(', '));
  process.exit(1);
}
console.log(`ok - all ${usedKeys.size} referenced ICONS keys are defined (${definedKeys.size} keys total in ICONS object)`);
