/**
 * Boot: show the loading screen at once, check the browser can draw 3D, then
 * load the game. This file is tiny on purpose; three.js, the physics engine
 * (a WebAssembly file of its own) and the game arrive as a separate chunk.
 */
import './style.css';
import { CLASSIC_URL } from './config';
import { getLang, setLang, t, ui } from './i18n';

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function showFallback() {
  const f = document.querySelector('#fallback') as HTMLElement;
  (document.querySelector('#loading') as HTMLElement).hidden = true;
  f.hidden = false;
  f.querySelector('p')!.textContent = t(ui.noWebgl);
  const a = f.querySelector('a')!;
  if (CLASSIC_URL) a.href = CLASSIC_URL;
  a.textContent = t(ui.classic);
}

async function boot() {
  setLang(getLang()); // sets <html lang/dir>
  // The loading screen's text is set here, before the heavy chunk arrives.
  const loading = document.querySelector('#loading p');
  if (loading) loading.textContent = t(ui.loading);
  if (!webglAvailable()) return showFallback();

  // Start the download straight away; wait for the font in parallel, since
  // labels are drawn on canvases and need the real font.
  const game = import('./game');
  await Promise.race([
    Promise.all([document.fonts.load('600 64px Rubik'), document.fonts.load('400 40px Rubik')]),
    new Promise((r) => setTimeout(r, 2500)),
  ]);
  const { startGame } = await game;
  await startGame();
}

boot().catch((err) => {
  console.error(err);
  showFallback();
});
