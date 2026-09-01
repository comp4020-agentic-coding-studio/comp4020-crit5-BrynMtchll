// Procedural natives. Each species is built from a handful of primitives with
// a distinct silhouette, because the player has to tell them apart with no
// labels — as a seed on the bench, and again in flower in the bed.
//
// A plant rebuilds only when its stage changes, not every frame: five species
// across six stages is thirty meshes at most, and rebuilding per frame turns a
// garden into a GC problem.

import {
  BufferGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector2,
} from "three";
import { type Plant, stageOf } from "../lib/garden";
import { speciesOf } from "../lib/species";

function leafMaterial(colour: number, rot: number, dead: boolean): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: dead ? 0x8a7a5e : colour,
    roughness: 0.72,
    metalness: 0,
  });
  if (!dead && rot > 0) {
    // Rot yellows the foliage before it kills it. This is the tell that the
    // crown has been over-watered, and it is deliberately late.
    material.color.lerp(new MeshStandardMaterial({ color: 0xc9bb52 }).color, rot);
  }
  return material;
}

// One geometry per distinct blade size, shared across every leaf that wants it.
// A fuller shrub is two dozen blades; building a lathe per leaf per rebuild made
// the garden a garbage-collection problem instead of a rendering one.
const blades = new Map<string, BufferGeometry>();

/** A tapered blade, used for strap leaves and phyllodes. */
function blade(length: number, width: number): BufferGeometry {
  const key = `${length.toFixed(3)}:${width.toFixed(4)}`;
  const cached = blades.get(key);
  if (cached) return cached;
  const made = buildBlade(length, width);
  blades.set(key, made);
  return made;
}

function buildBlade(length: number, width: number): BufferGeometry {
  return new LatheGeometry(
    [
      new Vector2(0.0001, 0),
      new Vector2(width, length * 0.2),
      new Vector2(width * 0.8, length * 0.62),
      new Vector2(0.0001, length),
    ],
    5,
  );
}

function addStem(group: Group, height: number, radius: number, material: MeshStandardMaterial) {
  const stem = new Mesh(new CylinderGeometry(radius * 0.7, radius, height, 6), material);
  stem.position.y = height / 2;
  stem.castShadow = true;
  group.add(stem);
  return stem;
}

/**
 * Build the mesh for a plant at its current size. `scale` is 0..1 through the
 * stages, so the same geometry grows rather than popping between models.
 */
