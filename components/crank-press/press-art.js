// Procedural 2.5D skin for the crank press. Machine units: x → right (along
// the rollers), y → towards the viewer (the way the sheet travels), z → up.
// An orthographic camera computed in JS turns flat faces into 2D affine CSS
// matrices; turned parts (handle, hubs, knob) are SVG lathe silhouettes; the
// pattern roller is a ring of thin facets whose background scrolls as it
// turns. No CSS 3D: layering is DOM order, hit-testing is exact.

export const CAMERA = { tilt: 60, turn: 32 };

const rad = (d) => (d * Math.PI) / 180;
export const f = (n) => (Math.round(n * 100) / 100).toString();
const f4 = (n) => (Math.round(n * 10000) / 10000).toString();
export const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* -------------------------------------------------------------- geometry */

export const XC = 130;
export const BASE = {
  plinth: { x0: 14, x1: 246, y0: 26, y1: 168, z: 7 },
  body: { x0: 18, x1: 242, y0: 30, y1: 164, z: 26 },
  top: { x0: 22, x1: 238, y0: 34, y1: 160, z: 30 },
};
export const FRAMES = { left: { x0: 40, x1: 52 }, right: { x0: 208, x1: 220 } };
/** Pattern roller on the crank shaft. */
export const ROLLER = { x0: 52, x1: 208, y: 95, z: 97, r: 26, facets: 72 };
/** Plain counter roller underneath. */
export const LOWER = { x0: 52, x1: 208, y: 95, z: 56, r: 15 };
export const NIP = [ROLLER.y, ROLLER.z - ROLLER.r];
/** Widest sheet the pattern area takes (sheet units). */
export const MAX_SHEET_W = 140;

export const GEARS = { x: 225, upper: { r: 24, teeth: 20 }, lower: { r: 17, teeth: 14 } };
export const WHEEL = { x: 234, r: 46, rim: 7.5, spokes: 6, layers: [228, 229, 230, 231, 232, 233] };
export const CRANK = { x: 240.5, r: 37 };
export const HANDLE = {
  ferrule: [[0, 3.2], [3, 3.2], [3.3, 5.1], [5.8, 5.1], [6.2, 4.4]],
  wood: [[6.2, 4.4], [8, 5.3], [11, 6.7], [15, 8], [20, 8.5], [25, 8.1], [28.5, 7.1], [31.3, 5.8], [33.2, 4.3], [34.4, 2.6], [35, 0.8]],
};
export const CROSSBAR = { x0: 52, x1: 208, y0: 84, y1: 106, z0: 134, z1: 144 };
export const TIE_ROD = { x0: 52, x1: 208, y: 60, z: 122, r: 3.2 };
export const GUIDE = { x0: 64, x1: 196, a: [107, 68.2], b: [165, 31] };
export const TRAY = { x0: 66, x1: 194, a: [86, 71.6], b: [24, 91.6] };

/** Sheet path out of the nip (y, z): over the guide plate, a drape off the base, the table. */
export const OUTFEED = (() => {
  // the drape is a cubic from the lip of the guide plate down to the table, sampled finely
  const pts = [[95, 71], [107, 68.8], [165, 31.6]];
  const P0 = [165, 31.6], P1 = [171.4, 27.3], P2 = [181.5, 0.15], P3 = [194, 0.15];
  for (let i = 1; i <= 10; i++) {
    const t = i / 10, u = 1 - t;
    pts.push([0, 1].map((k) => u * u * u * P0[k] + 3 * u * u * t * P1[k] + 3 * u * t * t * P2[k] + t * t * t * P3[k]));
  }
  pts.push([206, 0.15]);
  return pts;
})();
/** Leading-edge curl on the table: two short planes lifting the last few units. */
export const CURL = [{ len: 5, angle: 6 }, { len: 4.5, angle: 19 }];
/** Infeed: from the nip back up the tray. */
export const INFEED = [[95, 71], [86, 72.2], [24, 92.2], [16, 92], [10, 86], [7, 72], [6, 20]];
/** Flat paper shown on the table beyond the last path point (for layout bounds). */
export const REACH = 84;

/** Split a (y, z) polyline into plane segments with arc-length starts. */
export function pathSegments(points, tail = 0) {
  const segs = [];
  let a = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [y0, z0] = points[i], [y1, z1] = points[i + 1];
    let len = Math.hypot(y1 - y0, z1 - z0);
    const dir = [0, (y1 - y0) / len, (z1 - z0) / len];
    const last = i === points.length - 2;
    segs.push({ o: [y0, z0], dir, a, len: last ? len + tail : len });
    a += len;
  }
  return segs;
}

