// Demo photos painted on a canvas at load time, so the repo carries no image
// assets and no licensing questions. Each returns a JPEG Blob.

const W = 960, H = 720;

function rng(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
}
function canvas(w = W, h = H) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d")];
}
function sky(ctx, w, h, stops) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
function glow(ctx, x, y, r, color, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}
function ridge(ctx, w, base, amp, color, rnd, rough = 6) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, H);
  let y = base;
  const pts = [];
  for (let x = 0; x <= w; x += w / 60) {
    y += (rnd() - 0.5) * amp * 0.35;
    y += (base - y) * 0.08;
    pts.push([x, y + Math.sin(x / (w / rough)) * amp * 0.4]);
  }
  for (const [x, yy] of pts) ctx.lineTo(x, yy);
  ctx.lineTo(w, H);
  ctx.closePath();
  ctx.fill();
  return pts;
}
function grainy(ctx, w, h, amount = 10, seed = 3) {
  const r = rng(seed);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}
const blob = (c) => new Promise((res) => c.toBlob(res, "image/jpeg", 0.88));

/* ------------------------------------------------------------------ scenes */

function lake() {
  const [c, ctx] = canvas();
  const r = rng(5);
  sky(ctx, W, H, [[0, "#9db8d6"], [0.38, "#f2d2b4"], [0.5, "#f8c79a"]]);
  glow(ctx, W * 0.62, H * 0.42, 200, "rgba(255,226,170,.9)");
  ctx.fillStyle = "#fff4dc"; ctx.beginPath(); ctx.arc(W * 0.62, H * 0.43, 26, 0, 7); ctx.fill();
  ridge(ctx, W, H * 0.4, 60, "#8b93ad", r, 3);
  ridge(ctx, W, H * 0.46, 40, "#5f6d86", r, 5);
  ridge(ctx, W, H * 0.5, 20, "#3f4d5c", r, 8);
  // water: mirror the top half, darken, add ripples
  const water = ctx.getImageData(0, 0, W, Math.floor(H * 0.5));
  const [m, mc] = canvas(W, Math.floor(H * 0.5));
  mc.putImageData(water, 0, 0);
  ctx.save();
  ctx.translate(0, H);
  ctx.scale(1, -1);
  ctx.globalAlpha = 0.85;
  ctx.drawImage(m, 0, 0, W, H * 0.5);
  ctx.restore();
  ctx.fillStyle = "rgba(30,50,70,.28)"; ctx.fillRect(0, H * 0.5, W, H * 0.5);
  ctx.strokeStyle = "rgba(255,235,200,.35)";
  for (let i = 0; i < 90; i++) {
    const y = H * 0.52 + r() ** 1.6 * H * 0.48, x = r() * W, len = 20 + r() * 90 * (y / H);
    ctx.lineWidth = 1 + (y / H) * 1.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
  }
  // a little boat
  ctx.fillStyle = "#2a2522";
  ctx.beginPath(); ctx.moveTo(W * 0.3, H * 0.62); ctx.lineTo(W * 0.38, H * 0.62); ctx.lineTo(W * 0.365, H * 0.635); ctx.lineTo(W * 0.315, H * 0.635); ctx.fill();
  ctx.fillRect(W * 0.338, H * 0.59, 3, 18);
  grainy(ctx, W, H, 12, 1);
  return c;
}

