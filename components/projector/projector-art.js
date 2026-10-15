// Procedural 2.5D skin for the projector. The machine is modelled in
// "machine units" (x → along the lens axis, y → towards the viewer, z → up)
// and drawn with an orthographic camera: flat faces become 2D affine CSS
// matrices, cylinders become SVG silhouettes. No CSS 3D, so layering is
// plain DOM order and hit-testing is exact. Colours come from CSS custom
// properties; geometry never depends on the theme.

export const CAMERA = { tilt: 66, turn: 15 };
/** Cinema: seen from behind and to the side, the lens pointing into the room. */
export const CINEMA_CAMERA = { tilt: 64, turn: -34 };

export const MODEL = {
  base: { x0: 0, x1: 300, y0: 0, y1: 128, z0: 0, z1: 15 },
  body: { x0: 16, x1: 254, y0: 14, y1: 112, z0: 15, z1: 128 },
  feet: { r: 9, h: 8, inset: 20 },
  lens: {
    y: 63,
    z: 72,
    parts: [
      { key: "mount", x0: 254, x1: 266, r: 39 },
      { key: "barrel", x0: 266, x1: 282, r: 29 },
      { key: "ring", x0: 282, x1: 314, r: 33 },
      { key: "tube", x0: 314, x1: 330, r: 28 },
      { key: "bezel", x0: 330, x1: 338, r: 31 },
    ],
    glass: 24,
  },
  reels: [
    { key: "take", x: 82, y: 32, z: 214, r: 66 },
    { key: "feed", x: 204, y: 32, z: 196, r: 50 },
  ],
  postY: 15,
  reelGap: 10, // between the two flanges
  reelPlate: 1.4, // flange thickness
  // the film bay: a hatch in the top, hinged at its back edge
  hatch: { x0: 28, x1: 168, y0: 35, y1: 107, z: 128, thick: 3.2, open: 102 },
  // a round tin film can; where a new one waits on the table, and where it sits in the bay
  can: { r: 34, h: 13 },
  table: { x: 300, y: 176, z: 0 },
  bayCan: { x: 98, y: 71, z: 115.5 },

};

/** Where the light leaves the lens (machine units). */
export const LENS_EXIT = { x: MODEL.lens.parts.at(-1).x1, y: MODEL.lens.y, z: MODEL.lens.z };

const rad = (d) => (d * Math.PI) / 180;
const f = (n) => (Math.round(n * 100) / 100).toString();
const f4 = (n) => (Math.round(n * 10000) / 10000).toString();
export const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function createCamera(camera = CAMERA) {
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
  const view = [sb * sa, cb * sa, ca];
  const facing = (n) => n[0] * view[0] + n[1] * view[1] + n[2] * view[2] > 1e-6;
  return { proj, depth, plane, facing, view, origin, sinTilt: sa, cosTilt: ca };
}

/* --------------------------------------------------------------- vertical */

let gid = 0;
/** Vertical cylinder as a positioned SVG (side + optional top ellipse). */
export function cylinderSvg(P, { cx, cy, r, z0, z1, side, top = null, cls = "" }) {
  const T = P.proj(cx, cy, z1), B = P.proj(cx, cy, z0);
  const ry = r * P.cosTilt;
  const pad = 2;
  const minX = T.x - r - pad, maxX = T.x + r + pad, minY = T.y - ry - pad, maxY = B.y + ry + pad;
  const id = "pjc" + ++gid;
  const d = `M${f(T.x - r)} ${f(T.y)} L${f(B.x - r)} ${f(B.y)} A${f(r)} ${f(ry)} 0 0 0 ${f(B.x + r)} ${f(B.y)} L${f(T.x + r)} ${f(T.y)} A${f(r)} ${f(ry)} 0 0 1 ${f(T.x - r)} ${f(T.y)} Z`;
  const grad = `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(T.x - r)}" x2="${f(T.x + r)}" y1="0" y2="0">${side.map(([o, c]) => `<stop offset="${o}" style="stop-color:${c}"/>`).join("")}</linearGradient>`;
  const topEl = top ? `<ellipse cx="${f(T.x)}" cy="${f(T.y)}" rx="${f(r)}" ry="${f(ry)}" style="fill:${top}"/>` : "";
  return `<svg class="pj-abs ${cls}" style="left:${f(minX)}px;top:${f(minY)}px;width:${f(maxX - minX)}px;height:${f(maxY - minY)}px" viewBox="${f(minX)} ${f(minY)} ${f(maxX - minX)} ${f(maxY - minY)}" aria-hidden="true"><defs>${grad}</defs><path d="${d}" fill="url(#${id})"/>${topEl}</svg>`;
}

