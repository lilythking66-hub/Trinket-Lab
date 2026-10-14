// Procedural 2.5D skin. The deck is modelled in "deck units" (see DECK in
// turntable-core.js) and drawn with an orthographic camera: every flat face
// becomes a 2D affine CSS matrix, every cylinder an SVG side + top. No 3D
// CSS, so layering is plain DOM order and hit-testing is exact.
// Colours come from CSS custom properties; geometry never depends on theme.

export const CAMERA = { tilt: 56, turn: -20 };
/** Plinth: a bevelled top edge, the wooden body, and a recessed dark base it floats on. */
export const PLINTH = { bevel: 7, body: 54, base: 16, baseInset: 7 };
export const BODY_DEPTH = PLINTH.bevel + PLINTH.body;
export const GROUND_Z = -(BODY_DEPTH + PLINTH.base);
export const Z = {
  platter: 12,
  mat: 12.4,
  record: 14.2,
  arm: 24,
  armLift: 11,
  tower: 22,
};
export const PARTS = {
  power: { x: 509, y: 300, r: 21, h: 16 },
  speed: { x: 509, y: 368, r: 15, h: 12 },
  led: { x: 482, y: 240, r: 4.5 },
  board: { x: 402, y: 26, w: 144, h: 380, r: 12 },
  cue: { x: 500, y: 150, r: 9, h: 7 },
  rest: { r: 5, h: 18, dist: 176 },
  towerBase: { r: 40 },
  tower: { r: 16 },
  lid: { inset: -3, height: 64, hingeZ: 6, open: 102, closed: 0 },
};

const rad = (d) => (d * Math.PI) / 180;
const f = (n) => (Math.round(n * 100) / 100).toString();

export function createProjector(camera = CAMERA) {
  const a = rad(camera.tilt), b = rad(camera.turn);
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  const origin = { x: 0, y: 0 };

  const proj = (x, y, z = 0) => ({ x: origin.x + x * cb - y * sb, y: origin.y + (x * sb + y * cb) * ca - z * sa });
  /** larger = closer to the viewer */
  const depth = (x, y, z = 0) => (x * sb + y * cb) * sa + z * ca;

  /** CSS matrix mapping local (1,0)→u, (0,1)→v, (0,0)→o (all 3D). */
  function plane(o, u, v) {
    const p0 = proj(o[0], o[1], o[2]);
    const pu = proj(o[0] + u[0], o[1] + u[1], o[2] + u[2]);
    const pv = proj(o[0] + v[0], o[1] + v[1], o[2] + v[2]);
    return `matrix(${f4(pu.x - p0.x)},${f4(pu.y - p0.y)},${f4(pv.x - p0.x)},${f4(pv.y - p0.y)},${f4(p0.x)},${f4(p0.y)})`;
  }
  const flat = (z = 0) => plane([0, 0, z], [1, 0, 0], [0, 1, 0]);

  /** Scene px → deck units on the horizontal plane at height z. */
  function unproject(sx, sy, z = 0) {
    const X = sx - origin.x;
    const Y = (sy - origin.y + z * sa) / ca;
    return { x: X * cb + Y * sb, y: -X * sb + Y * cb };
  }

  /** Is a face with this outward normal turned towards the camera? */
  const facing = (n) => n[0] * sb * sa + n[1] * cb * sa + n[2] * ca > 1e-6;

  return { proj, depth, plane, flat, unproject, facing, origin, sinTilt: sa, cosTilt: ca };
}
const f4 = (n) => (Math.round(n * 10000) / 10000).toString();

/* --------------------------------------------------------------- cylinders */

let gid = 0;
/**
 * Vertical cylinder as a positioned SVG (side + optional top ellipse).
 * stops: side gradient [[offset, cssColor], …] left → right.
 */
