/**
 * Sunrise: a gradient dome with a soft sun, a warm low key light that casts
 * long shadows, and peach fog that hides the edge of the world.
 */
import * as THREE from 'three';
import { COLORS } from './config';

/** Where the sun is: low in the east (+x), slightly south. */
export const SUN_DIR = new THREE.Vector3(1, 0.32, -0.45).normalize();

export interface Sky {
  dome: THREE.Mesh;
  sun: THREE.DirectionalLight;
  /** Keep the shadow camera centred on the car. */
  follow(target: THREE.Vector3): void;
}

export function buildSky(scene: THREE.Scene): Sky {
  // Far enough that the dunes keep their shape; pale so the sand stays sand.
  scene.fog = new THREE.Fog(COLORS.fog, 150, 430);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(600, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(COLORS.skyTop) },
        horizon: { value: new THREE.Color(COLORS.skyHorizon) },
        sunColor: { value: new THREE.Color(COLORS.sun) },
        sunDir: { value: SUN_DIR },
      },
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
          float towards = max(dot(normalize(vec3(vDir.x, 0.0, vDir.z)), normalize(vec3(sunDir.x, 0.0, sunDir.z))), 0.0);
          col = mix(col, sunColor, pow(towards, 6.0) * (1.0 - h) * 0.6);
          float d = max(dot(vDir, sunDir), 0.0);
          col += sunColor * (pow(d, 900.0) * 1.6 + pow(d, 40.0) * 0.35);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  dome.renderOrder = -1;
  scene.add(dome);

  // A cool fill from the sky against a warm key from the sun: that contrast is
  // what keeps a desert from reading as one flat orange.
  scene.add(new THREE.HemisphereLight('#CFE0F4', '#A9805A', 1.0));

  const sun = new THREE.DirectionalLight(COLORS.sun, 2.6);
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

  return {
    dome,
    sun,
    follow(target) {
      sun.target.position.copy(target);
      sun.position.copy(target).addScaledVector(SUN_DIR, 90);
      dome.position.copy(target);
    },
  };
}
