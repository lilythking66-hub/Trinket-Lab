// Procedural 2.5D skin for the typewriter. The machine is modelled in
// "machine units" (x → right, y → towards the typist, z → up) and drawn with
// an orthographic camera computed in JS: flat faces become 2D affine CSS
// matrices, cylinders become SVG silhouettes. No CSS 3D, so layering is
// plain DOM order and hit-testing is exact. Colours come from CSS custom
// properties; geometry never depends on the theme.

export const CAMERA = { tilt: 57, turn: -15 };

const rad = (d) => (d * Math.PI) / 180;
const f = (n) => (Math.round(n * 100) / 100).toString();
const f4 = (n) => (Math.round(n * 10000) / 10000).toString();
export const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* -------------------------------------------------------------- geometry */

export const BODY = {
  xc: 170,
  base: { x0: 4, x1: 336, y0: 24, y1: 254, z: 13 },
  wall: { xL: 12, xR: 328, t: 8, rim: 4 },
  deck: { x0: 20, x1: 320, yF: 252, zF: 26, yB: 134, zB: 60 },
  hood: { yF: 112, yB: 30, z: 90 },
  foot: { r: 9, h: 6 },
};
const D = BODY.deck;
export const zDeck = (y) => D.zF + ((D.yF - y) / (D.yF - D.yB)) * (D.zB - D.zF);
/** Top edge of the side frames (y, z), front → back. */
export const WALL_PROFILE = [[252, 30], [D.yB, D.zB + 4], [BODY.hood.yF, BODY.hood.z + 4], [30, BODY.hood.z + 4], [26, 62]];

export const PLATEN = { y: 68, z: 112, r: 16, overhang: 25 };
const LEAN = rad(15);
/** Up the sheet (paper leans back on the paper table) and the paper's front normal. */
export const UP = [0, -Math.sin(LEAN), Math.cos(LEAN)];
export const NORMAL = [0, Math.cos(LEAN), Math.sin(LEAN)];
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
/** Where the paper leaves the front of the platen. */
export const PAPER_BASE = [BODY.xc, PLATEN.y + PLATEN.r * Math.cos(rad(55)), PLATEN.z + PLATEN.r * Math.sin(rad(55))];
/** The print point: baseline of the line being typed. */
export const PRINT = add(PAPER_BASE, UP, 12);

export const KEYS = { rows: [150, 172, 194, 216], space: 238, pitch: 22, r: 8.6, stem: 11, travel: 5 };
export const SPOOLS = [{ x: 62, y: 95 }, { x: 278, y: 95 }];
export const SPOOL = { r: 17, z0: BODY.hood.z, z1: BODY.hood.z + 8 };
/** Typebar basket on the hood front. */
export const FAN = { cx: 150, cy: 1, rOut: 30, rIn: 10 };
const HOOD_FRONT = (() => {
  const dy = D.yB - BODY.hood.yF, dz = D.zB - BODY.hood.z;
  const len = Math.hypot(dy, dz);
  return { o: [D.x0, BODY.hood.yF, BODY.hood.z], u: [1, 0, 0], v: [0, dy / len, dz / len], w: D.x1 - D.x0, h: len };
})();
export { HOOD_FRONT };
export const fanPoint = (lx, ly) => add(add(HOOD_FRONT.o, HOOD_FRONT.u, lx), HOOD_FRONT.v, ly);

/** Paper grid in sheet units. */
export function sheetGeometry({ columns = 30, rows = 12 } = {}) {
  const cw = 6.6, lh = 14, fs = 11.4;
  const mL = 18, mR = 18, mT = 24, mB = 22;
  return {
    cw, lh, fs, mL, mR, mT, mB, columns, rows,
    w: mL + mR + columns * cw,
    h: mT + mB + rows * lh,
    baseline: (line) => mT + line * lh + lh * 0.74,
    cellX: (col) => mL + col * cw,
  };
}

/** Carriage reference frame: at dx = 0 the sheet is centred on the machine. */
export function carriageGeometry(sheet) {
  const half = sheet.w / 2 + PLATEN.overhang;
  return { x0: BODY.xc - half, x1: BODY.xc + half, sheetLeft: BODY.xc - sheet.w / 2 };
}
/** Carriage offset that puts the next cell (column col) under the print point. */
export const carriageOffset = (sheet, col, w = 1) => sheet.w / 2 - (sheet.mL + (col + w / 2) * sheet.cw);

