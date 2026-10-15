// Synthesized press sounds: no audio assets. Ratchet pawl clicks, the gear
// train's purr and the paper being pressed (both follow crank speed), the
// sheet gripped and released, the pawl catching a back-turn, a sheet taken.

export function createPressSound() {
  let ctx = null, master = null, noise = null;
  let gear = null, press = null;
  let volume = 0.8, muted = false, enabled = true, unlocked = false;

  const live = () => enabled && !muted;
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
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.002; comp.release.value = 0.12;
    master.connect(comp).connect(ctx.destination);
    const sr = ctx.sampleRate;
    noise = ctx.createBuffer(1, sr * 2, sr);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    gear = loop({ type: "bandpass", freq: 340, q: 1.6 });
    press = loop({ type: "lowpass", freq: 900, q: 0.6 });
    return ctx;
  }
  const applyVolume = () => { if (master) master.gain.setTargetAtTime(live() ? volume : 0, ctx.currentTime, 0.02); };
  const ready = () => live() && unlocked && ensure() && ctx.state !== "closed";

  function loop({ type, freq, q }) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const fl = ctx.createBiquadFilter();
    fl.type = type; fl.frequency.value = freq; fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(fl).connect(g).connect(master);
    src.start();
    return { src, fl, g };
  }

  function burst({ at = 0, dur = 0.03, type = "bandpass", freq = 2000, q = 1, gain = 0.3, attack = 0.001 }) {
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const fl = ctx.createBiquadFilter();
    fl.type = type; fl.frequency.value = freq; fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + attack + dur);
    src.connect(fl).connect(g).connect(master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + attack + dur + 0.05);
  }
  function tone({ at = 0, freq = 200, to = null, dur = 0.05, gain = 0.2, type = "sine", attack = 0.001 }) {
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + attack + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }
  const vary = (v, amt = 0.1) => v * (1 + (Math.random() * 2 - 1) * amt);

  return {
    unlock() { unlocked = true; if (live()) ensure(); },
    get volume() { return volume; },
    set volume(v) { volume = Math.max(0, Math.min(1, Number(v) || 0)); applyVolume(); },
    get muted() { return muted; },
    set muted(v) { muted = !!v; applyVolume(); if (muted) this.motion(0, false); },
    get enabled() { return enabled; },
    set enabled(v) { enabled = !!v; applyVolume(); },

    /** Ratchet pawl dropping into a tooth. */
    tick(speed = 0) {
      if (!ready()) return;
      const soft = Math.min(1, 0.45 + speed * 0.08);
      burst({ dur: 0.012, freq: vary(3600), q: 4, gain: 0.12 * soft });
      tone({ freq: vary(1900, 0.06), to: 1100, dur: 0.018, gain: 0.035 * soft, type: "triangle" });
    },
    /** The pawl catching a backwards turn. */
    pawl() {
      if (!ready()) return;
      burst({ dur: 0.03, freq: 1800, q: 2, gain: 0.22 });
      tone({ freq: 240, to: 120, dur: 0.06, gain: 0.12 });
    },
    /** Continuous: speed in turns/s, pressing = a sheet is in the nip. */
    motion(speed, pressing) {
      if (!ctx || !gear) return;
      const t = ctx.currentTime;
      const s = Math.min(1, Math.abs(speed) / 2);
      gear.g.gain.setTargetAtTime(live() ? s * 0.09 : 0, t, 0.05);
      gear.fl.frequency.setTargetAtTime(240 + s * 420, t, 0.08);
      press.g.gain.setTargetAtTime(live() && pressing ? Math.min(1, s * 1.6) * 0.13 : 0, t, 0.05);
      press.fl.frequency.setTargetAtTime(500 + s * 1500, t, 0.08);
    },
    /** The relief being pressed: small crunches as the sheet advances. */
    crunch() {
      if (!ready()) return;
      burst({ dur: 0.02, type: "highpass", freq: vary(2400, 0.2), q: 0.7, gain: 0.035 });
    },
    grip() {
      if (!ready()) return;
      tone({ freq: 150, to: 80, dur: 0.08, gain: 0.16 });
      burst({ dur: 0.05, type: "lowpass", freq: 900, gain: 0.12 });
    },
    release() {
      if (!ready()) return;
      burst({ dur: 0.16, type: "bandpass", freq: 2600, q: 0.8, gain: 0.07, attack: 0.02 });
      tone({ freq: 110, to: 70, dur: 0.06, gain: 0.08 });
    },
    slide() {
      if (!ready()) return;
      burst({ dur: 0.32, type: "bandpass", freq: 3000, q: 0.6, gain: 0.06, attack: 0.06 });
    },
    take() {
      if (!ready()) return;
      burst({ dur: 0.22, type: "bandpass", freq: 4200, q: 0.5, gain: 0.08, attack: 0.03 });
    },
    swap() {
      if (!ready()) return;
      tone({ freq: 520, to: 300, dur: 0.05, gain: 0.08, type: "triangle" });
      burst({ at: 0.06, dur: 0.03, freq: 2400, q: 3, gain: 0.12 });
    },
    destroy() {
      try { ctx?.close(); } catch { /* already closed */ }
      ctx = null; gear = null; press = null;
    },
  };
}
