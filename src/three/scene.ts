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
  Vector3,
  WebGLRenderer,
} from "three";
import { BED_D, BED_W } from "./ground";

export interface Stage {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly sun: DirectionalLight;
  resize(width: number, height: number): void;
  /** Half the width the frustum actually shows at a point in the world. */
  visibleHalfWidthAt(point: Vector3): number;
  /** Which edge of the bed the player is standing at, chosen by the viewport. */
  readonly view: { edge: Edge };
  /** 0..1 through the season: moves the sun and cools the light. */
  setSeason(t: number): void;
}

/**
 * The bed is wider than it is deep, so which edge you stand at decides whether
 * it fits the frame. On a wide screen you stand at the long side, as you would
 * at a raised bed. On a phone that same view crops a 2.6m bed to a strip, so
 * you stand at the short end and look down its length instead — the same bed,
 * the same rules, a footprint that matches the frame.
 */
export type Edge = "long" | "short";

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
  // Two jobs, and they pull against each other: the fog has to start beyond the
  // bed's far corner (~4.4m from either standing position) so the plot is never
  // hazy, and it has to finish soon after, or the surrounding ground stays
  // legible all the way to a hard horizon. Pulled in to 2.6m the far half of the
  // plot read as gloom; pushed out to 20m there was no sky at all.
  scene.fog = new Fog(0x9dbdd6, 5, 9.5);

  const camera = new PerspectiveCamera(52, 1, 0.05, 60);
  // Standing at the near edge, looking down into the bed. Far enough back
  // that the bench and the whole plot are in one frame, which they have to be:
  // a tool you can't see is a tool nobody will pick up.
  const AIM = new Vector3(0, 0.02, 0);
  const AIM_LONG = new Vector3(0, 0.02, -0.05);
  const view: { edge: Edge } = { edge: "long" };

  // What the frame has to contain, whatever the viewport: the bed with a
  // margin, the top of a grown shrub at the far row, and the outer edge of the
  // bench. The FOV is solved from these rather than picked by hand — a
  // hand-picked FOV was right at 1920x1080 and cropped the bed at 390x844,
  // which is half the mark.
  function fitPoints(edge: Edge): Vector3[] {
    const x = BED_W / 2 + 0.1;
    const z = BED_D / 2 + 0.1;
    const points = [
      new Vector3(x, 0, z),
      new Vector3(-x, 0, z),
      new Vector3(x, 0, -z),
      new Vector3(-x, 0, -z),
    ];
    if (edge === "long") {
      points.push(new Vector3(0, 0.95, -BED_D / 2), new Vector3(0, 0.06, BED_D / 2 + 0.45));
    } else {
      points.push(new Vector3(-BED_W / 2, 0.95, 0), new Vector3(BED_W / 2 + 0.45, 0.06, 0));
    }
    return points;
  }

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

    // Stand at the long side on a wide screen, at the short end on a tall one.
    view.edge = height > width ? "short" : "long";

    if (view.edge === "long") {
      // Hand-framed, and left alone. Fitting this view automatically pitched the
      // camera down until the sky left the top of the frame and the bed sat in a
      // field of grass — correct by the solver's measure, worse by eye. The
      // solver earns its place on the short edge, where no hand-picked FOV works
      // across both viewports.
      camera.position.set(0, 1.62, BED_D / 2 + 1.3);
      camera.lookAt(AIM_LONG);
      camera.fov = 52;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      return;
    }

    // Higher on a phone, and leaning in. A view from standing height cannot
    // fill a tall frame with soil at any FOV — a ground plane seen from 1.6m
    // compresses towards the horizon, so the bed came out as a 176px band under
    // a screenful of sky. Leaning over the bed is also what you actually do
    // when you plant something.
    camera.position.set(BED_W / 2 + 0.6, 2.5, 0);
    camera.lookAt(AIM);
    camera.updateMatrixWorld(true);
    const FIT = fitPoints(view.edge);

    // Pitch until the content sits centred in the frame. Solving the FOV alone
    // gave a correct fit that framed the bed along the bottom edge under half a
    // screen of empty sky — the frustum was centred on the horizon, not on the
    // thing being played.
    for (let pass = 0; pass < 3; pass += 1) {
      let lowest = Infinity;
      let highest = -Infinity;
      for (const point of FIT) {
        const local = camera.worldToLocal(point.clone());
        const ratio = local.y / Math.max(0.1, -local.z);
        lowest = Math.min(lowest, ratio);
        highest = Math.max(highest, ratio);
      }
      camera.rotateX(Math.atan((lowest + highest) / 2));
      camera.updateMatrixWorld(true);
    }

    // Then the smallest vertical FOV that still contains every FIT point,
    // horizontally (via the aspect) and vertically, with a little margin.
    let tan = 0;
    for (const point of FIT) {
      const local = camera.worldToLocal(point.clone());
      const depth = Math.max(0.1, -local.z);
      tan = Math.max(tan, Math.abs(local.y) / depth, Math.abs(local.x) / depth / camera.aspect);
    }
    camera.fov = Math.min(96, Math.max(38, (Math.atan(tan * 1.04) * 360) / Math.PI));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }

  function visibleHalfWidthAt(point: Vector3): number {
    const local = camera.worldToLocal(point.clone());
    const depth = Math.max(0.1, -local.z);
    return Math.tan((camera.fov * Math.PI) / 360) * depth * camera.aspect;
  }

  function setSeason(t: number): void {
    const k = Math.min(1, Math.max(0, t));
    // The sun crosses and drops. By frost it is low and cold, and the shadows
    // are long — the season told as light, with nothing written down.
    const sweep = -1.5 + k * 3.0;
    const far = -2.9 + k * 0.5;
    // Across the frame, and away from the player — the specular lobe that makes
    // damp soil legible only reaches a viewer the light is opposite.
    // The sun drops, but not far. Taken down to 0.7 of its height the shadows
    // stretched the length of the bed and every plant lay across its own soil,
    // which read as dusk at midsummer rather than as a season turning.
    const height = 2.9 - k * 0.75;
    if (view.edge === "long") sun.position.set(sweep, height, far);
    else sun.position.set(far, height, sweep);
    sun.intensity = 3.0 - k * 0.55;
    sun.color.setHSL(0.11 - k * 0.025, 0.4 + k * 0.14, 0.63 - k * 0.03);
    sky.intensity = 1.4 - k * 0.18;

    const haze = new Color(0x9dbdd6).lerp(new Color(0xb9c4cc), k);
    scene.background = haze;
    if (scene.fog) (scene.fog as Fog).color.copy(haze);
  }

  return { renderer, scene, camera, sun, view, resize, visibleHalfWidthAt, setSeason };
}
