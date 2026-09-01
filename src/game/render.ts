// Everything the player is ever told, they are told here. There is no text in
// this game and no meters: moisture is the colour of the soil, thirst is a
// droop, rot is a bloat and a yellowing, and death is a collapse. If a state
// can't be read off the picture, it doesn't exist as far as the player knows.
//
// Every size is a fraction of layout.cell, so the same scene reads at a
// desktop's 120px cells and a phone's 45px ones.

import {
  CROWN_ROT,
  type Garden,
  idx,
  type Plant,
  SEASON_S,
  stageOf,
  type Weed,
} from "../lib/garden";
import type { Can } from "./can";
import { cellCentre, type Layout } from "./world";

export interface Droplet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

const SOIL_DRY = [201, 180, 146] as const;
const SOIL_WET = [79, 59, 39] as const;

/** One hue per bed, so a full plot reads as a garden rather than a crop. */
const BLOOM_HUES = [344, 42, 288, 12, 200, 168];

function mix(a: readonly number[], b: readonly number[], t: number): string {
  const k = Math.max(0, Math.min(1, t));
  const c = (i: number) => Math.round((a[i] ?? 0) + ((b[i] ?? 0) - (a[i] ?? 0)) * k);
  return `rgb(${c(0)} ${c(1)} ${c(2)})`;
}

/** Stable pseudo-random in 0..1 from an integer. Never varies between frames. */
function hash(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function drawSky(ctx: CanvasRenderingContext2D, garden: Garden, layout: Layout): void {
  // The light goes with the season, so the clock is legible without a clock.
  const season = Math.min(1, garden.t / SEASON_S);
  const gradient = ctx.createLinearGradient(0, 0, 0, layout.originY + layout.cell);
  gradient.addColorStop(0, mix([146, 199, 226], [196, 190, 220], season));
  gradient.addColorStop(0.62, mix([206, 229, 227], [231, 218, 217], season));
  gradient.addColorStop(1, mix([230, 237, 218], [243, 232, 223], season));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, layout.width, layout.height);

  // The sun is the season. It crosses and sinks, and by frost it is on the
  // horizon — a clock with no numbers on it, which is the only kind this game
  // is allowed.
  const sunX = layout.width * (0.16 + season * 0.68);
  const sunY = layout.originY * (0.26 + Math.pow(season, 1.7) * 0.72);
  const radius = Math.max(16, layout.originY * 0.09);

  const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, radius * 4.5);
  glow.addColorStop(0, `rgb(255 246 214 / ${0.42 - season * 0.12})`);
  glow.addColorStop(1, "rgb(255 246 214 / 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, radius * 4.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = mix([255, 249, 226], [246, 214, 190], season);
  ctx.beginPath();
  ctx.arc(sunX, sunY, radius, 0, Math.PI * 2);
  ctx.fill();
}