/** Point on a path at arc length s (extends the last segment). */
export function pathPoint(points, s) {
  let a = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [y0, z0] = points[i], [y1, z1] = points[i + 1];
    const len = Math.hypot(y1 - y0, z1 - z0);
    if (s <= a + len || i === points.length - 2) {
      const t = (s - a) / len;
      return [y0 + (y1 - y0) * t, z0 + (z1 - z0) * t];
    }
    a += len;
  }
  return points[0];
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
  function plane(o, u, v) {
    const p0 = proj(o[0], o[1], o[2]);
    const pu = proj(o[0] + u[0], o[1] + u[1], o[2] + u[2]);
    const pv = proj(o[0] + v[0], o[1] + v[1], o[2] + v[2]);
    return `matrix(${f4(pu.x - p0.x)},${f4(pu.y - p0.y)},${f4(pv.x - p0.x)},${f4(pv.y - p0.y)},${f4(p0.x)},${f4(p0.y)})`;
  }
  const facing = (n) => n[0] * sb * sa + n[1] * cb * sa + n[2] * ca > 1e-6;
  /** Unit vector towards the viewer. */
  const view = [sb * sa, cb * sa, ca];
  /** Scene point → (y, z) on the plane x = const (inverse of proj). */
  const onPlaneX = (sx, sy, x) => {
    const y = (origin.x + x * cb - sx) / sb;
    const z = (origin.y + (x * sb + y * cb) * ca - sy) / sa;
    return [y, z];
  };
  return { proj, p3, depth, plane, facing, view, onPlaneX, origin, sinTilt: sa, cosTilt: ca, sinTurn: sb, cosTurn: cb };
}

/* ---------------------------------------------------------------- shading */

const LIGHT = (() => { const l = [-0.42, 0.38, 0.82]; const n = Math.hypot(...l); return l.map((v) => v / n); })();
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** Overlay colour for a face with normal n: black (shadow) or white (light). */
export function faceShade(n, P, { ambient = 0.45, spec = 0.35, shininess = 26, flat = null } = {}) {
  const ln = Math.hypot(...n); n = n.map((v) => v / ln);
  const diff = Math.max(0, dot(n, LIGHT));
  const h = LIGHT.map((v, i) => v + P.view[i]); const hl = Math.hypot(...h);
  const s = Math.pow(Math.max(0, dot(n, h.map((v) => v / hl))), shininess) * spec;
  const ref = flat ?? 0.92;
  const b = ambient + (1 - ambient) * diff / ref;
  if (b < 1) return { color: `rgba(4,8,8,${f4(Math.min(0.7, (1 - b) * 0.95))})`, spec: s };
  return { color: `rgba(255,255,252,${f4(Math.min(0.45, (b - 1) * 0.8))})`, spec: s };
}

/* -------------------------------------------------------------- primitives */

let gid = 0;
const uid = (p) => `${p}${++gid}`;
const stopsXml = (stops) => stops.map(([o, c, op]) => `<stop offset="${o}" style="stop-color:${c}${op != null ? ";stop-opacity:" + op : ""}"/>`).join("");
const poly = (pts) => "M" + pts.map((p) => f(p.x ?? p[0]) + " " + f(p.y ?? p[1])).join(" L") + " Z";

/** Solid of revolution around x. profile: [[dx, r]] ascending dx. Returns { defs, body }. */
export function latheX(P, { x0, y, z, profile, side, cap = null, capStroke = null, rings = null }) {
  const O = P.proj(0, 0, 0), X = P.proj(1, 0, 0), Y = P.proj(0, 1, 0), Z = P.proj(0, 0, 1);
  let ex = X.x - O.x, ey = X.y - O.y;
  const el = Math.hypot(ex, ey); ex /= el; ey /= el;
  let nx = -ey, ny = ex;
  if (ny > 0) { nx = -nx; ny = -ny; }
  const a1 = [Y.x - O.x, Y.y - O.y], b1 = [Z.x - O.x, Z.y - O.y];
  const q = Math.hypot(nx * a1[0] + ny * a1[1], nx * b1[0] + ny * b1[1]);
  const top = [], bot = [];
  let rmax = 0;
  for (const [dx, r] of profile) {
    const c = P.proj(x0 + dx, y, z);
    top.push([c.x + nx * r * q, c.y + ny * r * q]);
    bot.push([c.x - nx * r * q, c.y - ny * r * q]);
    rmax = Math.max(rmax, r);
  }
  const mid = P.proj(x0 + profile[Math.floor(profile.length / 2)][0], y, z);
  const id = uid("prl");
  const defs = `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(mid.x + nx * rmax * q)}" y1="${f(mid.y + ny * rmax * q)}" x2="${f(mid.x - nx * rmax * q)}" y2="${f(mid.y - ny * rmax * q)}">${stopsXml(side)}</linearGradient>`;
  let body = `<path d="${poly([...top, ...bot.reverse()])}" fill="url(#${id})"/>`;
  const ellipse = (dx, r) => {
    const c = P.proj(x0 + dx, y, z);
    const pts = [];
    for (let i = 0; i < 28; i++) {
      const t = (i / 28) * Math.PI * 2;
      pts.push([c.x + (a1[0] * Math.cos(t) + b1[0] * Math.sin(t)) * r, c.y + (a1[1] * Math.cos(t) + b1[1] * Math.sin(t)) * r]);
    }
    return poly(pts);
  };
  if (rings) for (const [dx, r, color, w] of rings) body += `<path d="${ellipse(dx, r)}" fill="none" style="stroke:${color}" stroke-width="${w ?? 0.5}"/>`;
  if (cap) {
    const [dx, r] = profile[profile.length - 1];
    body += `<path d="${ellipse(dx, r)}" style="fill:${cap}${capStroke ? ";stroke:" + capStroke + ";stroke-width:.6" : ""}"/>`;
  }
  return { defs, body };
}

