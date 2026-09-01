# Process overview

**Beside** — a garden, one season, and a watering can with far too much
momentum. Live at the URL in this repo's Pages settings; the whole thing is
client-side and static.

A reading guide to how it came together. Every claim below points at a commit;
follow those rather than trawling the history.

## What I built

A small garden game. Seeds are already in the ground when it opens, and the only
two things you can do are pour water on soil and pull weeds out of it. Plants
drink from the four cells *around* them and can only rot in the cell they stand
in — so the obvious aim, straight at the stem, grows a plant for about twenty
seconds and then kills it. That rule is never stated anywhere, and finding it is
the game.

There is no winning. The season ends at frost and the garden is whatever it is
by then; what bloomed drops seed and you go again.

## The moments that mattered

**Starting from the rule, not the picture.**
[`f59310c`](../../commit/f59310c) is the whole simulation with nothing drawn
yet: soil that diffuses and drains, plants that drink from a ring, rot that only
ever rises. Writing it DOM-free and clock-free wasn't tidiness — it's what let
me assert the losing transition directly in
[`791f33a`](../../commit/791f33a) instead of poking at a canvas. Everything
that can lose you the game is a pure function of `(state, dt)`.

**Choosing determinism over randomness, and getting testability free.**
Root rot started as the "chance" element. It isn't chance — it's a hidden state
you can't read directly but can infer from the colour of the soil. Weeds arrive
from a seeded stream threaded through the garden state
([`f59310c`](../../commit/f59310c)), so a season replays identically. If the
rot were actually random there'd be nothing to learn, and no way to test it.
Those turned out to be the same property.

**Making the asymmetry deliberate.** Thirst recovers; rot never does
([`f59310c`](../../commit/f59310c)). Forgetting to water is survivable,
drowning isn't. That single asymmetry is what makes the hidden rule carry
weight instead of being trivia.

**A change that came from playing, not reading.**
[`acf1bdc`](../../commit/acf1bdc) carries a tuning change I could not have
reasoned my way to. Drainage was quadratic at `DRAIN_K = 0.38`, which read fine
in the tests — the deluge/damp ratio was exactly what I wanted. Playing it, a
damp cell fell out of band in about two seconds, which meant one can could not
serve five beds and *nothing survived a season however well it was played*. The
tests were all green throughout: they were asserting the shape of the curve, not
whether a human could keep up with it. Dropped to `0.14`, which is about one lap
of the plot.

**Letting the viewport pick the grid.** The plot is marked at 1920×1080 and at
390×844 and no fixed grid reads at both — I had a 1.16 aspect world sitting in a
1.78 frame, letterboxed on both sides. So the grid became state rather than a
constant ([`acf1bdc`](../../commit/acf1bdc)): the caller picks dimensions from
the viewport, the rules never learn which. Desktop gets a wide shallow bed,
phone a narrow deep one.

**Fixing a mental model, not a pixel.** Moisture was drawn as filled rectangles,
one per cell, and the plot read as a *tile map* — hard square edges telling the
player they were aiming at a grid, which is precisely the wrong model for a rule
about where water goes. Now it's painted one pixel per cell into an offscreen
buffer and scaled up with smoothing, so damp ground spreads
([`acf1bdc`](../../commit/acf1bdc)).

## Where the harness earned its keep

`CLAUDE.md` came forward from `comp4020-crit4` and was merged against a template
that had moved underneath it ([`cd84e3d`](../../commit/cd84e3d)) — I took the
template's new material, kept the Astro links check and the lint sensors it had
dropped, and fixed a stale rule that had survived the crit 2 stack swap: it
still claimed typecheck ran `tsc --noEmit` when it had run `astro check` for
three weeks. Two sections apart in the same file, contradicting each other.

The rule I added this week is in [`acf1bdc`](../../commit/acf1bdc): tests that
assert a *curve* can be green while the game is unplayable. Green tests are not
evidence that a game is playable.

## What the tests hold, and what they can't

`spec/crit-5.test.ts` holds the no-tutorial rule from three angles — the
rendered text, the shipped bundle (a start screen built in JS never reaches the
served HTML), and the README, which the brief rules out as a stand-in. It also
holds the losing transition and the fact that the season ends.

It cannot hold whether a stranger reaches an ending in five minutes, whether the
five minutes stay interesting, or whether the can is funny rather than annoying.
Those are the crit's to judge, and the pod plays it cold.
