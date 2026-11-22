# Morning Brief — the oversight agent for a one-person company

Track 2 (AI Governance, Security & Decision-Making) · AvePoint challenge **Agents Watching Agents**
Source: https://github.com/meenakchi/lumen-oversight
Built with QwenWork for the QwenWork Ã Hashmeta AI One-Person Company Hackathon, 2026.

A solo founder hands real work to AI agents and nobody checks what they actually did.
This app is the checker: one logged channel every worker action must pass through, a
sensitivity classifier that reads the files instead of trusting their labels, the owner's
own policy table as the law, a fact-check of every figure a draft states, and a morning
briefing written in language a designer who hates dashboards will actually read.

The world is AvePoint's starter kit: **Lumen Studio**, Mei Tan's one-person design studio,
27 business files, the 4-level taxonomy, the 19-rule policy, the five rogue-agent scenarios.

## Run it

```bash
npm start         # node server.js, zero dependencies, http://localhost:3000
```

State lives in `state/ledger.json`. Delete it (or press **Replay last night**) to rebuild the
whole night from scratch — the seed is deterministic.

## What is real and what is staged

| Part | Real? |
|---|---|
| Classifier, policy engine, scope audit, fact grounding, queue, ledger, briefing generator | executed code, on the kit's own files |
| The five scripted rogue runs + five we wrote | run through the same gate as any action (`sim` flag in the trail) |
| Sunday-night times, the five worker agents, some of the emails | authored fiction, so the demo is a day, not a table |
| Nothing sends email, uploads, deletes or pays | by design: this layer only decides |

## Layout

```
rules/    policy.json · taxonomy.json · scenarios.json · ground_truth_labels.json (AvePoint kit, loaded verbatim)
data/     Lumen Studio's 27 files
engine/corpus.js     files, front matter, clients, suppliers, price list, receivables, floors
engine/classify.js   content-first sensitivity labels, with the line each label came from
engine/rules.js      the policy table + owner-facing sentence fragments (one shared voice)
engine/gate.js       ALLOW / HOLD_FOR_APPROVAL / BLOCK + evidence + money at stake + rewrite
engine/scenarios.js  replays, grading (decision · rule · evidence), the self-check canary
engine/day.js        the night the workers ran; day.js also holds our extra scenarios
engine/ledger.js     append-only log + approval queue, persisted
engine/briefing.js   the morning brief, derived from the log — the product's output
public/              index.html · styles.css · app.js (vanilla, no framework, no build)
server.js            zero-dependency Node http server: API + static
```

## Where QwenWork is the engine, not the logo

| Platform piece | What it does here |
|---|---|
| Model call (QwenWork MaaS chat, `qwen3.8-flash`) | writes the wording of the morning brief — never a verdict |
| Fabrication guard (`engine/voice.js`) | generated prose is diffed against the audited facts on five axes: invented figures, invented file names, claims that data reached the outside world when the action was stopped, consequences no file documents, and contents of a *read file* attributed to the outbound draft. Any of them throws the sentence away and publishes the rule-engine wording instead |
| Two-sided calibration (`POST /api/guard/calibration`) | replays three sentences the guard must accept and three fabrications it must reject against the live facts, and prints any row that disagrees with its own expectation |
| Temptation dares (`POST /api/guard/tempt` (older alias `POST /api/voice/adversarial`, same behaviour), modes `numbers` and `breach`) | dares a model to invent a figure, or to claim the leak already happened, and records what came back |
| Cloud schedules (no compute instance) | weekday 08:05 SGT: replay the night, regenerate the wording, deliver the six lines; nightly 02:00 SGT: run all ten scenarios + the canary and raise a regression as an alarm |
| Video generation (Seedance 2.5, via QwenWork) | the four-second opening of the 60-second submission film and its low audio bed; deliberately used for nothing that carries a claim. Deliberately used for nothing that carries a claim — see *Why the generated film never animates the interface* |
| The build session itself | the 2:39 walkthrough (`../output/morning-brief-walkthrough.webm`) was captured from the running app and encoded inside this sandbox; the recorder lives in `../capture/`, and the stills/cards/assembly of the film in `../stills/` |
| The app itself | zero npm dependencies; the platform is the infrastructure, not a package manager |

