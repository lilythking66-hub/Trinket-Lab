// Roller patterns and the textures made from them.
//
// A pattern is a height map drawn with canvas 2D (white = raised) on one
// tile that is exactly one roller circumference tall, so it wraps seamlessly
// around the roller and repeats on the sheet once per crank turn. From the
// same height map we bake:
//   - the roller surface (brass, mirrored like a die), and
//   - the impression on paper: relief light/shadow (emboss, deboss) or ink.
// Hosts can add their own: { tile: number | "sheet", draw(ctx, w, h, opts) }.

const TAU = Math.PI * 2;

/* --------------------------------------------------------------- helpers */

function leaf(ctx, x, y, angle, len, wid, vein = true) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.45, -wid, len, 0);
  ctx.quadraticCurveTo(len * 0.45, wid, 0, 0);
  ctx.fillStyle = "#fff";
  ctx.fill();
  if (vein) {
    ctx.strokeStyle = "#9a9a9a";
    ctx.lineWidth = Math.max(0.28, wid * 0.16);
    ctx.beginPath();
    ctx.moveTo(len * 0.12, 0);
    ctx.lineTo(len * 0.82, 0);
    ctx.stroke();
  }
  ctx.restore();
}

function flower(ctx, x, y, r = 2.4, petals = 5, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = "#fff";
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * TAU;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * r, Math.sin(a) * r, r * 0.95, r * 0.62, a, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = "#7a7a7a";
  ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, TAU); ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, TAU); ctx.fill();
  ctx.restore();
}

