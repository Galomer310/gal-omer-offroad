/**
 * The guestbook's notice board, standing in the world: the six newest
 * messages pinned to it as paper notes, drawn on a canvas. It is the reason
 * to drive there; the card next to it is where you read them all and write.
 */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import { AREA_POS, COLORS } from './config';
import { getLang, onLang } from './i18n';
import type { Message } from './social';
import { heightAt } from './terrain';

const W = 1024;
const H = 640;
const NOTE_COLORS = ['#FFF6D8', '#FDE9B2', '#F6F1E6', '#FFE3C2', '#EFF3E2', '#FBEFD5'];
const HEBREW = /[֐-׿]/;

export interface NoticeBoard {
  group: THREE.Group;
  setMessages(m: Message[]): void;
}

export function buildNoticeBoard(world: RAPIER.World): NoticeBoard {
  const p = AREA_POS.guestbook;
  const group = new THREE.Group();

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  const wood = new THREE.MeshStandardMaterial({ color: '#8A5A36', roughness: 0.9, flatShading: true });
  const boardW = 6.4, boardH = 4;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(boardW, boardH), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
  face.position.set(0, 3.3, 0.08);
  const back = new THREE.Mesh(new THREE.BoxGeometry(boardW + 0.4, boardH + 0.4, 0.14), wood);
  back.position.set(0, 3.3, 0);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(boardW + 1, 0.18, 0.9), new THREE.MeshStandardMaterial({ color: COLORS.navy, flatShading: true }));
  roof.position.set(0, 5.55, 0.15);
  group.add(face, back, roof);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 5.6, 0.25), wood);
    post.position.set((sx * (boardW + 0.2)) / 2, 2.8, -0.05);
    group.add(post);
  }
  group.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });

  // Behind the ring, away from the map centre, facing the ring.
  const out = Math.atan2(p.z, p.x);
  const x = p.x + Math.cos(out) * 13;
  const z = p.z + Math.sin(out) * 13;
  const face_ = Math.atan2(p.x - x, p.z - z);
  group.position.set(x, heightAt(x, z), z);
  group.rotation.y = face_;
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), face_);
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(boardW / 2 + 0.3, 2.8, 0.2)
      .setTranslation(x, heightAt(x, z) + 2.8, z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
  );

  let current: Message[] = [];

  const wrap = (ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] => {
    const words = text.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    return lines.slice(0, 4);
  };

  const draw = () => {
    const ctx = canvas.getContext('2d')!;
    // Cork.
    ctx.fillStyle = '#C89B6A';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(120,80,40,0.10)' : 'rgba(255,240,210,0.08)';
      ctx.fillRect((i * 97) % W, (i * 57) % H, 3, 3);
    }
    const family = `Rubik, 'Segoe UI', Arial, sans-serif`;
    const notes = current.slice(0, 6);
    if (!notes.length) {
      ctx.fillStyle = COLORS.navy;
      ctx.font = `600 54px ${family}`;
      ctx.textAlign = 'center';
      ctx.direction = getLang() === 'he' ? 'rtl' : 'ltr';
      ctx.fillText(getLang() === 'he' ? 'השאירו את הפתק הראשון' : 'Leave the first note', W / 2, H / 2);
    }
    notes.forEach((m, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const nw = 300, nh = 270;
      const cx = 40 + col * 330 + nw / 2;
      const cy = 40 + row * 300 + nh / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(((i * 37) % 9 - 4) * 0.012);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(-nw / 2 + 6, -nh / 2 + 8, nw, nh);
      ctx.fillStyle = NOTE_COLORS[i % NOTE_COLORS.length];
      ctx.fillRect(-nw / 2, -nh / 2, nw, nh);
      // The pin.
      ctx.fillStyle = i % 2 ? COLORS.accent : COLORS.navy;
      ctx.beginPath();
      ctx.arc(0, -nh / 2 + 18, 10, 0, Math.PI * 2);
      ctx.fill();

      const rtl = HEBREW.test(m.body) || HEBREW.test(m.name);
      ctx.direction = rtl ? 'rtl' : 'ltr';
      ctx.textAlign = rtl ? 'right' : 'left';
      const left = -nw / 2 + 22, right = nw / 2 - 22;
      const tx = rtl ? right : left;
      ctx.fillStyle = '#2A2A30';
      ctx.font = `400 30px ${family}`;
      wrap(ctx, m.body, nw - 44).forEach((line, k) => ctx.fillText(line, tx, -nh / 2 + 72 + k * 38));
      ctx.fillStyle = COLORS.accent;
      ctx.font = `600 26px ${family}`;
      ctx.fillText(`— ${m.name}`, tx, nh / 2 - 26);
      ctx.restore();
    });
    tex.needsUpdate = true;
  };

  draw();
  onLang(draw);

  return {
    group,
    setMessages(m) {
      current = m;
      draw();
    },
  };
}