function oldTown() {
  const [c, ctx] = canvas();
  const r = rng(9);
  sky(ctx, W, H, [[0, "#f3c98e"], [0.55, "#f6dcb4"], [1, "#e9b17a"]]);
  glow(ctx, W * 0.25, H * 0.3, 320, "rgba(255,240,200,.8)");
  // dome
  const cx = W * 0.54, base = H * 0.52;
  ctx.fillStyle = "#c9925e";
  ctx.fillRect(cx - 120, base - 30, 240, 400);
  ctx.fillStyle = "#b67c4a";
  ctx.beginPath(); ctx.ellipse(cx, base - 30, 95, 120, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = "#a76d3e"; ctx.fillRect(cx - 12, base - 190, 24, 50);
  ctx.beginPath(); ctx.arc(cx, base - 196, 14, Math.PI, 0); ctx.fill();
  ctx.fillRect(cx - 2, base - 236, 4, 30);
  ctx.strokeStyle = "rgba(255,230,190,.5)"; ctx.lineWidth = 2;
  for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(cx + i * 26, base - 30); ctx.quadraticCurveTo(cx + i * 22, base - 120, cx, base - 150); ctx.stroke(); }
  // houses
  for (let i = 0; i < 14; i++) {
    const x = i * 72 - 20 + r() * 20, w = 70 + r() * 30, h = 120 + r() * 140;
    const tone = 150 + r() * 50;
    ctx.fillStyle = `rgb(${tone + 40},${tone},${tone - 50})`;
    if (Math.abs(x + w / 2 - cx) < 140) continue;
    ctx.fillRect(x, H - h, w, h);
    ctx.fillStyle = "rgba(80,40,20,.6)";
    ctx.beginPath(); ctx.moveTo(x - 6, H - h); ctx.lineTo(x + w / 2, H - h - 30 - r() * 20); ctx.lineTo(x + w + 6, H - h); ctx.fill();
    for (let wy = H - h + 20; wy < H - 30; wy += 34) for (let wx = x + 10; wx < x + w - 16; wx += 24) {
      ctx.fillStyle = r() < 0.35 ? "rgba(255,214,140,.9)" : "rgba(70,40,25,.55)";
      ctx.fillRect(wx, wy, 11, 18);
    }
  }
  // trees in front
  for (let i = 0; i < 9; i++) {
    const x = r() * W, y = H - 30 + r() * 30, rr = 50 + r() * 50;
    ctx.fillStyle = `rgba(${90 + r() * 30},${100 + r() * 30},50,.95)`;
    ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill();
  }
  glow(ctx, W * 0.2, H * 0.2, 500, "rgba(255,200,120,.25)");
  grainy(ctx, W, H, 12, 2);
  return c;
}

function ferris() {
  const [c, ctx] = canvas();
  const r = rng(13);
  sky(ctx, W, H, [[0, "#2c2d58"], [0.55, "#a2667e"], [0.85, "#f0a77a"], [1, "#f6c38c"]]);
  for (let i = 0; i < 70; i++) { ctx.fillStyle = `rgba(255,255,240,${r() * 0.8})`; ctx.fillRect(r() * W, r() * H * 0.45, 1.6, 1.6); }
  const cx = W * 0.58, cy = H * 0.48, R = 230;
  ctx.strokeStyle = "#2a1f2e"; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - 120, H); ctx.moveTo(cx, cy); ctx.lineTo(cx + 120, H); ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.92, 0, 7); ctx.stroke();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke();
    const gx = cx + Math.cos(a) * R, gy = cy + Math.sin(a) * R;
    ctx.fillStyle = ["#e8a24a", "#d4605a", "#6aa3b8", "#efd27a"][i % 4];
    ctx.fillRect(gx - 13, gy + 2, 26, 20);
    ctx.fillStyle = "#2a1f2e"; ctx.fillRect(gx - 1, gy - 2, 2, 6);
  }
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    glow(ctx, cx + Math.cos(a) * R, cy + Math.sin(a) * R, 10, "rgba(255,220,150,.95)");
  }
  glow(ctx, cx, cy, 30, "rgba(255,230,180,.9)");
  // tents and trees
  ctx.fillStyle = "#1e1624";
  for (let i = 0; i < 12; i++) { const x = r() * W, rr = 40 + r() * 50; ctx.beginPath(); ctx.arc(x, H - 10, rr, 0, 7); ctx.fill(); }
  ctx.fillStyle = "#3a2533";
  ctx.beginPath(); ctx.moveTo(W * 0.08, H); ctx.lineTo(W * 0.18, H * 0.78); ctx.lineTo(W * 0.28, H); ctx.fill();
  for (let i = 0; i < 18; i++) glow(ctx, r() * W, H * 0.85 + r() * H * 0.15, 12, "rgba(255,200,120,.8)");
  grainy(ctx, W, H, 14, 3);
  return c;
}

