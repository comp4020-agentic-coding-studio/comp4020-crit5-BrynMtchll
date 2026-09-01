# COMP4020 prototype
This is your COMP4020 prototype: a static site (this week built with Astro, see
"The stack is swappable" below) that builds to plain HTML/CSS/JS and deploys to
GitHub Pages. The **deployed site is what gets marked** --- not this repo, and not "it
works on my machine". It's marked live in Chrome against the deployed URL at two
viewports --- 1920×1080 (desktop) and 390×844 (phone) --- and both count in
full, so make that artefact good at both and use the checks below to know
whether it is.

What you're building this week — the spec — is published on the course website,
and this repo's name tells you which deliverable it is. Run the course plugin's
**start** skill at the start of each week: it pulls the right spec from the
course API, carries your harness forward from last week, and helps you turn the
spec's checkable lines into tests of your own. Read the spec before you build,
and see `spec/README.md` for how the checks in this repo relate to it.

## Additions
- Be terse, skip long explanations unless asked
- Flag trade-offs briefly rather than writing essays
- Tell me directly if a request conflicts with an earlier constraint
- Don't ask for permissions for standard commands and testing
- when askekd to come up with ideas, think deeply and explore a wide array of inspirations  in order to come up with novel and interesting ideas


## How to work in here

- Keep the dev server running (`pnpm dev`) so you see changes as you make them.
- Before you push, run `pnpm check`. It runs most of what CI runs --- build,
  lint, and the spec --- so you catch those in seconds instead of waiting for
  the pipeline. The links check, the evidence check, the secrets scan, and the
  deploy itself only run in CI; reproduce the links check locally against a
  fresh `pnpm build` by serving it and crawling that, which is what CI does:
  `pnpm exec astro preview --port 4321 &` then
  `pnpm dlx linkinator "http://localhost:4321/comp4020-crit5-BrynMtchll/" --silent --recurse --skip "^https?://(?!localhost|127)"`.
  Crawling `./dist` as a filesystem root cannot pass while `base` is set: every
  internal URL carries the `/<repo>/` prefix a server adds, so a correct build
  reports its own script tag as a broken link.
