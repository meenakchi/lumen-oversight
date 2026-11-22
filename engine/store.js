// store.js — the audit trail's database.
//
// The submission spec asks for a "live application, database-backed", and a flat JSON file is
// not that. This is a real SQLite database through Node 22's built-in `node:sqlite`: no npm
// dependency, no sidecar process, no connection string, nothing to install on the host.
//
// What the database is for, precisely:
//   * the audit rows, stored with the columns the questions are actually asked in
//     (actor, action, decision, rule ids, data level, the policy hash in force, money),
//     plus the full row as JSON so nothing is lost in the mapping;
//   * aggregates the file could only answer by re-reading itself;
//   * a query surface the UI can show, so "database-backed" is something you can verify
//     on screen rather than a word in a README.
//
// What it is NOT for: it does not decide anything. Every verdict still comes from
// `engine/gate.js` evaluating `rules/policy.json`. The chain in `engine/integrity.js` is
// still what answers "was this trail rewritten" — the database can be replaced wholesale by
// anyone who owns the disk, which is exactly why the hash chain and the committed anchor
// exist, and the UI says so rather than implying otherwise.
//
// `node:sqlite` prints an ExperimentalWarning on first use. We do not suppress it; a banner
// in the host log saying "this may change" is the same honesty the app applies to itself.
'use strict';
const fs = require('fs');
const path = require('path');
const paths = require('./paths');

const DB_FILE = paths.dataFile('audit.db');
const OFF = /^(1|true|off|no)$/i.test(String(process.env.OVERSIGHT_STORE_OFF || ''));

