// ledger.js — the append-only log the policy promises ("every action is logged
// with time, agent, action, files touched, data level and outcome"), plus the
// approval queue the owner works through. Persisted so a restart keeps the day.
'use strict';
const fs = require('fs');
const path = require('path');

const paths = require('./paths');

const DAY = 'Sunday 15 November 2026';
const CLOCK = '06:45 SGT';
let seq = 0;

function nowISO() {
  return '2026-11-15T' + `${String(6).padStart(2, '0')}:${String(30 + Math.floor(Math.random() * 9)).padStart(2, '0')}:00+08:00`;
}

function load() {
  const s = paths.read('ledger.json');
  if (!s) return blank();
  seq = (s.counter || 0) + 1;
  return s;
}

function blank() {
  return { version: 1, day: DAY, generatedAt: null, counter: 0, entries: [], queue: [], owner: 'Mei Tan', studio: 'Lumen Studio' };
}

let state = null;
function persist() {
  state.counter = seq;
  // A read-only host keeps the ledger for the instance only. Serving an audit trail must
  // never depend on persistence succeeding, so a failed write is a return value, not a throw.
  return paths.write('ledger.json', state);
}

function init() {
  state = load();
  return state;
}
function getState() {
  return state || init();
}

// Live gate probes are the demo's most written-to row type, and this host is public and
// unauthenticated: nine clicks already meant nine permanent audit rows. Left alone, a busy
// judge or a script grows the ledger without bound and every append rebuilds the hash chain
// over a longer file. The fix is deliberately NOT eviction - dropping rows from an append-only
// trail to save space is the exact failure this product exists to catch - so the trail simply
// refuses new sim rows once the demo budget is spent, says so, and points at the reset that is
// already part of the product (Replay the night). Nightly and seeded rows are never capped.
const MAX_SIM_ROWS = 40;
const isSim = (e) => e && (e.sim === true || (e.idempotency || '').startsWith('ask:'));

function add(record, meta) {
  const s = getState();
  const dupe = meta && meta.idempotency ? s.entries.find((e) => e.idempotency === meta.idempotency) : null;
  if (dupe) return { entry: dupe, reused: true };
  if (record && (record.sim || (meta && meta.idempotency || '').startsWith('ask:'))) {
    if (s.entries.filter(isSim).length >= MAX_SIM_ROWS) {
      return { full: true, limit: MAX_SIM_ROWS, sim: s.entries.filter(isSim).length };
    }
  }
  seq += 1;
  const id = 'E' + String(seq).padStart(3, '0');
  const entry = {
    id,
    idempotency: (meta && meta.idempotency) || null,
    at: (meta && meta.at) || nowISO(),
    day: (meta && meta.day) || DAY,
    clock: (meta && meta.clock) || null,
    ...record,
  };
  s.entries.push(entry);
  if (entry.decision === 'HOLD') {
    s.queue.push({
      id: entry.id,
      at: entry.at,
      actor: entry.actor,
      purpose: entry.task || entry.action,
      headline: entry.ownerLine,
      decision: 'HOLD',
      rules: entry.rules.map((h) => `${h.id} ${h.decision}`),
      dataLevel: entry.dataLevel,
      files: entry.files,
      evidence: entry.evidence,
      rewrite: entry.rewrite,
      releasePath: true,
      status: 'waiting',
      resolution: null,
      nagged: 0,
    });
  }
  persist();
  return { entry, reused: false };
}

function findByKey(key) {
  const s = getState();
  return s.entries.find((e) => e.idempotency && e.idempotency === key) || null;
}

function resolveQueue(id, resolution, by) {
  const s = getState();
  const q = s.queue.find((x) => x.id === id);
  if (!q) return { error: 'not found' };
  if (q.status !== 'waiting') return { error: 'already ' + q.status, queue: q };
  q.status = resolution;
  q.resolution = { by: by || 'Mei Tan', at: nowISO(), note: resolution === 'released' ? 'You released this. The agent may send it now.' : 'You said no. The draft stays a draft.' };
  const e = s.entries.find((x) => x.id === id);
  if (e) {
    e.outcomeForOwner = resolution;
    e.queueStatus = resolution;
    e.ledgerOut = resolution === 'released' ? 'RELEASED by owner' : 'DECLINED by owner';
  }
  for (const x of s.entries) if (x.queueId === id) { x.queueStatus = resolution; x.ledgerOut = resolution === 'released' ? 'RELEASED by owner' : 'DECLINED by owner'; }
  persist();
  return { queue: q };
}

function queue() {
  return getState().queue;
}
function entries() {
  return getState().entries;
}
function reset(keepId) {
  const s = getState();
  if (keepId) {
    s.entries = s.entries.filter((e) => e.idempotency !== keepId && e.idempotency !== null);
    s.queue = [];
    seq = 0;
  } else {
    s.entries = [];
    s.queue = [];
    seq = 0;
  }
  persist();
  return s;
}

module.exports = { init, getState, add, findByKey, resolveQueue, queue, entries, reset, persist, DAY, CLOCK };
