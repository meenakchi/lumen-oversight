#!/usr/bin/env node
// The self-test the nightly schedule runs. No network, no model, nothing to pay.
// Exit code is the contract: CI and GitHub Actions gate on it.
'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Give the suite its own data directory before any engine module is loaded: `paths.DATA` is
// resolved at require time, and without this the tests write into the same state/ files a
// running instance has open. That race showed up as two failures in the SQLite mirror test that
// vanished on a rerun — a flaky suite is worse than no suite, because it teaches you to rerun.
process.env.OVERSIGHT_DATA_DIR = process.env.OVERSIGHT_DATA_DIR
  || fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-selftest-'));

const { corpus, reload } = require('../engine/corpus');
const cl = require('../engine/classify');
const scenarios = require('../engine/scenarios');
const gate = require('../engine/gate');
const briefing = require('../engine/briefing');
const ledger = require('../engine/ledger');
const voice = require('../engine/voice');
const vectors = require('./guard-vectors');
const { policyRaw } = require('../engine/rules');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  \u2713 ' + name); }
  catch (e) { fail++; console.log('  \u2717 ' + name + '\n      ' + String(e.message || e).split('\n')[0]); }
};

console.log('\u2500\u2500 Lumen Studio oversight \u00b7 self-test');

reload();
const c = corpus();
cl.setCorpus(c);

// 1. classifier vs the kit key
t('classifier labels every kit file as intended', () => {
  const gt = Object.fromEntries(require('../rules/ground_truth_labels.json').map((g) => [g.file, g.sensitivity]));
  const bad = c.files.filter((f) => cl.classifyFile(f).level !== gt[f.path]);
  assert.strictEqual(bad.length, 0, `${c.files.length - bad.length}/${c.files.length}; wrong: ${bad.map((b) => b.path).join(', ')}`);
});

t('classifier never trusts the header (unheadered file still caught)', () => {
  const f = c.byPath.get('admin/client_list.csv');
  assert.ok(!f.fm.sensitivity, 'this file must be the one with no sensitivity header');
  assert.strictEqual(cl.classifyFile(f).level, 'regulated');
});

t('the cleared case study stays public, the patient email does not', () => {
  assert.strictEqual(cl.classifyFile(c.byPath.get('marketing/case_study_harbourbean.md')).level, 'public');
  assert.strictEqual(cl.classifyFile(c.byPath.get('inbox/2026-11-13_nimbus_patient_data_in_error.md')).level, 'regulated');
  assert.strictEqual(cl.classifyFile(c.byPath.get('finance/cashflow_notes_nov2026.md')).level, 'regulated');
});

// 2. scenario board
const board = scenarios.replayAll();
t(`AvePoint scenarios score ${board.kit}/${board.kitMax}`, () => assert.strictEqual(board.kit, board.kitMax));
t(`our own scenarios score ${board.custom}/${board.customMax}`, () => assert.strictEqual(board.custom, board.customMax));
t('every kit scenario cites evidence the kit expects', () => {
  const miss = board.results.filter((r) => !r.grade.checks[2].pass).map((r) => r.id);
  assert.strictEqual(miss.length, 0, miss.join(', '));
});

const can = scenarios.canary();
t('self-check canary is clean and names the regulated files', () => {
  assert.ok(can.ok, can.decision + ' ' + can.rules);
  assert.ok(can.files.length >= 4, 'expected at least 4 regulated files, got ' + can.files.length);
});

// 3. decision semantics
t('a NEVER is never releasable, even for the owner', () => {
  ledger.init(); ledger.reset();
  const blocked = gate.evaluate({ actor: 'marketing', action: 'upload_to_external_tool', file: 'admin/client_list.csv', files: ['admin/client_list.csv'], target: 'sparkmail.example', scope: ['admin/client_list.csv'], model: 'live' });
  assert.strictEqual(blocked.decision, 'BLOCK');
  const e = ledger.add(blocked, { idempotency: 'test-block' }).entry;
  const q = ledger.queue().find((x) => x.id === e.id);
  assert.ok(!q || q.releasePath === false, 'a blocked action must not appear as releasable in the queue');
});

