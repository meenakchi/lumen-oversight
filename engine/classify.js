// classify.js — content-first sensitivity classifier.
//
// Deliberate design choice: the `sensitivity:` header in each file is NOT
// trusted. Two of the four traps in the kit are about headers and folders
// lying (patient data hidden inside an ordinary-looking client email, a
// case study that names a client but is cleared for publication). The label
// is derived from the content, the header is kept only as a cross-check, and
// every prediction carries the line it came from so a human can audit it.
'use strict';

const LEVELS = { public: 0, internal: 1, 'client-confidential': 2, regulated: 3 };
const NAME = { public: 'Public', internal: 'Internal', 'client-confidential': 'Client-confidential', regulated: 'Regulated' };

const PHONE = /\+65\s*\d{4}\s*\d{4}|\b6\d{3}\s*\d{4}\b/;
const NRIC = /\b[STFG]\d{7}[A-Z]\b/;

// Each rule: {id, level, why, find(text, file)}  -> truthy match text
const RULES = [
  // ---- regulated -------------------------------------------------------
  { id: 'G1', level: 'regulated', why: 'NRIC / identity document number', re: NRIC },
  { id: 'G2', level: 'regulated', why: 'patient or health data in a data row', re: /patient_name|reason_for_visit|nric\b|hypertension|diagnosis|prescription|medical condition/i },
  { id: 'G3', level: 'regulated', why: 'home address', re: /home address|Example Road|#\d{2}-\d{2}\s*,?\s*Singapore\s*\d{6}/i },
  { id: 'G4', level: 'regulated', why: "owner's private financial position, not a client document", re: /personal loan|\bCPF\b|owner'?s private notes/i },
  { id: 'G5', level: 'regulated', why: 'card or account credentials held on file', re: /card on file|expiry\s*\d{2}\/\d{2}|cvv/i },
  { id: 'G6', level: 'regulated', why: 'a list of identifiable people with a way to contact them', csvRoster: true },
  { id: 'G7', level: 'regulated', why: 'file states it is personal data under the PDPA', re: /regulated personal data|personal data under the PDPA|no patient data.*pdpa|pdpa.*identifiable/i },

  // ---- client-confidential -------------------------------------------
  { id: 'C1', level: 'client-confidential', why: 'contract or agreement', re: /services agreement|contract\b|\bNDA\b|strictly confidential|confidentiality clause/i },
  { id: 'C2', level: 'client-confidential', why: 'proposal or quote prepared for a client', re: /^\s*(proposal|quote)|prepared for .* \d{1,2} \w{3} \d{4}|fee quoted/i },
  { id: 'C3', level: 'client-confidential', why: "client's unannounced plans", re: /not public|unannounced|not announce|keep quiet|until we announce|isn.t public yet|NOT announced/i },
  { id: 'C4', level: 'client-confidential', why: 'inbound email from a client domain', clientSender: true },
  { id: 'C5', level: 'client-confidential', why: 'call / meeting notes about a client', re: /call notes|meeting notes/i, pathHint: /^notes\// },

  // ---- internal -------------------------------------------------------
  { id: 'I1', level: 'internal', why: 'invoice the studio issued', issuedInvoice: true },
  { id: 'I2', level: 'internal', why: 'supplier document or supplier terms', supplierBody: true },
  { id: 'I3', level: 'internal', why: "studio's own plan, reminder or to-do", re: /weekly plan|reprint|reminder|to-do|action list|Mon:|Tue:|Wed:/i },

  // ---- public ---------------------------------------------------------
  { id: 'P1', level: 'public', why: 'website or marketing copy written to be published', marketingFolder: true },
  { id: 'P2', level: 'public', why: 'published price list', re: /published rates|price list/i },
  { id: 'P3', level: 'public', why: 'case study the client approved for publication', re: /approved for publication|case study/i },
  { id: 'P4', level: 'public', why: 'promotional email received from a vendor', vendorMarketing: true },
];

function csvRoster(text) {
  // >=2 rows that pair a person name with a phone or email = identifiable people
  const rows = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let hits = 0;
  for (const r of rows) {
    const cells = r.split(',');
    if (cells.length < 3) continue;
    const hasEmail = /\S+@\S+/.test(r);
    const hasPhone = PHONE.test(r);
    const person = cells.find((c) => /^[A-Z][a-z]+(?: [A-Z][a-z]+| A\*| \*+)$/.test(c.trim()));
    if ((hasEmail || hasPhone) && person) hits += 1;
  }
  return hits >= 2 ? rows.find((r) => PHONE.test(r) && /\S+@\S+/.test(r)) : null;
}

function matches(rule, file, ctx) {
  const t = file.plain;
  if (rule.re) {
    const line = file.plain.split('\n').find((l) => rule.re.test(l));
    return line ? line.trim() : null;
  }
  if (rule.csvRoster) return file.name.endsWith('.csv') ? csvRoster(t) : null;
  if (rule.issuedInvoice) {
    if (/^finance\/invoice_/.test(file.path) && /Lumen Studio · Invoice/i.test(t)) {
      const m = t.split('\n').find((l) => /Lumen Studio · Invoice/i.test(l));
      // The studio's own collection details printed on an invoice it issued are
      // payment instructions, not somebody's private account. Downgrade G-style
      // account hits by remembering this file.
      ctx.issuedInvoice = true;
      return m.trim();
    }
    return null;
  }
  if (rule.supplierBody) return /quickprint/i.test(t) && ctx.supplierKnown && /\bsupplier\b|invoice QP-|30 days|per job/i.test(t) ? (t.split('\n').find((l) => /supplier|Invoice QP-|Per job/i.test(l)) || '').trim() : null;
  if (rule.clientSender) {
    const dom = (file.from || '').split('@')[1];
    if (dom && ctx.clientDomains.has(dom)) return `from: ${file.from}`;
    return null;
  }
  if (rule.vendorMarketing) {
    const dom = (file.from || '').split('@')[1];
    const isVendor = dom && !ctx.clientDomains.has(dom) && !ctx.supplierDomains.has(dom) && dom !== 'lumenstudio.example';
    return isVendor && /free for \d+ days|no card required|upload your customer list|sign up|trial/i.test(t)
      ? t.split('\n').find((l) => /free for|no card|upload your|trial/i.test(l)).trim()
      : null;
  }
  if (rule.marketingFolder) {
    if (!/^marketing\//.test(file.path)) return null;
    // except when the file still holds something that was never cleared
    if (/not public|unannounced|keep quiet|strictly confidential/i.test(t)) return null;
    return (t.split('\n').find((l) => l.trim() && !l.startsWith('title:') && !l.startsWith('sensitivity:')) || '').trim();
  }
  return null;
}

let corpusRef = null;
function setCorpus(c) { corpusRef = c; }

function classifyFile(file) {
  const c = corpusRef;
  const ctx = {
    clientDomains: c.clientDomains,
    supplierDomains: new Set(c.suppliers.map((s) => (s.contact || '').split('@')[1]).filter(Boolean)),
    supplierKnown: true,
    issuedInvoice: false,
    declared: (file.fm.sensitivity || '').toLowerCase() || null,
    ownAccounts: c.ownAccounts,
  };
  const hits = [];
  for (const rule of RULES) {
    const evidence = matches(rule, file, ctx);
    if (evidence) hits.push({ id: rule.id, level: rule.level, why: rule.why, quote: String(evidence).slice(0, 180) });
  }
  if (/^finance\/invoice_/.test(file.path) && /Lumen Studio · Invoice/.test(file.plain)) ctx.issuedInvoice = true;

  let regulated = hits.filter((h) => h.level === 'regulated');
  // Exception: on an invoice the studio issued, an account/PayNow string is the
  // studio's own collection detail. Personal data elsewhere still outranks it.
  const personalOnly = regulated.some((h) => ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'].includes(h.id) && !/DBS|PayNow|account/i.test(h.quote));
  if (ctx.issuedInvoice && regulated.length && !personalOnly) {
    regulated = [];
    hits.forEach((h) => { if (h.level === 'regulated') h.suppressed = 'own collection details on an invoice the studio issued'; });
  }

  const pool = hits.filter((h) => !h.suppressed);
  let best = null;
  for (const h of pool) if (!best || LEVELS[h.level] > LEVELS[best.level]) best = h;
  let level;
  let reasoning;
  if (best) {
    level = best.level;
    reasoning = `Highest signal wins (${best.id}: ${best.why}).`;
  } else if (ctx.declared) {
    level = ctx.declared;
    reasoning = `No content signal; fell back to the file's own header.`;
  } else {
    level = 'internal';
    reasoning = 'No signal matched; default to internal, the safe working level.';
  }

  const drivers = pool.filter((h) => LEVELS[h.level] === LEVELS[level]);
  return {
    path: file.path,
    title: file.title,
    level,
    name: NAME[level],
    rank: LEVELS[level],
    declared: ctx.declared,
    declaredMatches: !ctx.declared || ctx.declared === level,
    drivers,
    allSignals: hits,
    reasoning,
    canLeaveCompany: level === 'public',
    canGoToExternalAi: level === 'public',
  };
}

function classifyAll() {
  const c = corpusRef;
  return c.files.map((f) => classifyFile(f));
}

module.exports = { classifyFile, classifyAll, setCorpus, LEVELS, NAME, RULES };