export function cylinderSvg(P, { cx, cy, r, z0, z1, side, top = null, topStroke = null, cls = "", extra = "" }) {
  const T = P.proj(cx, cy, z1);
  const B = P.proj(cx, cy, z0);
  const ry = r * P.cosTilt;
  const pad = 2;
  const minX = T.x - r - pad, maxX = T.x + r + pad;
  const minY = T.y - ry - pad, maxY = B.y + ry + pad;
  const id = "cyl" + ++gid;
  const d = `M${f(T.x - r)} ${f(T.y)} L${f(B.x - r)} ${f(B.y)} A${f(r)} ${f(ry)} 0 0 0 ${f(B.x + r)} ${f(B.y)} L${f(T.x + r)} ${f(T.y)} A${f(r)} ${f(ry)} 0 0 1 ${f(T.x - r)} ${f(T.y)} Z`;
  const grad = `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(T.x - r)}" x2="${f(T.x + r)}" y1="0" y2="0">${side.map(([o, c]) => `<stop offset="${o}" style="stop-color:${c}"/>`).join("")}</linearGradient>`;
  const topEl = top ? `<ellipse cx="${f(T.x)}" cy="${f(T.y)}" rx="${f(r)}" ry="${f(ry)}" style="fill:${top}${topStroke ? ";stroke:" + topStroke + ";stroke-width:1" : ""}"/>` : "";
  return `<svg class="tt-abs ${cls}" style="left:${f(minX)}px;top:${f(minY)}px;width:${f(maxX - minX)}px;height:${f(maxY - minY)}px" viewBox="${f(minX)} ${f(minY)} ${f(maxX - minX)} ${f(maxY - minY)}" aria-hidden="true"><defs>${grad}</defs><path d="${d}" fill="url(#${id})"/>${topEl}${extra}</svg>`;
}

export const METAL_SIDE = [
  [0, "var(--_metal-dark)"], [0.12, "var(--_metal)"], [0.3, "var(--_metal-hi)"], [0.42, "var(--_metal)"],
  [0.7, "var(--_metal-mid)"], [0.86, "var(--_metal-hi)"], [1, "var(--_metal-dark)"],
];
export const DARK_SIDE = [[0, "#151413"], [0.3, "#3a3836"], [0.45, "#2a2928"], [1, "#0e0e0d"]];
export const BLACK_METAL_SIDE = [[0, "#1d1c1b"], [0.25, "#55524e"], [0.4, "#2f2e2c"], [0.8, "#1b1a19"], [1, "#0d0d0c"]];

/* -------------------------------------------------------------- top plate */

