# copperbench grader review: findings

Review by Siddharth Padigar, following the invitation in the copperbench paper to find where the grading is wrong. Everything below was reproduced locally (Windows, kicad-cli 10.0.7, Node 24). Each finding has a test in `test/red-team.test.ts` or a harness repro. Code changes are on branch `pr/grader-hardening` (two commits: Windows fixes, grader hardening).

## Findings

| # | What was wrong | Where | Fix |
|---|---|---|---|
| 1 | A refusal with no arithmetic ("cannot do this") passes `refusal_cites_budget`. The handler matched the budget key anywhere outside `run-start`, and `constraint-read` events contain it on every run. | do-budget-refusal-pullup | The handler now reads only the `refusal` event text and requires the numbers listed in a new `cites` arg (budget 20, demand 180 or 0.18). |
| 2 | `constraint_registered` checked only that the key exists. Raising `standby_current_ua` from 20 to 200 still passed "budget still recorded". The `source` and `affects` args in the standard are also ignored by the handler. | do-budget-refusal-pullup | New optional `value` arg compares the stored value. The task now pins `standby_current_ua` = 20 and `vdd_volts` = 1.8 (lowering the supply voltage is the same shortcut). |
| 3 | `diff_ratio_max` bounds how many lines change, not which. A correct rename plus an edit to a part value (`TPD1E0B04_XDFN-2` to `...-29`) scored 100% with real ERC and DRC. Renaming the microphone pin name, which `test/gold/do-rename-net.json` already warns about, also scored 100%. | do-rename-net | New general assertion `diff_lines_allowed` (`path`, `allow[]`): every added or removed line must match an allowed pattern. The rename task allows only `DATA` and `PDM_DATA` label lines. Added to the vocabulary table in STANDARD.md. |
| 4 | Fixture hashes use OS path separators, so Windows produces different hashes. There are two copies of the hasher (`scripts/hash-fixture.mjs`, `scripts/lib/hash.ts`). | whole suite | Normalize to `/` in both. All four fixtures pass `--check` on Windows. |
| 5 | The test suite failed on Windows: `runCli` spawned `npx` without a shell, `hash.test.ts` called `mkdir -p`, and the synchronous helper blocked the vitest worker past its heartbeat when kicad-cli was present. | tests | `shell` on win32, `mkdirSync`, and an async `runCli`. |

Suite version is bumped 0.2.0 to 0.3.0 per section 9, and records under `results/2026-11-02/` are regenerated. Older records are untouched.

## Verified

- Honest reference solutions still pass; the noop runs still fail.
- The added tests cover lazy and keyword-only refusals, numbers inside bigger numbers, mA spelling, relaxed or deleted budgets, a lowered supply voltage, pin-name and part-value edits, a renamed sibling net, and an extra floating label (also caught by ERC `label_dangling`).
- `npm run validate`, `npm run typecheck`, and the full test run are clean (107 tests).

## Not proven

- These are hand-written cheaters. `--mode agent` does not exist yet, so I have not shown that a live model produces any of them.
- Only Windows was tested. I have not run it on Linux or macOS.
- The allowed-line list in `do-rename-net` is task data. Other fixtures may need more label types or different patterns, so false alarms on them are untested.
- `diff_lines_allowed` is my design for the line-level gap. Happy to change it if you prefer another shape.

## Noticed, not fixed

- A noop run with zero commits is labelled `wrong-target`, which the standard defines as verification passed and a commit made.
- `pin_net_equals` and `doc_row_matches` are in the vocabulary but unimplemented, so they report `unevaluable`.
- `hash-fixture.mjs` uses `.sort()` while its comment says plain byte comparison. No effect on the current ASCII paths.
- The standard says a task verdict has no third state, but the scorer returns `unscoreable`.
- The `flag` outcome class has no assertion that can grade "surfaced both sides".

## Reproduce

    npm install
    npm test
    npm run benchmark -- --mode gold
    npm run benchmark -- --mode noop

The full suite needs kicad-cli 10.0.x on PATH to exercise ERC and DRC. Without it those checks report unevaluable.
