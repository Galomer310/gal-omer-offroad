/**
 * The buggy: an open off-road car with a roll cage, in the white / navy /
 * yellow livery of Gal's bike. Built from primitives in code, so there is no
 * model file and nothing borrowed.
 *
 * Physics is Rapier's ray-cast vehicle: a rigid chassis with four suspension
 * rays, all four wheels driven. The chassis faces +X (Rapier's default forward
 * axis), and so does the model.
 */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import { COLORS, VEHICLE as V } from './config';

/* Signs verified by the drive test (scripts/drive-test): positive engine force
   moves the car towards +X, and positive steering turns it left. */
const ENGINE_SIGN = 1;
const STEER_SIGN = 1;

const WHEELS = [
  { x: 1.25, z: 0.98, front: true },
  { x: 1.25, z: -0.98, front: true },
  { x: -1.25, z: 0.98, front: false },
  { x: -1.25, z: -0.98, front: false },
];
const WHEEL_Y = -0.15;

export interface DriveInput {
  throttle: number; // -1..1
  steer: number; // -1..1, positive = left
  boost: boolean;
  brake: boolean;
  jump: boolean;
}

export interface Vehicle {
  group: THREE.Group;
  body: RAPIER.RigidBody;
  /** Forward speed, m/s (negative when reversing). */
  speed: () => number;
  grounded: () => boolean;
  step(input: DriveInput, dt: number): void;
  /** Copy physics to the model; dt drives the body sway. */
  sync(dt: number): void;
  place(x: number, y: number, z: number, yaw: number): void;
  /** Heading in the XZ plane, radians, same convention as SPAWN.yaw. */
  yaw: () => number;
}

/* ------------------------------------------------------------------ model --- */
/**
 * Two layers: `root` follows the physics body exactly and carries the wheels;
 * `body` (everything else) sits on it on a visual spring, so it can lean and
 * pitch on its own without touching the physics.
 */
