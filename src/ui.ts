/**
 * The HTML layer over the 3D canvas: intro, HUD, the "press Enter" prompt,
 * the card each place opens, the map, achievements, toasts, the lap timer and
 * the touch controls. Text content is ordinary DOM, so it can be read by a
 * screen reader and selected and copied, which a 3D label cannot.
 */
import { ACHIEVEMENTS } from './achievements';
import type { AchievementId, Achievements } from './achievements';
import { AREAS, entryById } from './areas';
import type { AreaDef } from './areas';
import { AREA_POS, CLASSIC_URL, WORLD_HALF } from './config';
import type { AreaId } from './config';
import { STATUS_LABEL, isReachable } from './content/types';
import { circuitPoints } from './terrain';
import { getLang, keyHelp, onLang, setLang, t, ui } from './i18n';
import type { Input } from './input';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface UI {
  ready(): void;
  showPrompt(area: AreaDef | null): void;
  openCard(area: AreaDef): void;
  closeAll(): boolean;
  anyOpen(): boolean;
  toggleMap(): boolean;
  drawMap(x: number, z: number, yaw: number): void;
  toast(title: string, sub?: string): void;
  setTimer(text: string | null, sub?: string): void;
  setMuted(m: boolean): void;
  mapOpen(): boolean;
}

export interface UIHandlers {
  onStart(): void;
  onMute(): void;
  onRespawn(): void;
  onTime(): void;
  onReset(): void;
  onAchieve(id: AchievementId): void;
}

