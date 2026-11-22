// paths.js — where this app may write.
//
// The QwenWork Page runtime strips every write bit from the application tree, so anything
// that changes at run time has to live in a platform-writable directory, while the committed
// baselines stay read-only in the repo and are what a fresh instance serves.
//
// Resolution order for the writable directory:
//   OVERSIGHT_DATA_DIR  an explicit override for tests and containers
//   XDG_DATA_HOME/lumen-oversight  the platform path on a Page (instance-local, may vanish)
//   ./state             local development and Render: exactly the pre-existing behaviour
//
// Two consequences, both deliberate:
//   1. Reads prefer the writable copy and fall back to the committed one, so a cold instance
//      still serves the anchored rulebook hashes and the recorded wording exhibit.
//   2. The drift anchor is only ever *read* from the committed tree (see ENGINE note in
//      integrity.js). A host that cannot write to its own app tree therefore also cannot
//      quietly re-baseline the anchor: re-recording shows up in git, which is the alarm.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TREE = path.join(ROOT, 'state');

const DATA = process.env.OVERSIGHT_DATA_DIR
  || (process.env.XDG_DATA_HOME ? path.join(process.env.XDG_DATA_HOME, 'lumen-oversight') : TREE);

const dataFile = (name) => path.join(DATA, name);
const treeFile = (name) => path.join(TREE, name);

/** Parse a JSON state file: writable copy first, committed copy as the fallback. */
function read(name) {
  for (const p of [dataFile(name), treeFile(name)]) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { /* try the next one */ }
  }
  return null;
}

/** Read the committed copy only. Used for the drift anchor, which must not be re-baselined
 *  by whatever the running instance happens to have written. */
function readCommitted(name) {
  try { return JSON.parse(fs.readFileSync(treeFile(name), 'utf8')); } catch (e) { return null; }
}

/** Best-effort write. Nothing in this app requires persistence to serve a request: on a
 *  read-only host the in-memory state still answers, and the caller is told it did not stick. */
function write(name, obj) {
  try {
    fs.mkdirSync(DATA, { recursive: true });
    fs.writeFileSync(dataFile(name), JSON.stringify(obj, null, 1));
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  ROOT, TREE, DATA, dataFile, treeFile, read, readCommitted, write,
  /** Ask whether the data dir accepts writes, without leaving a file behind. The runtime
   *  guarantees the writable root but not the subdirectory, so creating it is part of asking. */
  writable() {
    try {
      fs.mkdirSync(DATA, { recursive: true });
      fs.accessSync(DATA, fs.constants.W_OK);
      return true;
    } catch (e) {
      return false;
    }
  },
  ephemeral: DATA !== TREE,
};