function curl(ctx, x, y, r, dir = 1, start = 0) {
  ctx.beginPath();
  for (let i = 0; i <= 28; i++) {
    const t = (i / 28) * Math.PI * 1.7;
    const rr = r * (1 - t / (Math.PI * 2.2));
    const a = start + t * dir;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.stroke();
}

function star(ctx, x, y, R, r = R * 0.42, points = 5, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i / (points * 2)) * TAU;
    const rr = i % 2 ? r : R;
    i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function crescent(ctx, x, y, R, cut = 0.78, dx = 0.42, dy = -0.28) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - R * 3, y - R * 3, R * 6, R * 6);
  ctx.arc(x + R * dx, y + R * dy, R * cut, 0, TAU, true);
  ctx.clip("evenodd");
  ctx.beginPath();
  ctx.arc(x, y, R, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function bow(ctx, x, y, s = 1, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s, s);
  for (const m of [-1, 1]) {
    ctx.save();
    ctx.scale(m, 1);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-3, -5.8, -10.8, -6.8, -11.4, -1.6);
    ctx.bezierCurveTo(-11.8, 2.8, -5, 3.3, 0, 0);
    ctx.fill();
    ctx.fillStyle = "#8a8a8a";
    ctx.beginPath();
    ctx.moveTo(-2.4, -0.6);
    ctx.bezierCurveTo(-4, -3.6, -8.6, -4.4, -9, -1.5);
    ctx.bezierCurveTo(-9.2, 1, -5.4, 1.2, -2.4, -0.6);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(-0.6, 1.2);
    ctx.bezierCurveTo(-2.2, 4.4, -4.2, 7.8, -6.6, 10.4);
    ctx.lineTo(-4.6, 9.7);
    ctx.lineTo(-3.8, 11.8);
    ctx.bezierCurveTo(-2, 8.4, -0.4, 4.8, 1, 1.6);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.ellipse(0, 0.2, 2.3, 2.7, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = "#9a9a9a"; ctx.lineWidth = 0.35;
  ctx.beginPath(); ctx.moveTo(-1, -1.6); ctx.lineTo(-0.6, 2); ctx.moveTo(1, -1.6); ctx.lineTo(0.6, 2); ctx.stroke();
  ctx.restore();
}

function paw(ctx, x, y, s = 1, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s, s);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(-5, 3.4);
  ctx.bezierCurveTo(-5.6, -0.6, -2.6, -2.6, 0, -2.6);
  ctx.bezierCurveTo(2.6, -2.6, 5.6, -0.6, 5, 3.4);
  ctx.bezierCurveTo(4.6, 6, 2, 5.2, 0, 5.4);
  ctx.bezierCurveTo(-2, 5.2, -4.6, 6, -5, 3.4);
  ctx.fill();
  for (const [tx, ty, rx, ry, r] of [[-5.3, -3.6, 1.75, 2.25, -0.45], [-1.85, -6.4, 1.85, 2.4, -0.12], [1.85, -6.4, 1.85, 2.4, 0.12], [5.3, -3.6, 1.75, 2.25, 0.45]]) {
    ctx.beginPath(); ctx.ellipse(tx, ty, rx, ry, r, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function heart(ctx, x, y, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, 2.4);
  ctx.bezierCurveTo(-4, -0.4, -2.6, -3.6, 0, -1.6);
  ctx.bezierCurveTo(2.6, -3.6, 4, -0.4, 0, 2.4);
  ctx.fill();
  ctx.restore();
}

function sprig(ctx, x, y, s = 1, flip = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s * flip, s);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 0.95;
  ctx.lineCap = "round";
  const P = (t) => [(1 - t) * (1 - t) * 0 + 2 * (1 - t) * t * 4.5 + t * t * 1.5, (1 - t) * (1 - t) * 13 + 2 * (1 - t) * t * 0 + t * t * -13];
  ctx.beginPath();
  for (let i = 0; i <= 20; i++) { const [px, py] = P(i / 20); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
  ctx.stroke();
  for (const [t, len] of [[0.2, 6.6], [0.42, 6], [0.62, 5.2], [0.8, 4.2]]) {
    const [px, py] = P(t), [qx, qy] = P(t + 0.02);
    const a = Math.atan2(qy - py, qx - px);
    leaf(ctx, px, py, a - 0.95, len, len * 0.36);
    leaf(ctx, px, py, a + 0.95, len * 0.92, len * 0.34);
  }
  const [tx, ty] = P(1), [ux, uy] = P(0.97);
  leaf(ctx, tx, ty, Math.atan2(ty - uy, tx - ux), 4.6, 1.8);
  ctx.restore();
}

/* -------------------------------------------------------------- patterns */

const evenRows = (h, pitch) => Math.max(2, 2 * Math.round(h / (pitch * 2)));

export const PATTERNS = {
  plain: { label: "Plain", tile: 40, draw() {} },

  vine: {
    label: "Floral vine",
    tile: 52,
    draw(ctx, w, h) {
      const n = Math.max(1, Math.round(h / 41)), seg = h / n, A = 5.2;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = "#fff";
      for (const [cx, ph] of [[w * 0.25, 0], [w * 0.75, 0.5]]) {
        const X = (y) => cx + A * Math.sin((TAU * y) / seg + ph * Math.PI);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i <= 160; i++) { const y = -seg + ((h + 2 * seg) * i) / 160; i ? ctx.lineTo(X(y), y) : ctx.moveTo(X(y), y); }
        ctx.stroke();
        for (let k = -1; k <= n; k++) {
          const y0 = k * seg - ph * seg / 2;
          for (const [yc, side] of [[y0 + seg * 0.25, 1], [y0 + seg * 0.75, -1]]) {
            const xp = X(yc);
            ctx.lineWidth = 0.7;
            ctx.beginPath(); ctx.moveTo(xp, yc); ctx.quadraticCurveTo(xp + side * 3.4, yc - 1, xp + side * 6.6, yc - 2.8); ctx.stroke();
            flower(ctx, xp + side * 7.4, yc - 3.3, 1.95, 5, k * 0.6 + ph);
            ctx.lineWidth = 0.55;
            curl(ctx, xp - side * 3.4, yc + 3.4, 2.3, side, side > 0 ? -2.4 : -0.8);
            ctx.fillStyle = "#fff";
            ctx.beginPath(); ctx.ellipse(xp + side * 4.8, yc + 5, 0.9, 1.35, side * 0.5, 0, TAU); ctx.fill();
          }
          for (const yc of [y0, y0 + seg / 2]) {
            const dir = Math.cos((TAU * yc) / seg + ph * Math.PI) >= 0 ? 1 : -1;
            leaf(ctx, X(yc), yc, -Math.PI / 2 - dir * 0.95 + 0.25, 6, 2.3);
            leaf(ctx, X(yc), yc, -Math.PI / 2 + dir * 0.35 + Math.PI * 0.62 * dir, 5, 1.9);
          }
        }
      }
    },
  },

  paws: {
    label: "Kitten paws",
    tile: 50,
    draw(ctx, w, h) {
      const n = evenRows(h, 27), p = h / n;
      for (let k = -1; k <= n; k++) {
        const y = (k + 0.5) * p, odd = ((k % 2) + 2) % 2;
        const xs = odd ? [0, 0.5] : [0.25, 0.75];
        xs.forEach((fx, j) => { ctx.fillStyle = "#fff"; paw(ctx, w * fx, y, 0.78, (j ? 0.3 : -0.3) * (odd ? -1 : 1)); });
        ctx.fillStyle = "#c8c8c8";
        heart(ctx, w * (odd ? 0.25 : 0), y + 2, 0.62);
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(w * (odd ? 0.75 : 0.5), y - 1, 0.7, 0, TAU); ctx.fill();
      }
    },
  },

  stars: {
    label: "Stars & moon",
    tile: 50,
    draw(ctx, w, h) {
      const n = evenRows(h, 20), p = h / n;
      ctx.fillStyle = "#fff";
      for (let k = -1; k <= n; k++) {
        const y = (k + 0.5) * p, odd = ((k % 2) + 2) % 2;
        if (odd) {
          star(ctx, w * 0.12, y, 3.6);
          crescent(ctx, w * 0.5, y + 1, 4.2);
          star(ctx, w * 0.86, y - 1, 2.6);
          star(ctx, w * 0.31, y - 6.5, 1.5, 0.45, 4, 0);
          star(ctx, w * 0.69, y + 6.5, 1.3, 0.4, 4, 0);
        } else {
          crescent(ctx, w * 0.25, y, 4.6);
          star(ctx, w * 0.62, y + 1, 3.2);
          star(ctx, w * 0.95, y - 4, 1.4, 0.42, 4, 0);
          ctx.beginPath(); ctx.arc(w * 0.44, y - 6, 0.6, 0, TAU); ctx.fill();
        }
        ctx.beginPath(); ctx.arc(w * (odd ? 0.98 : 0.05), y + 7, 0.55, 0, TAU); ctx.fill();
      }
    },
  },

  bows: {
    label: "Ribbon bows",
    tile: 50,
    draw(ctx, w, h) {
      const n = evenRows(h, 26), p = h / n;
      for (let k = -1; k <= n; k++) {
        const y = (k + 0.5) * p, odd = ((k % 2) + 2) % 2;
        const xs = odd ? [0, 0.5] : [0.25, 0.75];
        xs.forEach((fx, j) => bow(ctx, w * fx, y - 2, 0.6, (j ? 0.12 : -0.12)));
        ctx.fillStyle = "#fff";
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(w * (odd ? 0.25 : 0) + (i - 1) * 2, y + 4 + (i === 1 ? -0.8 : 0), 0.5, 0, TAU); ctx.fill(); }
      }
    },
  },

  frame: {
    label: "Vintage border",
    tile: "sheet",
    draw(ctx, w, h) {
      ctx.strokeStyle = "#fff"; ctx.fillStyle = "#fff"; ctx.lineCap = "round";
      const panel = (m, nr, lw) => {
        const x0 = m, x1 = w - m, y0 = 3 + m - 5, y1 = h - 3 - (m - 5);
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(x0 + nr, y0);
        ctx.lineTo(x1 - nr, y0); ctx.arc(x1, y0, nr, Math.PI, Math.PI / 2, true);
        ctx.lineTo(x1, y1 - nr); ctx.arc(x1, y1, nr, -Math.PI / 2, Math.PI, true);
        ctx.lineTo(x0 + nr, y1); ctx.arc(x0, y1, nr, 0, -Math.PI / 2, true);
        ctx.lineTo(x0, y0 + nr); ctx.arc(x0, y0, nr, Math.PI / 2, 0, true);
        ctx.stroke();
      };
      panel(5, 5, 1.25);
      panel(8.4, 3.2, 0.55);
      const diamond = (x, y, s) => { ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.7, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.7, y); ctx.closePath(); ctx.fill(); };
      for (const x of [5, w - 5]) diamond(x, h / 2, 3);
      const rule = (y) => {
        const half = Math.min(w * 0.22, 26);
        ctx.lineWidth = 0.55;
        ctx.beginPath(); ctx.moveTo(w / 2 - half, y); ctx.lineTo(w / 2 - 4, y); ctx.moveTo(w / 2 + 4, y); ctx.lineTo(w / 2 + half, y); ctx.stroke();
        diamond(w / 2, y, 2.2);
        ctx.beginPath(); ctx.arc(w / 2 - half - 1.6, y, 0.8, 0, TAU); ctx.arc(w / 2 + half + 1.6, y, 0.8, 0, TAU); ctx.fill();
      };
      rule(16); rule(h - 16);
      for (const [x, y] of [[13, 11], [w - 13, 11], [13, h - 11], [w - 13, h - 11]]) { ctx.beginPath(); ctx.arc(x, y, 0.9, 0, TAU); ctx.fill(); }
    },
  },

  leaves: {
    label: "Botanical",
    tile: 50,
    draw(ctx, w, h) {
      const n = evenRows(h, 27), p = h / n;
      for (let k = -1; k <= n; k++) {
        const y = (k + 0.5) * p, odd = ((k % 2) + 2) % 2;
        const xs = odd ? [0, 0.5] : [0.25, 0.75];
        xs.forEach((fx, j) => sprig(ctx, w * fx, y, 0.72, j ? -1 : 1));
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(w * (odd ? 0.25 : 0), y - 3, 0.7, 0, TAU); ctx.arc(w * (odd ? 0.22 : 0.03), y + 2.5, 0.5, 0, TAU); ctx.fill();
      }
    },
  },

  monogram: {
    label: "Monogram",
    tile: "sheet",
    draw(ctx, w, h, { letter = "A" } = {}) {
      const cx = w / 2, cy = h / 2, R = Math.min(22, w * 0.3);
      ctx.strokeStyle = "#fff"; ctx.fillStyle = "#fff"; ctx.lineCap = "round";
      for (const side of [-1, 1]) {
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        for (let i = 0; i <= 30; i++) {
          const t = i / 30, a = (Math.PI / 180) * (78 - t * 132);
          const x = cx + side * Math.cos(a) * R, y = cy + Math.sin(a) * R;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
        for (let i = 0; i < 9; i++) {
          const t = (i + 0.5) / 9, a = (Math.PI / 180) * (78 - t * 132);
          const x = cx + side * Math.cos(a) * R, y = cy + Math.sin(a) * R;
          const tang = Math.atan2(-Math.cos(a), side * Math.sin(a)); // towards the top of the wreath
          const len = 5.6 - t * 2;
          leaf(ctx, x, y, tang - side * 0.55, len, len * 0.36);
          leaf(ctx, x, y, tang + side * 0.55, len * 0.9, len * 0.34);
        }
      }
      bow(ctx, cx, cy + R + 1.2, 0.42);
      ctx.beginPath(); ctx.arc(cx, cy - R - 3.5, 0.9, 0, TAU); ctx.fill();
      const text = String(letter || "A");
      let size = R * 1.32;
      ctx.font = `600 ${size}px Didot, "Bodoni 72", "Playfair Display", "Songti SC", "Noto Serif CJK SC", Georgia, serif`;
      const mw = ctx.measureText(text).width;
      if (mw > R * 1.35) { size *= (R * 1.35) / mw; ctx.font = `600 ${size}px Didot, "Bodoni 72", "Playfair Display", "Songti SC", "Noto Serif CJK SC", Georgia, serif`; }
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(text, cx, cy + size * 0.04);
      ctx.lineWidth = 0.45;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.8, 0, TAU); ctx.stroke();
    },
  },
};

