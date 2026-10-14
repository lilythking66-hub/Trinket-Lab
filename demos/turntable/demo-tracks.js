// Three short songs synthesized in the browser so the demo works without
// shipping any audio (and without any licensing questions). Rendered once
// sample by sample and wrapped as WAV files.

const SR = 32000;

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);
const CHORDS = {
  Cmaj7: [48, 55, 59, 64], Am7: [45, 52, 55, 60], Dm7: [50, 57, 60, 65], G7: [43, 53, 59, 62],
  Fmaj7: [41, 52, 57, 64], Em7: [40, 50, 55, 59], Am9: [45, 52, 59, 60], C: [48, 55, 60, 64], G: [43, 50, 55, 59], E7: [40, 50, 56, 62],
};

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- direct sample synthesis (fast, no audio graph) ---- */

const TBL = 4096;
const SINE = new Float32Array(TBL + 1);
const TRI = new Float32Array(TBL + 1);
for (let i = 0; i <= TBL; i++) {
  SINE[i] = Math.sin((i / TBL) * Math.PI * 2);
  const x = i / TBL;
  TRI[i] = x < 0.25 ? x * 4 : x < 0.75 ? 2 - x * 4 : x * 4 - 4;
}

function tone(L, R, t, freq, { dur = 1, gain = 0.2, type = "sine", attack = 0.008, partial = 0.25, detune = 4, pan = 0 }) {
  const table = type === "triangle" ? TRI : SINE;
  const start = Math.floor(t * SR);
  const len = Math.min(Math.floor(dur * SR), L.length - start);
  if (len <= 0) return;
  const att = Math.max(1, Math.floor(attack * SR));
  const decay = Math.exp(-6 / len);
  const parts = [[1, 1], [2 ** (detune / 1200), 0.5], [2 * 2 ** (-detune / 1200), partial]].filter((p) => p[1] > 0);
  const norm = 1 / parts.reduce((n, p) => n + p[1], 0);
  const gl = gain * norm * Math.min(1, 1 - pan), gr = gain * norm * Math.min(1, 1 + pan);
  const incs = parts.map(([m]) => (freq * m * TBL) / SR);
  const phases = parts.map(() => Math.random() * TBL);
  let env = 0, rel = 1;
  for (let i = 0; i < len; i++) {
    if (i < att) env = i / att; else rel *= decay;
    let v = 0;
    for (let k = 0; k < parts.length; k++) {
      phases[k] += incs[k];
      if (phases[k] >= TBL) phases[k] -= TBL;
      v += table[phases[k] | 0] * parts[k][1];
    }
    v *= env * rel;
    L[start + i] += v * gl;
    R[start + i] += v * gr;
  }
}

function noiseHit(L, R, t, { dur = 0.05, gain = 0.05, hp = 0.6, lp = 0.95 }) {
  const start = Math.floor(t * SR);
  const len = Math.min(Math.floor(dur * SR), L.length - start);
  let low = 0, low2 = 0;
  for (let i = 0; i < len; i++) {
    const n = Math.random() * 2 - 1;
    low += (n - low) * (1 - hp);        // low-passed copy, subtracted → high-pass
    const h = n - low;
    low2 += (h - low2) * lp;            // gentle low-pass on top
    const v = low2 * gain * Math.exp((-5 * i) / len);
    L[start + i] += v;
    R[start + i] += v;
  }
}

function kick(L, R, t, gain = 0.5) {
  const start = Math.floor(t * SR);
  const len = Math.min(Math.floor(0.32 * SR), L.length - start);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const x = i / SR;
    const f = 42 + 68 * Math.exp(-x * 22);
    phase += (f * TBL) / SR;
    const v = SINE[(phase % TBL) | 0] * gain * Math.exp(-x * 11);
    L[start + i] += v;
    R[start + i] += v;
  }
}

export const SONGS = [
  {
    id: "demo-slow-morning",
    title: "Slow Morning",
    artist: "Trinket House Band",
    album: "Demo Pressings",
    bpm: 76,
    bars: 16,
    progression: ["Cmaj7", "Am7", "Dm7", "G7"],
    drums: "lofi",
    lead: [72, 74, 76, 79, 81, 84],
    cover: { bg: ["#f3c27a", "#e7895a"], sun: "#fff3d6", ink: "#5a2e1a" },
    seed: 3,
  },
  {
    id: "demo-window-rain",
    title: "Rain on the Window",
    artist: "Trinket House Band",
    album: "Demo Pressings",
    bpm: 62,
    bars: 12,
    progression: ["Fmaj7", "Em7", "Dm7", "Cmaj7"],
    drums: "none",
    rain: true,
    lead: [76, 77, 79, 81, 84, 86, 88],
    seed: 11,
  },
  {
    id: "demo-night-bus",
    title: "Night Bus",
    artist: "The Late Stops",
    album: "Demo Pressings",
    bpm: 88,
    bars: 16,
    progression: ["Am9", "Fmaj7", "C", "E7"],
    drums: "brush",
    lead: [69, 72, 74, 76, 79],
    cover: { bg: ["#1f2a4a", "#3d3566"], sun: "#f6d58b", ink: "#f4ead8" },
    seed: 29,
  },
];

