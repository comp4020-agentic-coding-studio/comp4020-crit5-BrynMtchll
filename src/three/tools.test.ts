import { describe, expect, it } from "vitest";
import { BENCH_Y, createBench, layoutBench } from "./tools";

// The bench is the only way into the game: no tool, no verbs. It is laid out
// against the width the camera actually shows, and this suite holds the two
// properties that made it wrong at 390x844 — slots off the edge of the frame,
// and hit boxes tall enough to cover the soil behind them.

describe("the bench lays itself out to fit the frame", () => {
  it("keeps every slot inside the visible width, at any width", () => {
    for (const half of [0.5, 0.7, 0.92, 1.3, 1.51]) {
      const bench = createBench();
      layoutBench(bench, half, "long");
      for (const tool of bench.tools) {
        expect(Math.abs(tool.home.x), `${tool.id} at half-width ${half}`).toBeLessThanOrEqual(half);
      }
    }
  });

  it("spaces the slots evenly and never overlaps them", () => {
    const bench = createBench();
    layoutBench(bench, 0.92, "short");
    const xs = bench.tools.map((tool) => tool.home.x);
    const gaps = xs.slice(1).map((x, i) => x - (xs[i] ?? 0));
    const first = gaps[0] ?? 0;
    expect(first).toBeGreaterThan(0);
    for (const gap of gaps) expect(gap).toBeCloseTo(first, 6);
    // Each slot's hit box is exactly its share of the board, so the whole
    // bench is pressable with no dead strips between the tools.
    for (const tool of bench.tools) expect(tool.pad.scale.x).toBeCloseTo(first, 6);
  });

  it("lies the hit boxes flat when you're looking down at them", () => {
    // Seen from the short end the camera looks down steeply, and a tall slot
    // reaches out over the nearest row of soil and swallows presses meant for
    // the bed. Seen along the long side it needs the height to be pressable.
    const long = createBench();
    layoutBench(long, 0.92, "long");
    const short = createBench();
    layoutBench(short, 0.92, "short");

    const height = (b: ReturnType<typeof createBench>) => (b.tools[0]?.pad.scale.y ?? 0) * 0.3;
    expect(height(short)).toBeLessThan(height(long) / 3);
    // Flat means flat: nothing standing proud of the board surface.
    expect(height(short)).toBeLessThan(BENCH_Y);
  });

  it("never scales a tool larger than it was modelled", () => {
    const bench = createBench();
    layoutBench(bench, 1.51, "long");
    for (const tool of bench.tools) expect(tool.object.scale.x).toBeLessThanOrEqual(1);
  });
});