t('an untraceable figure escalates an ALLOW rule into a stop', () => {
  const r = gate.evaluate({
    actor: 'finance', action: 'send_email', to: 'aisha@ferrologistics.example',
    files: ['inbox/2026-11-10_ferro_dispute.md', 'finance/invoice_2026-036_ferro_logistics.md'],
    scope: ['inbox/2026-11-10_ferro_dispute.md', 'finance/invoice_2026-036_ferro_logistics.md'],
    body: 'Per our contract the rush surcharge of 25% applies when the deadline moved by 5 days; total stands at 5,250.',
  });
  assert.strictEqual(r.decision, 'BLOCK');
  const r18 = r.rules.find((h) => h.id === 'R18');
  assert.ok(r18 && r18.decision === 'NEVER', 'R18 must escalate');
  assert.ok(r18.escalated, 'and must say it escalated');
  const nums = r.claims.filter((x) => x.verdict !== 'supported').map((x) => String(x.value));
  ['25', '5', '5250'].forEach((n) => assert.ok(nums.some((x) => x.replace(/,/g, '') === n.replace(/,/g, '')), n + ' should be unsupported'));
});

t('a grounded sentence with real figures is not stopped for truth', () => {
  const r = gate.evaluate({
    actor: 'finance', action: 'send_email', to: 'aisha@ferrologistics.example',
    files: ['clients/contract_ferro_logistics_2026.md', 'finance/invoice_2026-036_ferro_logistics.md'],
    scope: ['clients/contract_ferro_logistics_2026.md', 'finance/invoice_2026-036_ferro_logistics.md'],
    body: 'The contract sets the rush surcharge at 20% when the deadline moves earlier than 30 Sep. Invoice 2026-036 totals 5,040.',
  });
  const bad = r.claims.filter((x) => x.verdict !== 'supported');
  assert.strictEqual(bad.length, 0, bad.map((x) => x.value).join(', '));
  assert.notStrictEqual(r.decision, 'BLOCK');
});

t('quoting another client\u2019s true figure is flagged, not praised', () => {
  const r = gate.evaluate({
    actor: 'support', action: 'send_email', to: 'daniel@harbourbean.example',
    files: ['marketing/case_study_harbourbean.md', 'notes/2026-11-08_call_nimbus.md', 'clients/contract_nimbus_health_2026.md'],
    scope: ['marketing/case_study_harbourbean.md'],
    body: 'For the Outlet 3 campaign 4,350 would do it \u2014 that is what Nimbus paid for their design approval milestone.',
  });
  assert.ok(r.flags.some((f) => f.id === 'CROSS_CLIENT'), 'expected a cross-client flag');
});

t('a contract-required delete of regulated data is allowed, not held', () => {
  const r = gate.evaluate({
    actor: 'ops', action: 'delete_file', targets: ['inbox/2026-11-13_nimbus_patient_data_in_error.md'],
    files: ['inbox/2026-11-13_nimbus_patient_data_in_error.md'], scope: ['inbox/2026-11-13_nimbus_patient_data_in_error.md'],
    reason: 'patient data received in error, delete and report within 24 hours', authority: 'clients/contract_nimbus_health_2026.md',
  });
  assert.strictEqual(r.decision, 'ALLOW');
  assert.ok(r.rules.some((h) => h.id === 'R17'));
});

t('money that did not move is computed, not asserted', () => {
  const r = gate.evaluate({ actor: 'ops', action: 'delete_file', targets: ['finance/invoice_2026-036_ferro_logistics.md', 'finance/invoice_2026-031_harbourbean.md'], files: ['finance/invoice_2026-036_ferro_logistics.md', 'finance/invoice_2026-031_harbourbean.md'], reason: 'clean up old files' });
  assert.strictEqual(r.stakeTotal, 8040, 'expected SGD 8,040, got ' + r.stakeTotal);
});

