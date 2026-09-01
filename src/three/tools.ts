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
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from "three";
import { SPECIES, type SpeciesId } from "../lib/species";
import { BED_D, BED_W } from "./ground";

export type ToolId = "trowel" | "can" | `seed:${SpeciesId}`;

export interface Tool {
  readonly id: ToolId;
  readonly object: Object3D;
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
  readonly tools: readonly Tool[];
}

/** The board and everything on it, along the near edge of the bed. */
export function createBench(): Bench {
  const group = new Group();

  const z = BED_D / 2 + 0.24;
  const board = new Mesh(new BoxGeometry(BED_W + 0.42, 0.05, 0.34), WOOD);
  board.position.set(0, 0.03, z);
  board.receiveShadow = true;
  board.castShadow = true;
  group.add(board);

  const tools: Tool[] = [];
  const surface = 0.055;

  const trowel = buildTrowel();
  const trowelHome = { x: -BED_W / 2 + 0.12, y: surface, z };
  trowel.rotation.x = -Math.PI / 2;
  trowel.rotation.z = 0.35;
  tools.push({ id: "trowel", object: trowel, home: trowelHome });

  const can = buildCan();
  const canHome = { x: BED_W / 2 - 0.06, y: surface, z };
  tools.push({ id: "can", object: can, home: canHome });

  SPECIES.forEach((species, i) => {
    const spread = (i - (SPECIES.length - 1) / 2) * 0.19;
    const seed = buildSeed(species.seed.colour, species.seed.radius);
    tools.push({
      id: `seed:${species.id}`,
      object: seed,
      home: { x: spread, y: surface, z },
    });
  });

  for (const tool of tools) {
    tool.object.position.set(tool.home.x, tool.home.y, tool.home.z);
    group.add(tool.object);
  }

  return { group, tools };
}