/** Key positions: [{ key, x, y, z (cap top), row }]. */
export function keyPositions(layout) {
  const out = [];
  layout.rows.forEach((row, r) => {
    const y = KEYS.rows[r] ?? KEYS.rows[KEYS.rows.length - 1] + (r - KEYS.rows.length + 1) * 22;
    const n = row.length;
    const off = (layout.offsets?.[r] ?? 0) * KEYS.pitch;
    const start = BODY.xc - ((n - 1) * KEYS.pitch) / 2 + off - 4;
    row.forEach((key, i) => out.push({ key, row: r, x: start + i * KEYS.pitch, y, z: zDeck(y) + KEYS.stem }));
  });
  return out;
}

/* ----------------------------------------------------------------- camera */

export function createProjector(camera = CAMERA) {
  const a = rad(camera.tilt), b = rad(camera.turn);
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  const origin = { x: 0, y: 0 };
  const proj = (x, y, z = 0) => ({ x: origin.x + x * cb - y * sb, y: origin.y + (x * sb + y * cb) * ca - z * sa });
  const p3 = (p) => proj(p[0], p[1], p[2]);
  /** larger = closer to the viewer */
  const depth = (x, y, z = 0) => (x * sb + y * cb) * sa + z * ca;
  /** CSS matrix mapping local (1,0)→u, (0,1)→v, (0,0)→o (all 3D). */
  function plane(o, u, v) {
    const p0 = proj(o[0], o[1], o[2]);
    const pu = proj(o[0] + u[0], o[1] + u[1], o[2] + u[2]);
    const pv = proj(o[0] + v[0], o[1] + v[1], o[2] + v[2]);
    return `matrix(${f4(pu.x - p0.x)},${f4(pu.y - p0.y)},${f4(pv.x - p0.x)},${f4(pv.y - p0.y)},${f4(p0.x)},${f4(p0.y)})`;
  }
  const flat = (x, y, z = 0) => plane([x, y, z], [1, 0, 0], [0, 1, 0]);
  /** Is a face with this outward normal turned towards the camera? */
  const facing = (n) => n[0] * sb * sa + n[1] * cb * sa + n[2] * ca > 1e-6;
  /** Screen offset of a pure x translation (the carriage). */
  const shiftX = (dx) => ({ x: dx * cb, y: dx * sb * ca });
  return { proj, p3, depth, plane, flat, facing, shiftX, origin, sinTilt: sa, cosTilt: ca };
}

/* -------------------------------------------------------------- cylinders */

let gid = 0;
const uid = (p) => `${p}${++gid}`;
const stopsXml = (stops) => stops.map(([o, c]) => `<stop offset="${o}" style="stop-color:${c}"/>`).join("");

/** Vertical cylinder (keys, spools, feet) as a positioned SVG. Side gradient left → right. */
export function vCylinder(P, { cx, cy, r, z0, z1, side, top = null, topStroke = null, cls = "", extra = "" }) {
  const T = P.proj(cx, cy, z1), B = P.proj(cx, cy, z0);
  const ry = r * P.cosTilt, pad = 2;
  const minX = T.x - r - pad, maxX = T.x + r + pad, minY = T.y - ry - pad, maxY = B.y + ry + pad;
  const id = uid("tvc");
  const d = `M${f(T.x - r)} ${f(T.y)} L${f(B.x - r)} ${f(B.y)} A${f(r)} ${f(ry)} 0 0 0 ${f(B.x + r)} ${f(B.y)} L${f(T.x + r)} ${f(T.y)} A${f(r)} ${f(ry)} 0 0 1 ${f(T.x - r)} ${f(T.y)} Z`;
  const grad = `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(T.x - r)}" x2="${f(T.x + r)}" y1="0" y2="0">${stopsXml(side)}</linearGradient>`;
  const topEl = top ? `<ellipse cx="${f(T.x)}" cy="${f(T.y)}" rx="${f(r)}" ry="${f(ry)}" style="fill:${top}${topStroke ? ";stroke:" + topStroke + ";stroke-width:.8" : ""}"/>` : "";
  return `<svg class="tw-abs ${cls}" style="left:${f(minX)}px;top:${f(minY)}px;width:${f(maxX - minX)}px;height:${f(maxY - minY)}px" viewBox="${f(minX)} ${f(minY)} ${f(maxX - minX)} ${f(maxY - minY)}" aria-hidden="true"><defs>${grad}</defs><path d="${d}" fill="url(#${id})"/>${topEl}${extra}</svg>`;
}

