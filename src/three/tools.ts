// The toolbelt: a trowel, a watering can, and five seeds, laid out on a board
// along the near edge of the bed where a pair of hands would be.
//
// Nothing is labelled. A trowel and a watering can are recognisable objects,
// and a seed looks like a seed — the whole point of building the rack out of
// things rather than buttons is that objects need no words.

import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from "three";
import { SPECIES, type SpeciesId } from "../lib/species";
import { BED_D, BED_W } from "./ground";
import type { Edge } from "./scene";

export type ToolId = "trowel" | "can" | `seed:${SpeciesId}`;

export interface Tool {
  readonly id: ToolId;
  readonly object: Object3D;
  /**
   * The slot on the board, and the thing the pointer actually hits. A trowel
   * handle is a few pixels wide on a phone; the slot is a whole finger. It
   * stays on the board when the tool is in your hand, so pressing the empty
   * slot is how you put the tool back.
   */
  readonly pad: Mesh;
  /** Where it rests on the board when it isn't in your hand. */
  readonly home: { x: number; y: number; z: number };
}

const STEEL = new MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.34, metalness: 0.85 });
const WOOD = new MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.78 });
const GALV = new MeshStandardMaterial({ color: 0x9aa3a8, roughness: 0.42, metalness: 0.7 });

function buildTrowel(): Object3D {
  const group = new Group();
  const blade = new Mesh(
    new LatheGeometry(
      [
        new Vector2(0.0001, 0),
        new Vector2(0.032, 0.03),
        new Vector2(0.026, 0.1),
        new Vector2(0.0001, 0.135),
      ],
      8,
    ),
    STEEL,
  );
  blade.rotation.z = Math.PI;
  blade.position.y = 0.135;
  blade.scale.z = 0.45;
  group.add(blade);

  const neck = new Mesh(new CylinderGeometry(0.006, 0.006, 0.06, 6), STEEL);
  neck.position.y = 0.165;
  group.add(neck);

  const handle = new Mesh(new CylinderGeometry(0.016, 0.013, 0.11, 8), WOOD);
  handle.position.y = 0.25;
  group.add(handle);

  group.traverse((o) => {
    o.castShadow = true;
  });
  return group;
}

function buildCan(): Object3D {
  const group = new Group();
  const body = new Mesh(new CylinderGeometry(0.075, 0.085, 0.15, 16), GALV);
  body.position.y = 0.075;
  group.add(body);

  const rim = new Mesh(new TorusGeometry(0.075, 0.005, 6, 20), GALV);
  rim.position.y = 0.15;
  rim.rotation.x = Math.PI / 2;
  group.add(rim);

  const spout = new Mesh(new CylinderGeometry(0.014, 0.02, 0.2, 8), GALV);
  spout.position.set(0.11, 0.13, 0);
  spout.rotation.z = -0.9;
  group.add(spout);

  const rose = new Mesh(new CylinderGeometry(0.028, 0.02, 0.02, 10), GALV);
  rose.position.set(0.185, 0.19, 0);
  rose.rotation.z = -0.9;
  group.add(rose);

  const handle = new Mesh(new TorusGeometry(0.05, 0.005, 6, 16, Math.PI), GALV);
  handle.position.set(-0.02, 0.16, 0);
  handle.rotation.y = Math.PI / 2;
  group.add(handle);

  group.traverse((o) => {
    o.castShadow = true;
  });
  return group;
}

function buildSeed(colour: number, radius: number): Object3D {
  const group = new Group();
  // A seed alone is too small to press at a phone's pixel density, so each
  // species sits as a small heap in a shallow dish. The heap is the target.
  const dish = new Mesh(new CylinderGeometry(0.05, 0.045, 0.014, 14), WOOD);
  dish.position.y = 0.007;
  dish.receiveShadow = true;
  group.add(dish);

  const seedMaterial = new MeshStandardMaterial({ color: colour, roughness: 0.62 });
  for (let i = 0; i < 11; i += 1) {
    const seed = new Mesh(new SphereGeometry(radius * 1.8, 6, 5), seedMaterial);
    const a = (i / 11) * Math.PI * 2 * 2.4;
    const r = 0.008 + (i % 4) * 0.007;
    seed.position.set(Math.cos(a) * r, 0.017 + (i % 3) * 0.004, Math.sin(a) * r);
    seed.scale.y = 0.7;
    seed.castShadow = true;
    group.add(seed);
  }
  return group;
}