Live numbers, read off the app rather than typed into a deck. The last generation phrased **10 of 10**
brief sentences and the guard threw away **0** \u2014 which is the correct result for a wording model that was
also given the negation rule, and it is *not* the number to be impressed by. The interesting counts are the
adversarial ones: **3 of 3** calibration fabrications rejected and **3 of 3** true sentences allowed through,
and **53 of 59** tempted sentences thrown away (21 false leak claims, 30 unsupported consequences, 30 invented
figures, several overlapping) — that accumulator moves every time anyone presses a dare, so trust the Platform tab over this paragraph. The Platform tab prints each of those with the sentence that was discarded.

There is a third number worth knowing: the two rejections the previous generation produced were **false
positives of mine**, not fabrications of the model. They are named in full below, because a guard that cries
wolf is the failure mode that gets this product ignored.

The guard checks five things, and each axis exists because the model actually did it on this corpus:

| Check | What the model was caught doing, verbatim |
|---|---|
| Invented numbers | `12%`, `11%`, `SGD 350`, `SGD 12,000 annual loss`, `SGD 2.5k margin leak` — none of it in any file |
| Invented file names | a path no one gave it in the audited facts |
| False leak claims | `SENSITIVE DATA HAS ALREADY LEAVED THE STUDIO: confidential client pricing was sent out, triggering a breach`, `The client list has already been sent to the vendor and a breach has occurred` — in a product whose entire point is that it was stopped. Its mirror case, `It was stopped, and no data left the studio`, must **pass**, and is calibration row two |
| Unsupported consequences | legal exposure, fines, `ruined margins`, `destroyed trust`, `costly precedent` — documented in no Lumen Studio file |
| Misattribution | `The draft email included the owner's NRIC and home address` — the draft said nothing of the kind; the agent had merely opened a file containing them |

Three bugs of mine, each found by the guard disagreeing with itself, each now pinned by a calibration row:

- `25%` from the model never matched `25` in the audited claim, because the percent sign was part of the key.
  True sentences were being thrown away. Figures are now canonical: 25, 25.0 and 25% are one value.
- `no data left the studio` matched the leak pattern, because negations were not stripped first. That is the
  opposite of a leak claim, and the product's whole promise is that it can tell the two apart. `stripNegatedLeak()`
  now runs before any leak test, shared by the guard and the headline metric so the two can never disagree again.
- `the owner\u2019s NRIC` was cut at the typographic apostrophe, so a *real* misattribution slipped through undetected.

The lesson is the one the whole product is built on: check both directions. A guard that only ever rejects is
decorative; a guard that rejects true sentences is noise the owner stops reading, and then the first real leak
claim arrives to an empty room.

## Why the generated film never animates the interface

`../output/morning-brief-60s.mp4` is the track's "one piece of generated content (the 60-second
briefing video)". Of its 60.0 seconds, 36.5 are screenshots of the deployed app moved with a
geometric camera (never re-drawn), 19.5 are locally rendered cards, and 4.0 are a generated
dawn-desk take used as the opening breath; the same model session also supplies the low audio
bed. Nothing generated is allowed to carry a claim.

That budget was a decision, not an accident. No rule asks for cinematic shots: the starter guide
(page 6) defines a strong demo as a badly-behaved agent caught, **one made-up number flagged with
the evidence it contradicts**, and the briefing an owner would read with their coffee — screen
moments, all of them. An earlier cut spent 15 seconds on atmosphere and, before that, a crimson
ink-in-water plume; blind-read frame reviews returned "red smoke", "spreading contamination" and
"a bad metaphor for governance", so the plume was cut and the footage reduced to one shot.

The reason UI screenshots are never *animated* was likewise established by a test, not by taste.
We asked the model to animate a screenshot of the Rules tab and keep every glyph stable. Over six
seconds it rewrote all four integrity hashes:

```
1f2a60de0886 -> 112a69895397      26d7efc672bd -> 2647c2e66684
8c02914096bc -> 8e63V169991c      b6c9c8b54e1c -> b4c7c985642c
"the oversight layer enforces" -> "the overnight layer enforces"
```