/**
 * Horizontal cylinder along x (platen, knobs, bail, space bar) as SVG
 * fragments in scene coordinates. side: gradient stops top → bottom of the
 * silhouette. Returns { defs, body }.
 */
export function hCylinder(P, { x0, x1, y, z, r, side, cap = null, capStroke = null, knurl = 0, knurlColor = "rgba(0,0,0,.35)", opacity = 1 }) {
  const E0 = P.proj(x0, y, z), E1 = P.proj(x1, y, z);
  let ax = E1.x - E0.x, ay = E1.y - E0.y;
  const al = Math.hypot(ax, ay) || 1;
  ax /= al; ay /= al;
  let nx = -ay, ny = ax;
  if (ny > 0) { nx = -nx; ny = -ny; } // n points up the screen
  const ring = [];
  let h = 0;
  for (let i = 0; i < 40; i++) {
    const t = (i / 40) * Math.PI * 2;
    const p = P.proj(x0, y + r * Math.cos(t), z + r * Math.sin(t));
    ring.push(p);
    h = Math.max(h, (p.x - E0.x) * nx + (p.y - E0.y) * ny);
  }
  const q = [[E0.x + nx * h, E0.y + ny * h], [E1.x + nx * h, E1.y + ny * h], [E1.x - nx * h, E1.y - ny * h], [E0.x - nx * h, E0.y - ny * h]];
  const id = uid("thc");
  const defs = `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(E0.x + nx * h)}" y1="${f(E0.y + ny * h)}" x2="${f(E0.x - nx * h)}" y2="${f(E0.y - ny * h)}">${stopsXml(side)}</linearGradient>`;
  let body = `<path d="M${q.map((p) => f(p[0]) + " " + f(p[1])).join(" L")} Z" fill="url(#${id})"${opacity < 1 ? ` opacity="${opacity}"` : ""}/>`;
  if (knurl > 0) {
    const lines = [];
    for (let i = 1; i < knurl; i++) {
      const s = -h + (2 * h * i) / knurl;
      lines.push(`M${f(E0.x + nx * s)} ${f(E0.y + ny * s)} L${f(E1.x + nx * s)} ${f(E1.y + ny * s)}`);
    }
    body += `<path d="${lines.join(" ")}" stroke="${knurlColor}" stroke-width=".7" fill="none"/>`;
  }
  if (cap) {
    const ends = [];
    if (P.facing([-1, 0, 0])) ends.push([0, 0]);
    if (P.facing([1, 0, 0])) ends.push([E1.x - E0.x, E1.y - E0.y]);
    for (const [ox, oy] of ends) {
      body += `<path d="M${ring.map((p) => f(p.x + ox) + " " + f(p.y + oy)).join(" L")} Z" style="fill:${cap}${capStroke ? ";stroke:" + capStroke + ";stroke-width:.7" : ""}"/>`;
    }
  }
  return { defs, body };
}

export const CHROME = [[0, "var(--_metal-dark)"], [0.18, "var(--_metal-hi)"], [0.32, "#fff"], [0.46, "var(--_metal)"], [0.75, "var(--_metal-mid)"], [0.9, "var(--_metal-hi)"], [1, "var(--_metal-dark)"]];
export const CHROME_V = [[0, "var(--_metal-dark)"], [0.15, "var(--_metal)"], [0.32, "var(--_metal-hi)"], [0.45, "var(--_metal)"], [0.7, "var(--_metal-mid)"], [0.88, "var(--_metal-hi)"], [1, "var(--_metal-dark)"]];
export const RUBBER = [[0, "#3a3633"], [0.12, "#5b5651"], [0.3, "#2a2725"], [0.7, "#141312"], [1, "#0a0a09"]];
export const LACQUER_V = [[0, "var(--_body-dark)"], [0.25, "var(--_body-hi)"], [0.4, "var(--_body)"], [0.8, "var(--_body-dark)"], [1, "var(--_body-deep)"]];
export const BLACK_V = [[0, "#0c0b0a"], [0.28, "#3d3a36"], [0.42, "#1d1b19"], [1, "#080807"]];

/* ---------------------------------------------------------- flat artwork */

