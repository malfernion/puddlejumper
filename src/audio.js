// Everything you hear is synthesised: no audio files.
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.mood = { root: 62, scale: [0, 2, 4, 7, 9], tempo: 0.55, wave: 'triangle' };
    this.nextNote = 0;
    this.step = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    this.lp = c.createBiquadFilter();
    this.lp.type = 'lowpass'; this.lp.frequency.value = 12000; this.lp.Q.value = 0.7;
    this.lp.connect(this.master);
    this.master.connect(c.destination);
    this.verb = c.createConvolver();
    this.verb.buffer = this.impulse(3.2, 2.2);
    const vg = c.createGain(); vg.gain.value = 0.5;
    this.verb.connect(vg); vg.connect(this.lp);
    this.musicBus = c.createGain(); this.musicBus.gain.value = 0.32;
    this.musicBus.connect(this.lp); this.musicBus.connect(this.verb);
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Continuous layers: engine hum, rocket roar, ocean wash.
    this.engine = this.loopNoise(220, 2, 0);
    const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 48;
    const og = c.createGain(); og.gain.value = 0;
    const of = c.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 260;
    osc.connect(of); of.connect(og); og.connect(this.lp); osc.start();
    this.engineOsc = { osc, g: og };
    this.rocket = this.loopNoise(900, 1.2, 0);
    this.wash = this.loopNoise(500, 0.4, 0.04);
    this.windL = this.loopNoise(380, 0.7, 0);
    this.rainL = this.loopNoise(5200, 0.3, 0);
    this.storm = 0;
    this.nextNote = c.currentTime + 0.5;
  }

  impulse(sec, decay) {
    const c = this.ctx, n = c.sampleRate * sec, b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return b;
  }

  loopNoise(freq, q, gain) {
    const c = this.ctx, src = c.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.lp); src.start();
    return { f, g };
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  /** Per-frame continuous parameters. */
  frame(o) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.lp.frequency.setTargetAtTime(o.under ? 900 : 12000, t, 0.12);
    this.engine.g.gain.setTargetAtTime(o.thrust * (o.under ? 0.12 : 0.03), t, 0.1);
    this.engine.f.frequency.setTargetAtTime(150 + o.speed * 18, t, 0.1);
    this.engineOsc.g.gain.setTargetAtTime(o.thrust * 0.05, t, 0.1);
    this.engineOsc.osc.frequency.setTargetAtTime(40 + o.speed * 3, t, 0.1);
    this.rocket.g.gain.setTargetAtTime(o.boost ? 0.35 : 0, t, 0.05);
    this.rocket.f.frequency.setTargetAtTime(o.boost ? 700 + Math.random() * 300 : 500, t, 0.05);
    const storm = o.storm || 0, rain = o.rain || 0;
    this.storm = storm;
    this.wash.g.gain.setTargetAtTime(o.space ? 0 : (o.under ? 0.07 : 0.05) * (1 + storm * 3), t, 0.4);
    this.wash.f.frequency.setTargetAtTime(500 - storm * 250, t, 0.4);
    const gust = 0.6 + 0.4 * Math.sin(t * 0.7) * Math.sin(t * 1.9 + 1);
    this.windL.g.gain.setTargetAtTime(storm * storm * 0.3 * gust * (o.under ? 0.4 : 1), t, 0.3);
    this.windL.f.frequency.setTargetAtTime(260 + gust * 420 * storm, t, 0.3);
    this.rainL.g.gain.setTargetAtTime(rain * (o.under ? 0.03 : 0.12), t, 0.5);
    this.music(t);
  }

  tone(freq, dur, { type = 'sine', vol = 0.2, to = null, attack = 0.01, verb = 0, delay = 0 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.lp);
    if (verb) { const vg = c.createGain(); vg.gain.value = verb; g.connect(vg); vg.connect(this.verb); }
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise(dur, { freq = 1000, to = null, q = 1, vol = 0.3, type = 'lowpass', delay = 0 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.lp);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  splash(p) {
    const v = Math.min(1, p / 25);
    this.noise(0.25 + v * 0.7, { freq: 4000, to: 300, vol: 0.15 + v * 0.45 });
    for (let i = 0; i < 2 + v * 5; i++) this.tone(300 + Math.random() * 500, 0.09, { to: 900 + Math.random() * 600, vol: 0.05, delay: 0.05 + Math.random() * 0.4 });
  }
  bubble() { this.tone(350 + Math.random() * 300, 0.07, { to: 900 + Math.random() * 500, vol: 0.04 }); }
  pickup() { [0, 4, 7, 12].forEach((s, i) => this.tone(mtof(79 + s), 0.25, { type: 'triangle', vol: 0.12, delay: i * 0.06, verb: 0.3 })); }
  chest() { [0, 4, 7, 11, 14, 19].forEach((s, i) => this.tone(mtof(72 + s), 0.4, { type: 'triangle', vol: 0.12, delay: i * 0.08, verb: 0.4 })); }
  hurt() { this.tone(160, 0.3, { type: 'square', to: 55, vol: 0.12 }); this.noise(0.25, { freq: 600, vol: 0.25 }); }
  bonk(v) { this.tone(110, 0.15, { type: 'sine', to: 60, vol: Math.min(0.3, v * 0.02) }); }
  creak() { this.tone(70 + Math.random() * 30, 0.8, { type: 'sawtooth', to: 50, vol: 0.05, attack: 0.3 }); }
  dock() { [0, 7, 12].forEach((s, i) => this.tone(mtof(67 + s), 0.5, { type: 'sine', vol: 0.1, delay: i * 0.1, verb: 0.4 })); }
  ui() { this.tone(880, 0.06, { type: 'triangle', vol: 0.06 }); }
  buy() { this.chest(); }
  whale() {
    const base = 150 + Math.random() * 60;
    this.tone(base, 2.8, { to: base * 1.5, vol: 0.18, attack: 0.6, verb: 1.2 });
    this.tone(base * 1.5, 2.2, { to: base * 0.9, vol: 0.1, attack: 0.8, verb: 1.2, delay: 1.2 });
  }
  growl() { this.tone(60, 1.2, { type: 'sawtooth', to: 40, vol: 0.12, attack: 0.2 }); this.noise(1, { freq: 200, vol: 0.15 }); }
  zap() { this.noise(0.2, { freq: 3000, type: 'bandpass', q: 4, vol: 0.2 }); this.tone(1200, 0.15, { type: 'square', to: 300, vol: 0.05 }); }
  geyser() { this.noise(1.6, { freq: 300, to: 2000, vol: 0.3, type: 'bandpass', q: 0.8 }); }
  thunder() {
    this.noise(0.25, { freq: 2500, to: 400, vol: 0.35 });
    this.noise(3.5, { freq: 300, to: 40, vol: 0.6, delay: 0.1 });
    this.noise(2.0, { freq: 150, to: 50, vol: 0.4, delay: 0.6 });
  }
  beacon() { [0, 4, 7, 11, 14].forEach((s, i) => this.tone(mtof(60 + s), 3.5, { type: 'sine', vol: 0.12, attack: 0.4, delay: i * 0.15, verb: 1 })); }
  launch() { this.noise(0.6, { freq: 300, to: 3000, vol: 0.3, type: 'bandpass', q: 1 }); }

  /** Generative pentatonic noodling that follows the current world's mood. */
  music(now) {
    if (!this.ctx || now < this.nextNote - 0.05) return;
    // Storms pull the music down a minor third into a darker, slower minor mode.
    const dark = this.storm > 0.5;
    const m = dark ? { ...this.mood, root: this.mood.root - 3, scale: [0, 3, 5, 7, 10], tempo: this.mood.tempo * 0.7, wave: 'sine' } : this.mood;
    const beat = 60 / (70 * m.tempo + 40);
    const t = Math.max(this.nextNote, now);
    this.step++;
    const pick = (o) => mtof(m.root + o + m.scale[Math.floor(Math.random() * m.scale.length)]);
    if (dark && this.step % 32 === 1) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = 'sawtooth'; o.frequency.value = mtof(m.root - 36);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 3); g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 30);
      o.connect(f); f.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + beat * 31);
    }
    const voice = (f, dur, vol, type = m.wave, at = 0) => {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(vol, t + at + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      o.connect(g); g.connect(this.musicBus); o.start(t + at); o.stop(t + at + dur + 0.1);
    };
    if (this.step % 16 === 1) voice(mtof(m.root - 24), beat * 14, 0.22, 'sine');
    if (this.step % 16 === 9) voice(mtof(m.root - 24 + m.scale[Math.min(3, m.scale.length - 1)]), beat * 7, 0.16, 'sine');
    if (Math.random() < 0.55) voice(pick(Math.random() < 0.3 ? 12 : 0), beat * 3, 0.07);
    if (Math.random() < 0.12) voice(pick(24), beat * 2, 0.035, 'sine', beat / 2);
    this.nextNote = t + beat;
  }
}