export const PATTERN_NAMES = Object.keys(PATTERNS);

/* ---------------------------------------------------------------- papers */

export const PAPERS = {
  cream: { color: "#f2e8d4", noise: 1 },
  white: { color: "#f7f5f0", noise: 0.8 },
  kraft: { color: "#c7a37a", noise: 1.4, fibre: true },
  watercolor: { color: "#f6f2e8", noise: 1.9, deckle: true },
  blue: { color: "#a9babe", noise: 1.1 },
  pink: { color: "#eab9ae", noise: 1 },
};

/* -------------------------------------------------------------- textures */

const cache = new Map();
const makeCanvas = (w, h) => {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
};
const toUrl = (canvas) => {
  if (canvas.toDataURL) return canvas.toDataURL("image/png");
  const c = document.createElement("canvas");
  c.width = canvas.width; c.height = canvas.height;
  c.getContext("2d").drawImage(canvas, 0, 0);
  return c.toDataURL("image/png");
};

/** Parse any CSS colour into [r, g, b]. */
export function rgbOf(color, fallback = [200, 160, 92]) {
  if (typeof document === "undefined") return fallback;
  try {
    const c = makeCanvas(1, 1);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillStyle = String(color).trim() || "#000";
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  } catch { return fallback; }
}

function heightMap(pattern, w, h, ppu, { mirror = false, letter } = {}) {
  const W = Math.max(4, Math.round(w * ppu)), H = Math.max(4, Math.round(h * ppu));
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.scale(W / w, H / h);
  if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
  for (const ox of [-w, 0, w]) {
    for (const oy of [-h, 0, h]) {
      ctx.save();
      ctx.translate(ox, oy);
      ctx.fillStyle = "#fff"; ctx.strokeStyle = "#fff";
      pattern.draw(ctx, w, h, { letter });
      ctx.restore();
    }
  }
  const data = ctx.getImageData(0, 0, W, H).data;
  const hm = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) hm[i] = data[i * 4] / 255;
  return { hm, W, H };
}

