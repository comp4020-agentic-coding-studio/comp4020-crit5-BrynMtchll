import { describe, expect, it } from "vitest";
import { createCan, pourPoint, spoutOf, stepCan } from "./can";
import { layoutFor } from "./world";

const LAYOUT = layoutFor(12, 8, 900, 700);

const DT = 1 / 60;

function chase(target: number, ticks: number) {
  let can = createCan(LAYOUT);
  for (let i = 0; i < ticks; i += 1) can = stepCan(can, LAYOUT, target, can.y, DT);
  return can;
}

describe("the can", () => {
  it("lags behind your hand, then overshoots it", () => {
    const target = createCan(LAYOUT).x + 260;
    let can = createCan(LAYOUT);
    let furthest = can.x;
    for (let i = 0; i < 300; i += 1) {
      can = stepCan(can, LAYOUT, target, can.y, DT);
      furthest = Math.max(furthest, can.x);
    }
    // Overshoot is the mechanic, not a bug: without it the can is just a
    // cursor and there is no skill to learn. It does come back — it just takes
    // longer than a player's patience, which is the joke.
    expect(furthest).toBeGreaterThan(target);
    expect(can.x).toBeCloseTo(target, 0);
  });

  it("pours ahead of the spout while it is still moving", () => {
    let can = createCan(LAYOUT);
    for (let i = 0; i < 8; i += 1) can = stepCan(can, LAYOUT, can.x + 400, can.y, DT);

    expect(can.vx).toBeGreaterThan(0);
    expect(pourPoint(can, LAYOUT).x).toBeGreaterThan(spoutOf(can, LAYOUT).x);
  });

  it("pours under the spout once it has settled", () => {
    const can = chase(LAYOUT.width / 2, 400);
    expect(Math.abs(can.vx)).toBeLessThan(1);
    expect(pourPoint(can, LAYOUT).x).toBeCloseTo(spoutOf(can, LAYOUT).x, 1);
  });

  it("stays inside the frame however hard it is flicked", () => {
    let can = createCan(LAYOUT);
    for (let i = 0; i < 200; i += 1) {
      can = stepCan(can, LAYOUT, i % 2 === 0 ? -9000 : 9000, can.y, DT);
      expect(can.x).toBeGreaterThanOrEqual(0);
      expect(can.x).toBeLessThanOrEqual(LAYOUT.width);
    }
  });
});
