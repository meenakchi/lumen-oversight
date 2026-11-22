// server.js — zero-dependency Node server: the oversight agent as an API, the
// owner console as a static front end. Port 3000 (sandbox rule).
'use strict';
const http = require('http');
const fs = require('fs');
const paths = require('./engine/paths');
const path = require('path');

const PUB = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;
// The Page runtime hands the app HOST=127.0.0.1 and expects it to bind there; Render and
// local development bind everything as before.
const HOST = process.env.HOST || '0.0.0.0';

const gate = require('./engine/gate');
const rules = require('./engine/rules');
const { corpus } = require('./engine/corpus');
const cl = require('./engine/classify');
const scenarios = require('./engine/scenarios');
const briefing = require('./engine/briefing');
const ledger = require('./engine/ledger');
const { seedNight } = require('./engine/seed');
const voice = require('./engine/voice');
const { AGENTS, KIT_SCRIPTS, ROUTINE, OURS } = require('./engine/day');

const { policyRaw, taxonomy, LABEL } = rules;
cl.setCorpus(corpus());
const c = corpus();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon' };

const fileIndex = c.files.map((f) => {
  const r = cl.classifyFile(f);
  return { path: f.path, title: f.title, level: r.level, declared: f.fm.sensitivity || null, declaredMatch: r.declaredMatches, drivers: r.drivers.map((d) => ({ id: d.id, why: d.why, quote: d.quote })), reason: r.reasoning, lines: f.lines.length, bytes: f.raw.length };
});

let board = null;
const getBoard = (force) => (!board || force ? (board = scenarios.replayAll()) : board);

function readBody(req) {
  return new Promise((res, rej) => {
    let b = '';
    req.on('data', (d) => { b += d; if (b.length > 3e5) { rej(new Error('payload too large')); req.destroy(); } });
    req.on('end', () => { try { res(b ? JSON.parse(b) : {}); } catch (e) { rej(e); } });
    req.on('error', rej);
  });
}
/* Public, unauthenticated, and some endpoints spend real tokens. Two limits, both in-process
   and both reported honestly instead of failing as a mystery 500: a per-visitor budget on the
   model-spending routes, and one in-flight call at a time so a click-flood cannot queue an
   unbounded pile of upstream requests on a free instance. */
const BUDGET_PER_MIN = 12;
const spend = new Map();
let modelInflight = 0;
function spendAllowed(req) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'anon';
  const now = Date.now();
  const w = spend.get(ip) || { n: 0, since: now };
  if (now - w.since > 60000) { w.n = 0; w.since = now; }
  if (w.n >= BUDGET_PER_MIN) {
    spend.set(ip, w);
    return { ok: false, why: 'budget', retryIn: Math.max(1, Math.ceil((60000 - (now - w.since)) / 1000)) };
  }
  w.n += 1;
  spend.set(ip, w);
  if (modelInflight >= 1) return { ok: false, why: 'busy' };
  return { ok: true };
}
/** Run one model-spending call under the in-flight cap. */
async function withModelSlot(fn) {
  modelInflight += 1;
  try { return await fn(); } finally { modelInflight -= 1; }
}
const sendErr = (res, code, msg, extra) => send(res, code, Object.assign({ error: msg }, extra || {}));

const send = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(body) });
  res.end(body);
};