function buildModel(): { group: THREE.Group; body: THREE.Group; wheels: THREE.Group[] } {
  const m = (c: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, flatShading: true, ...extra });
  const white = m(COLORS.white);
  const navy = m(COLORS.navy);
  const yellow = m(COLORS.yellow);
  const tyre = m(COLORS.tyre, { roughness: 0.95 });
  const lamp = m('#FFF4D6', { emissive: '#FFE7A8', emissiveIntensity: 1.2 });

  const root = new THREE.Group();
  const g = new THREE.Group(); // the body
  root.add(g);
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(x, y, z);
    g.add(b);
    return b;
  };
  const tube = (from: THREE.Vector3, to: THREE.Vector3, r = 0.055, mat: THREE.Material = navy) => {
    const len = from.distanceTo(to);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), mat);
    c.position.copy(from).add(to).multiplyScalar(0.5);
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    g.add(c);
  };
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  // Body: a white tub on a navy skid, a short hood, yellow fenders.
  box(3.5, 0.55, 1.8, white, 0, 0.2, 0);
  box(3.6, 0.22, 1.84, navy, 0, -0.14, 0);
  box(1.15, 0.36, 1.62, white, 1.18, 0.62, 0);
  box(1.16, 0.03, 0.34, yellow, 1.18, 0.81, 0);
  box(0.26, 0.38, 2.04, navy, 1.86, 0.02, 0);
  box(0.26, 0.38, 2.04, navy, -1.84, 0.02, 0);
  for (const w of WHEELS) box(1.12, 0.1, 0.42, yellow, w.x, 0.56, w.z * 1.03);
  // Seats and a dash.
  for (const z of [-0.45, 0.45]) {
    box(0.55, 0.5, 0.62, navy, -0.35, 0.7, z);
    box(0.14, 0.75, 0.62, navy, -0.65, 1.0, z);
  }
  box(0.2, 0.3, 1.5, navy, 0.55, 0.75, 0);

  // Roll cage, in navy tube.
  const fx = 0.62, rx = -1.2, top = 1.85, side = 0.84;
  for (const z of [-side, side]) {
    tube(v(fx, 0.5, z), v(fx - 0.25, top, z));
    tube(v(rx, 0.5, z), v(rx, top, z));
    tube(v(fx - 0.25, top, z), v(rx, top, z));
    tube(v(rx, top, z), v(-1.75, 0.5, z * 0.9)); // rear stays
  }
  tube(v(fx - 0.25, top, -side), v(fx - 0.25, top, side));
  tube(v(rx, top, -side), v(rx, top, side));
  tube(v(rx, top, -side), v(fx - 0.25, top, side), 0.045); // diagonal brace

  // Round headlights, a snorkel, and the spare wheel on the back.
  for (const z of [-0.6, 0.6]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 14), lamp);
    l.rotation.z = Math.PI / 2;
    l.position.set(1.77, 0.6, z);
    g.add(l);
  }
  tube(v(0.85, 0.55, 0.92), v(0.85, 1.55, 0.92), 0.07, navy);
  box(0.24, 0.12, 0.16, navy, 0.95, 1.58, 0.92);
  const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14), tyre);
  spare.rotation.z = Math.PI / 2;
  spare.position.set(-2.05, 0.75, 0);
  g.add(spare);
  const spareHub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.32, 10), yellow);
  spareHub.rotation.z = Math.PI / 2;
  spareHub.position.copy(spare.position);
  g.add(spareHub);

  // Wheels: chunky tyres, white hubs, yellow centre caps.
  const tyreGeo = new THREE.CylinderGeometry(V.wheelRadius, V.wheelRadius, 0.46, 12);
  tyreGeo.rotateX(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.48, 8);
  hubGeo.rotateX(Math.PI / 2);
  const capGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.5, 6);
  capGeo.rotateX(Math.PI / 2);
  const wheels = WHEELS.map((w) => {
    const steerPivot = new THREE.Group();
    const spin = new THREE.Group();
    spin.add(new THREE.Mesh(tyreGeo, tyre), new THREE.Mesh(hubGeo, white), new THREE.Mesh(capGeo, yellow));
    steerPivot.add(spin);
    steerPivot.position.set(w.x, WHEEL_Y - V.suspensionRest, w.z);
    root.add(steerPivot); // wheels ride with the chassis, not the swaying body
    return steerPivot;
  });

  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { group: root, body: g, wheels };
}

