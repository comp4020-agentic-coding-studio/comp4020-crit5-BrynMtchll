// The bed. One subdivided plane whose vertices are pushed down where holes are
// dug, and whose surface reads the moisture field.
//
// Wet soil is not "brown but darker". It is darker AND much less rough AND its
// bumps read shallower, because water fills the pores and leaves a specular
// film. Doing all three is what makes a watered patch look wet rather than
// stained, and it is why the patch stays legible for as long as the water is
// actually there.
//
// All three ride on three's own map slots — albedo, roughnessMap,
// displacementMap — rather than injected GLSL. Patching chunk includes worked
// on paper and silently did nothing here, and a material that quietly ignores
// you is worse than a plain one that doesn't.

import {
  CanvasTexture,
  SRGBColorSpace,
  DataTexture,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
} from "three";
import type { Garden } from "../lib/garden";
import { soilGrain, soilNormal } from "./textures";

export const BED_W = 2.6;
export const BED_D = 1.9;
export const SOIL_Y = 0;
const HOLE_DEPTH_M = 0.13;

/** Resolution of the composited soil albedo. Cheap; it is redrawn every frame. */
const ALBEDO_W = 384;
const ALBEDO_H = 280;

export interface Ground {
  readonly mesh: Mesh;
  update(garden: Garden): void;
}

function scratch(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d context for the soil");
  return { canvas, ctx };
}

export function createGround(garden: Garden): Ground {
  const grain = soilGrain();
  const normal = soilNormal();

  // One texel per soil cell. Row order is flipped on write: the plane is laid
  // flat with rotateX(-PI/2), which sends its +y to world -z, so texture row 0
  // sits at the near edge while cell row 0 is the far one. Getting this wrong
  // mirrors the whole garden front to back, and every hole and damp patch
  // lands one row-mirror away from where the player put it.
  const cells = scratch(garden.w, garden.h);

  const rough = new DataTexture(new Uint8Array(garden.w * garden.h * 4), garden.w, garden.h);
  rough.minFilter = LinearFilter;
  rough.magFilter = LinearFilter;
  rough.needsUpdate = true;

  const holes = new DataTexture(new Uint8Array(garden.w * garden.h * 4), garden.w, garden.h);
  holes.minFilter = LinearFilter;
  holes.magFilter = LinearFilter;
  holes.needsUpdate = true;

  const albedo = scratch(ALBEDO_W, ALBEDO_H);
  const albedoTexture = new CanvasTexture(albedo.canvas);
  // Albedo is authored in sRGB. Left at the default the renderer treats it as
  // linear, which washes the soil out and flattens the wet/dry difference.
  albedoTexture.colorSpace = SRGBColorSpace;
  albedoTexture.wrapS = RepeatWrapping;
  albedoTexture.wrapT = RepeatWrapping;

  const segments = 160;
  const geometry = new PlaneGeometry(BED_W, BED_D, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const material = new MeshStandardMaterial({
    map: albedoTexture,
    normalMap: normal,
    roughnessMap: rough,
    roughness: 1,
    metalness: 0,
    displacementMap: holes,
    // Negative: the map says "how much hole", and a hole goes down.
    displacementScale: -HOLE_DEPTH_M,
  });
  material.normalScale.set(1.5, 1.5);

  const mesh = new Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.position.y = SOIL_Y;

  function update(current: Garden): void {
    const w = current.w;
    const h = current.h;

    // Moisture, one pixel per cell, rows flipped.
    const image = cells.ctx.createImageData(w, h);
    const roughData = rough.image.data as Uint8Array;
    const holeData = holes.image.data as Uint8Array;
    holeData.fill(0);

    for (let cy = 0; cy < h; cy += 1) {
      const row = h - 1 - cy;
      for (let cx = 0; cx < w; cx += 1) {
        const m = Math.min(1, Math.max(0, current.moisture[cy * w + cx] ?? 0));
        const i = (row * w + cx) * 4;

        // Darkening is non-linear: the first drop changes the colour a lot,
        // and saturated soil is not twice as dark as damp soil. A cold cast
        // creeps in past the point a plant can take, which is the only warning
        // the crown rule ever gives.
        // Strong on purpose. The grain noise sits at similar contrast, and a
        // damp patch that only just outreads the grain is a patch the player
        // cannot find — which defeats the point of a rule about where water
        // went.
        const soak = Math.pow(m, 0.65);
        const shade = 1 - soak * 0.78;
        const cold = Math.max(0, (m - 0.72) / 0.28);
        image.data[i] = Math.round(255 * shade * (1 - cold * 0.12));
        image.data[i + 1] = Math.round(255 * shade * (1 - cold * 0.02));
        image.data[i + 2] = Math.round(255 * shade * (1 + cold * 0.1));
        image.data[i + 3] = 255;

        // Dry soil is fully rough. Water fills the pores and leaves a film, so
        // wet ground takes a broad specular highlight — the strongest single
        // cue that a patch is still damp rather than just stained.
        roughData[i + 1] = Math.round(255 * (1 - Math.pow(m, 0.8) * 0.88));
        roughData[i + 3] = 255;
      }
    }
    cells.ctx.putImageData(image, 0, 0);
    rough.needsUpdate = true;

    for (const hole of current.holes) {
      const row = h - 1 - hole.cy;
      const depth = Math.round(Math.min(1, Math.max(0, hole.depth)) * 255);
      const i = (row * w + hole.cx) * 4;
      holeData[i] = depth;
      holeData[i + 1] = depth;
      holeData[i + 2] = depth;
      holeData[i + 3] = 255;
    }
    holes.needsUpdate = true;

    // Composite: tiled grain, then the moisture field multiplied over it.
    // Smoothing on the upscale is what makes damp ground spread rather than
    // arrive as a grid of squares.
    const ctx = albedo.ctx;
    ctx.globalCompositeOperation = "source-over";
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#c49a68";
    ctx.fillRect(0, 0, ALBEDO_W, ALBEDO_H);

    // Grain multiplies rather than blends: drawing greyscale noise over the
    // base at partial alpha washes the whole bed toward grey, which is what a
    // first attempt at this did.
    const grainImage = grain.image as HTMLCanvasElement;
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.34;
    for (let ty = 0; ty < 3; ty += 1) {
      for (let tx = 0; tx < 3; tx += 1) {
        ctx.drawImage(grainImage, (tx * ALBEDO_W) / 3, (ty * ALBEDO_H) / 3, ALBEDO_W / 3, ALBEDO_H / 3);
      }
    }
    ctx.globalAlpha = 1;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cells.canvas, 0, 0, ALBEDO_W, ALBEDO_H);
    ctx.globalCompositeOperation = "source-over";

    albedoTexture.needsUpdate = true;
  }

  update(garden);
  return { mesh, update };
}

/** Bed-local metres for a soil cell centre. */
export function cellToWorld(
  garden: Garden,
  cx: number,
  cy: number,
): { x: number; z: number } {
  return {
    x: ((cx + 0.5) / garden.w - 0.5) * BED_W,
    z: ((cy + 0.5) / garden.h - 0.5) * BED_D,
  };
}

/** Metres back to a soil cell, or null off the bed. */
export function worldToCell(
  garden: Garden,
  x: number,
  z: number,
): { cx: number; cy: number } | null {
  const cx = Math.floor((x / BED_W + 0.5) * garden.w);
  const cy = Math.floor((z / BED_D + 0.5) * garden.h);
  if (cx < 0 || cx >= garden.w || cy < 0 || cy >= garden.h) return null;
  return { cx, cy };
}