export function drawSoil(
  ctx: CanvasRenderingContext2D,
  garden: Garden,
  layout: Layout,
): void {
  const { cell, originX, originY } = layout;
  const plotW = cell * layout.cols;
  const plotH = cell * layout.rows;

  // One base slab first, then cells drawn over it with a half-pixel bleed:
  // fractional cell sizes leave hairline seams otherwise, and a grid of seams
  // reads as a spreadsheet rather than a bed of soil.
  ctx.fillStyle = mix(SOIL_DRY, SOIL_WET, 0.4);
  ctx.fillRect(originX, originY, plotW, plotH);

  for (let y = 0; y < garden.h; y += 1) {
    for (let x = 0; x < garden.w; x += 1) {
      const m = garden.moisture[idx(garden, x, y)] ?? 0;
      const px = originX + x * cell;
      const py = originY + y * cell;
      ctx.fillStyle = mix(SOIL_DRY, SOIL_WET, Math.pow(m, 0.75));
      ctx.fillRect(px - 0.5, py - 0.5, cell + 1, cell + 1);

      // Waterlogged soil gets a sheen. It is the only warning the crown rule
      // gives you before the plant starts to bloat, and it arrives late on
      // purpose.
      if (m > CROWN_ROT) {
        const t = (m - CROWN_ROT) / (1 - CROWN_ROT);
        ctx.fillStyle = `rgb(163 196 206 / ${t * 0.36})`;
        ctx.fillRect(px - 0.5, py - 0.5, cell + 1, cell + 1);
      }
    }
  }

  // Clods and grit, seeded off the cell index so they sit still between
  // frames and rescale with the grid. Without them a wet plot is a brown
  // rectangle and the moisture gradient has nothing to grade against.
  const clods = layout.cols * layout.rows * 7;
  for (let i = 0; i < clods; i += 1) {
    const gx = originX + hash(i) * plotW;
    const gy = originY + hash(i + 9001) * plotH;
    const r = cell * (0.012 + hash(i + 55) * 0.045);
    const dark = hash(i + 777) > 0.5;
    ctx.fillStyle = dark ? "rgb(48 34 22 / 0.13)" : "rgb(255 244 224 / 0.10)";
    ctx.beginPath();
    ctx.ellipse(gx, gy, r * 1.7, r, hash(i + 3) * 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Depth: the bed is a cut through soil, so it darkens as it goes down.
  const depth = ctx.createLinearGradient(0, originY, 0, originY + plotH);
  depth.addColorStop(0, "rgb(40 28 18 / 0)");
  depth.addColorStop(1, "rgb(40 28 18 / 0.34)");
  ctx.fillStyle = depth;
  ctx.fillRect(originX, originY, plotW, plotH);

  // The lip where soil meets air: a dark cut with a lit crumb line under it.
  ctx.fillStyle = "rgb(52 38 24 / 0.4)";
  ctx.fillRect(originX, originY, plotW, Math.max(2, cell * 0.035));
  ctx.fillStyle = "rgb(255 246 226 / 0.16)";
  ctx.fillRect(originX, originY + Math.max(2, cell * 0.035), plotW, Math.max(1, cell * 0.02));
}

function stemColour(plant: Plant): string {
  if (plant.dead) return "rgb(124 108 86)";
  return mix([74, 124, 63], [177, 162, 61], plant.rot);
}

function leafColour(plant: Plant): string {
  if (plant.dead) return "rgb(140 124 100)";
  return mix([93, 153, 80], [191, 179, 75], plant.rot);
}

export function drawPlant(
  ctx: CanvasRenderingContext2D,
  plant: Plant,
  index: number,
  layout: Layout,
  time: number,
): void {
  const cell = layout.cell;
  const { x, y } = cellCentre(layout, plant.cx, plant.cy);
  const base = y + cell * 0.34;
  const stage = stageOf(plant);

  if (stage === "seed") {
    // A mound with a seed sitting in it. At 120px cells a bare ellipse reads
    // as a speck of dirt; the mound is what says "something is planted here".
    ctx.fillStyle = "rgb(60 44 28 / 0.22)";
    ctx.beginPath();
    ctx.ellipse(x, base, cell * 0.26, cell * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgb(255 246 226 / 0.13)";
    ctx.beginPath();
    ctx.ellipse(x, base - cell * 0.03, cell * 0.24, cell * 0.085, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgb(88 68 46)";
    ctx.beginPath();
    ctx.ellipse(x, base - cell * 0.05, cell * 0.055, cell * 0.075, 0.5, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const height = cell * (0.45 + plant.growth * 1.5);
  // Three postures, one variable each: thirst leans it over, rot fattens it,
  // death folds it flat.
  const droop = plant.dead ? 1.3 : plant.thirst * 0.9;
  const sway = plant.dead ? 0 : Math.sin(time * 1.4 + index) * 0.045 * (1 - plant.thirst);
  const lean = droop + sway;
  const fat = 1 + plant.rot * 1.4;

  const tipX = x + Math.sin(lean) * height * 0.72;
  const tipY = base - Math.cos(lean) * height;
  const midX = x + Math.sin(lean) * height * 0.22;
  const midY = base - height * 0.5;

  ctx.save();
  ctx.lineCap = "round";

  ctx.strokeStyle = stemColour(plant);
  ctx.lineWidth = cell * (0.035 + plant.growth * 0.05) * fat;
  ctx.beginPath();
  ctx.moveTo(x, base);
  ctx.quadraticCurveTo(midX, midY, tipX, tipY);
  ctx.stroke();

  const leaves = stage === "sprout" ? 1 : stage === "leaf" ? 2 : 3;
  ctx.fillStyle = leafColour(plant);
  for (let i = 0; i < leaves; i += 1) {
    const t = 0.32 + i * 0.23;
    const lx = x + Math.sin(lean) * height * 0.72 * t * t;
    const ly = base - Math.cos(lean) * height * t;
    const size = cell * (0.1 + plant.growth * 0.17) * fat;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(lean + side * (0.8 + plant.thirst * 0.6));
      ctx.beginPath();
      ctx.ellipse(side * size * 0.85, 0, size, size * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  if (stage === "bud") {
    ctx.fillStyle = mix([120, 160, 100], [177, 162, 61], plant.rot);
    ctx.beginPath();
    ctx.ellipse(tipX, tipY, cell * 0.11 * fat, cell * 0.15 * fat, lean, 0, Math.PI * 2);
    ctx.fill();
  }

  if (stage === "bloom") {
    const hue = BLOOM_HUES[index % BLOOM_HUES.length] ?? 340;
    const petal = cell * 0.19 + Math.sin(time * 2 + index) * cell * 0.008;
    ctx.fillStyle = `hsl(${hue} 64% ${70 - plant.rot * 24}%)`;
    for (let i = 0; i < 6; i += 1) {
      const a = lean + (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(
        tipX + Math.cos(a) * petal,
        tipY + Math.sin(a) * petal,
        petal * 0.8,
        petal * 0.62,
        a,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.fillStyle = `hsl(${hue} 48% 35%)`;
    ctx.beginPath();
    ctx.arc(tipX, tipY, petal * 0.46, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function drawWeed(
  ctx: CanvasRenderingContext2D,
  weed: Weed,
  layout: Layout,
  time: number,
): void {
  const cell = layout.cell;
  const { x, y } = cellCentre(layout, weed.cx, weed.cy);
  const base = y + cell * 0.34;
  const height = cell * (0.24 + weed.size * 0.72);

  // Weeds are angular where plants are round, and cold where plants are warm.
  // A player has to tell them apart at a glance and under time pressure.
  ctx.strokeStyle = "rgb(66 96 86)";
  ctx.lineWidth = cell * (0.028 + weed.size * 0.022);
  ctx.lineCap = "round";
  for (let i = -2; i <= 2; i += 1) {
    const spread = i * (0.27 + weed.size * 0.1);
    const wobble = Math.sin(time * 2.2 + i + weed.cx) * 0.035;
    ctx.beginPath();
    ctx.moveTo(x, base);
    ctx.lineTo(
      x + Math.sin(spread + wobble) * height * 0.85,
      base - Math.cos(spread + wobble) * height,
    );
    ctx.stroke();
  }
}

export function drawDroplets(ctx: CanvasRenderingContext2D, droplets: Droplet[]): void {
  ctx.fillStyle = "rgb(122 172 196 / 0.85)";
  for (const drop of droplets) {
    ctx.beginPath();
    ctx.ellipse(drop.x, drop.y, 2.8, 5.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawCan(ctx: CanvasRenderingContext2D, can: Can, pouring: boolean): void {
  ctx.save();
  ctx.translate(can.x, can.y);
  ctx.rotate(can.tilt);

  ctx.fillStyle = "rgb(154 162 166)";
  ctx.strokeStyle = "rgb(92 100 106)";
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(24, -6);
  ctx.lineTo(50, 10);
  ctx.lineTo(50, 21);
  ctx.lineTo(20, 13);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(-8, -20, 15, Math.PI, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.roundRect(-26, -20, 52, 40, 7);
  ctx.fill();
  ctx.stroke();

  if (pouring) {
    ctx.fillStyle = "rgb(122 172 196 / 0.55)";
    ctx.beginPath();
    ctx.roundRect(-22, -11, 44, 27, 5);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * The only thing in the game that isn't a consequence: if nobody has poured
 * after a few seconds, the can tips and drips. A stranger who hasn't worked
 * out that it holds water gets shown, without being told.
 */
export function drawHintDrip(
  ctx: CanvasRenderingContext2D,
  can: Can,
  layout: Layout,
  phase: number,
): void {
  const fall = (phase % 1) * layout.originY * 0.8;
  ctx.fillStyle = `rgb(122 172 196 / ${0.8 * (1 - (phase % 1))})`;
  ctx.beginPath();
  ctx.ellipse(can.x + 46, can.y + 20 + fall, 2.8, 5.8, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawFrost(
  ctx: CanvasRenderingContext2D,
  garden: Garden,
  layout: Layout,
  fade: number,
): void {
  ctx.fillStyle = `rgb(228 239 245 / ${0.5 * fade})`;
  ctx.fillRect(0, 0, layout.width, layout.height);

  // What a season leaves behind: every bloom that made it drops a seed, and
  // the seeds are the only thing still moving. Pressing one starts again.
  garden.plants.forEach((plant, i) => {
    if (plant.dead || stageOf(plant) !== "bloom") return;
    const { x, y } = cellCentre(layout, plant.cx, plant.cy);
    const bob = Math.sin(fade * 3 + i) * layout.cell * 0.03;
    ctx.fillStyle = "rgb(94 76 54)";
    ctx.beginPath();
    ctx.ellipse(x, y + layout.cell * 0.2 + bob, layout.cell * 0.07, layout.cell * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