/** Deck between the side frames: lacquer, pinstripe and the key slots. */
export function deckSvg(keys) {
  const w = D.x1 - D.x0;
  const len = Math.hypot(D.yF - D.yB, D.zF - D.zB);
  const along = (y) => ((y - D.yB) / (D.yF - D.yB)) * len;
  const slots = keys.map((k) => `<rect x="${f(k.x - D.x0 - 2.4)}" y="${f(along(k.y) - 2.2)}" width="4.8" height="4.4" rx="1.4"/>`).join("");
  return `<svg class="tw-fill" viewBox="0 0 ${f(w)} ${f(len)}" preserveAspectRatio="none" aria-hidden="true">
  <g fill="#050404" opacity=".75">${slots}</g>
  <rect x="5" y="4" width="${f(w - 10)}" height="${f(len - 8)}" rx="3" fill="none" style="stroke:var(--_trim)" stroke-width=".8" opacity=".75"/>
  <rect x="8" y="7" width="${f(w - 16)}" height="${f(len - 14)}" rx="2" fill="none" style="stroke:var(--_trim)" stroke-width=".35" opacity=".55"/>
</svg>`;
}

/** Hood top: where the ribbon spools sit. */
export function hoodTopSvg() {
  const w = D.x1 - D.x0, h = BODY.hood.yF - BODY.hood.yB;
  return `<svg class="tw-fill" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
  <rect x="4" y="${h - 12}" width="${w - 8}" height="7" rx="2" fill="none" style="stroke:var(--_trim)" stroke-width=".6" opacity=".6"/>
  <path d="M6 ${h - 2.5} H${w - 6}" style="stroke:var(--_trim)" stroke-width=".5" opacity=".5"/>
</svg>`;
}

/** Hood front: the segment and the fan of resting typebars. */
export function fanSvg(nBars) {
  const { w, h } = HOOD_FRONT;
  const { cx, cy, rOut, rIn } = FAN;
  const arc = (r) => `M${f(cx - r)} ${f(cy)} A${r} ${r} 0 0 0 ${f(cx + r)} ${f(cy)}`;
  const bars = [];
  for (let i = 0; i < nBars; i++) {
    const t = barAngle(i, nBars);
    const c = Math.cos(t), s = Math.sin(t);
    bars.push(`<g data-bar="${i}"><line x1="${f(cx + c * (rOut - 3))}" y1="${f(cy + s * (rOut - 3))}" x2="${f(cx + c * rIn)}" y2="${f(cy + s * rIn)}" stroke="url(#twBar)" stroke-width="1.5" stroke-linecap="round"/>` +
      `<line x1="${f(cx + c * (rOut - 3))}" y1="${f(cy + s * (rOut - 3))}" x2="${f(cx + c * rIn)}" y2="${f(cy + s * rIn)}" stroke="#000" stroke-opacity=".35" stroke-width=".5" transform="translate(.5 .7)"/></g>`);
  }
  return `<svg class="tw-fill" viewBox="0 0 ${f(w)} ${f(h)}" preserveAspectRatio="none" aria-hidden="true">
  <defs>
    <radialGradient id="twWell" cx="${f(cx / w)}" cy="0" r=".18" gradientTransform="scale(1 ${f(w / h)})">
      <stop offset="0" stop-color="#2a2622"/><stop offset=".7" stop-color="#0d0c0b"/><stop offset="1" stop-color="#050404"/>
    </radialGradient>
    <linearGradient id="twBar" x1="0" x2="1" y1="0" y2="1"><stop offset="0" style="stop-color:var(--_metal-hi)"/><stop offset=".5" style="stop-color:var(--_metal)"/><stop offset="1" style="stop-color:var(--_metal-dark)"/></linearGradient>
  </defs>
  <path d="${arc(rOut + 5)} Z" fill="url(#twWell)"/>
  <path d="${arc(rOut + 5)}" fill="none" style="stroke:var(--_trim)" stroke-width=".9"/>
  <path d="${arc(rOut + 1)}" fill="none" style="stroke:var(--_metal-mid)" stroke-width="3"/>
  <path d="${arc(rOut + 1)}" fill="none" style="stroke:var(--_metal-hi)" stroke-width=".8" transform="translate(0 -.8)"/>
  <g data-segment>${bars.join("")}
    <path d="${arc(rIn - 2)}" fill="none" stroke="#0a0908" stroke-width="3"/>
  </g>
  <path d="M10 ${f(h - 3)} H${f(w - 10)}" style="stroke:var(--_trim)" stroke-width=".6" opacity=".7"/>
</svg>`;
}

