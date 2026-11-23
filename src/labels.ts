/**
 * Text in the world: sprites (always facing the camera) and flat boards, drawn
 * on a canvas. Every label is registered so a language switch redraws them all.
 */
import * as THREE from 'three';
import { COLORS } from './config';
import type { Bilingual, Lang } from './content/types';
import { getLang, onLang } from './i18n';

interface Style {
  bg: string;
  fg: string;
  sub?: string;
  /** Canvas pixels; the world size is set by `height` (metres). */
  font: number;
}

const STYLES = {
  area: { bg: COLORS.navy, fg: COLORS.yellow, sub: COLORS.cream, font: 64 },
  tag: { bg: COLORS.cream, fg: COLORS.navy, sub: COLORS.accent, font: 46 },
} satisfies Record<string, Style>;

type StyleName = keyof typeof STYLES;

interface Registered {
  draw: (lang: Lang) => void;
}
const registry: Registered[] = [];
onLang((l) => registry.forEach((r) => r.draw(l)));

function paint(canvas: HTMLCanvasElement, lang: Lang, main: string, sub: string | undefined, style: Style): number {
  const ctx = canvas.getContext('2d')!;
  const family = `Rubik, 'Segoe UI', Arial, sans-serif`;
  const pad = style.font * 0.55;
  ctx.font = `600 ${style.font}px ${family}`;
  const wMain = ctx.measureText(main).width;
  let wSub = 0;
  if (sub) {
    ctx.font = `400 ${style.font * 0.55}px ${family}`;
    wSub = ctx.measureText(sub).width;
  }
  const w = Math.ceil(Math.max(wMain, wSub) + pad * 2);
  const h = Math.ceil(style.font * (sub ? 1.95 : 1.45));
  canvas.width = w;
  canvas.height = h;

  ctx.fillStyle = style.bg;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, style.font * 0.3);
  ctx.fill();

  ctx.direction = lang === 'he' ? 'rtl' : 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = style.fg;
  ctx.font = `600 ${style.font}px ${family}`;
  ctx.fillText(main, w / 2, sub ? style.font * 0.72 : h / 2);
  if (sub) {
    ctx.fillStyle = style.sub ?? style.fg;
    ctx.font = `400 ${style.font * 0.55}px ${family}`;
    ctx.fillText(sub, w / 2, style.font * 1.5);
  }
  return w / h;
}

/**
 * WebGL2 textures are allocated once at a fixed size. A label's canvas changes
 * size with its text (Hebrew and English differ), so the GPU copy must be
 * released and re-created, or the new text is clipped or never shown.
 */
function refresh(tex: THREE.CanvasTexture) {
  tex.dispose();
  tex.needsUpdate = true;
}

/** A label that always faces the camera. */
export function sprite(text: Bilingual, opts: { style?: StyleName; sub?: Bilingual; height?: number } = {}): THREE.Sprite {
  const style = STYLES[opts.style ?? 'tag'];
  const canvas = document.createElement('canvas');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  const height = opts.height ?? 1.4;

  const draw = (lang: Lang) => {
    const aspect = paint(canvas, lang, text[lang], opts.sub?.[lang], style);
    refresh(tex);
    s.scale.set(height * aspect, height, 1);
  };
  draw(getLang());
  registry.push({ draw });
  return s;
}

/** A flat board with text on both faces, e.g. the big name sign. */
export function board(text: Bilingual, sub: Bilingual, width: number): THREE.Group {
  const style: Style = { bg: COLORS.cream, fg: COLORS.navy, sub: COLORS.accent, font: 90 };
  const canvas = document.createElement('canvas');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  const g = new THREE.Group();
  const front = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  const back = front.clone();
  back.rotation.y = Math.PI;
  back.position.z = -0.01;
  g.add(front, back);

  const draw = (lang: Lang) => {
    const aspect = paint(canvas, lang, text[lang], sub[lang], style);
    refresh(tex);
    g.children.forEach((m) => m.scale.set(width, width / aspect, 1));
  };
  draw(getLang());
  registry.push({ draw });
  return g;
}