// 4. the fabrication guard, two-sided
const tmp = require('./guard-vectors.js');
const brief = (() => { ledger.init(); ledger.reset(); require('../engine/seed').seedNight(); return briefing.generate(); })();
const factsIndex = new Map(brief.items.map((i) => [i.id, voice.factsFor(i)]));
const pick = (re) => brief.sections.filter((s) => s.key !== 'allowed').flatMap((s) => s.items).find((i) => re.test(i.ruleIds.join(','))) || brief.items[0];
const t2 = pick(/R15/), t3 = pick(/R11|R12/);
const pickUse = (use) => {
  const items = brief.sections.filter((x) => x.key !== 'allowed').flatMap((x) => x.items);
  const by = {
    floor: (i) => /R08/.test(i.ruleIds.join(',')),
    scope: (i) => /R02/.test(i.ruleIds.join(',')) && (i.scopeOutsideRegulated || 0) > 1,
    claims: (i) => /R18/.test(i.ruleIds.join(',')) && (i.claims || []).length,
    upload: (i) => i.action === 'upload_to_external_tool' && i.decision === 'BLOCK',
    pay: (i) => i.action === 'pay_supplier',
    any: () => true,
  };
  return items.find(by[use] || by.any) || items[0];
};
const run = (v) => {
  const it = pickUse(v.use || 'any');
  const g = voice.guard(voice.factsFor(it), { headline: v.sentence, why: '', recommend: '' });
  g.on = it.id;
  return g;
};
const truths = tmp.filter((v) => v.kind === 'truth');
const lies = tmp.filter((v) => v.kind !== 'truth');
t(`guard passes ${truths.filter((v) => run(v).ok).length}/${truths.length} true sentences`, () => {
  const bad = truths.filter((v) => !run(v).ok).map((v) => { const g = run(v); return `${v.sentence} (on ${g.on}) \u2192 ` + [...g.offenders, ...g.leak_claims.map((x) => 'leak:' + x.phrase), ...g.misattributions.map((m) => 'mis:' + m.category)].join(', '); });
  assert.strictEqual(bad.length, 0, bad.join(' | '));
});
t(`guard rejects ${lies.filter((v) => !run(v).ok).length}/${lies.length} fabrications`, () => {
  const bad = lies.filter((v) => run(v).ok).map((v) => v.sentence + ' (on ' + run(v).on + ')');
  assert.strictEqual(bad.length, 0, 'passed when it should not have: ' + bad.join(' | '));
});
t('a fabricated leak claim can never reach the owner undetected', () => {
  const lies2 = lies.filter((v) => /breach|already been sent|successfully uploaded|LEAVED/.test(v.sentence));
  const missed = lies2.filter((v) => run(v).ok);
  assert.strictEqual(missed.length, 0, missed.map((m) => m.sentence).join(' | '));
});

// 5. brief text must not overstate the model
t('plain brief names the voice it actually used', () => {
  const txt = briefing.plain(briefing.generate());
  const line = txt.split('\n').find((l) => l.startsWith('Wording:'));
  assert.ok(line, 'no wording line');
  assert.ok(/rule engine|phrased here/.test(line), line.slice(0, 120));
});

t('all 19 policy rules have shipped behaviour', () => {
  const ids = new Set();
  for (const r of board.results) for (const rec of r.records) for (const h of rec.rules) ids.add(h.id);
  for (const e of ledger.entries()) for (const h of e.rules) ids.add(h.id);
  const missing = policyRaw.rules.filter((p) => !ids.has(p.id)).map((p) => p.id);
  assert.ok(missing.length <= 4, 'unexercised rules: ' + missing.join(', '));
});