let db = null;
const legacyRebuilt = [];
let status = { driver: 'not-opened', ok: false, file: DB_FILE, reason: null };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS audit (
  id           TEXT    PRIMARY KEY,
  seq          INTEGER NOT NULL,
  at           TEXT,
  day          TEXT,
  clock        TEXT,
  actor        TEXT,
  action       TEXT,
  decision     TEXT,
  data_level   TEXT,
  policy_sha   TEXT,
  stake_total  INTEGER NOT NULL DEFAULT 0,
  rules        TEXT,
  flags        TEXT,
  sim          INTEGER NOT NULL DEFAULT 0,
  row          TEXT    NOT NULL
);
CREATE TABLE IF NOT EXISTS queue (
  id            TEXT    PRIMARY KEY,
  seq           INTEGER NOT NULL,
  decision      TEXT,
  release_path  INTEGER,
  actor         TEXT,
  row           TEXT    NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
-- indexes come after every table: creating one on a table later in the script is how the
-- first version of this file failed the whole open() with "no such table: main.queue"
CREATE INDEX IF NOT EXISTS ix_audit_seq      ON audit(seq);
CREATE INDEX IF NOT EXISTS ix_audit_decision ON audit(decision);
CREATE INDEX IF NOT EXISTS ix_audit_sha      ON audit(policy_sha);
CREATE INDEX IF NOT EXISTS ix_audit_actor    ON audit(actor);
CREATE INDEX IF NOT EXISTS ix_queue_seq      ON queue(seq);
`;

/** Open (creating if needed) the database. Never throws: a host without node:sqlite, or with
 *  an unwritable data dir, falls back to the JSON snapshot and reports why. */
function open() {
  if (db) return true;
  if (OFF) { status = { ...status, driver: 'disabled', reason: 'OVERSIGHT_STORE_OFF is set' }; return false; }
  try {
    const { DatabaseSync } = require('node:sqlite');
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    const handle = new DatabaseSync(DB_FILE);
    handle.exec('PRAGMA journal_mode = WAL;');
    // The row id is what the upsert keys on. A table left by an earlier build keyed on the wrong
    // column, which makes every ON CONFLICT fail, so rebuild those two derived tables instead of
    // writing nothing and reporting success: the ledger JSON and the hash chain are the record.
    const keyedOnId = (t) => {
      try { return handle.prepare(`SELECT count(*) AS c FROM pragma_table_info(?) WHERE pk > 0 AND name = 'id'`).get(t).c === 1; }
      catch (e) { return false; }
    };
    for (const t of ['audit', 'queue']) {
      const exists = handle.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
      if (exists && !keyedOnId(t)) { handle.exec(`DROP TABLE ${t}`); legacyRebuilt.push(t); }
    }
    handle.exec(SCHEMA);
    db = handle;
    status = { driver: 'node:sqlite', ok: true, file: DB_FILE, reason: legacyRebuilt.length ? 'rebuilt legacy table(s): ' + legacyRebuilt.join(', ') : null, version: process.versions.sqlite || null };
    return true;
  } catch (e) {
    status = { ...status, driver: 'unavailable', ok: false, reason: String((e && e.message) || e) };
    return false;
  }
}
const available = () => open();

/** Store every row, and delete ids that are no longer in the trail (which happens only when
 *  the night is replayed, and the UI reports that reset separately). */
function syncAll(state) {
  if (!open()) return false;
  const entries = state.entries || [];
  const queue = state.queue || [];
  const del = db.prepare('DELETE FROM audit WHERE id = ?');
  const delQ = db.prepare('DELETE FROM queue WHERE id = ?');
  const ins = db.prepare(`INSERT INTO audit
    (seq,id,at,day,clock,actor,action,decision,data_level,policy_sha,stake_total,rules,flags,sim,row)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET seq=excluded.seq, at=excluded.at, day=excluded.day, clock=excluded.clock,
      actor=excluded.actor, action=excluded.action, decision=excluded.decision, data_level=excluded.data_level,
      policy_sha=excluded.policy_sha, stake_total=excluded.stake_total, rules=excluded.rules, flags=excluded.flags,
      sim=excluded.sim, row=excluded.row`);
  const ids = new Set(entries.map((e) => e.id));
  db.exec('BEGIN');
  try {
    const qids = new Set(queue.map((q) => q.id));
    for (const r of db.prepare('SELECT id FROM audit').all()) if (!ids.has(r.id)) del.run(r.id);
    for (const r of db.prepare('SELECT id FROM queue').all()) if (!qids.has(r.id)) delQ.run(r.id);
    entries.forEach((e, i) => ins.run(
      i + 1, e.id, e.at || null, e.day || null, e.clock || null, e.actor || null, e.action || null,
      e.decision || null, e.dataLevel || null, e.policy_sha || null,
      (e.stake || []).reduce((s, x) => s + (Number(x.value) || 0), 0),
      (e.rules || []).map((h) => `${h.id}:${h.decision}`).join(','),
      (e.flags || []).map((f) => f.id).join(','),
      e.sim ? 1 : 0, JSON.stringify(e),
    ));
    const insQ = db.prepare(`INSERT INTO queue(seq,id,decision,release_path,actor,row) VALUES(?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET seq=excluded.seq, decision=excluded.decision, release_path=excluded.release_path,
        actor=excluded.actor, row=excluded.row`);
    queue.forEach((q, i) => insQ.run(i + 1, q.id, q.decision || null, q.releasePath === false ? 0 : 1, q.actor || null, JSON.stringify(q)));
    db.prepare('INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run('counter', String(state.counter || entries.length));
    db.prepare('INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run('day', String(state.day || ''));
    db.exec('COMMIT');
    return true;
  } catch (e) {
    db.exec('ROLLBACK');
    status.reason = 'write failed: ' + String((e && e.message) || e);
    return false;
  }
}

/** Read the trail back, in stored order. null = nothing there (cold host), so the caller
 *  falls through to the JSON snapshot and seeds itself. */
function readAll() {
  if (!open()) return null;
  try {
    const rows = db.prepare('SELECT row, seq FROM audit ORDER BY seq').all();
    if (!rows.length) return null;
    const qrows = db.prepare('SELECT row FROM queue ORDER BY seq').all();
    const meta = {};
    for (const m of db.prepare('SELECT k, v FROM meta').all()) meta[m.k] = m.v;
    return {
      entries: rows.map((r) => JSON.parse(r.row)),
      queue: qrows.map((r) => JSON.parse(r.row)),
      counter: Number(meta.counter || rows.length),
      day: meta.day || null,
    };
  } catch (e) {
    status.reason = 'read failed: ' + String((e && e.message) || e);
    return null;
  }
}

/** The questions a judge asks a trail, answered by SQL they can see. Fixed statements only —
 *  nothing here interpolates user input, because a "run any query" box on a public host would
 *  be the same mistake as letting a model decide. */
const QUERIES = [
  { label: 'rows by outcome', sql: 'SELECT decision, COUNT(*) AS n FROM audit GROUP BY decision ORDER BY n DESC', purpose: 'the four numbers on the brief, straight from the table' },
  { label: 'money that did not move', sql: 'SELECT SUM(stake_total) AS sgd FROM audit WHERE decision <> \'ALLOW\'', purpose: 'what the holds and stops were worth' },
  { label: 'rules most often cited', sql: 'SELECT rules FROM audit WHERE rules IS NOT NULL', purpose: 'counted in the app because rule ids are stored as a list per row' },
  { label: 'one rulebook hash across the trail', sql: 'SELECT COUNT(DISTINCT policy_sha) AS hashes FROM audit', purpose: '1 means every row was decided under the same rulebook; more means the file changed mid-night' },
  { label: 'live-gate demo rows', sql: 'SELECT COUNT(*) AS n FROM audit WHERE sim = 1', purpose: 'what a visitor has asked the gate since the last replay' },
];

function stats() {
  if (!open()) return { ...status, rows: 0, queries: [] };
  const out = { ...status, rows: 0, bytes: 0, queries: [] };
  try { out.bytes = fs.statSync(DB_FILE).size; } catch (e) { /* no file yet */ }
  for (const q of QUERIES) {
    let rows;
    try { rows = db.prepare(q.sql).all(); } catch (e) { out.queries.push({ ...q, error: String(e.message || e) }); continue; }
    if (q.label === 'rules most often cited') {
      const tally = {};
      for (const r of rows) for (const item of String(r.rules || '').split(',')) {
        const id = item.split(':')[0];
        if (id) tally[id] = (tally[id] || 0) + 1;
      }
      rows = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([rule, n]) => ({ rule, n }));
    }
    out.queries.push({ label: q.label, sql: q.sql, purpose: q.purpose, rows });
  }
  const counted = out.queries.find((x) => x.label === 'rows by outcome');
  out.rows = counted ? counted.rows.reduce((s, r) => s + Number(r.n || 0), 0) : 0;
  try { out.queued = db.prepare('SELECT COUNT(*) AS n FROM queue').get().n; } catch (e) { out.queued = null; }
  return out;
}

function close() { try { if (db) db.close(); } catch (e) { /* already gone */ } db = null; }

module.exports = { open, available, syncAll, readAll, stats, close, DB_FILE, status: () => status };