export const BRASS_SIDE = [
  [0, "var(--_metal-dark)"], [0.18, "var(--_metal)"], [0.34, "var(--_metal-hi)"], [0.5, "var(--_metal)"],
  [0.78, "var(--_metal-mid)"], [1, "var(--_metal-dark)"],
];
export const DARK_SIDE = [[0, "#141210"], [0.3, "#3b3631"], [0.45, "#2a2622"], [1, "#0d0c0b"]];

/* ------------------------------------------------------------- horizontal */

/** Ellipse outline of the circle (radius r) around the lens axis at x. */
function ring(P, x, y, z, r, n = 56) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push(P.proj(x, y + r * Math.cos(t), z + r * Math.sin(t)));
  }
  return pts;
}
function hull(points) {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop(); lower.push(q); }
  for (const q of p.reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
const poly = (pts) => "M" + pts.map((p) => f(p.x) + " " + f(p.y)).join(" L") + " Z";

const LENS_LOOK = {
  mount: { side: [[0, "#0d0c0b"], [0.22, "#4a443d"], [0.32, "#6b645a"], [0.5, "#2c2824"], [1, "#0b0a09"]], cap: "#24211e" },
  barrel: { side: [[0, "var(--_metal-dark)"], [0.2, "var(--_metal)"], [0.32, "var(--_metal-hi)"], [0.5, "var(--_metal)"], [1, "var(--_metal-dark)"]], cap: "var(--_metal-mid)" },
  ring: { side: [[0, "#0a0908"], [0.24, "#3a3530"], [0.34, "#58524a"], [0.52, "#211e1b"], [1, "#080707"]], cap: "#1c1a18" },
  tube: { side: [[0, "#0b0a09"], [0.24, "#403a34"], [0.34, "#5e574e"], [0.52, "#24211e"], [1, "#0a0908"]], cap: "#1a1816" },
  bezel: { side: [[0, "var(--_metal-dark)"], [0.22, "var(--_metal)"], [0.3, "var(--_metal-hi)"], [0.5, "var(--_metal-mid)"], [1, "var(--_metal-dark)"]], cap: "var(--_metal)" },
};

/** The whole lens as SVG markup in machine-scene coordinates. */
export function lensSvg(P) {
  const L = MODEL.lens;
  const axis = P.proj(1, 0, 0), o = P.proj(0, 0, 0);
  const D = { x: axis.x - o.x, y: axis.y - o.y };
  const dl = Math.hypot(D.x, D.y);
  const N = { x: -D.y / dl, y: D.x / dl };
  const defs = [];
  const body = [];
  // seen from the front the tip is nearest; seen from behind it is farthest
  const fromFront = P.facing([1, 0, 0]);
  const parts = fromFront ? L.parts : [...L.parts].reverse();
  for (const part of parts) {
    const a = ring(P, part.x0, L.y, L.z, part.r), b = ring(P, part.x1, L.y, L.z, part.r);
    const c = P.proj((part.x0 + part.x1) / 2, L.y, L.z);
    let R = 0;
    for (const p of b) R = Math.max(R, Math.abs((p.x - c.x) * N.x + (p.y - c.y) * N.y));
    const id = "pjl" + ++gid;
    const look = LENS_LOOK[part.key];
    defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(c.x - N.x * R)}" y1="${f(c.y - N.y * R)}" x2="${f(c.x + N.x * R)}" y2="${f(c.y + N.y * R)}">${look.side.map(([q, col]) => `<stop offset="${q}" style="stop-color:${col}"/>`).join("")}</linearGradient>`);
    body.push(`<path d="${poly(hull(a.concat(b)))}" fill="url(#${id})"/>`);
    if (part.key === "ring") body.push(`<g data-knurl></g>`);
    body.push(`<path d="${poly(fromFront ? b : a)}" style="fill:${look.cap}" stroke="rgba(0,0,0,.35)" stroke-width=".6"/>`);
    if (!fromFront) continue;
    if (part.key === "mount") body.push(`<path d="${poly(ring(P, part.x1 + 0.1, L.y, L.z, part.r - 3))}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="1"/>`);
    if (part.key === "bezel") body.push(`<path d="${poly(ring(P, part.x1 + 0.1, L.y, L.z, part.r - 1.5))}" fill="none" stroke="rgba(255,255,255,.4)" stroke-width=".8"/>`);
  }
  if (!fromFront) return { defs: defs.join(""), body: body.join("") };
  // glass: a few lens elements receding into the barrel
  const gx = L.parts.at(-1).x1 + 0.2;
  const g = L.glass;
  const center = P.proj(gx, L.y, L.z);
  defs.push(`<radialGradient id="pjGlass" gradientUnits="userSpaceOnUse" cx="${f(center.x - 4)}" cy="${f(center.y - 6)}" r="${f(g * 1.1)}">
      <stop offset="0" stop-color="#6d6a72"/><stop offset=".35" stop-color="#2a2b33"/><stop offset=".8" stop-color="#121218"/><stop offset="1" stop-color="#050507"/></radialGradient>
    <radialGradient id="pjLampGlass" gradientUnits="userSpaceOnUse" cx="${f(center.x)}" cy="${f(center.y)}" r="${f(g)}">
      <stop offset="0" stop-color="#fffaf0"/><stop offset=".3" style="stop-color:var(--_light-hi)"/><stop offset=".75" style="stop-color:var(--_light)"/><stop offset="1" style="stop-color:var(--_light)" stop-opacity=".3"/></radialGradient>`);
  const glass = `
    <path d="${poly(ring(P, gx, L.y, L.z, g))}" fill="url(#pjGlass)" stroke="#000" stroke-opacity=".6" stroke-width="1"/>
    <path d="${poly(ring(P, gx - 3, L.y, L.z, g * 0.72))}" fill="none" stroke="rgba(160,180,210,.22)" stroke-width="1"/>
    <path d="${poly(ring(P, gx - 6, L.y, L.z, g * 0.45))}" fill="none" stroke="rgba(160,180,210,.18)" stroke-width=".8"/>
    <path class="pj-lamp-glass" d="${poly(ring(P, gx, L.y, L.z, g))}" fill="url(#pjLampGlass)"/>
    <path d="${poly(ring(P, gx, L.y + g * 0.32, L.z + g * 0.42, g * 0.28, 24))}" fill="#fff" opacity=".22"/>
    <path d="${poly(ring(P, gx, L.y - g * 0.38, L.z - g * 0.3, g * 0.1, 16))}" fill="#fff" opacity=".18"/>`;
  return { defs: defs.join(""), body: body.join("") + glass };
}