function tulips() {
  const [c, ctx] = canvas();
  const r = rng(21);
  sky(ctx, W, H, [[0, "#cfe0e6"], [0.5, "#f4e7d6"], [0.52, "#9fae74"], [1, "#59703f"]]);
  glow(ctx, W * 0.8, H * 0.1, 300, "rgba(255,250,230,.8)");
  // field rows
  for (let row = 0; row < 26; row++) {
    const y = H * 0.52 + (row / 26) ** 1.7 * H * 0.5;
    const size = 2 + (row / 26) ** 1.8 * 22;
    for (let x = -20; x < W + 20; x += size * 2.4 + r() * size) {
      ctx.fillStyle = ["#e86d6a", "#f2b04a", "#f3e2c8", "#d65b8a"][(row + Math.floor(x / 200)) % 4];
      ctx.beginPath(); ctx.ellipse(x, y, size * 0.8, size, 0, 0, 7); ctx.fill();
    }
  }
  // big foreground blooms
  for (let i = 0; i < 7; i++) {
    const x = 60 + i * 140 + r() * 40, y = H * 0.62 + r() * 60, s = 46 + r() * 18;
    ctx.strokeStyle = "#4d6a32"; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(x, y + s); ctx.quadraticCurveTo(x + 10, y + 160, x - 6, H); ctx.stroke();
    ctx.fillStyle = "#5c7f3a";
    ctx.beginPath(); ctx.ellipse(x - 26, y + 140, 14, 60, 0.4, 0, 7); ctx.fill();
    const col = ["#ea7d78", "#f5c45d", "#f7ece0", "#de6a95"][i % 4];
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(x, y, s * 0.62, s, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.12)";
    ctx.beginPath(); ctx.ellipse(x + s * 0.25, y + 4, s * 0.32, s * 0.9, 0.12, 0, 7); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x - s * 0.62, y - s * 0.3); ctx.lineTo(x - s * 0.3, y - s * 1.15); ctx.lineTo(x, y - s * 0.5); ctx.lineTo(x + s * 0.3, y - s * 1.15); ctx.lineTo(x + s * 0.62, y - s * 0.3); ctx.fill();
  }
  grainy(ctx, W, H, 10, 4);
  return c;
}

function seaside() {
  const [c, ctx] = canvas();
  const r = rng(33);
  sky(ctx, W, H, [[0, "#7fb2cf"], [0.45, "#d8e6e6"], [0.46, "#3f7f98"], [1, "#1e4e66"]]);
  glow(ctx, W * 0.3, H * 0.28, 160, "rgba(255,250,235,.95)");
  for (let i = 0; i < 260; i++) {
    const y = H * 0.47 + r() ** 1.4 * H * 0.53, x = W * 0.3 + (r() - 0.5) * (80 + (y - H * 0.47) * 1.1);
    ctx.fillStyle = `rgba(255,250,230,${0.3 + r() * 0.6})`;
    ctx.fillRect(x, y, 6 + r() * 20, 2);
  }
  // cliff
  ctx.fillStyle = "#c8a67e";
  ctx.beginPath(); ctx.moveTo(W * 0.62, H); ctx.lineTo(W * 0.66, H * 0.5); ctx.lineTo(W * 0.74, H * 0.36); ctx.lineTo(W, H * 0.33); ctx.lineTo(W, H); ctx.fill();
  ctx.fillStyle = "#9c7a58";
  ctx.beginPath(); ctx.moveTo(W * 0.66, H); ctx.lineTo(W * 0.7, H * 0.55); ctx.lineTo(W * 0.78, H * 0.42); ctx.lineTo(W * 0.8, H); ctx.fill();
  ctx.fillStyle = "#7d9a55";
  ctx.beginPath(); ctx.moveTo(W * 0.72, H * 0.37); ctx.quadraticCurveTo(W * 0.85, H * 0.3, W, H * 0.32); ctx.lineTo(W, H * 0.36); ctx.quadraticCurveTo(W * 0.85, H * 0.35, W * 0.73, H * 0.4); ctx.fill();
  // lighthouse
  const lx = W * 0.86, ly = H * 0.32;
  ctx.fillStyle = "#f4efe6"; ctx.beginPath(); ctx.moveTo(lx - 22, ly); ctx.lineTo(lx - 14, ly - 150); ctx.lineTo(lx + 14, ly - 150); ctx.lineTo(lx + 22, ly); ctx.fill();
  ctx.fillStyle = "#d0574a"; ctx.fillRect(lx - 19, ly - 50, 38, 22); ctx.fillRect(lx - 16, ly - 110, 32, 20);
  ctx.fillStyle = "#3a3a3a"; ctx.fillRect(lx - 18, ly - 172, 36, 24);
  glow(ctx, lx, ly - 160, 40, "rgba(255,240,180,.9)");
  // gulls
  ctx.strokeStyle = "#3b4a55"; ctx.lineWidth = 2.5;
  for (const [x, y, s] of [[W * 0.45, H * 0.2, 14], [W * 0.5, H * 0.15, 10], [W * 0.55, H * 0.23, 8]]) {
    ctx.beginPath(); ctx.moveTo(x - s, y); ctx.quadraticCurveTo(x - s / 2, y - s / 2, x, y); ctx.quadraticCurveTo(x + s / 2, y - s / 2, x + s, y); ctx.stroke();
  }
  grainy(ctx, W, H, 12, 5);
  return c;
}

