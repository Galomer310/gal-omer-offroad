// Music check in a real browser: start the game, cycle the four styles with P
// and measure what actually comes out of the speakers.
//
//   npm run test:music                              # the live site on Render
//   npm run test:music -- http://localhost:5190/    # local dev server
//
// Locally, run the API too (cd server && npm run dev): without it the page logs
// connection errors and the "no page errors" check fails.
//
// It starts its own headless Edge (or Chrome) with a throwaway profile and
// closes it at the end. Set BROWSER_PATH to use another Chromium browser.
// Screenshots and the measurements go to a temp folder printed at the end.
//
// How it listens: before the page loads, AudioNode.connect is wrapped so any
// connection into the AudioContext destination is also fed to an analyser.
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const URL = process.argv[2] || 'https://gal-omer-offroad.onrender.com/';
const PORT = 9335;
const MEASURE_MS = 6000;

// Thresholds. The live site measured -22..-27 dB RMS and peaks 0.29..0.47.
const MIN_RMS_DB = -40; // quieter than this = effectively silent
const MAX_PEAK = 0.99; // at 1.0 the output clips
const MIN_BAND_DIFF = 5; // % of energy moved between bands: styles must differ

const browserPath =
  process.env.BROWSER_PATH ||
  [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/microsoft-edge',
    '/usr/bin/google-chrome',
  ].find((p) => fs.existsSync(p));
if (!browserPath) {
  console.error('No Edge or Chrome found. Set BROWSER_PATH.');
  process.exit(2);
}

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'offroad-music-'));
const profile = path.join(outDir, 'profile');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!ok) failures.push(msg);
};

