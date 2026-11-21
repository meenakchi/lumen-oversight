#!/usr/bin/env node
// npm run integrity            \u2192 print the rulebook + ledger-chain report
// npm run integrity:record     \u2192 set/refresh the baseline from the current files
'use strict';
const i = require('../engine/integrity');
if (process.argv.includes('--record')) {
  const r = i.record(process.env.INTEGRITY_BY || 'owner');
  console.log('baseline recorded for', Object.keys(r.hashes || i.current ? {} : {}).length || i.WATCH.length, 'files');
  console.log('  policy.json sha256', i.policyTag());
} else {
  const r = i.report();
  console.log(r.ok ? 'rulebook intact' : (r.drifted.length ? 'DRIFT DETECTED' : 'no baseline yet'));
  for (const row of r.watched) console.log(`  ${(row.drift ? 'DRIFT ' : 'ok    ')}${row.file}  ${row.short || '-'}`);
  const ch = i.chainVerify();
  console.log(ch.present ? `  ledger chain: ${ch.rows} rows, head ${ch.head_matches ? 'matches' : 'BROKEN'}` : '  ledger chain: not built yet (npm run integrity:chain)');
  process.exitCode = r.drifted.length ? 1 : 0;
}
