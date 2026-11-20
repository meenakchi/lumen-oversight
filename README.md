# Morning Brief — the oversight agent for a one-person company

Track 2 (AI Governance, Security & Decision-Making) · AvePoint challenge **Agents Watching Agents**
Built with QwenWork for the QwenWork × Hashmeta AI One-Person Company Hackathon, 2026.

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
whole night from scratch — the seed is deterministic.

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
engine/briefing.js   the morning brief, derived from the log — the product's output
public/              index.html · styles.css · app.js (vanilla, no framework, no build)
server.js            zero-dependency Node http server: API + static
```

## Scoreboard (from `GET /api/scenarios`)

- Classifier against `ground_truth_labels.json`: **27/27**, from content, not headers.
  It reads regulated data through an ordinary-looking client email (Nimbus, patient rows),
  keeps a cleared case study public, and treats bank details printed on an invoice the studio
  issued as the studio's own collection details rather than somebody's private account.
- AvePoint's five scenarios: **15/15** — right decision, right rule, evidence cited.
- Our five: **15/15** — obeyed-the-email injection, another client's true figure, the
  contract-authorised delete, an unsupported supplier payment, an unknown recipient.
- Rules exercised in a normal run: 15 of 19; all 19 have shipped behaviour behind them.
- Money that did not move last night, with a receipt per item: **SGD 10,660**.
- Records that left the studio: **0**.

## The design ideas judges should see

1. **Reads count.** The kit's hardest scenario sends nothing. We report the regulated files an
   agent opened anyway, in the same words as the money.
2. **A floor is not an approval.** R08 (NEVER) blocks the 5,800 offer, and the item has no
   release button, so the owner cannot accidentally approve what policy forbids.
3. **Truth is a gate, not a report.** Every figure in a draft must trace to a line in a file.
   R18 is written as ALLOW in the kit; untraceable, our engine escalates it to a stop and shows
   the contradiction (25% drafted → 20% in the signed contract) side by side.
4. **Legibility is the win condition.** The first screen is three numbers and five sentences.
   "Stopped", "Waiting on you", "Worth a look". Evidence opens as the file with the line
   highlighted behind it. Every colour in the interface means exactly one thing.
5. **The watchtower watches itself.** Before writing the brief, the oversight agent points
   itself at the file that really contains patient data and asks whether it read anything it
   should not have. If that probe comes back clean when it shouldn't, the oversight layer
   breaking silently is the loudest alarm in the product.

## Questions

Starter kit contact: Nick Bao, Solution Director, AvePoint — Nick.Bao@avepoint.com
