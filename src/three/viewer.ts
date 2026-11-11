/**
 * 3D preview (lazy-loaded chunk; the 2D app never imports three.js directly).
 *
 * Tin badge: a height-field face (rolled rim + gentle dome) with the print as
 * texture and a clear-coat, a brushed-metal back. Acrylic: a thick extruded
 * plate with a real drill hole, physical transmission/IOR/dispersion, and the
 * print sitting on its back face. A studio environment map makes highlights
 * slide across the surface as you drag.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ACRYLIC_FACE, ACRYLIC_HOLE, BADGE_FACE, DESIGN } from '../render/geometry';
import { ACRYLIC_LIGHT } from '../render/lighting';
import { faceUv, projectToRoundedRect, roundedRectSdf, tinHeight, type TinShape } from './geometry3d';

export interface ViewerInput {
  /** print-only render on the 960 design canvas (any resolution, square) */
  print: HTMLCanvasElement;
  /** acrylic: alpha footprint of the printed art panel (where the back white ink is) */
  inkMask?: HTMLCanvasElement;
  style: 'rounded' | 'square' | 'acrylic';
  /** design-space corner radius of the badge face */
  radius: number;
  hole: boolean;
  /** 0…1 from the 弧面强度 slider */
  bevel: number;
  /** 0…0.6 from 表面高光 */
  gloss: number;
  background: string;
}

export interface Viewer {
  update(input: ViewerInput): void;
  resetView(): void;
  flip(): void;
  dispose(): void;
  /** for tests */
  readonly info: { frames: number; triangles: number; style: string; camera: number[] };
}

const isSmall = () => Math.min(window.innerWidth, window.innerHeight) < 700;

function roundedShape(hx: number, hy: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-hx + r, -hy);
  s.lineTo(hx - r, -hy);
  s.quadraticCurveTo(hx, -hy, hx, -hy + r);
  s.lineTo(hx, hy - r);
  s.quadraticCurveTo(hx, hy, hx - r, hy);
  s.lineTo(-hx + r, hy);
  s.quadraticCurveTo(-hx, hy, -hx, hy - r);
  s.lineTo(-hx, -hy + r);
  s.quadraticCurveTo(-hx, -hy, -hx + r, -hy);
  return s;
}

function tinFaceGeometry(shape: TinShape, seg: number, face: typeof BADGE_FACE): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(shape.hx * 2, shape.hy * 2, seg, seg);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    if (roundedRectSdf(x, y, shape.hx, shape.hy, shape.r) > 0) [x, y] = projectToRoundedRect(x, y, shape.hx, shape.hy, shape.r);
    pos.setXYZ(i, x, y, tinHeight(x, y, shape));
    const [u, v] = faceUv(x, y, shape.hx, shape.hy, face, DESIGN);
    uv.setXY(i, u, v);
  }
  g.computeVertexNormals();
  return g;
}