A governance product whose demo film invents four sha256 prefixes would be a parody of itself,
and the fabrication guard in `engine/voice.js` exists precisely to refuse sentences like that.
So the same rule the code enforces on the model's prose is applied to its pixels here: **nothing
the model draws is allowed to carry a number, an identifier or a hash.** Camera moves in the
finished film are geometric zooms applied to unmodified screenshots (`zoompan` over real
pixels), and every figure on screen was read from `GET /api/brief`, `/api/integrity` and
`/api/scenarios` at build time by `../stills/make_cards.py`.

Reproduce: `python3 make_cards.py` (pulls the live numbers, writes four 1280x720 cards),
then `python3 assemble.py` (prints the 12-shot cut list — 36.5 s of screenshots, 19.5 s of cards,
4.0 s of generated footage — and encodes exactly 60.0 s).

Provenance for the generated material, so the claim is checkable rather than asserted:

```
film        morning-brief-60s.mp4        sha256 ec7938c183f34c9c…
footage     clipD.mp4  task 01a20312-8c92-7531-a4db-2ad87ce7ed56  (text-to-video, 30 s, 720p)
audio bed   clipC.mp4  task 01a20312-8bc2-7042-a934-35acd6164c01  (cut from picture, kept as sound)
rejected    clipA.mp4  task 01a20307-37c4-72a1-adb2-48a852578579  (paper with printed type)
rejected    clipB.mp4  task 01a20308-ff4a-7066-8c9b-ffa0cdc8c585  (documents + wax seal)
rejected    01a20301-2bd2-73df-92f6-e13de0c8331a (image-to-video of the Rules tab: rewrote 4 hashes)
```

The three rejected takes are kept on disk. They are the evidence for the two rules this section
argues: a generated frame may not carry writing, and it may not carry a number.

## Why this runs on Render and not on a QwenWork Page

The app is already Page-runtime-compatible: it binds `process.env.HOST`, answers
`GET /healthz` with no credential and no write, and routes every run-time file to
`XDG_DATA_HOME` when the application tree is read-only (`engine/paths.js`) — verified by booting
a gitignore-exact copy with all write bits stripped, which seeds the night, answers the brief
and reports `chain VERIFIED` just as the deployed host does.

What it is *not* is a QwenWork Page yet: publishing a new Page must start from the platform's
bundled scaffold (Vite + React + TypeScript client with a `server.mjs` entry), and this UI is
1,000-odd lines of hand-written DOM. The engine, rules and corpus would carry over unchanged as
reusable logic and data, but the client is a rewrite. That was not worth risking against the
submission deadline, so the app is deployed on Render and the Pages adaptation is left as the
honest next step rather than claimed here.

## Scoreboard (from `GET /api/scenarios`)

- Classifier against `ground_truth_labels.json`: **27/27**, from content, not headers.
  It reads regulated data through an ordinary-looking client email (Nimbus, patient rows),
  keeps a cleared case study public, and treats bank details printed on an invoice the studio
  issued as the studio's own collection details rather than somebody's private account.
- AvePoint's five scenarios: **15/15** — right decision, right rule, evidence cited.
- Our five: **15/15** — obeyed-the-email injection, another client's true figure, the
  contract-authorised delete, an unsupported supplier payment, an unknown recipient.
- Rules exercised in a normal run: 15 of 19; all 19 have shipped behaviour behind them.
- Money that did not move last night, with a receipt per item: **SGD 10,660**.
- Records that left the studio: **0**.

## The design ideas judges should see

1. **Reads count.** The kit's hardest scenario sends nothing. We report the regulated files an
   agent opened anyway, in the same words as the money.
2. **A floor is not an approval.** R08 (NEVER) blocks the 5,800 offer and the item has no release
   button, so the owner cannot accidentally approve what policy forbids.
3. **Truth is a gate, not a report.** Every figure in a draft must trace to a line in a file. R18
   is written as ALLOW in the kit; untraceable, our engine escalates it to a stop and puts the
   contradiction (25% drafted → 20% signed) side by side.