/* ---------------------------------------------------------------- physics --- */
export function buildVehicle(world: RAPIER.World, x: number, y: number, z: number, yaw: number): Vehicle {
  const { group, body: bodyMesh, wheels } = buildModel();

  const q0 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setRotation({ x: q0.x, y: q0.y, z: q0.z, w: q0.w })
      // Mass and a low centre of mass are set by hand: a buggy should be hard
      // to roll, and the collider's own shape would put the mass too high.
      .setAdditionalMassProperties(V.mass, { x: 0, y: V.centreOfMassY, z: 0 }, { x: 140, y: 460, z: 380 }, { x: 0, y: 0, z: 0, w: 1 })
      .setLinearDamping(0.05)
      .setAngularDamping(0.8)
      .setCanSleep(false)
      .setCcdEnabled(true),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(1.8, 0.42, 0.95).setTranslation(0, 0.2, 0).setDensity(0).setFriction(0.4).setRestitution(0.1),
    body,
  );

  const ctrl = world.createVehicleController(body);
  for (const w of WHEELS) {
    ctrl.addWheel({ x: w.x, y: WHEEL_Y, z: w.z }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, V.suspensionRest, V.wheelRadius);
  }
  for (let i = 0; i < WHEELS.length; i++) {
    ctrl.setWheelSuspensionStiffness(i, V.stiffness);
    ctrl.setWheelSuspensionCompression(i, V.compression);
    ctrl.setWheelSuspensionRelaxation(i, V.relaxation);
    ctrl.setWheelMaxSuspensionTravel(i, V.suspensionTravel);
    ctrl.setWheelMaxSuspensionForce(i, 1e5);
    ctrl.setWheelFrictionSlip(i, V.frictionSlip);
    ctrl.setWheelSideFrictionStiffness(i, 1);
  }

  let steer = 0;
  let jumpCooldown = 0;
  let flippedFor = 0;
  const up = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const side = new THREE.Vector3();
  const angVel = new THREE.Vector3();
  const level = new THREE.Vector3();
  const axis = new THREE.Vector3();

  /* Body sway: a damped spring per axis, pushed by the acceleration the car
     feels in its own frame. Under-damped on purpose, so a jolt leaves a small
     wobble. Purely visual: the physics body never leans. */
  const sway = { roll: 0, rollV: 0, pitch: 0, pitchV: 0 };
  const vLocal = new THREE.Vector3();
  const vPrev = new THREE.Vector3();
  const acc = new THREE.Vector3();
  const inv = new THREE.Quaternion();
  let swayReady = false;

  const grounded = () => WHEELS.some((_, i) => ctrl.wheelIsInContact(i));

  const place = (px: number, py: number, pz: number, pyaw: number) => {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pyaw);
    body.setTranslation({ x: px, y: py, z: pz }, true);
    body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    steer = 0;
    swayReady = false; // a teleport is not an acceleration
    Object.assign(sway, { roll: 0, rollV: 0, pitch: 0, pitchV: 0 });
  };

  const yawOf = () => {
    const r = body.rotation();
    quat.set(r.x, r.y, r.z, r.w);
    fwd.set(1, 0, 0).applyQuaternion(quat);
    return Math.atan2(-fwd.z, fwd.x);
  };

  return {
    group,
    body,
    speed: () => ctrl.currentVehicleSpeed(),
    grounded,
    yaw: yawOf,
    place,
    step(input, dt) {
      const speed = ctrl.currentVehicleSpeed();
      const onGround = grounded();

      // Steering eases towards the target, and narrows at speed so it stays drivable.
      const target = input.steer * V.maxSteer * (1 - Math.min(Math.abs(speed) / 45, 0.55));
      steer += Math.sign(target - steer) * Math.min(Math.abs(target - steer), V.steerSpeed * dt);
      ctrl.setWheelSteering(0, steer * STEER_SIGN);
      ctrl.setWheelSteering(1, steer * STEER_SIGN);

      let force = 0;
      let brake = 0;
      const max = input.boost ? V.maxSpeedBoost : V.maxSpeed;
      if (input.throttle > 0.05) {
        if (speed < -1) brake = V.brake; // pressing forward while rolling back
        else if (speed < max) force = V.engineForce * input.throttle * (input.boost ? V.boostFactor : 1);
      } else if (input.throttle < -0.05) {
        if (speed > 1) brake = V.brake;
        else if (speed > -9) force = -V.engineForce * V.reverseFactor * -input.throttle;
      } else {
        brake = V.rolling;
      }
      if (input.brake) brake = V.brake * 1.4;
      for (let i = 0; i < WHEELS.length; i++) {
        ctrl.setWheelEngineForce(i, force * ENGINE_SIGN);
        ctrl.setWheelBrake(i, brake);
      }

      jumpCooldown = Math.max(0, jumpCooldown - dt);
      if (input.jump && onGround && jumpCooldown === 0) {
        body.applyImpulse({ x: 0, y: V.mass * V.jumpImpulse, z: 0 }, true);
        jumpCooldown = 0.8;
      }

      // A little air control, so a jump can be straightened out.
      if (!onGround) {
        body.applyTorqueImpulse({ x: 0, y: input.steer * V.mass * 0.012, z: 0 }, true);
      }

      /* Stability. Softer suspension made hard turns roll the car over, most
         of all when it landed off a dune mid-turn (3 of 4 runs in a probe).
         On the ground: an anti-roll bar, a torque about the car's own forward
         axis that resists rolling. In the air: a gentle pull back to level, so
         it lands on its wheels. The visible lean is the separate body-sway
         spring, so this does not take the sway away. */
      {
        const r = body.rotation();
        quat.set(r.x, r.y, r.z, r.w);
        fwd.set(1, 0, 0).applyQuaternion(quat);
        side.set(0, 0, 1).applyQuaternion(quat);
        up.set(0, 1, 0).applyQuaternion(quat);
        const w = body.angvel();
        angVel.set(w.x, w.y, w.z);
        if (onGround) {
          // side.y > 0: the right side is up (leaning left); a positive turn
          // about forward lowers the right side again.
          const rollRate = angVel.dot(fwd);
          const tq = (V.antiRoll * side.y - V.antiRollDamping * rollRate) * dt;
          body.applyTorqueImpulse({ x: fwd.x * tq, y: fwd.y * tq, z: fwd.z * tq }, true);
        } else {
          // Torque towards upright (up × worldUp), damped, yaw left free.
          level.set(0, 1, 0);
          axis.crossVectors(up, level);
          const spin = angVel.clone().addScaledVector(up, -angVel.dot(up)); // ignore yaw
          axis.multiplyScalar(V.airLevel).addScaledVector(spin, -V.airLevelDamping).multiplyScalar(dt);
          body.applyTorqueImpulse({ x: axis.x, y: axis.y, z: axis.z }, true);
        }
      }

      ctrl.updateVehicle(dt);

      // Upside down and stuck: put it back on its wheels after a moment.
      const r = body.rotation();
      up.set(0, 1, 0).applyQuaternion(quat.set(r.x, r.y, r.z, r.w));
      flippedFor = up.y < 0.35 && Math.abs(speed) < 3 ? flippedFor + dt : 0;
      if (flippedFor > 1.6) {
        const t = body.translation();
        place(t.x, t.y + 1.8, t.z, yawOf());
        flippedFor = 0;
      }
    },
    sync(dt) {
      const t = body.translation();
      const r = body.rotation();
      group.position.set(t.x, t.y, t.z);
      group.quaternion.set(r.x, r.y, r.z, r.w);

      // Acceleration in the car's own frame (x forward, z to the right).
      const lv = body.linvel();
      inv.set(r.x, r.y, r.z, r.w).invert();
      vLocal.set(lv.x, lv.y, lv.z).applyQuaternion(inv);
      if (swayReady && dt > 0) {
        acc.copy(vLocal).sub(vPrev).divideScalar(dt);
        // Lean away from the turn (centripetal pull is towards it), nose up
        // when accelerating, down when braking. Clamped so a crash cannot
        // fold the body over.
        const targetRoll = THREE.MathUtils.clamp(-acc.z * V.swayRoll, -V.swayMaxRoll, V.swayMaxRoll);
        const targetPitch = THREE.MathUtils.clamp(acc.x * V.swayPitch, -V.swayMaxPitch, V.swayMaxPitch);
        const h = Math.min(dt, 1 / 30); // keep the spring stable on slow frames
        sway.rollV += (V.swaySpring * (targetRoll - sway.roll) - V.swayDamping * sway.rollV) * h;
        sway.roll += sway.rollV * h;
        sway.pitchV += (V.swaySpring * (targetPitch - sway.pitch) - V.swayDamping * sway.pitchV) * h;
        sway.pitch += sway.pitchV * h;
      }
      vPrev.copy(vLocal);
      swayReady = true;
      bodyMesh.rotation.set(sway.roll, 0, sway.pitch);
      for (let i = 0; i < wheels.length; i++) {
        const len = ctrl.wheelSuspensionLength(i) ?? V.suspensionRest;
        wheels[i].position.y = WHEEL_Y - len;
        wheels[i].rotation.y = (ctrl.wheelSteering(i) ?? 0) * STEER_SIGN;
        wheels[i].children[0].rotation.z = -(ctrl.wheelRotation(i) ?? 0) * ENGINE_SIGN;
      }
    },
  };
}
