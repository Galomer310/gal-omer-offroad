/**
 * Four styles of background music, all composed here and synthesised live
 * with the Web Audio API: no audio files, no samples, no licences.
 *
 *  1. Desert Dawn   — soft D major pad, slow pentatonic melody (66 bpm)
 *  2. Lo-fi Drive   — jazzy electric-piano chords over a soft swung beat (80)
 *  3. Night Road    — synthwave: pulsing bass, wide pads, an arpeggio (96)
 *  4. Caravan       — D Hijaz scale, a plucked oud-like line, darbuka (92)
 *
 * Every style is a small sequencer that is asked, step by step (eighth notes),
 * "what plays now?". Melodies are random walks on a scale chosen so no note
 * can clash, so it never repeats exactly but never goes wrong either.
 *
 * The same code runs against a live AudioContext or an OfflineAudioContext,
 * which is how the styles are tested without speakers (see renderStyle).
 */
import type { Bilingual } from './content/types';

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

/* ------------------------------------------------------------------ kit --- */
/** Where a style sends its sound. All three feed the music filter. */
export interface Kit {
  ctx: BaseAudioContext;
  /** Pads, bass, chords: dry + reverb. */
  music: AudioNode;
  /** Melodies: also through a tempo-synced echo. */
  echo: AudioNode;
  /** Drums: less reverb, so the beat stays tight. */
  drums: AudioNode;
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
function noise(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.0), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

/** One oscillator note with an attack/hold/release envelope. */
export function voice(
  kit: Kit, freq: number, t0: number, dur: number, peak: number, dest: AudioNode,
  type: OscillatorType = 'sine', attack = 0.02, release = 0.8, detuneCents = 4,
) {
  const { ctx } = kit;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  // A touch of detune so stacked voices shimmer instead of buzzing.
  o.detune.value = (Math.random() - 0.5) * 2 * detuneCents;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.setValueAtTime(peak, t0 + Math.max(attack, dur - release));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(dest);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

/** A plucked string: bright attack that closes quickly (the oud in Caravan). */
function pluck(kit: Kit, freq: number, t0: number, peak: number, dest: AudioNode, decay = 0.7) {
  const { ctx } = kit;
  const o = ctx.createOscillator();
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  o.type = 'sawtooth';
  o.frequency.value = freq;
  f.type = 'lowpass';
  f.Q.value = 3;
  f.frequency.setValueAtTime(freq * 7, t0);
  f.frequency.exponentialRampToValueAtTime(freq * 1.4, t0 + 0.18);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
  o.connect(f).connect(g).connect(dest);
  o.start(t0);
  o.stop(t0 + decay + 0.05);
}

/** Noise through a filter with a short envelope: snares, hats, the darbuka "tek". */
function hit(kit: Kit, t0: number, peak: number, dur: number, type: BiquadFilterType, freq: number, q = 1) {
  const { ctx } = kit;
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(peak, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(kit.drums);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + dur + 0.02);
}

/** A sine that drops in pitch: kick drums, and the darbuka "dum". */
function thump(kit: Kit, t0: number, peak: number, from: number, to: number, dur: number) {
  const { ctx } = kit;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(from, t0);
  o.frequency.exponentialRampToValueAtTime(to, t0 + dur * 0.6);
  g.gain.setValueAtTime(peak, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(kit.drums);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

const kick = (k: Kit, t: number, p = 0.5) => thump(k, t, p, 130, 42, 0.38);
const snare = (k: Kit, t: number, p = 0.18) => {
  hit(k, t, p, 0.17, 'bandpass', 1900, 0.8);
  thump(k, t, p * 0.5, 210, 160, 0.09);
};
const hat = (k: Kit, t: number, p = 0.05) => hit(k, t, p, 0.045, 'highpass', 7500);

/* --------------------------------------------------------------- styles --- */
export interface StyleRun {
  /** Schedule whatever plays at step n (eighth notes), starting at time t. */
  step(kit: Kit, t: number, n: number, stepDur: number): void;
}
export interface Style {
  id: string;
  name: Bilingual;
  bpm: number;
  create(): StyleRun;
}

/** 1. Desert Dawn: the original piece. */
const dawn: Style = {
  id: 'dawn',
  name: { en: 'Desert Dawn', he: 'שחר במדבר' },
  bpm: 66,
  create() {
    const chords = [
      { pad: [62, 66, 69, 73, 76], bass: 38 }, // Dmaj9
      { pad: [59, 62, 66, 69, 74], bass: 35 }, // Bm7
      { pad: [55, 59, 62, 66, 71], bass: 31 }, // Gmaj7
      { pad: [57, 62, 64, 66, 69], bass: 33 }, // A6sus
    ];
    const scale = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83]; // D major pentatonic
    let m = 3;
    return {
      step(kit, t, n, s) {
        if (n % 16 === 0) {
          const c = chords[(n / 16) % chords.length];
          const len = s * 16 + 1.2;
          for (const p of c.pad) voice(kit, midi(p), t, len, 0.035, kit.music, 'triangle', 1.6, 2.2);
          voice(kit, midi(c.bass), t, len, 0.07, kit.music, 'sine', 0.4, 1.5);
        }
        if (n % 2 === 0 && Math.random() < 0.48) { // on the beat, about half the time
          m = Math.max(0, Math.min(scale.length - 1, m + pick([-2, -1, -1, 1, 1, 2])));
          const dur = s * 2 * (Math.random() < 0.3 ? 2 : 1) + 0.6;
          voice(kit, midi(scale[m]), t, dur, 0.05, kit.echo, 'triangle', 0.01, dur - 0.05);
        }
      },
    };
  },
};

/** 2. Lo-fi Drive: Dm9 – G9 – Cmaj9 – Am9, electric-piano chords, swung beat. */
const lofi: Style = {
  id: 'lofi',
  name: { en: 'Lo-fi Drive', he: 'נסיעת לו-פיי' },
  bpm: 80,
  create() {
    const chords = [
      { v: [50, 53, 57, 60, 64], bass: 38 }, // Dm9
      { v: [55, 59, 62, 65, 69], bass: 43 }, // G9
      { v: [48, 52, 55, 59, 62], bass: 36 }, // Cmaj9
      { v: [45, 48, 52, 55, 59], bass: 33 }, // Am9
    ];
    const scale = [57, 60, 62, 64, 67, 69, 72, 74]; // A minor pentatonic
    let m = 4;
    // A rhodes-like note: a sine with a soft octave above, slightly detuned.
    const keys = (kit: Kit, n: number, t: number, len: number, p: number) => {
      voice(kit, midi(n), t, len, p, kit.music, 'sine', 0.008, len * 0.8, 6);
      voice(kit, midi(n + 12), t, len * 0.5, p * 0.25, kit.music, 'triangle', 0.005, len * 0.4, 8);
    };
    return {
      step(kit, t, n, s) {
        const swing = n % 2 === 1 ? s * 0.33 : 0; // late off-beats: the lazy feel
        const at = t + swing;
        const bar = Math.floor(n / 8);
        const i = n % 8;
        const c = chords[bar % chords.length];
        if (i === 0) c.v.forEach((p, k) => keys(kit, p, at + k * 0.012, s * 7, 0.032));
        if (i === 5 && Math.random() < 0.5) c.v.slice(1).forEach((p) => keys(kit, p, at, s * 2.5, 0.02));
        if (i === 0 || i === 4) voice(kit, midi(c.bass), at, s * 3.5, 0.11, kit.music, 'sine', 0.01, s * 2);
        // Soft beat: kick on 1 and the "and" of 3, snare on 2 and 4, gentle hats.
        if (i === 0 || i === 5) kick(kit, at, 0.42);
        if (i === 2 || i === 6) snare(kit, at, 0.1);
        if (Math.random() < 0.85) hat(kit, at, i % 2 ? 0.022 : 0.035);
        if (i % 2 === 0 && Math.random() < 0.28) {
          m = Math.max(0, Math.min(scale.length - 1, m + pick([-2, -1, 1, 1, 2])));
          voice(kit, midi(scale[m]), at, s * 3, 0.04, kit.echo, 'sine', 0.01, s * 2.5);
        }
      },
    };
  },
};

/** 3. Night Road: synthwave in A minor, Am – F – C – G. */
const night: Style = {
  id: 'night',
  name: { en: 'Night Road', he: 'כביש לילה' },
  bpm: 96,
  create() {
    const chords = [
      { v: [57, 60, 64], root: 33 }, // Am
      { v: [53, 57, 60], root: 29 }, // F
      { v: [55, 60, 64], root: 36 }, // C
      { v: [55, 59, 62], root: 31 }, // G
    ];
    return {
      step(kit, t, n, s) {
        const bar = Math.floor(n / 8);
        const i = n % 8;
        const c = chords[bar % chords.length];
        if (i === 0) {
          // A wide pad: two detuned saws per note, slow in.
          for (const p of c.v) {
            voice(kit, midi(p), t, s * 8 + 0.4, 0.018, kit.music, 'sawtooth', 0.5, 0.6, 12);
            voice(kit, midi(p + 12), t, s * 8 + 0.4, 0.01, kit.music, 'sawtooth', 0.6, 0.6, 14);
          }
        }
        // The pulse: root on every eighth, the octave on the off-beats.
        voice(kit, midi(c.root + (i % 2 ? 12 : 0)), t, s * 0.9, 0.06, kit.music, 'sawtooth', 0.005, s * 0.6, 3);
        if (i === 0 || i === 4) kick(kit, t, 0.5);
        if (i === 2 || i === 6) snare(kit, t, 0.16);
        if (i % 2 === 1) hat(kit, t, 0.04);
        // An arpeggio on the second half of every four bars.
        if (bar % 4 >= 2) {
          const arp = [...c.v, c.v[0] + 12, c.v[1] + 12];
          voice(kit, midi(arp[i % arp.length] + 12), t, s * 0.8, 0.028, kit.echo, 'square', 0.005, s * 0.6, 2);
        }
      },
    };
  },
};

/** 4. Caravan: D Hijaz, an oud-like line over a drone, darbuka in maqsum. */
const caravan: Style = {
  id: 'caravan',
  name: { en: 'Caravan', he: 'שיירה' },
  bpm: 92,
  create() {
    // D Hijaz: D Eb F# G A Bb C D — the augmented second gives it its colour.
    const scale = [62, 63, 66, 67, 69, 70, 72, 74, 75, 78];
    let m = 0;
    // Maqsum over eight steps: dum tek . tek dum . tek .
    const dum = [0, 4];
    const tek = [1, 3, 6];
    return {
      step(kit, t, n, s) {
        const bar = Math.floor(n / 8);
        const i = n % 8;
        if (n % 32 === 0) {
          // The drone: low D and A, held for four bars.
          voice(kit, midi(38), t, s * 32 + 1, 0.06, kit.music, 'triangle', 1.2, 2, 3);
          voice(kit, midi(45), t, s * 32 + 1, 0.035, kit.music, 'triangle', 1.5, 2, 3);
        }
        if (dum.includes(i)) thump(kit, t, 0.4, 110, 70, 0.3);
        if (tek.includes(i)) hit(kit, t, i === 6 ? 0.09 : 0.07, 0.06, 'bandpass', 3200, 2);
        // The oud: mostly stepwise, returning home to D at phrase ends.
        const phraseEnd = bar % 4 === 3 && i >= 6;
        if (phraseEnd) {
          if (i === 6) pluck(kit, midi(62), t, 0.09, kit.echo, 1.4);
        } else if (Math.random() < 0.62) {
          m = Math.max(0, Math.min(scale.length - 1, m + pick([-1, -1, 1, 1, 2, -2, 0])));
          pluck(kit, midi(scale[m]), t, 0.08, kit.echo, 0.6);
          // An occasional quick ornament, as an oud player would.
          if (Math.random() < 0.15 && m + 1 < scale.length) pluck(kit, midi(scale[m + 1]), t + s * 0.5, 0.05, kit.echo, 0.35);
        }
      },
    };
  },
};

export const STYLES: Style[] = [dawn, lofi, night, caravan];

/* ---------------------------------------------------------------- graph --- */
export interface MusicGraph {
  kit: Kit;
  /** Volume of the whole music; ramped for crossfades. */
  bus: GainNode;
  /** Low-pass the car's speed opens a little. */
  filter: BiquadFilterNode;
  /** Disconnect everything, so a replaced graph stops costing CPU. */
  dispose(): void;
}

/** A soft reverb: an impulse response of decaying noise. */
function reverb(ctx: BaseAudioContext) {
  const len = Math.floor(ctx.sampleRate * 3);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
  }
  const c = ctx.createConvolver();
  c.buffer = ir;
  return c;
}

/** Build the music's mixing graph into `out`. */
export function buildMusic(ctx: BaseAudioContext, out: AudioNode, echoSeconds: number): MusicGraph {
  const bus = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2400;
  filter.Q.value = 0.4;
  const rev = reverb(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.4;
  bus.connect(filter);
  filter.connect(out);
  filter.connect(rev).connect(wet).connect(out);

  const music = ctx.createGain();
  music.connect(bus);
  const drums = ctx.createGain();
  drums.gain.value = 0.9;
  drums.connect(out); // drums skip the speed filter and most of the reverb
  const drumVerb = ctx.createGain();
  drumVerb.gain.value = 0.15;
  drums.connect(drumVerb).connect(rev);

  const echo = ctx.createGain();
  const delay = ctx.createDelay(2);
  delay.delayTime.value = echoSeconds;
  const fb = ctx.createGain();
  fb.gain.value = 0.3;
  echo.connect(bus);
  echo.connect(delay);
  delay.connect(fb).connect(delay);
  delay.connect(bus);

  const nodes: AudioNode[] = [bus, filter, rev, wet, music, drums, drumVerb, echo, delay, fb];
  return {
    kit: { ctx, music, echo, drums },
    bus,
    filter,
    dispose: () => nodes.forEach((x) => x.disconnect()),
  };
}

/** Seconds per eighth-note step at a style's tempo. */
export const stepSeconds = (s: Style) => 60 / s.bpm / 2;

/**
 * Render `seconds` of a style without speakers. Used by the tests to check
 * each style is audible, does not clip, and differs from the others.
 */
export async function renderStyle(index: number, seconds: number, sampleRate = 22050): Promise<AudioBuffer> {
  const style = STYLES[index];
  const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * seconds), sampleRate);
  const master = ctx.createGain();
  master.gain.value = 0.85;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  const g = buildMusic(ctx, master, stepSeconds(style) * 1.5);
  const run = style.create();
  const s = stepSeconds(style);
  for (let n = 0, t = 0.05; t < seconds; n++, t += s) run.step(g.kit, t, n, s);
  return ctx.startRendering();
}
