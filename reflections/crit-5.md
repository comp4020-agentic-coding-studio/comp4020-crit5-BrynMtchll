<!-- DRAFT — replace this with your own words before the cutoff. What's below
     is raw material from the week, not a reflection: the two prompts are
     personal and a marker reads this exact file. Delete this comment when
     you've written it. -->

# Crit 5 — Beside

## What was the breakthrough that moved the work forward?

Material to draw on:

- Deciding the "chance" element wasn't chance. Root rot began as randomness and
  became hidden-but-deterministic state — moisture you can't read directly but
  can infer from the colour of the soil. That single decision bought both the
  learnability (a coin toss teaches nothing) and the testability (a coin toss
  can't be asserted).
- Building the rule module before anything was drawn, so the losing transition
  could be tested directly instead of through a canvas.
- The moment the tuning problem showed up: the drainage tests were green and
  the game was unplayable.

## What did this work change about who I want to be as a software developer?

Material to draw on:

- The green-tests-unplayable-game moment. The tests asserted the shape of the
  drainage curve and were right about it; they had nothing to say about whether
  a human could keep up with a can and five beds. I only found it by playing.
- Two of the three things I fixed late were rendering choices that were making
  false claims about the model — the grid-square moisture, the dead plant that
  read as a slug. Neither was a bug in any sense a test could hold.
- Carrying the harness forward surfaced a rule in CLAUDE.md that had been
  wrong for three weeks (it claimed typecheck ran `tsc --noEmit` when it had
  run `astro check` since crit 2), contradicting another section of the same
  file. Harness rot is real and nothing checks it.