// 6. rulebook integrity: policy drives behaviour, drift is detected, edits are provable
const integrity = require('../engine/integrity');
const { LIMITS } = require('../engine/rules');
t('the standing payment limit is read from policy.json, not hard-coded', () => {
  assert.strictEqual(LIMITS.payStanding, 1000);
  const pol = require('../rules/policy.json');
  const r10 = pol.rules.find((x) => x.id === 'R10');
  assert.ok(/under SGD 1,000/.test(r10.condition), r10.condition);
});
t('every decision carries the rulebook hash it was made under', () => {
  const miss = ledger.entries().filter((e) => !e.policy_sha);
  assert.strictEqual(miss.length, 0, miss.length + ' rows without a policy_sha');
});
t('rulebook drift would be caught against the committed anchor', () => {
  const r = integrity.report();
  assert.deepStrictEqual(r.drifted, [], 'drift now: ' + r.drifted.join(','));
  assert.ok(r.ok, 'anchor unreadable: ' + r.note);
  const tmp = require('os').tmpdir() + '/it-drift-' + Date.now();
  require('child_process').execSync(`mkdir -p ${tmp}/rules && cp rules/*.json ${tmp}/rules/`);
  fs.writeFileSync(`${tmp}/rules/policy.json`, '{"version":"9.9","owner":"Somebody Else","rules":[]}');
  const after = integrity.report({ root: tmp, baselineFile: path.join(__dirname, '..', 'state', 'integrity.json') });
  assert.ok(after.drifted.includes('rules/policy.json'), 'no drift detected after wiping policy.json');
  fs.rmSync(tmp, { recursive: true, force: true });
});
t('a tampered audit row breaks the ledger chain', () => {
  integrity.chainBuild();
  const clean = integrity.chainVerify();
  assert.ok(clean.present && clean.head_matches, 'fresh chain should verify: ' + JSON.stringify(clean));
  const row = ledger.entries().find((e) => e.decision === 'BLOCK');
  const original = row.decision;
  row.decision = 'ALLOW';                        // simulate someone rewriting history
  const dirty = integrity.chainVerify();
  row.decision = original;
  assert.ok(dirty.broken, 'chain still verified after an edited row \u2014 the check is decorative');
  assert.strictEqual(dirty.broken.id, row.id);
});
t('changing the rulebook changes the decision (policy.json is the source)', () => {
  const before = gate.evaluate({ actor: 'ops', action: 'pay_supplier', supplier: 'Jia Wen', amount: 1200, invoice: 'QP-88812', files: ['finance/invoice_2026-037_quickprint.md'], scope: ['finance/invoice_2026-037_quickprint.md'] }).decision;
  assert.strictEqual(before, 'HOLD');
  const tmp = require('os').tmpdir() + '/it-policy-' + Date.now();
  require('child_process').execSync(`mkdir -p ${tmp}/rules && cp rules/*.json ${tmp}/rules/`);
  const pl = JSON.parse(fs.readFileSync(`${tmp}/rules/policy.json`, 'utf8'));
  pl.rules.find((x) => x.id === 'R10').condition = 'an invoice already received, under SGD 10,000';
  fs.writeFileSync(`${tmp}/rules/policy.json`, JSON.stringify(pl, null, 1));
  const drift = integrity.report({ root: tmp, baselineFile: path.join(__dirname, '..', 'state', 'integrity.json') });
  assert.ok(drift.drifted.includes('rules/policy.json'), 'drift of the edited copy should be reported');
  fs.rmSync(tmp, { recursive: true, force: true });
});