/** Vertical cylinder as a positioned SVG (knob). */
export function vCylinder(P, { cx, cy, r, z0, z1, side, top = null, topStroke = null, knurl = 0 }) {
  const T = P.proj(cx, cy, z1), B = P.proj(cx, cy, z0);
  const ry = r * P.cosTilt, pad = 2;
  const minX = T.x - r - pad, maxX = T.x + r + pad, minY = T.y - ry - pad, maxY = B.y + ry + pad;
  const id = uid("prv");
  const d = `M${f(T.x - r)} ${f(T.y)} L${f(B.x - r)} ${f(B.y)} A${f(r)} ${f(ry)} 0 0 0 ${f(B.x + r)} ${f(B.y)} L${f(T.x + r)} ${f(T.y)} A${f(r)} ${f(ry)} 0 0 1 ${f(T.x - r)} ${f(T.y)} Z`;
  let lines = "";
  for (let i = 1; i < knurl; i++) {
    const x = T.x - r + (2 * r * i) / knurl;
    const k = Math.sqrt(Math.max(0, 1 - ((x - T.x) / r) ** 2)) * ry;
    lines += `M${f(x)} ${f(T.y + k)} L${f(x)} ${f(B.y + k)} `;
  }
  return `<svg class="pr-abs" style="left:${f(minX)}px;top:${f(minY)}px;width:${f(maxX - minX)}px;height:${f(maxY - minY)}px" viewBox="${f(minX)} ${f(minY)} ${f(maxX - minX)} ${f(maxY - minY)}" aria-hidden="true"><defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(T.x - r)}" x2="${f(T.x + r)}" y1="0" y2="0">${stopsXml(side)}</linearGradient></defs><path d="${d}" fill="url(#${id})"/>${lines ? `<path d="${lines}" stroke="rgba(40,22,6,.45)" stroke-width=".55"/>` : ""}${top ? `<ellipse cx="${f(T.x)}" cy="${f(T.y)}" rx="${f(r)}" ry="${f(ry)}" style="fill:${top}${topStroke ? ";stroke:" + topStroke + ";stroke-width:.7" : ""}"/>` : ""}</svg>`;
}

/** Horizontal cylinder along x with constant radius (rollers, rods). */
export function hCylinder(P, { x0, x1, y, z, r, side }) {
  return latheX(P, { x0, y, z, profile: [[0, r], [x1 - x0, r]], side });
}

export const BRASS = [[0, "var(--_brass-dark)"], [0.12, "var(--_brass-mid)"], [0.24, "var(--_brass)"], [0.32, "var(--_brass-light)"], [0.4, "var(--_brass)"], [0.62, "var(--_brass-mid)"], [0.84, "var(--_brass)"], [1, "var(--_brass-dark)"]];
export const STEEL = [[0, "var(--_steel-dark)"], [0.16, "var(--_steel)"], [0.3, "var(--_steel-hi)"], [0.46, "var(--_steel)"], [0.8, "var(--_steel-mid)"], [1, "var(--_steel-dark)"]];
export const WOOD = [[0, "var(--_wood-deep)"], [0.1, "var(--_wood)"], [0.22, "var(--_wood-hi)"], [0.29, "var(--_wood-hi2)"], [0.34, "var(--_wood-hi)"], [0.48, "var(--_wood)"], [0.72, "var(--_wood-dark)"], [0.88, "var(--_wood)"], [1, "var(--_wood-deep)"]];
export const BODYCYL = [[0, "var(--_body-dark)"], [0.2, "var(--_body)"], [0.34, "var(--_body-hi)"], [0.5, "var(--_body)"], [1, "var(--_body-deep)"]];

/* ---------------------------------------------------------- flat artwork */

