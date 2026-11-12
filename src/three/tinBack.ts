import * as THREE from 'three';
import { rimGeometry, roundedShape } from './modelGeometry';

/** A pressed tin back with a rolled seam and a closed spring safety pin. */
export function createTinBack(radius: number): { model: THREE.Group; disposables: { dispose(): void }[] } {
  const model = new THREE.Group();
  model.name = 'pressed-tin-back';
  const disposables: { dispose(): void }[] = [];
  // Fine, deterministic rolling grain changes the reflection, not the steel's colour.
  const grain = new Uint8Array(256 * 256 * 4);
  let seed = 17;
  for (let y = 0; y < 256; y++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const row = (seed >>> 24) / 255;
    for (let x = 0; x < 256; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const value = 206 + row * 30 + (seed >>> 24) / 255 * 16;
      const i = (y * 256 + x) * 4;
      grain[i] = grain[i + 1] = grain[i + 2] = value;
      grain[i + 3] = 255;
    }
  }
  const grainMap = new THREE.DataTexture(grain, 256, 256);
  grainMap.wrapS = grainMap.wrapT = THREE.RepeatWrapping;
  grainMap.repeat.set(2, 4);
  grainMap.needsUpdate = true;
  const steel = new THREE.MeshPhysicalMaterial({
    color: 0xb8bdc3, metalness: 1, roughness: 0.4, roughnessMap: grainMap,
    anisotropy: 0.45, anisotropyRotation: Math.PI / 2, side: THREE.DoubleSide,
  });
  const polished = new THREE.MeshStandardMaterial({ color: 0xd1d4d8, metalness: 1, roughness: 0.19 });
  const seam = new THREE.MeshStandardMaterial({ color: 0x62676d, metalness: 1, roughness: 0.48, side: THREE.DoubleSide });
  disposables.push(steel, polished, seam, grainMap);

  function add(name: string, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.position.set(x, y, z);
    model.add(mesh);
    disposables.push(geo);
    return mesh;
  }

  // The centre is recessed toward the face; the rolled perimeter stands proud of it.
  add('rolled-back-seam', rimGeometry(0.5, 0.5, radius, [
    [0.001, -0.018], [0.002, -0.031], [0.008, -0.041],
    [0.017, -0.045], [0.027, -0.042], [0.035, -0.032],
    [0.043, -0.022], [0.06, -0.012],
  ]), steel);
  add('crimp-joint', rimGeometry(0.5, 0.5, radius, [[0.041, -0.023], [0.044, -0.0215]]), seam);
  const dish = new THREE.ExtrudeGeometry(roundedShape(0.447, 0.447, Math.max(0.004, radius - 0.053)), {
    depth: 0.005, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 3, curveSegments: 24,
  });
  add('recessed-backplate', dish, steel, 0, 0, -0.018);

  // Welded seats, rather than screws. Their raised ends support the wire clear of the backplate.
  for (const x of [-0.252, 0.252]) {
    const seat = new THREE.ExtrudeGeometry(roundedShape(0.052, 0.066, 0.018), {
      depth: 0.009, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 3,
    });
    add('pin-welded-seat', seat, steel, x, 0.075, -0.036);
    for (const y of [0.035, 0.115]) {
      add('spot-weld', new THREE.SphereGeometry(0.011, 12, 8), steel, x, y, -0.041).scale.set(1, 0.65, 0.18);
    }
  }

  function wire(name: string, points: THREE.Vector3[], width = 0.006): void {
    const path = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    add(name, new THREE.TubeGeometry(path, Math.max(32, points.length * 3), width, 10, false), polished);
  }
  // A helical spring at the hinge, with the lower return arm and upper needle.
  const coil: THREE.Vector3[] = [];
  for (let i = 0; i <= 96; i++) {
    const t = i / 96;
    const angle = t * Math.PI * 4.5;
    coil.push(new THREE.Vector3(-0.276 + t * 0.045, 0.075 + Math.cos(angle) * 0.021, -0.079 + Math.sin(angle) * 0.021));
  }
  wire('pin-spring', coil);
  wire('pin-return-arm', [coil[0]!, new THREE.Vector3(-0.27, 0.035, -0.063), new THREE.Vector3(-0.18, 0.03, -0.067), new THREE.Vector3(0.23, 0.03, -0.067), new THREE.Vector3(0.273, 0.052, -0.078)]);
  wire('pin-needle', [coil[96]!, new THREE.Vector3(-0.20, 0.078, -0.105), new THREE.Vector3(0.12, 0.078, -0.105), new THREE.Vector3(0.263, 0.078, -0.098)], 0.0055);
  // Folded sheet-metal catch: the tip tucks beneath its lip.
  const hook = new THREE.Shape();
  hook.moveTo(-0.027, 0); hook.lineTo(-0.027, -0.041);
  hook.quadraticCurveTo(-0.027, -0.068, -0.007, -0.068);
  hook.lineTo(0.022, -0.068); hook.lineTo(0.022, -0.055);
  hook.lineTo(-0.004, -0.055); hook.quadraticCurveTo(-0.013, -0.055, -0.013, -0.039);
  hook.lineTo(-0.013, 0); hook.closePath();
  const catchGeo = new THREE.ExtrudeGeometry(hook, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2 });
  catchGeo.rotateX(Math.PI / 2);
  add('pin-catch', catchGeo, polished, 0.258, 0.095, -0.037);
  const hinge = new THREE.CylinderGeometry(0.012, 0.012, 0.065, 16);
  hinge.rotateZ(Math.PI / 2);
  add('pin-hinge', hinge, steel, -0.254, 0.075, -0.079);
  for (const x of [-0.289, -0.219]) {
    add('hinge-support', new THREE.BoxGeometry(0.012, 0.04, 0.043), steel, x, 0.075, -0.057);
  }
  return { model, disposables };
}
