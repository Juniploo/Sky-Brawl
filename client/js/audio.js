// Sound effects and music, all generated with the Web Audio API (no files needed).
//
// Want your own music? Put a file at client/audio/music.mp3 and it plays instead
// of the built-in tune. Each sound effect is one small function below, so you
// can also tweak or replace them one by one.

const STORE = 'skybrawl.volume';
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export class SoundSystem {
  constructor() {
    this.ctx = null;
    const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
    this.volumes = { master: saved.master ?? 0.8, music: saved.music ?? 0.35, sfx: saved.sfx ?? 0.8 };
    this.listener = { x: 0, y: 0, z: 0, rx: 1, ry: 0, rz: 0 };
    this.lockState = 'none';
    this.warnState = 'none';
    this.beepT = 0;
    this.warnT = 0;
    this.warnFlip = false;
    this.remoteBudget = 0;
  }

  /** Browsers only allow audio after a click, so call this from a click handler. */
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = this.ctx = new AudioContext();
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.musicGain = ctx.createGain();
    this.musicGain.connect(this.master);
    this.applyVolumes();

    // Two seconds of white noise, reused by every "noisy" sound.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    this.setupEngine();
    this.setupLockTone();
    this.startMusic();
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.sfx.gain.value = this.volumes.sfx;
    this.musicGain.gain.value = this.volumes.music * 0.6;
  }

  setVolume(kind, value) {
    this.volumes[kind] = clamp01(value);
    localStorage.setItem(STORE, JSON.stringify(this.volumes));
    this.applyVolumes();
  }

  toggleMusic() {
    this.setVolume('music', this.volumes.music > 0 ? 0 : 0.35);
    return this.volumes.music;
  }

  /** Called every frame with the camera, so far-away sounds get quieter and pan left/right. */
  setListener(camera) {
    const L = this.listener;
    L.x = camera.position.x; L.y = camera.position.y; L.z = camera.position.z;
    const e = camera.matrixWorld.elements; // first column = camera's right direction
    L.rx = e[0]; L.ry = e[1]; L.rz = e[2];
  }

  // ------------------------------------------------------------ building blocks

  /** Output node for a sound at world position `pos` (null = "in your head"). */
  out(pos, range = 1500) {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    if (!pos) { gain.connect(this.sfx); return gain; }
    const L = this.listener;
    const dx = pos.x - L.x, dy = pos.y - L.y, dz = pos.z - L.z;
    const dist = Math.hypot(dx, dy, dz);
    const vol = Math.pow(clamp01(1 - dist / range), 2);
    if (vol <= 0.001) return null;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, (dx * L.rx + dy * L.ry + dz * L.rz) / Math.max(dist, 1)));
    gain.gain.value = vol;
    gain.connect(pan).connect(this.sfx);
    return gain;
  }

  noiseSource() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    return src;
  }

  /** A short shaped burst: source -> filter -> envelope -> dest. */
  burst(dest, { type = 'noise', freq = 1000, freqEnd = null, filter = 'bandpass', q = 1, cutoff = 2000, cutoffEnd = null,
    attack = 0.002, peak = 0.5, decay = 0.1 }) {
    const ctx = this.ctx, t = ctx.currentTime;
    let src;
    if (type === 'noise') {
      src = this.noiseSource();
      src.start(t, Math.random() * 1.5);
    } else {
      src = ctx.createOscillator();
      src.type = type;
      src.frequency.setValueAtTime(freq, t);
      if (freqEnd) src.frequency.exponentialRampToValueAtTime(freqEnd, t + attack + decay);
      src.start(t);
    }
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(cutoff, t);
    if (cutoffEnd) f.frequency.exponentialRampToValueAtTime(cutoffEnd, t + attack + decay);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    src.connect(f).connect(env).connect(dest);
    src.stop(t + attack + decay + 0.05);
  }

  /** Remote sounds are rate-limited so 10 players firing at once don't get too loud. */
  allowRemote() {
    if (this.remoteBudget <= 0) return false;
    this.remoteBudget--;
    return true;
  }

  // ------------------------------------------------------------ sound effects

  gun(pos = null) {
    if (!this.ctx || (pos && !this.allowRemote())) return;
    const o = this.out(pos, 1200);
    if (!o) return;
    this.burst(o, { cutoff: 1800, filter: 'bandpass', q: 0.8, peak: 0.35, decay: 0.06 });
    this.burst(o, { type: 'square', freq: 160, freqEnd: 60, filter: 'lowpass', cutoff: 600, peak: 0.25, decay: 0.05 });
  }

  explosion(pos = null, big = true) {
    if (!this.ctx) return;
    const o = this.out(pos, 2500);
    if (!o) return;
    this.burst(o, { filter: 'lowpass', cutoff: 2500, cutoffEnd: 120, peak: big ? 1 : 0.6, attack: 0.005, decay: big ? 1.4 : 0.7 });
    this.burst(o, { type: 'sine', freq: 90, freqEnd: 30, filter: 'lowpass', cutoff: 300, peak: big ? 0.9 : 0.5, decay: big ? 0.8 : 0.4 });
  }

  missileLaunch(pos = null) {
    if (!this.ctx) return;
    const o = this.out(pos, 1800);
    if (!o) return;
    this.burst(o, { filter: 'bandpass', cutoff: 400, cutoffEnd: 3000, q: 2, peak: 0.6, attack: 0.05, decay: 0.9 });
  }

  flare(pos = null) {
    if (!this.ctx) return;
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        const o = this.out(pos, 1500);
        if (o) this.burst(o, { filter: 'highpass', cutoff: 2500, peak: 0.5, decay: 0.08 });
      }, i * 70);
    }
  }

  hit() {
    if (!this.ctx) return;
    this.burst(this.out(null), { type: 'sine', freq: 1700, filter: 'lowpass', cutoff: 5000, peak: 0.25, decay: 0.05 });
  }

  kill() {
    if (!this.ctx) return;
    const o = this.out(null);
    this.burst(o, { type: 'triangle', freq: 880, filter: 'lowpass', cutoff: 6000, peak: 0.4, decay: 0.15 });
    setTimeout(() => this.burst(this.out(null), { type: 'triangle', freq: 1320, filter: 'lowpass', cutoff: 6000, peak: 0.4, decay: 0.3 }), 110);
  }

  ouch() {
    if (!this.ctx) return;
    this.burst(this.out(null), { type: 'square', freq: 220, freqEnd: 110, filter: 'lowpass', cutoff: 900, peak: 0.25, decay: 0.08 });
  }

  // ------------------------------------------------------------ looping sounds

  setupEngine() {
    const ctx = this.ctx;
    this.engOsc = ctx.createOscillator();
    this.engOsc.type = 'sawtooth';
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engOsc.connect(this.engFilter).connect(this.engGain).connect(this.sfx);
    this.engOsc.start();
    this.engNoise = this.noiseSource();
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 900;
    this.engNoiseGain = ctx.createGain();
    this.engNoiseGain.gain.value = 0;
    this.engNoise.connect(nf).connect(this.engNoiseGain).connect(this.sfx);
    this.engNoise.start();
  }

  /** Engine hum follows your throttle; louder and higher while boosting. */
  engine(throttle, boosting, alive) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const on = alive ? 1 : 0;
    this.engOsc.frequency.setTargetAtTime(55 + throttle * 45 + (boosting ? 45 : 0), t, 0.1);
    this.engFilter.frequency.setTargetAtTime(350 + throttle * 500 + (boosting ? 700 : 0), t, 0.1);
    this.engGain.gain.setTargetAtTime(on * (0.05 + throttle * 0.04), t, 0.15);
    this.engNoiseGain.gain.setTargetAtTime(on * (0.03 + throttle * 0.03 + (boosting ? 0.08 : 0)), t, 0.15);
  }

  setupLockTone() {
    this.lockOsc = this.ctx.createOscillator();
    this.lockOsc.type = 'square';
    this.lockOsc.frequency.value = 1320;
    this.lockGain = this.ctx.createGain();
    this.lockGain.gain.value = 0;
    this.lockOsc.connect(this.lockGain).connect(this.sfx);
    this.lockOsc.start();
  }

  beep(freq, dur = 0.06, vol = 0.12) {
    this.burst(this.out(null), { type: 'square', freq, filter: 'lowpass', cutoff: 4000, peak: vol, attack: 0.003, decay: dur });
  }

  /** 'none' | 'locking' (beeps) | 'locked' (steady tone) */
  setLock(state) { this.lockState = state; }
  /** 'none' | 'lock' (someone is locking you) | 'missile' (missile incoming) */
  setWarning(state) { this.warnState = state; }

  update(dt) {
    if (!this.ctx) return;
    this.remoteBudget = Math.min(6, this.remoteBudget + dt * 30);
    const t = this.ctx.currentTime;
    this.lockGain.gain.setTargetAtTime(this.lockState === 'locked' ? 0.06 : 0, t, 0.02);
    if (this.lockState === 'locking' && (this.beepT -= dt) <= 0) { this.beepT = 0.22; this.beep(880); }
    if (this.warnState !== 'none' && (this.warnT -= dt) <= 0) {
      if (this.warnState === 'missile') {
        this.warnT = 0.12;
        this.warnFlip = !this.warnFlip;
        this.beep(this.warnFlip ? 1000 : 760, 0.08, 0.16);
      } else {
        this.warnT = 0.5;
        this.beep(620, 0.1, 0.1);
      }
    }
    this.scheduleMusic();
  }

  // ------------------------------------------------------------ music

  async startMusic() {
    // A custom track in client/audio/music.mp3 wins over the built-in tune.
    try {
      const info = await (await fetch('/api/custom-music')).json();
      if (info.music) {
        const el = new Audio('audio/music.mp3');
        el.loop = true;
        this.ctx.createMediaElementSource(el).connect(this.musicGain);
        await el.play();
        this.customMusic = true;
        return;
      }
    } catch { /* no custom music: use the built-in tune */ }
    this.step = 0;
    this.nextNote = this.ctx.currentTime + 0.1;
  }

  /** A little 4-chord loop: bass, arpeggio, drums. Scheduled slightly ahead so it never stutters. */
  scheduleMusic() {
    if (this.customMusic || this.nextNote === undefined) return;
    const ctx = this.ctx;
    const stepLen = 60 / 124 / 4; // 16th notes at 124 BPM
    // Chords: Am  F  C  G  (as semitones from A)
    const chords = [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]];
    const hz = (semi, octave) => 110 * Math.pow(2, semi / 12 + octave);
    while (this.nextNote < ctx.currentTime + 0.25) {
      const t = this.nextNote, s = this.step % 16, chord = chords[Math.floor(this.step / 16) % 4];
      // Bass: eighth notes, root and octave
      if (s % 2 === 0) this.note(t, hz(chord[0], s % 4 === 0 ? -1 : 0), 'triangle', 0.22, stepLen * 1.8, 900);
      // Arpeggio
      this.note(t, hz(chord[s % 3], 1 + (s % 6 === 5 ? 1 : 0)), 'square', 0.05, stepLen * 0.9, 1800);
      // Kick on beats, snare on 2 and 4, hats on off-beats
      if (s % 4 === 0) this.drum(t, 'kick');
      if (s === 4 || s === 12) this.drum(t, 'snare');
      if (s % 2 === 1) this.drum(t, 'hat');
      this.nextNote += stepLen;
      this.step++;
    }
  }

  note(t, freq, type, vol, dur, cutoff) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.musicGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  drum(t, kind) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.connect(this.musicGain);
    if (kind === 'kick') {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g);
      o.start(t);
      o.stop(t + 0.25);
    } else {
      const src = this.noiseSource();
      const f = ctx.createBiquadFilter();
      f.type = kind === 'hat' ? 'highpass' : 'bandpass';
      f.frequency.value = kind === 'hat' ? 7000 : 1800;
      const dur = kind === 'hat' ? 0.04 : 0.15;
      g.gain.setValueAtTime(kind === 'hat' ? 0.08 : 0.25, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g);
      src.start(t, Math.random());
      src.stop(t + dur + 0.02);
    }
  }
}