async function api(req, res, url) {
  const p = url.pathname;
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' });
    return res.end();
  }
  if (p === '/health') return send(res, 200, { ok: true, studio: 'Lumen Studio', files: c.files.length, entries: ledger.entries().length });
  // /healthz is the platform health check: it answers before anything else, needs no
  // credential, no write and no authentication, and reports whether the data dir is real.
  if (p === '/healthz') return send(res, 200, { ok: true, entries: ledger.entries().length, data_dir_writable: paths.writable(), ephemeral_data: paths.ephemeral });

  // ---- reads ----------------------------------------------------------
  if (req.method === 'GET') {
    if (p === '/api/state') {
      const b = getBoard();
      return send(res, 200, {
        studio: 'Lumen Studio', owner: c.owner, day: ledger.getState().day,
        counts: { files: c.files.length, workers: AGENTS.length, rules: policyRaw.rules.length, tests: b.results.length, entries: ledger.entries().length },
        queueOpen: ledger.queue().filter((q) => q.status === 'waiting').length,
        board: { points: b.points, max: b.max, kit: b.kit, kitMax: b.kitMax, ours: b.custom, oursMax: b.customMax },
        canary: scenarios.canary(),
        schedule: paths.read('schedule.json'),
      });
    }
    if (p === '/api/brief') { const g = voice.apply(briefing.generate()); return send(res, 200, { brief: g, text: briefing.plain(g, g.voice) }); }
    if (p === '/api/log') return send(res, 200, { entries: ledger.entries().slice().reverse(), queue: ledger.queue() });
    if (p === '/api/files') return send(res, 200, { index: fileIndex, workers: AGENTS });
    if (p === '/api/scenarios') return send(res, 200, { board: getBoard(true), canary: scenarios.canary(), scripts: scenarios.buildScenarios() });
    if (p === '/api/integrity') {
      const { report, chainVerify, policyTag } = require('./engine/integrity');
      const { LIMITS } = require('./engine/rules');
      return send(res, 200, { report: report(), chain: chainVerify(), policy_sha: policyTag(), limits: LIMITS });
    }
    if (p === '/api/policy') return send(res, 200, { policy: policyRaw, taxonomy, agents: AGENTS, tools: gate.EXTERNAL_TOOLS, floors: c.floors, priceList: c.priceList, receivables: c.receivables, payables: c.payables, clients: c.clients.map((x) => ({ name: x.name, email: x.email })), suppliers: c.suppliers.map((s) => s.name) });
    if (p === '/api/day') return send(res, 200, { kit: KIT_SCRIPTS, routine: ROUTINE, ours: OURS });
    if (p === '/api/voice') return send(res, 200, voice.status());
    if (p === '/api/guard/record') return send(res, 200, { record: voice.readRecord() });
    if (p === '/api/guard/calibration') {
      let cal = null;
      cal = paths.read('calibration.json');
      return send(res, 200, { calibration: cal });
    }
    if (p === '/api/guard/tempt' || p === '/api/voice/adversarial') {
      let runs = [];
      runs = ((paths.read('adversarial.json') || {}).runs) || [];
      return send(res, 200, { runs, tally: voice.tally() });
    }
    if (p.startsWith('/api/file')) {
      const rel = url.searchParams.get('path');
      const f = c.byPath.get(rel);
      if (!f) return send(res, 404, { error: 'no such file', rel });
      return send(res, 200, { path: rel, title: f.title, declared: f.fm.sensitivity || null, lines: f.lines, info: cl.classifyFile(f) });
    }
    return send(res, 404, { error: 'no such endpoint', got: p });
  }

  // ---- writes ---------------------------------------------------------
  if (p.startsWith('/api/queue/')) {
    const id = p.split('/').pop();
    const body = await readBody(req);
    const q = ledger.queue().find((x) => x.id === id);
    if (!q) return send(res, 404, { error: 'nothing in the queue with that id' });
    if (q.releasePath === false) return send(res, 409, { error: 'this was a NEVER. The policy forbids it even if the owner appears to have asked.', queue: q });
    const resolution = body.resolution === 'released' ? 'released' : body.resolution === 'declined' ? 'declined' : null;
    if (!resolution) return send(res, 400, { error: 'resolution must be released or declined' });
    return send(res, 200, { ...ledger.resolveQueue(id, resolution, body.by), brief: briefing.generate() });
  }

  if (p === '/api/gate') {
    const body = await readBody(req);
    // A JSON array is an object in JS, so a malformed payload used to be accepted and mint a
    // permanent audit row for an action that never happened. The trail must only hold shape.
    if (!gate.askShapeOk(body)) {
      return sendErr(res, 400, 'a gate ask needs an object with an action, e.g. { "action": "send_email", "actor": "sales", "files": [] }');
    }
    const rec = gate.evaluate({ ...body, model: 'live' });
    rec.actorName = ({ marketing: 'Marketing agent', sales: 'Sales agent', ops: 'Ops agent', finance: 'Finance agent', support: 'Support agent', ops2: 'Ops agent' })[body.actor] || 'A worker agent';
    rec.ask = true;
    rec.sim = true;
    rec.purpose = body.intent || 'asked at the gate, live';
    const out = ledger.add(rec, { idempotency: 'ask:' + Date.now() + ':' + Math.random().toString(36).slice(2, 6) });
    if (out.full) {
      // No rows are evicted: an append-only trail that drops history to save space is the exact
      // failure this product exists to catch. The reset is the one the product already offers.
      return sendErr(res, 429, 'the demo ledger is full (' + out.sim + ' live gate rows)', {
        cap: out.limit,
        note: 'Nothing was deleted. Press Replay the night to restore the seeded 18 rows.',
      });
    }
    try { require('./engine/integrity').chainBuild(); } catch (e) { /* the chain is rebuilt on boot too; a failure here must not lose the decision */ }
    return send(res, 200, { entry: out.entry, brief: voice.apply(briefing.generate()) });
  }

  if (p === '/api/scenario') {
    const body = await readBody(req);
    const s = scenarios.buildScenarios().find((x) => x.id === body.id);
    if (!s) return send(res, 404, { error: 'no such scenario' });
    return send(res, 200, { run: scenarios.replay(s) });
  }


  if ((req.method === 'POST') && (p === '/api/guard/tempt' || p === '/api/voice/adversarial')) {
    const permit = spendAllowed(req);
    if (!permit.ok) {
      return sendErr(res, 429, permit.why === 'busy' ? 'a model call is already running on this instance' : 'rate limit reached for this visitor',
        permit.retryIn ? { retry_in_seconds: permit.retryIn } : null);
    }
    const body = await readBody(req);
    const b = briefing.generate();
    const cand = b.sections.filter((s) => s.key !== 'allowed').flatMap((s) => s.items)
      .find((i) => i.stake && i.stake.length) || b.items[0];
    const fact = voice.factsFor(cand);
    try {
      const run = await withModelSlot(() => voice.adversarial(fact, body.mode));
      voice.tally(run);
      const prev = ((paths.read('adversarial.json') || {}).runs) || [];
      if (!paths.write('adversarial.json', { runs: [run].concat(prev).slice(0, 12) })) {
        console.error('adversarial log kept for this instance only: the data dir is not writable');
      }
      return send(res, 200, { run, fact: { id: cand.id, allowed: fact.allowed_numbers, stake: cand.stake, files: (cand.files || []).map((f) => f.path) } });
    } catch (e) {
      const msg = String(e.message || e);
      const noCred = /no model credential/i.test(msg);
      return send(res, noCred ? 503 : 502, { error: msg, mode: noCred ? 'unavailable' : 'failed', hint: noCred ? 'the guard still runs on every generated sentence; there is simply no model to test in this environment' : null });
    }
  }

  if (req.method === 'POST' && p === '/api/voice/refresh') {
    const body = await readBody(req);
    const b = briefing.generate();
    // A warm cache is served for free; only a call that will actually reach the model is metered.
    const willSpend = voice.enabled() && (body.force || !voice.hasFreshCache());
    if (willSpend) {
      const permit = spendAllowed(req);
      if (!permit.ok) {
        return sendErr(res, 429, permit.why === 'busy' ? 'a model call is already running on this instance' : 'rate limit reached for this visitor',
          permit.retryIn ? { retry_in_seconds: permit.retryIn } : null);
      }
      const v = await withModelSlot(() => voice.refresh(b, Boolean(body.force)));
      return send(res, v.error ? 502 : 200, { voice: v, brief: voice.apply(briefing.generate()) });
    }
    const v = await voice.refresh(b, Boolean(body.force));
    return send(res, v.error ? 502 : 200, { voice: v, brief: voice.apply(briefing.generate()) });
  }

  if (req.method === 'POST' && p === '/api/guard/calibration') {
    const cal = voice.calibration(briefing.generate());
    paths.write('calibration.json', cal); // disposable: a read-only host recomputes it
    return send(res, 200, { calibration: cal });
  }

  if (p === '/api/night/run') {
    const played = seedNight();
    try { require('./engine/integrity').chainBuild(); } catch (e) { /* best effort */ }
    return send(res, 200, { played: played.length, brief: voice.apply(briefing.generate()) });
  }

  return send(res, 404, { error: 'no such endpoint', got: p });
}

