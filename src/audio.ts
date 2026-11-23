/**
 * Every sound is synthesised with the Web Audio API: no audio files, so no
 * downloads and no licences. Starts only after a click (browsers require it).
 */
const KEY = 'offroad.muted';

export interface Audio {
  start(): void;
  setEngine(speed: number, throttle: number, grounded: boolean): void;
  setHorn(on: boolean): void;
  thud(strength: number): void;
  chime(): void;
  toggleMute(): boolean;
  muted(): boolean;
}

export function createAudio(): Audio {
  let ctx: AudioContext | null = null;
  let master: GainNode;
  let engineGain: GainNode;
  let engineFilter: BiquadFilterNode;
  let osc1: OscillatorNode;
  let osc2: OscillatorNode;
  let hornGain: GainNode;
  let muted = (() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  })();

  const now = () => ctx!.currentTime;

  return {
    start() {
      if (ctx) return;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.8;
      master.connect(ctx.destination);

      // Engine: a sawtooth and a square an octave down, through a low-pass.
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 500;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc2 = ctx.createOscillator();
      osc2.type = 'square';
      osc1.connect(engineFilter);
      osc2.connect(engineFilter);
      engineFilter.connect(engineGain).connect(master);
      osc1.start();
      osc2.start();

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
    },
    setEngine(speed, throttle, grounded) {
      if (!ctx) return;
      const s = Math.abs(speed);
      const rev = 38 + s * 3.2 + Math.abs(throttle) * (grounded ? 10 : 30);
      osc1.frequency.setTargetAtTime(rev, now(), 0.08);
      osc2.frequency.setTargetAtTime(rev / 2, now(), 0.08);
      engineFilter.frequency.setTargetAtTime(300 + s * 40 + Math.abs(throttle) * 500, now(), 0.1);
      engineGain.gain.setTargetAtTime(0.045 + Math.abs(throttle) * 0.05 + Math.min(s, 30) * 0.0012, now(), 0.1);
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
      [659, 784, 988].forEach((f, i) => {
        const o = ctx!.createOscillator();
        const g = ctx!.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        const t0 = now() + i * 0.09;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.12, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
        o.connect(g).connect(master);
        o.start(t0);
        o.stop(t0 + 0.55);
      });
    },
    toggleMute() {
      muted = !muted;
      try {
        localStorage.setItem(KEY, muted ? '1' : '0');
      } catch {
        /* not essential */
      }
      if (ctx) master.gain.setTargetAtTime(muted ? 0 : 0.8, now(), 0.05);
      return muted;
    },
    muted: () => muted,
  };
}
