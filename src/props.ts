/**
 * Everything standing on the sand: the landmark at each area, the glowing
 * rings, the circuit gates, ramps, scenery, and a few things you can knock over.
 * Static things get a fixed collider; the barrels and crates are real bodies.
 */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import { AREA_POS, AREA_RING, CIRCUIT, COLORS, PLAY_RADIUS, SPAWN, SUMMIT } from './config';
import type { AreaId, Spot } from './config';
import { AREAS, entryById } from './areas';
import type { Bilingual } from './content/types';
import { board, sprite } from './labels';
import { circuitPoints, heightAt } from './terrain';

/* ---------------------------------------------------------------- helpers --- */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });

const M = {
  cream: mat(COLORS.cream),
  navy: mat(COLORS.navy),
  yellow: mat(COLORS.yellow),
  accent: mat(COLORS.accent),
  rock: mat(COLORS.rock),
  rockDark: mat(COLORS.rockDark),
  trunk: mat(COLORS.acaciaTrunk),
  crown: mat(COLORS.acaciaCrown),
  bush: mat(COLORS.bush),
  wood: mat('#9B6B43'),
  glass: mat('#2C3A55', { roughness: 0.3 }),
  metal: mat('#8C8F96', { roughness: 0.5, metalness: 0.4 }),
};

function shadowed<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return o;
}

/** Direction from the map centre outwards, so landmarks sit behind each area. */
function outward(p: Spot): number {
  return Math.atan2(p.z, p.x);
}

/* ------------------------------------------------------------------ build --- */
export interface Dynamic {
  body: RAPIER.RigidBody;
  mesh: THREE.Mesh;
  home: THREE.Vector3;
}

export interface Props {
  group: THREE.Group;
  rings: Map<AreaId, THREE.Mesh>;
  dynamics: Dynamic[];
  /** Circuit gate centres, in order; gate 0 is start and finish. */
  gates: THREE.Vector3[];
  update(dt: number, near: AreaId | null, time: number, car: THREE.Vector3): void;
}