/** Knurled ridges on the focus ring; `turn` (degrees) rotates them. */
export function knurlSvg(P, turn = 0) {
  const L = MODEL.lens;
  const part = L.parts.find((p) => p.key === "ring");
  const out = [];
  const light = norm([0.1, 0.55, 0.83]);
  const n = 44;
  for (let i = 0; i < n; i++) {
    const t = rad((i / n) * 360 + turn);
    const nrm = [0, Math.cos(t), Math.sin(t)];
    const vis = nrm[1] * P.view[1] + nrm[2] * P.view[2];
    if (vis < 0.05) continue;
    const a = P.proj(part.x0 + 2.5, L.y + part.r * nrm[1], L.z + part.r * nrm[2]);
    const b = P.proj(part.x1 - 2.5, L.y + part.r * nrm[1], L.z + part.r * nrm[2]);
    const lum = Math.max(0, nrm[1] * light[1] + nrm[2] * light[2]);
    const alpha = Math.min(1, vis * 1.6);
    out.push(`<path d="M${f(a.x)} ${f(a.y)} L${f(b.x)} ${f(b.y)}" stroke="rgba(${lum > 0.45 ? "255,246,230" : "0,0,0"},${f((lum > 0.45 ? 0.1 + lum * 0.22 : 0.55) * alpha)})" stroke-width="${f(1.1 + vis * 0.6)}" stroke-linecap="round"/>`);
  }
  // a brass index dot that turns with the ring
  const t = rad(turn - 90);
  const nrm = [0, Math.cos(t), Math.sin(t)];
  if (nrm[1] * P.view[1] + nrm[2] * P.view[2] > 0.1) {
    const p = P.proj((part.x0 + part.x1) / 2, L.y + (part.r + 0.5) * nrm[1], L.z + (part.r + 0.5) * nrm[2]);
    out.push(`<circle cx="${f(p.x)}" cy="${f(p.y)}" r="1.8" style="fill:var(--_accent)"/>`);
  }
  return out.join("");
}
const norm = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };

