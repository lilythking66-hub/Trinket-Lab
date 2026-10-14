// Audio for the turntable. The music plays through an <audio> element whose
// playbackRate follows the platter (pitch is NOT preserved, so spin-up and
// spin-down sound like a real deck). Surface noise and mechanical cues are
// synthesized; there are no audio assets.

const MIN_RATE = 0.25; // below this the deck is effectively silent
const sameOrigin = (src) => {
  if (!src) return false;
  if (/^(blob:|data:)/.test(src)) return true;
  try { return new URL(src, location.href).origin === location.origin; } catch { return false; }
};

export function createDeckAudio() {
  let ctx = null;
  let master, musicIn, crackleGain, sfxGain, tone = {};
  let crackleSrc = null;
  let el = null;
  let mediaSource = null;
  let routed = false;
  let pendingSeek = null;
  let active = false;
  let rate = 1;
  let volume = 1;
  let crackleLevel = 0.35;
  let warmth = true;
  let muted = false;
  let sfxEnabled = true;
  let wantPlaying = false;
  const listeners = new Set();
  const emit = (type, detail) => { for (const fn of listeners) fn(type, detail); };

  function ensureContext() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return ctx;
    }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);

    // gentle "vintage" voicing for the music
    musicIn = ctx.createGain();
    tone.low = ctx.createBiquadFilter(); tone.low.type = "lowshelf"; tone.low.frequency.value = 140;
    tone.high = ctx.createBiquadFilter(); tone.high.type = "highshelf"; tone.high.frequency.value = 6500;
    tone.cut = ctx.createBiquadFilter(); tone.cut.type = "lowpass"; tone.cut.Q.value = 0.4;
    musicIn.connect(tone.low).connect(tone.high).connect(tone.cut).connect(master);
    applyWarmth();

    crackleGain = ctx.createGain();
    crackleGain.gain.value = 0;
    crackleGain.connect(master);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.9;
    sfxGain.connect(master);

    if (el && !routed && sameOrigin(el.src)) route();
    return ctx;
  }

  function applyWarmth() {
    if (!ctx) return;
    tone.low.gain.value = warmth ? 2.5 : 0;
    tone.high.gain.value = warmth ? -3.5 : 0;
    tone.cut.frequency.value = warmth ? 14000 : 20000;
  }

  function route() {
    try {
      const src = ctx.createMediaElementSource(el);
      src.connect(musicIn);
      mediaSource = src;
      routed = true;
      el.volume = 1;
    } catch {
      mediaSource = null;
      routed = false; // already routed or not allowed — plays directly
    }
  }

  function makeCrackle() {
    const seconds = 5;
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(2, sr * seconds, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let hiss = 0;
      for (let i = 0; i < d.length; i++) {
        hiss = hiss * 0.94 + (Math.random() * 2 - 1) * 0.06;
        d[i] = hiss * 0.035;
      }
      const pops = seconds * (10 + c * 2);
      for (let p = 0; p < pops; p++) {
        const at = Math.floor(Math.random() * (d.length - 400));
        const amp = (Math.random() ** 3) * 0.55 + 0.04;
        const len = 20 + Math.floor(Math.random() * 120);
        const sign = Math.random() < 0.5 ? -1 : 1;
        for (let j = 0; j < len; j++) d[at + j] += sign * amp * Math.exp(-j / (len / 5)) * (j % 2 ? -0.6 : 1);
      }
      // a faint once-per-revolution tick (a scratch on the record)
      const rev = Math.round(sr * 1.8);
      for (let at = Math.floor(sr * 0.7); at < d.length - 200; at += rev) {
        for (let j = 0; j < 80; j++) d[at + j] += 0.09 * Math.exp(-j / 12) * (j % 2 ? -1 : 1);
      }
    }
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 7000;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(lp).connect(crackleGain);
    src.start();
    return src;
  }

  function updateCrackle() {
    if (!ctx) return;
    const on = active && rate > 0.02;
    const target = on ? crackleLevel * 0.9 * Math.min(1, rate) : 0;
    crackleGain.gain.setTargetAtTime(target, ctx.currentTime, 0.05);
    if (on && !crackleSrc) crackleSrc = makeCrackle();
    if (crackleSrc) crackleSrc.playbackRate.value = Math.max(0.05, rate);
  }

  function syncPlayback() {
    if (!el) return;
    const audible = active && rate >= MIN_RATE && !!el.src;
    if (audible) {
      const r = Math.min(4, Math.max(MIN_RATE, rate));
      if (Math.abs(el.playbackRate - r) > 0.004) {
        try { el.playbackRate = r; } catch { /* rate outside browser range */ }
      }
      if (el.paused && !wantPlaying) {
        wantPlaying = true;
        const p = el.play();
        if (p?.catch) p.catch((err) => {
          wantPlaying = false;
          emit("blocked", { reason: err?.name === "NotAllowedError" ? "autoplay" : "media", error: err });
        });
      }
    } else if (!el.paused || wantPlaying) {
      wantPlaying = false;
      el.pause();
    }
    updateCrackle();
  }

  // ---- tiny synthesized mechanics ----
  let noise = null;
  function noiseBuf() {
    if (noise && noise.sampleRate === ctx.sampleRate) return noise;
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noise;
  }
  function burst(t, { freq = 2000, q = 1, gain = 0.3, decay = 0.05, type = "bandpass" }) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf();
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    s.connect(f).connect(g).connect(sfxGain);
    s.start(t, Math.random() * 0.25, decay + 0.03);
  }
  function thump(t, { from = 120, to = 50, gain = 0.4, decay = 0.12, type = "sine" }) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(sfxGain);
    o.start(t);
    o.stop(t + decay + 0.05);
  }
  const sfx = (fn) => (...args) => {
    if (!sfxEnabled || muted) return;
    if (!ensureContext()) return;
    fn(ctx.currentTime, ...args);
  };

  const api = {
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** Call from a user gesture so browsers allow sound. */
    unlock() { ensureContext(); },

    load(src) {
      api.unload();
      el = new Audio();
      el.preload = "auto";
      el.preservesPitch = false;
      el.mozPreservesPitch = false;
      el.webkitPreservesPitch = false;
      if (!sameOrigin(src)) el.crossOrigin = null;
      el.addEventListener("loadedmetadata", () => {
        if (pendingSeek !== null) {
          const ps = pendingSeek;
          pendingSeek = null;
          api.seek(typeof ps === "object" ? ps.progress * el.duration : ps);
        }
        emit("duration", { duration: el.duration });
      });
      el.addEventListener("ended", () => { wantPlaying = false; emit("ended"); });
      el.addEventListener("error", () => emit("error", { error: el.error }));
      el.addEventListener("pause", () => { wantPlaying = false; });
      el.src = src;
      if (ctx && sameOrigin(src)) route();
      el.volume = ctx && routed ? 1 : (muted ? 0 : volume);
      syncPlayback();
    },
    unload() {
      try { mediaSource?.disconnect(); } catch { /* already disconnected */ }
      mediaSource = null;
      if (el) {
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
      el = null;
      routed = false;
      wantPlaying = false;
      pendingSeek = null;
      active = false;
      updateCrackle();
    },

    /** Needle is in the groove (music should sound when the platter turns). */
    setActive(on) {
      if (active === !!on) return;
      active = !!on;
      if (active) ensureContext();
      syncPlayback();
    },
    /** Playback rate = platter speed relative to 33⅓ rpm. */
    setRate(r) {
      rate = Math.max(0, r);
      syncPlayback();
    },
    seek(seconds) {
      if (!el) return;
      if (!(el.readyState >= 1) || !Number.isFinite(el.duration)) { pendingSeek = seconds; return; }
      el.currentTime = Math.max(0, Math.min(el.duration - 0.05, seconds));
    },
    seekProgress(p) {
      if (!el) return;
      if (Number.isFinite(el.duration) && el.duration > 0) api.seek(p * el.duration);
      else pendingSeek = { progress: p };
    },
    get currentTime() { return el?.currentTime ?? 0; },
    get duration() { return el && Number.isFinite(el.duration) ? el.duration : 0; },
    get element() { return el; },
    get playing() { return !!el && !el.paused; },

    get volume() { return volume; },
    set volume(v) {
      volume = Math.max(0, Math.min(1, Number(v)));
      if (master) master.gain.value = muted ? 0 : volume;
      if (el && !routed) el.volume = muted ? 0 : volume;
    },
    set muted(m) {
      muted = !!m;
      api.volume = volume;
    },
    set crackle(v) { crackleLevel = Math.max(0, Math.min(1, Number(v) || 0)); updateCrackle(); },
    set warmth(on) { warmth = !!on; applyWarmth(); },
    set sfx(on) { sfxEnabled = !!on; },

    needleDrop: sfx((t) => {
      thump(t, { from: 95, to: 42, gain: 0.5, decay: 0.16 });
      burst(t, { freq: 600, q: 0.7, gain: 0.25, decay: 0.08 });
      for (let i = 0; i < 4; i++) burst(t + 0.03 + Math.random() * 0.25, { freq: 2500 + Math.random() * 3000, q: 3, gain: 0.08, decay: 0.012 });
    }),
    lift: sfx((t) => {
      burst(t, { freq: 1400, q: 1.5, gain: 0.14, decay: 0.03 });
      thump(t, { from: 160, to: 90, gain: 0.12, decay: 0.05 });
    }),
    click: sfx((t, heavy = false) => {
      burst(t, { freq: heavy ? 2200 : 3800, q: 2.5, gain: heavy ? 0.35 : 0.22, decay: 0.03 });
      thump(t, { from: heavy ? 320 : 600, to: 140, gain: 0.12, decay: 0.05, type: "triangle" });
    }),
    clack: sfx((t) => {
      // arm landing on the rest post
      burst(t, { freq: 1900, q: 3, gain: 0.18, decay: 0.025 });
      thump(t, { from: 240, to: 120, gain: 0.1, decay: 0.05 });
    }),
    plop: sfx((t) => {
      // record settling on the mat
      thump(t, { from: 140, to: 60, gain: 0.32, decay: 0.18 });
      burst(t, { freq: 400, q: 0.6, gain: 0.18, decay: 0.12, type: "lowpass" });
    }),
    runoutTick: sfx((t) => {
      burst(t, { freq: 900, q: 1, gain: 0.22, decay: 0.04 });
      thump(t, { from: 80, to: 40, gain: 0.25, decay: 0.08 });
    }),
    motor: sfx((t, on) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(on ? 30 : 60, t);
      o.frequency.linearRampToValueAtTime(on ? 60 : 25, t + (on ? 0.9 : 1.6));
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 180;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.03, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (on ? 1 : 1.7));
      o.connect(f).connect(g).connect(sfxGain);
      o.start(t);
      o.stop(t + 1.8);
    }),

    destroy() {
      api.unload();
      try { crackleSrc?.stop(); } catch { /* not started */ }
      crackleSrc = null;
      ctx?.close?.().catch(() => {});
      ctx = null;
      master = musicIn = crackleGain = sfxGain = null;
      tone = {};
      noise = null;
      mediaSource = null;
    },
  };
  return api;
}