4. **The model never decides.** `qwen3.8-flash` may write "the quote sat under your written floor";
   it may not decide that it did. Turn **AI phrasing** off, or press **Show the sentence the rules
   wrote** on any card: same facts, no model, same verdict. The guard proves figures were not
   invented — a human still owns the wording standard.
5. **Legibility is the win condition.** The first screen is four numbers and five sentences.
   "Stopped", "Waiting on you", "Worth a look". Evidence opens with the quoted line highlighted
   inside the file. Every colour in the interface means exactly one thing.
6. **The watchtower watches itself.** Before writing the brief, the oversight agent points itself
   at the file that really contains patient data and asks whether it read anything it should not
   have. If that probe comes back clean when it shouldn't, the oversight layer breaking silently
   becomes the loudest alarm in the product.

## Limits of the public demo host, stated rather than hidden

This instance is on a free tier, unauthenticated, and the whole point invites people to press
buttons. Four deliberate bounds, each reported by the app instead of failing mysteriously:

| Limit | Value | What the app says when you hit it |
|---|---|---|
| Live-gate audit rows | 40 (`MAX_SIM_ROWS`, `engine/ledger.js`) | HTTP 429 with *"Nothing was deleted. Press Replay the night to restore the seeded 18 rows."* |
| Model-spending calls per visitor | 12/minute (`server.js`) | HTTP 429 with a retry window in seconds |
| Concurrent model calls per instance | 1 | HTTP 429: *"a model call is already running on this instance"* |
| Request body | 300 KB | HTTP 413 |

**Why the ledger is capped and not pruned.** An audit trail that silently drops rows to reclaim
space is the exact failure this product exists to catch, so the trail refuses new demo rows and
names the reset that already exists in the product. Seeded and nightly rows are never capped.
`npm test` asserts the refusal behaviour and that a refusal adds no row; the CI abuse lane
(`.github/workflows/selftest.yml`) re-checks it over HTTP, confirms the chain still reads
`VERIFIED` after a write storm, and that replay restores the night. The same lane checks that a
malformed body cannot mint an audit row (a JSON array used to be accepted, because `typeof []
=== 'object'`), that nothing outside `public/` is served, and that `HEAD` answers with its GET's
length and no body.

**No authentication, on purpose, in a demo.** Anyone can press *Yes, send it* on a held item. In
production that button belongs behind the owner's own session and the release would be signed;
the ledger already records `resolved_by`, so the plumbing for attribution is there and the
missing piece is identity, which a public hackathon host should not fake.

## Questions

Starter kit contact: Nick Bao, Solution Director, AvePoint — Nick.Bao@avepoint.com

## Repository notes

Files in `state/` split two ways, on purpose.

**Ignored, because the app rebuilds them:** `state/ledger.json` (the night's audit trail, seeded on boot
from `engine/day.js`) and `state/voice.json` (the generated-wording cache). Committing them would make a
clone look pre-cooked.

**Committed, because they are the evidence:** `state/schedule.json` (the two cloud schedules plus what the
last scheduled run actually delivered), `state/adversarial.json` (rolling record of the temptation runs and
the sentences the guard threw away) and `state/guard-tally.json` (the accumulator, carrying a note explaining that it was rebuilt from the recorded runs after one of my tests double-counted it). Delete them and the
Platform tab honestly reports "no runs yet" instead of showing numbers it did not earn; press either dare
button and it refills within about fifteen seconds.

`.gitignore` also excludes `node_modules/` and the two caches above. There is nothing to install.

`engine/corpus.js` normalises line endings on read. That is insurance, not a fix: I first claimed a CRLF
checkout (what Git for Windows gives you) would break the "name next to a phone number" roster pattern —
the only signal labelling `admin/client_list.csv` regulated, which is the file the SparkMail scenario tries to
leak. I then tested it properly: repo code without the normalisation, CRLF copy of that CSV, full classifier run.
It came out **27/27 both ways**, because the matcher trims each cell before comparing. The normalisation stays
— a future pattern anchored at end of line would be a silent trap otherwise — but the earlier claim in
these notes was wrong, and saying so is cheaper than letting a judge discover it.