function boxBlur(src, W, H, r) {
  if (r < 0.5) return src;
  r = Math.round(r);
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
  const n = 2 * r + 1;
  for (let y = 0; y < H; y++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[y * W + ((k % W) + W) % W];
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = acc / n;
      acc += src[y * W + ((x + r + 1) % W)] - src[y * W + ((x - r) % W + W) % W];
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[(((k % H) + H) % H) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = acc / n;
      acc += tmp[((y + r + 1) % H) * W + x] - tmp[(((y - r) % H) + H) % H * W + x];
    }
  }
  return out;
}

const blur2 = (hm, W, H, r) => boxBlur(boxBlur(hm, W, H, r), W, H, r);

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

/**
 * Bake the roller and paper textures for a pattern.
 * opts: { width (tile width for "sheet" tiles), height (circumference), ppu,
 *         impression: emboss | deboss | ink | none, ink: [r,g,b], brass: [r,g,b], letter }
 * Returns { tileW, tileH, roller, base, paper, repeatX }.
 */
export function bakeTiles(pattern, opts) {
  const { width, height, ppu = 4, impression = "emboss", ink = [42, 36, 32], brass = [200, 160, 92], letter = "A" } = opts;
  const tileW = pattern.tile === "sheet" ? width : pattern.tile;
  const key = [pattern.label, pattern.draw.toString().length, tileW, height, ppu, impression, ink.join(), brass.join(), pattern.tile === "sheet" || pattern === PATTERNS.monogram ? letter : ""].join("|");
  if (cache.has(key)) return cache.get(key);

  const { hm: raw, W, H } = heightMap(pattern, tileW, height, ppu, { letter });
  const { hm: rawR } = heightMap(pattern, tileW, height, ppu, { letter, mirror: true });
  const soft = blur2(raw, W, H, ppu * 0.32);
  const softR = blur2(rawR, W, H, ppu * 0.2);

  // ---- paper impression
  let paper = null;
  if (impression !== "none" && pattern !== PATTERNS.plain) {
    const c = makeCanvas(W, H), ctx = c.getContext("2d");
    const img = ctx.createImageData(W, H), d = img.data;
    const L = [-0.52, -0.62, 0.59], K = ppu * 0.95;
    const sign = impression === "deboss" ? -1 : 1;
    for (let y = 0; y < H; y++) {
      const ym = ((y - 1 + H) % H) * W, yp = ((y + 1) % H) * W;
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const gx = (soft[y * W + (x + 1) % W] - soft[y * W + (x - 1 + W) % W]) * K * sign;
        const gy = (soft[yp + x] - soft[ym + x]) * K * sign;
        const nl = Math.hypot(gx, gy, 1);
        const shade = ((-gx * L[0] - gy * L[1] + L[2]) / nl - L[2]) / (1 - L[2]);
        const o = i * 4;
        if (impression === "ink") {
          const a = Math.min(1, Math.max(0, (soft[i] - 0.32) * 2.4)) * (0.82 + rnd() * 0.18);
          d[o] = ink[0]; d[o + 1] = ink[1]; d[o + 2] = ink[2]; d[o + 3] = a * 235;
        } else if (shade >= 0) {
          d[o] = 255; d[o + 1] = 252; d[o + 2] = 243;
          d[o + 3] = Math.min(0.95, shade * 1.9 + soft[i] * 0.06 * sign) * 255;
        } else {
          d[o] = 72; d[o + 1] = 48; d[o + 2] = 28;
          d[o + 3] = Math.min(0.55, -shade * 0.95 + (sign < 0 ? soft[i] * 0.07 : 0)) * 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    paper = toUrl(c);
  }

  // ---- roller surface (mirrored die) and a plain brushed band for the rest
  const roller = brassTile(W, H, softR, ppu, brass, impression === "ink" ? ink : null);
  const base = plainBrass(brass, ppu, height);
  const out = { tileW, tileH: height, roller, base, paper, repeatX: pattern.tile !== "sheet" };
  cache.set(key, out);
  return out;
}

/** Smooth per-column variation (brushing along the circumference), wrapping. */
function brushed(W, amp) {
  const raw = new Float32Array(W);
  for (let x = 0; x < W; x++) raw[x] = rnd() - 0.5;
  const out = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    let a = 0;
    for (let k = -3; k <= 3; k++) a += raw[(x + k + W) % W] * (4 - Math.abs(k));
    out[x] = (a / 16) * amp * 2;
  }
  return out;
}

const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function brassTile(W, H, hm, ppu, brass, ink) {
  const c = makeCanvas(W, H), ctx = c.getContext("2d");
  const img = ctx.createImageData(W, H), d = img.data;
  const col = brushed(W, 0.022);
  const L = [-0.5, -0.66, 0.56], K = ppu * 2.1;
  const hi = lerp3(brass, [252, 244, 222], 0.42), recess = lerp3(brass, [90, 70, 46], 0.46);
  for (let y = 0; y < H; y++) {
    const ym = ((y - 1 + H) % H) * W, yp = ((y + 1) % H) * W;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const gx = (hm[y * W + (x + 1) % W] - hm[y * W + (x - 1 + W) % W]) * K;
      const gy = (hm[yp + x] - hm[ym + x]) * K;
      const nl = Math.hypot(gx, gy, 1);
      const shade = ((-gx * L[0] - gy * L[1] + L[2]) / nl - L[2]) / (1 - L[2]);
      const h = hm[i];
      // raised = polished face, background = slightly darker, warmer field
      let [r, g, b] = h > 0.5 ? lerp3(brass, hi, (h - 0.5) * 0.6) : lerp3(recess, brass, 0.42 + h * 1.1);
      const k = 1 + col[x];
      r *= k; g *= k; b *= k;
      if (ink && h > 0.35) { const m = Math.min(1, (h - 0.35) * 2); [r, g, b] = lerp3([r, g, b], ink, m); }
      if (shade > 0) [r, g, b] = lerp3([r, g, b], [252, 246, 228], Math.min(1, shade * 1.2) * 0.6);
      else [r, g, b] = lerp3([r, g, b], [48, 32, 18], Math.min(1, -shade * 1.2) * 0.8);
      const o = i * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toUrl(c);
}

function plainBrass(brass, ppu, height) {
  const key = "plain|" + brass.join() + "|" + ppu + "|" + height;
  if (cache.has(key)) return cache.get(key);
  const W = Math.round(32 * ppu), H = Math.round(height * ppu);
  const c = makeCanvas(W, H), ctx = c.getContext("2d");
  const img = ctx.createImageData(W, H), d = img.data;
  const col = brushed(W, 0.035);
  for (let i = 0; i < W * H; i++) {
    const k = 0.95 + col[i % W];
    const o = i * 4;
    d[o] = brass[0] * k; d[o + 1] = brass[1] * k; d[o + 2] = brass[2] * k; d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const url = toUrl(c);
  cache.set(key, url);
  return url;
}

/** A small swatch of a pattern pressed into paper (for pickers). Resolves to a data URL. */
export async function patternPreview(name, { paper = "#f2e8d4", width = 60, height = 60, letter = "A", impression = "emboss", ppu = 3, offsetY = null } = {}) {
  const pattern = typeof name === "string" ? PATTERNS[name] : name;
  if (!pattern || typeof document === "undefined") return "";
  const tw = pattern.tile === "sheet" ? width : pattern.tile;
  const t = bakeTiles(pattern, { width: tw, height: 2 * Math.PI * 26, ppu, impression, letter });
  const c = document.createElement("canvas");
  c.width = Math.round(width * ppu); c.height = Math.round(height * ppu);
  const ctx = c.getContext("2d");
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, c.width, c.height);
  if (t.paper) {
    const img = new Image();
    img.src = t.paper;
    await img.decode().catch(() => {});
    const tile = ctx.createPattern(img, "repeat");
    const oy = offsetY ?? (pattern.tile === "sheet" ? (t.tileH - height) / 2 : 6);
    const ox = (width - t.tileW) / 2;
    ctx.save();
    ctx.translate(ox * ppu, -oy * ppu);
    ctx.fillStyle = tile;
    ctx.fillRect(-ox * ppu, oy * ppu, c.width, c.height);
    ctx.restore();
  }
  return c.toDataURL("image/png");
}

let noiseCache = new Map();
/** Paper fibre noise (greyscale, multiplied over the paper colour). */
export function paperNoiseUrl(strength = 1, fibre = false) {
  const key = strength + "|" + fibre;
  if (noiseCache.has(key) || typeof document === "undefined") return noiseCache.get(key) ?? null;
  const n = 256;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(n, n);
  let s = 11;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < n * n; i++) {
    const v = 255 - r() * 10 * strength;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = `rgba(110, 85, 55, ${0.08 * strength + (fibre ? 0.06 : 0)})`;
  ctx.lineWidth = 0.6;
  for (let i = 0; i < (fibre ? 320 : 150) * strength; i++) {
    const x = r() * n, y = r() * n, a = r() * Math.PI, l = 3 + r() * (fibre ? 14 : 9);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 1, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  if (strength > 1.5) {
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(90, 70, 50, ${0.02 + r() * 0.05})`;
      ctx.beginPath(); ctx.arc(r() * n, r() * n, 1 + r() * 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  const url = c.toDataURL("image/png");
  noiseCache.set(key, url);
  return url;
}

/** Torn (deckle) edge as a CSS polygon, in sheet units. */
export function deckle(w, h, seedValue = 3) {
  let s = seedValue * 7919 + 13;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const pts = [];
  const jag = () => (r() * 1.3).toFixed(2);
  const step = 2.2;
  for (let x = 0; x <= w; x += step) pts.push(`${Math.min(w, x).toFixed(2)}px ${jag()}px`);
  for (let y = 0; y <= h; y += step) pts.push(`calc(100% - ${jag()}px) ${Math.min(h, y).toFixed(2)}px`);
  for (let x = w; x >= 0; x -= step) pts.push(`${Math.max(0, x).toFixed(2)}px calc(100% - ${jag()}px)`);
  for (let y = h; y >= 0; y -= step) pts.push(`${jag()}px ${Math.max(0, y).toFixed(2)}px`);
  return `polygon(${pts.join(",")})`;
}

let castUrl = null;
/** Cast-iron paint grain: soft mottling, fine pores and a few specks (greyscale, multiplied). */
export function castNoiseUrl() {
  if (castUrl || typeof document === "undefined") return castUrl;
  const n = 192;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const ctx = c.getContext("2d");
  let s = 29;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, n, n);
  // mottling: large soft blotches, wrapped so the tile is seamless
  for (let i = 0; i < 70; i++) {
    const x = r() * n, y = r() * n, rad = 8 + r() * 26, a = 0.016 + r() * 0.026;
    for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      g.addColorStop(0, `rgba(60,40,25,${a})`); g.addColorStop(1, "rgba(60,40,25,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    }
  }
  const img = ctx.getImageData(0, 0, n, n);
  for (let i = 0; i < n * n; i++) {
    const v = (r() - 0.5) * 11;
    img.data[i * 4] += v; img.data[i * 4 + 1] += v; img.data[i * 4 + 2] += v;
  }
  ctx.putImageData(img, 0, 0);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(40,25,12,${0.08 + r() * 0.16})`;
    ctx.beginPath(); ctx.arc(r() * n, r() * n, 0.3 + r() * 0.8, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(255,248,230,${0.1 + r() * 0.2})`;
    ctx.beginPath(); ctx.arc(r() * n, r() * n, 0.3 + r() * 0.5, 0, Math.PI * 2); ctx.fill();
  }
  castUrl = c.toDataURL("image/png");
  // the same grain as alpha (dark where the multiply version is dark, light specks kept) for SVG faces
  const a = ctx.getImageData(0, 0, n, n), d = a.data;
  for (let i = 0; i < n * n; i++) {
    const v = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
    if (v > 252) { d[i * 4] = 255; d[i * 4 + 1] = 246; d[i * 4 + 2] = 226; d[i * 4 + 3] = (v - 252) * 9; }
    else { d[i * 4] = 40; d[i * 4 + 1] = 24; d[i * 4 + 2] = 10; d[i * 4 + 3] = Math.min(255, (255 - v) * 1.1); }
  }
  ctx.putImageData(a, 0, 0);
  castAlphaUrl = c.toDataURL("image/png");
  return castUrl;
}
let castAlphaUrl = null;
/** Cast grain as a transparent overlay (for SVG, where blend modes are isolated). */
export function castGrainUrl() { castNoiseUrl(); return castAlphaUrl; }