/** Angle of typebar i in the basket (left keys on the left). */
export function barAngle(i, n) {
  const a0 = rad(172), a1 = rad(8);
  return n <= 1 ? Math.PI / 2 : a0 + ((a1 - a0) * i) / (n - 1);
}

/** Brand plate on the front apron. */
export function apronSvg(label, w, h) {
  return `<svg class="tw-fill" viewBox="0 0 ${f(w)} ${f(h)}" aria-hidden="true">
  <path d="M6 2.4 H${f(w - 6)}" style="stroke:var(--_trim)" stroke-width=".6" opacity=".8"/>
  <path d="M6 ${f(h - 2.6)} H${f(w - 6)}" style="stroke:var(--_trim)" stroke-width=".5" opacity=".6"/>
  ${label ? `<text x="${f(w / 2)}" y="${f(h * 0.72)}" text-anchor="middle" font-family="Didot, 'Bodoni 72', 'Playfair Display', Georgia, 'Times New Roman', serif" font-style="italic" font-size="${f(h * 0.62)}" letter-spacing=".6" style="fill:var(--_trim)">${esc(label)}</text>` : ""}
</svg>`;
}

/** The decorated brass cap on a ribbon spool. */
export function spoolCapSvg() {
  const spokes = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return `<path d="M50 50 L${f(50 + Math.cos(a) * 38)} ${f(50 + Math.sin(a) * 38)}"/>`;
  }).join("");
  return `<svg class="tw-fill" viewBox="0 0 100 100" aria-hidden="true">
  <defs><radialGradient id="twBrass" cx=".38" cy=".34" r=".8"><stop offset="0" stop-color="#fff3cf"/><stop offset=".35" style="stop-color:var(--_trim)"/><stop offset="1" style="stop-color:var(--_trim-dark)"/></radialGradient></defs>
  <circle cx="50" cy="50" r="48" fill="#0b0a09"/>
  <circle cx="50" cy="50" r="40" fill="url(#twBrass)"/>
  <g style="stroke:var(--_trim-dark)" stroke-width="3" stroke-linecap="round">${spokes}</g>
  <circle cx="50" cy="50" r="28" fill="none" style="stroke:var(--_trim-dark)" stroke-width="2"/>
  <circle cx="50" cy="50" r="12" fill="url(#twBrass)" style="stroke:var(--_trim-dark)" stroke-width="2"/>
  <circle cx="50" cy="50" r="4" fill="#1b1612"/>
  <circle cx="50" cy="50" r="46" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="2"/>
</svg>`;
}

/** Scale on the paper bail: a tick per column, numbers every ten. */
export function scaleSvg(columns, cw) {
  const w = columns * cw;
  const ticks = [];
  for (let i = 0; i <= columns; i++) {
    const x = i * cw;
    const big = i % 10 === 0, mid = i % 5 === 0;
    ticks.push(`<path d="M${f(x)} 0 V${big ? 3.4 : mid ? 2.4 : 1.4}"/>`);
    if (big && i > 0 && i < columns) ticks.push(`<text x="${f(x)}" y="5.6" text-anchor="middle">${i}</text>`);
  }
  return `<svg class="tw-fill" viewBox="-2 0 ${f(w + 4)} 6" preserveAspectRatio="none" aria-hidden="true">
  <g stroke="#2b2724" stroke-width=".35" font-size="2.3" font-family="ui-monospace, Menlo, monospace" fill="#2b2724">${ticks.join("")}</g>
</svg>`;
}

/* ---------------------------------------------------------- dynamic art */

/** Carriage-return lever in scene space (moves with the carriage wrapper). */
export function leverSvgInner(P, carriage, angle = 0) {
  const pv = [carriage.x0 - 6, PLATEN.y + 12, PLATEN.z + 10];
  const a = rad(angle), c = Math.cos(a), s = Math.sin(a);
  const rot = ([x, y, z]) => [pv[0] + x * c - y * s, pv[1] + x * s + y * c, pv[2] + z];
  const pts = [[0, 0, 0], [-8, 4, 6], [-24, 12, 13], [-42, 22, 16], [-50, 27, 15]].map(rot).map((p) => P.p3(p));
  const d = "M" + pts.map((p) => f(p.x) + " " + f(p.y)).join(" L");
  const end = pts[pts.length - 1];
  const paddle = P.p3(rot([-55, 31, 14]));
  return `<path d="${d}" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="5.4" stroke-linecap="round" stroke-linejoin="round" transform="translate(.6 1.4)"/>
  <path d="${d}" fill="none" style="stroke:var(--_metal-mid)" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${d}" fill="none" style="stroke:var(--_metal-hi)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" transform="translate(-.3 -.8)"/>
  <ellipse cx="${f((end.x + paddle.x) / 2)}" cy="${f((end.y + paddle.y) / 2)}" rx="9" ry="${f(9 * P.cosTilt + 1)}" style="fill:var(--_metal)" stroke="rgba(0,0,0,.4)" stroke-width=".6"/>
  <ellipse cx="${f((end.x + paddle.x) / 2 - 1.6)}" cy="${f((end.y + paddle.y) / 2 - 1.3)}" rx="5.2" ry="${f(4.6 * P.cosTilt)}" style="fill:var(--_metal-hi)" opacity=".9"/>`;
}