/** Static printed / inset details on the plinth top (in deck units). */
export function topDetailsSvg(deck, { label = "" } = {}) {
  const p = PARTS.board;
  const pc = deck.platter;
  const pv = deck.pivot;
  const screws = [[p.x + 10, p.y + 10], [p.x + p.w - 10, p.y + 10], [p.x + 10, p.y + p.h - 10], [p.x + p.w - 10, p.y + p.h - 10]]
    .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="3" fill="url(#ttScrew)" stroke="rgba(0,0,0,.35)" stroke-width=".5"/><path d="M${x - 2} ${y} L${x + 2} ${y}" stroke="rgba(0,0,0,.5)" stroke-width=".9" transform="rotate(${[20, 75, -40, 110][i]} ${x} ${y})"/>`).join("");
  const pw = PARTS.power, sp = PARTS.speed, cue = PARTS.cue;
  const ticks = [140, 220].map((a) => {
    const t = rad(a - 90);
    const x1 = pw.x + Math.cos(t) * (pw.r + 4), y1 = pw.y + Math.sin(t) * (pw.r + 4);
    const x2 = pw.x + Math.cos(t) * (pw.r + 8), y2 = pw.y + Math.sin(t) * (pw.r + 8);
    return `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
  }).join("");
  const arc = (() => {
    const r = pw.r + 6;
    const s = rad(140 - 90), e = rad(220 - 90);
    return `M${f(pw.x + Math.cos(s) * r)} ${f(pw.y + Math.sin(s) * r)} A${r} ${r} 0 0 1 ${f(pw.x + Math.cos(e) * r)} ${f(pw.y + Math.sin(e) * r)}`;
  })();
  // plate thickness: offset in the plane that reads as "2 units lower"
  const th = { x: -1.1, y: 2.9 };
  return `<svg class="tt-fill" viewBox="0 0 ${deck.width} ${deck.height}" aria-hidden="true">
  <defs>
    <radialGradient id="ttScrew" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#b8b3ab"/><stop offset="1" stop-color="#6b665f"/></radialGradient>
    <linearGradient id="ttBoard" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" style="stop-color:var(--_metal-hi)"/><stop offset=".35" style="stop-color:var(--_metal)"/>
      <stop offset=".55" style="stop-color:var(--_metal-hi)"/><stop offset=".8" style="stop-color:var(--_metal)"/><stop offset="1" style="stop-color:var(--_metal-mid)"/>
    </linearGradient>
    <pattern id="ttBrush" width="400" height="5" patternUnits="userSpaceOnUse">
      <rect y=".8" width="400" height=".55" fill="#fff" opacity=".22"/><rect y="2.9" width="400" height=".45" fill="#000" opacity=".06"/>
      <rect x="40" y="4.1" width="220" height=".4" fill="#fff" opacity=".14"/>
    </pattern>
    <radialGradient id="ttWell" cx=".5" cy=".5" r=".5">
      <stop offset=".9" stop-color="#120a05" stop-opacity=".75"/><stop offset="1" stop-color="#120a05" stop-opacity="0"/>
    </radialGradient>
    <filter id="ttBlur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>
    <filter id="ttBlurS" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.5"/></filter>
  </defs>
  <!-- inlay line around the top -->
  <rect x="17" y="17" width="${deck.width - 34}" height="${deck.height - 34}" rx="3" fill="none" style="stroke:var(--_body-dark)" stroke-opacity=".45" stroke-width="1.2"/>
  <rect x="18.2" y="18.2" width="${deck.width - 36.4}" height="${deck.height - 36.4}" rx="2.5" fill="none" stroke="#fff" stroke-opacity=".13" stroke-width=".8"/>
  <!-- platter well: the platter sits in a cut-out -->
  <circle cx="${pc.cx + 9}" cy="${pc.cy + 11}" r="${pc.r + 4}" fill="#1b0f08" opacity=".32" filter="url(#ttBlur)"/>
  <circle cx="${pc.cx}" cy="${pc.cy}" r="${pc.r + 7}" fill="url(#ttWell)"/>
  <circle cx="${pc.cx}" cy="${pc.cy}" r="${pc.r + 7}" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="1"/>
  <!-- arm board: brushed aluminium plate -->
  <rect x="${p.x + 3}" y="${p.y + 5}" width="${p.w}" height="${p.h}" rx="${p.r}" fill="#1b0f08" opacity=".35" filter="url(#ttBlurS)"/>
  <rect x="${p.x + th.x}" y="${p.y + th.y}" width="${p.w}" height="${p.h}" rx="${p.r}" style="fill:var(--_metal-dark)"/>
  <rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.r}" fill="url(#ttBoard)"/>
  <rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.r}" fill="url(#ttBrush)"/>
  <rect x="${p.x + .8}" y="${p.y + .8}" width="${p.w - 1.6}" height="${p.h - 1.6}" rx="${p.r - .8}" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.3"/>
  <rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.r}" fill="none" stroke="rgba(0,0,0,.3)" stroke-width=".7"/>
  ${screws}
  <circle cx="${pv.x + 4}" cy="${pv.y + 6}" r="${PARTS.towerBase.r + 1}" fill="#1b1309" opacity=".28" filter="url(#ttBlurS)"/>
  <!-- control panel engraving -->
  <path d="M${p.x + 14} ${PARTS.led.y - 16} L${p.x + p.w - 14} ${PARTS.led.y - 16}" stroke="rgba(0,0,0,.18)" stroke-width=".8"/>
  <path d="M${p.x + 14} ${PARTS.led.y - 15.2} L${p.x + p.w - 14} ${PARTS.led.y - 15.2}" stroke="#fff" stroke-opacity=".5" stroke-width=".8"/>
  <g fill="none" stroke="var(--_print)" stroke-width="1.3" stroke-linecap="round" opacity=".75">${ticks}<path d="${arc}" stroke-width=".9" stroke-dasharray="1.5 3"/></g>
  <g font-family="ui-rounded, 'Avenir Next', system-ui, sans-serif" font-weight="700" fill="var(--_print)" opacity=".78" text-anchor="middle">
    <text x="${pw.x - 24}" y="${pw.y + pw.r + 9}" font-size="7" letter-spacing=".6">ON</text>
    <text x="${pw.x + 25}" y="${pw.y + pw.r + 9}" font-size="7" letter-spacing=".6">OFF</text>
    <text x="${sp.x - 26}" y="${sp.y + 3}" font-size="9">33</text>
    <text x="${sp.x + 26}" y="${sp.y + 3}" font-size="9">45</text>
    <text x="${sp.x}" y="${sp.y + sp.r + 13}" font-size="6" letter-spacing="1.4">RPM</text>
    <text x="${PARTS.led.x + 9}" y="${PARTS.led.y + 2.5}" font-size="6" letter-spacing="1.2" text-anchor="start">POWER</text>
    <text x="${cue.x}" y="${cue.y + 33}" font-size="5.5" letter-spacing="1">CUE</text>
  </g>
  <!-- cue lever slot -->
  <rect x="${cue.x - 6}" y="${cue.y - 18}" width="12" height="36" rx="6" fill="#2a2724" opacity=".85"/>
  <rect x="${cue.x - 6}" y="${cue.y - 18}" width="12" height="36" rx="6" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width=".8" transform="translate(.6 .9)"/>
  <!-- engraving -->
  ${label ? `<text x="38" y="${deck.height - 26}" font-family="ui-rounded, 'Avenir Next', system-ui, sans-serif" font-size="8" font-weight="700" letter-spacing="2.4" fill="var(--_print-wood)" opacity=".5">${esc(label)} · STEREO</text>` : ""}
</svg>`;
}

