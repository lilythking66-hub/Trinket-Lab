// Tiny synthesized mechanical cues (no audio files). Silent until the first
// user gesture, as browsers require.

let ctx = null;

function audio() {
  if (!ctx) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

let noise = null;
function noiseBuffer(ac) {
  if (noise && noise.sampleRate === ac.sampleRate) return noise;
  noise = ac.createBuffer(1, Math.ceil(ac.sampleRate * 0.3), ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}

function burst(ac, t, { freq = 2500, q = 1, gain = 0.4, decay = 0.04, type = "bandpass" }) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(t, Math.random() * 0.2, decay + 0.02);
}

function tone(ac, t, { from = 400, to = from, gain = 0.3, decay = 0.12, type = "sine" }) {
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + decay);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + decay + 0.03);
}

export const sounds = {
  /** Ratchet detent. */
  tick(volume = 1) {
    const ac = volume > 0 ? audio() : null; if (!ac) return;
    const t = ac.currentTime;
    burst(ac, t, { freq: 3600, q: 2, gain: 0.32 * volume, decay: 0.025 });
    tone(ac, t, { from: 900, to: 420, gain: 0.08 * volume, decay: 0.05, type: "triangle" });
  },
  /** Plastic capsules knocking together. */
  clack(volume = 1) {
    const ac = volume > 0 ? audio() : null; if (!ac) return;
    const t = ac.currentTime + Math.random() * 0.08;
    burst(ac, t, { freq: 1800 + Math.random() * 1600, q: 4, gain: 0.18 * volume, decay: 0.03 });
  },
  /** Capsule landing in the tray. */
  thunk(volume = 1) {
    const ac = volume > 0 ? audio() : null; if (!ac) return;
    const t = ac.currentTime;
    tone(ac, t, { from: 210, to: 80, gain: 0.42 * volume, decay: 0.16 });
    burst(ac, t, { freq: 900, q: 1.2, gain: 0.25 * volume, decay: 0.06 });
    burst(ac, t + 0.13, { freq: 1500, q: 3, gain: 0.1 * volume, decay: 0.03 });
  },
  /** Coin sliding into the slot. */
  clink(volume = 1) {
    const ac = volume > 0 ? audio() : null; if (!ac) return;
    const t = ac.currentTime;
    tone(ac, t, { from: 2650, to: 2500, gain: 0.12 * volume, decay: 0.35, type: "sine" });
    tone(ac, t, { from: 3970, to: 3900, gain: 0.05 * volume, decay: 0.25, type: "sine" });
    burst(ac, t + 0.12, { freq: 5000, q: 3, gain: 0.08 * volume, decay: 0.03 });
    tone(ac, t + 0.24, { from: 300, to: 140, gain: 0.12 * volume, decay: 0.08 });
  },
  /** Capsule halves popping apart. */
  pop(volume = 1) {
    const ac = volume > 0 ? audio() : null; if (!ac) return;
    const t = ac.currentTime;
    tone(ac, t, { from: 520, to: 1180, gain: 0.22 * volume, decay: 0.09 });
    burst(ac, t, { freq: 1200, q: 0.8, gain: 0.25 * volume, decay: 0.05 });
  },
  /** Locked knob refusing to turn. */
  thud(volume = 1) {
    const ac = volume > 0 ? audio() : null; if (!ac) return;
    tone(ac, ac.currentTime, { from: 140, to: 90, gain: 0.25 * volume, decay: 0.08, type: "triangle" });
  },
};
