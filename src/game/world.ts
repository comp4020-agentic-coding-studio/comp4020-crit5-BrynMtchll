import { GRID_H, GRID_W } from "../lib/garden";

/** One soil cell, in world units. Everything else is derived from this. */
export const CELL = 64;

export const PLOT_W = GRID_W * CELL;
export const PLOT_H = GRID_H * CELL;

/** Sky above the plot: room for the can to swing without leaving the frame. */
export const SKY_H = 150;

export const WORLD_W = PLOT_W;
export const WORLD_H = PLOT_H + SKY_H;

/** World point -> soil cell. Returns null above the plot or outside it. */
export function cellAt(x: number, y: number): { cx: number; cy: number } | null {
  const cx = Math.floor(x / CELL);
  const cy = Math.floor((y - SKY_H) / CELL);
  if (cx < 0 || cx >= GRID_W || cy < 0 || cy >= GRID_H) return null;
  return { cx, cy };
}

/** Centre of a soil cell, in world units. */
export function cellCentre(cx: number, cy: number): { x: number; y: number } {
  return { x: cx * CELL + CELL / 2, y: SKY_H + cy * CELL + CELL / 2 };
}