export async function renderSong(song) {
  const beat = 60 / song.bpm;
  const dur = song.bars * 4 * beat + 2.5;
  const N = Math.ceil(dur * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const r = rng(song.seed);
  const soft = song.drums === "none";

  for (let bar = 0; bar < song.bars; bar++) {
    const t0 = bar * 4 * beat + 0.05;
    const chord = CHORDS[song.progression[bar % song.progression.length]];
    const fade = bar === song.bars - 1 ? 2.4 : 1;
    for (const [i, n] of chord.entries()) {
      tone(L, R, t0 + i * 0.012, NOTE(n + 12), { dur: 4 * beat * fade, gain: 0.07, partial: 0.18, attack: soft ? 0.25 : 0.01, pan: -0.2 });
      if (!soft) tone(L, R, t0 + 2 * beat + i * 0.01, NOTE(n + 12), { dur: 2 * beat, gain: 0.045, partial: 0.18, pan: -0.2 });
    }
    tone(L, R, t0, NOTE(chord[0] - 12), { dur: 2 * beat, gain: 0.24, type: "triangle", partial: 0, detune: 0 });
    tone(L, R, t0 + 2 * beat, NOTE(chord[0] - 12 + (r() < 0.5 ? 7 : 12)), { dur: 1.6 * beat, gain: 0.2, type: "triangle", partial: 0, detune: 0 });
    if (bar > 1 && bar < song.bars - 1) {
      for (let s = 0; s < 8; s++) {
        if (r() < (soft ? 0.38 : 0.45)) {
          const n = song.lead[Math.floor(r() * song.lead.length)];
          tone(L, R, t0 + (s * beat) / 2, NOTE(n), { dur: soft ? 1.8 : 0.7, gain: soft ? 0.06 : 0.07, partial: soft ? 0.6 : 0.3, pan: 0.25 });
        }
      }
    }
    if (!soft && bar < song.bars - 1) {
      for (let b = 0; b < 4; b++) {
        const t = t0 + b * beat;
        if (b === 0 || (b === 2 && song.drums === "lofi") || (b === 2 && r() < 0.5)) kick(L, R, t, song.drums === "lofi" ? 0.5 : 0.36);
        if (b === 1 || b === 3) noiseHit(L, R, t, song.drums === "brush" ? { dur: 0.2, gain: 0.09, hp: 0.3, lp: 0.5 } : { dur: 0.13, gain: 0.16, hp: 0.4, lp: 0.6 });
        noiseHit(L, R, t, { dur: 0.04, gain: 0.04, hp: 0.9 });
        noiseHit(L, R, t + beat / 2 + (song.drums === "lofi" ? beat * 0.08 : 0), { dur: 0.03, gain: 0.03, hp: 0.9 });
      }
    }
  }
  if (song.rain) noiseHit(L, R, 0, { dur, gain: 0.05, hp: 0.5, lp: 0.35 });
  // gentle saturation + normalise
  let peak = 0;
  for (let i = 0; i < N; i++) {
    L[i] = Math.tanh(L[i] * 1.4); R[i] = Math.tanh(R[i] * 1.4);
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const g = peak > 0 ? 0.85 / peak : 1;
  for (let i = 0; i < N; i++) { L[i] *= g; R[i] *= g; }
  await new Promise((res) => setTimeout(res)); // let the page breathe between songs
  return { numberOfChannels: 2, length: N, sampleRate: SR, getChannelData: (c) => (c ? R : L) };
}

function toWav(buffer) {
  const ch = buffer.numberOfChannels, len = buffer.length, sr = buffer.sampleRate;
  const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); data.setUint32(4, 36 + len * ch * 2, true); str(8, "WAVE");
  str(12, "fmt "); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true);
  str(36, "data"); data.setUint32(40, len * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) {
    const v = Math.max(-1, Math.min(1, chans[c][i]));
    data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    o += 2;
  }
  return new Blob([data], { type: "audio/wav" });
}

function drawCover(song) {
  if (!song.cover) return null;
  const c = document.createElement("canvas");
  c.width = c.height = 600;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 600);
  grad.addColorStop(0, song.cover.bg[0]);
  grad.addColorStop(1, song.cover.bg[1]);
  g.fillStyle = grad;
  g.fillRect(0, 0, 600, 600);
  g.fillStyle = song.cover.sun;
  g.globalAlpha = 0.95;
  g.beginPath(); g.arc(300, 330, 150, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 0.35;
  for (let i = 0; i < 5; i++) g.fillRect(0, 380 + i * 34, 600, 12 - i * 1.5);
  g.globalAlpha = 1;
  g.fillStyle = song.cover.ink;
  g.font = "700 46px ui-rounded, 'Avenir Next', system-ui, sans-serif";
  g.fillText(song.title, 44, 92);
  g.font = "500 24px Georgia, serif";
  g.fillText(song.artist, 46, 130);
  return new Promise((res) => c.toBlob(res, "image/jpeg", 0.9));
}

/** Resolves to plain record descriptions: { id, src (Blob), title, artist, album, cover? } */
export async function makeDemoRecords() {
  const out = [];
  for (const song of SONGS) {
    const audio = await renderSong(song);
    const cover = await drawCover(song);
    out.push({ id: song.id, src: toWav(audio), title: song.title, artist: song.artist, album: song.album, cover: cover || undefined, demo: true });
  }
  return out;
}