/** Side frame profile in (y, z): straight lines and cubic Béziers, symmetric about y = 95. */
const FRAME_SEGS = [
  ["M", [36, 30]], ["L", [154, 30]],
  ["C", [146, 34], [128, 40], [124, 54]],
  ["C", [121, 64], [132, 76], [131, 92]],
  ["C", [130, 108], [126, 118], [120, 128]],
  ["C", [116, 136], [112, 144], [104, 147]],
  ["L", [86, 147]],
  ["C", [78, 144], [74, 136], [70, 128]],
  ["C", [64, 118], [60, 108], [59, 92]],
  ["C", [58, 76], [69, 64], [66, 54]],
  ["C", [62, 40], [44, 34], [36, 30]],
];
const FY = 30, FZ = 156;
export const FRAME_BOX = { y0: FY, zTop: FZ, w: 130, h: 126 };
const L = (y, z) => `${f(y - FY)} ${f(FZ - z)}`;
export const FRAME_PATH = FRAME_SEGS.map(([c, ...p]) => c + p.map((q) => L(q[0], q[1])).join(" ")).join(" ") + " Z";

/** The profile flattened to (y, z) points, counter-clockwise, without the closing duplicate. */
export const FRAME_POINTS = (() => {
  const pts = [];
  let cur = null;
  for (const [c, ...p] of FRAME_SEGS) {
    if (c === "M" || c === "L") { cur = p[0]; pts.push(cur); continue; }
    const [c1, c2, e] = p, n = 14;
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      pts.push([u * u * u * cur[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * e[0], u * u * u * cur[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * e[1]]);
    }
    cur = e;
  }
  const last = pts[pts.length - 1];
  if (Math.hypot(last[0] - pts[0][0], last[1] - pts[0][1]) < 1e-6) pts.pop();
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const [a, b] = pts[i], [c, d] = pts[(i + 1) % pts.length]; area += a * d - c * b; }
  return area < 0 ? pts.reverse() : pts;
})();

const mixBody = (k) => (k >= 0 ? `color-mix(in oklch, var(--_body), white ${f(Math.min(60, k * 100))}%)` : `color-mix(in oklch, var(--_body), black ${f(Math.min(80, -k * 100))}%)`);

/**
 * The thickness of an extruded profile between x0 and x1: one shaded quad per
 * profile edge that faces the camera. Returns scene-SVG markup.
 */
export function extrusionSvg(P, x0, x1, points = FRAME_POINTS) {
  const out = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const [ya, za] = points[i], [yb, zb] = points[(i + 1) % n];
    const dy = yb - ya, dz = zb - za, len = Math.hypot(dy, dz);
    if (len < 1e-6) continue;
    const nrm = [0, dz / len, -dy / len]; // outward for a CCW profile
    if (!P.facing(nrm)) continue;
    const lit = dot(nrm, LIGHT);
    const k = -0.42 + lit * 0.5 + Math.max(0, nrm[2]) * 0.12;
    const q = [P.proj(x0, ya, za), P.proj(x1, ya, za), P.proj(x1, yb, zb), P.proj(x0, yb, zb)];
    const col = mixBody(k);
    out.push(`<path d="${poly(q)}" style="fill:${col};stroke:${col}" stroke-width=".35" stroke-linejoin="round"/>`);
  }
  // the rounded arris where the band meets the face catches the light
  const rim = points.map(([y, z]) => P.proj(x1 - 0.5, y, z));
  out.push(`<path d="${poly(rim)}" fill="none" stroke="#fff" stroke-opacity=".26" stroke-width=".9" stroke-linejoin="round"/>`);
  return out.join("");
}

let wearSeed = 9;
const wr = () => { wearSeed = (wearSeed * 16807) % 2147483647; return wearSeed / 2147483647; };
/** Irregular dash pattern for paint worn off an edge. */
export const wearDash = (len = 400) => {
  const d = [];
  let t = 0;
  while (t < len) { const on = 0.4 + wr() * wr() * 9, off = 6 + wr() * 34; d.push(f(on), f(off)); t += on + off; }
  return d.join(" ");
};