// puppeteer.launch broke with Edge 156, so start the browser ourselves and connect.
const proc = spawn(
  browserPath,
  [
    '--headless=new',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${PORT}`,
    '--disable-extensions', // extensions in a real profile throw errors that are not ours
    '--autoplay-policy=no-user-gesture-required',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-first-run',
    '--lang=en-US',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let browser;
try {
  for (let i = 0; ; i++) {
    try {
      browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}` });
      break;
    } catch (e) {
      if (i > 40) throw e;
      await sleep(250);
    }
  }
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });

  await page.evaluateOnNewDocument(() => {
    const orig = AudioNode.prototype.connect;
    window.__taps = [];
    AudioNode.prototype.connect = function (dest, ...rest) {
      if (dest instanceof AudioDestinationNode) {
        const an = this.context.createAnalyser();
        an.fftSize = 4096;
        orig.call(this, an);
        window.__taps.push(an);
        window.__ctx = this.context;
      }
      return orig.call(this, dest, ...rest);
    };
    // RMS, peak, spectral centroid and the share of energy in 8 octave bands from 50 Hz.
    window.__measure = async (ms) => {
      const an = window.__taps[0];
      const td = new Float32Array(an.fftSize);
      const fd = new Float32Array(an.frequencyBinCount);
      const bands = new Array(8).fill(0);
      let sum = 0, cnt = 0, peak = 0, cen = 0, cenN = 0;
      const hz = an.context.sampleRate / an.fftSize;
      const end = performance.now() + ms;
      while (performance.now() < end) {
        an.getFloatTimeDomainData(td);
        for (const v of td) {
          sum += v * v;
          cnt++;
          peak = Math.max(peak, Math.abs(v));
        }
        an.getFloatFrequencyData(fd);
        let num = 0, den = 0;
        for (let i = 1; i < fd.length; i++) {
          const p = Math.pow(10, fd[i] / 10);
          num += p * i * hz;
          den += p;
          bands[Math.min(7, Math.floor(Math.log2(Math.max(1, (i * hz) / 50))))] += p;
        }
        if (den > 0) {
          cen += num / den;
          cenN++;
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      const tot = bands.reduce((a, b) => a + b, 0) || 1;
      return {
        rmsDb: +(10 * Math.log10(sum / cnt || 1e-12)).toFixed(1),
        peak: +peak.toFixed(3),
        centroidHz: Math.round(cen / (cenN || 1)),
        bands: bands.map((b) => +((100 * b) / tot).toFixed(1)),
      };
    };
  });

  const toasts = () => page.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map((e) => e.textContent));
  const stored = () => page.evaluate(() => localStorage.getItem('offroad.music'));

  console.log(`URL: ${URL}`);
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 90000 }); // a sleeping Render site can take a while
  await page.waitForSelector('#start', { visible: true, timeout: 60000 });
  await sleep(1500);
  await page.click('#start');
  await page.waitForFunction(() => window.__taps.length > 0, { timeout: 60000 });
  check((await page.evaluate(() => window.__ctx.state)) === 'running', 'audio context is running after Start');
  // Headless Edge has no sound card: its audio clock can sit at 0 for 5-10 s
  // after Start while the output device comes up. The music is scheduled on
  // that clock, so wait for it to move before listening.
  const waited = Date.now();
  await page.waitForFunction(() => window.__ctx.currentTime > 0.5, { timeout: 30000, polling: 100 });
  console.log(`      audio clock started ${((Date.now() - waited) / 1000).toFixed(1)} s after Start`);
  await sleep(1500);

  const results = [];
  let djSeen = false;
  for (let i = 0; i < 4; i++) {
    let name = '(first style)';
    if (i > 0) {
      const before = (await toasts()).length;
      await page.keyboard.press('KeyP');
      await sleep(300);
      const shown = (await toasts()).slice(before);
      name = shown.find((s) => s.startsWith('♫')) || '';
      if (shown.some((s) => s.includes('DJ'))) djSeen = true;
      await page.screenshot({ path: path.join(outDir, `style-${i}.png`) });
      await sleep(2500); // let the crossfade finish
    }
    const m = await page.evaluate((ms) => window.__measure(ms), MEASURE_MS);
    const r = { i, name, stored: await stored(), ...m };
    results.push(r);
    console.log(`      ${JSON.stringify(r)}`);
  }

  // P once more goes back to the first style.
  const before = (await toasts()).length;
  await page.keyboard.press('KeyP');
  await sleep(300);
  results[0].name = (await toasts()).slice(before).find((s) => s.startsWith('♫')) || '';
  const storedAfterWrap = await stored();

  for (const r of results) {
    check(r.rmsDb > MIN_RMS_DB, `${r.name}: plays (${r.rmsDb} dB RMS > ${MIN_RMS_DB})`);
    check(r.peak < MAX_PEAK, `${r.name}: does not clip (peak ${r.peak} < ${MAX_PEAK})`);
  }
  for (let i = 1; i < 4; i++) check(results[i].stored === String(i), `style ${i} remembered in localStorage (got ${results[i].stored})`);
  const names = results.map((r) => r.name);
  check(names.every(Boolean) && new Set(names).size === 4, `P shows four different style names: ${names.join(' | ')}`);
  check(storedAfterWrap === '0', `P after the last style goes back to the first (stored ${storedAfterWrap})`);
  check(djSeen, 'DJ achievement unlocks after trying all styles');

  for (let a = 0; a < 4; a++)
    for (let b = a + 1; b < 4; b++) {
      const diff = results[a].bands.reduce((s, v, k) => s + Math.abs(v - results[b].bands[k]), 0) / 2;
      check(diff >= MIN_BAND_DIFF, `${names[a]} and ${names[b]} sound different (${diff.toFixed(1)}% of energy in other bands)`);
    }

  // Switch to style 2, reload: the choice survives.
  await page.keyboard.press('KeyP');
  await sleep(300);
  await page.keyboard.press('KeyP');
  await sleep(300);
  await page.reload({ waitUntil: 'networkidle2' });
  check((await stored()) === '2', `choice survives a reload (stored ${await stored()})`);

  const appErrors = errors.filter((e) => !/chrome-extension:|activeContent/.test(e));
  check(appErrors.length === 0, `no page errors${appErrors.length ? ': ' + appErrors.join(' / ') : ''}`);

  fs.writeFileSync(path.join(outDir, 'music.json'), JSON.stringify(results, null, 2));
  await page.close();
} catch (e) {
  failures.push(String(e?.stack || e));
  console.error(e);
} finally {
  if (browser) await browser.close().catch(() => {});
  proc.kill();
}

console.log(`\nScreenshots and measurements: ${outDir}`);
console.log(failures.length ? `\n${failures.length} FAILED` : '\nAll music checks passed');
process.exit(failures.length ? 1 : 0);
