/**
 * A chase camera that sits behind and above the car. Dragging (mouse or one
 * finger on the open sand) swings it around; let go and it eases back behind.
 * The wheel zooms.
 */
import * as THREE from 'three';
import { heightAt } from './terrain';

export interface ChaseCamera {
  camera: THREE.PerspectiveCamera;
  update(target: THREE.Vector3, carYaw: number, dt: number, lookRate: number): void;
  snap(target: THREE.Vector3, carYaw: number): void;
  resize(w: number, h: number): void;
}

export function createCamera(canvas: HTMLCanvasElement): ChaseCamera {
  const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 900);
  let orbit = 0; // extra yaw from the user
  let releasedFor = 10;
  let distance = 12;
  const pitch = 0.3;
  /** Look this far ahead of the car, so the horizon (and the sky) stay in frame. */
  const AHEAD = 5;
  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  let smoothYaw = 0;

  let dragging: { id: number; x: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = { id: e.pointerId, x: e.clientX };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging || dragging.id !== e.pointerId) return;
    orbit -= (e.clientX - dragging.x) * 0.006;
    dragging.x = e.clientX;
    releasedFor = 0;
  });
  const end = (e: PointerEvent) => {
    if (dragging?.id === e.pointerId) dragging = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener(
    'wheel',
    (e) => {
      distance = Math.max(7, Math.min(24, distance + e.deltaY * 0.01));
      e.preventDefault();
    },
    { passive: false },
  );

  const place = (target: THREE.Vector3, yaw: number, into: THREE.Vector3) => {
    // Behind the car is -forward; forward for yaw θ is (cos θ, 0, -sin θ).
    const a = yaw + orbit;
    const flat = Math.cos(pitch) * distance;
    into.set(target.x - Math.cos(a) * flat, target.y + Math.sin(pitch) * distance + 1.2, target.z + Math.sin(a) * flat);
    // Never below the sand.
    const ground = heightAt(into.x, into.z) + 1.2;
    if (into.y < ground) into.y = ground;
  };

  // Shortest signed difference between two angles.
  const delta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

  return {
    camera,
    snap(target, yaw) {
      smoothYaw = yaw;
      orbit = 0;
      place(target, yaw, pos);
      camera.position.copy(pos);
      look.copy(target);
      camera.lookAt(look.x + Math.cos(yaw) * AHEAD, look.y + 1.4, look.z - Math.sin(yaw) * AHEAD);
    },
    update(target, carYaw, dt, lookRate) {
      if (lookRate !== 0) {
        orbit += lookRate * dt;
        releasedFor = 0;
      }
      if (!dragging) releasedFor += dt;
      // After a second and a half untouched, swing back behind the car.
      if (releasedFor > 1.5) orbit *= Math.exp(-dt * 1.6);

      smoothYaw += delta(carYaw, smoothYaw) * (1 - Math.exp(-dt * 3.2));
      place(target, smoothYaw, pos);
      camera.position.lerp(pos, 1 - Math.exp(-dt * 7));
      look.lerp(target, 1 - Math.exp(-dt * 10));
      const a = smoothYaw + orbit;
      camera.lookAt(look.x + Math.cos(a) * AHEAD, look.y + 1.4, look.z - Math.sin(a) * AHEAD);
    },
    resize(w, h) {
      camera.aspect = w / h;
      // Narrow (portrait) screens get a wider view so the car is not cramped.
      camera.fov = w < h ? 68 : 55;
      camera.updateProjectionMatrix();
    },
  };
}