/** Ribbon: a band across the front of the platen between the spool guides; the vibrator lifts its middle on each strike (lift 0–1). */
export function ribbonSvgInner(P, lift = 0) {
  const y = PRINT[1] + 2.6;
  const z0 = PRINT[2] - 9.5;
  const zl = z0 + lift * 7;
  const H = 5;
  const xL = SPOOLS[0].x + 4, xR = SPOOLS[1].x - 4, xc = BODY.xc;
  const xs = [xL, xc - 34, xc - 14, xc + 14, xc + 34, xR];
  const zs = [z0, z0, zl, zl, z0, z0];
  const band = (a, b) => {
    const top = xs.map((x, i) => P.proj(x, y, zs[i] + b));
    const bot = xs.map((x, i) => P.proj(x, y, zs[i] + a)).reverse();
    return "M" + [...top, ...bot].map((p) => f(p.x) + " " + f(p.y)).join(" L") + " Z";
  };
  const parts = [];
  // guide posts from the spools up to the band
  for (const sp of SPOOLS) {
    const x = sp.x + (sp.x < xc ? 4 : -4);
    const a = P.proj(x, y, SPOOL.z1), c = P.proj(x, y, z0 + H + 1.5);
    parts.push(`<path d="M${f(a.x)} ${f(a.y)} L${f(c.x)} ${f(c.y)}" style="stroke:var(--_metal-mid)" stroke-width="2.4" stroke-linecap="round"/><path d="M${f(a.x - .5)} ${f(a.y)} L${f(c.x - .5)} ${f(c.y)}" style="stroke:var(--_metal-hi)" stroke-width=".7"/>`);
  }
  parts.push(`<path d="${band(0, H / 2)}" style="fill:var(--_ribbon)"/><path d="${band(H / 2, H)}" fill="#141211"/>`);
  parts.push(`<path d="${band(H - .6, H)}" fill="#fff" opacity=".12"/>`);
  // the vibrator fork holding the middle of the band
  const half = 11;
  const a = P.proj(xc - half, y + 0.8, zl - 1.2), b = P.proj(xc + half, y + 0.8, zl - 1.2);
  const a2 = P.proj(xc - half, y + 0.8, zl + H + 0.8), b2 = P.proj(xc + half, y + 0.8, zl + H + 0.8);
  const stem = P.proj(xc, y + 1.4, z0 - 10);
  parts.push(`<path d="M${f(stem.x)} ${f(stem.y)} L${f((a.x + b.x) / 2)} ${f((a.y + b.y) / 2)}" style="stroke:var(--_metal-mid)" stroke-width="1.8"/>`);
  parts.push(`<path d="M${f(a2.x)} ${f(a2.y)} L${f(a.x)} ${f(a.y)} L${f(b.x)} ${f(b.y)} L${f(b2.x)} ${f(b2.y)}" fill="none" style="stroke:var(--_metal-hi)" stroke-width="1.2" stroke-linejoin="round"/>`);
  return parts.join("");
}