/* ------------------------------------------------------------------ reels */

/**
 * Front flange of a reel, drawn around (0,0) in a [-r, r] box: pressed steel
 * with raised lips round the windows, a stiffening ring, spun-metal lines and
 * stamped lettering. It rotates as a whole; lighting lives in a static layer.
 */
export function reelFrontSvg(r, { label = "TRINKET · 400 FT" } = {}) {
  const holes = 5, hr = r * 0.215, hd = r * 0.55;
  const circle = (cx, cy, rr) => `M${f(cx + rr)} ${f(cy)} A${f(rr)} ${f(rr)} 0 1 0 ${f(cx - rr)} ${f(cy)} A${f(rr)} ${f(rr)} 0 1 0 ${f(cx + rr)} ${f(cy)} Z`;
  const centres = Array.from({ length: holes }, (_, i) => { const a = (i / holes) * Math.PI * 2 - Math.PI / 2; return [Math.cos(a) * hd, Math.sin(a) * hd]; });
  let d = circle(0, 0, r);
  for (const [x, y] of centres) d += circle(x, y, hr);
  d += circle(0, 0, r * 0.075);
  const id = "pjr" + ++gid;
  const w = (k) => f(r * k);
  // a raised lip: bright on the upper-left, dark on the lower-right
  const lip = (x, y, rr, k = 1) => `
    <circle cx="${f(x)}" cy="${f(y)}" r="${f(rr)}" fill="none" stroke="rgba(60,36,10,${0.5 * k})" stroke-width="${w(0.03)}" transform="translate(${w(0.008)} ${w(0.01)})"/>
    <circle cx="${f(x)}" cy="${f(y)}" r="${f(rr)}" fill="none" stroke="url(#${id}lip)" stroke-width="${w(0.022)}"/>`;
  const spun = Array.from({ length: 26 }, (_, i) => {
    const rr = r * (0.22 + i * 0.029);
    return `<circle r="${f(rr)}" fill="none" stroke="${i % 3 ? "rgba(255,248,230,.07)" : "rgba(70,45,15,.08)"}" stroke-width="${w(0.006)}"/>`;
  }).join("");
  const rivets = Array.from({ length: 3 }, (_, i) => {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    return `<circle cx="${f(Math.cos(a) * r * 0.155)}" cy="${f(Math.sin(a) * r * 0.155)}" r="${w(0.022)}" fill="url(#${id}rv)"/>`;
  }).join("");
  const arc = r * 0.885;
  return `<svg class="pj-fill" viewBox="${f(-r)} ${f(-r)} ${f(2 * r)} ${f(2 * r)}" aria-hidden="true" overflow="visible">
  <defs>
    <radialGradient id="${id}" cx=".42" cy=".38" r=".7">
      <stop offset="0" style="stop-color:color-mix(in oklab, var(--_metal), white 18%)"/><stop offset=".55" style="stop-color:var(--_metal)"/><stop offset="1" style="stop-color:var(--_metal-mid)"/>
    </radialGradient>
    <linearGradient id="${id}lip" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff8e6" stop-opacity=".85"/><stop offset=".45" stop-color="#fff8e6" stop-opacity=".1"/><stop offset=".55" stop-color="#3c240a" stop-opacity=".1"/><stop offset="1" stop-color="#3c240a" stop-opacity=".55"/></linearGradient>
    <radialGradient id="${id}rv" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".5" style="stop-color:var(--_metal)"/><stop offset="1" style="stop-color:var(--_metal-dark)"/></radialGradient>
    <radialGradient id="${id}hub" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#f4f2ee"/><stop offset=".5" stop-color="#a9a49c"/><stop offset="1" stop-color="#5c5750"/></radialGradient>
    <path id="${id}arc" d="M${f(-arc)} 0 A${f(arc)} ${f(arc)} 0 0 1 ${f(arc)} 0"/>
  </defs>
  <path d="${d}" fill="url(#${id})" fill-rule="evenodd"/>
  <g clip-path="none">${spun}</g>
  <path d="${d}" fill="none" stroke="rgba(50,30,8,.5)" stroke-width="${w(0.012)}" fill-rule="evenodd"/>
  ${lip(0, 0, r * 0.965, 1.2)}
  ${lip(0, 0, r * 0.78, 0.8)}
  ${centres.map(([x, y]) => lip(x, y, hr + r * 0.03)).join("")}
  ${lip(0, 0, r * 0.25, 0.9)}
  <text font-family="ui-rounded, 'Avenir Next', system-ui, sans-serif" font-size="${w(0.062)}" font-weight="700" letter-spacing="${w(0.02)}" fill="rgba(70,44,14,.55)">
    <textPath href="#${id}arc" startOffset="50%" text-anchor="middle">${esc(label)}</textPath>
  </text>
  <circle r="${w(0.2)}" fill="url(#${id})"/>
  <circle r="${w(0.2)}" fill="none" stroke="url(#${id}lip)" stroke-width="${w(0.02)}"/>
  ${rivets}
  <circle r="${w(0.11)}" fill="url(#${id}hub)" stroke="rgba(0,0,0,.35)" stroke-width="${w(0.008)}"/>
  <rect x="${w(-0.04)}" y="${w(-0.04)}" width="${w(0.08)}" height="${w(0.08)}" rx="${w(0.008)}" fill="#1a1612"/>
  <path d="M${w(-0.1)} 0 H${w(-0.055)} M${w(0.055)} 0 H${w(0.1)}" stroke="rgba(30,25,20,.6)" stroke-width="${w(0.014)}"/>
</svg>`;
}

