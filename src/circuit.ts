/**
 * The time trial. Drive through the start gate, then gates 1..5 in order, then
 * the start gate again. The best time is kept in this browser.
 */
import * as THREE from 'three';
import { CIRCUIT } from './config';

const KEY = 'offroad.bestLap';

export type LapEvent =
  | { kind: 'start' }
  | { kind: 'gate'; n: number }
  | { kind: 'finish'; time: number; best: number | null; isBest: boolean };

export function createCircuit(gates: THREE.Vector3[]) {
  let running = false;
  let next = 0;
  let t0 = 0;
  let inside = -1; // which gate the car is currently inside, so it counts once
  let best: number | null = (() => {
    try {
      const v = Number(localStorage.getItem(KEY));
      return v > 0 ? v : null;
    } catch {
      return null;
    }
  })();

  return {
    running: () => running,
    elapsed: (now: number) => (running ? now - t0 : 0),
    next: () => next,
    best: () => best,
    cancel() {
      running = false;
      next = 0;
    },
    update(pos: THREE.Vector3, now: number): LapEvent | null {
      let hit = -1;
      for (let i = 0; i < gates.length; i++) {
        if (Math.hypot(pos.x - gates[i].x, pos.z - gates[i].z) < CIRCUIT.gateRadius) hit = i;
      }
      if (hit === inside) return null;
      inside = hit;
      if (hit < 0) return null;

      if (!running) {
        if (hit !== 0) return null;
        running = true;
        next = 1;
        t0 = now;
        return { kind: 'start' };
      }
      if (hit !== next) return null; // wrong gate: ignored, keep going
      if (hit === 0) {
        const time = now - t0;
        running = false;
        next = 0;
        const isBest = best === null || time < best;
        if (isBest) {
          best = time;
          try {
            localStorage.setItem(KEY, String(time));
          } catch {
            /* still shown */
          }
        }
        return { kind: 'finish', time, best, isBest };
      }
      next = (next + 1) % gates.length;
      return { kind: 'gate', n: hit };
    },
  };
}

export const formatTime = (s: number): string => {
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(2).padStart(5, '0')}`;
};
