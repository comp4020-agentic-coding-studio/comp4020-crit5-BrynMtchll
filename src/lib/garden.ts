// The simulation core. No DOM, no clock, no Math.random: `step` is a pure
// function of (state, dt), so every rule the game can be lost by is testable
// without rendering anything. The wobble and the drawing live elsewhere.
//
// The grid is state, not a constant. The plot is marked at 1920x1080 and at
// 390x844, and no single fixed grid reads well at both — so the caller picks
// dimensions from the viewport and the rules don't care which it picked.

import type { SpeciesId } from "./species";

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

const GROWTH_PER_S = 1 / 30;
const ROT_PER_S = 1 / 11;
const THIRST_PER_S = 1 / 26;
const THIRST_RECOVER_PER_S = 1 / 14;

// Drainage is quadratic in moisture, which is what makes little-and-often beat
// a deluge: a saturated cell sheds water roughly ten times faster than a damp
// one, so most of a big pour is gone before any root sees it.
//
// The constant is set by how many beds one can can serve. At 0.38 a damp cell
// fell out of band in two seconds and nothing survived a season however well
// it was played; at 0.14 it takes six, which is about one lap of the plot.
const DRAIN_K = 0.14;
const DIFFUSE_PER_S = 0.55;

const WEED_GROW_PER_S = 1 / 22;
const WEED_DRINK_PER_S = 0.22;
const WEED_INTERVAL_S = 5.5;

export const POUR_PER_S = 1.7;

/** Hole depth gained per second of digging, and what counts as deep enough. */
export const DIG_PER_S = 1.1;
export const SOWABLE_DEPTH = 0.55;
/** An open hole slumps shut if it is left alone. */
const HOLE_SLUMP_PER_S = 0.055;

const NEIGHBOURS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

export type Stage = "seed" | "sprout" | "leaf" | "bud" | "bloom" | "dead";

