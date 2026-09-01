// The loop and the verbs. Pick a tool off the bench, use it on the soil. The
// rules all live in ../lib/garden.ts; this file raycasts a pointer onto the
// bed and turns hits into dig / sow / pour / pull.

import {
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Raycaster,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";
import {
  createGarden,
  DIG_PER_S,
  dig,
  holeAt,
  plantAt,
  POUR_PER_S,
  pour,
  pull,
  SEASON_S,
  sow,
  stageOf,
  step,
  weedAt,
} from "../lib/garden";
import type { SpeciesId } from "../lib/species";
import { BED_W, cellToWorld, createGround, worldToCell } from "./ground";
import { buildPlant } from "./plants";
import { createStage } from "./scene";
import { BENCH_Y, BENCH_Z, createBench, layoutBench, type Tool, type ToolId } from "./tools";
import { buildWeed, createWater } from "./props";

const FIXED_DT = 1 / 60;
const MAX_CATCHUP = 0.25;
const GRID_W = 11;
const GRID_H = 8;
/** How far the held tool lags your hand. Low enough to overshoot, as before. */
const PULL_K = 34;
const DRAG_K = 6.4;

export function start(canvas: HTMLCanvasElement): void {
  const stage = createStage(canvas);
  let seed = 1;
  let garden = createGarden(seed, GRID_W, GRID_H);

  const ground = createGround(garden);
  stage.scene.add(ground.mesh);

  const bench = createBench();
  stage.scene.add(bench.group);
  let benchWidth = 0;
  let benchEdge = "";

  const plantLayer = new Group();
  const weedLayer = new Group();
  stage.scene.add(plantLayer, weedLayer);

  const water = createWater();
  stage.scene.add(water.points);

  // Where the held tool actually is, versus where your hand is. The gap is the
  // whole skill of the game and it survives from the 2D version unchanged.
  const hand = new Vector3(0, 0.5, 0);
  const held = { pos: new Vector3(0, 0.5, 0), vel: new Vector3() };
  let holding: Tool | null = null;
  let hovered: Tool | null = null;
  let acting = false;

  const raycaster = new Raycaster();
  const pointer = new Vector2(-2, -2);
  let clock = 0;
  let accumulator = 0;
  let last = 0;
  let endingFade = 0;
  let hasActed = false;

  const plantMeshes = new Map<string, { object: Object3D; key: string }>();
  const weedMeshes = new Map<string, Object3D>();

  const marker = new Mesh(
    new SphereGeometry(0.028, 12, 10),
    new MeshStandardMaterial({ color: 0xf6f0dc, roughness: 0.5, transparent: true, opacity: 0.55 }),
  );
  marker.visible = false;
  stage.scene.add(marker);

  // The slots, not the tool meshes. Raycasting the meshes meant the tool in
  // your hand — drawn right under the cursor — intercepted presses meant for
  // the soil, and turned a dig into a fumbled put-down.
  function pickables(): Object3D[] {
    return [ground.mesh, ...bench.tools.map((t) => t.pad)];
  }

  function hit(): { point: Vector3; object: Object3D } | null {
    raycaster.setFromCamera(pointer, stage.camera);
    const hits = raycaster.intersectObjects(pickables(), true);
    const first = hits[0];
    if (!first) return null;
    return { point: first.point, object: first.object };
  }

  function toolFor(object: Object3D): Tool | null {
    return bench.tools.find((tool) => tool.pad === object) ?? null;
  }

  function restart(): void {
    seed += 1;
    garden = createGarden(seed, GRID_W, GRID_H);
    for (const [, entry] of plantMeshes) plantLayer.remove(entry.object);
    plantMeshes.clear();
    for (const [, mesh] of weedMeshes) weedLayer.remove(mesh);
    weedMeshes.clear();
    endingFade = 0;
    clock = 0;
    ground.update(garden);
  }

  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
  });

  canvas.addEventListener("pointerdown", (event) => {
    // Capture keeps a drag alive if the finger slides off the canvas, but it
    // throws on a pointer id the browser doesn't know — and an exception here
    // would take the whole press with it, tool and all.
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      /* not fatal: the press below is what matters */
    }
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );

    if (garden.ending !== null) {
      if (endingFade > 0.6) restart();
      return;
    }

    const target = hit();
    if (!target) return;

    // Pressing a tool picks it up, and pressing the one you're holding puts it
    // back. No modes to switch: what you're holding is visible in your hand.
    const tool = toolFor(target.object);
    if (tool) {
      holding = holding?.id === tool.id ? null : tool;
      hasActed = true;
      return;
    }

    acting = true;
    hasActed = true;
    useTool(target.point, FIXED_DT, true);
  });

  const release = (): void => {
    acting = false;
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("pointerleave", release);

  function useTool(point: Vector3, dt: number, firstPress: boolean): void {
    const cell = worldToCell(garden, point.x, point.z);
    if (!cell) return;
    const id: ToolId | null = holding?.id ?? null;

    if (id === "trowel") {
      // Held: the hole deepens. A trowel also lifts a weed out cleanly, which
      // is why it is worth carrying one.
      const weed = weedAt(garden, cell.cx, cell.cy);
      if (weed >= 0 && firstPress) {
        garden = dig(garden, cell.cx, cell.cy, DIG_PER_S * dt);
        return;
      }
      garden = dig(garden, cell.cx, cell.cy, DIG_PER_S * dt);
      return;
    }

    if (id === "can") {
      // Water leaves the rose where the can *was going*, not where it is.
      const lead = held.vel.clone().multiplyScalar(0.14);
      const landing = held.pos.clone().add(lead);
      const wet = worldToCell(garden, landing.x, landing.z);
      if (wet) garden = pour(garden, wet.cx, wet.cy, POUR_PER_S * dt);
      water.emit(held.pos, held.vel);
      return;
    }

    if (id !== null && id.startsWith("seed:") && firstPress) {
      const species = id.slice(5) as SpeciesId;
      garden = sow(garden, cell.cx, cell.cy, species);
      return;
    }

    // Bare hands: pull a weed.
    if (id === null && firstPress) {
      const weed = weedAt(garden, cell.cx, cell.cy);
      if (weed >= 0) garden = pull(garden, weed);
    }
  }

  function syncPlants(): void {
    const seen = new Set<string>();
    garden.plants.forEach((plant, i) => {
      const id = `${plant.cx},${plant.cy}`;
      seen.add(id);
      // Rebuild only when the look actually changes, not every frame: stage,
      // death and a coarse growth step are the only things the mesh depends on.
      const key = `${plant.species}|${stageOf(plant)}|${plant.dead}|${Math.round(plant.growth * 12)}|${Math.round(plant.rot * 4)}|${Math.round(plant.thirst * 4)}`;
      const existing = plantMeshes.get(id);
      if (existing?.key === key) return;
      if (existing) plantLayer.remove(existing.object);
      const object = buildPlant(plant);
      const at = cellToWorld(garden, plant.cx, plant.cy);
      object.position.set(at.x, 0, at.z);
      object.rotation.y = (i * 2.399) % (Math.PI * 2);
      plantLayer.add(object);
      plantMeshes.set(id, { object, key });
    });
    for (const [id, entry] of plantMeshes) {
      if (seen.has(id)) continue;
      plantLayer.remove(entry.object);
      plantMeshes.delete(id);
    }
  }

  function syncWeeds(): void {
    const seen = new Set<string>();
    for (const weed of garden.weeds) {
      const id = `${weed.cx},${weed.cy}`;
      seen.add(id);
      let mesh = weedMeshes.get(id);
      if (!mesh) {
        mesh = buildWeed();
        const at = cellToWorld(garden, weed.cx, weed.cy);
        mesh.position.set(at.x, 0, at.z);
        weedLayer.add(mesh);
        weedMeshes.set(id, mesh);
      }
      mesh.scale.setScalar(0.35 + weed.size * 0.85);
    }
    for (const [id, mesh] of weedMeshes) {
      if (seen.has(id)) continue;
      weedLayer.remove(mesh);
      weedMeshes.delete(id);
    }
  }

  function simulate(dt: number): void {
    clock += dt;

    const target = hit();
    if (target) hand.copy(target.point);
    hovered = target ? toolFor(target.object) : null;

    // Spring-damped, underdamped: the tool trails your hand and overshoots it.
    const toHand = hand.clone().sub(held.pos).multiplyScalar(PULL_K);
    const damping = held.vel.clone().multiplyScalar(DRAG_K);
    held.vel.add(toHand.sub(damping).multiplyScalar(dt));
    held.pos.add(held.vel.clone().multiplyScalar(dt));

    if (garden.ending !== null) {
      // Put the tool down when the season closes: the last frame should be the
      // garden you ended up with, not a watering can hanging over it.
      holding = null;
      endingFade = Math.min(1, endingFade + dt * 1.2);
    } else if (acting) {
      const point = target?.point;
      if (point) useTool(point, dt, false);
    }

    water.step(dt, garden, (cx, cy, amount) => {
      garden = pour(garden, cx, cy, amount);
    });

    garden = step(garden, dt);
  }

  function frame(now: number): void {
    if (last === 0) last = now;
    accumulator = Math.min(MAX_CATCHUP, accumulator + (now - last) / 1000);
    last = now;
    while (accumulator >= FIXED_DT) {
      simulate(FIXED_DT);
      accumulator -= FIXED_DT;
    }

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width > 0 && height > 0) {
      stage.resize(width, height);
      const centre =
        stage.view.edge === "long"
          ? new Vector3(0, BENCH_Y, BENCH_Z)
          : new Vector3(BED_W / 2 + 0.24, BENCH_Y, 0);
      const half = stage.visibleHalfWidthAt(centre);
      if (Math.abs(half - benchWidth) > 0.001 || benchEdge !== stage.view.edge) {
        benchWidth = half;
        benchEdge = stage.view.edge;
        layoutBench(bench, half, stage.view.edge);
      }
    }

    stage.setSeason(garden.t / SEASON_S);
    ground.update(garden);
    syncPlants();
    syncWeeds();

    // The held tool rides in your hand; everything else stays on the bench.
    for (const tool of bench.tools) {
      if (holding?.id === tool.id) {
        // The tools live on the board, and the board swings round to whichever
        // edge you're standing at — so the hand position, which is in world
        // space, has to come back into the board's frame or the held tool flies
        // off sideways.
        const towardsPlayer = stage.view.edge === "long" ? [0, 0.04] : [0.04, 0];
        const at = new Vector3(
          held.pos.x + (towardsPlayer[0] ?? 0),
          held.pos.y + 0.16,
          held.pos.z + (towardsPlayer[1] ?? 0),
        );
        tool.object.position.copy(bench.group.worldToLocal(at));
        // Sideways, as the player sees it: across the frame, not across the bed.
        const sway = stage.view.edge === "long" ? held.vel.x : held.vel.z;
        tool.object.rotation.z = Math.max(-0.9, Math.min(0.9, -sway * 0.06));
      } else {
        // The one under the pointer lifts off the board, the way a thing you
        // are reaching for does. With the cursor hidden and no tool in hand
        // there was nothing at all to say which of the seven you were about to
        // pick up.
        const reach = hovered?.id === tool.id && garden.ending === null ? 0.02 : 0;
        tool.object.position.set(tool.home.x, tool.home.y + reach, tool.home.z);
        tool.object.rotation.z = tool.id === "trowel" ? 0.35 : 0;
      }
    }

    // Where the work will land, so a first press isn't a blind guess. It is a
    // shadow on the soil, not a cursor: no chrome, nothing to read.
    const cell = worldToCell(garden, held.pos.x, held.pos.z);
    marker.visible = cell !== null && garden.ending === null;
    if (cell) {
      const at = cellToWorld(garden, cell.cx, cell.cy);
      marker.position.set(at.x, 0.004, at.z);
      marker.scale.set(1, 0.12, 1);
      const ready =
        holding?.id.startsWith("seed:") === true
          ? holeAt(garden, cell.cx, cell.cy) >= 0
          : plantAt(garden, cell.cx, cell.cy) < 0;
      (marker.material as MeshStandardMaterial).opacity = ready ? 0.5 : 0.16;
    }

    // The one hint in the game: if nobody has touched anything, the trowel
    // lifts and settles, which says "these come off the bench" without a word.
    if (!hasActed && clock > 3.5) {
      const trowel = bench.tools.find((t) => t.id === "trowel");
      if (trowel) trowel.object.position.y = trowel.home.y + Math.abs(Math.sin(clock * 1.6)) * 0.07;
    }

    canvas.classList.toggle("holding", holding !== null);

    stage.renderer.render(stage.scene, stage.camera);
    requestAnimationFrame(frame);
  }

  // Dev-only handle so the rendered scene can be interrogated instead of
  // guessed at. Stripped from the production bundle by the `import.meta.env.DEV`
  // branch, so it never ships.
  if (import.meta.env.DEV) {
    // Page coordinates, not canvas coordinates. The canvas sits below a header,
    // so a probe that reported canvas-relative pixels sent every scripted press
    // ~55px high — which only showed up once the hit targets got small enough
    // to miss.
    const onPage = (v: Vector3): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      const p = v.clone().project(stage.camera);
      return [
        Math.round(rect.left + ((p.x + 1) / 2) * rect.width),
        Math.round(rect.top + ((1 - p.y) / 2) * rect.height),
      ];
    };
    Object.assign(globalThis, {
      __beside: () => ({
        holding: holding?.id ?? null,
        plants: garden.plants.length,
        weeds: garden.weeds.length,
        holes: garden.holes.map((h) => `${h.cx},${h.cy}@${h.depth.toFixed(2)}`),
        wettest: Math.max(...Array.from(garden.moisture)).toFixed(2),
        t: garden.t.toFixed(1),
        ending: garden.ending,
        soil: (() => {
          let best = -1;
          let bi = 0;
          for (let i = 0; i < garden.moisture.length; i += 1) {
            const v = garden.moisture[i] ?? 0;
            if (v > best) {
              best = v;
              bi = i;
            }
          }
          const cx = bi % garden.w;
          const cy = Math.floor(bi / garden.w);
          const map = (ground.mesh.material as { map?: { image?: HTMLCanvasElement } }).map;
          const img = map?.image;
          if (!img) return "no map";
          const c = img.getContext("2d");
          if (!c) return "no ctx";
          const px = (x: number, y: number) => {
            const d = c.getImageData(Math.round(x), Math.round(y), 1, 1).data;
            return `${d[0]},${d[1]},${d[2]}`;
          };
          // Canvas row order is flipped relative to cell rows, same as the write.
          const u = ((cx + 0.5) / garden.w) * img.width;
          const v = ((garden.h - 1 - cy + 0.5) / garden.h) * img.height;
          return {
            wettestCell: `${cx},${cy}=${best.toFixed(2)}`,
            atWettest: px(u, v),
            dryCorner: px(img.width * 0.06, img.height * 0.06),
            // Where that cell lands on screen, so a screenshot can be sampled.
            screen: (() => {
              const at = cellToWorld(garden, cx, cy);
              return onPage(new Vector3(at.x, 0, at.z));
            })(),
          };
        })(),
        // Where the bed's four corners land, so "does it fit" is measured
        // rather than eyeballed.
        frame: (() => {
          const to = (x: number, z: number) => onPage(new Vector3(x, 0, z));
          const a = cellToWorld(garden, 0, 0);
          const b = cellToWorld(garden, garden.w - 1, garden.h - 1);
          return {
            view: [canvas.clientWidth, canvas.clientHeight],
            farLeft: to(a.x, b.z),
            farRight: to(b.x, b.z),
            nearLeft: to(a.x, a.z),
            nearRight: to(b.x, a.z),
          };
        })(),
        // Screen positions of the bench items, so a test can press them
        // without hunting pixels.
        at: Object.fromEntries(
          bench.tools.map((tool) => [
            tool.id,
            onPage(new Vector3().setFromMatrixPosition(tool.pad.matrixWorld)),
          ]),
        ),
        // Any cell's centre in page pixels, so a scripted press can aim at a
        // cell rather than at a guess.
        cell: (cx: number, cy: number) => {
          const at = cellToWorld(garden, cx, cy);
          return onPage(new Vector3(at.x, 0, at.z));
        },
      }),
    });
  }

  requestAnimationFrame(frame);
}
