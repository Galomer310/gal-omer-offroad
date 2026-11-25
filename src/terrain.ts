/**
 * The ground: one height function that the mesh, the physics collider, the
 * prop placement and the map all read, so they can never disagree about where
 * the sand is.
 */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import { AREA_POS, AREA_RING, CIRCUIT, COLORS, PLAY_RADIUS, SUMMIT, WORLD_HALF } from './config';

const SEGMENTS = 180; // 2 m between vertices

/* ---------------------------------------------------------------- circuit --- */
/** The circuit's centre line, as a closed loop of points. */
export function circuitPoints(n = 96): THREE.Vector2[] {
  const c = AREA_POS.circuit;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // A slightly squashed ellipse with a kink, so it is not a perfect oval.
    const wobble = 1 + 0.12 * Math.sin(a * 3);
    pts.push(new THREE.Vector2(c.x + Math.cos(a) * CIRCUIT.rx * wobble, c.z + Math.sin(a) * CIRCUIT.rz * wobble));
  }
  return pts;
}

const TRACK = circuitPoints(64);

function distToTrack(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < TRACK.length; i++) {
    const a = TRACK[i];
    const b = TRACK[(i + 1) % TRACK.length];
    const abx = b.x - a.x;
    const abz = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.y) * abz) / (abx * abx + abz * abz)));
    const dx = x - (a.x + abx * t);
    const dz = z - (a.y + abz * t);
    best = Math.min(best, dx * dx + dz * dz);
  }
  return Math.sqrt(best);
}

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/* ----------------------------------------------------------------- height --- */
function rawDunes(x: number, z: number): number {
  return (
    3.0 * Math.sin(x * 0.043 + Math.cos(z * 0.029) * 1.7) * Math.cos(z * 0.047) +
    1.5 * Math.sin((x + z) * 0.083) +
    0.7 * Math.sin(x * 0.17 - z * 0.13) +
    0.35 * Math.sin(x * 0.41 + z * 0.37)
  );
}

/**
 * Height of the ground at (x, z). Flat (y = 0) around every area and along the
 * circuit, dunes elsewhere, one summit, and hills past PLAY_RADIUS that keep
 * the car inside.
 */
export function heightAt(x: number, z: number): number {
  let h = rawDunes(x, z) + 1.2;

  const dx = x - SUMMIT.x;
  const dz = z - SUMMIT.z;
  h += SUMMIT.height * Math.exp(-(dx * dx + dz * dz) / (2 * SUMMIT.spread * SUMMIT.spread));

  // Flatten: 1 inside an area or on the track, fading out over ~14 m.
  let flat = 0;
  for (const p of Object.values(AREA_POS)) {
    const d = Math.hypot(x - p.x, z - p.z);
    flat = Math.max(flat, 1 - smooth(AREA_RING + 9, AREA_RING + 24, d));
  }
  flat = Math.max(flat, 1 - smooth(6, 16, distToTrack(x, z)));
  h *= 1 - flat;

  // A low rim of hills past the play area. Capped: uncapped, the corners of the
  // square rose hundreds of metres and filled the sky with sand walls. The car
  // is kept in by the fence in buildTerrain, not by the height of the rim.
  const r = Math.hypot(x, z);
  if (r > PLAY_RADIUS) h += 14 * smooth(PLAY_RADIUS, PLAY_RADIUS + 22, r);
  return h;
}

/* ------------------------------------------------------------------- mesh --- */
export interface Terrain {
  mesh: THREE.Mesh;
  /** Small top-down picture of the ground, for the map. */
  mapImage: HTMLCanvasElement;
}

export function buildTerrain(world: RAPIER.World): Terrain {
  const size = WORLD_HALF * 2;
  const geo = new THREE.PlaneGeometry(size, size, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const cLight = new THREE.Color(COLORS.sandLight);
  const cSand = new THREE.Color(COLORS.sand);
  const cDark = new THREE.Color(COLORS.sandDark);
  const cTrack = new THREE.Color(COLORS.track);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = heightAt(x, z);
    pos.setY(i, y);

    // Crests are lighter, hollows darker: reads as dunes even without texture.
    const shade = Math.max(-1, Math.min(1, (y - 1.2) / 4));
    if (shade >= 0) tmp.copy(cSand).lerp(cLight, shade);
    else tmp.copy(cSand).lerp(cDark, -shade);
    const onTrack = 1 - smooth(3.5, 5.5, distToTrack(x, z));
    if (onTrack > 0) tmp.lerp(cTrack, onTrack);
    // Tiny per-vertex jitter so flat areas are not a single flat colour.
    const j = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
    tmp.offsetHSL(0, 0, j * 0.025);
    colors.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;

  // The physics collider is the same triangles, so what you see is what you hit.
  const vertices = new Float32Array(pos.array as ArrayLike<number>);
  const indices = new Uint32Array(geo.index!.array as ArrayLike<number>);
  world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices).setFriction(1.0));

  // An invisible fence of tall boxes in a circle just inside the rim.
  const FENCE_R = PLAY_RADIUS + 12;
  const N = 64;
  const half = (Math.PI * FENCE_R) / N + 0.5; // a little overlap between panels
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(1, 30, half)
        .setTranslation(Math.cos(a) * FENCE_R, 20, Math.sin(a) * FENCE_R)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
    );
  }

  return { mesh, mapImage: drawMapImage(colors) };
}

function drawMapImage(colors: Float32Array): HTMLCanvasElement {
  const n = SEGMENTS + 1;
  const canvas = document.createElement('canvas');
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(n, n);
  // PlaneGeometry rows run from -z to +z after the rotation, i.e. top of the
  // map is north (-z). Each vertex becomes one pixel.
  // Vertex colours are linear (three's working space); a canvas wants sRGB.
  const c = new THREE.Color();
  for (let i = 0; i < n * n; i++) {
    c.setRGB(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]).convertLinearToSRGB();
    img.data[i * 4] = Math.round(c.r * 255);
    img.data[i * 4 + 1] = Math.round(c.g * 255);
    img.data[i * 4 + 2] = Math.round(c.b * 255);
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
