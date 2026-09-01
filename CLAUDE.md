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