/** A frame face: lacquer with cast grain, an inner bevel, a brass pinstripe, worn edges and bosses. */
export function frameSvg({ face = true, outer = false, grain = null } = {}) {
  const { w, h } = FRAME_BOX;
  const cx = 95 - FY;
  if (!face) return `<svg class="pr-fill" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${FRAME_PATH}" style="fill:var(--_body-dark)"/></svg>`;
  const id = uid("prf");
  const boss = (z, r) => `<circle cx="${cx}" cy="${FZ - z}" r="${r + 2.4}" style="fill:var(--_body-deep)" opacity=".6" filter="url(#${id}s)"/>
    <circle cx="${cx}" cy="${FZ - z}" r="${r}" style="fill:var(--_body)"/><circle cx="${cx}" cy="${FZ - z}" r="${r}" fill="url(#${id}b)"/>
    <circle cx="${cx}" cy="${FZ - z}" r="${r - 0.9}" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width=".7" transform="translate(-.4 -.4)"/>
    <circle cx="${cx}" cy="${FZ - z}" r="${r - 1}" fill="none" style="stroke:var(--_brass)" stroke-width=".5" opacity=".7"/>`;
  // soft occlusion where the gears and the wheel stand close to the face
  const ao = outer ? `<g filter="url(#${id}s)" style="fill:var(--_body-deep)"><circle cx="${cx}" cy="${FZ - 97}" r="31" opacity=".38"/><circle cx="${cx}" cy="${FZ - 56}" r="22" opacity=".34"/></g>` : "";
  return `<svg class="pr-fill" viewBox="0 0 ${w} ${h}" aria-hidden="true">
  <defs>
    <clipPath id="${id}c"><path d="${FRAME_PATH}"/></clipPath>
    <linearGradient id="${id}" x1="0" y1="0" x2=".45" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".42" stop-color="#fff" stop-opacity="0"/><stop offset="1" style="stop-color:var(--_body-deep)" stop-opacity=".6"/></linearGradient>
    <linearGradient id="${id}gl" x1="0" y1="0" x2="1" y2=".25"><stop offset=".08" stop-color="#fff" stop-opacity="0"/><stop offset=".2" stop-color="#fff" stop-opacity=".07"/><stop offset=".27" stop-color="#fff" stop-opacity=".03"/><stop offset=".36" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <radialGradient id="${id}b" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="#fff" stop-opacity=".24"/><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" style="stop-color:var(--_body-deep)" stop-opacity=".7"/></radialGradient>
    <filter id="${id}s" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.2"/></filter>
    <filter id="${id}e" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation=".7"/></filter>
    ${grain ? `<pattern id="${id}g" width="48" height="48" patternUnits="userSpaceOnUse"><image href="${grain}" width="48" height="48"/></pattern>` : ""}
  </defs>
  <path d="${FRAME_PATH}" style="fill:var(--_body)"/>
  <g clip-path="url(#${id}c)">
    ${grain ? `<rect width="${w}" height="${h}" fill="url(#${id}g)"/>` : ""}
    <rect width="${w}" height="${h}" fill="url(#${id})"/>
    <rect width="${w}" height="${h}" fill="url(#${id}gl)"/>
    ${ao}
    <path d="${FRAME_PATH}" fill="none" style="stroke:var(--_body-deep)" stroke-opacity=".85" stroke-width="3.2" transform="translate(1.1 1.3)" filter="url(#${id}e)"/>
    <path d="${FRAME_PATH}" fill="none" stroke="#fff" stroke-opacity=".34" stroke-width="2.6" transform="translate(-.9 -1)" filter="url(#${id}e)"/>
    <path d="${FRAME_PATH}" fill="none" style="stroke:var(--_brass)" stroke-opacity=".5" stroke-width="1.1" stroke-linecap="round" stroke-dasharray="${wearDash(700)}" transform="translate(-.15 -.15)" filter="url(#${id}e)"/>
  </g>
  <g transform="translate(${cx} ${FZ - 88}) scale(.8 .78) translate(${-cx} ${-(FZ - 88)})">
    <path d="${FRAME_PATH}" fill="none" style="stroke:var(--_body-deep)" stroke-opacity=".6" stroke-width="1.6" transform="translate(.4 .5)"/>
    <path d="${FRAME_PATH}" fill="none" style="stroke:var(--_brass)" stroke-width=".85"/>
    <path d="${FRAME_PATH}" fill="none" stroke="#fff6dc" stroke-opacity=".45" stroke-width=".3" transform="translate(-.25 -.3)"/>
  </g>
  ${outer ? boss(97, 15) + boss(56, 11) : ""}
  <circle cx="${cx - 18}" cy="${FZ - 140}" r="1.7" style="fill:var(--_brass)" stroke="#1c0f05" stroke-opacity=".5" stroke-width=".4"/><circle cx="${cx + 18}" cy="${FZ - 140}" r="1.7" style="fill:var(--_brass)" stroke="#1c0f05" stroke-opacity=".5" stroke-width=".4"/>
</svg>`;
}

/** The spoked wheel: a static rim (its light doesn't turn) and turning spokes. */
const annulus = (ro, ri) => `M${-ro} 0 A${ro} ${ro} 0 1 0 ${ro} 0 A${ro} ${ro} 0 1 0 ${-ro} 0 Z M${-ri} 0 A${ri} ${ri} 0 1 1 ${ri} 0 A${ri} ${ri} 0 1 1 ${-ri} 0 Z`;

