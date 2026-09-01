// Procedural soil textures, generated once at load. Everything is drawn into a
// canvas and uploaded — no image files to fetch, so the page has no request
// waterfall and nothing to 404 on the deployed path.

import { CanvasTexture, RepeatWrapping, type Texture } from "three";

function noiseCanvas(size: number, seed: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context for soil texture");

  const image = ctx.createImageData(size, size);
  // Value noise summed over four octaves. Cheap, tiles, and good enough for
  // soil, which is the one surface where "structured randomness" is the whole
  // visual character.
  const lattice = (octave: number) => {
    const n = 4 << octave;
    const values = new Float32Array(n * n);
    let s = seed + octave * 7919;
    for (let i = 0; i < values.length; i += 1) {
      s = (s * 1664525 + 1013904223) >>> 0;
      values[i] = s / 4294967296;
    }
    return { n, values };
  };

  const octaves = [0, 1, 2, 3, 4, 5].map(lattice);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      let weight = 0;
      for (let o = 0; o < octaves.length; o += 1) {
        const layer = octaves[o];
        if (!layer) continue;
        const { n, values } = layer;
        const fx = (x / size) * n;
        const fy = (y / size) * n;
        const x0 = Math.floor(fx) % n;
        const y0 = Math.floor(fy) % n;
        const x1 = (x0 + 1) % n;
        const y1 = (y0 + 1) % n;
        const tx = fx - Math.floor(fx);
        const ty = fy - Math.floor(fy);
        // Smoothstep between lattice points, or the noise shows its grid.
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const v00 = values[y0 * n + x0] ?? 0;
        const v10 = values[y0 * n + x1] ?? 0;
        const v01 = values[y1 * n + x0] ?? 0;
        const v11 = values[y1 * n + x1] ?? 0;
        const top = v00 + (v10 - v00) * sx;
        const bottom = v01 + (v11 - v01) * sx;
        const amplitude = 1 / (o + 1);
        sum += (top + (bottom - top) * sy) * amplitude;
        weight += amplitude;
      }
      const v = Math.round((sum / weight) * 255);
      const i = (y * size + x) * 4;
      image.data[i] = v;
      image.data[i + 1] = v;
      image.data[i + 2] = v;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Height-ish greyscale used to modulate soil colour, and to derive a normal. */
export function soilGrain(): Texture {
  const texture = new CanvasTexture(noiseCanvas(512, 20260901));
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(3, 3);
  return texture;
}

/** Sobel of the grain, packed as a tangent-space normal map. */
export function soilNormal(): Texture {
  const size = 512;
  const source = noiseCanvas(size, 20260901);
  const sctx = source.getContext("2d");
  if (!sctx) throw new Error("no 2d context for soil normal");
  const grain = sctx.getImageData(0, 0, size, size).data;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context for soil normal");
  const out = ctx.createImageData(size, size);

  const at = (x: number, y: number) =>
    (grain[(((y + size) % size) * size + ((x + size) % size)) * 4] ?? 0) / 255;

  const strength = 3.2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const length = Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * size + x) * 4;
      out.data[i] = Math.round(((-dx / length) * 0.5 + 0.5) * 255);
      out.data[i + 1] = Math.round(((-dy / length) * 0.5 + 0.5) * 255);
      out.data[i + 2] = Math.round((1 / length) * 0.5 * 255 + 127);
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(3, 3);
  return texture;
}
