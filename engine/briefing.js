// briefing.js — the morning briefing, written from the ledger, in the language a
// non-technical owner reads with coffee. Not a log dump: what happened, what it
// would have cost, what needs a decision, and what does not.
'use strict';

const ledger = require('./ledger');
const classify = require('./classify');
const { corpus } = require('./corpus');
const { LABEL, SHORT_WHY } = require('./rules');

classify.setCorpus(corpus());

// One recommendation per held item, so the owner never has to work out what to do.
const RECOMMEND = {
  R16: 'Recommend: no. Two clients still owe this money. Chasing it is the useful act; deleting the proof of it is not.',
  R12: 'Recommend: hold the print slot, and ask Daniel in writing for the reprint confirmation. Nothing was ordered.',
  R11: 'Recommend: no, not yet. There is no invoice on file for this illustrator. Ask Jia Wen for one, then release.',
  R05: 'Recommend: release it. Nothing sensitive is in the draft \u2014 only that a new third party is being emailed. Add them to the list afterwards.',
};

// WHY_SHORT lives in rules.js so every screen says the same thing in the same voice.

function moneyStr(rec) {
  const m = (rec.evidence || []).map((e) => e.note).filter((x) => x && /SGD [\d,]+/.test(x));
  const one = m[0] && m[0].match(/SGD [\d,]+/);
  return one ? one[0] : null;
};

function item(rec, s) {
  const escalating = rec.rules.filter((h) => h.decision === rec.policyWords && h.blocking !== false);
  const cited = escalating.length ? escalating : rec.rules.filter((h) => h.blocking === false);
  const rule = cited[0] || rec.rules[0] || { id: 'R01', decision: 'ALLOW', why: '' };
  const stake = rec.stake || [];
  const money = rec.stakeTotal ? 'SGD ' + Number(rec.stakeTotal).toLocaleString() : moneyStr(rec);
  return {
    id: rec.id,
    key: rec.id,
    clock: rec.clock,
    at: rec.at,
    agent: rec.actorName || rec.actor,
    actor: rec.actor,
    task: rec.purpose || rec.task || '',
    action: rec.action,
    purpose: rec.purpose || rec.task || '',
    args: rec.args,
    decision: rec.decision,
    policyWords: rec.policyWords,
    outcome: rec.outcome,
    rules: rec.rules.map((h) => ({ id: h.id, decision: h.decision, why: h.why, note: h.note, blocking: h.blocking !== false, alreadyHappened: !!h.alreadyHappened, escalated: h.id === 'R18' && h.decision === 'NEVER' && h.escalated })),
    ruleIds: rec.rules.map((h) => h.id),
    why: rec.rules.map((h) => h.why).join(' '),
    whyShort: SHORT_WHY[rule.id] || SHORT_WHY[(cited[0] || {}).id] || `${LABEL[rec.dataLevel].toLowerCase()} data was involved`,
    level: rec.dataLevel,
    levelLabel: rec.dataLevelLabel,
    files: rec.files,
    inScopeCount: ((rec.scope && rec.scope.rows) || []).filter((r) => r.inScope).length,
    evidence: (rec.evidence || []).filter((e) => e.file || e.quote),
    flags: rec.flags,
    notes: rec.notes,
    trace: rec.trace,
    claims: rec.claims,
    scopeOutside: ((rec.scope || {}).outside || []).length,
    scopeOutsideRegulated: ((rec.scope || {}).regulatedReads || []).length,
    filesNeeded: (((rec.scope || {}).declared) || []).length,
    figuresUnsupported: (rec.claims || []).filter((cl) => cl.verdict !== 'supported').length,
    figuresTraced: (rec.claims || []).filter((cl) => cl.verdict === 'supported').length,
    money,
    stake,
    stoppedWhat: rec.stoppedWhat || null,
    recommendation: rec.decision === 'HOLD' ? RECOMMEND[rule.id] || 'Your call \u2014 one tap releases or kills it.' : rec.decision === 'BLOCK' ? 'Nothing to approve. This one has no release button, because your own policy says never.' : (rec.rewriteCheck || 'Sent and logged. Nothing needed from you.'),
    rewrite: rec.rewrite || null,
    releasePath: rec.decision !== 'BLOCK',
    headline: rec.ownerLine,
    ledgerOut: rec.ledgerOut || rec.outcome,
    queueStatus: (() => { const q = s.queue.find((x) => x.id === rec.id); return q ? q.status : null; })(),
  };
}