/** depth: 0 = the face; 1…n = layers behind it (thickness), darker with depth. */
export function wheelRimSvg(depth = 0) {
  const { r, rim } = WHEEL;
  const id = uid("prw");
  if (depth) {
    const k = Math.min(78, 40 + depth * 6);
    return `<svg class="pr-fill" viewBox="-50 -50 100 100" aria-hidden="true"><path d="${annulus(r, r - rim)}" fill-rule="evenodd" style="fill:color-mix(in oklch, var(--_brass-mid), #1c140c ${k}%)"/></svg>`;
  }
  const ri = r - rim;
  return `<svg class="pr-fill" viewBox="-50 -50 100 100" aria-hidden="true">
  <defs>
    <linearGradient id="${id}" x1=".1" y1="0" x2=".75" y2="1"><stop offset="0" style="stop-color:var(--_brass-light)"/><stop offset=".3" style="stop-color:var(--_brass)"/><stop offset=".55" style="stop-color:var(--_brass-mid)"/><stop offset=".8" style="stop-color:var(--_brass)"/><stop offset="1" style="stop-color:var(--_brass-mid)"/></linearGradient>
  </defs>
  <path d="${annulus(r, ri)}" fill-rule="evenodd" fill="url(#${id})"/>
  <circle r="${f(r - 0.5)}" fill="none" stroke="#fffaf0" stroke-opacity=".45" stroke-width=".6"/>
  <circle r="${f(r - 2.6)}" fill="none" style="stroke:var(--_brass-dark)" stroke-opacity=".55" stroke-width=".5"/>
  <circle r="${f(r - 3.2)}" fill="none" stroke="#fffaf0" stroke-opacity=".3" stroke-width=".5"/>
  <circle r="${f(ri + 1.6)}" fill="none" style="stroke:var(--_brass-light)" stroke-opacity=".7" stroke-width="1.2"/>
  <circle r="${f(ri + 1.6)}" fill="none" style="stroke:var(--_brass-dark)" stroke-opacity=".5" stroke-width=".4" transform="translate(.35 .35)"/>
  <circle r="${f(ri + 0.3)}" fill="none" style="stroke:var(--_brass-deep)" stroke-opacity=".7" stroke-width=".7"/>
  <path d="M${f(-(r - 1.4) * 0.94)} ${f(-(r - 1.4) * 0.34)} A${r - 1.4} ${r - 1.4} 0 0 1 ${f((r - 1.4) * 0.17)} ${f(-(r - 1.4) * 0.985)}" fill="none" stroke="#fffaf0" stroke-opacity=".38" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;
}

/** Tapered, curved spokes and the hub (box -50…50). dark = the thickness layer behind. */
export function wheelSpokesSvg(dark = false) {
  const { r, rim, spokes } = WHEEL;
  const id = uid("prs");
  const ri = r - rim + 0.6;
  const shapes = [];
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const pts = [], back = [];
    const N = 16;
    for (let j = 0; j <= N; j++) {
      const t = j / N;
      const rr = 9 + (ri - 9) * t;
      const ang = a + Math.sin(t * Math.PI) * 0.22;          // gentle S-curve
      const wdt = (2.7 - 1.2 * t + (t > 0.86 ? (t - 0.86) * 9 : 0)); // taper, with a fillet into the rim
      const cx = Math.cos(ang) * rr, cy = Math.sin(ang) * rr;
      const nx = -Math.sin(ang), ny = Math.cos(ang);
      pts.push([cx + nx * wdt, cy + ny * wdt]);
      back.push([cx - nx * wdt, cy - ny * wdt]);
    }
    shapes.push("M" + [...pts, ...back.reverse()].map(([x, y]) => f(x) + " " + f(y)).join(" L") + " Z");
  }
  const d = shapes.join(" ");
  if (dark) return `<svg class="pr-fill" viewBox="-50 -50 100 100" aria-hidden="true"><path d="${d}" style="fill:color-mix(in oklch, var(--_brass-mid), #1c140c 58%)"/><circle r="12.5" style="fill:color-mix(in oklch, var(--_brass-mid), #1c140c 58%)"/></svg>`;
  const bolts = Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2 + 0.26; return `<circle cx="${f(Math.cos(a) * 8.8)}" cy="${f(Math.sin(a) * 8.8)}" r=".85" style="fill:var(--_brass-dark)"/><circle cx="${f(Math.cos(a) * 8.8 - 0.25)}" cy="${f(Math.sin(a) * 8.8 - 0.25)}" r=".35" fill="#fffaf0" opacity=".6"/>`; }).join("");
  return `<svg class="pr-fill" viewBox="-50 -50 100 100" aria-hidden="true">
  <defs>
    <radialGradient id="${id}" cx="0" cy="0" r="44" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color:var(--_brass-light)"/><stop offset=".45" style="stop-color:var(--_brass)"/><stop offset="1" style="stop-color:var(--_brass-mid)"/></radialGradient>
    <radialGradient id="${id}h" cx="-.25" cy="-.3" r="1.1"><stop offset="0" style="stop-color:var(--_brass-hi)"/><stop offset=".45" style="stop-color:var(--_brass)"/><stop offset="1" style="stop-color:var(--_brass-mid)"/></radialGradient>
  </defs>
  <path d="${d}" fill="url(#${id})" style="stroke:var(--_brass-dark)" stroke-opacity=".55" stroke-width=".45" stroke-linejoin="round"/>
  <circle r="13" style="fill:var(--_brass-mid)"/>
  <circle r="12.2" fill="url(#${id}h)"/>
  <circle r="10.6" fill="none" style="stroke:var(--_brass-dark)" stroke-opacity=".6" stroke-width=".5"/>
  <circle r="10.2" fill="none" stroke="#fffaf0" stroke-opacity=".35" stroke-width=".4"/>
  ${bolts}
</svg>`;
}

/** Spur gear centred in a box of size 2(r+4); holes are open. depth > 0: thickness layer. */
export function gearSvg(r, teeth, depth = 0) {
  const s = r + 4, id = uid("prg");
  const rt = r + 2.4, rr = r - 1.8;
  const pts = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2, w = (Math.PI * 2) / teeth;
    for (const [da, rad2] of [[0, rr], [w * 0.16, rr + 0.4], [w * 0.22, rt], [w * 0.44, rt], [w * 0.5, rr + 0.4], [w * 0.66, rr]]) pts.push([Math.cos(a + da) * rad2, Math.sin(a + da) * rad2]);
  }
  const outline = "M" + pts.map(([x, y]) => f(x) + " " + f(y)).join(" L") + " Z";
  const hole = (cx, cy, hr) => `M${f(cx - hr)} ${f(cy)} A${f(hr)} ${f(hr)} 0 1 0 ${f(cx + hr)} ${f(cy)} A${f(hr)} ${f(hr)} 0 1 0 ${f(cx - hr)} ${f(cy)} Z`;
  const holes = r > 20 ? Array.from({ length: 5 }, (_, i) => { const a = (i / 5) * Math.PI * 2; return hole(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.17); }).join(" ") : "";
  const shaft = hole(0, 0, r * 0.11);
  const d = `${outline} ${holes} ${shaft}`;
  if (depth) return `<svg class="pr-fill" viewBox="${-s} ${-s} ${2 * s} ${2 * s}" aria-hidden="true"><path d="${d}" fill-rule="evenodd" style="fill:color-mix(in oklch, var(--_brass-mid), #1c140c ${40 + depth * 12}%)"/></svg>`;
  return `<svg class="pr-fill" viewBox="${-s} ${-s} ${2 * s} ${2 * s}" aria-hidden="true">
  <defs>
    <radialGradient id="${id}" cx="0" cy="0" r="${rt}" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color:var(--_brass-light)"/><stop offset=".55" style="stop-color:var(--_brass)"/><stop offset=".88" style="stop-color:var(--_brass-mid)"/><stop offset="1" style="stop-color:var(--_brass-dark)"/></radialGradient>
    <clipPath id="${id}c"><path d="${d}" clip-rule="evenodd"/></clipPath>
  </defs>
  <path d="${d}" fill-rule="evenodd" fill="url(#${id})"/>
  <g clip-path="url(#${id}c)">
    <circle r="${f(rr - 2.6)}" fill="none" style="stroke:var(--_brass-dark)" stroke-opacity=".45" stroke-width="1.2"/>
    <circle r="${f(rr - 3.4)}" fill="none" stroke="#fffaf0" stroke-opacity=".25" stroke-width=".5"/>
    <circle r="${f(r * 0.27)}" style="fill:var(--_brass-light)" opacity=".55"/>
    <circle r="${f(r * 0.27)}" fill="none" style="stroke:var(--_brass-dark)" stroke-opacity=".5" stroke-width=".5"/>
  </g>
  <path d="${d}" fill="none" fill-rule="evenodd" style="stroke:var(--_brass-dark)" stroke-opacity=".5" stroke-width=".4"/>
</svg>`;
}

/** Brass gooseneck crank arm along +x from the shaft (box 100 × 100, shaft at the centre). */
export function crankArmSvg(dark = false) {
  const R = CRANK.r, id = uid("pra");
  const top = [], bot = [];
  for (let j = 0; j <= 18; j++) {
    const t = j / 18, x = t * R, y = Math.sin(t * Math.PI) * -2.2;
    const w = 4.6 - 1.6 * t;
    top.push([x, y - w]); bot.push([x, y + w]);
  }
  const shape = "M" + [...top, ...bot.reverse()].map(([x, y]) => f(x) + " " + f(y)).join(" L") + " Z";
  if (dark) return `<svg class="pr-fill" viewBox="-50 -50 100 100" aria-hidden="true"><path d="${shape}" style="fill:color-mix(in oklch, var(--_brass-mid), #1c140c 60%)"/><circle r="8.5" style="fill:color-mix(in oklch, var(--_brass-mid), #1c140c 60%)"/><circle cx="${R}" r="5.6" style="fill:color-mix(in oklch, var(--_brass-mid), #1c140c 60%)"/></svg>`;
  return `<svg class="pr-fill" viewBox="-50 -50 100 100" aria-hidden="true">
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--_brass-light)"/><stop offset=".4" style="stop-color:var(--_brass)"/><stop offset="1" style="stop-color:var(--_brass-dark)"/></linearGradient></defs>
  <path d="${shape}" fill="url(#${id})" style="stroke:var(--_brass-dark)" stroke-opacity=".55" stroke-width=".4"/>
  <circle r="8.4" fill="url(#${id})" style="stroke:var(--_brass-dark)" stroke-opacity=".55" stroke-width=".4"/>
  <circle cx="${R}" r="5.4" fill="url(#${id})" style="stroke:var(--_brass-dark)" stroke-opacity=".55" stroke-width=".4"/>
  <path d="M4 -4 C${R * 0.4} -6.2 ${R * 0.7} -5 ${R - 3} -3.6" fill="none" stroke="#fffaf0" stroke-opacity=".35" stroke-width=".7" stroke-linecap="round"/>
