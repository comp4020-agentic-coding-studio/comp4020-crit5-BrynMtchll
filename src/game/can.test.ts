import { describe, expect, it } from "vitest";
import { createCan, pourPoint, spoutOf, stepCan } from "./can";
import { WORLD_W } from "./world";

const DT = 1 / 60;

function chase(target: number, ticks: number) {
  let can = createCan();
  for (let i = 0; i < ticks; i += 1) can = stepCan(can, target, can.y, DT);
  return can;
}

describe("the can", () => {
  it("lags behind your hand, then overshoots it", () => {
    const target = createCan().x + 260;
    let can = createCan();
    let furthest = can.x;
    for (let i = 0; i < 300; i += 1) {
      can = stepCan(can, target, can.y, DT);
      furthest = Math.max(furthest, can.x);
    }
    // Overshoot is the mechanic, not a bug: without it the can is just a
    // cursor and there is no skill to learn. It does come back — it just takes
    // longer than a player's patience, which is the joke.
    expect(furthest).toBeGreaterThan(target);
    expect(can.x).toBeCloseTo(target, 0);
  });

  it("pours ahead of the spout while it is still moving", () => {
    let can = createCan();
    for (let i = 0; i < 8; i += 1) can = stepCan(can, can.x + 400, can.y, DT);

    expect(can.vx).toBeGreaterThan(0);
    expect(pourPoint(can).x).toBeGreaterThan(spoutOf(can).x);
  });

  it("pours under the spout once it has settled", () => {
    const can = chase(WORLD_W / 2, 400);
    expect(Math.abs(can.vx)).toBeLessThan(1);
    expect(pourPoint(can).x).toBeCloseTo(spoutOf(can).x, 1);
  });

  it("stays inside the frame however hard it is flicked", () => {
    let can = createCan();
    for (let i = 0; i < 200; i += 1) {
      can = stepCan(can, i % 2 === 0 ? -9000 : 9000, can.y, DT);
      expect(can.x).toBeGreaterThanOrEqual(0);
      expect(can.x).toBeLessThanOrEqual(WORLD_W);
    }
  });
});
