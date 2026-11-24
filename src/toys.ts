/**
 * Things to drive into. Every one is a real Rapier body, so it is pushed,
 * tipped and rolled by the car rather than animated.
 *
 * - The playground: ten bowling pins, a goal with a giant ball, a cube wall.
 * - Elsewhere: beach balls scattered over the map, and a cube tower near home.
 *
 * Light on purpose (low density), so the car sends them flying instead of
 * stopping dead against them.
 */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import { AREA_POS, COLORS, PLAY_RADIUS } from './config';
import { heightAt } from './terrain';

interface Toy {
  body: RAPIER.RigidBody;
  mesh: THREE.Object3D;
  homeT: THREE.Vector3;
  homeQ: THREE.Quaternion;
}

export interface Toys {
  group: THREE.Group;
  update(): void;
  /** Put every toy back where it started. */
  reset(): void;
  /** Bowling pins knocked over right now (0..10). */
  pinsDown(): number;
  /** True once the giant ball has been inside the goal. */
  scored(): boolean;
  /** Cubes of the playground wall that have left their place. */
  wallMoved(): number;
}

const mat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.6, flatShading: true, ...extra });

export function buildToys(world: RAPIER.World): Toys {
  const group = new THREE.Group();
  const toys: Toy[] = [];
  const pins: Toy[] = [];
  const wall: Toy[] = [];
  let goalBall: Toy | null = null;
  let scored = false;

  const add = (mesh: THREE.Object3D, desc: RAPIER.ColliderDesc, x: number, y: number, z: number, density: number, list?: Toy[]) => {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setCanSleep(true).setLinearDamping(0.15).setAngularDamping(0.25),
    );
    world.createCollider(desc.setDensity(density).setFriction(0.7).setRestitution(0.25), body);
    mesh.position.set(x, y, z);
    mesh.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
    group.add(mesh);
    const toy = { body, mesh, homeT: new THREE.Vector3(x, y, z), homeQ: new THREE.Quaternion() };
    toys.push(toy);
    list?.push(toy);
    return toy;
  };

  const cubeColors = [COLORS.navy, COLORS.yellow, COLORS.cream, COLORS.accent];
  const cubeMats = cubeColors.map((c) => mat(c));

  /* --- beach balls: two-tone, so you can see them roll ------------------- */
  const ballMesh = (r: number, a: string, b: string) => {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(a));
    const bottom = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(b));
    const band = new THREE.Mesh(new THREE.TorusGeometry(r * 1.002, r * 0.06, 6, 24), mat(COLORS.cream));
    band.rotation.x = Math.PI / 2;
    g.add(top, bottom, band);
    return g;
  };

  /* --- the playground ----------------------------------------------------- */
  const p = AREA_POS.playground;

  // Bowling: a lane of compacted sand and ten pins in a triangle at its end.
  {
    const laneLen = 26;
    const lane = new THREE.Mesh(new THREE.BoxGeometry(5, 0.04, laneLen), mat('#D9B58A'));
    lane.position.set(p.x - 16, 0.03, p.z - 2);
    lane.receiveShadow = true;
    group.add(lane);
    const pinGeo = new THREE.LatheGeometry(
      [
        [0, 0], [0.16, 0], [0.2, 0.18], [0.17, 0.42], [0.09, 0.6], [0.11, 0.74], [0.08, 0.86], [0, 0.9],
      ].map(([r, y]) => new THREE.Vector2(r, y - 0.45)),
      12,
    );
    const pinMat = mat(COLORS.cream);
    const stripe = mat(COLORS.accent);
    const headZ = p.z - 2 + laneLen / 2 - 3; // far end of the lane
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i <= row; i++) {
        const pin = new THREE.Group();
        pin.add(new THREE.Mesh(pinGeo, pinMat));
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 12), stripe);
        s.position.y = 0.2;
        pin.add(s);
        const x = p.x - 16 + (i - row / 2) * 0.75;
        const z = headZ + row * 0.65;
        add(pin, RAPIER.ColliderDesc.cylinder(0.45, 0.17), x, 0.46, z, 6, pins);
      }
    }
  }

  // The goal: posts and a crossbar (fixed), a net behind, and the giant ball.
  const goal = { x: p.x + 16, z: p.z + 6, w: 7.3, h: 2.4, d: 2 };
  {
    const post = mat(COLORS.white);
    const net = new THREE.MeshStandardMaterial({ color: COLORS.cream, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
    const frame = new THREE.Group();
    const bar = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), post);
      m.position.set(x, y, z);
      m.castShadow = true;
      frame.add(m);
      world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(goal.x + x, y, goal.z + z));
    };
    bar(0.15, goal.h, 0.15, -goal.w / 2, goal.h / 2, 0);
    bar(0.15, goal.h, 0.15, goal.w / 2, goal.h / 2, 0);
    bar(goal.w + 0.15, 0.15, 0.15, 0, goal.h, 0);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(goal.w, goal.h), net);
    back.position.set(0, goal.h / 2, goal.d);
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(goal.w, goal.d), net);
    roof.rotation.x = Math.PI / 2;
    roof.position.set(0, goal.h, goal.d / 2);
    frame.add(back, roof);
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(goal.d, goal.h), net);
      side.rotation.y = Math.PI / 2;
      side.position.set((sx * goal.w) / 2, goal.h / 2, goal.d / 2);
      frame.add(side);
    }
    frame.position.set(goal.x, 0, goal.z);
    group.add(frame);
    // The net stops the ball (thin fixed walls at the back and sides).
    world.createCollider(RAPIER.ColliderDesc.cuboid(goal.w / 2, goal.h / 2, 0.05).setTranslation(goal.x, goal.h / 2, goal.z + goal.d));
    for (const sx of [-1, 1]) {
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.05, goal.h / 2, goal.d / 2).setTranslation(goal.x + (sx * goal.w) / 2, goal.h / 2, goal.z + goal.d / 2),
      );
    }
    goalBall = add(ballMesh(1.1, COLORS.yellow, COLORS.navy), RAPIER.ColliderDesc.ball(1.1), goal.x, 1.2, goal.z - 12, 0.9);
  }

  // A wall of cubes, three high.
  {
    const size = 1.1;
    const geo = new THREE.BoxGeometry(size, size, size);
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 5; i++) {
        const m = new THREE.Mesh(geo, cubeMats[(i + row) % cubeMats.length]);
        const x = p.x - 2 + (i - 2) * (size + 0.02) + (row % 2) * 0.3;
        add(m, RAPIER.ColliderDesc.cuboid(size / 2, size / 2, size / 2), x, size / 2 + row * (size + 0.01), p.z + 14, 4, wall);
      }
    }
  }

  /* --- elsewhere ---------------------------------------------------------- */
  // A tower near home: 2 x 2 x 4.
  {
    const size = 1;
    const geo = new THREE.BoxGeometry(size, size, size);
    const tx = 16, tz = 6;
    for (let level = 0; level < 4; level++) {
      for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(geo, cubeMats[(level + i) % cubeMats.length]);
        add(
          m,
          RAPIER.ColliderDesc.cuboid(size / 2, size / 2, size / 2),
          tx + (i % 2) * 1.02 - 0.5,
          size / 2 + level * 1.01,
          tz + Math.floor(i / 2) * 1.02 - 0.5,
          4,
        );
      }
    }
  }

  // Beach balls, placed by hand along the ways between places.
  const balls: [number, number, number][] = [
    [-6, 12, 0.9], [22, -20, 1.2], [40, 20, 1.0], [-40, 20, 1.3], [-36, -36, 0.9],
    [20, -50, 1.1], [60, -10, 1.4], [-20, 70, 1.0], [30, 80, 1.2], [-90, 0, 1.1],
  ];
  const pairs: [string, string][] = [
    [COLORS.yellow, COLORS.navy], [COLORS.accent, COLORS.cream], [COLORS.navy, COLORS.yellow], [COLORS.cream, COLORS.accent],
  ];
  balls.forEach(([x, z, r], i) => {
    if (Math.hypot(x, z) > PLAY_RADIUS) return;
    const [a, b] = pairs[i % pairs.length];
    add(ballMesh(r, a, b), RAPIER.ColliderDesc.ball(r), x, heightAt(x, z) + r + 0.3, z, 0.6);
  });

  /* --- per frame ---------------------------------------------------------- */
  const up = new THREE.Vector3();
  const q = new THREE.Quaternion();
  return {
    group,
    update() {
      for (const t of toys) {
        const tr = t.body.translation();
        const r = t.body.rotation();
        t.mesh.position.set(tr.x, tr.y, tr.z);
        t.mesh.quaternion.set(r.x, r.y, r.z, r.w);
        // Fell through the world or over the rim: quietly bring it home.
        if (tr.y < -10) {
          t.body.setTranslation(t.homeT, true);
          t.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }
      }
      if (goalBall && !scored) {
        const b = goalBall.body.translation();
        if (Math.abs(b.x - goal.x) < goal.w / 2 && b.z > goal.z + 0.3 && b.z < goal.z + goal.d && b.y < goal.h) scored = true;
      }
    },
    reset() {
      for (const t of toys) {
        t.body.setTranslation(t.homeT, true);
        t.body.setRotation(t.homeQ, true);
        t.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        t.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      scored = false;
    },
    pinsDown() {
      let n = 0;
      for (const t of pins) {
        const r = t.body.rotation();
        up.set(0, 1, 0).applyQuaternion(q.set(r.x, r.y, r.z, r.w));
        if (up.y < 0.6) n++;
      }
      return n;
    },
    scored: () => scored,
    wallMoved() {
      let n = 0;
      for (const t of wall) if (t.homeT.distanceTo(t.body.translation() as THREE.Vector3) > 0.8) n++;
      return n;
    },
  };
}