</svg>`;
}

/** Brass maker's plate (side of the base). */
export function plateSvg(label, sublabel, w, h) {
  const id = uid("prp");
  return `<svg class="pr-fill" viewBox="0 0 ${f(w)} ${f(h)}" aria-hidden="true">
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--_brass-hi)"/><stop offset=".3" style="stop-color:var(--_brass-light)"/><stop offset=".55" style="stop-color:var(--_brass)"/><stop offset="1" style="stop-color:var(--_brass-dark)"/></linearGradient></defs>
  <rect x=".5" y=".5" width="${f(w - 1)}" height="${f(h - 1)}" rx="1.6" fill="url(#${id})" stroke="#3a2408" stroke-opacity=".5" stroke-width=".5"/>
  <rect x="2.2" y="2.2" width="${f(w - 4.4)}" height="${f(h - 4.4)}" rx="1" fill="none" stroke="#3a2408" stroke-opacity=".55" stroke-width=".4"/>
  ${[[3.6, h / 2], [w - 3.6, h / 2]].map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r=".9" fill="#5a3d14"/>`).join("")}
  ${label ? `<text x="${f(w / 2)}" y="${f(h * (sublabel ? 0.55 : 0.68))}" text-anchor="middle" font-family="Didot, 'Bodoni 72', 'Playfair Display', Georgia, 'Times New Roman', serif" font-weight="600" font-size="${f(h * (sublabel ? 0.44 : 0.52))}" letter-spacing="1.1" fill="#3b2508">${esc(label)}</text>` : ""}
  ${sublabel ? `<text x="${f(w / 2)}" y="${f(h * 0.83)}" text-anchor="middle" font-family="Georgia, serif" font-size="${f(h * 0.19)}" letter-spacing="1.2" fill="#3b2508" opacity=".85">${esc(sublabel)}</text>` : ""}
</svg>`;
}

