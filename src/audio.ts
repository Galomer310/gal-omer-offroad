/**
 * Sound, all synthesised with the Web Audio API: no audio files, so nothing to
 * download and no licences.
 *
 * Background music instead of an engine (Gal's call): a soft generative piece
 * in D major. A pad holds four chords, a quiet bass follows the roots, and a
 * slow melody wanders over the pentatonic scale, so no note can clash. It never
 * repeats exactly, which keeps it from becoming a loop you notice. Speed only
 * brightens the sound slightly, so the drive still feels like motion.
 *
 * Effects stay: horn, landing thud, achievement chime. Starts only after a
 * click, as browsers require.
 */
const KEY = 'offroad.muted';

export interface Audio {
  start(): void;
  /** Speed (m/s) gently opens the music's filter. */
  setDrive(speed: number): void;
  setHorn(on: boolean): void;
  thud(strength: number): void;
  chime(): void;
  toggleMute(): boolean;
  muted(): boolean;
}

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

/* D major: Dmaj9, Bm7, Gmaj7, A6sus, as MIDI notes (pad voicing, bass root). */
const CHORDS: { pad: number[]; bass: number }[] = [
  { pad: [62, 66, 69, 73, 76], bass: 38 },
  { pad: [59, 62, 66, 69, 74], bass: 35 },
  { pad: [55, 59, 62, 66, 71], bass: 31 },
  { pad: [57, 62, 64, 66, 69], bass: 33 },
];
/** D major pentatonic over two octaves: D E F# A B. */
const SCALE = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83];
const BEAT = 60 / 66; // 66 bpm
const BEATS_PER_CHORD = 8;

export function createAudio(): Audio {
  let ctx: AudioContext | null = null;
  let master: GainNode;
  let musicBus: GainNode;
  let musicFilter: BiquadFilterNode;
  let echoIn: GainNode;
  let hornGain: GainNode;
  let nextBeat = 0;
  let beat = 0;
  let melodyIdx = 3;
  let muted = (() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  })();

  const now = () => ctx!.currentTime;

  /** A soft reverb: an impulse response of decaying noise. */
  const makeReverb = (c: AudioContext) => {
    const len = Math.floor(c.sampleRate * 3.2);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
    }
    const conv = c.createConvolver();
    conv.buffer = ir;
    return conv;
  };

  /** One voice with an attack/release envelope, routed to `dest`. */
  const voice = (
    freq: number, t0: number, dur: number, peak: number, dest: AudioNode,
    type: OscillatorType = 'sine', attack = 0.02, release = 0.8,
  ) => {
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.type = type;
    o.frequency.value = freq;
    // A touch of detune so stacked pad voices shimmer instead of buzzing.
    o.detune.value = (Math.random() - 0.5) * 8;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.setValueAtTime(peak, t0 + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  };

  /** Schedule music a little ahead of time, so timing never depends on frame rate. */
  const schedule = () => {
    if (!ctx) return;
    while (nextBeat < now() + 0.6) {
      const t = nextBeat;
      const chord = CHORDS[Math.floor(beat / BEATS_PER_CHORD) % CHORDS.length];
      if (beat % BEATS_PER_CHORD === 0) {
        const len = BEAT * BEATS_PER_CHORD + 1.2; // overlap the next chord a little
        for (const n of chord.pad) voice(midi(n), t, len, 0.035, musicBus, 'triangle', 1.6, 2.2);
        voice(midi(chord.bass), t, len, 0.07, musicBus, 'sine', 0.4, 1.5);
      }
      // Melody: a random walk on the scale, resting about half the time.
      if (Math.random() < 0.48) {
        melodyIdx = Math.max(0, Math.min(SCALE.length - 1, melodyIdx + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
        const dur = BEAT * (Math.random() < 0.3 ? 2 : 1) + 0.6;
        voice(midi(SCALE[melodyIdx]), t, dur, 0.05, echoIn, 'triangle', 0.01, dur - 0.05);
      }
      nextBeat += BEAT;
      beat++;
    }
  };

  return {
    start() {
      if (ctx) return;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.85;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp).connect(ctx.destination);

      // Music: everything → low-pass (brightened by speed) → dry + reverb.
      const reverb = makeReverb(ctx);
      const wet = ctx.createGain();
      wet.gain.value = 0.45;
      musicFilter = ctx.createBiquadFilter();
      musicFilter.type = 'lowpass';
      musicFilter.frequency.value = 1400;
      musicFilter.Q.value = 0.4;
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.9;
      musicBus.connect(musicFilter);
      musicFilter.connect(master);
      musicFilter.connect(reverb).connect(wet).connect(master);

      // The melody also goes through an echo (dotted eighth, three repeats or so).
      echoIn = ctx.createGain();
      const delay = ctx.createDelay(2);
      delay.delayTime.value = BEAT * 0.75;
      const fb = ctx.createGain();
      fb.gain.value = 0.32;
      echoIn.connect(musicBus);
      echoIn.connect(delay);
      delay.connect(fb).connect(delay);
      delay.connect(musicBus);

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

      nextBeat = now() + 0.2;
      schedule();
      window.setInterval(schedule, 150);
      // Pause the music when the tab is hidden; resume where it was.
      document.addEventListener('visibilitychange', () => {
        if (!ctx) return;
        if (document.hidden) void ctx.suspend();
        else void ctx.resume().then(() => (nextBeat = Math.max(nextBeat, now() + 0.1)));
      });
    },
    setDrive(speed) {
      if (!ctx) return;
      const s = Math.min(Math.abs(speed), 34);
      musicFilter.frequency.setTargetAtTime(1300 + s * 55, now(), 0.4);
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
      [74, 78, 81].forEach((n, i) => voice(midi(n), now() + i * 0.09, 0.55, 0.12, master, 'sine', 0.02, 0.45));
    },
    toggleMute() {
      muted = !muted;
      try {
        localStorage.setItem(KEY, muted ? '1' : '0');
      } catch {
        /* not essential */
      }
      if (ctx) master.gain.setTargetAtTime(muted ? 0 : 0.85, now(), 0.05);
      return muted;
    },
    muted: () => muted,
  };
}