export function buildProps(world: RAPIER.World): Props {
  const group = new THREE.Group();
  const rings = new Map<AreaId, THREE.Mesh>();
  const dynamics: Dynamic[] = [];
  /** Area titles: a beacon from afar, out of the way up close. */
  const titles: { sprite: THREE.Sprite; x: number; z: number }[] = [];

  const fixed = (desc: RAPIER.ColliderDesc, x: number, y: number, z: number, rotY = 0, rotX = 0) => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, 0, 'YXZ'));
    desc.setTranslation(x, y, z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    world.createCollider(desc);
  };

  const place = (o: THREE.Object3D, x: number, z: number, rotY = 0, lift = 0) => {
    o.position.set(x, heightAt(x, z) + lift, z);
    o.rotation.y = rotY;
    group.add(shadowed(o));
    return o;
  };

  /* --- rings and area titles --------------------------------------------- */
  const ringGeo = new THREE.RingGeometry(AREA_RING - 0.7, AREA_RING, 72);
  ringGeo.rotateX(-Math.PI / 2);
  for (const a of AREAS) {
    const p = AREA_POS[a.id];
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: COLORS.ring, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    ring.position.set(p.x, 0.06, p.z);
    group.add(ring);
    rings.set(a.id, ring);

    const title = sprite(a.title, { style: 'area', height: 2.1 });
    title.position.set(p.x, 8.5, p.z);
    group.add(title);
    titles.push({ sprite: title, x: p.x, z: p.z });
  }

  /* --- home: the name board and a signpost to everything else ------------ */
  {
    const h = AREA_POS.home;
    const sign = new THREE.Group();
    const name = board(
      { en: 'GAL OMER', he: 'גל עומר' },
      { en: 'Full stack developer · VP at A. Keren Psagot', he: 'מפתח פול-סטאק · סמנכ״ל בא.קרן פסגות' },
      11,
    );
    // High enough that the chase camera passes under it when you drive through.
    name.position.y = 7.2;
    sign.add(name);
    for (const sx of [-4.6, 4.6]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 9, 8), M.wood);
      post.position.set(sx, 4.5, -0.15);
      sign.add(post);
      fixed(RAPIER.ColliderDesc.cylinder(4.5, 0.3), h.x + sx * -1, 4.5, h.z + 14);
    }
    // Faces -z, towards where the car starts.
    place(sign, h.x, h.z + 14, Math.PI);

    const post = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 7, 8), M.wood);
    pole.position.y = 3.5;
    post.add(pole);
    AREAS.filter((a) => a.id !== 'home').forEach((a, i) => {
      const p = AREA_POS[a.id];
      const ang = Math.atan2(-(p.z - h.z), p.x - h.x); // rotation.y that points +x at it
      const arm = new THREE.Group();
      const plank = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.42, 0.12), i % 2 ? M.navy : M.yellow);
      plank.position.x = 1.25;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 3), i % 2 ? M.navy : M.yellow);
      tip.rotation.z = -Math.PI / 2;
      tip.position.x = 2.65;
      arm.add(plank, tip);
      arm.position.y = 2.3 + i * 0.85; // spaced so six labels do not overlap
      arm.rotation.y = ang;
      post.add(arm);
      // Name the destination at the arrow's tip. A rotation of `ang` turns +x
      // into (cos, 0, −sin).
      const tag = sprite(a.title, { height: 0.55 });
      tag.position.set(h.x + 7 + Math.cos(ang) * 3.4, heightAt(h.x + 7, h.z - 4) + 2.55 + i * 0.85, h.z - 4 - Math.sin(ang) * 3.4);
      group.add(tag);
    });
    place(post, h.x + 7, h.z - 4);
    fixed(RAPIER.ColliderDesc.cylinder(3.5, 0.25), h.x + 7, 3.5, h.z - 4);
  }

  /* --- A. Keren Psagot: a compound, one building per system -------------- */
  {
    const p = AREA_POS.akeren;
    const out = outward(p);
    const systems = ['kiryat-ata', 'shikum-psagot', 'trip-intake', 'psagot-bi'];
    systems.forEach((id, i) => {
      const a = out + (i - 1.5) * 0.55;
      const x = p.x + Math.cos(a) * 17;
      const z = p.z + Math.sin(a) * 17;
      const b = new THREE.Group();
      const w = 6, d = 6, hgt = 3.6 + (i % 2) * 1.4;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), M.cream);
      body.position.y = hgt / 2;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.35, d + 0.5), M.navy);
      roof.position.y = hgt + 0.17;
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 0.1), M.navy);
      door.position.set(0, 1, d / 2 + 0.05);
      const win = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.9, 0.1), M.glass);
      win.position.set(0, hgt - 1.1, d / 2 + 0.05);
      b.add(body, roof, door, win);
      // The door faces the centre of the compound.
      const face = Math.atan2(p.x - x, p.z - z);
      place(b, x, z, face);
      fixed(RAPIER.ColliderDesc.cuboid(w / 2, hgt / 2, d / 2), x, hgt / 2, z, face);
      const e = entryById(id);
      if (e) {
        const tag = sprite({ en: e.name, he: e.name }, { height: 1.1 });
        tag.position.set(x, hgt + 2, z);
        group.add(tag);
      }
    });
    // A flag pole in the middle of the compound.
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 9, 8), M.metal);
    pole.position.y = 4.5;
    const flag = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 0.05), M.yellow);
    flag.position.set(1.25, 8.1, 0);
    const fp = new THREE.Group();
    fp.add(pole, flag);
    const fx = p.x + Math.cos(out) * 10, fz = p.z + Math.sin(out) * 10;
    place(fp, fx, fz);
    fixed(RAPIER.ColliderDesc.cylinder(4.5, 0.2), fx, 4.5, fz);
  }

  /* --- projects: an open-air gallery of panels --------------------------- */
  {
    const p = AREA_POS.projects;
    const out = outward(p);
    const ids = AREAS.find((a) => a.id === 'projects')!.entries;
    ids.forEach((id, i) => {
      const a = out + (i - (ids.length - 1) / 2) * 0.32;
      const x = p.x + Math.cos(a) * 16;
      const z = p.z + Math.sin(a) * 16;
      const panel = new THREE.Group();
      const face = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 0.2), i % 2 ? M.navy : M.accent);
      face.position.y = 2.4;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.25, 0.22), M.yellow);
      stripe.position.y = 1.4;
      panel.add(face, stripe);
      for (const sx of [-1.3, 1.3]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.4, 0.16), M.metal);
        leg.position.set(sx, 0.7, 0);
        panel.add(leg);
      }
      const faceDir = Math.atan2(p.x - x, p.z - z);
      place(panel, x, z, faceDir);
      fixed(RAPIER.ColliderDesc.cuboid(1.6, 1.8, 0.2), x, 1.8, z, faceDir);
      const e = entryById(id);
      if (e) {
        const tag = sprite({ en: e.name, he: e.name }, { height: 0.85 });
        tag.position.set(x, 4.4, z);
        group.add(tag);
      }
    });
  }

  /* --- career: milestone stones along the road so far -------------------- */
  {
    const p = AREA_POS.career;
    const out = outward(p);
    const stones: [string, Bilingual][] = [
      ['2019', { en: 'Chemistry, Open University', he: 'כימיה, האוניברסיטה הפתוחה' }],
      ['2024', { en: 'Developers Institute bootcamp', he: 'בוטקמפ Developers Institute' }],
      ['2025', { en: 'Asaf Media · Manisr', he: 'אסף מדיה · Manisr' }],
      ['2025', { en: 'TLV Tech · data pipelines', he: 'TLV Tech · צינורות נתונים' }],
      ['NOW', { en: 'VP, A. Keren Psagot', he: 'סמנכ״ל, א.קרן פסגות' }],
    ];
    stones.forEach(([year, label], i) => {
      const a = out + (i - 2) * 0.42;
      const r = 15;
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      const size = 1 + i * 0.22;
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.55, size * 0.75, size * 2.2, 6), i === 4 ? M.yellow : M.rock);
      stone.position.y = size * 1.1;
      place(stone, x, z, i);
      fixed(RAPIER.ColliderDesc.cylinder(size * 1.1, size * 0.7), x, size * 1.1, z);
      const tag = sprite({ en: year, he: year === 'NOW' ? 'היום' : year }, { sub: label, height: 1.5 });
      tag.position.set(x, size * 2.2 + 1.6, z);
      group.add(tag);
    });
  }

  /* --- contact: a radio mast and a mailbox -------------------------------- */
  {
    const p = AREA_POS.contact;
    const out = outward(p);
    const mx = p.x + Math.cos(out) * 14, mz = p.z + Math.sin(out) * 14;
    const mast = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.9, 16, 4, 1, true), M.metal);
    tower.position.y = 8;
    mast.add(tower);
    for (let k = 1; k < 6; k++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.8 - k * 0.27, 0.08, 0.08), M.navy);
      bar.position.y = k * 2.6;
      bar.rotation.y = k * 0.7;
      mast.add(bar);
    }
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 12, 8),
      new THREE.MeshStandardMaterial({ color: '#FF5A3C', emissive: '#FF5A3C', emissiveIntensity: 2 }),
    );
    beacon.name = 'beacon';
    beacon.position.y = 16.3;
    mast.add(beacon);
    place(mast, mx, mz);
    fixed(RAPIER.ColliderDesc.cylinder(8, 0.8), mx, 8, mz);

    const bx = p.x + Math.cos(out + 0.6) * 11, bz = p.z + Math.sin(out + 0.6) * 11;
    const box = new THREE.Group();
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.2, 0.18), M.wood);
    leg.position.y = 0.6;
    const bin = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 1.2), M.navy);
    bin.position.y = 1.55;
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.25), M.yellow);
    flag.position.set(0.43, 1.85, 0.3);
    box.add(leg, bin, flag);
    place(box, bx, bz, Math.atan2(p.x - bx, p.z - bz));
    fixed(RAPIER.ColliderDesc.cuboid(0.45, 1, 0.65), bx, 1, bz);
  }

  /* --- circuit gates ------------------------------------------------------ */
  const gates: THREE.Vector3[] = [];
  {
    const pts = circuitPoints(96);
    for (let g = 0; g < CIRCUIT.gates; g++) {
      const i = Math.round((g / CIRCUIT.gates) * pts.length) % pts.length;
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const along = Math.atan2(-(b.y - a.y), b.x - a.x); // rotation.y pointing +x along the track
      const gate = new THREE.Group();
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.6, 0.35), g === 0 ? M.yellow : M.navy);
        post.position.set(0, 2.3, side * 6.2);
        gate.add(post);
        // Colliders on the posts only; the banner is overhead.
        const wx = a.x + Math.sin(along) * side * 6.2;
        const wz = a.y + Math.cos(along) * side * 6.2;
        fixed(RAPIER.ColliderDesc.cuboid(0.2, 2.3, 0.2), wx, 2.3, wz, along);
      }
      const banner = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, 12.8), g === 0 ? M.navy : M.yellow);
      banner.position.y = 4.75;
      gate.add(banner);
      place(gate, a.x, a.y, along);
      const label = sprite(
        g === 0 ? { en: 'START · FINISH', he: 'זינוק · סיום' } : { en: `${g}`, he: `${g}` },
        { style: g === 0 ? 'area' : 'tag', height: g === 0 ? 1.3 : 1.1 },
      );
      label.position.set(a.x, 6.3, a.y);
      group.add(label);
      gates.push(new THREE.Vector3(a.x, 0, a.y));
    }
  }

  /* --- ramps -------------------------------------------------------------- */
  const ramp = (x: number, z: number, yaw: number, len = 9, tilt = 0.27) => {
    const w = 4.2, t = 0.5;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, t, w), M.wood);
    const y = heightAt(x, z) + Math.sin(tilt) * len * 0.5 - 0.2;
    mesh.position.set(x, y, z);
    // Yaw first, then a tilt about the local Z axis, which lifts the +x end:
    // you drive up it heading +x.
    mesh.rotation.set(0, yaw, tilt, 'YZX');
    group.add(shadowed(mesh));
    const q = mesh.quaternion;
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(len / 2, t / 2, w / 2).setTranslation(x, y, z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
    );
  };
  ramp(-20, -26, 0);
  ramp(36, 8, Math.PI * 0.25);
  ramp(SUMMIT.x - 40, SUMMIT.z + 6, 0, 8, 0.3);

  /* --- things to knock over ---------------------------------------------- */
  const addDynamic = (mesh: THREE.Mesh, desc: RAPIER.ColliderDesc, x: number, y: number, z: number) => {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setCanSleep(true));
    world.createCollider(desc.setDensity(35).setFriction(0.8), body);
    mesh.position.set(x, y, z);
    group.add(shadowed(mesh));
    dynamics.push({ body, mesh, home: new THREE.Vector3(x, y, z) });
  };
  {
    // A pyramid of barrels near the start.
    const bx = -14, bz = 4;
    const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10);
    let k = 0;
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 3 - row; i++) {
        const m = new THREE.Mesh(barrelGeo, k++ % 2 ? M.navy : M.accent);
        addDynamic(m, RAPIER.ColliderDesc.cylinder(0.55, 0.45), bx + (i - (2 - row) / 2) * 0.95, 0.56 + row * 1.12, bz);
      }
    }
    // A stack of crates at the compound gate.
    const cx = AREA_POS.akeren.x - 12, cz = AREA_POS.akeren.z - 10;
    const crateGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(crateGeo, M.wood);
      addDynamic(m, RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5), cx + (i % 3) * 1.02 - 1, 0.5 + Math.floor(i / 3) * 1.02, cz);
    }
  }

  /* --- scenery ------------------------------------------------------------ */
  const track = circuitPoints(48);
  const clear = (x: number, z: number, margin: number): boolean => {
    if (Math.hypot(x, z) > PLAY_RADIUS + 6) return false;
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 14) return false;
    for (const p of Object.values(AREA_POS)) if (Math.hypot(x - p.x, z - p.z) < AREA_RING + 22 + margin) return false;
    for (const t of track) if (Math.hypot(x - t.x, z - t.y) < 12 + margin) return false;
    return true;
  };
  const rand = rng(7);
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  for (let i = 0; i < 90; i++) {
    const x = (rand() * 2 - 1) * PLAY_RADIUS, z = (rand() * 2 - 1) * PLAY_RADIUS;
    if (!clear(x, z, 0)) continue;
    const s = 0.6 + rand() * 2.4;
    const r = new THREE.Mesh(rockGeo, rand() > 0.4 ? M.rock : M.rockDark);
    r.scale.set(s * (0.8 + rand() * 0.6), s * (0.5 + rand() * 0.5), s * (0.8 + rand() * 0.6));
    r.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    place(r, x, z, r.rotation.y, s * 0.15);
    if (s > 1.1) world.createCollider(RAPIER.ColliderDesc.ball(s * 0.8).setTranslation(x, heightAt(x, z) + s * 0.2, z));
  }
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 3, 6);
  const crownGeo = new THREE.SphereGeometry(1, 9, 5);
  for (let i = 0; i < 46; i++) {
    const x = (rand() * 2 - 1) * PLAY_RADIUS, z = (rand() * 2 - 1) * PLAY_RADIUS;
    if (!clear(x, z, 2)) continue;
    // Acacia: a short trunk and a wide, flat umbrella crown.
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, M.trunk);
    trunk.position.y = 1.5;
    trunk.rotation.z = (rand() - 0.5) * 0.3;
    const crown = new THREE.Mesh(crownGeo, M.crown);
    const w = 2.4 + rand() * 1.6;
    crown.scale.set(w, 0.55, w * (0.8 + rand() * 0.3));
    crown.position.y = 3.1;
    tree.add(trunk, crown);
    tree.scale.setScalar(0.85 + rand() * 0.5);
    place(tree, x, z, rand() * 6);
    world.createCollider(RAPIER.ColliderDesc.cylinder(1.5, 0.35).setTranslation(x, heightAt(x, z) + 1.5, z));
  }
  const bushGeo = new THREE.IcosahedronGeometry(0.6, 0);
  for (let i = 0; i < 140; i++) {
    const x = (rand() * 2 - 1) * PLAY_RADIUS, z = (rand() * 2 - 1) * PLAY_RADIUS;
    if (!clear(x, z, -14)) continue;
    const b = new THREE.Mesh(bushGeo, M.bush);
    b.scale.set(1 + rand(), 0.6 + rand() * 0.4, 1 + rand());
    place(b, x, z, rand() * 6, 0.1);
  }

  /* --- per frame ---------------------------------------------------------- */
  const beacon = group.getObjectByName('beacon') as THREE.Mesh | undefined;
  return {
    group,
    rings,
    dynamics,
    gates,
    update(dt, near, time, car) {
      for (const tl of titles) {
        const d = Math.hypot(car.x - tl.x, car.z - tl.z);
        const m = tl.sprite.material;
        m.opacity = Math.max(0, Math.min(1, (d - 14) / 14));
        tl.sprite.visible = m.opacity > 0.01;
      }
      for (const [id, ring] of rings) {
        const m = ring.material as THREE.MeshBasicMaterial;
        const target = id === near ? 0.95 : 0.5;
        m.opacity += (target - m.opacity) * Math.min(1, dt * 6);
        const pulse = id === near ? 1 + Math.sin(time * 6) * 0.03 : 1;
        ring.scale.setScalar(pulse);
      }
      for (const d of dynamics) {
        const t = d.body.translation();
        const r = d.body.rotation();
        d.mesh.position.set(t.x, t.y, t.z);
        d.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      }
      if (beacon) (beacon.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.sin(time * 3) > 0.3 ? 2.5 : 0.2;
    },
  };
}