/**
 * The reel seen edge-on: the gap between the flanges (with the wound film
 * inside) and the thickness of each flange, as SVG in machine-scene px.
 * Returns markup plus a function that redraws the film-pack edge.
 */
export function reelEdgeSvg(P, reel, { gap = 10, plate = 1.4 } = {}) {
  const ring = (y, R, n = 64) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      pts.push(P.proj(reel.x + R * Math.cos(t), y, reel.z + R * Math.sin(t)));
    }
    return pts;
  };
  const band = (yA, yB, R) => poly(hull(ring(yA, R).concat(ring(yB, R))));
  const yF = reel.y, yB = reel.y - gap;
  const c = P.proj(reel.x, (yF + yB) / 2, reel.z);
  const id = "pje" + ++gid;
  const markup = `<svg class="pj-abs pj-reel-edge" style="width:100%;height:100%" aria-hidden="true" overflow="visible">
  <defs>
    <radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${f(c.x)}" cy="${f(c.y)}" r="${f(reel.r * 1.1)}">
      <stop offset="0" style="stop-color:var(--_metal-dark)"/><stop offset=".85" style="stop-color:var(--_metal-mid)"/><stop offset="1" style="stop-color:var(--_metal)"/>
    </radialGradient>
  </defs>
  <path d="${band(yB - plate, yB, reel.r)}" fill="url(#${id})" stroke="rgba(40,24,6,.5)" stroke-width=".5"/>
  <path d="${band(yF - gap + plate, yF - plate, reel.r * 0.985)}" style="fill:color-mix(in oklab, var(--_metal-dark), black 35%)"/>
  <path data-packedge fill="#2a1b10" stroke="rgba(120,80,40,.35)" stroke-width=".4"/>
  <path d="${band(yF - plate, yF, reel.r)}" fill="url(#${id})" stroke="rgba(40,24,6,.45)" stroke-width=".5"/>
</svg>`;
  const packEdge = (R) => (R > 1 ? band(yF - gap + plate + 0.6, yF - plate - 0.6, R) : "");
  return { markup, packEdge };
}

