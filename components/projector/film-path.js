// A fixed, smooth film track. Waypoints are joined with a Catmull-Rom spline,
// sampled into a polyline and indexed by arc length, so frames can be placed
// at any distance along the track. No DOM.

export function createFilmPath(points, { samplesPerSegment = 48 } = {}) {
  const pts = points.map((p) => ({ x: p.x, y: p.y }));
  const out = [];
  // centripetal Catmull-Rom (no cusps or loops on uneven spacing)
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    const t01 = Math.pow(dist(p0, p1) || 1e-3, 0.5);
    const t12 = Math.pow(dist(p1, p2) || 1e-3, 0.5);
    const t23 = Math.pow(dist(p2, p3) || 1e-3, 0.5);
    const m1 = {
      x: p2.x - p1.x + t12 * ((p1.x - p0.x) / t01 - (p2.x - p0.x) / (t01 + t12)),
      y: p2.y - p1.y + t12 * ((p1.y - p0.y) / t01 - (p2.y - p0.y) / (t01 + t12)),
    };
    const m2 = {
      x: p2.x - p1.x + t12 * ((p3.x - p2.x) / t23 - (p3.x - p1.x) / (t12 + t23)),
      y: p2.y - p1.y + t12 * ((p3.y - p2.y) / t23 - (p3.y - p1.y) / (t12 + t23)),
    };
    for (let k = 0; k < samplesPerSegment; k++) {
      const t = k / samplesPerSegment, t2 = t * t, t3 = t2 * t;
      const a = 2 * t3 - 3 * t2 + 1, b = t3 - 2 * t2 + t, c = -2 * t3 + 3 * t2, d = t3 - t2;
      out.push({ x: a * p1.x + b * m1.x + c * p2.x + d * m2.x, y: a * p1.y + b * m1.y + c * p2.y + d * m2.y });
    }
  }
  out.push({ ...pts[pts.length - 1] });

  const len = [0];
  for (let i = 1; i < out.length; i++) len.push(len[i - 1] + dist(out[i - 1], out[i]));
  const total = len[len.length - 1];

  function locate(s) {
    s = Math.max(0, Math.min(total, s));
    let lo = 0, hi = len.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (len[mid] <= s) lo = mid; else hi = mid;
    }
    const span = len[hi] - len[lo] || 1;
    return { i: lo, t: (s - len[lo]) / span };
  }

  /** Point and tangent angle (radians) at arc length s; extrapolates past the ends. */
  function at(s) {
    if (s < 0 || s > total) {
      const end = s < 0 ? at(0) : at(total);
      const d = s < 0 ? s : s - total;
      return { x: end.x + Math.cos(end.angle) * d, y: end.y + Math.sin(end.angle) * d, angle: end.angle };
    }
    const { i, t } = locate(s);
    const a = out[i], b = out[Math.min(out.length - 1, i + 1)];
    const ia = Math.max(0, i - 1), ib = Math.min(out.length - 1, i + 2);
    const angle = Math.atan2(out[ib].y - out[ia].y, out[ib].x - out[ia].x);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle };
  }

  /** The polyline shifted sideways by d (positive = left of travel). */
  function offsetLine(d) {
    return out.map((p, i) => {
      const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)];
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      return { x: p.x + Math.sin(ang) * d, y: p.y - Math.cos(ang) * d };
    });
  }

  /** Arc length of the sample closest to (x, y). */
  function nearest(x, y) {
    let best = Infinity, bi = 0;
    for (let i = 0; i < out.length; i += 2) {
      const d = (out[i].x - x) ** 2 + (out[i].y - y) ** 2;
      if (d < best) { best = d; bi = i; }
    }
    return { s: len[bi], distance: Math.sqrt(best) };
  }

  return { points: out, total, at, offsetLine, nearest, d: toSvgPath(out) };
}

export function toSvgPath(points) {
  if (!points.length) return "";
  const r = (n) => Math.round(n * 10) / 10;
  return "M" + points.map((p) => r(p.x) + " " + r(p.y)).join(" L");
}

const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