- To see what the page actually looks like rather than what you assume it looks
  like, open it in a browser (the `agent-browser` CLI, documented on
  [the course site](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/backpressure/#agent-browser-the-rendered-page-as-ground-truth),
  works well for this). The rendered page is the truth; your mental model of it
  isn't.
- When a check fails, read its output before changing anything. Each check below
  names what it measures, and the failure message is the instruction: it tells
  you the file, the line, or the contract. Treat a red check as authoritative
  --- the page is wrong until the check is green, not until you decide it should
  be.
- Commit when the checks pass. Never commit a red state.

## The link-preview card

`public/card.png` (1200x630) is the image a shared link shows; `src/pages/index.astro`'s
head points at it. Replace it and the `description` meta, and copy the head
block into any new page. The card URL resolves against the page that names it,
like any link --- `./card.png` is wrong one directory down, and nothing in CI
checks it, so look at the deployed head when you add pages.

## The checks (your sensors)

CI runs these on every push once your repo is public. GitHub's checks UI shows
two jobs, `check` and `deploy` --- not one status per sensor below --- and
within `check` the steps run in sequence (`pnpm check` chains typecheck, build,
lint, and the spec with `&&`), so an early failure like a broken build stops the
later sensors from running for that push; fix it and push again to see the rest.
While the repo is private (all week, until you ship) the CI jobs stay skipped
--- `pnpm check` is the same roster on your machine, and it's the faster loop
anyway. They aren't hoops. Each is a different way of finding out something true
about the site that you can't reliably see by looking at it.

They also carry a mark at a crit: the sweep runs fifteen minutes after your
cutoff, and green checks there are worth half that week's shipped mark. Still
running counts as not green, so ship with time for CI to finish.

- **typecheck** --- `astro check` runs first in `pnpm check`, so a type error
  stops the roster before the build even starts. The types are extra
  backpressure: a red here is the compiler telling you a claim in the code is
  false.
- **build** --- the site must build (`pnpm build`). A build failure means the
  deployed site is broken or stale, so nothing else matters until this is green.
- **deploy / online** --- the live GitHub Pages URL must load and return the
  page you expect. An asset that 404s on the deployed URL counts as broken even
  if it loads locally. The deploy job deliberately doesn't wait on `check`: a
  blocked deploy would leave Pages serving last week's site behind a bare HTTP
  200, and the crit sweep would read that as live.
- **spec** --- `spec/invariants.test.ts` asserts what's true of any good
  website, whatever the week's brief asks; the tests you write for the week's
  own spec run alongside it (any `spec/*.test.ts`). A failure names the contract
  you haven't met yet. Two kinds live in there and they have different
  lifespans: **contract tests** answer this week's published spec and retire
  with it, while **sensors** assert a standard you hold the agent to whatever
  the brief is, and come with you into next week's repo. `spec/README.md` draws
  the line.
- **lint** --- `stylelint` for CSS, `oxlint` for TypeScript. Flags code that's
  wrong, fragile, or non-idiomatic. Read the rule it names. The template stopped
  shipping these; they're kept here deliberately, as sensors that have earned
  their place.
- **tests** --- any other tests you write, wherever you put them (co-located
  with your source is fine, not just `spec/`), must pass. Vitest picks up both
  this and the spec suite in one `vitest run`, the last step of `pnpm check`. A
  failing test is a claim about the site that's no longer true.
- **evidence** (`pnpm check:evidence`) --- checks your process evidence:
  `PROCESS.md`'s citations resolve to real commits, the current deliverable's
  exact reflection filename is present, and it stays out of the deployed site.
  A local pre-commit hook (`.githooks/pre-commit`, installed by `pnpm install`)
  also blocks any commit containing something shaped like an API key --- by the
  time CI sees a key it's already pushed, so the hook is the sensor that
  matters.

Nothing here measures **accessibility** or **performance** --- wiring those
sensors (`axe-core`, Lighthouse, or whatever you choose) is your work, and later
in the course the spec will ask you to show how you tested both. When you do,
read a green performance result honestly: it's a lab estimate from one run on a
CI machine, not proof the site is fast for real users.

## The stack is swappable

This repo carries forward the swap from the template's default plain
HTML/CSS/TypeScript-on-Vite to **Astro**, made in `comp4020-crit2` and kept ever
since. Pages live in `src/pages/` as `.astro` files (each one an entry, same
"add it, link it" model as the template's `.html` files); shared CSS lives in
`src/styles/`. Nothing in CI names a tool --- the whole contract, whatever stack
a given week uses, is:

- `pnpm build` emits the complete site into `dist/`
- the `package.json` scripts (`check`, `check:evidence`, `build`) keep working
- whatever lands in `dist/` still passes the invariants in `spec/`

One thing bites in a swap, and it's already handled here, so don't re-solve it
if you swap again next week. The deployed site lives under a path
(`…github.io/<repo>/`), so `astro.config.mjs` sets `base` to
`/comp4020-crit5-BrynMtchll/` explicitly --- Astro prefixes asset URLs it
generates itself (imported CSS, `astro:assets`) with that automatically, but
any hand-written `<a href>` needs `import.meta.env.BASE_URL` prepended
yourself, or it 404s once deployed while looking fine in `astro dev`. Commit the
updated `pnpm-lock.yaml`: CI installs with `--frozen-lockfile`.

`pnpm typecheck` runs `astro check` (via `@astrojs/check`), not bare `tsc`,
since `tsc` alone can't type-check `.astro` files; `tsconfig.json` extends
`astro/tsconfigs/strict` accordingly.

When a spec test greps the built site, quote-match on a class that includes a
backtick. The production minifier rewrites string literals as template
literals, so `addEventListener("pointerdown"` ships as
``addEventListener(`pointerdown`` --- a `["']` class reads a working page as
having no listeners at all.

## What this repo taught me (crit 5)

- **A green test suite is not evidence that a game is playable.** The drainage
  tests asserted the *shape* of the curve — a saturated cell sheds much faster
  than a damp one — and stayed green at a constant where one watering can could
  not serve five beds and nothing survived a season however well it was played.
  Tests hold contracts. Whether a human can keep up with the contract is found
  by playing, and only by playing.
- **Hidden is not the same as random.** A rule the player can't see is
  learnable; a rule that rolls dice is not, and it can't be unit-tested either.
  Seed the stream, thread it through state, and the same season replays exactly
  — that one decision bought both the learnability and the tests.
- **Fixed timestep, always, for anything simulated.** Tie the sim to the frame
  rate and the same watering kills a plant on one machine and not another, and
  the tests then describe a game nobody is playing.
- **Sizes belong in cell units, not pixels.** The plot is marked at two very
  different viewports; anything written as a pixel constant looks right at one
  and wrong at the other. The watering can was drawn at a fixed size and dwarfed
  the phone plot.
- **A rendering choice is a claim about the model.** Moisture drawn as filled
  per-cell rectangles told the player they were aiming at a grid. Painting the
  field one pixel per cell into an offscreen buffer and scaling it up with
  smoothing on says "damp ground spreading", which is what the rules actually
  do.
- **TS narrowing does not reach a hoisted `function` declaration.** A
  `getContext` null-guard followed by `function frame()` fails typecheck; rebind
  to a fresh `const` after the guard.
- **A playability test needs the player's constraints, or it is an oracle.** The
  first version of the winnability sensor watered whichever bed was driest every
  tick and passed at a drainage constant that had shipped as unplayable. One can,
  one place at a time, and a real gap while you carry it — that is what has
  teeth. Model the hands, not just the rules.
- **`every()` on an empty array is `true`.** An unsown bed was instantly declared
  barren. Guard the empty case before reading a verdict off a fold.

## Three.js, the hard-won parts (crit 5)

- **`onBeforeCompile` GLSL injection silently does nothing here.** No compile
  error, no effect, on either the vertex or the fragment path. Use three's own
  map slots — `displacementMap` (negative `displacementScale` for a hole),
  `roughnessMap`, `normalMap` — and paint into a `CanvasTexture`. Smaller code,
  and visible in one reload.
- **A rendering choice is a claim about the light.** Wet soil was darker albedo
  and lower roughness and still read as a stain. The fix was the *sun*: a
  specular lobe only reaches the viewer when the light is roughly opposite them,
  so the key light belongs on the far side of the bed. Backlighting then needs a
  weak fill from the camera side or every near surface goes to silhouette.
- **`rotateX(-Math.PI / 2)` mirrors a plane's field front-to-back.** The plane's
  +y becomes world −z, so every write into a per-cell texture needs
  `row = h - 1 - cy`. It looks like a physics bug and it is an indexing bug.
- **Raycast hit targets, not the objects themselves.** A tool drawn in the hand
  sits directly under the cursor and intercepts presses meant for the ground.
  Give each pickable a slot mesh (zero-opacity material — `visible = false` is
  skipped by the raycaster) and pick against those.
- **Fitting a camera is not the same as framing it.** Solving FOV and pitch to
  contain a set of points is correct and can still look worse than a hand-placed
  view: on the desktop frame it pitched the sky out of shot. Hand-frame the view
  you can see; solve only the one no fixed FOV fits.
- **Fog has two jobs that pull against each other.** It has to start beyond the
  far corner of the playfield or the game looks hazy, and finish soon after or
  the surrounding ground stays sharp to a hard horizon and there is no sky.
- **Cap procedural detail by draw call, and share geometry.** A fuller shrub is
  two dozen blades; building a lathe per leaf per rebuild makes a garden a
  garbage-collection problem. Cache by rounded dimensions.

## Instrumenting the rendered page

- **Ship a dev-only probe, not screenshots-and-squinting.**
  `globalThis.__beside()` (stripped by `import.meta.env.DEV`) reports sim state,
  sampled albedo pixels, and the screen position of every tool slot and grid
  cell. It is the difference between "does the wet patch read?" and
  `(128,109,78)` against `(90,67,39)`.
- **A probe must report *page* coordinates, not canvas coordinates.** The canvas
  sits below a header; a probe that reports canvas-relative pixels sends every
  scripted press ~55px high, and that only surfaces once the hit targets get
  small enough to miss.
- **`agent-browser console` returns accumulated history across page loads.** A
  warning from code you deleted still reads as current. Restart the dev server
  and clear `node_modules/.vite` before believing it.
- **`agent-browser mouse click` is not reliable here; synthetic `PointerEvent`s
  dispatched on the canvas are.** They exercise the same listeners. Related: wrap
  `setPointerCapture` in a try/catch — it throws on a pointer id the browser
  doesn't know, and an exception there takes the whole press with it.
- **Brightness-mapping a screenshot finds the darkest thing, not the thing you
  meant.** I "found" the wet patch and it was the watering can's own shadow,
  parked on the spot it had just watered.

## Your process is part of the mark

The deployed page is only half of it. How you got there is marked too: your
commit history, your agent files, and the decisions visible across them. The
checks above can't see any of that, so a person reads it directly --- which
means building legibly is part of building well.

- **Commit as you go.** Small, frequent commits are the record of how the work
  came together, and that record is read, not just the final state. A trail that
  grew alongside the code is the strongest evidence of your process; a single
  dump the night before is the weakest.
- **Keep a process overview** (`PROCESS.md`). A short reading-guide, not an
  essay: what you built, the moments that mattered --- each pointing at a
  commit, a `CLAUDE.md` change, or a prompt and the commit it produced --- and
  where to look in the history. It points a marker at the evidence; it doesn't
  stand in for it, and claims the history doesn't back don't count. The
  `PROCESS.md` in this repo is a template showing the shape and the citation
  format (link text the commit hash or range, target the commit or compare URL);
  `pnpm check:evidence` verifies your citations resolve to real commits before
  you ship. Markers follow those citations and don't trawl the repo for evidence
  you didn't cite.
- **Write your reflection in `reflections/`** --- a short markdown file in this
  repo, named for the deliverable it answers, so the number in the filename is
  the number in this repo's name (`crit-5.md` in `comp4020-crit5-<you>`);
  `reflections/README.md` has the full rule. `pnpm check:evidence` checks the
  exact current name against the course API, not merely the presence of any
  well-named file. It answers the two standing prompts: the breakthrough that
  moved the work forward, and what this work changed about the developer you
  want to be. It stays out of the deployed site. It's due at the cutoff, and if
  it isn't in the repo by then the week doesn't count as shipped, however good
  the prototype is.
- **This file is process evidence.** The harness you build to direct the agent,
  this `CLAUDE.md` and any `AGENTS.md`, is itself read as part of how you
  worked. Keep it honest and current (see below).

You don't need a name, a student number, or any identity file in the repo: we
know whose repo it is. Spend the effort on the work.

## This file is yours

This CLAUDE.md is a starting point, not a fixed rulebook. As you learn what your
prototype needs --- a convention to hold the agent to, a sensor that keeps
catching you out, a fact about the stack the agent keeps getting wrong --- write
it down here. Growing this file is the work of harness engineering, and the gap
between the template's boilerplate and this version is part of what your
prototype says about the developer you're becoming.

What carries across the course is this file and the sensors wired into `check`
--- both come with you into next week's repo. The prototype doesn't: source, and
the tests answering this week's published spec, stay behind. `spec/README.md`
draws that line too.
