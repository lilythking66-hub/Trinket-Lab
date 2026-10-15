// Synthesized typewriter sounds: no audio assets. Key clack, the typebar
// hitting the platen, the escapement tick, space bar, bell, the carriage
// return (ratchet + slide + slam), line feed, shift, paper and jams.

export function createTypewriterSound() {
  let ctx = null, master = null, noise = null;
  let volume = 0.8, muted = false, enabled = true;

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
    noise = ctx.createBuffer(1, sr, sr);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  const live = () => enabled && !muted;
  const applyVolume = () => { if (master) master.gain.setTargetAtTime(live() ? volume : 0, ctx.currentTime, 0.02); };
  const ready = () => live() && ensure() && ctx.state !== "closed";

  /** A filtered noise burst. */
  function burst({ at = 0, dur = 0.03, type = "bandpass", freq = 2000, q = 1, gain = 0.3, attack = 0.001, decay = dur, rate = 1 }) {
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = rate;
    const fl = ctx.createBiquadFilter();
    fl.type = type; fl.frequency.value = freq; fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + attack + decay);
    src.connect(fl).connect(g).connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + attack + decay + 0.05);
    return { src, fl, g, t };
  }
  /** A short pitched body (thump, ring). */
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
  const vary = (v, amt = 0.12) => v * (1 + (Math.random() * 2 - 1) * amt);

  return {
    unlock() { if (live()) ensure(); },
    get volume() { return volume; },
    set volume(v) { volume = Math.max(0, Math.min(1, Number(v) || 0)); applyVolume(); },
    get muted() { return muted; },
    set muted(v) { muted = !!v; applyVolume(); },
    get enabled() { return enabled; },
    set enabled(v) { enabled = !!v; applyVolume(); },

    /** Key going down: a dull plastic/metal clack. */
    key(force = 1) {
      if (!ready()) return;
      burst({ dur: 0.022, freq: vary(1500), q: 1.1, gain: 0.16 * force });
      tone({ freq: vary(150, 0.08), to: 90, dur: 0.03, gain: 0.08 * force });
    },
    /** The slug hitting the paper on the platen, then the escapement letting go. */
    strike(force = 1) {
      if (!ready()) return;
      burst({ dur: 0.016, type: "highpass", freq: vary(1800), q: 0.7, gain: 0.42 * force });
      burst({ dur: 0.04, freq: vary(3200), q: 2.2, gain: 0.2 * force });
      tone({ freq: vary(240, 0.1), to: 140, dur: 0.045, gain: 0.22 * force, type: "triangle" });
      tone({ at: 0.004, freq: vary(5200, 0.06), dur: 0.05, gain: 0.018 * force });
      burst({ at: 0.03, dur: 0.008, type: "highpass", freq: 4200, q: 0.8, gain: 0.09 });
    },
    space() {
      if (!ready()) return;
      burst({ dur: 0.04, type: "lowpass", freq: 900, q: 0.8, gain: 0.32 });
      tone({ freq: 110, to: 70, dur: 0.06, gain: 0.16 });
      burst({ at: 0.035, dur: 0.008, type: "highpass", freq: 4200, q: 0.8, gain: 0.09 });
    },
    escape() {
      if (!ready()) return;
      burst({ dur: 0.008, type: "highpass", freq: 4200, q: 0.8, gain: 0.08 });
    },
    bell() {
      if (!ready()) return;
      const f0 = 2093;
      tone({ freq: f0, dur: 1.4, gain: 0.16 });
      tone({ freq: f0 * 2.76, dur: 0.7, gain: 0.05 });
      tone({ freq: f0 * 5.4, dur: 0.3, gain: 0.025 });
      burst({ dur: 0.01, type: "highpass", freq: 6000, q: 0.7, gain: 0.08 });
    },
    /** Lever ratchet, the slide back across, the slam at the margin. */
    carriageReturn(duration = 0.3) {
      if (!ready()) return;
      burst({ dur: 0.012, type: "highpass", freq: 2500, q: 1, gain: 0.22 });
      burst({ at: 0.045, dur: 0.012, type: "highpass", freq: 2800, q: 1, gain: 0.2 });
      const slide = burst({ at: 0.06, dur: duration, freq: 700, q: 0.7, gain: 0.07, attack: 0.04, decay: duration });
      slide.fl.frequency.setValueAtTime(600, slide.t);
      slide.fl.frequency.linearRampToValueAtTime(1500, slide.t + duration);
      const clicks = Math.round(duration * 30);
      for (let i = 0; i < clicks; i++) burst({ at: 0.07 + (i / clicks) * duration, dur: 0.004, type: "highpass", freq: 5000, q: 1, gain: 0.025 });
      burst({ at: 0.06 + duration, dur: 0.07, type: "lowpass", freq: 1100, q: 0.9, gain: 0.45 });
      tone({ at: 0.06 + duration, freq: 95, to: 55, dur: 0.12, gain: 0.3 });
      tone({ at: 0.062 + duration, freq: 1900, dur: 0.12, gain: 0.02 });
    },
    lineFeed() {
      if (!ready()) return;
      burst({ dur: 0.01, type: "highpass", freq: 2600, q: 1, gain: 0.2 });
      burst({ at: 0.035, dur: 0.012, type: "highpass", freq: 2900, q: 1, gain: 0.16 });
    },
    shift(down = true) {
      if (!ready()) return;
      burst({ dur: 0.05, type: "lowpass", freq: down ? 700 : 900, q: 1, gain: 0.3 });
      tone({ freq: down ? 80 : 95, to: 50, dur: 0.08, gain: 0.18 });
    },
    erase() {
      if (!ready()) return;
      burst({ dur: 0.012, type: "highpass", freq: 3000, q: 1, gain: 0.12 });
      burst({ at: 0.02, dur: 0.12, freq: 2400, q: 0.6, gain: 0.05, attack: 0.02 });
    },
    jam() {
      if (!ready()) return;
      burst({ dur: 0.06, type: "lowpass", freq: 600, q: 2, gain: 0.35 });
      tone({ freq: 70, to: 45, dur: 0.1, gain: 0.22, type: "square" });
    },
    paper(duration = 0.5) {
      if (!ready()) return;
      const r = burst({ dur: duration, freq: 3600, q: 0.5, gain: 0.07, attack: 0.05, decay: duration, rate: 0.7 });
      r.fl.frequency.linearRampToValueAtTime(2200, r.t + duration);
      for (let i = 0; i < 5; i++) burst({ at: 0.05 + i * duration / 6, dur: 0.01, type: "highpass", freq: 2600, q: 1, gain: 0.12 });
    },
    destroy() {
      try { ctx?.close(); } catch { /* already closed */ }
      ctx = null; master = null;
    },
  };
}
