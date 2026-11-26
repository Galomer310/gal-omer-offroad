/**
 * The game: renderer, world, car and the loop. Loaded by main.ts only after
 * the browser has shown it can draw WebGL, so a browser that cannot never
 * downloads three.js or the physics engine.
 *
 * Physics runs at a fixed 60 Hz, whatever the screen's refresh rate, so the
 * car drives the same on every machine.
 */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import { createAchievements } from './achievements';
import type { AchievementId } from './achievements';
import { AREAS, areaById } from './areas';
import type { AreaDef } from './areas';
import { createAudio } from './audio';
import { STYLES, renderStyle } from './music';
import { createCamera } from './camera';
import { createCircuit, formatTime } from './circuit';
import { AREA_POS, AREA_RING, SPAWN, SUMMIT, VEHICLE } from './config';
import type { AreaId } from './config';
import { t, ui } from './i18n';
import { createInput } from './input';
import { buildProps } from './props';
import { buildToys } from './toys';
import { buildNoticeBoard } from './noticeboard';
import { onMessages, refreshMessages, setLastLap } from './social';
import { buildSky } from './sky';
import { buildTerrain, heightAt } from './terrain';
import { createUI } from './ui';
import { buildVehicle } from './vehicle';

const STEP = 1 / 60;

export async function startGame(): Promise<void> {
  /* --- renderer ----------------------------------------------------------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap was removed in r18x
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Desert world. Drive with the arrow keys or WASD.');
  document.querySelector('#stage')!.appendChild(canvas);

  const scene = new THREE.Scene();
  const world = new RAPIER.World({ x: 0, y: -VEHICLE.gravity, z: 0 });

  const sky = buildSky(scene);
  const terrain = buildTerrain(world);
  scene.add(terrain.mesh);
  const props = buildProps(world);
  scene.add(props.group);
  const toys = buildToys(world);
  scene.add(toys.group);
  const board = buildNoticeBoard(world);
  scene.add(board.group);
  onMessages((m) => board.setMessages(m));

  const car = buildVehicle(world, SPAWN.x, heightAt(SPAWN.x, SPAWN.z) + 1.6, SPAWN.z, SPAWN.yaw);
  scene.add(car.group);

  const chase = createCamera(canvas);
  const input = createInput();
  const audio = createAudio();
  const circuit = createCircuit(props.gates);

  /* --- achievements and UI ------------------------------------------------ */
  // The UI is created after achievements, but toasts need the UI: late-bound.
  let toast: (a: string, b?: string) => void = () => {};
  const achievements = createAchievements((a) => {
    toast(`★ ${t(a.title)}`, t(ui.unlocked));
    audio.chime();
  });
  const unlock = (id: AchievementId) => achievements.unlock(id);

  const respawn = () => {
    // Back to the nearest place, facing into it.
    const p = car.body.translation();
    let best: AreaId = 'home';
    let bestD = Infinity;
    for (const a of AREAS) {
      const q = AREA_POS[a.id];
      const d = Math.hypot(p.x - q.x, p.z - q.z);
      if (d < bestD) {
        bestD = d;
        best = a.id;
      }
    }
    // 12 m south of the place, facing north (+z, yaw −π/2) into its ring.
    const q = AREA_POS[best];
    if (best === 'home') car.place(SPAWN.x, heightAt(SPAWN.x, SPAWN.z) + 1.6, SPAWN.z, SPAWN.yaw);
    else car.place(q.x, heightAt(q.x, q.z - 12) + 1.6, q.z - 12, -Math.PI / 2);
    circuit.cancel();
    uiApi.setTimer(null);
    chase.snap(car.group.position, car.yaw());
  };

  /** Next music style, from the P key or the ♫ button. Hearing all four is the DJ achievement. */
  const heard = new Set<number>([audio.styleIndex()]);
  const changeMusic = () => {
    uiApi.toast(`♫ ${t(audio.nextStyle())}`);
    heard.add(audio.styleIndex());
    if (heard.size === STYLES.length) unlock('dj');
  };

  /** Sunrise → noon → sunset, from the N key or the ☀ button. */
  const changeTime = () => {
    uiApi.toast(`☀ ${t(sky.next())}`);
    unlock('time');
  };

  const visited = new Set<AreaId>();
  const uiApi = createUI(input, achievements, terrain.mapImage, {
    onStart() {
      audio.start();
      unlock('drive');
    },
    onMute() {
      uiApi.setMuted(audio.toggleMute());
    },
    onRespawn: respawn,
    onTime: () => changeTime(),
    onMusic: () => changeMusic(),
    onReset: () => toys.reset(),
    onAchieve: (id) => unlock(id),
  });
  toast = uiApi.toast;
  uiApi.setMuted(audio.muted());

  const open = (a: AreaDef) => {
    uiApi.openCard(a);
    visited.add(a.id);
    unlock('visit-one');
    if (visited.size === AREAS.length) unlock('visit-all');
  };

  /* --- sizing ------------------------------------------------------------- */
  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    chase.resize(w, h);
  };
  window.addEventListener('resize', resize);
  resize();

  car.sync(0);
  chase.snap(car.group.position, car.yaw());
  sky.follow(car.group.position);

  /* --- loop --------------------------------------------------------------- */
  // Timer, not the deprecated Clock: connected to the document, it ignores the
  // time a tab spent hidden, so returning to it is not one giant time step.
  const timer = new THREE.Timer();
  timer.connect(document);
  let acc = 0;
  let airborne = 0;
  let wasAir = false;
  let near: AreaId | null = null;
  let honked = false;

  const tick = (timestamp?: number) => {
    timer.update(timestamp);
    const dt = Math.min(timer.getDelta(), 0.1);
    const now = timer.getElapsed();

    // One-shot actions.
    for (const a of input.takeActions()) {
      if (a === 'close') uiApi.closeAll();
      else if (a === 'mute') uiApi.setMuted(audio.toggleMute());
      else if (a === 'map') {
        if (uiApi.toggleMap()) unlock('map');
      } else if (a === 'respawn' && !uiApi.anyOpen()) respawn();
      else if (a === 'reset') toys.reset();
      else if (a === 'time') changeTime();
      else if (a === 'music') changeMusic();
      else if (a === 'interact' && !uiApi.anyOpen() && near) open(areaById(near));
    }

    // Physics at a fixed step.
    const drive = input.drive();
    acc += dt;
    while (acc >= STEP) {
      car.step(drive, STEP);
      world.step();
      acc -= STEP;
    }
    car.sync(dt);

    const pos = car.group.position;
    const speed = car.speed();
    const grounded = car.grounded();

    // Airtime, landing thud.
    if (!grounded) {
      airborne += dt;
      if (airborne > 0.45) unlock('airtime');
      if (airborne > 1.5) unlock('bigair');
    } else {
      if (wasAir && airborne > 0.35) audio.thud(airborne);
      airborne = 0;
    }
    wasAir = !grounded;

    // Fell out of the world somehow: put it back.
    if (pos.y < -25) respawn();

    // Which ring is the car in?
    near = null;
    for (const a of AREAS) {
      const p = AREA_POS[a.id];
      if (Math.hypot(pos.x - p.x, pos.z - p.z) < AREA_RING && Math.abs(speed) < 7) near = a.id;
    }
    uiApi.showPrompt(near && !uiApi.anyOpen() ? areaById(near) : null);

    // Circuit.
    const lap = circuit.update(pos, now);
    if (lap?.kind === 'start') uiApi.toast(t(ui.lapStart));
    if (lap?.kind === 'finish') {
      unlock('lap');
      if (lap.time < 35) unlock('fast-lap');
      uiApi.toast(`${t(ui.lapDone)}: ${formatTime(lap.time)}`, lap.isBest ? t(ui.newBest) : `${t(ui.best)}: ${formatTime(lap.best!)}`);
      // Kept for the lap board: stop in the circuit's ring to put it up.
      setLastLap(lap.time * 1000, lap.splits);
      uiApi.toast(t(ui.lapSubmitHint));
    }
    if (circuit.running()) {
      const b = circuit.best();
      uiApi.setTimer(formatTime(circuit.elapsed(now)), `${t(ui.gate)} ${circuit.next() || 'START'}${b ? ` · ${t(ui.best)} ${formatTime(b)}` : ''}`);
    } else if (!lap) uiApi.setTimer(null);

    // Small achievements.
    if (Math.hypot(pos.x - SUMMIT.x, pos.z - SUMMIT.z) < 8 && pos.y > SUMMIT.height * 0.75) unlock('summit');
    for (const d of props.dynamics) {
      const tr = d.body.translation();
      if (Math.hypot(tr.x - d.home.x, tr.y - d.home.y, tr.z - d.home.z) > 1.2) {
        unlock('knock');
        break;
      }
    }
    const horn = input.horn();
    audio.setHorn(horn);
    if (horn && !honked) unlock('horn');
    honked = horn;
    audio.setDrive(speed);

    props.update(dt, near, now, pos);
    toys.update();
    if (toys.pinsDown() === 10) unlock('strike');
    if (toys.scored()) unlock('goal');
    if (toys.wallMoved() >= 10) unlock('demolition');
    chase.update(pos, car.yaw(), dt, input.lookRate());
    sky.follow(pos);
    sky.update(dt, renderer);
    uiApi.drawMap(pos.x, pos.z, car.yaw());
    renderer.render(scene, chase.camera);
    requestAnimationFrame(tick);
  };

  uiApi.ready();
  // The board in the world shows the newest notes; refreshed now and every two
  // minutes while the tab is visible. Failures are quiet: the board just waits.
  void refreshMessages();
  setInterval(() => !document.hidden && void refreshMessages(), 120000);
  requestAnimationFrame(tick);

  // A handle for the automated drive test. Development builds only.
  if (import.meta.env.DEV) {
    (window as unknown as { __offroad: unknown }).__offroad = { car, input, world, circuit, props, toys, uiApi, audio, renderStyle };
  }
}
