// Tiny synthesized sound cues (no audio files). Browsers only allow audio after a
// user gesture, so cues triggered without one simply stay silent.

let ctx = null;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function noiseBuffer(ac, seconds) {
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * seconds), ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** Mechanical shutter: a bright tick followed by a soft low clunk. */
export function shutterCue(volume = 0.5) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const out = ac.createGain();
  out.gain.value = volume;
  out.connect(ac.destination);

  const tick = ac.createBufferSource();
  tick.buffer = noiseBuffer(ac, 0.05);
  const hp = ac.createBiquadFilter();
  hp.type = "bandpass";
  hp.frequency.value = 3200;
  hp.Q.value = 0.8;
  const g1 = ac.createGain();
  g1.gain.setValueAtTime(0.9, t);
  g1.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
  tick.connect(hp).connect(g1).connect(out);
  tick.start(t);

  const clunk = ac.createOscillator();
  clunk.type = "sine";
  clunk.frequency.setValueAtTime(180, t + 0.05);
  clunk.frequency.exponentialRampToValueAtTime(70, t + 0.13);
  const g2 = ac.createGain();
  g2.gain.setValueAtTime(0.0001, t);
  g2.gain.exponentialRampToValueAtTime(0.5, t + 0.06);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  clunk.connect(g2).connect(out);
  clunk.start(t);
  clunk.stop(t + 0.2);
}

/** Film motor: a filtered, slightly wobbling whir for `duration` ms. */
export function motorCue(duration = 1500, volume = 0.35) {
  const ac = audio();
  if (!ac) return () => {};
  const t = ac.currentTime;
  const dur = duration / 1000;
  const out = ac.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(volume, t + 0.08);
  out.gain.setValueAtTime(volume, t + Math.max(0.1, dur - 0.12));
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  out.connect(ac.destination);

  const osc = ac.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = 92;
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 520;
  const wob = ac.createOscillator();
  wob.frequency.value = 23;
  const wobGain = ac.createGain();
  wobGain.gain.value = 6;
  wob.connect(wobGain).connect(osc.frequency);

  const n = ac.createBufferSource();
  n.buffer = noiseBuffer(ac, dur + 0.1);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1400;
  bp.Q.value = 1.2;
  const ng = ac.createGain();
  ng.gain.value = 0.18;

  osc.connect(lp).connect(out);
  n.connect(bp).connect(ng).connect(out);
  osc.start(t); wob.start(t); n.start(t);
  osc.stop(t + dur + 0.05); wob.stop(t + dur + 0.05); n.stop(t + dur + 0.05);
  return () => {
    try {
      out.gain.cancelScheduledValues(ac.currentTime);
      out.gain.setTargetAtTime(0.0001, ac.currentTime, 0.02);
    } catch {}
  };
}

/** Light paper slide used when the photo is taken. */
export function takeCue(volume = 0.25) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const n = ac.createBufferSource();
  n.buffer = noiseBuffer(ac, 0.25);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(2500, t);
  bp.frequency.exponentialRampToValueAtTime(900, t + 0.22);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volume, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
  n.connect(bp).connect(g).connect(ac.destination);
  n.start(t);
}
