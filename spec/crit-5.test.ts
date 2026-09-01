import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  createGarden,
  dig,
  DIG_PER_S,
  type Garden,
  POUR_PER_S,
  pour,
  SEASON_S,
  sow,
  step,
} from "../src/lib/garden";

const DT = 1 / 60;

/** Dig and sow the way a player does — the bed starts empty. */
function planted(seed: number, cx = 4, cy = 3): Garden {
  let garden = createGarden(seed);
  for (let i = 0; i < 60; i += 1) garden = dig(garden, cx, cy, DIG_PER_S * DT);
  return sow(garden, cx, cy, "kangaroo-paw");
}

// Crit 5 ("A game"): https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/05-game/
// Only the mechanically-checkable lines of the published spec get a test here.
// "a stranger can pick it up and reach an ending inside five minutes", "still
// interesting at five minutes", and whether the losing move feels fair are
// judged live at the crit, not by this suite — see spec/README.md.

const DIST = resolve("dist");

function shippedFiles(dir: string = DIST): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? shippedFiles(path) : [path];
  });
}

// Concatenated text of every shipped file (HTML, inline and bundled JS) —
// stack-agnostic, since a script tag's contents and a bundled .js file both
// land here whichever build tool produced them. Instructions injected at
// runtime never appear in the served HTML, so grepping the bundle rather than
// the parsed DOM is what catches a start screen built in JS.
const shipped = shippedFiles()
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

// The rendered text of every shipped page, with markup and script bodies
// stripped — what a player reads before touching anything.
const visibleText = shippedFiles()
  .filter((path) => path.endsWith(".html"))
  .map((path) => {
    const { document } = new JSDOM(readFileSync(path, "utf8")).window;
    for (const el of document.querySelectorAll("script, style")) el.remove();
    return document.body?.textContent ?? "";
  })
  .join("\n");

// Unambiguous tutorial constructs only. The borderline calls — whether a bare
// verb on the opening screen is a nudge or an instruction — belong to the pod
// playing it cold, not to a regex. A test that tried to own them would block
// legitimate design and still miss the real failure.
const TUTORIAL_PATTERNS: [string, RegExp][] = [
  ["a how-to-play heading", /how\s+to\s+play/i],
  ["the word 'instructions'", /\binstructions?\b/i],
  ["the word 'tutorial'", /\btutorial\b/i],
  ["a labelled controls list", /\bcontrols\b\s*[:\-—]/i],
  ["a labelled objective or goal", /\b(objective|goal|aim)\b\s*:/i],
  ["a 'press X to Y' instruction", /press\s+(?:the\s+)?[\w+]+\s+(?:key\s+)?to\s+\w+/i],
  ["an 'arrow keys' instruction", /use\s+(?:the\s+)?(?:arrow|cursor|wasd)\s+keys/i],
];

function offenders(text: string): string[] {
  return TUTORIAL_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(
    ([name]) => name,
  );
}

describe("crit 5 spec: a game", () => {
  it("teaches itself — no instructions in what a player reads", () => {
    const found = offenders(visibleText);
    expect(
      found,
      `the opening screen has to make the first move obvious without words, and play teaches the rest. Found: ${found.join(", ")}`,
    ).toEqual([]);
  });

  it("teaches itself — no instructions hidden in the shipped bundle either", () => {
    // A start-screen overlay built in JS never reaches the served HTML, so the
    // check above cannot see it. This one can.
    const found = offenders(shipped);
    expect(
      found,
      `no how-to-play modal, no instructions page — including one assembled at runtime. Found: ${found.join(", ")}`,
    ).toEqual([]);
  });

  it("teaches itself — the README doesn't stand in for the missing tutorial", () => {
    const readme = readFileSync(resolve("README.md"), "utf8");
    const found = offenders(readme);
    expect(
      found,
      `the brief rules out the README carrying the tutorial too. Found: ${found.join(", ")}`,
    ).toEqual([]);
  });

  it("can be lost: watering the crown drowns the plant, and play ends", () => {
    // The published line is "a wrong move is possible, and play ends
    // somewhere". The wrong move is the one a player makes first — aiming the
    // can at the stem. Roots drink from the ring; only the crown rots. So the
    // obvious aim grows the plant briefly and then kills it, and rot never
    // heals.
    //
    // Asserted against the rule module rather than the DOM, so it survives a
    // change of stack, and against the *transition* rather than a flag: the
    // plant is alive, the move is repeated, the plant is dead, and the season
    // ends without reaching frost.
    const start = planted(1);
    const plant = start.plants[0];
    if (!plant) throw new Error("expected a planted seed");
    expect(plant.dead).toBe(false);

    const dt = DT;
    let garden = start;
    for (let elapsed = 0; elapsed < 40; elapsed += dt) {
      garden = pour(garden, plant.cx, plant.cy, POUR_PER_S * dt);
      garden = step(garden, dt);
    }

    expect(
      garden.plants[0]?.dead,
      "a plant watered squarely on the stem for forty seconds should have rotted",
    ).toBe(true);
    expect(garden.plants[0]?.rot).toBe(1);
  });

  it("play ends somewhere even when nothing goes wrong: frost closes the season", () => {
    // The other half of the same spec line. There is no winning state to
    // reach — the season simply ends, and the garden is whatever it is. A run
    // that is never going to end would fail this outright.
    const start = planted(3);
    const plant = start.plants[0];
    if (!plant) throw new Error("expected a planted seed");

    const dt = DT;
    let garden = start;
    for (let elapsed = 0; elapsed < SEASON_S + 1 && garden.ending === null; elapsed += dt) {
      garden = pour(garden, plant.cx - 1, plant.cy, POUR_PER_S * dt);
      garden = step(garden, dt);
    }

    expect(garden.ending).toBe("frost");
  });

  it("a season is short enough for a stranger to see an ending", () => {
    // "a stranger can pick it up and reach an ending inside five minutes" is
    // judged at the crit, but the part of it that is arithmetic can be held
    // here: a season has to leave room for the losing run, the understanding,
    // and the run after it.
    expect(SEASON_S).toBeLessThanOrEqual(120);
  });
});

describe("sensors: standards I hold the work to, whatever the brief is", () => {
  // These outlive crit 5 and come forward into next week's repo — see
  // spec/README.md on contract tests versus sensors.

  it("simulates on a fixed timestep, independent of frame rate", () => {
    // Tie a simulation to the frame rate and the same watering kills a plant
    // on one machine and not another. Two different tick sizes covering the
    // same elapsed time must land in the same place.
    const play = (dt: number) => {
      let garden = planted(5);
      const plant = garden.plants[0];
      if (!plant) throw new Error("expected a planted seed");
      for (let elapsed = 0; elapsed < 20; elapsed += dt) {
        garden = pour(garden, plant.cx - 1, plant.cy, POUR_PER_S * dt);
        garden = step(garden, dt);
      }
      return garden.plants[0]?.growth ?? 0;
    };
    expect(play(1 / 120)).toBeCloseTo(play(1 / 60), 2);
  });

  it("replays a season identically from the same seed", () => {
    // Determinism is what makes a hidden rule learnable rather than a coin
    // toss, and it is what makes any of this testable at all.
    const play = (seed: number) => {
      let garden = planted(seed);
      for (let i = 0; i < 60 * 30; i += 1) garden = step(garden, 1 / 60);
      return JSON.stringify({ weeds: garden.weeds, plants: garden.plants });
    };
    expect(play(11)).toBe(play(11));
    expect(play(11)).not.toBe(play(12));
  });
});
