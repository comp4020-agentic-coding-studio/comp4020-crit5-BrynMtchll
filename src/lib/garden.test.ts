import { describe, expect, it } from "vitest";
import {
  dig,
  DIG_PER_S,
  holeAt,
  sow,
  BAND_MIN,
  CROWN_ROT,
  createGarden,
  crownMoisture,
  type Garden,
  idx,
  POUR_PER_S,
  pour,
  pull,
  ringMoisture,
  SEASON_S,
  stageOf,
  step,
} from "./garden";

const DT = 1 / 60;

/** Dig a hole and sow one, the way a player does, so tests start where play does. */
function planted(seed = 1, cx = 4, cy = 3): Garden {
  let garden = createGarden(seed);
  for (let i = 0; i < 60; i += 1) garden = dig(garden, cx, cy, DIG_PER_S * DT);
  return sow(garden, cx, cy, "kangaroo-paw");
}

/** Run the sim for `seconds`, optionally acting on the garden every tick. */
function run(garden: Garden, seconds: number, act?: (g: Garden) => Garden): Garden {
  let current = garden;
  for (let elapsed = 0; elapsed < seconds; elapsed += DT) {
    if (act) current = act(current);
    current = step(current, DT);
  }
  return current;
}

const water = (cx: number, cy: number) => (g: Garden) =>
  pour(g, cx, cy, POUR_PER_S * DT);

describe("soil", () => {
  it("only ever loses water on its own", () => {
    let garden = createGarden(1);
    let previous = garden.moisture[idx(garden, 3, 3)] ?? 0;
    for (let i = 0; i < 200; i += 1) {
      garden = step(garden, DT);
      const now = garden.moisture[idx(garden, 3, 3)] ?? 0;
      expect(now).toBeLessThanOrEqual(previous + 1e-6);
      previous = now;
    }
  });

  it("sheds a deluge far faster than it sheds a damp patch", () => {
    // Quadratic drainage is what makes little-and-often the better watering
    // habit. If this ever went linear, the hidden rule would stop paying.
    const drop = (start: number) => {
      let garden: Garden = createGarden(1);
      const moisture = Float32Array.from(garden.moisture);
      moisture[idx(garden, 0, 0)] = start;
      garden = { ...garden, moisture };
      const after = step(garden, DT).moisture[idx(garden, 0, 0)] ?? 0;
      return start - after;
    };
    expect(drop(0.95)).toBeGreaterThan(drop(0.35) * 3);
  });
});

describe("the hidden rule: roots drink from the ring, only the crown rots", () => {
  it("grows a plant watered beside the stem", () => {
    const garden = planted(1);
    const plant = garden.plants[0];
    if (!plant) throw new Error("expected a planted seed");

    const after = run(garden, 30, water(plant.cx - 1, plant.cy));
    const grown = after.plants[0];
    if (!grown) throw new Error("expected the plant to persist");

    expect(grown.dead).toBe(false);
    expect(grown.growth).toBeGreaterThan(plant.growth);
    expect(grown.rot).toBe(0);
  });

  it("kills a plant watered on the stem", () => {
    const garden = planted(1);
    const plant = garden.plants[0];
    if (!plant) throw new Error("expected a planted seed");

    const after = run(garden, 30, water(plant.cx, plant.cy));
    const drowned = after.plants[0];
    if (!drowned) throw new Error("expected the plant to persist");

    expect(crownMoisture(after, plant.cx, plant.cy)).toBeGreaterThan(CROWN_ROT);
    expect(drowned.dead).toBe(true);
  });

  it("reads the ring without counting the crown", () => {
    let garden: Garden = createGarden(1);
    const moisture = Float32Array.from(garden.moisture);
    moisture.fill(0);
    moisture[idx(garden, 5, 5)] = 1;
    garden = { ...garden, moisture };

    expect(ringMoisture(garden, 5, 5)).toBe(0);
    expect(crownMoisture(garden, 5, 5)).toBe(1);
  });
});

describe("thirst forgives, rot does not", () => {
  it("lets a wilting plant recover when the ring comes back into band", () => {
    const garden = planted(1);
    const plant = garden.plants[0];
    if (!plant) throw new Error("expected a planted seed");

    const parched = run(garden, 12);
    const wilting = parched.plants[0];
    if (!wilting) throw new Error("expected the plant to persist");
    expect(wilting.thirst).toBeGreaterThan(0);

    const revived = run(parched, 14, water(plant.cx - 1, plant.cy));
    const recovered = revived.plants[0];
    if (!recovered) throw new Error("expected the plant to persist");

    expect(recovered.thirst).toBeLessThan(wilting.thirst);
    expect(recovered.dead).toBe(false);
  });

  it("never lets rot fall, whatever you do afterwards", () => {
    const garden = planted(1);
    const plant = garden.plants[0];
    if (!plant) throw new Error("expected a planted seed");

    const rotted = run(garden, 8, water(plant.cx, plant.cy));
    const peak = rotted.plants[0]?.rot ?? 0;
    expect(peak).toBeGreaterThan(0);

    let current = rotted;
    for (let i = 0; i < 600; i += 1) {
      current = step(current, DT);
      expect(current.plants[0]?.rot ?? 0).toBeGreaterThanOrEqual(peak - 1e-9);
    }
  });
});

