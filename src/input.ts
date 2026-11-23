/**
 * Keyboard, touch and gamepad, merged into one state the game reads each
 * frame. One-shot actions (open, map, respawn, mute) are queued as events so a
 * press is never lost between frames or counted twice.
 */
import type { DriveInput } from './vehicle';

export type Action = 'interact' | 'map' | 'respawn' | 'mute' | 'close';

export interface Input {
  drive(): DriveInput;
  horn(): boolean;
  /** Camera yaw from the right stick / one-finger drag, radians per second. */
  lookRate(): number;
  takeActions(): Action[];
  /** Touch joystick, wired by the UI. */
  touch: { x: number; y: number; boost: boolean; brake: boolean; horn: boolean; jump: boolean };
  /** Ignore driving keys while a card or the map is open. */
  enabled: boolean;
}

const DRIVE_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'ShiftLeft', 'ShiftRight', 'KeyB', 'ControlLeft', 'KeyH',
]);

export function createInput(): Input {
  const down = new Set<string>();
  const actions: Action[] = [];
  const touch = { x: 0, y: 0, boost: false, brake: false, horn: false, jump: false };
  const pad = { prev: [] as boolean[] };

  const state: Input = {
    enabled: false,
    touch,
    drive() {
      const k = (c: string) => down.has(c);
      let throttle = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
      let steer = (k('KeyA') || k('ArrowLeft') ? 1 : 0) - (k('KeyD') || k('ArrowRight') ? 1 : 0);
      let boost = k('ShiftLeft') || k('ShiftRight') || touch.boost;
      let brake = k('KeyB') || k('ControlLeft') || touch.brake;
      let jump = k('Space') || touch.jump;
      throttle += touch.y;
      steer += -touch.x;

      const gp = navigator.getGamepads?.()[0];
      if (gp) {
        const ax = Math.abs(gp.axes[0]) > 0.15 ? gp.axes[0] : 0;
        steer += -ax;
        throttle += (gp.buttons[7]?.value ?? 0) - (gp.buttons[6]?.value ?? 0);
        jump ||= !!gp.buttons[0]?.pressed; // A
        brake ||= !!gp.buttons[2]?.pressed; // X
        boost ||= !!gp.buttons[1]?.pressed; // B
      }
      const clamp = (v: number) => Math.max(-1, Math.min(1, v));
      if (!state.enabled) return { throttle: 0, steer: 0, boost: false, brake: true, jump: false };
      return { throttle: clamp(throttle), steer: clamp(steer), boost, brake, jump };
    },
    horn() {
      const gp = navigator.getGamepads?.()[0];
      return state.enabled && (down.has('KeyH') || touch.horn || !!gp?.buttons[10]?.pressed);
    },
    lookRate() {
      const gp = navigator.getGamepads?.()[0];
      const rx = gp && Math.abs(gp.axes[2]) > 0.2 ? gp.axes[2] : 0;
      return -rx * 2.4;
    },
    takeActions() {
      // Gamepad buttons become one-shot actions on the press edge.
      const gp = navigator.getGamepads?.()[0];
      if (gp) {
        const map: [number, Action][] = [[3, 'interact'], [8, 'map'], [9, 'respawn']];
        for (const [i, a] of map) {
          const p = !!gp.buttons[i]?.pressed;
          if (p && !pad.prev[i]) actions.push(a);
          pad.prev[i] = p;
        }
      }
      return actions.splice(0);
    },
  };

  window.addEventListener('keydown', (e) => {
    // Typing in a field (none today, but cheap insurance) is not driving.
    if ((e.target as HTMLElement)?.closest?.('input, textarea')) return;
    if (DRIVE_KEYS.has(e.code) && state.enabled) e.preventDefault();
    if (!e.repeat) {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') actions.push('interact');
      if (e.code === 'KeyM') actions.push('map');
      if (e.code === 'KeyR') actions.push('respawn');
      if (e.code === 'KeyL') actions.push('mute');
      if (e.code === 'Escape') actions.push('close');
    }
    down.add(e.code);
  });
  window.addEventListener('keyup', (e) => down.delete(e.code));
  // Losing focus with a key held would otherwise leave the car driving.
  window.addEventListener('blur', () => down.clear());

  return state;
}
