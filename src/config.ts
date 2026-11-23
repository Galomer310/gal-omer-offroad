/**
 * Everything you might want to tune lives here: the palette, where things are
 * on the map, and how the vehicle feels. Nothing in this file imports three.js,
 * so it can be read on its own.
 */

/* --------------------------------------------------------------- palette --- */
/* Negev at sunrise. Deliberately warm-gold and sand, with navy as the only
   dark: the vehicle's livery is the same white / navy / yellow as Gal's bike. */
export const COLORS = {
  skyTop: '#6F9FD0',
  skyHorizon: '#F6D2A2',
  sun: '#FFE6BA',
  fog: '#EADCC6',
  sandLight: '#F0D9B0',
  sand: '#E2BE8C',
  sandDark: '#C99A68',
  track: '#B48C62',
  rock: '#B4643E',
  rockDark: '#8E4A2E',
  acaciaTrunk: '#6E4C33',
  acaciaCrown: '#7F8F4F',
  bush: '#9A9A5C',
  cream: '#FAF6EE',
  navy: '#1F2D4D',
  yellow: '#F2C230',
  white: '#F4F2EC',
  tyre: '#2A2A2E',
  accent: '#A8481A',
  ring: '#FFB547',
} as const;

/* ------------------------------------------------------------------ world --- */
/** Half the side of the playable square, in metres. */
export const WORLD_HALF = 180;
/** Beyond this radius the ground rises into hills that keep the car in. */
export const PLAY_RADIUS = 150;

export type AreaId = 'home' | 'akeren' | 'projects' | 'career' | 'contact' | 'circuit';

export interface Spot {
  x: number;
  z: number;
}

/** Centre of each area. The ground is flattened around every one of them. */
export const AREA_POS: Record<AreaId, Spot> = {
  home: { x: 0, z: 0 },
  akeren: { x: 72, z: 38 },
  projects: { x: -72, z: 46 },
  career: { x: -62, z: -62 },
  contact: { x: 44, z: -74 },
  circuit: { x: 6, z: 118 },
};

/** Radius of the glowing ring you stop inside to open an area. */
export const AREA_RING = 9;

/** The circuit: an ellipse around AREA_POS.circuit. */
export const CIRCUIT = { rx: 50, rz: 22, gates: 6, gateRadius: 7.5 };

/** The dune you can climb for the sunrise view. */
export const SUMMIT = { x: 104, z: -48, height: 17, spread: 26 };

/**
 * Where the car starts, and where it faces: radians around Y, where 0 = +X and
 * a rotation of θ turns +X to (cos θ, 0, −sin θ). −π/2 faces +Z, towards home.
 */
export const SPAWN = { x: 0, z: -16, yaw: -Math.PI / 2 };

/* ---------------------------------------------------------------- vehicle --- */
export const VEHICLE = {
  mass: 400,
  gravity: 20,
  engineForce: 1150, // per wheel; all four are driven
  boostFactor: 1.75,
  reverseFactor: 0.55,
  maxSpeed: 24, // m/s, about 86 km/h
  maxSpeedBoost: 34,
  brake: 38,
  rolling: 3,
  maxSteer: 0.52,
  steerSpeed: 4.5,
  jumpImpulse: 7.5, // multiplied by mass
  wheelRadius: 0.55,
  suspensionRest: 0.5,
  suspensionTravel: 0.4,
  stiffness: 32,
  compression: 3.2,
  relaxation: 4.2,
  frictionSlip: 2.6,
};

/* ------------------------------------------------------------------ links --- */
/**
 * The classic portfolio. Set VITE_CLASSIC_URL when deploying; in development
 * it points at the classic site's own dev server. Empty means the link is
 * hidden rather than dead.
 */
export const CLASSIC_URL: string =
  import.meta.env.VITE_CLASSIC_URL ?? (import.meta.env.DEV ? 'http://localhost:5173' : '');

export const LINKS = {
  email: 'galomer6708@gmail.com',
  github: 'https://github.com/Galomer310',
  linkedin: 'https://www.linkedin.com/in/gal-omer/',
};