describe("weeds", () => {
  it("arrive on a seeded schedule, so a season replays identically", () => {
    const a = run(planted(7), 30);
    const b = run(planted(7), 30);
    expect(b.weeds).toEqual(a.weeds);
    expect(run(planted(8), 30).weeds).not.toEqual(a.weeds);
  });

  it("cost more to pull the longer they are left", () => {
    const garden = planted(1);
    const plant = garden.plants[0];
    if (!plant) throw new Error("expected a planted seed");

    const damage = (size: number) => {
      const seeded: Garden = {
        ...garden,
        weeds: [{ cx: plant.cx + 1, cy: plant.cy, size }],
      };
      return pull(seeded, 0).plants[0]?.rot ?? 0;
    };

    expect(damage(1)).toBeGreaterThan(damage(0.1));
    expect(damage(0.1)).toBeGreaterThan(0);
  });

  it("leaves a plant alone when pulled from open soil", () => {
    const garden = planted(1);
    const plant = garden.plants[0];
    if (!plant) throw new Error("expected a planted seed");

    const seeded: Garden = {
      ...garden,
      weeds: [{ cx: (plant.cx + 5) % garden.w, cy: plant.cy, size: 1 }],
    };
    expect(pull(seeded, 0).plants[0]?.rot ?? 0).toBe(0);
  });
});

describe("the season ends", () => {
  it("finishes at frost with whatever survived", () => {
    const garden = planted(3);
    const plant = garden.plants[0];
    if (!plant) throw new Error("expected a planted seed");

    const after = run(garden, SEASON_S + 1, water(plant.cx - 1, plant.cy));
    expect(after.ending).toBe("frost");
  });

  it("ends early when nothing is left alive", () => {
    const garden = planted(1);
    // Nothing watered, ever: the whole plot should wilt out well inside a
    // season, so walking away is itself a way to lose.
    const parched: Garden = {
      ...garden,
      moisture: new Float32Array(garden.moisture.length),
    };
    const after = run(parched, 30);
    expect(after.plants.every((p) => p.dead)).toBe(true);
    expect(after.ending).toBe("barren");
    expect(after.t).toBeLessThan(SEASON_S);
  });

  it("stops simulating once it is over", () => {
    const garden = planted(1);
    const over: Garden = { ...garden, ending: "frost" };
    expect(step(over, DT)).toBe(over);
  });
});

describe("stages", () => {
  it("reads growth as a visible stage, and death overrides everything", () => {
    const base = {
      species: "wattle" as const,
      cx: 0,
      cy: 0,
      rot: 0,
      thirst: 0,
      dead: false,
    };
    expect(stageOf({ ...base, growth: 0 })).toBe("seed");
    expect(stageOf({ ...base, growth: 0.2 })).toBe("sprout");
    expect(stageOf({ ...base, growth: 0.5 })).toBe("leaf");
    expect(stageOf({ ...base, growth: 0.7 })).toBe("bud");
    expect(stageOf({ ...base, growth: 1 })).toBe("bloom");
    expect(stageOf({ ...base, growth: 1, dead: true })).toBe("dead");
  });

  it("keeps a thirsty plant below the band from growing at all", () => {
    const garden = planted(1);
    const dry = { ...garden, moisture: new Float32Array(garden.moisture.length) };
    const after = run(dry, 5);
    expect(ringMoisture(after, 3, 2)).toBeLessThan(BAND_MIN);
    expect(after.plants[0]?.growth).toBe(garden.plants[0]?.growth);
  });
});

describe("planting", () => {
  it("won't take a seed until the hole is deep enough", () => {
    let garden = createGarden(1);
    garden = dig(garden, 4, 3, 0.2);
    expect(sow(garden, 4, 3, "banksia").plants).toHaveLength(0);

    for (let i = 0; i < 60; i += 1) garden = dig(garden, 4, 3, DIG_PER_S * DT);
    const sown = sow(garden, 4, 3, "banksia");
    expect(sown.plants).toHaveLength(1);
    expect(sown.plants[0]?.species).toBe("banksia");
  });

  it("closes the hole over the seed", () => {
    const sown = planted();
    expect(holeAt(sown, 4, 3)).toBe(-1);
  });

  it("refuses to dig where something is already growing", () => {
    const sown = planted();
    expect(dig(sown, 4, 3, DIG_PER_S).holes).toHaveLength(0);
  });

  it("takes a weed out with the spadeful", () => {
    const garden: Garden = { ...createGarden(1), weeds: [{ cx: 6, cy: 2, size: 0.8 }] };
    expect(dig(garden, 6, 2, DIG_PER_S * DT).weeds).toHaveLength(0);
  });

  it("lets an unsown hole slump shut on its own", () => {
    let garden = createGarden(1);
    for (let i = 0; i < 60; i += 1) garden = dig(garden, 4, 3, DIG_PER_S * DT);
    const depth = garden.holes[0]?.depth ?? 0;
    for (let i = 0; i < 60; i += 1) garden = step(garden, DT);
    expect(garden.holes[0]?.depth ?? 0).toBeLessThan(depth);
  });

  it("does not call an unsown bed barren", () => {
    let garden = createGarden(1);
    for (let i = 0; i < 60 * 20; i += 1) garden = step(garden, DT);
    expect(garden.plants).toHaveLength(0);
    expect(garden.ending).toBeNull();
  });
});