export function createUI(input: Input, achievements: Achievements, mapImage: HTMLCanvasElement, h: UIHandlers): UI {
  const intro = $('#intro');
  const card = $('#card');
  const cardBody = $('#card-body');
  const prompt = $<HTMLButtonElement>('#prompt');
  const map = $('#map');
  const mapCanvas = $<HTMLCanvasElement>('#map-canvas');
  const achv = $('#achv');
  const timer = $('#timer');
  let openArea: AreaDef | null = null;
  let promptArea: AreaDef | null = null;
  let lastFocus: HTMLElement | null = null;

  /* --- static text, redrawn on language change --------------------------- */
  const renderStatic = () => {
    document.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => {
      const key = el.dataset.t as keyof typeof ui;
      el.textContent = t(ui[key]);
    });
    document.querySelectorAll<HTMLElement>('[data-t-label]').forEach((el) => {
      const key = el.dataset.tLabel as keyof typeof ui;
      el.setAttribute('aria-label', t(ui[key]));
      el.title = t(ui[key]);
    });
    $('#keys').innerHTML = keyHelp
      .map(([k, what]) => `<li><kbd dir="ltr">${esc(k)}</kbd><span>${esc(t(what))}</span></li>`)
      .join('');
    document.querySelectorAll<HTMLButtonElement>('.lang-btn').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.lang === getLang()));
    });
    if (openArea) renderCard(openArea);
    if (promptArea) showPrompt(promptArea);
    if (!achv.hidden) renderAchievements();
  };

  /* --- classic link ------------------------------------------------------- */
  document.querySelectorAll<HTMLAnchorElement>('.classic-link').forEach((a) => {
    if (CLASSIC_URL) a.href = CLASSIC_URL;
    else a.hidden = true;
  });

  /* --- intro -------------------------------------------------------------- */
  $('#start').addEventListener('click', () => {
    intro.hidden = true;
    $('#hud').hidden = false;
    if (matchMedia('(pointer: coarse)').matches) $('#touch').hidden = false;
    input.enabled = true;
    h.onStart();
    (document.querySelector('canvas') as HTMLCanvasElement | null)?.focus();
  });
  document.querySelectorAll<HTMLButtonElement>('.lang-btn').forEach((b) =>
    b.addEventListener('click', () => setLang(b.dataset.lang as 'en' | 'he')),
  );
  onLang(renderStatic);

  /* --- HUD buttons -------------------------------------------------------- */
  $('#btn-map').addEventListener('click', () => toggleMap());
  $('#btn-achv').addEventListener('click', () => toggleAchievements());
  $('#btn-mute').addEventListener('click', () => h.onMute());
  $('#btn-respawn').addEventListener('click', () => h.onRespawn());
  $('#btn-time').addEventListener('click', () => h.onTime());
  $('#btn-reset').addEventListener('click', () => h.onReset());
  $('#btn-help').addEventListener('click', () => {
    closeAll();
    intro.hidden = false;
    input.enabled = false;
    $<HTMLButtonElement>('#start').focus();
  });
  prompt.addEventListener('click', () => promptArea && openCard(promptArea));
  document.querySelectorAll<HTMLButtonElement>('.close').forEach((b) => b.addEventListener('click', () => closeAll()));

  /* --- prompt ------------------------------------------------------------- */
  function showPrompt(area: AreaDef | null) {
    promptArea = area;
    if (!area || openArea) {
      prompt.hidden = true;
      return;
    }
    prompt.hidden = false;
    prompt.innerHTML = `<kbd dir="ltr">Enter</kbd><span>${esc(t(ui.enterPrompt))}</span><b>${esc(t(area.title))}</b>`;
  }

  /* --- card --------------------------------------------------------------- */
  function renderCard(area: AreaDef) {
    const lang = getLang();
    const entries = area.entries.map(entryById).filter((e) => !!e);
    cardBody.innerHTML = `
      <p class="eyebrow mono" dir="ltr">~/${area.id}</p>
      <h2 id="card-title">${esc(t(area.title))}</h2>
      <p class="lead">${esc(t(area.lead))}</p>
      ${entries
        .map(
          (e) => `
        <article class="entry">
          <header>
            <h3>${esc(e.name)}</h3>
            <span class="pill ${isReachable(e.status) ? 'live' : 'idle'} mono">${esc(t(STATUS_LABEL[e.status]))}</span>
          </header>
          <p class="meta mono" dir="ltr">${esc(e.meta)}</p>
          <p>${esc(t(e.summary))}</p>
          <dl>${e.facts.map((f) => `<dt class="mono" dir="ltr">${esc(f.k)}</dt><dd>${esc(t(f.v))}</dd>`).join('')}</dl>
          ${
            e.links
              ? `<p class="links">${(['live', 'code', 'video'] as const)
                  .filter((k) => e.links![k])
                  .map((k) => `<a href="${esc(e.links![k]!)}" target="_blank" rel="noopener">${k === 'live' ? (lang === 'he' ? 'דמו חי' : 'Live demo') : k === 'code' ? (lang === 'he' ? 'קוד' : 'Code') : lang === 'he' ? 'סרטון' : 'Video'}</a>`)
                  .join('')}</p>`
              : ''
          }
        </article>`,
        )
        .join('')}
      ${area.extra ? `<div class="extra">${area.extra(lang)}</div>` : ''}
      ${area.mount ? '<div class="mount"></div>' : ''}
    `;
    // Live parts (the guestbook, the lap board) fill themselves in after the card is drawn.
    const mountPoint = cardBody.querySelector<HTMLElement>('.mount');
    if (area.mount && mountPoint) area.mount(mountPoint, { achieve: h.onAchieve });
  }

  function openCard(area: AreaDef) {
    closeAll();
    openArea = area;
    lastFocus = document.activeElement as HTMLElement | null;
    renderCard(area);
    card.hidden = false;
    card.scrollTop = 0;
    cardBody.scrollTop = 0;
    input.enabled = false;
    prompt.hidden = true;
    $<HTMLButtonElement>('#card .close').focus();
  }

  /* --- map ---------------------------------------------------------------- */
  function toggleMap(): boolean {
    if (!map.hidden) {
      closeAll();
      return false;
    }
    closeAll();
    map.hidden = false;
    input.enabled = false;
    $<HTMLButtonElement>('#map .close').focus();
    return true;
  }

  const track = circuitPoints(64);
  function drawMap(x: number, z: number, yaw: number) {
    if (map.hidden) return;
    const size = Math.min(window.innerWidth - 32, window.innerHeight - 140, 560);
    const dpr = Math.min(window.devicePixelRatio, 2);
    if (mapCanvas.width !== Math.round(size * dpr)) {
      mapCanvas.width = Math.round(size * dpr);
      mapCanvas.height = Math.round(size * dpr);
      mapCanvas.style.width = `${size}px`;
      mapCanvas.style.height = `${size}px`;
    }
    const ctx = mapCanvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The map is drawn the way the world looks from the start: facing +z, so
    // +z is up the page and +x is to the left. That is the terrain image
    // (which has -z at the top and +x to the right) turned half a circle.
    const toPx = (wx: number, wz: number): [number, number] => [
      ((WORLD_HALF - wx) / (WORLD_HALF * 2)) * size,
      ((WORLD_HALF - wz) / (WORLD_HALF * 2)) * size,
    ];
    ctx.imageSmoothingEnabled = true;
    ctx.save();
    ctx.translate(size, size);
    ctx.rotate(Math.PI);
    ctx.drawImage(mapImage, 0, 0, size, size);
    ctx.restore();

    ctx.strokeStyle = 'rgba(31,45,77,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    track.forEach((p, i) => {
      const [px, py] = toPx(p.x, p.y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.stroke();

    ctx.font = `600 13px Rubik, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.direction = getLang() === 'he' ? 'rtl' : 'ltr';
    for (const a of AREAS) {
      const [px, py] = toPx(AREA_POS[a.id as AreaId].x, AREA_POS[a.id as AreaId].z);
      ctx.fillStyle = '#FFB547';
      ctx.strokeStyle = '#1F2D4D';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const label = t(a.title);
      const w = ctx.measureText(label).width + 12;
      ctx.fillStyle = 'rgba(31,45,77,0.88)';
      ctx.beginPath();
      ctx.roundRect(px - w / 2, py - 30, w, 19, 5);
      ctx.fill();
      ctx.fillStyle = '#FAF6EE';
      ctx.fillText(label, px, py - 16);
    }

    // The car: an arrow pointing where it faces. Forward is (cos, −sin) in
    // world (x, z); on this page that is (−cos, +sin), an angle of π − yaw.
    const [cx, cy] = toPx(x, z);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI - yaw);
    ctx.fillStyle = '#F2C230';
    ctx.strokeStyle = '#1F2D4D';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(-7, 7);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-7, -7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /* --- achievements ------------------------------------------------------- */
  function renderAchievements() {
    $('#achv-count').textContent = `${achievements.count()} / ${ACHIEVEMENTS.length}`;
    $('#achv-list').innerHTML = ACHIEVEMENTS.map((a) => {
      const done = achievements.has(a.id);
      return `<li class="${done ? 'done' : ''}"><span class="medal" aria-hidden="true">${done ? '★' : '☆'}</span>
        <div><b>${esc(t(a.title))}</b><small>${esc(t(a.how))}</small></div>
        <span class="sr">${done ? '✓' : ''}</span></li>`;
    }).join('');
  }
  function toggleAchievements() {
    if (!achv.hidden) {
      closeAll();
      return;
    }
    closeAll();
    renderAchievements();
    achv.hidden = false;
    input.enabled = false;
    $<HTMLButtonElement>('#achv .close').focus();
  }

  /* --- closing ------------------------------------------------------------ */
  function closeAll(): boolean {
    const was = !card.hidden || !map.hidden || !achv.hidden;
    card.hidden = true;
    map.hidden = true;
    achv.hidden = true;
    openArea = null;
    if (intro.hidden) input.enabled = true;
    if (was) {
      (lastFocus && document.body.contains(lastFocus) ? lastFocus : (document.querySelector('canvas') as HTMLElement))?.focus();
      showPrompt(promptArea);
    }
    return was;
  }

  /* --- toasts ------------------------------------------------------------- */
  function toast(title: string, sub?: string) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.innerHTML = `<b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`;
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3700);
  }

  /* --- touch controls ----------------------------------------------------- */
  {
    const pad = $('#stick');
    const knob = $('#knob');
    let id: number | null = null;
    const move = (e: PointerEvent) => {
      const r = pad.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = (e.clientX - cx) / (r.width / 2);
      let dy = (e.clientY - cy) / (r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      input.touch.x = dx;
      input.touch.y = -dy;
      knob.style.transform = `translate(${dx * 38}px, ${dy * 38}px)`;
    };
    pad.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      pad.setPointerCapture(e.pointerId);
      move(e);
    });
    pad.addEventListener('pointermove', (e) => e.pointerId === id && move(e));
    const release = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      input.touch.x = 0;
      input.touch.y = 0;
      knob.style.transform = '';
    };
    pad.addEventListener('pointerup', release);
    pad.addEventListener('pointercancel', release);

    const hold = (sel: string, key: 'boost' | 'brake' | 'horn' | 'jump') => {
      const b = $(sel);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        input.touch[key] = true;
      });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => (input.touch[key] = false));
    };
    hold('#t-boost', 'boost');
    hold('#t-brake', 'brake');
    hold('#t-horn', 'horn');
    hold('#t-jump', 'jump');
  }

  renderStatic();

  return {
    ready() {
      $('#loading').hidden = true;
      intro.hidden = false;
      $<HTMLButtonElement>('#start').focus();
    },
    showPrompt,
    openCard,
    closeAll,
    anyOpen: () => !card.hidden || !map.hidden || !achv.hidden || !intro.hidden,
    toggleMap,
    drawMap,
    toast,
    setTimer(text, sub) {
      timer.hidden = text === null;
      if (text !== null) timer.innerHTML = `<b dir="ltr">${esc(text)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`;
    },
    setMuted(m) {
      $('#btn-mute').setAttribute('aria-pressed', String(!m));
      $('#btn-mute').classList.toggle('off', m);
    },
    mapOpen: () => !map.hidden,
  };
}