/** Chromed hub cap sticking out of the front flange (static: it is round). */
export function hubCapSvg(P, reel) {
  const R = reel.r * 0.085, len = 5;
  const ring = (y, rr) => {
    const pts = [];
    for (let i = 0; i < 40; i++) {
      const t = (i / 40) * Math.PI * 2;
      pts.push(P.proj(reel.x + rr * Math.cos(t), y, reel.z + rr * Math.sin(t)));
    }
    return pts;
  };
  const id = "pjh" + ++gid;
  const a = ring(reel.y, R), b = ring(reel.y + len, R), cap = ring(reel.y + len, R * 0.98);
  const c = P.proj(reel.x, reel.y + len, reel.z);
  return `<svg class="pj-abs" style="width:100%;height:100%" aria-hidden="true" overflow="visible">
  <defs><radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${f(c.x - R * 0.3)}" cy="${f(c.y - R * 0.4)}" r="${f(R * 1.4)}"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#bdb8b0"/><stop offset="1" stop-color="#5e5952"/></radialGradient></defs>
  <path d="${poly(hull(a.concat(b)))}" fill="#6f6a63" stroke="rgba(0,0,0,.4)" stroke-width=".5"/>
  <path d="${poly(cap)}" fill="url(#${id})" stroke="rgba(0,0,0,.35)" stroke-width=".5"/>
  <circle cx="${f(c.x)}" cy="${f(c.y)}" r="${f(R * 0.32)}" fill="#24201b"/>
</svg>`;
}

/** Wound film between the flanges: a dark, glossy disc with winding layers. */
export function reelPackSvg(r) {
  const id = "pjp" + ++gid;
  const rings = Array.from({ length: 22 }, (_, i) => `<circle r="${f(r * (0.2 + i * 0.034))}" fill="none" stroke="rgba(255,214,170,${i % 4 === 0 ? 0.1 : 0.04})" stroke-width="${f(r * 0.005)}"/>`).join("");
  return `<svg class="pj-fill" viewBox="${f(-r)} ${f(-r)} ${f(2 * r)} ${f(2 * r)}" aria-hidden="true" overflow="visible">
  <defs><radialGradient id="${id}" cx=".45" cy=".4" r=".65"><stop offset="0" stop-color="#3a2717"/><stop offset=".7" stop-color="#24170d"/><stop offset="1" stop-color="#160e08"/></radialGradient></defs>
  <g class="pj-pack-g"><circle r="${f(r * 0.94)}" fill="url(#${id})"/>${rings}<circle r="${f(r * 0.94)}" fill="none" stroke="#6b4628" stroke-opacity=".6" stroke-width="${f(r * 0.012)}"/></g>
</svg>`;
}

