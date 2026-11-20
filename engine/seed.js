// seed.js — replays Sunday night's work into the ledger so the owner opens a
// real day instead of an empty dashboard. Runs once on boot; idempotent on a
// reset, so pressing "run the scenario again" does not double-log a night.
'use strict';

const { evaluate } = require('./gate');
const ledger = require('./ledger');
const { KIT_SCRIPTS, ROUTINE, OURS, ACTORS } = require('./day');

function modelFor(step) {
  // Reads the agent already did cannot be un-read: they are reported, not denied.
  // Anything still outbound goes through the gate live.
  return step.action === 'read_file' ? 'review' : step.model || 'live';
}

let clockN = 0;
function nextClock() {
  const hour = (21 + Math.floor(clockN / 6)) % 24;
  const min = (7 + (clockN % 6) * 9) % 60;
  clockN += 1;
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function play(script, idx) {
  const ids = [];
  script.steps.forEach((step, i) => {
    const who = step.actor || script.actor;
    const rec = evaluate({ ...step, actor: who, model: modelFor(step), task: step.intent, intent: step.intent });
    rec.actorName = (ACTORS[who] || { name: who }).name;
    rec.purpose = script.purpose;
    rec.stepNo = i + 1;
    rec.stepCount = script.steps.length;
    rec.key = `night:${idx}:${script.id || idx}:${i + 1}`;
    const clock = nextClock();
    const { entry } = ledger.add(rec, { idempotency: rec.key, clock });
    ids.push(entry.id);
  });
  return ids;
}

function seedNight() {
  ledger.init();
  ledger.reset();
  let idx = 0;
  const out = [];
  for (const [sid, script] of Object.entries(KIT_SCRIPTS)) out.push({ id: sid, kind: 'kit scenario', script, entries: play({ id: sid, ...script }, idx++) });
  for (const script of ROUTINE) out.push({ id: script.id, kind: 'ordinary work', entries: play(script, idx++) });
  for (const script of OURS) out.push({ id: script.id, kind: 'our own scenario', entries: play(script, idx++) });
  return out;
}

module.exports = { seedNight, modelFor };
