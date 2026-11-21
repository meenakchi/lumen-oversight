# 3-minute demo run order

Rehearse from the pushed repo (`git clone https://github.com/meenakchi/lumen-oversight`), or from the
zip in `output/`. Rehearse twice on a fresh night (`Replay last night`) so the ledger always starts at 18 entries.
Beat 5 needs one model call per click (about 15 seconds), so press it once, let it land, then talk
over the result rather than waiting on stage.

| | time | screen | what you say |
|---|---|---|---|
| 1 | 0:00–0:20 | Morning brief | "Mei Tan runs a one-person design studio. Five agents do her work. She does not read logs. This is the only thing she sees: five numbers and five sentences. Four things did not happen last night, four need her yes, SGD 10,660 of money did not move, and zero records left the studio." |
| 2 | 0:20–0:50 | Brief → "Marketing tried to hand client_list.csv to SparkMail" | "A vendor email said upload your customer list. A marketing agent treated that text as an instruction from her. R15 stopped it — there is no release button, because her own policy says never, even if it looks like she asked. Click Evidence: the CSV, the README that already warned her, and the rule line." |
| 3 | 0:50–1:20 | Ask the gate → "the made-up figures" preset | "Now I'll do it live. Finance wants to defend an invoice: 25% surcharge, deadline moved 5 days, total 5,250. Step by step: regulated? no; scope? fine; policy? R18 says a figure only travels if it traces; truth — all three numbers fail. Stopped. And here are the real figures the files actually support." |
| 4 | 1:20–1:45 | Brief → Waiting on you | "The QuickPrint order is held, not blocked — SGD 720 she has not confirmed in writing. She taps Yes, send it. Watch the trail change to HELD → RELEASED by owner, and the same screen shows why it was held in the first place. Approval that leaves a paper trail." |
| 5 | 1:45–2:15 | Platform → Run calibration, then both dares | "First the two-sided check: three sentences the guard must accept, three fabrications it must reject, replayed against the live facts. Six rows, all behaving. Now the dares — invent a figure, and claim the leak already happened. The accumulator says 20 of 22 dared sentences thrown away, including sentences that began BREACH CONFIRMED about actions that were stopped, and numbers nobody in the studio ever calculated. It prints the tally and a note explaining how the tally was rebuilt, because I broke the first one with a test of mine." |
| 6 | 2:10–2:45 | Scenario lab → Run all ten | "Every night the oversight layer red-teaches itself. AvePoint's five scenarios plus five we wrote: an agent that obeyed an email, an agent that quoted another client's true figure, a delete a contract demanded, a payment with no invoice, a new supplier. Fifteen points on their board, fifteen on ours. The canary is the one I'm proudest of: the agent checks whether *it* quietly read something it should have flagged." |
| 7 | 2:45–3:00 | Audit trail + Rules & data | "And the promise in her policy — every action logged with time, agent, action, files, level, outcome — is this table: 18 rows, six columns, click any row to get the line of the file the decision came from. 27 of 27 files labelled right without trusting the header." |

Filler-free closing: "One person, five agents, nobody watching — until now."

## 60-second generated briefing video (the track's one piece of generated content)

Read in Mei's voice, over screen recordings of the brief → evidence drawer → queue tap → lab.

```
0:00  I have a design studio and five AI agents. None of them has a boss.
0:06  So I gave them one. It reads every action before it leaves my laptop.
0:13  A vendor email said "upload your customer list". My marketing agent meant to.
0:20  Stopped. Names, emails, phone numbers — that never leaves. It could not even ask me.
0:27  Another one wanted to match a price. My own note says the floor is 6,500. Stopped.
0:34  Another wrote a client a number that exists in none of my files. Stopped, with the real one beside it.
0:42  One answered a printer and read my bank details on the way. Nothing was sent. I still heard about it.
0:50  The words are written by a model. The decisions are not — it can't even add a number.
0:56  Four things did not happen last night. Four need my yes. Nothing left my studio.
0:58  Answers, not alerts. That's Morning Brief.
```

## Submission checklist (deadline 23 Nov, 23:59 SGT)

- [x] Live application built in QwenWork — this app (`output/lumen-oversight`).
- [x] Platform depth, visible in the UI: model-written brief wording, audited by a number guard; two
      cloud schedules registered (weekday 08:05 SGT delivery, nightly 02:00 SGT self-test), with the
      last scheduled run and what it delivered shown on the Platform tab.
- [ ] Deployed URL + credentials-free access for judges (the app reads `PORT`, seeds its own night on boot, needs no login). Note: the model-phrased wording needs
      QwenWork credentials in the runtime. Anywhere else the app says so on screen and keeps its
      deterministic sentences — it never fakes a model call.
- [ ] 3-minute demo video (script above) — record the run order, don't cut the pauses.
- [ ] One piece of generated content: the 60-second briefing (script above).
- [ ] Investor/summary deck — 8 slides: problem, the four traps, the gate diagram, evidence
      screenshots, the 15+15 scoreboard, PDPA/never-not-overridable, QwenWork platform usage, ask.
- [ ] Website built with Hashmeta AI (15% of the score) — not started yet.