/* ------------------------------------------------------------ wood grain */

let grainUrl = null;
/** Greyscale wood grain, multiplied over the body colour (walnut finish). */
export function woodGrainUrl() {
  if (grainUrl || typeof document === "undefined") return grainUrl;
  const w = 384, h = 192;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(w, h);
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const waves = Array.from({ length: 5 }, () => ({ a: rnd() * 5 + 2, f: ((rnd() * 3 + 1) / w) * Math.PI * 2, p: rnd() * 6 }));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let off = 0;
      for (const wv of waves) off += Math.sin(x * wv.f + wv.p + y * 0.012) * wv.a;
      const yy = y + off;
      const ringV = Math.sin(yy * 0.45 + Math.sin(yy * 0.05) * 3) * 0.5 + 0.5;
      const v = 0.84 + ringV * 0.11 - (ringV > 0.93 ? 0.1 : 0) - rnd() * 0.035;
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, v * 255));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  grainUrl = c.toDataURL("image/jpeg", 0.82);
  return grainUrl;
}

/* -------------------------------------------------------------- film can */

export const TIN_SIDE = [
  [0, "#5b5f62"], [0.14, "#9ba1a4"], [0.3, "#e3e7e8"], [0.42, "#b8bec1"], [0.7, "#7e8488"], [0.88, "#a8aeb1"], [1, "#4b4f52"],
];

/** The can's lid, drawn flat (in its own top plane) around (0,0) in a [-r, r] box. */
export function canLidSvg(r, { line1 = "", line2 = "" } = {}) {
  const id = "pjCan" + ++gid;
  const rings = [0.93, 0.8, 0.36].map((k, i) => `<circle r="${f(r * k)}" fill="none" stroke="rgba(0,0,0,${i === 2 ? 0.18 : 0.22})" stroke-width="${f(r * 0.02)}"/><circle r="${f(r * k - r * 0.02)}" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="${f(r * 0.012)}"/>`).join("");
  return `<svg class="pj-fill" viewBox="${f(-r)} ${f(-r)} ${f(2 * r)} ${f(2 * r)}" aria-hidden="true" overflow="visible">
  <defs>
    <radialGradient id="${id}" cx=".38" cy=".3" r=".85"><stop offset="0" stop-color="#f4f6f6"/><stop offset=".5" stop-color="#c3c9cb"/><stop offset="1" stop-color="#8d9396"/></radialGradient>
    <linearGradient id="${id}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6ecd6"/><stop offset="1" stop-color="#e6d6b4"/></linearGradient>
  </defs>
  <circle r="${f(r)}" fill="url(#${id})"/>
  ${rings}
  <rect x="${f(-r * 0.62)}" y="${f(-r * 0.3)}" width="${f(r * 1.24)}" height="${f(r * 0.6)}" rx="${f(r * 0.05)}" fill="url(#${id}p)" stroke="rgba(120,90,40,.4)" stroke-width="${f(r * 0.012)}" transform="rotate(-8)"/>
  <g transform="rotate(-8)" font-family="'American Typewriter', 'Courier New', ui-monospace, monospace" fill="#4a3720" text-anchor="middle">
    <text y="${f(-r * 0.04)}" font-size="${f(r * 0.17)}" font-weight="700" letter-spacing="${f(r * 0.012)}">${esc(line1)}</text>
    <text y="${f(r * 0.18)}" font-size="${f(r * 0.11)}" opacity=".75">${esc(line2)}</text>
  </g>
  <path d="M${f(-r * 0.62)} ${f(-r * 0.12)} h${f(r * 1.24)}" stroke="rgba(181,83,47,.5)" stroke-width="${f(r * 0.012)}" transform="rotate(-8)"/>
</svg>`;
}
