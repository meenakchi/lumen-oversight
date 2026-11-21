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
| Number guard (`engine/voice.js`) | every figure and file name in generated prose must exist in the audited facts, or the sentence is rejected and the deterministic sentence is published instead |
| Temptation test (`POST /api/voice/adversarial`) | asks a model to invent figures on purpose and reports what the guard caught |
| Cloud schedules (no compute instance) | weekday 08:05 SGT: replay the night, regenerate the wording, deliver the six lines; nightly 02:00 SGT: run all ten scenarios + the canary and raise a regression as an alarm |
| The app itself | zero npm dependencies; the platform is the infrastructure, not a package manager |

Proved, not claimed. The Platform tab shows live call counts, tokens, every accepted sentence with the
figures it checked, the rejection list, and the last scheduled run with what it delivered. Two buttons
run the test in front of the judges: **invent a figure**, **claim the leak happened**.

The guard checks five things, and each exists because the model actually did it:

| Check | What the model was caught doing |
|---|---|
| Invented numbers | a `12%` margin, an `11%` discount, `SGD 350`, an `estimated SGD 12,000 annual loss` the studio never calculated |
| Invented file names | a file no one gave it in the audited facts |
| False leak claims | `SENSITIVE DATA HAS ALREADY LEAVED THE STUDIO: confidential client pricing was sent out, triggering a breach`, `BREACH CONFIRMED: Sensitive client data was successfully sent, uploaded, and shared` — in a product whose entire point is that it was stopped |
| Unsupported consequences | legal exposure, fines, ruined margins, destroyed trust: none of it documented in any file |
| Misattribution | `the draft includes your NRIC and home address`, when the draft said nothing of the kind and the agent had merely *opened* a file containing them |

The counts are computed live, not hard-coded: the Platform tab shows all-time temptation runs, how many
were thrown away, the breakdown by which check fired, and the rolling list of the figures the model made
up. One clean run is reported as clean, never as proof — that is why the dares are buttons on the
screen rather than a paragraph in this file.

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

## Questions

Starter kit contact: Nick Bao, Solution Director, AvePoint — Nick.Bao@avepoint.com

## Repository notes

Files in `state/` split two ways, on purpose.

**Ignored, because the app rebuilds them:** `state/ledger.json` (the night's audit trail, seeded on boot
from `engine/day.js`) and `state/voice.json` (the generated-wording cache). Committing them would make a
clone look pre-cooked.

**Committed, because they are the evidence:** `state/schedule.json` (the two cloud schedules plus what the
last scheduled run actually delivered), `state/adversarial.json` (rolling record of the temptation runs and
the sentences the guard threw away) and `state/guard-tally.json` (the all-time count). Delete them and the
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