export const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------------------------------------------------------------- tonearm */

/**
 * Tonearm drawn in arm-local units: origin at the pivot, +x towards the
 * stylus, which sits exactly at (armLength, 0).
 */
export function armSvg(L, { shadow = false } = {}) {
  const off = 23; // headshell offset angle
  const hs = headshellPoints(L, off);
  const vb = `-96 -40 ${L + 136} 80`;
  const box = `viewBox="${vb}" style="left:-96px;top:-40px;width:${L + 136}px;height:80px" class="tt-abs" aria-hidden="true"`;
  if (shadow) {
    return `<svg ${box}><g fill="#000" stroke="#000" stroke-linecap="round">
    <rect x="-84" y="-14" width="38" height="28" rx="6" stroke="none"/><rect x="-46" y="-3.5" width="50" height="7" stroke="none"/>
    <circle r="13" stroke="none"/><path d="${hs.tube}" fill="none" stroke-width="7"/>
    <path d="${hs.body}" stroke="none"/><path d="${hs.finger}" fill="none" stroke-width="3.2"/></g></svg>`;
  }
  return `<svg ${box}>
  <defs>
    <linearGradient id="ttTube" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" style="stop-color:var(--_metal-dark)"/><stop offset=".22" style="stop-color:var(--_metal-hi)"/><stop offset=".42" style="stop-color:#fff"/>
      <stop offset=".6" style="stop-color:var(--_metal)"/><stop offset="1" style="stop-color:var(--_metal-dark)"/>
    </linearGradient>
    <linearGradient id="ttWeight" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" style="stop-color:var(--_metal-dark)"/><stop offset=".25" style="stop-color:var(--_metal-hi)"/><stop offset=".38" style="stop-color:#fff"/>
      <stop offset=".55" style="stop-color:var(--_metal)"/><stop offset=".85" style="stop-color:var(--_metal-mid)"/><stop offset="1" style="stop-color:var(--_metal-dark)"/>
    </linearGradient>
    <linearGradient id="ttShell" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" style="stop-color:var(--_metal-hi)"/><stop offset=".5" style="stop-color:var(--_metal)"/><stop offset="1" style="stop-color:var(--_metal-dark)"/>
    </linearGradient>
    <radialGradient id="ttYoke" cx=".38" cy=".35" r=".75">
      <stop offset="0" stop-color="#fff"/><stop offset=".45" style="stop-color:var(--_metal)"/><stop offset="1" style="stop-color:var(--_metal-dark)"/>
    </radialGradient>
  </defs>
  <!-- counterweight + stub -->
  <rect x="-46" y="-3.2" width="50" height="6.4" fill="url(#ttTube)"/>
  <rect x="-84" y="-14" width="38" height="28" rx="5" fill="url(#ttWeight)"/>
  <g stroke="rgba(0,0,0,.28)" stroke-width=".7">${Array.from({ length: 9 }, (_, i) => `<line x1="${-80 + i * 3.6}" y1="-13" x2="${-80 + i * 3.6}" y2="13"/>`).join("")}</g>
  <rect x="-84" y="-14" width="38" height="28" rx="5" fill="none" stroke="rgba(0,0,0,.35)" stroke-width=".8"/>
  <rect x="-50" y="-11" width="6" height="22" rx="2" fill="url(#ttWeight)" stroke="rgba(0,0,0,.3)" stroke-width=".6"/>
  <!-- tube: straight, then a gentle J into the offset headshell -->
  <g fill="none" stroke-linecap="round">
    <path d="${hs.tube}" stroke="rgba(40,36,32,.55)" stroke-width="7.6"/>
    <path d="${hs.tube}" style="stroke:var(--_metal-mid)" stroke-width="6.4"/>
    <path d="${hs.tube}" style="stroke:var(--_metal-hi)" stroke-width="3.6" transform="translate(0 -.9)"/>
    <path d="${hs.tube}" stroke="#fff" stroke-opacity=".85" stroke-width="1.1" transform="translate(0 -1.3)"/>
  </g>
  <path d="${hs.collar}" fill="url(#ttShell)" stroke="rgba(0,0,0,.3)" stroke-width=".6"/>
  <!-- gimbal yoke -->
  <circle r="14" fill="url(#ttYoke)" stroke="rgba(0,0,0,.35)" stroke-width=".8"/>
  <circle r="8.5" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="1"/>
  <circle r="4" style="fill:var(--_metal-dark)"/>
  <!-- headshell -->
  <path d="${hs.body}" fill="url(#ttShell)" stroke="rgba(0,0,0,.35)" stroke-width=".8"/>
  <path d="${hs.slot}" stroke="rgba(0,0,0,.4)" stroke-width="1.6" stroke-linecap="round"/>
  <path d="${hs.finger}" fill="none" style="stroke:var(--_metal-hi)" stroke-width="3" stroke-linecap="round"/>
  <path d="${hs.finger}" fill="none" stroke="rgba(0,0,0,.25)" stroke-width=".6" stroke-linecap="round" transform="translate(0 1.2)"/>
</svg>`;
}

