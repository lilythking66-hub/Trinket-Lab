// Synthesized projector sounds: no audio assets. A looping motor/shutter
// clatter whose speed follows the film, a lamp fan hum, and short mechanical
// cues (switch, keys, slide change, reel mount, focus detents).

export function createProjectorSound() {
  let ctx = null, master = null, sfxGain = null;
  let motor = null, fan = null;
  let volume = 0.8, muted = false, enabled = true;
  let motorLevel = 0, motorRate = 1, fanOn = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return ctx;
    }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
    master = ctx.createGain();
    master.gain.value = live() ? volume : 0;
    master.connect(ctx.destination);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 1;
    sfxGain.connect(master);
    return ctx;
  }
  const live = () => enabled && !muted;
  const applyVolume = () => { if (master) master.gain.setTargetAtTime(live() ? volume : 0, ctx.currentTime, 0.03); };

  /* ---- loops */
  function clatterBuffer() {
    // one second of an intermittent mechanism: 18 claw pulls per second,
    // each a sharp tick plus a softer return, over a low rumble
    const sr = ctx.sampleRate, len = sr;
    const buf = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) { lp = lp * 0.985 + (Math.random() * 2 - 1) * 0.015; d[i] = lp * 0.5; }
      const per = len / 18;
      for (let k = 0; k < 18; k++) {
        const at = Math.floor(k * per + (Math.random() - 0.5) * 30);
        const amp = 0.32 + Math.random() * 0.08;
        for (let j = 0; j < 420; j++) {
          const i = (at + j + len) % len;
          const env = Math.exp(-j / 38);
          d[i] += amp * env * (Math.sin(j * 0.62 + c) * 0.7 + (Math.random() * 2 - 1) * 0.5);
        }
        const at2 = Math.floor(at + per * 0.48);
        for (let j = 0; j < 300; j++) {
          const i = (at2 + j + len) % len;
          d[i] += 0.1 * Math.exp(-j / 30) * (Math.random() * 2 - 1);
        }
      }
    }
    return buf;
  }
  function startMotor() {
    if (motor) return;
    const src = ctx.createBufferSource();
    src.buffer = clatterBuffer();
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 1500; bp.Q.value = 0.55;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass"; low.frequency.value = 4200;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(bp).connect(low).connect(g).connect(master);
    src.start();
    motor = { src, g };
  }
  function startFan() {
    if (fan) return;
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, sr * 2, sr);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < d.length; i++) { b = b * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = b * 3; }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 520;
    const hum = ctx.createOscillator();
    hum.type = "triangle"; hum.frequency.value = 100;
    const hg = ctx.createGain(); hg.gain.value = 0.18;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(lp).connect(g);
    hum.connect(hg).connect(g);
    g.connect(master);
    src.start(); hum.start();
    fan = { src, hum, g };
  }
  function updateLoops() {
    if (!ctx) return;
    const t = ctx.currentTime;
    if (motorLevel > 0) startMotor();
    if (motor) {
      motor.g.gain.setTargetAtTime(motorLevel * 0.16, t, 0.12);
      motor.src.playbackRate.setTargetAtTime(Math.max(0.35, Math.min(2.2, motorRate)), t, 0.2);
    }
    if (fanOn) startFan();
    if (fan) fan.g.gain.setTargetAtTime(fanOn ? 0.05 : 0, t, fanOn ? 0.25 : 0.6);
  }

  /* ---- one-shots */
  let noise = null;
  function noiseBuf() {
    if (noise) return noise;
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noise;
  }
  function burst(t, { freq = 2000, q = 1, gain = 0.3, decay = 0.05, type = "bandpass" }) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf();
    const fl = ctx.createBiquadFilter();
    fl.type = type; fl.frequency.value = freq; fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    s.connect(fl).connect(g).connect(sfxGain);
    s.start(t, Math.random() * 0.3, decay + 0.03);
  }
  function thump(t, { from = 140, to = 60, gain = 0.3, decay = 0.1, type = "sine" }) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(sfxGain);
    o.start(t);
    o.stop(t + decay + 0.05);
  }
  const sfx = (fn) => (...args) => {
    // never create the AudioContext here: it needs a user gesture (unlock)
    if (!live() || !ctx) return;
    ensure();
    fn(ctx.currentTime, ...args);
  };

  return {
    unlock() { ensure(); updateLoops(); },
    set volume(v) { volume = Math.max(0, Math.min(1, Number(v))); applyVolume(); },
    get volume() { return volume; },
    set muted(m) { muted = !!m; applyVolume(); },
    set enabled(on) { enabled = !!on; applyVolume(); },

    /** level 0–1 (0 = silent), rate 1 = normal speed. */
    motor(level, rate = 1) {
      if (Math.abs(level - motorLevel) < 0.01 && Math.abs(rate - motorRate) < 0.02) return;
      motorLevel = level; motorRate = rate;
      if (ctx) updateLoops();
    },
    fan(on) {
      if (fanOn === !!on) return;
      fanOn = !!on;
      if (ctx) updateLoops();
    },

    toggle: sfx((t, on) => {
      burst(t, { freq: on ? 2600 : 2000, q: 2.2, gain: 0.42, decay: 0.03 });
      thump(t, { from: on ? 420 : 300, to: 120, gain: 0.18, decay: 0.06, type: "triangle" });
      if (on) burst(t + 0.09, { freq: 5200, q: 6, gain: 0.05, decay: 0.12 }); // lamp tink
    }),
    key: sfx((t) => {
      burst(t, { freq: 3200, q: 2.5, gain: 0.24, decay: 0.025 });
      thump(t, { from: 520, to: 180, gain: 0.1, decay: 0.04, type: "triangle" });
      burst(t + 0.07, { freq: 2400, q: 2, gain: 0.1, decay: 0.02 });
    }),
    slide: sfx((t, dir = 1) => {
      // carrier pushes the slide out, the next drops into the gate: ka-chunk
      burst(t, { freq: 1800, q: 1.4, gain: 0.25, decay: 0.05 });
      burst(t + 0.02, { freq: 700, q: 0.8, gain: 0.14, decay: 0.12, type: "lowpass" });
      thump(t + 0.13, { from: dir > 0 ? 190 : 170, to: 70, gain: 0.34, decay: 0.12 });
      burst(t + 0.13, { freq: 2600, q: 2.5, gain: 0.3, decay: 0.03 });
      burst(t + 0.2, { freq: 3800, q: 4, gain: 0.07, decay: 0.02 });
    }),
    mount: sfx((t) => {
      burst(t, { freq: 1200, q: 1.2, gain: 0.2, decay: 0.06 });
      thump(t + 0.05, { from: 160, to: 70, gain: 0.3, decay: 0.12 });
      burst(t + 0.05, { freq: 3000, q: 3, gain: 0.18, decay: 0.03 });
    }),
    tick: sfx((t) => {
      burst(t, { freq: 4200, q: 5, gain: 0.06, decay: 0.012 });
    }),
    lidOpen: sfx((t) => {
      // latch, then a short hinge creak
      burst(t, { freq: 3000, q: 4, gain: 0.22, decay: 0.02 });
      thump(t + 0.01, { from: 380, to: 160, gain: 0.1, decay: 0.05, type: "triangle" });
      const o = ctx.createOscillator(), g = ctx.createGain(), bp = ctx.createBiquadFilter();
      o.type = "sawtooth"; o.frequency.setValueAtTime(190, t + 0.05); o.frequency.linearRampToValueAtTime(260, t + 0.32);
      bp.type = "bandpass"; bp.frequency.value = 1300; bp.Q.value = 6;
      g.gain.setValueAtTime(0.0001, t + 0.05); g.gain.exponentialRampToValueAtTime(0.03, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      o.connect(bp).connect(g).connect(sfxGain); o.start(t + 0.05); o.stop(t + 0.4);
    }),
    lidClose: sfx((t) => {
      thump(t, { from: 170, to: 70, gain: 0.34, decay: 0.12 });
      burst(t, { freq: 1500, q: 1.5, gain: 0.26, decay: 0.05 });
      burst(t + 0.05, { freq: 3400, q: 5, gain: 0.16, decay: 0.02 }); // latch
    }),
    canSlide: sfx((t) => {
      // a tin can sliding onto the table
      burst(t, { freq: 900, q: 0.6, gain: 0.08, decay: 0.28, type: "lowpass" });
      burst(t + 0.26, { freq: 2600, q: 8, gain: 0.07, decay: 0.12 });
      thump(t + 0.26, { from: 240, to: 150, gain: 0.08, decay: 0.08 });
    }),
    canDrop: sfx((t) => {
      // tin into the bay: a dull thunk and a short metallic ring
      thump(t, { from: 150, to: 60, gain: 0.32, decay: 0.12 });
      burst(t, { freq: 2200, q: 10, gain: 0.12, decay: 0.18 });
      burst(t + 0.002, { freq: 3300, q: 12, gain: 0.07, decay: 0.12 });
    }),
    sprocket: sfx((t) => {
      burst(t, { freq: 2800, q: 3, gain: 0.05, decay: 0.015 });
    }),

    /** Close the AudioContext. Safe to call twice; unlock() later makes a fresh one. */
    destroy() {
      try { motor?.src.stop(); fan?.src.stop(); fan?.hum.stop(); } catch { /* not started */ }
      motor = fan = null;
      noise = null;
      ctx?.close?.().catch(() => {});
      ctx = master = sfxGain = null;
    },
  };
}
