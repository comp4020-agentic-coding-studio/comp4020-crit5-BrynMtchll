// Water and weeds — the two things in the scene that move on their own.

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Points,
  PointsMaterial,
  Vector3,
} from "three";
import type { Garden } from "../lib/garden";
import { worldToCell } from "./ground";

const MAX_DROPS = 900;
const GRAVITY = 6.4;

export interface Water {
  readonly points: Points;
  emit(from: Vector3, velocity: Vector3): void;
  step(dt: number, garden: Garden, wet: (cx: number, cy: number, amount: number) => void): void;
}

export function createWater(): Water {
  const positions = new Float32Array(MAX_DROPS * 3);
  const velocities = new Float32Array(MAX_DROPS * 3);
  const life = new Float32Array(MAX_DROPS);
  let cursor = 0;

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));

  const points = new Points(
    geometry,
    new PointsMaterial({
      color: 0xbfe0f0,
      size: 0.022,
      transparent: true,
      opacity: 0.85,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  points.frustumCulled = false;

  function emit(from: Vector3, velocity: Vector3): void {
    for (let n = 0; n < 3; n += 1) {
      const i = cursor;
      cursor = (cursor + 1) % MAX_DROPS;
      // Out of the rose, which sits forward and above the can's origin.
      positions[i * 3] = from.x + 0.17 + (Math.random() - 0.5) * 0.03;
      positions[i * 3 + 1] = from.y + 0.34;
      positions[i * 3 + 2] = from.z + (Math.random() - 0.5) * 0.03;
      // The stream inherits the can's momentum. This is the whole reason a
      // moving can waters the wrong cell.
      velocities[i * 3] = velocity.x * 0.55 + (Math.random() - 0.5) * 0.12;
      velocities[i * 3 + 1] = -0.35;
      velocities[i * 3 + 2] = velocity.z * 0.55 + (Math.random() - 0.5) * 0.12;
      life[i] = 1;
    }
  }

  function step(
    dt: number,
    garden: Garden,
    wet: (cx: number, cy: number, amount: number) => void,
  ): void {
    for (let i = 0; i < MAX_DROPS; i += 1) {
      if ((life[i] ?? 0) <= 0) continue;
      velocities[i * 3 + 1] = (velocities[i * 3 + 1] ?? 0) - GRAVITY * dt;
      positions[i * 3] = (positions[i * 3] ?? 0) + (velocities[i * 3] ?? 0) * dt;
      positions[i * 3 + 1] = (positions[i * 3 + 1] ?? 0) + (velocities[i * 3 + 1] ?? 0) * dt;
      positions[i * 3 + 2] = (positions[i * 3 + 2] ?? 0) + (velocities[i * 3 + 2] ?? 0) * dt;

      if ((positions[i * 3 + 1] ?? 0) <= 0.004) {
        // Landed. The cell it wets is where the drop actually came down, not
        // where the player was pointing when it left the spout.
        const cell = worldToCell(garden, positions[i * 3] ?? 0, positions[i * 3 + 2] ?? 0);
        if (cell) wet(cell.cx, cell.cy, 0.012);
        life[i] = 0;
        positions[i * 3 + 1] = -999;
        continue;
      }
      life[i] = (life[i] ?? 0) - dt * 0.6;
      if ((life[i] ?? 0) <= 0) positions[i * 3 + 1] = -999;
    }
    const attribute = geometry.getAttribute("position") as BufferAttribute;
    attribute.needsUpdate = true;
  }

  return { points, emit, step };
}

const WEED_LEAF = new MeshStandardMaterial({ color: 0x53705f, roughness: 0.8 });

/** Angular and cold where the natives are soft and warm, so they read apart. */
export function buildWeed(): Object3D {
  const group = new Group();
  for (let i = 0; i < 7; i += 1) {
    const blade = new Mesh(new CylinderGeometry(0.001, 0.0055, 0.2, 3), WEED_LEAF);
    const a = (i / 7) * Math.PI * 2;
    blade.position.set(Math.cos(a) * 0.012, 0.1, Math.sin(a) * 0.012);
    blade.rotation.z = Math.cos(a) * 0.55;
    blade.rotation.x = -Math.sin(a) * 0.55;
    blade.castShadow = true;
    group.add(blade);
  }
  return group;
}