export interface Bench {
  readonly group: Group;
  readonly board: Mesh;
  readonly tools: readonly Tool[];
}

/** Y of the board's surface, and Z of the whole bench. */
export const BENCH_Y = 0.055;
export const BENCH_Z = BED_D / 2 + 0.24;
const BENCH_DEPTH = 0.34;

// Invisible but raycastable: `visible = false` would be skipped by the
// raycaster, and a zero-opacity material still reports intersections.
const HIT = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

/** The board and everything on it, along the near edge of the bed. */
export function createBench(): Bench {
  const group = new Group();

  const board = new Mesh(new BoxGeometry(1, 0.05, BENCH_DEPTH), WOOD);
  board.position.set(0, 0.03, BENCH_Z);
  board.receiveShadow = true;
  board.castShadow = true;
  group.add(board);

  const tools: Tool[] = [];

  const trowel = buildTrowel();
  trowel.rotation.x = -Math.PI / 2;
  trowel.rotation.z = 0.35;
  tools.push(slot("trowel", trowel));

  tools.push(slot("can", buildCan()));

  for (const species of SPECIES) {
    tools.push(slot(`seed:${species.id}`, buildSeed(species.seed.colour, species.seed.radius)));
  }

  function slot(id: ToolId, object: Object3D): Tool {
    const pad = new Mesh(new BoxGeometry(1, 0.3, BENCH_DEPTH), HIT);
    return { id, object, pad, home: { x: 0, y: BENCH_Y, z: BENCH_Z } };
  }

  for (const tool of tools) group.add(tool.object, tool.pad);

  return { group, board, tools };
}

/**
 * Lay the bench out inside the width the camera actually shows. Written in
 * metres against the live frustum rather than as fixed world positions,
 * because a portrait frame sees barely half the bed's width: the same
 * hand-placed bench that reads well at 1920x1080 put the trowel 162px off the
 * left edge of a 390px screen, where it cannot be picked up at all.
 */
export function layoutBench(bench: Bench, halfWidth: number, edge: Edge): void {
  // Swing the whole board round to whichever edge the player is standing at.
  // Everything on it is laid out in the board's own frame, so the tools follow.
  bench.group.rotation.y = edge === "long" ? 0 : Math.PI / 2;
  bench.group.position.x = edge === "long" ? 0 : (BED_W - BED_D) / 2;

  const span = edge === "long" ? BED_W : BED_D;
  const half = Math.min(span / 2 + 0.21, Math.max(0.45, halfWidth - 0.06));
  const count = bench.tools.length;
  const slotWidth = (half * 2) / count;

  bench.board.scale.x = half * 2 + 0.06;

  bench.tools.forEach((tool, i) => {
    tool.home.x = -half + slotWidth * (i + 0.5);
    tool.object.position.set(tool.home.x, tool.home.y, tool.home.z);
    // Objects grow with their slot, so a seed dish stays a pressable fraction
    // of the screen instead of a speck at one viewport and a boulder at another.
    // Never larger than modelled: scaled up to fill a wide slot, a watering can
    // took a fifth of the desktop frame.
    const scale = Math.min(1, Math.max(0.8, slotWidth / 0.31));
    tool.object.scale.setScalar(scale);
    // How tall the slot's hit box stands depends on how steeply you're looking
    // at it. Seen nearly edge-on from the long side it needs height to be worth
    // pressing; seen from above on a phone, that same height reaches out over
    // the nearest row of soil and swallows presses meant for the bed.
    const padHeight = edge === "long" ? 0.17 : 0.04;
    tool.pad.scale.set(slotWidth, padHeight / 0.3, 1);
    tool.pad.position.set(tool.home.x, 0.03 + padHeight / 2, tool.home.z);
  });
}
