/**
 * The sky, the sun and the fog, for three times of day: sunrise (the
 * default), noon and sunset. Switching eases between them over ~2 seconds so
 * the light moves instead of jumping.
 *
 * The palettes stay warm-gold and blue: no purple or pink evening, which is
 * another driving portfolio's signature and not ours.
 */
import * as THREE from 'three';
import type { Bilingual } from './content/types';
import { COLORS } from './config';

interface Preset {
  name: Bilingual;
  top: string;
  horizon: string;
  sun: string;
  sunDir: [number, number, number];
  sunIntensity: number;
  fog: string;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  exposure: number;
}

export const TIMES: Preset[] = [
  {
    name: { en: 'Sunrise', he: 'זריחה' },
    top: COLORS.skyTop, horizon: COLORS.skyHorizon, sun: COLORS.sun,
    sunDir: [1, 0.32, -0.45], sunIntensity: 2.6,
    fog: COLORS.fog, hemiSky: '#CFE0F4', hemiGround: '#A9805A', hemiIntensity: 1.0, exposure: 1.05,
  },
  {
    name: { en: 'Noon', he: 'צהריים' },
    top: '#3F86D4', horizon: '#CFE4F4', sun: '#FFFFFF',
    sunDir: [0.25, 1, 0.18], sunIntensity: 3.0,
    fog: '#E6E2D8', hemiSky: '#DCEBFB', hemiGround: '#B89470', hemiIntensity: 1.1, exposure: 0.95,
  },
  {
    name: { en: 'Sunset', he: 'שקיעה' },
    top: '#2B5C93', horizon: '#F5A56C', sun: '#FFB772',
    sunDir: [-1, 0.2, 0.35], sunIntensity: 2.4,
    fog: '#E2B593', hemiSky: '#A7BEDA', hemiGround: '#8F5E3C', hemiIntensity: 0.9, exposure: 1.0,
  },
];

export interface Sky {
  sun: THREE.DirectionalLight;
  /** Keep the shadow camera and the dome centred on the car. */
  follow(target: THREE.Vector3): void;
  /** Ease towards the next time of day; returns its name. */
  next(): Bilingual;
  update(dt: number, renderer: THREE.WebGLRenderer): void;
}

export function buildSky(scene: THREE.Scene): Sky {
  const fog = new THREE.Fog(COLORS.fog, 150, 430);
  scene.fog = fog;

  const sunDir = new THREE.Vector3(...TIMES[0].sunDir).normalize();
  const uniforms = {
    top: { value: new THREE.Color(TIMES[0].top) },
    horizon: { value: new THREE.Color(TIMES[0].horizon) },
    sunColor: { value: new THREE.Color(TIMES[0].sun) },
    sunDir: { value: sunDir },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(600, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDir;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 col = mix(horizon, top, pow(h, 0.55));
          // Warmer towards the sun along the horizon.
          float towards = max(dot(normalize(vec3(vDir.x, 0.0, vDir.z)), normalize(vec3(sunDir.x, 0.001, sunDir.z))), 0.0);
          col = mix(col, sunColor, pow(towards, 6.0) * (1.0 - h) * 0.6 * (1.0 - sunDir.y));
          float d = max(dot(vDir, sunDir), 0.0);
          col += sunColor * (pow(d, 900.0) * 1.6 + pow(d, 40.0) * 0.35);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  dome.renderOrder = -1;
  scene.add(dome);

  const hemi = new THREE.HemisphereLight(TIMES[0].hemiSky, TIMES[0].hemiGround, TIMES[0].hemiIntensity);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(TIMES[0].sun, TIMES[0].sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = sun.shadow.camera;
  s.left = -45;
  s.right = 45;
  s.top = 45;
  s.bottom = -45;
  s.near = 1;
  s.far = 200;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  let index = 0;
  let exposure = TIMES[0].exposure;
  const target = new THREE.Vector3();
  const tmp = new THREE.Color();
  const dirTmp = new THREE.Vector3();

  return {
    sun,
    follow(t) {
      target.copy(t);
      sun.target.position.copy(t);
      sun.position.copy(t).addScaledVector(sunDir, 90);
      dome.position.copy(t);
    },
    next() {
      index = (index + 1) % TIMES.length;
      return TIMES[index].name;
    },
    update(dt, renderer) {
      // Exponential easing towards the chosen preset: ~2 s to settle.
      const p = TIMES[index];
      const k = 1 - Math.exp(-dt * 2.2);
      uniforms.top.value.lerp(tmp.set(p.top), k);
      uniforms.horizon.value.lerp(tmp.set(p.horizon), k);
      uniforms.sunColor.value.lerp(tmp.set(p.sun), k);
      sunDir.lerp(dirTmp.set(...p.sunDir).normalize(), k).normalize();
      sun.color.lerp(tmp.set(p.sun), k);
      sun.intensity += (p.sunIntensity - sun.intensity) * k;
      fog.color.lerp(tmp.set(p.fog), k);
      hemi.color.lerp(tmp.set(p.hemiSky), k);
      hemi.groundColor.lerp(tmp.set(p.hemiGround), k);
      hemi.intensity += (p.hemiIntensity - hemi.intensity) * k;
      exposure += (p.exposure - exposure) * k;
      renderer.toneMappingExposure = exposure;
      sun.position.copy(target).addScaledVector(sunDir, 90);
    },
  };
}