/** Brass pinstripe and rivets on a base face. */
export function stripeSvg(w, h, { top = 2.4, bottom = null } = {}) {
  return `<svg class="pr-fill" viewBox="0 0 ${f(w)} ${f(h)}" preserveAspectRatio="none" aria-hidden="true">
  <path d="M5 ${top} H${f(w - 5)}" style="stroke:var(--_brass)" stroke-width=".6" opacity=".8"/>
  ${bottom != null ? `<path d="M5 ${f(h - bottom)} H${f(w - 5)}" style="stroke:var(--_brass)" stroke-width=".45" opacity=".55"/>` : ""}
</svg>`;
}

/** Guide plate between the rollers and the base front. */
export function guideSvg(w, h) {
  const id = uid("prgp");
  return `<svg class="pr-fill" viewBox="0 0 ${f(w)} ${f(h)}" preserveAspectRatio="none" aria-hidden="true">
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2=".3"><stop offset="0" style="stop-color:var(--_brass-dark)"/><stop offset=".22" style="stop-color:var(--_brass)"/><stop offset=".34" style="stop-color:var(--_brass-hi)"/><stop offset=".42" style="stop-color:var(--_brass-light)"/><stop offset=".62" style="stop-color:var(--_brass-mid)"/><stop offset=".85" style="stop-color:var(--_brass)"/><stop offset="1" style="stop-color:var(--_brass-dark)"/></linearGradient></defs>
  <rect width="${f(w)}" height="${f(h)}" rx="2" fill="url(#${id})"/>
  <rect x="1.5" y="0" width="${f(w - 3)}" height="${f(h - 1.2)}" rx="1.5" fill="none" stroke="#3a2408" stroke-opacity=".35" stroke-width=".5"/>
  ${[[4, 5], [w - 4, 5], [4, h - 5], [w - 4, h - 5]].map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="1.05" fill="#5a3d14" opacity=".8"/>`).join("")}
  <path d="M0 ${f(h - 0.8)} H${f(w)}" stroke="#fff3d0" stroke-opacity=".6" stroke-width=".9"/>
</svg>`;
}

/** Projected circle (for hit areas). */
export function circlePathX(P, x, y, z, r, n = 40) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push(P.proj(x, y + Math.cos(t) * r, z + Math.sin(t) * r));
  }
  return poly(pts);
}
export { poly };
