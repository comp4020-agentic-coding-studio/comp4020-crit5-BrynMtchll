// World units are CSS pixels, so there is no letterbox and no second
// coordinate space to reason about. What changes between viewports is the
// shape of the grid, chosen once at load: a 1920x1080 desktop gets a wide
// shallow plot, a 390x844 phone gets a narrow deep one, and both get cells big
// enough to aim at.

const TARGET_CELLS = 96;
const SKY_FRACTION = 0.3;
const MIN_SKY = 108;

export interface Layout {
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  /** Top-left of the plot, in CSS pixels. */
  readonly originX: number;
  readonly originY: number;
  readonly width: number;
  readonly height: number;
}

function skyFor(height: number): number {
  return Math.max(MIN_SKY, height * SKY_FRACTION);
}

/**
 * Grid shape for a viewport. Called once — the sim keeps its dimensions for
 * the life of a season, so a mid-season resize rescales the cells rather than
 * rebuilding the garden under the player's hands.
 */
export function chooseGrid(width: number, height: number): { cols: number; rows: number } {
  const plotH = Math.max(140, height - skyFor(height));
  const cell = Math.sqrt((width * plotH) / TARGET_CELLS);
  return {
    cols: Math.max(6, Math.min(20, Math.round(width / cell))),
    rows: Math.max(5, Math.min(14, Math.round(plotH / cell))),
  };
}

export function layoutFor(
  cols: number,
  rows: number,
  width: number,
  height: number,
): Layout {
  const cell = Math.max(8, Math.min(width / cols, (height - skyFor(height)) / rows));
  return {
    cols,
    rows,
    cell,
    originX: (width - cell * cols) / 2,
    originY: height - cell * rows,
    width,
    height,
  };
}

/** Canvas point -> soil cell. Null anywhere off the plot. */
export function cellAt(
  layout: Layout,
  x: number,
  y: number,
): { cx: number; cy: number } | null {
  const cx = Math.floor((x - layout.originX) / layout.cell);
  const cy = Math.floor((y - layout.originY) / layout.cell);
  if (cx < 0 || cx >= layout.cols || cy < 0 || cy >= layout.rows) return null;
  return { cx, cy };
}

export function cellCentre(
  layout: Layout,
  cx: number,
  cy: number,
): { x: number; y: number } {
  return {
    x: layout.originX + cx * layout.cell + layout.cell / 2,
    y: layout.originY + cy * layout.cell + layout.cell / 2,
  };
}
