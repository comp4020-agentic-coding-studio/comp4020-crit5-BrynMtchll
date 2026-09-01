import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

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

  it("is a game, not a toy: a rule of play has a focused test", () => {
    // PLACEHOLDER — replace this with the real thing once the mechanic exists.
    //
    // The spec asks for one rule under a focused automated test, and for the
    // game to be losable: "a wrong move is possible, and play ends somewhere".
    // Both land here, and neither can be written stack-agnostically in advance
    // — the assertion depends on what the rule is.
    //
    // Write it against the rule module, not the DOM: a pure function that
    // takes a state and a move and returns the next state is both the easiest
    // thing to test and the easiest thing to keep honest. Assert the losing
    // transition specifically — that some reachable move ends the round — not
    // just that a scoring function adds up.
    expect.fail(
      "no test yet for the rule that can be lost — replace this placeholder with a focused test of the losing transition",
    );
  });
});