/** Headshell outline, rotated by the offset angle about the stylus. */
export function headshellPoints(L, offset = 23) {
  const a = rad(offset);
  const c = Math.cos(a), s = Math.sin(a);
  // local headshell frame: stylus at (0,0), body extends back along -u
  const P = (u, v) => [L + u * c - v * s, u * s + v * c];
  const pts = [P(-40, -5), P(-6, -9), P(6, -8), P(9, 0), P(6, 8), P(-6, 9), P(-40, 5)];
  const body = "M" + pts.map((p) => p.map(f).join(" ")).join(" L") + " Z";
  const slotA = P(-28, 0), slotB = P(-8, 0);
  const fa = P(-4, -8), fb = P(-2, -17), fc = P(8, -22);
  const back = P(-44, 0), ctrl = P(-58, 0);
  const straightEnd = L - 76;
  const tube = `M10 0 L${f(straightEnd)} 0 C${f(straightEnd + 16)} 0 ${f(ctrl[0])} ${f(ctrl[1])} ${f(back[0])} ${f(back[1])}`;
  const collar = "M" + [P(-46, -4.6), P(-36, -4.6), P(-36, 4.6), P(-46, 4.6)].map((p) => p.map(f).join(" ")).join(" L") + " Z";
  return {
    tube,
    collar,
    body,
    slot: `M${f(slotA[0])} ${f(slotA[1])} L${f(slotB[0])} ${f(slotB[1])}`,
    finger: `M${f(fa[0])} ${f(fa[1])} Q${f(fb[0])} ${f(fb[1])} ${f(fc[0])} ${f(fc[1])}`,
    frame: P,
  };
}

/**
 * Cartridge body hanging under the headshell, drawn in scene space every
 * frame (its vertical faces change with the arm angle).
 */