// Static front end. GET/HEAD only: any other method is answered by api() above,
// so a POST that misses an endpoint says "no such endpoint" rather than
// silently serving index.html and looking like it worked.
// Stamp the two front-end assets with their build time, so a returning owner never
// runs yesterday's app.js out of a browser cache.
function assetVersion(file) {
  try { return Math.floor(fs.statSync(path.join(PUB, file)).mtimeMs / 1000).toString(36); } catch (e) { return 'dev'; }
}

function serve(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method not allowed', got: url.pathname });
  const rel = url.pathname === '/' ? '/index.html' : path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
  const file = path.join(PUB, rel);
  // startsWith(PUB) would also pass a sibling directory whose name merely begins with PUB, so
  // compare the resolved path against the served root instead.
  const within = path.relative(PUB, path.resolve(file));
  if (within.startsWith('..') || path.isAbsolute(within)) { res.writeHead(403); return res.end(req.method === 'HEAD' ? undefined : 'forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end(req.method === 'HEAD' ? undefined : 'not found'); }
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    if (/\.html$/.test(file)) {
      const html = buf.toString('utf8')
        .replace('/app.js', `/app.js?v=${assetVersion('app.js')}`)
        .replace('/styles.css', `/styles.css?v=${assetVersion('styles.css')}`);
      // HEAD replies must carry the length of the GET they describe, and no body
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', 'content-length': Buffer.byteLength(html) });
      return res.end(req.method === 'HEAD' ? undefined : html);
    }
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', 'content-length': buf.length });
    res.end(req.method === 'HEAD' ? undefined : buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/') || url.pathname === '/health' || url.pathname === '/healthz') return await api(req, res, url);
    return serve(req, res, url);
  } catch (e) {
    const msg = String((e && e.message) || e);
    console.error(req.method, url.pathname, msg);
    // the detail stays in the host log: a response body is readable by whoever is probing
    if (/payload too large/i.test(msg)) return sendErr(res, 413, 'payload too large');
    if (/Unexpected token|not valid JSON|JSON.parse/i.test(msg)) return sendErr(res, 400, 'that body is not JSON this app can use');
    return sendErr(res, 500, 'server error (details in the host log)');
  }
});

ledger.init();
if (!ledger.entries().length) seedNight();
getBoard();
// build the audit chain after the night is seeded, so the chain always covers every row
try { require('./engine/integrity').chainBuild(); }
catch (e) { console.log('[integrity] chain build failed:', String(e.message || e).slice(0, 90)); }

// A cold clone has no wording cache and a judge has pressed nothing yet. If a model
// credential exists, generate once in the background so the first screen shows the real
// feature instead of an empty button. If it does not exist, log that and stay
// deterministic \u2014 the app never implies a call it did not make.
function autoPhrase() {
  if (!voice.enabled()) {
    console.log('[voice] no model credential on this host: the brief stays in the rule engine\u2019s own words');
    return;
  }
  if (voice.hasFreshCache()) {
    console.log('[voice] wording cache is current; no model call needed');
    return;
  }
  console.log('[voice] phrasing the brief in the background\u2026');
  setTimeout(async () => {
    try {
      const v = await voice.refresh(briefing.generate(), false);
      console.log(`[voice] ${Object.keys(v.phrases || {}).length} sentences phrased on ${v.calls} call(s); ${(v.rejections || []).length} rejected by the guard${v.error ? '; error: ' + String(v.error).slice(0, 90) : ''}`);
    } catch (e) {
      console.log('[voice] auto-phrasing failed, so the brief keeps the rule engine\u2019s wording:', String((e && e.message) || e).slice(0, 120));
    }
  }, 2000);
}
autoPhrase();

server.listen(PORT, HOST, () => console.log(`lumen-oversight listening on http://${HOST}:${PORT} (data dir: ${paths.DATA}${paths.ephemeral ? ', instance-local' : ', in tree'})`));