function forest() {
  const [c, ctx] = canvas(720, 960);
  const w = 720, h = 960;
  const r = rng(41);
  sky(ctx, w, h, [[0, "#e9e2b8"], [0.5, "#9fae78"], [1, "#3f5532"]]);
  for (let layer = 0; layer < 3; layer++) {
    for (let i = 0; i < 8; i++) {
      const x = r() * w, tw = 14 + layer * 18 + r() * 14;
      ctx.fillStyle = ["rgba(120,120,90,.5)", "rgba(80,80,55,.75)", "#3a2e22"][layer];
      ctx.fillRect(x, 0, tw, h);
    }
  }
  // light rays
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 6; i++) {
    const x = 120 + i * 90;
    const g = ctx.createLinearGradient(x, 0, x + 260, h);
    g.addColorStop(0, "rgba(255,240,190,.45)"); g.addColorStop(1, "rgba(255,240,190,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 40 + i * 4, 0); ctx.lineTo(x + 360, h); ctx.lineTo(x + 240, h); ctx.fill();
  }
  ctx.restore();
  // ferns
  for (let i = 0; i < 16; i++) {
    const x = r() * w, y = h - r() * 120;
    ctx.strokeStyle = `rgba(${60 + r() * 40},${100 + r() * 40},50,.95)`;
    ctx.lineWidth = 3;
    for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + k * 20, y - 80, x + k * 42, y - 60 - r() * 40); ctx.stroke(); }
  }
  glow(ctx, w * 0.35, h * 0.12, 260, "rgba(255,250,215,.7)");
  grainy(ctx, w, h, 12, 6);
  return c;
}

function nightStreet() {
  const [c, ctx] = canvas();
  const r = rng(57);
  sky(ctx, W, H, [[0, "#1b2238"], [0.5, "#3a3550"], [0.62, "#2a2433"], [1, "#151219"]]);
  // buildings
  for (let i = 0; i < 9; i++) {
    const x = i * 120 - 30, w2 = 110, h2 = 200 + r() * 160;
    ctx.fillStyle = `rgb(${30 + r() * 15},${28 + r() * 10},${40 + r() * 15})`;
    ctx.fillRect(x, H * 0.62 - h2, w2, h2);
    for (let wy = H * 0.62 - h2 + 18; wy < H * 0.6; wy += 30) for (let wx = x + 12; wx < x + w2 - 12; wx += 26) {
      if (r() < 0.45) { ctx.fillStyle = r() < 0.5 ? "rgba(255,200,120,.85)" : "rgba(255,170,90,.7)"; ctx.fillRect(wx, wy, 12, 16); }
    }
  }
  // wet street with reflections
  ctx.fillStyle = "#1c1820"; ctx.fillRect(0, H * 0.62, W, H * 0.38);
  for (let i = 0; i < 6; i++) {
    const x = 80 + i * 170;
    ctx.fillStyle = "#121015"; ctx.fillRect(x - 3, H * 0.3, 6, H * 0.32);
    glow(ctx, x, H * 0.3, 80, "rgba(255,210,140,.9)");
    ctx.save(); ctx.globalAlpha = 0.5;
    const g = ctx.createLinearGradient(0, H * 0.62, 0, H);
    g.addColorStop(0, "rgba(255,200,130,.6)"); g.addColorStop(1, "rgba(255,200,130,0)");
    ctx.fillStyle = g; ctx.fillRect(x - 14, H * 0.62, 28, H * 0.38);
    ctx.restore();
  }
  ctx.strokeStyle = "rgba(255,230,190,.12)"; ctx.lineWidth = 1;
  for (let i = 0; i < 160; i++) { const x = r() * W, y = r() * H * 0.6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 18); ctx.stroke(); }
  grainy(ctx, W, H, 16, 7);
  return c;
}

export const DEMO_SCENES = [
  { name: "Lake at dawn", paint: lake },
  { name: "Old town", paint: oldTown },
  { name: "Ferris wheel", paint: ferris },
  { name: "Tulip fields", paint: tulips },
  { name: "Seaside", paint: seaside },
  { name: "Forest light", paint: forest },
  { name: "Rainy street", paint: nightStreet },
];

/** Paint all demo photos → File objects (as if picked from disk). */
export async function makeDemoPhotos() {
  const out = [];
  for (const s of DEMO_SCENES) {
    const b = await blob(s.paint());
    out.push(new File([b], s.name + ".jpg", { type: "image/jpeg" }));
    await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}