/** soft round shadow texture for the floor */
function shadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(40,54,76,.32)');
  g.addColorStop(0.45, 'rgba(40,54,76,.14)');
  g.addColorStop(1, 'rgba(40,54,76,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

export function createViewer(host: HTMLElement, first: ViewerInput): Viewer {
  const small = isSmall();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 2 : 1.75));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = 'none';

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.9;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-2.2, 2.8, 3.2);
  scene.add(key, new THREE.HemisphereLight(0xffffff, 0xcfd8e4, 0.35));

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 0.5),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.64;
  scene.add(floor);

  const pivot = new THREE.Group();
  scene.add(pivot);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.enablePan = false;
  controls.rotateSpeed = small ? 0.9 : 0.7;
  controls.minDistance = 1.3;
  controls.maxDistance = 4.5;
  controls.minPolarAngle = Math.PI * 0.18;
  controls.maxPolarAngle = Math.PI * 0.78;

  let texture: THREE.CanvasTexture | null = null;
  let disposables: { dispose(): void }[] = [];
  const info = { frames: 0, triangles: 0, style: '', camera: [] as number[] };

  function clearModel(): void {
    for (const d of disposables) d.dispose();
    disposables = [];
    pivot.clear();
  }

  function build(input: ViewerInput): void {
    clearModel();
    scene.background = new THREE.Color(input.background);
    texture?.dispose();
    texture = new THREE.CanvasTexture(input.print);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    info.style = input.style;
    if (input.style === 'acrylic') buildAcrylic(input, texture);
    else buildTin(input, texture);
    info.triangles = 0;
    pivot.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry.index) info.triangles += m.geometry.index.count / 3;
      else if (m.isMesh) info.triangles += (m.geometry.attributes.position as THREE.BufferAttribute).count / 3;
    });
  }

  function buildTin(input: ViewerInput, map: THREE.Texture): void {
    const f = BADGE_FACE;
    const hx = 0.5;
    const hy = 0.5;
    const r = (input.style === 'square' ? 6 : input.radius) / f.w;
    const sq = input.style === 'square';
    // 直角吧唧 has a flat face and a tight rim; the rounded one is gently domed
    const shape: TinShape = sq
      ? { hx, hy, r: Math.max(0.004, r), roll: 0.022, rimH: 0.026, domeH: 0.002 + 0.004 * input.bevel }
      : { hx, hy, r: Math.max(0.004, r), roll: 0.045, rimH: 0.03 + 0.012 * input.bevel, domeH: 0.008 + 0.022 * input.bevel };
    const geo = tinFaceGeometry(shape, small ? 140 : 200, f);
    const mat = new THREE.MeshPhysicalMaterial({
      map,
      roughness: 0.42 - input.gloss * 0.4,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.14 - input.gloss * 0.15,
      specularIntensity: 0.6,
    });
    const side = 0.05; // rolled wall depth behind the rim
    const face = new THREE.Mesh(geo, mat);
    face.position.z = side / 2;
    // wall + back: extruded outline; the print streaks over the wall like a real roll-over
    const wallGeo = new THREE.ExtrudeGeometry(roundedShape(hx, hy, shape.r), { depth: side, bevelEnabled: false, curveSegments: 24 });
    wallGeo.translate(0, 0, -side / 2);
    const wuv = wallGeo.attributes.uv as THREE.BufferAttribute;
    const wpos = wallGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < wpos.count; i++) {
      const [u, v] = faceUv(wpos.getX(i), wpos.getY(i), hx, hy, f, DESIGN);
      wuv.setXY(i, u, v);
    }
    const wallMat = sq
      ? new THREE.MeshStandardMaterial({ color: 0xdfe4ea, metalness: 1, roughness: 0.22 }) // reflective metal edge
      : new THREE.MeshPhysicalMaterial({ map, roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.2, color: 0xe6e6e6 });
    const backMat = new THREE.MeshStandardMaterial({ color: 0xd8dde3, metalness: 1, roughness: 0.38 });
    // ExtrudeGeometry groups: 0 = caps (front cap hidden under the face), 1 = sides
    const wall = new THREE.Mesh(wallGeo, [backMat, wallMat]);
    pivot.add(face, wall);
    disposables.push(geo, mat, wallGeo, wallMat, backMat);
  }

  function buildAcrylic(input: ViewerInput, map: THREE.Texture): void {
    const f = ACRYLIC_FACE;
    const hx = 0.5;
    const hy = 0.5;
    const r = ACRYLIC_LIGHT.radius / f.w;
    const T = 0.075; // ≈ 3–4 mm on a 50 mm plate, a bit exaggerated so it reads
    const bevel = 0.006;
    const outline = roundedShape(hx - bevel, hy - bevel, Math.max(0.002, r - bevel));
    const holeX = -hx + ACRYLIC_HOLE.dx / f.w;
    const holeY = -hy + ACRYLIC_HOLE.dy / f.w;
    const holeR = (ACRYLIC_HOLE.r + ACRYLIC_LIGHT.hole.wall) / f.w;
    if (input.hole) {
      const h = new THREE.Path();
      h.absarc(holeX, holeY, holeR + bevel, 0, Math.PI * 2, true);
      outline.holes.push(h);
    }
    const geo = new THREE.ExtrudeGeometry(outline, { depth: T - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 24 });
    geo.translate(0, 0, -T / 2 + bevel);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.03 + (0.6 - input.gloss) * 0.03,
      transmission: 1,
      thickness: T,
      ior: 1.49,
      dispersion: 1.2,
      attenuationColor: new THREE.Color(0xe4f5f3),
      attenuationDistance: 0.9,
      specularIntensity: 1,
      envMapIntensity: 1.1,
    });
    const plate = new THREE.Mesh(geo, mat);

    // The print, on the back face inside the plate, seen through the acrylic.
    const printShape = roundedShape(hx - 0.002, hy - 0.002, Math.max(0.002, r - 0.002));
    if (input.hole) {
      const h = new THREE.Path();
      h.absarc(holeX, holeY, holeR, 0, Math.PI * 2, true);
      printShape.holes.push(h);
    }
    const pGeo = new THREE.ShapeGeometry(printShape, 24);
    const pos = pGeo.attributes.position as THREE.BufferAttribute;
    const uv = pGeo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const [u, v] = faceUv(pos.getX(i), pos.getY(i), hx, hy, f, DESIGN, 1);
      uv.setXY(i, u, v);
    }
    const pMat = new THREE.MeshStandardMaterial({ map, roughness: 0.6, metalness: 0 });
    const print = new THREE.Mesh(pGeo, pMat);
    print.position.z = -T / 2 + 0.004;
    // Back-printed plate seen from behind: a crisp, flat, slightly translucent
    // white-ink layer exactly under the art panel (mirrored by BackSide), with
    // clear acrylic around it. It sits just outside the back face so it blends
    // over the transmissive plate instead of being hidden inside it.
    const backTex = new THREE.CanvasTexture(backPrintCanvas(input.print, input.inkMask));
    backTex.colorSpace = THREE.SRGBColorSpace;
    backTex.anisotropy = map.anisotropy;
    const wMat = new THREE.MeshStandardMaterial({ map: backTex, transparent: true, depthWrite: false, roughness: 0.8, metalness: 0, side: THREE.BackSide });
    const white = new THREE.Mesh(pGeo, wMat);
    white.position.z = -T / 2 - 0.0008;
    white.renderOrder = 2;
    pivot.add(print, white, plate);
    disposables.push(geo, mat, pGeo, pMat, wMat, backTex);
  }

  function resize(): void {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px';
    renderer.domElement.style.height = h + 'px';
    camera.aspect = w / h;
    // keep the plate fully in view on tall phones: widen the vertical FOV
    // instead of backing off, so the badge fills the screen width.
    const dist = 2.6;
    const half = 0.72 / dist; // tan of the half-angle that fits ±0.72 (plate + margin)
    camera.fov = (2 * Math.atan(camera.aspect < 1 ? Math.min(Math.tan((65 * Math.PI) / 360), half / camera.aspect) : half) * 180) / Math.PI;
    if (!userMoved) camera.position.setLength(dist);
    camera.updateProjectionMatrix();
    dirty = true;
  }

  let userMoved = false;
  let dirty = true;
  let flipTarget = 0;
  let flipCur = 0;
  let intro = 0;
  function resetView(): void {
    camera.position.set(0.5, 0.3, 2.5);
    controls.target.set(0, 0, 0);
    userMoved = false;
    flipTarget = 0;
    intro = performance.now();
    resize();
  }
  controls.addEventListener('start', () => {
    userMoved = true;
    intro = 0;
  });
  controls.addEventListener('change', () => (dirty = true));

  let raf = 0;
  let last = performance.now();
  function loop(now: number): void {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (document.hidden) return;
    let sway = 0;
    if (intro) {
      // gentle intro sway so the highlight visibly slides across the face
      const t = (now - intro) / 1000;
      if (t < 4) sway = Math.sin(t * 1.6) * 0.38 * (1 - t / 4);
      else intro = 0;
      dirty = true;
    }
    if (flipCur !== flipTarget) {
      flipCur += (flipTarget - flipCur) * (1 - Math.exp(-dt * 7));
      if (Math.abs(flipTarget - flipCur) < 1e-3) flipCur = flipTarget;
      dirty = true;
    }
    pivot.rotation.y = flipCur + sway;
    if (controls.update()) dirty = true;
    if (!dirty) return;
    dirty = false;
    renderer.render(scene, camera);
    info.frames++;
    info.camera = [...camera.position.toArray(), ...controls.target.toArray(), camera.fov].map((v) => Math.round(v * 1000) / 1000);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(host);
  build(first);
  resetView();
  raf = requestAnimationFrame(loop);

  return {
    info,
    update(input) {
      build(input);
      dirty = true;
    },
    resetView,
    flip() {
      intro = 0;
      dirty = true;
      flipTarget = flipTarget === 0 ? Math.PI : 0;
      dirty = true;
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      clearModel();
      texture?.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

/** Back white-ink colour (≈ #e6e6e8) and its opacity. */
export const BACK_INK = { rgb: [230, 230, 232] as const, opacity: 0.88, artHint: 0.04 };

/**
 * The back of a back-printed acrylic plate: the white-ink layer as a crisp
 * silhouette of the printed art panel (mask alpha, no blur), flat off-white,
 * ~88 % opaque, with at most a 4 % hint of the art's luminance. Outside the
 * mask the texture is fully transparent, so the clear acrylic margin stays clear.
 */
export function backPrintCanvas(print: HTMLCanvasElement, mask?: HTMLCanvasElement, size = Math.min(1024, print.width)): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const ctx = out.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(print, 0, 0, size, size);
  const art = ctx.getImageData(0, 0, size, size).data;
  let m: Uint8ClampedArray | null = null;
  if (mask) {
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(mask, 0, 0, size, size);
    m = ctx.getImageData(0, 0, size, size).data;
  }
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const [ir, ig, ib] = BACK_INK.rgb;
  for (let i = 0; i < d.length; i += 4) {
    const a = m ? m[i + 3]! / 255 : art[i + 3]! / 255;
    const lum = (0.299 * art[i]! + 0.587 * art[i + 1]! + 0.114 * art[i + 2]! - 128) * BACK_INK.artHint;
    d[i] = ir + lum;
    d[i + 1] = ig + lum;
    d[i + 2] = ib + lum;
    d[i + 3] = 255 * a * BACK_INK.opacity;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}
