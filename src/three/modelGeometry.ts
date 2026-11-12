import * as THREE from 'three';

export function roundedShape(hx: number, hy: number, r: number): THREE.Shape {
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

/** Sweep a closed cross-section around a rounded rectangle, with real rolled normals. */
export function rimGeometry(hx: number, hy: number, radius: number, profile: readonly (readonly [number, number])[]): THREE.BufferGeometry {
  const segments = 192;
  const vertices: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row < profile.length; row++) {
    const [inset, z] = profile[row]!;
    const points = roundedShape(hx - inset, hy - inset, Math.max(0.001, radius - inset)).getSpacedPoints(segments);
    points.forEach((p, i) => {
      vertices.push(p.x, p.y, z);
      uv.push(i / segments, row / (profile.length - 1));
    });
    if (row === 0) continue;
    for (let i = 0; i < segments; i++) {
      const a = (row - 1) * (segments + 1) + i;
      const b = row * (segments + 1) + i;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
