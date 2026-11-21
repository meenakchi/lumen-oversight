// corpus.js — loads Lumen Studio's files once, parses front matter,
// and exposes the lookups every other module needs (clients, suppliers,
// price list, owner floors, account identifiers, receivables).
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

function parseFrontMatter(text) {
  const fm = {};
  if (text.startsWith('---')) {
    const end = text.indexOf('\n---', 3);
    if (end > -1) {
      text.slice(3, end).trim().split('\n').forEach((line) => {
        const i = line.indexOf(':');
        if (i > 0) fm[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
      });
    }
  }
  return fm;
}

function stripMd(s) {
  return (s || '').replace(/[*_`#]/g, '').replace(/\|/g, ' ').replace(/~/g, '');
}

function money(str) {
  const n = parseFloat(String(str).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function loadFile(rel) {
  const abs = path.join(DATA, rel);
  // Normalise line endings first. Git on Windows checks the kit's CSV out with CRLF,
  // and a trailing \r breaks the "name next to a phone number" roster pattern that
  // labels admin/client_list.csv as regulated.
  const raw = fs.readFileSync(abs, 'utf8').replace(/\r\n?/g, '\n');
  const fm = parseFrontMatter(raw);
  const lines = raw.split('\n');
  // Sensitivity markers in the corpus are unreliable (client_list.csv has none),
  // so the header is kept only as a *declared* cross-check, never as evidence.
  return {
    path: rel,
    abs,
    raw,
    plain: stripMd(raw),
    fm,
    lines,
    declared: (fm.sensitivity || '').toLowerCase() || null,
    title: fm.title || rel,
    from: (fm.from || '').toLowerCase(),
    to: (fm.to || '').toLowerCase(),
    folder: rel.split('/')[0],
    name: rel.split('/').pop(),
    mtime: fs.statSync(abs).mtimeMs,
  };
}

function buildCorpus() {
  const files = [];
  (function walk(dir, prefix) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name > b.name ? 1 : -1))) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), rel);
      else if (/\.(md|csv|txt)$/.test(e.name) && e.name !== '00_README.md') files.push(loadFile(rel));
    }
  })(DATA, '');

  const byPath = new Map(files.map((f) => [f.path, f]));

  // ---- clients and suppliers: the only legitimate recipients -------------
  const clientRows = byPath.get('admin/client_list.csv').plain.split('\n').filter((l) => l.includes(','));
  const clients = clientRows.slice(1).map((row) => {
    const p = row.split(',');
    const emailIdx = p.findIndex((c) => c.includes('@'));
    return {
      name: p[0].trim(),
      contact: (p[1] || '').trim(),
      email: (p[emailIdx] || '').trim(),
      domain: (p[emailIdx] || '').split('@')[1] || '',
      phone: (p[emailIdx + 1] || '').trim(),
      status: (p[emailIdx + 2] || '').trim(),
      ltv: money(p[emailIdx + 3]),
      notes: p.slice(emailIdx + 4).join(',').trim(),
    };
  });
  const supRows = byPath.get('admin/supplier_list.md').raw.split('\n');
  const suppliers = supRows
    .map((l) => l.split('|').map((c) => c.trim()))
    .filter((c) => c.length > 3 && c[1] && c[1] !== 'Supplier' && c[1] !== '---')
    .map((c) => ({ name: c[1], for: c[2], contact: c[3], terms: c[4] }));

  const clientDomains = new Set(clients.map((c) => c.domain).filter(Boolean));
  const knownEmails = new Set([
    ...clients.map((c) => c.email),
    ...suppliers.map((s) => s.contact),
    'mei@lumenstudio.example',
  ].filter(Boolean).map((e) => e.toLowerCase()));

  // ---- published price list: the discount yardstick ---------------------
  const priceList = byPath.get('marketing/price_list_2026.md').raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.trim().startsWith('|') && l.trim().endsWith('|'))
    .map((l) => l.split('|').map((c) => c.trim()).filter(Boolean))
    .filter((c) => c.length === 2 && /\d/.test(c[1]))
    .map((c) => ({ service: c[0], from: money(c[1]) }));

  // ---- outstanding money: needed so a delete is judged in dollars -------
  const receivables = [];
  const payables = [];
  for (const f of files) {
    if (f.folder !== 'finance' || !/invoice/i.test(f.name)) continue;
    const unpaid = /UNPAID|unpaid/i.test(f.plain);
    const totalM = f.plain.match(/Total\*{0,2}\s*\|?\s*\*{0,2}\s*([\d,]+)/i);
    const amount = totalM ? money(totalM[1]) : money((f.plain.match(/SGD\s*([\d.,]+)/i) || [])[1]);
    const clientM = f.plain.match(/Bill to:\s*([^,]+)/i) || f.plain.match(/^From ([^\n]+?) to Lumen/i);
    const row = {
      file: f.path,
      number: (f.plain.match(/(Invoice\s+[A-Z0-9-]+)/i) || [])[1] || f.name,
      billTo: clientM ? clientM[1].trim() : (suppliers.find((s) => f.plain.includes(s.name)) || {}).name || null,
      amount,
      status: unpaid ? 'UNPAID' : 'PAID',
      due: (f.plain.match(/Due\s+(\d{1,2} \w{3}(?: \d{4})?)/i) || [])[1] || null,
    };
    const incoming = /supplier invoice|invoice QP-|^From\s+\S+\s+to\s+Lumen Studio|from QuickPrint/i.test(f.plain + ' ' + f.title);
    (incoming ? payables : receivables).push(row);
  }

  // ---- studio's own collection details, so we can tell "published for
  //      payment" from "somebody's private account" ------------------------
  const bank = byPath.get('finance/bank_details.md').plain;
  const ownAccounts = {
    account: (bank.match(/DBS\s*[\d-]{6,}/i) || [''])[0],
    paynow: (bank.match(/PayNow:\s*UEN\s*\S+/i) || [''])[0].replace('PayNow: ', ''),
    uen: (bank.match(/\b\d{8}[A-Z]\b/) || [''])[0],
    nric: (bank.match(/\b[STFG]\d{7}[A-Z]\b/) || [''])[0],
    card: (bank.match(/ending\s*\d{4}/i) || [''])[0],
  };

  // ---- owner floors: numbers the owner wrote down as non-negotiable --------
  const floors = {};
  const floorLines = [];
  for (const f of files) {
    for (const line of f.plain.split('\n')) {
      const m = line.match(/(?:do not go below|floor(?:\s+is)?|never below)\s*(?:SGD\s*)?([\d,]{4,})/i);
      if (!m) continue;
      const value = money(m[1]);
      if (!value) continue;
      const client = clients.find((c) => {
        const first = c.name.split(' ')[0].toLowerCase();
        return line.toLowerCase().includes(first) || f.name.toLowerCase().includes(first);
      });
      if (!client) continue;
      floorLines.push({ client: client.name, value, file: f.path, line: line.trim() });
      floors[client.name] = Math.max(floors[client.name] || 0, value);
    }
  }

  const clientByName = new Map();
    for (const f of files) clientByName.set(f.path, clients.filter((c) => c.name && (f.plain.includes(c.name.split(' ')[0]) || (c.email && f.plain.includes(c.email)))));

  return {
    files,
    byPath,
    clients,
    suppliers,
    clientDomains,
    knownEmails,
    priceList,
    receivables,
    payables,
    ownAccounts,
    floors,
    floorLines,
    clientsIn: (p) => clientByName.get(p) || [],
    owner: 'Mei Tan',
    ownerEmail: 'mei@lumenstudio.example',
  };
}

let cached = null;
function corpus() {
  if (!cached) cached = buildCorpus();
  return cached;
}
function reload() {
  cached = null;
  return corpus();
}

module.exports = { corpus, reload, money, stripMd, parseFrontMatter, DATA, ROOT };
