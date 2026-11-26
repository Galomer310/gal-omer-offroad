/**
 * Sound: the background music (four styles, see music.ts) and the effects —
 * horn, landing thud, achievement chime. All synthesised with Web Audio, so
 * there is nothing to download and nothing licensed. Starts only after a
 * click, as browsers require.
 *
 * Switching styles crossfades: the current style fades out over half a
 * second while the next one is lined up to start on a fresh bar.
 */
import type { Bilingual } from './content/types';
import { STYLES, buildMusic, stepSeconds, voice } from './music';
import type { MusicGraph, StyleRun } from './music';

const MUTE_KEY = 'offroad.muted';
const STYLE_KEY = 'offroad.music';

export interface Audio {
  start(): void;
  /** Speed (m/s) gently opens the music's filter. */
  setDrive(speed: number): void;
  setHorn(on: boolean): void;
  thud(strength: number): void;
  chime(): void;
  toggleMute(): boolean;
  muted(): boolean;
  /** Move to the next music style; returns its name. */
  nextStyle(): Bilingual;
  styleIndex(): number;
}

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* not essential */
  }
};

export function createAudio(): Audio {
  let ctx: AudioContext | null = null;
  let master: GainNode;
  let hornGain: GainNode;
  let graph: MusicGraph;
  let run: StyleRun;
  let muted = read(MUTE_KEY) === '1';
  let style = Math.max(0, Math.min(STYLES.length - 1, Number(read(STYLE_KEY) ?? 0) || 0));
  let n = 0;
  let nextStep = 0;
  let switching = false;

  const now = () => ctx!.currentTime;
  const MUSIC_LEVEL = 0.9;

  /** Schedule a little ahead, so timing never depends on the frame rate. */
  const schedule = () => {
    if (!ctx || switching) return;
    const s = stepSeconds(STYLES[style]);
    while (nextStep < now() + 0.6) {
      run.step(graph.kit, nextStep, n, s);
      nextStep += s;
      n++;
    }
  };

  /** Point the echo at the new tempo and start the style from its first step. */
  const begin = (at: number) => {
    run = STYLES[style].create();
    n = 0;
    nextStep = at;
  };

  return {
    start() {
      if (ctx) return;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.85;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp).connect(ctx.destination);

      graph = buildMusic(ctx, master, stepSeconds(STYLES[style]) * 1.5);
      graph.bus.gain.value = MUSIC_LEVEL;
      begin(now() + 0.2);

      // Horn: two square waves a third apart.
      hornGain = ctx.createGain();
      hornGain.gain.value = 0;
      const hf = ctx.createBiquadFilter();
      hf.type = 'lowpass';
      hf.frequency.value = 1800;
      for (const f of [370, 466]) {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = f;
        o.connect(hf);
        o.start();
      }
      hf.connect(hornGain).connect(master);

      schedule();
      window.setInterval(schedule, 150);
      // Pause with the tab; resume from where it was.
      document.addEventListener('visibilitychange', () => {
        if (!ctx) return;
        if (document.hidden) void ctx.suspend();
        else void ctx.resume().then(() => (nextStep = Math.max(nextStep, now() + 0.1)));
      });
    },
    nextStyle() {
      style = (style + 1) % STYLES.length;
      write(STYLE_KEY, String(style));
      if (ctx && !switching) {
        // Fade the old style out, then start the new one on a fresh bar.
        switching = true;
        const t = now();
        graph.bus.gain.cancelScheduledValues(t);
        graph.bus.gain.setValueAtTime(graph.bus.gain.value, t);
        graph.bus.gain.linearRampToValueAtTime(0, t + 0.5);
        window.setTimeout(() => {
          if (!ctx) return;
          // Re-tune the echo to the new tempo by rebuilding the graph. The old
          // one has faded out; disconnect it once its reverb tail is gone.
          const old = graph;
          window.setTimeout(() => old.dispose(), 4000);
          graph = buildMusic(ctx, master, stepSeconds(STYLES[style]) * 1.5);
          graph.bus.gain.setValueAtTime(0, now());
          graph.bus.gain.linearRampToValueAtTime(MUSIC_LEVEL, now() + 0.6);
          begin(now() + 0.05);
          switching = false;
          schedule();
        }, 550);
      }
      return STYLES[style].name;
    },
    styleIndex: () => style,
    setDrive(speed) {
      if (!ctx) return;
      const s = Math.min(Math.abs(speed), 34);
      graph.filter.frequency.setTargetAtTime(1500 + s * 60, now(), 0.4);
    },
    setHorn(on) {
      if (!ctx) return;
      hornGain.gain.setTargetAtTime(on ? 0.09 : 0, now(), 0.02);
    },
    thud(strength) {
      if (!ctx) return;
      const len = 0.18;
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 220;
      const g = ctx.createGain();
      g.gain.value = Math.min(1, strength) * 0.9;
      src.connect(f).connect(g).connect(master);
      src.start();
    },
    chime() {
      if (!ctx) return;
      const kit = graph.kit;
      [74, 78, 81].forEach((m, i) => voice(kit, 440 * 2 ** ((m - 69) / 12), now() + i * 0.09, 0.55, 0.12, master, 'sine', 0.02, 0.45, 0));
    },
    toggleMute() {
      muted = !muted;
      write(MUTE_KEY, muted ? '1' : '0');
      if (ctx) master.gain.setTargetAtTime(muted ? 0 : 0.85, now(), 0.05);
      return muted;
    },
    muted: () => muted,
  };
}
