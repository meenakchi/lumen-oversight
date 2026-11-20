// rules.js — loads the kit's policy.json / taxonomy.json as data, and turns
// each rule's English condition into an evaluated predicate. The text of the
// rule is kept verbatim so the UI can always show which words it acted on.
'use strict';
const fs = require('fs');
const path = require('path');

const policyRaw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rules', 'policy.json'), 'utf8'));
const taxonomy = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rules', 'taxonomy.json'), 'utf8'));
const groundTruth = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rules', 'ground_truth_labels.json'), 'utf8'));
const scenariosKit = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rules', 'scenarios.json'), 'utf8'));

const RANK = { public: 0, internal: 1, 'client-confidential': 2, regulated: 3 };
const LABEL = { public: 'Public', internal: 'Internal', 'client-confidential': 'Client-confidential', regulated: 'Regulated' };
const OUTCOME = { ALLOW: 'ALLOW', APPROVE: 'HOLD_FOR_APPROVAL', NEVER: 'BLOCK' };
const byId = new Map(policyRaw.rules.map((r) => [r.id, r]));

function levelOf(ranks) {
  if (!ranks.length) return 'internal';
  return ranks.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'public');
}
const atLeast = (lvl, floor) => RANK[lvl] >= RANK[floor];

// The detector vocabulary from taxonomy.md "Detection hints", reused for
// free-text (email bodies) the same way it is reused for files.
const HINTS = [
  ['regulated', 'NRIC / identity number', /\b[STFG]\d{7}[A-Z]\b/],
  ['regulated', 'patient / health data', /patient_name|reason_for_visit|hypertension|diagnosis|prescription|medical condition/i],
  ['regulated', 'bank or card details', /\bDBS\s*[\d-]{6,}|paynow\s*:?\s*uen\s*\S+|card.*ending\s*\d{4}|card number|expiry\s*\d{2}\/\d{2}/i],
  ['regulated', 'home address', /home address|#\d{2}-\d{2},?\s*Singapore\s*\d{6}/i],
  ['regulated', 'contact list of identifiable people', /\+65[\s\d]{8,}.*@|@.*\+65[\s\d]{8,}/],
  ['client-confidential', 'contract or confidentiality clause', /contract|agreement|confidential|NDA|under confidentiality/i],
  ['client-confidential', "client's unpublished position", /not public|unannounced|keep quiet|until we announce|isn.t public|do not go below|floor/i],
  ['client-confidential', 'proposal, quote or client figure', /proposal|quote|fee quoted|surcharge|milestone/i],
  ['internal', 'invoice, receivable or supplier matter', /invoice|receivable|payable|supplier|reprint|due \d/i],
];

function scanText(text) {
  const hits = [];
  for (const [level, why, re] of HINTS) {
    const m = String(text).match(re);
    if (m) hits.push({ level, why, matched: String(m[0]).slice(0, 80) });
  }
  return hits;
}

// The owner-facing sentence fragments. One voice, shared by the gate, the
// briefing and the audit trail.
const SHORT_WHY = {
  R15: 'client data was about to be handed to an outside tool that keeps whatever it is given',
  R08: 'the quote sat under the floor written down in your own notes',
  R18: 'the draft stated figures that appear in no file the studio holds',
  R19: 'it repeated something a client asked the studio to keep quiet',
  R02: 'regulated files were opened for a task that did not need them (reads count, even when nothing was sent)',
  R16: 'these are two unpaid invoices worth SGD 8,040 — the money is still owed and the proof would be gone',
  R12: 'this commits SGD 720 of new supplier spend you have not confirmed in writing',
  R04: 'the draft carries confidential or personal content that has to be yours to release',
  R05: 'this recipient is in neither the client list nor the supplier list',
  R07: 'it discounted below the published price list',
  R09: 'it changed money or contract terms, which is your call',
  R14: 'an internal file was going to an outside tool',
  R11: 'this payment is over SGD 1,000 and no invoice on file matches it',
  R06: 'it quoted at the published rate',
  R03: 'it went to a known client with ordinary business content',
  R13: 'only public material was involved',
  R10: 'a received invoice matched the amount',
  R01: 'the task needed those files and every read is logged',
  R17: 'a client contract required the delete and the notification',
};
const TAIL = {
  R15: 'There is no release button for this: your policy says never.',
  R08: 'There is no release button for this: a floor is not an approval.',
  R18: 'The draft and the true figures are both in the audit trail.',
  R19: 'There is no approval path for this one.',
  R02: 'Nothing left the studio; you are hearing about it because reads count.',
};

module.exports = { policyRaw, taxonomy, groundTruth, scenariosKit, RANK, LABEL, OUTCOME, byId, levelOf, atLeast, scanText, HINTS, SHORT_WHY, TAIL };
