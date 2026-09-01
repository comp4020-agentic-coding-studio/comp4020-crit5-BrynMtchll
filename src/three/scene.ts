// Camera, light and air. The camera stands where a person tending this bed
// would stand — about 1.5m up, a stride back, looking down at the soil — and
// it does not move under the player's control. A look control would be a
// second thing to teach without words, and there is nothing behind you.

import {
  ACESFilmicToneMapping,
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PCFShadowMap,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { BED_D, BED_W } from "./ground";

export interface Stage {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly sun: DirectionalLight;
  resize(width: number, height: number): void;
  /** 0..1 through the season: moves the sun and cools the light. */
  setSeason(t: number): void;
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  // Filmic tone mapping and an sRGB output buffer: without both, a lit scene
  // reads as flat washed plastic, and no amount of material tweaking fixes it.
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  scene.background = new Color(0x9dbdd6);
  scene.fog = new Fog(0x9dbdd6, 2.6, 9.5);

  const camera = new PerspectiveCamera(52, 1, 0.05, 60);
  // Standing at the near edge, looking down into the bed. Far enough back
  // that the bench and the whole plot are in one frame, which they have to be:
  // a tool you can't see is a tool nobody will pick up.
  camera.position.set(0, 1.62, BED_D / 2 + 1.3);
  camera.lookAt(0, 0.02, -0.05);

  // Deliberately on the far side of the bed rather than behind the camera.
  // Wet soil is legible because it reflects — and a specular lobe only reaches
  // the viewer when the light is roughly opposite them. Lit from behind, damp
  // ground is merely a darker brown, which is a stain, not water.
  const sun = new DirectionalLight(0xfff2d8, 2.9);
  sun.position.set(-1.5, 2.3, -2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 14;
  sun.shadow.camera.left = -3;
  sun.shadow.camera.right = 3;
  sun.shadow.camera.top = 3;
  sun.shadow.camera.bottom = -3;
  // Shadow acne on a near-flat plane lit at a low angle; a small normal bias
  // beats a depth bias here because it doesn't detach the contact shadows.
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.012;
  scene.add(sun);
  scene.add(sun.target);

  // A weak fill from the camera side. With the key light opposite, every
  // surface facing the player was reading as silhouette; this lifts them
  // without touching the specular that makes wet soil legible.
  const fill = new DirectionalLight(0xdCE8f4, 0.5);
  fill.position.set(1.6, 1.4, 3.2);
  scene.add(fill);

  const sky = new HemisphereLight(0xcfe4f2, 0x7a6448, 1.35);
  scene.add(sky);

  // The ground the bed sits in. Bigger than the bed and fogged out, so the
  // scene has a horizon rather than an edge.
  const surrounds = new Mesh(
    new PlaneGeometry(60, 60),
    new MeshStandardMaterial({ color: 0x8b9070, roughness: 0.97 }),
  );
  surrounds.rotation.x = -Math.PI / 2;
  surrounds.position.y = -0.16;
  surrounds.receiveShadow = true;
  scene.add(surrounds);

  // The bed's timber edging, as real boxes rather than planes: it is what
  // makes the soil read as a raised bed rather than a rectangle of dirt
  // painted on a lawn, and it catches the sun along the near rim.
  const timber = new MeshStandardMaterial({ color: 0x86694b, roughness: 0.82 });
  const RIM_H = 0.19;
  const RIM_T = 0.06;
  for (const side of [-1, 1]) {
    const long = new Mesh(new BoxGeometry(BED_W + RIM_T * 2, RIM_H, RIM_T), timber);
    long.position.set(0, -RIM_H / 2 + 0.035, side * (BED_D / 2 + RIM_T / 2));
    long.castShadow = true;
    long.receiveShadow = true;
    scene.add(long);

    const short = new Mesh(new BoxGeometry(RIM_T, RIM_H, BED_D), timber);
    short.position.set(side * (BED_W / 2 + RIM_T / 2), -RIM_H / 2 + 0.035, 0);
    short.castShadow = true;
    short.receiveShadow = true;
    scene.add(short);
  }

  function resize(width: number, height: number): void {
    renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // A phone is much taller than it is wide, so a fixed horizontal field of
    // view crops the bed to a strip. Widening the vertical FOV on tall frames
    // keeps the whole bed and the bench in shot at 390x844.
    camera.fov = height > width ? 74 : 52;
    camera.updateProjectionMatrix();
  }

  function setSeason(t: number): void {
    const k = Math.min(1, Math.max(0, t));
    // The sun crosses and drops. By frost it is low and cold, and the shadows
    // are long — the season told as light, with nothing written down.
    const angle = -1.5 + k * 3.0;
    sun.position.set(angle, 2.3 - k * 1.6, -2.6 + k * 0.5);
    sun.intensity = 2.9 - k * 1.25;
    sun.color.setHSL(0.11 - k * 0.03, 0.42 + k * 0.16, 0.62 - k * 0.06);
    sky.intensity = 1.35 - k * 0.35;

    const haze = new Color(0x9dbdd6).lerp(new Color(0xc3c8cf), k);
    scene.background = haze;
    if (scene.fog) (scene.fog as Fog).color.copy(haze);
  }

  return { renderer, scene, camera, sun, resize, setSeason };
}
