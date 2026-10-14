// Generated artwork for records: vinyl texture with a printed label, and a
// matching sleeve. Pure canvas, works for any record object:
//   { title, artist, album, cover?, palette?, vinyl?, envelope? }

export const LABEL_PALETTES = [
  { base: "#e8a33d", ink: "#3b2812" },
  { base: "#d6633f", ink: "#fff3e3" },
  { base: "#2f4b7c", ink: "#f4e8d2" },
  { base: "#efe3cb", ink: "#3a322b" },
  { base: "#86ad94", ink: "#1f3329" },
  { base: "#e6a2ae", ink: "#4a2430" },
  { base: "#22201e", ink: "#e7c27a" },
  { base: "#a4c3d9", ink: "#20344a" },
];

const FONT = 'ui-rounded, "SF Pro Rounded", "Avenir Next", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif';
const SERIF = '"Iowan Old Style", "Songti SC", "Noto Serif SC", Georgia, serif';

export function hashString(str = "") {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function makeCanvas(w, h = w) {
  if (typeof OffscreenCanvas !== "undefined" && typeof document === "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/* ------------------------------------------------------------- colour */

const hex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
function parseHex(c) {
  const m = /^#?([0-9a-f]{6})$/i.exec(c || "");
  if (!m) return [128, 128, 128];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const luminance = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

/** Pick a label colour + readable ink from an image. */
export function extractPalette(image) {
  try {
    const n = 40;
    const c = makeCanvas(n);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, n, n);
    const { data } = ctx.getImageData(0, 0, n, n);
    const buckets = new Map();
    let ar = 0, ag = 0, ab = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      ar += r; ag += g; ab += b;
      const key = (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4);
      const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      e.n++; e.r += r; e.g += g; e.b += b;
      buckets.set(key, e);
    }
    const count = data.length / 4;
    let best = null, bestScore = -1;
    for (const e of buckets.values()) {
      const r = e.r / e.n, g = e.g / e.n, b = e.b / e.n;
      const [, s, l] = rgbToHsl(r, g, b);
      const score = e.n * (0.25 + s) * (1 - Math.abs(l - 0.52) * 1.2);
      if (score > bestScore) { bestScore = score; best = [r, g, b]; }
    }
    const avg = [ar / count, ag / count, ab / count];
    const base = best || avg;
    const light = luminance(base) > 0.58;
    return {
      base: hex(...base),
      average: hex(...avg),
      ink: light ? "#2c2620" : "#fbf5ea",
      light,
    };
  } catch {
    return null; // tainted canvas etc.
  }
}

export function fallbackPalette(record) {
  const p = LABEL_PALETTES[hashString((record.title || "") + "|" + (record.artist || "")) % LABEL_PALETTES.length];
  return { ...p, average: p.base, light: luminance(parseHex(p.base)) > 0.58 };
}

/* ------------------------------------------------------------- images */

const imageCache = new Map();

/** Drop a cached decoded image (call when its object URL is revoked). */
export function forgetImage(src) {
  const p = imageCache.get(src);
  imageCache.delete(src);
  p?.then((img) => img?.close?.());
}

/** Load an image from a URL or Blob. Resolves to null on failure. */
export function loadImage(src) {
  if (!src) return Promise.resolve(null);
  const key = src;
  if (imageCache.has(key)) return imageCache.get(key);
  const p = (async () => {
    try {
      if (src instanceof Blob && typeof createImageBitmap === "function") return await createImageBitmap(src);
      const url = src instanceof Blob ? URL.createObjectURL(src) : src;
      const img = new Image();
      img.decoding = "async";
      if (!/^(blob:|data:)/.test(url)) img.crossOrigin = "anonymous";
      img.src = url;
      await img.decode();
      return img;
    } catch {
      return null;
    }
  })();
  imageCache.set(key, p);
  if (imageCache.size > 64) imageCache.delete(imageCache.keys().next().value);
  return p;
}

function drawCover(ctx, img, x, y, w, h) {
  const iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight;
  const s = Math.max(w / iw, h / ih);
  const dw = iw * s, dh = ih * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/* -------------------------------------------------------------- text */

function fitLines(ctx, text, maxWidth, maxLines, startSize, minSize, weight, family) {
  for (let size = startSize; size >= minSize; size -= 1) {
    ctx.font = `${weight} ${size}px ${family}`;
    const lines = wrap(ctx, text, maxWidth);
    if (lines.length <= maxLines) return { size, lines };
  }
  ctx.font = `${weight} ${minSize}px ${family}`;
  const lines = wrap(ctx, text, maxWidth).slice(0, maxLines);
  const last = lines.length - 1;
  while (lines[last] && ctx.measureText(lines[last] + "…").width > maxWidth) lines[last] = lines[last].slice(0, -1);
  if (lines.length) lines[last] += "…";
  return { size: minSize, lines };
}

function wrap(ctx, text, maxWidth) {
  // words for spaced scripts, characters for CJK
  const tokens = String(text).match(/[⺀-鿿가-힯　-〿＀-￯]|[^\s⺀-鿿가-힯　-〿＀-￯]+|\s+/g) || [];
  const lines = [];
  let line = "";
  for (const t of tokens) {
    const next = line + t;
    if (line && ctx.measureText(next.trimEnd()).width > maxWidth && !/^\s+$/.test(t)) {
      lines.push(line.trim());
      line = t.trimStart();
    } else line = next;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

function arcText(ctx, text, cx, cy, radius, centerAngle, { inside = false, spacing = 0 } = {}) {
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width + spacing);
  const total = widths.reduce((a, b) => a + b, 0);
  const span = total / radius;
  let a = centerAngle + (inside ? span / 2 : -span / 2);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  chars.forEach((ch, i) => {
    const w = widths[i] / radius;
    a += inside ? -w / 2 : w / 2;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    ctx.rotate(a + (inside ? -Math.PI / 2 : Math.PI / 2));
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    a += inside ? -w / 2 : w / 2;
  });
}

/* ------------------------------------------------------------- record */

/**
 * Draw the full record (vinyl + label) into a square canvas.
 * Geometry in "record units": radius 150, label 50, grooves 64–145.
 */
export function renderRecord(record, { size = 1024, image = null, palette = null } = {}) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d");
  const R = size / 2;
  const k = R / 150;
  const pal = palette || record.palette || fallbackPalette(record);
  const seed = hashString(record.id || record.title || "");
  const rand = mulberry(seed);

  ctx.translate(R, R);

  // ---- vinyl body
  const vinyl = record.vinyl || "#111113";
  const vrgb = parseHex(vinyl);
  const coloured = luminance(vrgb) > 0.12;
  ctx.beginPath();
  ctx.arc(0, 0, R - 0.5, 0, Math.PI * 2);
  const body = ctx.createRadialGradient(0, 0, 40 * k, 0, 0, R);
  body.addColorStop(0, shade(vrgb, 0.06));
  body.addColorStop(1, shade(vrgb, -0.04));
  ctx.fillStyle = body;
  ctx.fill();

  // ---- grooves (density follows the song's loudness when known)
  const env = Array.isArray(record.envelope) && record.envelope.length > 4 ? record.envelope : null;
  const outer = 145 * k, inner = 64 * k;
  const step = Math.max(0.75, size / 1100);
  ctx.lineWidth = Math.max(0.5, step * 0.55);
  for (let r = outer; r > inner; r -= step) {
    const t = (outer - r) / (outer - inner); // 0 at the start of the song
    const loud = env ? env[Math.min(env.length - 1, Math.floor(t * env.length))] : 0.55 + 0.25 * Math.sin(t * 19 + seed % 7) * Math.sin(t * 5.3);
    const jitter = rand();
    const light = 0.018 + loud * 0.05 + jitter * 0.03;
    ctx.strokeStyle = coloured ? `rgba(0,0,0,${0.06 + jitter * 0.08})` : `rgba(255,255,255,${light})`;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    if (rand() < 0.5) {
      ctx.strokeStyle = `rgba(0,0,0,${0.18 + rand() * 0.2})`;
      ctx.beginPath();
      ctx.arc(0, 0, r - step / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // quiet gaps where the loudness collapses read as faint band edges
  if (env) {
    for (let i = 1; i < env.length - 1; i++) {
      if (env[i] < 0.12 && env[i - 1] >= 0.12) {
        const r = outer - (i / env.length) * (outer - inner);
        ctx.strokeStyle = coloured ? "rgba(0,0,0,.25)" : "rgba(0,0,0,.55)";
        ctx.lineWidth = 2.2 * k;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,.06)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, r - 1.6 * k, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }

  // ---- lead-in and run-out (smooth, glossy)
  ring(ctx, 145 * k, 150 * k, coloured ? shade(vrgb, 0.05) : "#18181b");
  ring(ctx, 50 * k, 63 * k, coloured ? shade(vrgb, 0.04) : "#141417");
  ctx.lineWidth = Math.max(1, 0.6 * k);
  for (const rr of [59, 61.5]) {
    ctx.strokeStyle = coloured ? "rgba(0,0,0,.2)" : "rgba(255,255,255,.07)";
    ctx.beginPath(); ctx.arc(0, 0, rr * k, 0, Math.PI * 2); ctx.stroke();
  }
  // bevelled edge
  ctx.lineWidth = 1.6 * k;
  ctx.strokeStyle = "rgba(255,255,255,.10)";
  ctx.beginPath(); ctx.arc(0, 0, 149 * k, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(0,0,0,.6)";
  ctx.beginPath(); ctx.arc(0, 0, R - 0.6, 0, Math.PI * 2); ctx.stroke();

  // ---- label
  drawLabel(ctx, record, image, 50 * k, pal);

  // ---- spindle hole
  ctx.beginPath();
  ctx.arc(0, 0, 4.2 * k, 0, Math.PI * 2);
  ctx.fillStyle = "#0a0a0a";
  ctx.fill();
  ctx.lineWidth = 0.8 * k;
  ctx.strokeStyle = "rgba(255,255,255,.25)";
  ctx.stroke();

  return canvas;
}

function ring(ctx, r0, r1, color) {
  ctx.beginPath();
  ctx.arc(0, 0, r1, 0, Math.PI * 2);
  ctx.arc(0, 0, r0, 0, Math.PI * 2, true);
  ctx.fillStyle = color;
  ctx.fill();
}

function shade([r, g, b], amount) {
  const t = amount < 0 ? 0 : 255;
  const p = Math.abs(amount);
  return hex(r + (t - r) * p, g + (t - g) * p, b + (t - b) * p);
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Draw the paper label centred at the current origin. */
export function drawLabel(ctx, record, image, r, pal) {
  const title = record.title || "Untitled";
  const artist = record.artist || "";
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = pal.base;
  ctx.fillRect(-r, -r, r * 2, r * 2);

  if (image) {
    drawCover(ctx, image, -r, -r, r * 2, r * 2);
    // printed rim band carrying the title
    const band = r * 0.2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.arc(0, 0, r - band, 0, Math.PI * 2, true);
    ctx.fillStyle = withAlpha(pal.base, 0.9);
    ctx.fill();
    ctx.fillStyle = pal.ink;
    const fs = band * 0.5;
    ctx.font = `600 ${fs}px ${FONT}`;
    const bottom = trimToArc(ctx, [title, artist].filter(Boolean).join("  ·  "), (r - band / 2) * Math.PI * 0.9);
    arcText(ctx, bottom, 0, 0, r - band / 2, Math.PI / 2, { inside: true, spacing: fs * 0.08 });
    ctx.font = `700 ${fs * 0.85}px ${FONT}`;
    arcText(ctx, "33⅓  ·  SIDE A", 0, 0, r - band / 2, -Math.PI / 2, { spacing: fs * 0.12 });
  } else {
    // typographic label
    ctx.strokeStyle = withAlpha(pal.ink, 0.22);
    ctx.lineWidth = Math.max(1, r * 0.012);
    for (const f of [0.93, 0.9]) { ctx.beginPath(); ctx.arc(0, 0, r * f, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = pal.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const fitted = fitLines(ctx, title, r * 1.3, 2, Math.round(r * 0.24), Math.round(r * 0.12), 700, FONT);
    const lh = fitted.size * 1.12;
    const top = -r * 0.24 - (fitted.lines.length - 1) * lh;
    ctx.font = `700 ${fitted.size}px ${FONT}`;
    fitted.lines.forEach((line, i) => ctx.fillText(line, 0, top + i * lh));
    if (artist) {
      const a = fitLines(ctx, artist, r * 1.25, 1, Math.round(r * 0.13), Math.round(r * 0.08), 500, SERIF);
      ctx.font = `500 ${a.size}px ${SERIF}`;
      ctx.globalAlpha = 0.85;
      ctx.fillText(a.lines[0] || "", 0, r * 0.4);
      ctx.globalAlpha = 1;
    }
    ctx.font = `700 ${r * 0.085}px ${FONT}`;
    ctx.globalAlpha = 0.7;
    ctx.textAlign = "left";
    ctx.fillText("33⅓", -r * 0.66, r * 0.07);
    ctx.textAlign = "right";
    ctx.fillText("SIDE A", r * 0.66, r * 0.07);
    ctx.globalAlpha = 0.55;
    ctx.font = `600 ${r * 0.07}px ${FONT}`;
    arcText(ctx, (record.album || "STEREO · LONG PLAYING").toUpperCase(), 0, 0, r * 0.82, Math.PI / 2, { inside: true, spacing: r * 0.015 });
    ctx.globalAlpha = 1;
  }

  // paper sheen + pressed edge
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r);
  g.addColorStop(0, "rgba(255,255,255,.12)");
  g.addColorStop(1, "rgba(0,0,0,.12)");
  ctx.fillStyle = g;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
  ctx.lineWidth = Math.max(1, r * 0.03);
  ctx.strokeStyle = "rgba(0,0,0,.35)";
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
}

function trimToArc(ctx, text, maxLen) {
  let t = text;
  while (t.length > 1 && ctx.measureText(t).width * 1.1 > maxLen) t = t.slice(0, -1);
  return t === text ? t : t.trimEnd() + "…";
}

function withAlpha(color, a) {
  const [r, g, b] = parseHex(color);
  return `rgba(${r},${g},${b},${a})`;
}

/* -------------------------------------------------------------- sleeve */

/** Square album sleeve: the cover art (aged a little) or a generated design. */
export function renderSleeve(record, { size = 512, image = null, palette = null } = {}) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d");
  const pal = palette || record.palette || fallbackPalette(record);
  const rand = mulberry(hashString(record.id || record.title || ""));

  if (image) {
    drawCover(ctx, image, 0, 0, size, size);
  } else {
    ctx.fillStyle = pal.base;
    ctx.fillRect(0, 0, size, size);
    const motif = hashString(record.title || "") % 3;
    ctx.save();
    ctx.globalAlpha = 0.9;
    if (motif === 0) {
      // sun / moon
      ctx.fillStyle = withAlpha(pal.ink, 0.16);
      ctx.beginPath(); ctx.arc(size * 0.68, size * 0.36, size * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = withAlpha(pal.ink, 0.1);
      for (let i = 0; i < 4; i++) ctx.fillRect(0, size * (0.62 + i * 0.05), size, size * 0.018);
    } else if (motif === 1) {
      // ripples
      ctx.strokeStyle = withAlpha(pal.ink, 0.16);
      ctx.lineWidth = size * 0.012;
      for (let i = 1; i < 9; i++) { ctx.beginPath(); ctx.arc(size * 0.3, size * 0.35, i * size * 0.07, 0, Math.PI * 2); ctx.stroke(); }
    } else {
      // stripes
      ctx.fillStyle = withAlpha(pal.ink, 0.12);
      for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.translate(size * 0.5, size * 0.4);
        ctx.rotate(-0.5);
        ctx.fillRect(-size, -size * 0.3 + i * size * 0.1, size * 2, size * 0.04);
        ctx.restore();
      }
    }
    ctx.restore();
    ctx.fillStyle = pal.ink;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const t = fitLines(ctx, record.title || "Untitled", size * 0.8, 3, Math.round(size * 0.12), Math.round(size * 0.06), 700, FONT);
    ctx.font = `700 ${t.size}px ${FONT}`;
    const lh = t.size * 1.1;
    const y0 = size * 0.9 - (record.artist ? size * 0.08 : 0) - (t.lines.length - 1) * lh;
    t.lines.forEach((l, i) => ctx.fillText(l, size * 0.08, y0 + i * lh));
    if (record.artist) {
      ctx.globalAlpha = 0.8;
      ctx.font = `500 ${size * 0.05}px ${SERIF}`;
      ctx.fillText(record.artist, size * 0.08, size * 0.9);
      ctx.globalAlpha = 1;
    }
  }

  // ring wear where the record presses through the card
  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  ctx.strokeStyle = "rgba(255,255,255,.35)";
  ctx.lineWidth = size * 0.012;
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size * 0.46, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  // paper grain
  ctx.save();
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < size * 2; i++) {
    ctx.fillStyle = rand() > 0.5 ? "#fff" : "#000";
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 1.5, 1 + rand() * 1.5);
  }
  ctx.restore();
  // soft edge
  const v = ctx.createRadialGradient(size / 2, size / 2, size * 0.45, size / 2, size / 2, size * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(40,25,10,.18)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}