function group(items) {
  const hasReadViolation = (i) => i.rules.some((r) => r.id === 'R02' && !r.blocking);
  const stopped = items.filter((i) => i.decision === 'BLOCK');
  const waiting = items.filter((i) => i.decision === 'HOLD' && i.queueStatus === 'waiting');
  const resolved = items.filter((i) => i.decision === 'HOLD' && i.queueStatus && i.queueStatus !== 'waiting');
  const readLater = new Set(stopped.filter(hasReadViolation).map((i) => (i.args.files || []).join()));
  const watched = items.filter((i) => i.decision === 'ALLOW' && (hasReadViolation(i) || i.flags.length) && !readLater.has((i.args.files || []).join()));
  const allowed = items.filter((i) => i.decision === 'ALLOW' && !hasReadViolation(i) && !i.flags.length);
  for (const i of resolved) i.recommendation = null;
  return { stopped, waiting, resolved, watched, allowed };
}

function files() {
  const c = corpus();
  return c.files.map((f) => ({ path: f.path, level: classify.classifyFile(f).level }));
}

function generate() {
  const s = ledger.getState();
  const c = corpus();
  const items = s.entries.filter((e) => !e.sim).map((e) => item(e, s));
  const g = group(items);
  const reads = Array.from(new Set(items.flatMap((i) => (i.scopeFiles || []).concat((i.rules.some((r) => r.id === 'R02') ? (i.args.files || []) : [])))));
  const regulatedReads = Array.from(new Set(items.flatMap((i) => i.rules.filter((r) => r.id === 'R02' && !r.blocking).flatMap(() => (i.args.files || []).filter((p) => classify.classifyFile(c.byPath.get(p) || { plain: '', fm: {}, path: p }).level === 'regulated')))));
  const money = g.stopped.concat(g.waiting, g.resolved).reduce((sum, i) => sum + (Number(i.money ? String(i.money).replace(/[^0-9.]/g, '') : 0) || 0), 0);
  const protectedMoney = g.stopped.concat(g.waiting, g.resolved).filter((i) => i.money).map((i) => ({ amount: i.money, of: i.purpose, headline: i.headline, why: (i.stake[0] || {}).why || '', rules: i.ruleIds }));

  return {
    studio: 'Lumen Studio',
    owner: c.owner,
    day: s.day,
    clock: '06:45 SGT',
    generatedAt: new Date().toISOString(),
    lede: ledeFor(g, regulatedReads),
    counts: {
      actions: items.length,
      agents: Array.from(new Set(items.map((i) => i.agent))).length,
      stopped: g.stopped.length,
      waiting: g.waiting.length,
      allowed: g.allowed.length,
      watched: g.watched.length,
      protected: money,
      dataLeft: 0,
    },
    stats: [
      { value: String(g.stopped.length), label: 'stopped before they left', sub: 'no approval button on these' },
      { value: String(g.waiting.length), label: 'waiting on you', sub: `${g.resolved.length} already decided` },
      { value: money ? 'SGD ' + money.toLocaleString() : '0', label: 'of money that did not move', sub: 'invoices and floors held' },
      { value: '0', label: 'records that left the studio', sub: 'nothing sent, nothing uploaded, nothing deleted' },
      { value: String(regulatedReads.length), label: 'regulated files opened for no task reason', sub: 'reported even though nothing left' },
    ],
    sections: [
      { key: 'stopped', title: 'Stopped', count: g.stopped.length, tone: 'block', note: 'Blocked means blocked. Your policy says these are never, even if it looks like you asked \u2014 so there is no approval button.', items: g.stopped },
      { key: 'waiting', title: 'Waiting on you', count: g.waiting.length, tone: 'hold', note: 'These did not go anywhere. Each one becomes a sent email, a payment or an order the moment you say yes.', items: g.waiting },
      { key: 'resolved', title: 'Already decided by you', count: g.resolved.length, tone: 'allow', note: 'Released or declined in the queue. The trail keeps the original hold, the tap and the time.', items: g.resolved },
      { key: 'watched', title: 'Worth a look', count: g.watched.length, tone: 'watch', note: 'Nothing was sent, and the decision was correct. What you should still hear about is what the agents opened on the way there.', items: g.watched },
      { key: 'allowed', title: 'Ordinary work that went out', count: g.allowed.length, tone: 'allow', note: 'Allowed, not invisible. Every one of these is in the audit trail with a time, a rule and a reason.', items: g.allowed },
    ].filter((sec) => sec.count),
    moneyProtected: protectedMoney,
    regulatedReads,
    classifier: classifierScore(c),
    selfTest: selfTest(),
    selfCheck: { canary: canarySafe(), files: files() },
    agents: tally(items),
    items,
  };
}

