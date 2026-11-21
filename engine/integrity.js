// integrity.js \u2014 who watches the rulebook?
//
// The oversight layer is only as trustworthy as policy.json. So the policy (and the
// taxonomy the levels come from) is hashed, recorded, re-checked on every read, and the
// hash is stamped into every ledger entry \u2014 which means an audit row tells you not just
// which rule was applied, but which version of the rulebook it came from.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WATCH = ['rules/policy.json', 'rules/taxonomy.json', 'rules/scenarios.json', 'rules/ground_truth_labels.json'];
const FILE = path.join(ROOT, 'state', 'integrity.json');

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// root/baselineFile are injectable so the tests can tamper with a copy and see the
// detection fire, without touching the real rulebook.
function current(root) {
  const out = {};
  for (const rel of WATCH) {
    const p = path.join(root || ROOT, rel);
    out[rel] = fs.existsSync(p) ? sha(fs.readFileSync(p)) : null;
  }
  return out;
}

function baseline(file) {
  try { return JSON.parse(fs.readFileSync(file || FILE, 'utf8')); } catch (e) { return null; }
}

function report(opts) {
  const o = opts || {};
  const base = baseline(o.baselineFile);
  const now = current(o.root);
  const rows = WATCH.map((rel) => ({
    file: rel,
    sha256: now[rel],
    short: now[rel] ? now[rel].slice(0, 12) : null,
    recorded: base && base.hashes ? base.hashes[rel] || null : null,
    drift: base && base.hashes ? (base.hashes[rel] !== now[rel]) : null,
  }));
  const drifted = rows.filter((r) => r.drift === true).map((r) => r.file);
  return {
    watched: rows,
    ok: drifted.length === 0 && Boolean(base),
    recorded_at: base ? base.recorded_at : null,
    recorded_by: base ? base.recorded_by : null,
    note: base ? base.note : 'no baseline recorded yet: run npm run integrity:record',
    drifted,
    policy_short: (rows.find((r) => r.file === 'rules/policy.json') || {}).short || null,
  };
}

// Used by the ledger: every decision carries the rulebook it was made under.
function policyTag(root) {
  const h = current(root)['rules/policy.json'];
  return h ? h.slice(0, 12) : null;
}

function record(who) {
  const prev = baseline();
  const b = {
    recorded_at: new Date().toISOString(),
    recorded_by: who || 'unknown',
    hashes: prev && prev.hashes ? prev.hashes : current(),
    git_head: (() => { try { return require('child_process').execSync('git rev-parse HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { return null; } })(),
    note: 'Baseline for the kit files this oversight layer enforces. If a hash changes, the Rules tab goes red and every new ledger row carries the new short hash, so a rule edit can never masquerade as history. This is drift detection against a recorded anchor, not a cryptographic guarantee: anyone with write access to this disk could re-record. The anchor that is hard to quietly change is the one published in the git commit \u2014 state/integrity.json is committed, so the diff is the tamper alarm.',
  };
  if (!prev) b.hashes = current();
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(b, null, 1));
  return { ...report(), recorded: true };
}

// Append-only chain: a tampered ledger row breaks the chain from that row on.
const CHAIN_FILE = path.join(ROOT, 'state', 'integrity-chain.json');
function chain() { try { return JSON.parse(fs.readFileSync(CHAIN_FILE, 'utf8')); } catch (e) { return null; } }

function chainBuild() {
  const ledger = require('./ledger');
  const entries = ledger.entries();
  let prev = 'GENESIS';
  const rows = entries.map((e) => {
    const dig = sha(JSON.stringify({
      id: e.id, action: e.action, actor: e.actor, decision: e.decision,
      rules: e.rules.map((h) => h.id + h.decision).join(','),
      files: (e.files || []).map((f) => f.path).sort().join(','),
      policy: e.policy_sha || null, at: e.at,
    }));
    const row = { id: e.id, prev, dig };
    prev = dig;
    return row;
  });
  const out = { head: prev, built_at: new Date().toISOString(), count: rows.length, rows, policy_sha: policyTag() };
  fs.writeFileSync(CHAIN_FILE, JSON.stringify(out, null, 1));
  return out;
}

// Verify without a trusted chain file: rebuild and compare heads. Detects edits to a
// stored chain; a full re-record on a clean boot is what fixes drift.
function chainVerify(opts) {
  const ledger = require('./ledger');
  const entries = ledger.entries();
  const c = chain();
  if (!c) return { present: false };
  let prev = 'GENESIS'; let broken = null;
  for (let i = 0; i < c.rows.length && i < entries.length; i++) {
    const e = entries[i];
    const dig = sha(JSON.stringify({
      id: e.id, action: e.action, actor: e.actor, decision: e.decision,
      rules: e.rules.map((h) => h.id + h.decision).join(','),
      files: (e.files || []).map((f) => f.path).sort().join(','),
      policy: e.policy_sha || null, at: e.at,
    }));
    if (c.rows[i].prev !== prev) { broken = { index: i, id: e.id, kind: 'chain order' }; break; }
    if (c.rows[i].dig !== dig) { broken = { index: i, id: e.id, kind: 'row contents differ from the recorded digest' }; break; }
    prev = dig;
  }
  return { present: true, rows: c.rows.length, entries: entries.length, head_matches: !broken && prev === c.head && c.rows.length === entries.length, broken, built_at: c.built_at };
}

module.exports = { report, record, policyTag, chain, chainBuild, chainVerify, current, baseline, WATCH, sha, ROOT, FILE };