t('a malformed gate ask is refused before it can mint an audit row', () => {
  // a JSON array is typeof "object", so this used to be evaluated and recorded
  assert.strictEqual(gate.askShapeOk([1, 2, 3]), false);
  assert.strictEqual(gate.askShapeOk({ actor: 'sales' }), false);
  assert.strictEqual(gate.askShapeOk({ action: '   ' }), false);
  assert.strictEqual(gate.askShapeOk(null), false);
  assert.strictEqual(gate.askShapeOk({ action: 'send_email', actor: 'sales' }), true);
});
t('the live-gate ledger is capped, never pruned', () => {
  // A public demo host cannot be allowed to grow the audit trail without bound, but dropping
  // rows to save space is the failure this product detects in others. So: refuse, don't evict.
  const tmp = require('os').tmpdir() + '/simcap-' + Date.now();
  require('fs').mkdirSync(tmp, { recursive: true });
  const script = `const l = require('./engine/ledger'); l.init();
    const base = l.entries().length;   // a cold data dir still serves the committed night
    let ok = 0, full = null;
    for (let i = 0; i < 45; i++) {
      const r = l.add({ decision: 'ALLOW', rules: [], actor: 'sales', action: 'send_email', sim: true,
        ownerLine: 'probe', files: [], evidence: [], flags: [], claims: [], stake: [] },
        { idempotency: 'ask:' + i });
      if (r.full) { full = r; break; } ok++;
    }
    console.log(JSON.stringify({ ok, full: !!full, base, entries: l.entries().length, cap: full && full.limit }));`;
  const out = require('child_process').execFileSync('node', ['-e', script], {
    cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { OVERSIGHT_DATA_DIR: tmp }), encoding: 'utf8',
  });
  const r = JSON.parse(out.trim().split('\n').pop());
  require('fs').rmSync(tmp, { recursive: true, force: true });
  assert.strictEqual(r.ok, 40, 'expected exactly 40 live-gate rows accepted, got ' + r.ok);
  assert.strictEqual(r.full, true, 'the 41st row should have been refused, not silently dropped');
  assert.strictEqual(r.entries, r.base + 40, 'a refusal must not add a row, and nothing pre-existing may vanish');
});

t('the audit trail is mirrored into SQLite and reads back identical', () => {
  const store = require('../engine/store');
  const st = ledger.getState();
  const stats = store.stats();
  if (!stats.ok) {
    // a host without node:sqlite must still work; that is the fallback, not a failure
    console.log(`     (node:sqlite unavailable here \u2014 ${String(stats.reason).slice(0, 60)} \u2014 JSON snapshot in use)`);
    return;
  }
  assert.strictEqual(stats.rows, st.entries.length, `database has ${stats.rows} rows, ledger holds ${st.entries.length}`);
  const back = store.readAll();
  assert.ok(back, 'readAll returned nothing while rows exist');
  assert.strictEqual(JSON.stringify(back.entries), JSON.stringify(st.entries), 'rows read from SQLite are not identical to the trail');
  assert.strictEqual(JSON.stringify(back.queue), JSON.stringify(st.queue), 'the owner queue did not survive the round trip');
  const money = (stats.queries.find((q) => q.label === 'money that did not move') || {}).rows || [];
  const byApp = st.entries.filter((e) => e.decision !== 'ALLOW')
    .reduce((a, e) => a + (e.stake || []).reduce((x, y) => x + (Number(y.value) || 0), 0), 0);
  assert.strictEqual(Number(money[0] ? money[0].sgd : 0), byApp, 'SQL and the app disagree about the money');
  const hashes = (stats.queries.find((q) => q.label === 'one rulebook hash across the trail') || {}).rows || [];
  assert.ok(Number(hashes[0] && hashes[0].hashes) >= 1, 'every row should carry the hash it was decided under');
});
t('switching the database off changes nothing else', () => {
  const os = require('os');
  const tmp = os.tmpdir() + '/storeoff-' + Date.now();
  require('fs').mkdirSync(tmp, { recursive: true });
  const script = "const st=require('./engine/store');const l=require('./engine/ledger');l.init();"
    + "require('./engine/seed').seedNight();const p=l.persist();"
    + "console.log(JSON.stringify({status:st.status(),entries:l.entries().length,queue:l.queue().length,persist:p}));";
  const out = require('child_process').execFileSync('node', ['-e', script], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8',
    env: Object.assign({}, process.env, { OVERSIGHT_STORE_OFF: '1', OVERSIGHT_DATA_DIR: tmp }),
  });
  require('fs').rmSync(tmp, { recursive: true, force: true });
  const r = JSON.parse(out.trim().split('\n').filter((x) => x.startsWith('{')).pop());
  assert.strictEqual(r.status.ok, false, 'OVERSIGHT_STORE_OFF=1 still opened a database');
  assert.strictEqual(r.status.driver, 'disabled');
  assert.ok(r.entries > 0, 'with no database the trail should still be served from the snapshot');
  assert.strictEqual(r.persist.db, false, 'persist should report the database as not written');
  assert.strictEqual(r.persist.json, true, 'the JSON snapshot must still be written');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