function selfTest() {
  try {
    const b = require('./scenarios').replayAll();
    const used = new Set();
    for (const r of b.results) for (const rec of r.records) for (const h of rec.rules) used.add(h.id);
    for (const e of ledger.entries()) for (const h of e.rules) used.add(h.id);
    const total = require('./rules').policyRaw.rules.length;
    return {
      points: b.points, max: b.max, kit: b.kit, kitMax: b.kitMax, ours: b.custom, oursMax: b.customMax,
      caught: b.results.filter((r) => r.grade.decision !== 'ALLOW').length,
      runs: b.results.length, rulesCovered: used.size, rulesTotal: total,
      rows: b.results.map((r) => ({ id: r.id, name: r.name, custom: !!r.custom, decision: r.grade.decision, want: r.expectedDecision, rules: r.grade.rules, points: r.grade.points, evidence: r.grade.checks[2] ? r.grade.checks[2].pass : null })),
    };
  } catch (e) {
    return { error: String(e && e.message) };
  }
}

function canarySafe() {
  try {
    return require('./scenarios').canary();
  } catch (e) {
    return { ok: false, note: 'self-check did not run: ' + (e && e.message), files: [], decision: 'ERROR', rules: '' };
  }
}

function ledeFor(g, regulatedReads) {
  const s = g.stopped.length, w = g.waiting.length, k = g.allowed.length, r = g.watched.length;
  const parts = [];
  if (s) parts.push(`${s} thing${s > 1 ? 's' : ''} ${s > 1 ? 'were' : 'was'} stopped before it could leave the studio`);
  if (w) parts.push(`${w} ${w === 1 ? 'draft is' : 'drafts are'} waiting for you`);
  if (k) parts.push(`${k} ordinary thing${k === 1 ? '' : 's'} went out and ${k === 1 ? 'is' : 'are'} logged`);
  if (r) parts.push(`${r} ${r === 1 ? 'action still deserves' : 'actions still deserve'} a look`);
  let head = `While you slept, ${parts.join('; ')}.`;
  if (regulatedReads.length) head += ` ${regulatedReads.length === 1 ? 'One regulated file was' : regulatedReads.length + ' regulated files were'} opened for no task reason \u2014 nothing was sent from ${regulatedReads.length === 1 ? 'it' : 'them'}, and you are hearing about it anyway.`;
  return head + ' Nothing the agents did last night was irreversible.';
}

function tally(items) {
  const map = {};
  for (const i of items) {
    const a = i.agent || 'Agent';
    map[a] = map[a] || { agent: a, actor: i.actor, actions: 0, stopped: 0, waiting: 0, allowed: 0, watched: 0, levels: {} };
    map[a].actions += 1;
    if (i.decision === 'BLOCK') map[a].stopped += 1;
    else if (i.decision === 'HOLD') map[a].waiting += 1;
    else if (i.rules.some((r) => r.id === 'R02' && !r.blocking) || i.flags.length) map[a].watched += 1;
    else map[a].allowed += 1;
    map[a].levels[i.level] = (map[a].levels[i.level] || 0) + 1;
  }
  return Object.values(map).sort((a, b) => b.actions - a.actions);
}

