/**
 * Procedural audio — every sound is synthesised at runtime with the WebAudio API,
 * so the game ships without a single audio asset and still has punchy feedback.
 */
export class AudioKit {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  enabled = true;
  private musicTimer: number | null = null;
  private musicStep = 0;

  init() {
    if (this.ctx) return;
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    try {
      const ctx = new Ctx() as AudioContext;
      this.ctx = ctx;
      const master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);
      this.master = master;

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 8;
      comp.connect(master);

      const sfx = ctx.createGain();
      sfx.gain.value = 0.62;
      sfx.connect(comp);
      this.sfxGain = sfx;

      const music = ctx.createGain();
      music.gain.value = 0.0;
      music.connect(comp);
      this.musicGain = music;

      // white-noise buffer reused for hits / whooshes
      const len = Math.floor(ctx.sampleRate * 1.2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    } catch {
      this.ctx = null;
    }
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setEnabled(v: boolean) {
    this.enabled = v;
    if (this.master) this.master.gain.value = v ? 0.85 : 0;
  }

  private now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private noise(dur: number, gain: number, filterFreq: number, type: BiquadFilterType = 'bandpass', q = 1) {
    if (!this.ctx || !this.noiseBuf || !this.sfxGain || !this.enabled) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 1;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    const t = this.now();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private tone(
    freq: number,
    dur: number,
    gain: number,
    type: OscillatorType = 'sine',
    freqEnd?: number,
    delay = 0,
  ) {
    if (!this.ctx || !this.sfxGain || !this.enabled) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    const t = this.now() + delay;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  swing() {
    this.noise(0.16, 0.18, 2400, 'bandpass', 0.9);
    this.tone(320, 0.1, 0.04, 'triangle', 720);
  }
  hit(heavy = false) {
    this.noise(heavy ? 0.26 : 0.15, heavy ? 0.5 : 0.32, heavy ? 420 : 760, 'lowpass', 1);
    this.tone(heavy ? 74 : 108, heavy ? 0.26 : 0.15, heavy ? 0.4 : 0.22, 'sine', heavy ? 40 : 62);
  }
  block() {
    this.noise(0.09, 0.24, 3200, 'highpass', 1.5);
    this.tone(1150, 0.09, 0.09, 'square', 900);
  }
  jump() {
    this.tone(260, 0.16, 0.09, 'sine', 520);
  }
  dash() {
    this.noise(0.22, 0.2, 1400, 'bandpass', 0.6);
    this.tone(180, 0.18, 0.07, 'sawtooth', 420);
  }
  pickup() {
    this.tone(660, 0.1, 0.14, 'triangle', 660);
    this.tone(990, 0.16, 0.12, 'triangle', 990, 0.08);
  }
  select() {
    this.tone(430, 0.09, 0.1, 'square', 620);
    this.tone(660, 0.12, 0.07, 'triangle', 880, 0.06);
  }
  enemyHit() {
    this.noise(0.12, 0.2, 320, 'lowpass', 0.8);
    this.tone(150, 0.12, 0.12, 'triangle', 90);
  }
  enemyDie() {
    this.noise(0.4, 0.28, 500, 'lowpass', 0.7);
    this.tone(120, 0.35, 0.16, 'sawtooth', 45);
  }
  hurt() {
    this.tone(180, 0.22, 0.3, 'sawtooth', 70);
    this.noise(0.2, 0.24, 900, 'bandpass', 0.7);
  }
  combo(level: number) {
    const base = 520 + Math.min(level, 12) * 46;
    this.tone(base, 0.11, 0.11, 'triangle', base * 1.5);
  }
  special(power = 1) {
    this.tone(120 * power, 0.5, 0.34, 'sawtooth', 40);
    this.noise(0.55, 0.34, 800, 'bandpass', 0.5);
    this.tone(600 * power, 0.4, 0.14, 'square', 200, 0.05);
  }
  bossRoar() {
    this.tone(70, 1.1, 0.4, 'sawtooth', 32);
    this.tone(140, 0.9, 0.2, 'square', 60, 0.1);
    this.noise(1.1, 0.3, 260, 'lowpass', 0.6);
  }
  waveClear() {
    const seq = [523, 659, 784, 1046];
    seq.forEach((f, i) => this.tone(f, 0.22, 0.12, 'triangle', f, i * 0.09));
  }
  fail() {
    const seq = [392, 330, 262, 196];
    seq.forEach((f, i) => this.tone(f, 0.3, 0.14, 'sawtooth', f * 0.98, i * 0.13));
  }
  ui() {
    this.tone(880, 0.05, 0.06, 'square', 880);
  }

  /** Simple looping riff, scheduled with a timer (Cyberpunk-ish street tension). */
  startMusic() {
    if (this.ctx && this.musicGain) {
      this.musicGain.gain.setTargetAtTime(0.28, this.now(), 0.6);
    }
    if (this.musicTimer !== null) return;
    const bassLine = [55, 55, 82.4, 55, 61.7, 55, 73.4, 49];
    const leadLine = [220, 0, 293.7, 0, 246.9, 0, 329.6, 196];
    const tick = () => {
      if (!this.ctx || !this.musicGain || !this.enabled) return;
      const step = this.musicStep % 16;
      const t = this.now() + 0.02;
      // bass
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = bassLine[step % 8];
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 320;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      o.connect(f).connect(g).connect(this.musicGain);
      o.start(t);
      o.stop(t + 0.3);
      // hats
      if (step % 2 === 1 && this.noiseBuf) {
        const s = this.ctx.createBufferSource();
        s.buffer = this.noiseBuf;
        const hf = this.ctx.createBiquadFilter();
        hf.type = 'highpass';
        hf.frequency.value = 7000;
        const hg = this.ctx.createGain();
        hg.gain.setValueAtTime(0.09, t);
        hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
        s.connect(hf).connect(hg).connect(this.musicGain);
        s.start(t);
        s.stop(t + 0.08);
      }
      // sparse lead
      const lead = leadLine[step % 8];
      if (lead && step % 4 === 0) {
        const lo = this.ctx.createOscillator();
        const lg = this.ctx.createGain();
        lo.type = 'triangle';
        lo.frequency.value = lead;
        lg.gain.setValueAtTime(0.0001, t);
        lg.gain.exponentialRampToValueAtTime(0.1, t + 0.03);
        lg.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        lo.connect(lg).connect(this.musicGain);
        lo.start(t);
        lo.stop(t + 0.55);
      }
      this.musicStep++;
    };
    this.musicTimer = window.setInterval(tick, 215);
  }

  stopMusic() {
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(0.0, this.now(), 0.35);
  }

  dispose() {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
    this.ctx?.close();
    this.ctx = null;
  }
}

export const audio = new AudioKit();
