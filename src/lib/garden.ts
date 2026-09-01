// The simulation core. No DOM, no clock, no Math.random: `step` is a pure
// function of (state, dt), so every rule the game can be lost by is testable
// without rendering anything. The wobble and the drawing live elsewhere.

export const GRID_W = 12;
export const GRID_H = 8;

/** Moisture the ring around a plant wants. Growth happens in this band, nowhere else. */
export const BAND_MIN = 0.3;
export const BAND_MAX = 0.72;

/**
 * Crown saturation above this rots the plant. The crown is the cell the stem
 * stands in — the one a player naturally aims at. This is the hidden rule: the
 * obvious aim is the wrong aim, because roots drink from the ring and only the
 * crown can rot.
 */
export const CROWN_ROT = 0.78;

export const SEASON_S = 80;

const GROWTH_PER_S = 1 / 38;
const ROT_PER_S = 1 / 11;
const THIRST_PER_S = 1 / 26;
const THIRST_RECOVER_PER_S = 1 / 14;

// Drainage is quadratic in moisture, which is what makes little-and-often beat
// a deluge: a saturated cell sheds water roughly ten times faster than a damp
// one, so most of a big pour is gone before any root sees it.
const DRAIN_K = 0.38;
const DIFFUSE_PER_S = 0.55;

const WEED_GROW_PER_S = 1 / 22;
const WEED_DRINK_PER_S = 0.22;
const WEED_INTERVAL_S = 5.5;

export const POUR_PER_S = 1.7;

export type Stage = "seed" | "sprout" | "leaf" | "bud" | "bloom" | "dead";

export interface Plant {
  readonly cx: number;
  readonly cy: number;
  /** 0..1 across the stages. Only ever rises. */
  readonly growth: number;
  /** 0..1, dead at 1. Only ever rises — see `step`. */
  readonly rot: number;
  /** 0..1, dead at 1. Recovers, unlike rot. */
  readonly thirst: number;
  readonly dead: boolean;
}

export interface Weed {
  readonly cx: number;
  readonly cy: number;
  /** 0..1. Bigger weeds drink more and cost more to pull. */
  readonly size: number;
}

export type Ending = "frost" | "barren";

export interface Garden {
  readonly moisture: Float32Array;
  readonly plants: readonly Plant[];
  readonly weeds: readonly Weed[];
  /** Seconds elapsed this season. */
  readonly t: number;
  readonly seed: number;
  readonly nextWeedAt: number;
  readonly ending: Ending | null;
}

export function idx(x: number, y: number): number {
  return y * GRID_W + x;
}

function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < GRID_W && y >= 0 && y < GRID_H;
}

/** mulberry32, threaded through state so a season replays identically. */
function nextRandom(seed: number): readonly [number, number] {
  const t = (seed + 0x6d2b79f5) | 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, t];
}

export function stageOf(plant: Plant): Stage {
  if (plant.dead) return "dead";
  if (plant.growth >= 0.9) return "bloom";
  if (plant.growth >= 0.65) return "bud";
  if (plant.growth >= 0.35) return "leaf";
  if (plant.growth >= 0.12) return "sprout";
  return "seed";
}

/** The four cells a plant actually drinks from. Never the crown. */
export function ringMoisture(moisture: Float32Array, cx: number, cy: number): number {
  const offsets = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const;
  let total = 0;
  let count = 0;
  for (const [dx, dy] of offsets) {
    const x = cx + dx;
    const y = cy + dy;
    if (!inBounds(x, y)) continue;
    total += moisture[idx(x, y)] ?? 0;
    count += 1;
  }
  return count === 0 ? 0 : total / count;
}

export function crownMoisture(moisture: Float32Array, cx: number, cy: number): number {
  return moisture[idx(cx, cy)] ?? 0;
}

export function createGarden(seed: number): Garden {
  // Seeds are already in the ground when a season opens. Planting would be a
  // second verb to discover, and the opening frame has to read in one glance:
  // damp soil, sprouts, a can that follows your hand.
  const row = Math.floor(GRID_H / 2);
  const plants: Plant[] = [2, 4, 6, 8, 10].map((cx, i) => ({
    cx,
    cy: row + (i % 2 === 0 ? 0 : 1),
    growth: 0.05,
    rot: 0,
    thirst: 0,
    dead: false,
  }));

  const moisture = new Float32Array(GRID_W * GRID_H);
  moisture.fill(0.34);

  return {
    moisture,
    plants,
    weeds: [],
    t: 0,
    seed,
    nextWeedAt: WEED_INTERVAL_S,
    ending: null,
  };
}

/** Water landing at a cell. Most lands on target; the rest wets the neighbours. */
export function pour(garden: Garden, cx: number, cy: number, amount: number): Garden {
  if (garden.ending !== null || !inBounds(cx, cy)) return garden;
  const moisture = Float32Array.from(garden.moisture);
  moisture[idx(cx, cy)] = Math.min(1, (moisture[idx(cx, cy)] ?? 0) + amount * 0.7);
  for (const [dx, dy] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const) {
    const x = cx + dx;
    const y = cy + dy;
    if (!inBounds(x, y)) continue;
    moisture[idx(x, y)] = Math.min(1, (moisture[idx(x, y)] ?? 0) + amount * 0.075);
  }
  return { ...garden, moisture };
}