export function cartridgeSvgInner(P, deck, angle, zTop, { offset = 23 } = {}) {
  const L = deck.armLength;
  const hs = headshellPoints(L, offset);
  const th = rad(angle);
  const c = Math.cos(th), s = Math.sin(th);
  const toDeck = ([ax, ay]) => [deck.pivot.x + ax * c - ay * s, deck.pivot.y + ax * s + ay * c];
  const zb = zTop - 7.2;
  const box = [[-17, -6], [-1, -6], [-1, 6], [-17, 6]].map(([u, v]) => toDeck(hs.frame(u, v)));
  const faces = [];
  for (let i = 0; i < 4; i++) {
    const a = box[i], b = box[(i + 1) % 4];
    const n = [b[1] - a[1], -(b[0] - a[0]), 0]; // outward for clockwise-in-screen order
    if (!P.facing(n)) continue;
    const q = [P.proj(a[0], a[1], zTop), P.proj(b[0], b[1], zTop), P.proj(b[0], b[1], zb), P.proj(a[0], a[1], zb)];
    const light = 0.5 + 0.5 * Math.max(-1, Math.min(1, (n[0] * -0.6 + n[1] * -0.2) / Math.hypot(n[0], n[1])));
    faces.push(`<path d="M${q.map((p) => f(p.x) + " " + f(p.y)).join(" L")} Z" fill="hsl(18 8% ${f(8 + light * 18)}%)" stroke="rgba(0,0,0,.4)" stroke-width=".5"/>`);
  }
  // stylus + a tiny red jewel on the body
  const tip = toDeck(hs.frame(0, 0));
  const t1 = P.proj(tip[0], tip[1], zb + 0.5), t2 = P.proj(tip[0], tip[1], zb - 1.6);
  const jewel = toDeck(hs.frame(-4, 0));
  const j = P.proj(jewel[0], jewel[1], zb + 2);
  faces.push(`<path d="M${f(t1.x)} ${f(t1.y)} L${f(t2.x)} ${f(t2.y)}" stroke="#d9d4cc" stroke-width="1.1" stroke-linecap="round"/>`);
  faces.push(`<circle cx="${f(j.x)}" cy="${f(j.y)}" r="1.4" style="fill:var(--_accent)"/>`);
  return faces.join("");
}

/* ------------------------------------------------------------- wood grain */

let grainUrl = null;
/** A seamless-ish wood grain strip (greyscale, multiplied over the body colour). */
export function woodGrainUrl() {
  if (grainUrl || typeof document === "undefined") return grainUrl;
  const w = 768, h = 384;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(w, h);
  const rnd = mulberry(7);
  const waves = Array.from({ length: 7 }, () => ({ a: rnd() * 7 + 2, f: ((rnd() * 2.5 + 0.6) / w) * Math.PI * 2, p: rnd() * 6 }));
  const lines = Array.from({ length: h * 2 }, () => rnd());
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let off = 0;
      for (const wv of waves) off += Math.sin(x * wv.f + wv.p + y * 0.012) * wv.a;
      // cathedral figure: a slow bulge that makes the rings sweep
      off += Math.sin(x / w * Math.PI * 2 + 1.3) * 18 * Math.exp(-(((y - h * 0.55) / (h * 0.35)) ** 2));
      const yy = y + off;
      const ring = Math.sin(yy * 0.36 + Math.sin(yy * 0.045) * 3.2) * 0.5 + 0.5;
      const fine = lines[((Math.floor(yy * 1.7) % lines.length) + lines.length) % lines.length];
      const figure = Math.sin(x * 0.004 + y * 0.02) * 0.04;
      let v = 0.74 + ring * 0.2 + fine * 0.1 + figure;
      if (ring > 0.92) v -= 0.16 * (ring - 0.92) / 0.08; // latewood lines
      v -= rnd() * 0.04;
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, v * 255));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // pores: short dark streaks along the grain
  ctx.fillStyle = "rgba(40, 22, 10, .28)";
  for (let i = 0; i < 1600; i++) ctx.fillRect(rnd() * w, rnd() * h, 3 + rnd() * 10, 0.7);
  grainUrl = c.toDataURL("image/jpeg", 0.85);
  return grainUrl;
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