/** Card holder framing the print point (fixed to the body). */
export function cardHolderSvgInner(P, cw) {
  const y = PRINT[1] + 3.2;
  const zb = PRINT[2] - 4.2;
  const half = cw * 0.62;
  const pts = (side) => {
    const x = BODY.xc + side * half;
    return [P.proj(x + side * 7, y, zb - 1.5), P.proj(x + side * 1, y, zb - 1.5), P.proj(x, y, zb + 4.4), P.proj(x + side * 1.6, y, zb + 4.4), P.proj(x + side * 7, y, zb + 1.2)];
  };
  const path = (q) => "M" + q.map((p) => f(p.x) + " " + f(p.y)).join(" L") + " Z";
  return [-1, 1].map((s) => `<path d="${path(pts(s))}" style="fill:var(--_metal)" stroke="rgba(0,0,0,.35)" stroke-width=".4" fill-opacity=".92"/>`).join("") +
    `<path d="${path([P.proj(BODY.xc - half - 7, y, zb - 1.5), P.proj(BODY.xc + half + 7, y, zb - 1.5), P.proj(BODY.xc + half + 7, y, zb - 3.2), P.proj(BODY.xc - half - 7, y, zb - 3.2)])}" style="fill:var(--_metal-mid)"/>`;
}

/**
 * A typebar in flight. t: 0 (resting in the basket) → 1 (slug on the paper).
 * Drawn in scene space from the pivot on the segment to the type slug.
 */
export function typebarSvgInner(P, i, n, t) {
  const th = barAngle(i, n);
  const c = Math.cos(th), s = Math.sin(th);
  const pivot = fanPoint(FAN.cx + c * (FAN.rOut - 3), FAN.cy + s * (FAN.rOut - 3));
  const rest = fanPoint(FAN.cx + c * FAN.rIn, FAN.cy + s * FAN.rIn);
  const target = add(PRINT, NORMAL, 1.6);
  const d0 = [rest[0] - pivot[0], rest[1] - pivot[1], rest[2] - pivot[2]];
  const d1 = [target[0] - pivot[0], target[1] - pivot[1], target[2] - pivot[2]];
  const l0 = Math.hypot(...d0), l1 = Math.hypot(...d1);
  const e = t;
  // swing: interpolate direction, bulge towards the typist mid-flight
  const dir = [d0[0] / l0 * (1 - e) + d1[0] / l1 * e, d0[1] / l0 * (1 - e) + d1[1] / l1 * e, d0[2] / l0 * (1 - e) + d1[2] / l1 * e];
  const dl = Math.hypot(...dir);
  const len = l0 + (l1 - l0) * e;
  const bulge = Math.sin(Math.PI * e) * 10;
  const tip = [pivot[0] + (dir[0] / dl) * len, pivot[1] + (dir[1] / dl) * len + bulge * 0.55, pivot[2] + (dir[2] / dl) * len + bulge];
  const a = P.p3(pivot), b = P.p3(tip);
  const mid = P.p3([(pivot[0] + tip[0]) / 2, (pivot[1] + tip[1]) / 2 + bulge * 0.3, (pivot[2] + tip[2]) / 2 + bulge * 0.4]);
  const ang = Math.atan2(b.y - mid.y, b.x - mid.x) * 180 / Math.PI;
  return `<path d="M${f(a.x)} ${f(a.y)} Q${f(mid.x)} ${f(mid.y)} ${f(b.x)} ${f(b.y)}" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M${f(a.x)} ${f(a.y)} Q${f(mid.x)} ${f(mid.y)} ${f(b.x)} ${f(b.y)}" fill="none" style="stroke:var(--_metal)" stroke-width="1.7" stroke-linecap="round"/>
  <path d="M${f(a.x)} ${f(a.y)} Q${f(mid.x)} ${f(mid.y)} ${f(b.x)} ${f(b.y)}" fill="none" style="stroke:var(--_metal-hi)" stroke-width=".6" stroke-linecap="round" transform="translate(-.3 -.4)"/>
  <rect x="${f(b.x - 2.4)}" y="${f(b.y - 1.5)}" width="4.8" height="3" rx=".8" style="fill:var(--_metal-mid)" stroke="rgba(0,0,0,.4)" stroke-width=".4" transform="rotate(${f(ang + 90)} ${f(b.x)} ${f(b.y)})"/>`;
}

/* ------------------------------------------------------------- textures */

let noiseUrl = null;
/** Paper fibre noise (greyscale, multiplied over the paper colour). */
export function paperNoiseUrl() {
  if (noiseUrl || typeof document === "undefined") return noiseUrl;
  const n = 256;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(n, n);
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < n * n; i++) {
    const v = 235 + rnd() * 20;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = "rgba(120, 100, 70, .10)";
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 140; i++) {
    const x = rnd() * n, y = rnd() * n, a = rnd() * Math.PI, l = 3 + rnd() * 9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 1, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  noiseUrl = c.toDataURL("image/png");
  return noiseUrl;
}