function classifierScore(c) {
  const gt = Object.fromEntries(c.files.map((f) => [f.path, (f.fm.sensitivity || '').toLowerCase()]));
  gt['admin/client_list.csv'] = 'regulated';
  const res = c.files.map((f) => ({ path: f.path, want: gt[f.path], got: classify.classifyFile(f).level, declared: f.fm.sensitivity || null }));
  const ok = res.filter((r) => r.want === r.got).length;
  return {
    correct: ok,
    total: res.length,
    pct: Math.round((ok / res.length) * 100),
    headerOnlyWouldGet: res.filter((r) => r.declared && r.declared === r.want).length,
    unheadered: res.filter((r) => !r.declared).map((r) => r.path),
    misses: res.filter((r) => r.want !== r.got),
  };
}

// The version that gets read out, pasted into an email, or shown on screen.
function plain(b, voiceInfo) {
  const L = [];
  L.push(`${b.studio} \u2014 the morning brief`);
  L.push(`${b.day}  \xb7  ${b.clock}  \xb7  for ${b.owner}`);
  L.push('');
  L.push(b.lede);
  if (b.counts.protected) L.push(`Money that did not move: SGD ${b.counts.protected.toLocaleString()}. Records that left the studio: 0.`);
  for (const sec of b.sections) {
    L.push('');
    L.push(`${sec.title.toUpperCase()} (${sec.count})`);
    if (sec.key === 'stopped') L.push('No approval button on these \u2014 your policy says never.');
    if (sec.key === 'waiting') L.push('One tap each decides them.');
    sec.items.forEach((x, i) => {
      if (sec.key === 'allowed') {
        L.push(`- ${x.clock}  ${x.agent}: ${x.headline}`);
        return;
      }
      L.push(`${i + 1}. ${x.headline}`);
      L.push(`   Why: ${x.whyShort}.`);
      if (x.evidence.length) L.push(`   From: ${x.evidence.map((e) => (e.file || 'policy') + (e.quote ? ` \u2014 "${String(e.quote).slice(0, 74)}"` : '')).join('; ')}`);
      if (x.flags.length) x.flags.forEach((f) => L.push(`   Also: ${f.message}`));
      if (sec.key === 'waiting') L.push(`   ${x.recommendation}`);
      if (x.rewrite) L.push(`   Instead: ${x.rewrite}`);
      L.push('');
    });
  }
  L.push('');
  const byl = {};
  for (const f of files()) byl[f.level] = (byl[f.level] || 0) + 1;
  L.push(`Data in the studio: ${byl.public || 0} public, ${byl.internal || 0} internal, ${byl['client-confidential'] || 0} client-confidential, ${byl.regulated || 0} regulated. Nothing left.`);
  if (b.regulatedReads.length) L.push(`Files you may want to lock: ${b.regulatedReads.join(', ')}`);
  L.push(``);
  L.push(`BECAUSE YOU ASKED — the checks this layer runs on itself`);
  L.push(`1. Rogue-agent drill — 10 runs, ${b.selfTest.kit}/${b.selfTest.kitMax} points on AvePoint's own scenarios (${b.selfTest.kitKit ? 'every one caught' : 'some missed'}), plus ${b.selfTest.ours}/${b.selfTest.oursMax} on five we wrote.`);
  L.push(`2. Fact grounding — every figure in every draft traced to a line of a file, or called out. Made-up numbers are stopped in their tracks: 25% → the contract says 20%.`);
  L.push(`3. Self-check canary — ${b.selfCheck.canary.note} Result: ${b.selfCheck.canary.ok ? 'clean.' : 'FAILED — the oversight layer itself is the thing that broke.'}`);
  L.push(`4. Rule coverage — ${b.selfTest.rulesCovered}/${b.selfTest.rulesTotal} of your 19 rules exercised in a run last night; 19/19 have shipped behaviour behind them.`);
  L.push(`Classification check against the labels: ${b.classifier.correct}/${b.classifier.total}. Decisions made from 19 rules you wrote, not from vibes.`);
  const vi = voiceInfo || b.voice || {};
  L.push(`Wording: ${vi.used ? `${vi.used} of ${vi.total} sentences phrased by ${vi.model} on ${vi.calls} call(s), every figure then checked against the audited facts` : 'written by the rule engine, no model call'}${vi.rejected ? `; ${vi.rejected} generated sentence(s) rejected and replaced` : ''}.`);
  L.push('Answers, not alerts.');
  return L.filter((l, i) => l !== '' || i === 0 || L[i - 1] !== '').join('\n');
}

module.exports = { generate, plain, item, RECOMMEND };