export interface Plant {
  readonly species: SpeciesId;
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

/** A dug hole, waiting for a seed. Depth is 0..1. */
export interface Hole {
  readonly cx: number;
  readonly cy: number;
  readonly depth: number;
}

export interface Weed {
  readonly cx: number;
  readonly cy: number;
  /** 0..1. Bigger weeds drink more and cost more to pull. */
  readonly size: number;
}

export type Ending = "frost" | "barren";

export interface Garden {
  readonly w: number;
  readonly h: number;
  readonly moisture: Float32Array;
  readonly plants: readonly Plant[];
  readonly weeds: readonly Weed[];
  readonly holes: readonly Hole[];
  /** Seconds elapsed this season. */
  readonly t: number;
  readonly seed: number;
  readonly nextWeedAt: number;
  readonly ending: Ending | null;
}

export function idx(garden: Pick<Garden, "w">, x: number, y: number): number {
  return y * garden.w + x;
}

function inBounds(garden: Garden, x: number, y: number): boolean {
  return x >= 0 && x < garden.w && y >= 0 && y < garden.h;
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
export function ringMoisture(garden: Garden, cx: number, cy: number): number {
  let total = 0;
  let count = 0;
  for (const [dx, dy] of NEIGHBOURS) {
    const x = cx + dx;
    const y = cy + dy;
    if (!inBounds(garden, x, y)) continue;
    total += garden.moisture[idx(garden, x, y)] ?? 0;
    count += 1;
  }
  return count === 0 ? 0 : total / count;
}

export function crownMoisture(garden: Garden, cx: number, cy: number): number {
  return garden.moisture[idx(garden, cx, cy)] ?? 0;
}

export function createGarden(seed: number, w = 12, h = 8): Garden {
  // The bed opens empty. Planting is the work now — digging a hole, choosing
  // what goes in it, and covering it over — so seeding the plot for the player
  // would take away the first thing they get to do.
  const moisture = new Float32Array(w * h);
  moisture.fill(0.34);

  return {
    w,
    h,
    moisture,
    plants: [],
    weeds: [],
    holes: [],
    t: 0,
    seed,
    nextWeedAt: WEED_INTERVAL_S,
    ending: null,
  };
}

export function holeAt(garden: Garden, cx: number, cy: number): number {
  return garden.holes.findIndex((hole) => hole.cx === cx && hole.cy === cy);
}

export function plantAt(garden: Garden, cx: number, cy: number): number {
  return garden.plants.findIndex((plant) => plant.cx === cx && plant.cy === cy);
}

/** Open or deepen a hole. Refuses ground that is already spoken for. */
export function dig(garden: Garden, cx: number, cy: number, amount: number): Garden {
  if (garden.ending !== null || !inBounds(garden, cx, cy)) return garden;
  if (plantAt(garden, cx, cy) >= 0) return garden;

  const existing = holeAt(garden, cx, cy);
  if (existing >= 0) {
    const holes = garden.holes.map((hole, i) =>
      i === existing ? { ...hole, depth: Math.min(1, hole.depth + amount) } : hole,
    );
    return { ...garden, holes };
  }
  // Digging where a weed is takes the weed with it — the one free way to
  // clear one, and the reason a trowel is worth carrying.
  const weeds = garden.weeds.filter((weed) => !(weed.cx === cx && weed.cy === cy));
  return { ...garden, weeds, holes: [...garden.holes, { cx, cy, depth: amount }] };
}

/**
 * Drop a seed into a hole and close the soil over it. A hole that isn't deep
 * enough won't take one — the seed would sit on the surface.
 */
export function sow(
  garden: Garden,
  cx: number,
  cy: number,
  species: SpeciesId,
): Garden {
  if (garden.ending !== null) return garden;
  const index = holeAt(garden, cx, cy);
  const hole = garden.holes[index];
  if (hole === undefined || hole.depth < SOWABLE_DEPTH) return garden;
  if (plantAt(garden, cx, cy) >= 0) return garden;

  return {
    ...garden,
    holes: garden.holes.filter((_, i) => i !== index),
    plants: [
      ...garden.plants,
      { species, cx, cy, growth: 0.02, rot: 0, thirst: 0, dead: false },
    ],
  };
}

/** Water landing at a cell. Most lands on target; the rest wets the neighbours. */
export function pour(garden: Garden, cx: number, cy: number, amount: number): Garden {
  if (garden.ending !== null || !inBounds(garden, cx, cy)) return garden;
  const moisture = Float32Array.from(garden.moisture);
  const here = idx(garden, cx, cy);
  moisture[here] = Math.min(1, (moisture[here] ?? 0) + amount * 0.7);
  for (const [dx, dy] of NEIGHBOURS) {
    const x = cx + dx;
    const y = cy + dy;
    if (!inBounds(garden, x, y)) continue;
    const at = idx(garden, x, y);
    moisture[at] = Math.min(1, (moisture[at] ?? 0) + amount * 0.075);
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
    garden.weeds.some((w) => w.cx === cx && w.cy === cy) ||
    garden.holes.some((o) => o.cx === cx && o.cy === cy)
  );
}

export function step(garden: Garden, dt: number): Garden {
  if (garden.ending !== null) return garden;

  const prev = garden.moisture;
  const moisture = new Float32Array(prev.length);

  // Lateral diffusion, then quadratic drainage. Both run before anything
  // drinks, so a pour and its consequences are always one tick apart — that
  // gap is what makes the feedback feel delayed.
  for (let y = 0; y < garden.h; y += 1) {
    for (let x = 0; x < garden.w; x += 1) {
      const here = prev[idx(garden, x, y)] ?? 0;
      let total = 0;
      let count = 0;
      for (const [dx, dy] of NEIGHBOURS) {
        if (!inBounds(garden, x + dx, y + dy)) continue;
        total += prev[idx(garden, x + dx, y + dy)] ?? 0;
        count += 1;
      }
      const average = count === 0 ? here : total / count;
      const diffused = here + (average - here) * Math.min(1, DIFFUSE_PER_S * dt);
      const drained = diffused - DRAIN_K * diffused * diffused * dt;
      moisture[idx(garden, x, y)] = Math.max(0, Math.min(1, drained));
    }
  }

  const holes = garden.holes
    .map((hole) => ({ ...hole, depth: hole.depth - HOLE_SLUMP_PER_S * dt }))
    .filter((hole) => hole.depth > 0);

  let weeds = garden.weeds.map((weed) => ({
    ...weed,
    size: Math.min(1, weed.size + WEED_GROW_PER_S * dt),
  }));

  for (const weed of weeds) {
    const drink = WEED_DRINK_PER_S * weed.size * dt;
    for (const [dx, dy] of [[0, 0] as const, ...NEIGHBOURS]) {
      const x = weed.cx + dx;
      const y = weed.cy + dy;
      if (!inBounds(garden, x, y)) continue;
      const at = idx(garden, x, y);
      moisture[at] = Math.max(0, (moisture[at] ?? 0) - drink * 0.4);
    }
  }

  const drying: Garden = { ...garden, moisture, holes };

  const plants = garden.plants.map((plant) => {
    if (plant.dead) return plant;

    const ring = ringMoisture(drying, plant.cx, plant.cy);
    const crown = crownMoisture(drying, plant.cx, plant.cy);

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

  if (t >= nextWeedAt) {
    const [rx, s1] = nextRandom(seed);
    const [ry, s2] = nextRandom(s1);
    seed = s2;
    nextWeedAt = t + WEED_INTERVAL_S;
    const cx = Math.floor(rx * garden.w);
    const cy = Math.floor(ry * garden.h);
    const probe: Garden = { ...drying, plants, weeds };
    if (!occupied(probe, cx, cy)) weeds = [...weeds, { cx, cy, size: 0.1 }];
  }

  // An empty bed is not a barren one. Barren means everything you planted
  // died; a plot you haven't sown yet simply has a season still to run.
  const barren = plants.length > 0 && plants.every((plant) => plant.dead);
  const ending: Ending | null = barren ? "barren" : t >= SEASON_S ? "frost" : null;

  return { ...garden, moisture, plants, weeds, holes, t, seed, nextWeedAt, ending };
}