/**
 * Pulling a weed is free in open soil and expensive next to a plant: the root
 * ball comes up with its neighbour's, and that damage is rot, which never
 * heals. Pull them while they're small.
 */
export function pull(garden: Garden, weedIndex: number): Garden {
  const weed = garden.weeds[weedIndex];
  if (garden.ending !== null || weed === undefined) return garden;

  const plants = garden.plants.map((plant) => {
    if (plant.dead) return plant;
    const touching =
      Math.abs(plant.cx - weed.cx) <= 1 && Math.abs(plant.cy - weed.cy) <= 1;
    if (!touching) return plant;
    return { ...plant, rot: Math.min(1, plant.rot + 0.15 * weed.size) };
  });

  return {
    ...garden,
    plants,
    weeds: garden.weeds.filter((_, i) => i !== weedIndex),
  };
}

export function weedAt(garden: Garden, cx: number, cy: number): number {
  return garden.weeds.findIndex((weed) => weed.cx === cx && weed.cy === cy);
}

function occupied(garden: Garden, cx: number, cy: number): boolean {
  return (
    garden.plants.some((p) => p.cx === cx && p.cy === cy) ||
    garden.weeds.some((w) => w.cx === cx && w.cy === cy)
  );
}

export function step(garden: Garden, dt: number): Garden {
  if (garden.ending !== null) return garden;

  const prev = garden.moisture;
  const moisture = new Float32Array(prev.length);

  // Lateral diffusion, then quadratic drainage. Both run before anything
  // drinks, so a pour and its consequences are always one tick apart — that
  // gap is what makes the feedback feel delayed.
  for (let y = 0; y < GRID_H; y += 1) {
    for (let x = 0; x < GRID_W; x += 1) {
      const here = prev[idx(x, y)] ?? 0;
      let total = 0;
      let count = 0;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
        if (!inBounds(x + dx, y + dy)) continue;
        total += prev[idx(x + dx, y + dy)] ?? 0;
        count += 1;
      }
      const average = count === 0 ? here : total / count;
      const diffused = here + (average - here) * Math.min(1, DIFFUSE_PER_S * dt);
      const drained = diffused - DRAIN_K * diffused * diffused * dt;
      moisture[idx(x, y)] = Math.max(0, Math.min(1, drained));
    }
  }

  let weeds = garden.weeds.map((weed) => ({
    ...weed,
    size: Math.min(1, weed.size + WEED_GROW_PER_S * dt),
  }));

  for (const weed of weeds) {
    const drink = WEED_DRINK_PER_S * weed.size * dt;
    for (const [dx, dy] of [
      [0, 0],
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      const x = weed.cx + dx;
      const y = weed.cy + dy;
      if (!inBounds(x, y)) continue;
      moisture[idx(x, y)] = Math.max(0, (moisture[idx(x, y)] ?? 0) - drink * 0.4);
    }
  }

  const plants = garden.plants.map((plant) => {
    if (plant.dead) return plant;

    const ring = ringMoisture(moisture, plant.cx, plant.cy);
    const crown = crownMoisture(moisture, plant.cx, plant.cy);

    // Rot is the monotone. Thirst forgives; saturation does not.
    const rot =
      crown > CROWN_ROT
        ? Math.min(1, plant.rot + ROT_PER_S * ((crown - CROWN_ROT) / (1 - CROWN_ROT)) * dt)
        : plant.rot;

    const thirst =
      ring < BAND_MIN
        ? Math.min(1, plant.thirst + THIRST_PER_S * ((BAND_MIN - ring) / BAND_MIN) * dt)
        : Math.max(0, plant.thirst - THIRST_RECOVER_PER_S * dt);

    const healthy = ring >= BAND_MIN && ring <= BAND_MAX;
    const growth = healthy
      ? Math.min(1, plant.growth + GROWTH_PER_S * (1 - rot) * dt)
      : plant.growth;

    return { ...plant, growth, rot, thirst, dead: rot >= 1 || thirst >= 1 };
  });

  // Weeds arrive on a schedule, from the seeded stream, so a season replays
  // identically — which is what makes the hidden rule learnable rather than
  // a coin toss, and what makes this function testable.
  let seed = garden.seed;
  let nextWeedAt = garden.nextWeedAt;
  const t = garden.t + dt;
  const next = { ...garden, moisture, plants, weeds, t, seed, nextWeedAt, ending: null };

  if (t >= nextWeedAt) {
    const [rx, s1] = nextRandom(seed);
    const [ry, s2] = nextRandom(s1);
    seed = s2;
    nextWeedAt = t + WEED_INTERVAL_S;
    const cx = Math.floor(rx * GRID_W);
    const cy = Math.floor(ry * GRID_H);
    if (!occupied(next, cx, cy)) weeds = [...weeds, { cx, cy, size: 0.1 }];
  }

  const alive = plants.some((plant) => !plant.dead);
  const ending: Ending | null = !alive ? "barren" : t >= SEASON_S ? "frost" : null;

  return { ...next, weeds, seed, nextWeedAt, ending };
}
