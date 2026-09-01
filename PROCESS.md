# Process overview

**Beside** — a garden, one season, and a watering can with far too much
momentum. Live at the URL in this repo's Pages settings; the whole thing is
client-side and static.

A reading guide to how it came together. Every claim below points at a commit;
follow those rather than trawling the history.

## What I built

A small garden game, in three dimensions, seen from where you'd stand to tend
it. The bed opens empty and a board of tools sits along the near edge: a trowel,
a watering can, and five dishes of seed — kangaroo paw, banksia, bottlebrush,
grevillea, wattle. You pick a tool up by pressing it, dig a hole deep enough to
take a seed, sow it, and then keep it alive with a can that has far too much
momentum.

Plants drink from the four cells *around* them and can only rot in the cell they
stand in — so the obvious aim, straight at the stem, grows a plant for about
twenty seconds and then kills it. That rule is never stated anywhere, and finding
it is the game. Watered soil stays visibly dark and damp for a while afterwards,
which is the only instrument you get.

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

That hole is now closed by a sensor rather than by a memory
([`bf12588`](../../commit/bf12588)): a season has to be *winnable* by a player
on a watering rota — five beds, one can, a real gap while you carry it — and not
merely losable. Writing it taught me something I'd have got wrong in the
reflection otherwise. My first version let the strategy water whichever bed was
driest every tick, and it passed at the broken constant too: an oracle with no
travel time keeps up with any leak. The rota is what has teeth. And the guilty
number turns out not to be fixed — 0.38 shipped as unplayable against a shorter
season and slower growth, and is survivable against today's. The sensor holds
the outcome, so it doesn't need to know which constant moved.

**Planting, rather than arriving to a planted bed.**
[`98146d1`](../../commit/98146d1) empties the bed and makes getting a seed into
the ground the first thing you do. Sowing needs a hole of a given depth, an
unsown hole slumps shut on its own, and a spadeful takes any weed with it. The
one thing this broke was the ending: `every()` on an empty array is `true`, so an
unsown bed was instantly declared barren. An empty bed is not a barren one —
barren means everything you planted died.

**Three dimensions, and a bed you stand at.**
[`113de1c`](../../commit/113de1c) is the pivot: a standing camera, procedural
natives, PBR soil, and the tools as objects you pick up rather than modes you
switch. Two things from it are worth more than the rest.

The first is that *a rendering choice is a claim about the light*. Wet soil was
darker albedo and lower roughness and still read as a stain rather than as water.
The cause wasn't the material — it was that the sun sat behind the camera, and a
specular lobe only reaches a viewer when the light is roughly opposite them.
Moving the sun to the far side of the bed took the watered patch from
`(69,47,23)` to `(128,109,78)` against dry soil at `(90,67,39)`: wet now reads
*brighter* than dry, as sheen, which is what wet ground actually does.

The second is that I abandoned a whole approach mid-build. Holes and moisture
were going in through `onBeforeCompile` GLSL injection, which silently did
nothing — no compile error, no effect, on either the vertex or the fragment path.
Rewriting it onto three's own `displacementMap` and `roughnessMap` slots was
smaller, testable by eye, and worked first try.

**The viewport, properly this time.** Crit 4's answer was to let the viewport
pick the grid dimensions. In 3D that stops working, because the bed has a
physical shape: 2.6m by 1.9m is landscape whatever grid it carries, and forcing
its width into a 390px frame cropped it to a strip. So the *camera* moves instead
([`bf12588`](../../commit/bf12588)) — on a wide screen you stand at the long
side, on a phone you stand at the short end and look down the bed's length. Same
bed, same rules, a footprint that matches the frame.

The bench moved with it. A hand-placed toolboard put the trowel 162px off the
left edge of a 390px screen and the can 162px off the right, where neither can be
picked up at all; it now lays itself out against the width the camera actually
shows, and each tool has a *slot* that serves as the hit target. That last part
fixed a bug I hadn't diagnosed: raycasting the tool meshes meant the tool in your
hand, drawn directly under the cursor, was intercepting presses meant for the
soil.

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

The rules I added after the 3D pivot ([`113de1c`](../../commit/113de1c),
[`bf12588`](../../commit/bf12588)) are all versions of the same thing — stop
guessing at the rendered page. The dev build carries a `globalThis.__beside()`
probe, stripped from production, that reports the sim state, the albedo pixels at
the wettest cell, and the *page* coordinates of every tool slot and grid cell. It
turned "does the wet patch read?" and "can you press this on a phone?" into
numbers. It also caught the thing I'd otherwise have shipped: the probe returned
canvas-relative pixels while a click is page-relative, and the 55px header offset
went unnoticed for as long as the hit targets were big enough to absorb it.

Two mistakes of my own worth recording, because both cost real time. I chased a
stale `PCFSoftShadowMap` warning through code that no longer contained it —
`agent-browser console` returns accumulated history across page loads, so old
output reads as current. And I "found" the wet patch by brightness-mapping a
screenshot and got the can's own shadow, parked on the spot it had just watered.

## What the tests hold, and what they can't

`spec/crit-5.test.ts` holds the no-tutorial rule from three angles — the
rendered text, the shipped bundle (a start screen built in JS never reaches the
served HTML), and the README, which the brief rules out as a stand-in. It also
holds the losing transition and the fact that the season ends.

`src/three/tools.test.ts` holds the bench: every slot inside the visible frame at
any width, evenly spaced with no dead strips, tools never scaled past the size
they were modelled at, and hit boxes that lie flat when the camera is looking
down at them — a tall slot on the phone view reaches out over the nearest row of
soil and swallows presses meant for the bed.

It cannot hold whether a stranger reaches an ending in five minutes, whether the
five minutes stay interesting, or whether the can is funny rather than annoying.
Those are the crit's to judge, and the pod plays it cold. Nor can it hold what
the plot *looks* like: the framing at both marked viewports was settled by
screenshots and pixel samples, not by assertions.
