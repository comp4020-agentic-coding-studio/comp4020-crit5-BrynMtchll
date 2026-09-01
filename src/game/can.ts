// The can is deliberately bad at being a cursor. It has mass, it lags behind
// your hand, and the water leaves the spout carrying the momentum the can had
// when it left — so a moving can pours ahead of itself.
//
// Pure and deterministic, like the soil: same inputs, same wobble.

import { canScale, type Layout } from "./world";

/** Spring pulling the can toward your hand. Low enough to overshoot. */
const PULL = 46;
/** Damping. Low enough that the overshoot comes back. */
const DRAG = 6.2;

/** How far a swinging can throws its stream ahead of the spout. */
const LEAD = 0.19;

const MAX_TILT = 0.62;
const TILT_PER_SPEED = 1 / 780;
const TILT_LAG = 9;

const SPOUT_REACH = 42;

export interface Can {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly tilt: number;
}

export function createCan(layout: Layout): Can {
  return { x: layout.width / 2, y: layout.originY * 0.45, vx: 0, vy: 0, tilt: 0 };
}

export function stepCan(
  can: Can,
  layout: Layout,
  targetX: number,
  targetY: number,
  dt: number,
): Can {
  const ax = (targetX - can.x) * PULL - can.vx * DRAG;
  const ay = (targetY - can.y) * PULL - can.vy * DRAG;

  const vx = can.vx + ax * dt;
  const vy = can.vy + ay * dt;

  // Clamped to the frame so a hard flick can't fling the can off-screen and
  // leave the player with nothing to aim.
  const x = Math.max(0, Math.min(layout.width, can.x + vx * dt));
  const y = Math.max(0, Math.min(layout.height - 40, can.y + vy * dt));

  const wanted = Math.max(-MAX_TILT, Math.min(MAX_TILT, vx * TILT_PER_SPEED));
  const tilt = can.tilt + (wanted - can.tilt) * Math.min(1, TILT_LAG * dt);

  return { x, y, vx, vy, tilt };
}

/** Where the lip of the spout is, given how far the can has swung over. */
export function spoutOf(can: Can, layout: Layout): { x: number; y: number } {
  const s = canScale(layout);
  return {
    x: can.x + (Math.sin(can.tilt) * SPOUT_REACH + can.tilt * 26) * s,
    y: can.y + Math.cos(can.tilt) * 20 * s,
  };
}

/**
 * Where the water actually lands. Not under the spout: the stream keeps the
 * can's sideways momentum, so a can still moving when you press pours where it
 * was going. This is the whole skill of the game.
 */
export function pourPoint(can: Can, layout: Layout): { x: number; y: number } {
  const spout = spoutOf(can, layout);
  return { x: spout.x + can.vx * LEAD, y: spout.y };
}
