// The loop, the canvas and the two things a player can do. Everything with a
// rule in it lives in ../lib/garden.ts or ./can.ts; this file only moves time
// forward and turns pointer events into those two verbs.

import { createGarden, POUR_PER_S, pour, pull, step, weedAt } from "../lib/garden";
import { createCan, pourPoint, stepCan } from "./can";
import {
  drawCan,
  drawDroplets,
  drawFrost,
  drawHintDrip,
  drawPlant,
  drawSky,
  drawSoil,
  drawWeed,
  type Droplet,
} from "./render";
import { cellAt, chooseGrid, type Layout, layoutFor } from "./world";

const FIXED_DT = 1 / 60;
/** Never simulate more than a quarter second of catch-up in one frame. */
const MAX_CATCHUP = 0.25;
const HINT_AFTER_S = 3.5;

export function start(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext("2d");
  if (context === null) return;
  // Rebound after the guard: `frame` below is a hoisted declaration, so TS
  // won't carry the narrowing into it from a conditional return.
  const ctx = context;

  const dpr = (): number => Math.min(2, globalThis.devicePixelRatio || 1);

  // Grid shape is decided once, from the viewport that loaded the page. A
  // resize rescales the cells; it does not reshape the plot under a season in
  // progress.
  const grid = chooseGrid(canvas.clientWidth || 800, canvas.clientHeight || 600);
  let layout: Layout = layoutFor(
    grid.cols,
    grid.rows,
    canvas.clientWidth || 800,
    canvas.clientHeight || 600,
  );

  let seed = 1;
  let garden = createGarden(seed, grid.cols, grid.rows);
  let can = createCan(layout);
  let droplets: Droplet[] = [];

  let target = { x: layout.width / 2, y: layout.originY * 0.4 };
  let pouring = false;
  let hasPoured = false;
  let endingFade = 0;
  let clock = 0;
  let accumulator = 0;
  let last = 0;

  function resize(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    const ratio = dpr();
    const bufferW = Math.round(w * ratio);
    const bufferH = Math.round(h * ratio);
    if (canvas.width !== bufferW || canvas.height !== bufferH) {
      canvas.width = bufferW;
      canvas.height = bufferH;
    }
    layout = layoutFor(grid.cols, grid.rows, w, h);
  }

  function toCanvas(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function restart(): void {
    seed += 1;
    garden = createGarden(seed, grid.cols, grid.rows);
    can = createCan(layout);
    droplets = [];
    pouring = false;
    hasPoured = false;
    endingFade = 0;
    clock = 0;
  }

  canvas.addEventListener("pointermove", (event) => {
    target = toCanvas(event.clientX, event.clientY);
  });

  canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture(event.pointerId);
    const point = toCanvas(event.clientX, event.clientY);
    target = point;

    if (garden.ending !== null) {
      if (endingFade > 0.6) restart();
      return;
    }

    // Two verbs, told apart by what is under your finger: a weed comes out,
    // bare soil gets watered. No modes, nothing to switch between.
    const cell = cellAt(layout, point.x, point.y);
    if (cell) {
      const index = weedAt(garden, cell.cx, cell.cy);
      if (index >= 0) {
        garden = pull(garden, index);
        return;
      }
    }
    pouring = true;
    hasPoured = true;
  });

  const release = (): void => {
    pouring = false;
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("pointerleave", release);

  function simulate(dt: number): void {
    clock += dt;
    can = stepCan(can, layout, target.x, target.y, dt);

    if (garden.ending !== null) endingFade = Math.min(1, endingFade + dt * 1.4);

    if (pouring && garden.ending === null) {
      const point = pourPoint(can);
      droplets.push({ x: point.x, y: point.y, vx: can.vx * 0.16, vy: 260, life: 1 });
      // The stream is aimed where it will land, not where it leaves: the drop
      // falls for a moment before it reaches the soil, and the cell it wets is
      // the one under the end of that fall.
      const cell = cellAt(layout, point.x, Math.max(point.y, layout.originY + 1));
      if (cell) garden = pour(garden, cell.cx, cell.cy, POUR_PER_S * dt);
    }

    droplets = droplets.filter((drop) => {
      drop.vy += 1500 * dt;
      drop.x += drop.vx * dt;
      drop.y += drop.vy * dt;
      drop.life -= dt * 1.9;
      return drop.life > 0 && drop.y < layout.height;
    });

    garden = step(garden, dt);
  }

  function frame(now: number): void {
    if (last === 0) last = now;
    accumulator = Math.min(MAX_CATCHUP, accumulator + (now - last) / 1000);
    last = now;

    // Fixed timestep: the sim must not depend on frame rate, or the same
    // watering kills a plant on one machine and not another — and the tests
    // would be describing a game nobody is playing.
    while (accumulator >= FIXED_DT) {
      simulate(FIXED_DT);
      accumulator -= FIXED_DT;
    }

    resize();
    const ratio = dpr();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    drawSky(ctx, garden, layout);
    drawSoil(ctx, garden, layout);
    for (const weed of garden.weeds) drawWeed(ctx, weed, layout, clock);
    garden.plants.forEach((plant, i) => drawPlant(ctx, plant, i, layout, clock));
    drawDroplets(ctx, droplets);
    if (!hasPoured && clock > HINT_AFTER_S) drawHintDrip(ctx, can, layout, clock * 0.6);
    drawCan(ctx, can, pouring);
    if (garden.ending !== null) drawFrost(ctx, garden, layout, endingFade);

    requestAnimationFrame(frame);
  }

  resize();
  globalThis.addEventListener("resize", resize);
  requestAnimationFrame(frame);
}