export function buildPlant(plant: Plant): Object3D {
  const species = speciesOf(plant.species);
  const stage = stageOf(plant);
  const group = new Group();

  const dead = plant.dead;
  const foliage = leafMaterial(species.foliage, plant.rot, dead);
  const woody = new MeshStandardMaterial({
    color: dead ? 0x7d6c53 : 0x6b6146,
    roughness: 0.85,
  });
  const flower = new MeshStandardMaterial({
    color: species.bloom,
    roughness: 0.55,
    metalness: 0,
  });

  if (stage === "seed") return group;

  const grown = Math.min(1, plant.growth);
  const h = species.height * (0.18 + grown * 0.82);
  // Thirst leans the plant over; death bows it further and draws it in. Folded
  // all the way to 1.15rad it lay flat on its own soil and read as a bug in the
  // renderer rather than as a plant that had died — a collapsed silhouette that
  // is still plant-shaped says it better.
  const lean = dead ? 0.72 : plant.thirst * 0.7;
  const fat = 1 + plant.rot * 0.5;

  const foliageGroup = new Group();
  group.add(foliageGroup);

  switch (species.form) {
    case "strap": {
      // Kangaroo paw: a fan of strap leaves from the base, flower stems above.
      const count = 9 + Math.round(grown * 5);
      for (let i = 0; i < count; i += 1) {
        const leaf = new Mesh(blade(h * 0.72, 0.019 * fat), foliage);
        leaf.rotation.z = (i / count - 0.5) * 0.9;
        leaf.rotation.y = (i / count) * Math.PI * 1.6;
        leaf.castShadow = true;
        foliageGroup.add(leaf);
      }
      if (stage === "bud" || stage === "bloom") {
        const stem = addStem(foliageGroup, h, 0.007, woody);
        stem.rotation.z = 0.12;
        if (stage === "bloom") {
          for (let i = 0; i < 4; i += 1) {
            const claw = new Mesh(new CylinderGeometry(0.008, 0.013, h * 0.2, 5), flower);
            claw.position.set(0.02, h * (0.82 + i * 0.045), 0);
            claw.rotation.z = -0.9 - i * 0.12;
            claw.castShadow = true;
            foliageGroup.add(claw);
          }
        }
      }
      break;
    }
    case "spike": {
      // Banksia: upright, woody, with the candle at the top.
      addStem(foliageGroup, h * 0.86, 0.013 * fat, woody);
      const leaves = 13 + Math.round(grown * 8);
      for (let i = 0; i < leaves; i += 1) {
        const leaf = new Mesh(blade(h * 0.27, 0.016), foliage);
        leaf.position.y = h * (0.25 + (i / leaves) * 0.5);
        leaf.rotation.z = (i % 2 === 0 ? 1.1 : -1.1) + ((i % 3) - 1) * 0.13;
        leaf.rotation.y = (i / leaves) * Math.PI * 2 * 2.4;
        leaf.castShadow = true;
        foliageGroup.add(leaf);
      }
      if (stage === "bloom" || stage === "bud") {
        // Sits on top of the stem, not above it. At h*0.075 radius it read as
        // a fence post balanced over the plant rather than a flower spike.
        const candle = new Mesh(
          new CylinderGeometry(h * 0.045, h * 0.038, h * 0.2, 12),
          stage === "bloom" ? flower : woody,
        );
        candle.position.y = h * 0.93;
        candle.castShadow = true;
        foliageGroup.add(candle);
      }
      break;
    }
    case "brush": {
      // Bottlebrush: weeping fine foliage, cylindrical brush of stamens.
      addStem(foliageGroup, h * 0.85, 0.011 * fat, woody);
      const sprigs = 15 + Math.round(grown * 9);
      for (let i = 0; i < sprigs; i += 1) {
        const leaf = new Mesh(blade(h * 0.26, 0.0085), foliage);
        leaf.position.y = h * (0.3 + (i / sprigs) * 0.5);
        leaf.rotation.z = 2.5;
        leaf.rotation.y = (i / sprigs) * Math.PI * 2.4;
        leaf.castShadow = true;
        foliageGroup.add(leaf);
      }
      if (stage === "bloom") {
        const brush = new Mesh(new CylinderGeometry(h * 0.07, h * 0.07, h * 0.22, 10), flower);
        brush.position.y = h * 0.9;
        brush.castShadow = true;
        foliageGroup.add(brush);
        for (let i = 0; i < 24; i += 1) {
          const stamen = new Mesh(new CylinderGeometry(0.0016, 0.0016, h * 0.055, 3), flower);
          const a = (i / 24) * Math.PI * 2;
          stamen.position.set(Math.cos(a) * h * 0.085, h * (0.84 + (i % 5) * 0.02), Math.sin(a) * h * 0.085);
          stamen.rotation.z = Math.cos(a) * 1.3;
          stamen.rotation.x = -Math.sin(a) * 1.3;
          foliageGroup.add(stamen);
        }
      }
      break;
    }
    case "fine": {
      // Grevillea: low and wide, divided foliage, spider flowers.
      const arms = 15 + Math.round(grown * 9);
      for (let i = 0; i < arms; i += 1) {
        const arm = new Mesh(blade(h * 0.55, 0.0095 * fat), foliage);
        arm.rotation.z = 0.75 + (i % 3) * 0.2;
        arm.rotation.y = (i / arms) * Math.PI * 2;
        arm.castShadow = true;
        foliageGroup.add(arm);
      }
      if (stage === "bloom") {
        for (let i = 0; i < 3; i += 1) {
          const head = new Group();
          const a = (i / 3) * Math.PI * 2;
          head.position.set(Math.cos(a) * h * 0.24, h * 0.5, Math.sin(a) * h * 0.24);
          for (let j = 0; j < 9; j += 1) {
            const style = new Mesh(new CylinderGeometry(0.0014, 0.0014, h * 0.09, 3), flower);
            const b = (j / 9) * Math.PI * 2;
            style.position.set(Math.cos(b) * 0.012, 0, Math.sin(b) * 0.012);
            style.rotation.z = Math.cos(b) * 0.9;
            style.rotation.x = -Math.sin(b) * 0.9;
            head.add(style);
          }
          foliageGroup.add(head);
        }
      }
      break;
    }
    case "phyllode": {
      // Wattle: upright phyllodes, then a scatter of golden puffballs.
      addStem(foliageGroup, h * 0.7, 0.01 * fat, woody);
      const leaves = 17 + Math.round(grown * 10);
      for (let i = 0; i < leaves; i += 1) {
        const leaf = new Mesh(blade(h * 0.32, 0.0115), foliage);
        leaf.position.y = h * (0.18 + (i / leaves) * 0.55);
        leaf.rotation.z = (i % 2 === 0 ? 0.8 : -0.8) + ((i % 3) - 1) * 0.15;
        leaf.rotation.y = (i / leaves) * Math.PI * 2.7 * 1.6;
        leaf.castShadow = true;
        foliageGroup.add(leaf);
      }
      if (stage === "bloom") {
        for (let i = 0; i < 14; i += 1) {
          const puff = new Mesh(new SphereGeometry(h * 0.028, 6, 5), flower);
          const a = (i / 14) * Math.PI * 2 * 1.7;
          puff.position.set(
            Math.cos(a) * h * 0.16,
            h * (0.55 + (i % 6) * 0.045),
            Math.sin(a) * h * 0.16,
          );
          puff.castShadow = true;
          foliageGroup.add(puff);
        }
      }
      break;
    }
  }

  foliageGroup.rotation.z = lean;
  if (dead) foliageGroup.scale.set(0.88, 0.72, 0.88);
  return group;
}
