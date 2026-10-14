// Capsule rendering shared by the globe canvas and the DOM capsules.
// A capsule = coloured opaque cup (bottom) + clear dome (top) + optional thumb.

let probe = null;
const rgbCache = new Map();

/** Resolve any CSS colour to [r, g, b]. */
export function toRgb(color) {
  const key = String(color || "");
  if (rgbCache.has(key)) return rgbCache.get(key);
  let rgb = [226, 87, 76];
  try {
    probe ||= document.createElement("canvas").getContext("2d");
    probe.fillStyle = "#e2574c";
    probe.fillStyle = key;
    const value = probe.fillStyle;
    if (value[0] === "#") {
      rgb = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
    } else {
      const parts = value.match(/[\d.]+/g);
      if (parts) rgb = parts.slice(0, 3).map(Number);
    }
  } catch {}
  rgbCache.set(key, rgb);
  return rgb;
}

export const mix = (rgb, target, t) => rgb.map((c, i) => Math.round(c + (target[i] - c) * t));
export const rgba = (rgb, a = 1) => "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + a + ")";
const WHITE = [255, 255, 255];
const BLACK = [24, 14, 8];

export function capsuleTones(color) {
  const base = toRgb(color);
  return {
    base,
    light: mix(base, WHITE, 0.18),
    dark: mix(base, BLACK, 0.34),
    inner: mix(base, BLACK, 0.28),
    lip: mix(base, WHITE, 0.55),
    tint: mix(base, WHITE, 0.5),
  };
}

const IMAGE_RE = /^(https?:|data:|blob:|\.{0,2}\/)|\.(png|jpe?g|webp|gif|svg|avif)(\?.*)?$/i;
export const isImageThumb = (thumb) => typeof thumb === "string" && IMAGE_RE.test(thumb.trim());

const imageCache = new Map();
const loadListeners = new Set();
/** Called whenever a thumb image finishes loading (so canvases can repaint). */
export function onThumbLoad(fn) {
  loadListeners.add(fn);
  return () => loadListeners.delete(fn);
}
function cachedImage(src) {
  let img = imageCache.get(src);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.onload = () => loadListeners.forEach((fn) => fn());
    img.src = src;
    imageCache.set(src, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

/** Draw one capsule on a 2D canvas, centred at (x, y), in canvas units. */
export function drawCapsule(ctx, x, y, r, angle, color, thumb, alpha = 1) {
  const tone = typeof color === "object" && color.base ? color : capsuleTones(color);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);

  // soft contact darkening behind the capsule
  ctx.beginPath();
  ctx.arc(0, r * 0.08, r * 1.02, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(40,24,14,0.10)";
  ctx.fill();

  ctx.save();
  ctx.rotate(angle);

  // clear dome tint (whole sphere; the cup paints over its lower half)
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = rgba(tone.tint, 0.5);
  ctx.fill();

  // inside of the cup, seen through the clear dome
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.95, r * 0.32, 0, 0, Math.PI * 2);
  ctx.fillStyle = rgba(tone.inner, 0.62);
  ctx.fill();

  if (thumb) drawThumb(ctx, thumb, 0, -r * 0.18, r * 0.92);

  // opaque cup (outer wall below the opening)
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI);
  ctx.ellipse(0, 0, r * 0.97, r * 0.32, 0, Math.PI, 0, true);
  ctx.closePath();
  const cup = ctx.createLinearGradient(0, 0, 0, r);
  cup.addColorStop(0, rgba(tone.light));
  cup.addColorStop(0.42, rgba(tone.base));
  cup.addColorStop(1, rgba(tone.dark));
  ctx.fillStyle = cup;
  ctx.fill();

  // cup lip
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.97, r * 0.32, 0, 0, Math.PI);
  ctx.strokeStyle = rgba(tone.lip, 0.95);
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.stroke();
  ctx.restore();

  // world-space sphere shading (light from the upper left)
  const shade = ctx.createRadialGradient(-r * 0.38, -r * 0.42, r * 0.08, 0, 0, r);
  shade.addColorStop(0, "rgba(255,255,255,0.10)");
  shade.addColorStop(0.62, "rgba(255,255,255,0)");
  shade.addColorStop(1, "rgba(40,22,12,0.30)");
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.045);
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.stroke();

  // specular highlights
  ctx.save();
  ctx.rotate(-0.62);
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.66, r * 0.34, r * 0.12, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(r * 0.45, r * 0.42, r * 0.075, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.38)";
  ctx.fill();

  ctx.restore();
}

function drawThumb(ctx, thumb, x, y, size) {
  if (isImageThumb(thumb)) {
    const img = cachedImage(thumb);
    if (!img) return;
    const ratio = img.naturalWidth / img.naturalHeight || 1;
    const w = ratio >= 1 ? size : size * ratio;
    const h = ratio >= 1 ? size / ratio : size;
    ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
    return;
  }
  ctx.font = Math.round(size * 0.72) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(60,48,40,0.9)";
  ctx.fillText(String(thumb), x, y + size * 0.04);
}

const esc = (value) => String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/**
 * SVG markup for a DOM capsule (viewBox -50 -50 100 100). The top dome and the
 * bottom cup are separate groups so they can be pulled apart.
 */
export function capsuleSvg(color, thumb, uid = "c") {
  const t = capsuleTones(color);
  const c = (rgb, a = 1) => rgba(rgb, a);
  const thumbMarkup = !thumb ? "" : isImageThumb(thumb)
    ? '<image href="' + esc(thumb) + '" x="-27" y="-40" width="54" height="54" preserveAspectRatio="xMidYMid meet"/>'
    : '<text x="0" y="-11" text-anchor="middle" dominant-baseline="central" font-size="40" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,system-ui,sans-serif">' + esc(thumb) + "</text>";
  return (
    '<svg class="tg-capsule-svg" viewBox="-56 -56 112 112" aria-hidden="true">' +
    "<defs>" +
    '<linearGradient id="' + uid + '-cup" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="' + c(t.light) + '"/><stop offset=".42" stop-color="' + c(t.base) + '"/><stop offset="1" stop-color="' + c(t.dark) + '"/></linearGradient>' +
    '<radialGradient id="' + uid + '-shade" cx=".31" cy=".29" r=".75">' +
    '<stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".62" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#28160c" stop-opacity=".3"/></radialGradient>' +
    '<radialGradient id="' + uid + '-dome" cx=".35" cy=".3" r=".8">' +
    '<stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".55" stop-color="' + c(t.tint) + '" stop-opacity=".32"/><stop offset="1" stop-color="' + c(t.dark) + '" stop-opacity=".28"/></radialGradient>' +
    '<clipPath id="' + uid + '-lower"><rect x="-56" y="0" width="112" height="56"/></clipPath>' +
    '<clipPath id="' + uid + '-upper"><rect x="-56" y="-56" width="112" height="56"/></clipPath>' +
    "</defs>" +
    '<g class="tg-cap-bottom">' +
    '<ellipse cx="0" cy="0" rx="45" ry="15" fill="' + c(t.inner, 0.8) + '"/>' +
    thumbMarkup +
    '<path d="M-46 0 A46 46 0 0 0 46 0 A46 15 0 0 1 -46 0Z" fill="url(#' + uid + '-cup)"/>' +
    '<g clip-path="url(#' + uid + '-lower)"><circle r="46" fill="url(#' + uid + '-shade)"/></g>' +
    '<path d="M-45 1 A45 15 0 0 0 45 1" fill="none" stroke="' + c(t.lip) + '" stroke-width="3"/>' +
    '<circle cx="21" cy="20" r="3.4" fill="#fff" opacity=".38"/>' +
    "</g>" +
    '<g class="tg-cap-top">' +
    '<path d="M-46 0 A46 46 0 0 1 46 0 A46 15 0 0 1 -46 0Z" fill="url(#' + uid + '-dome)"/>' +
    '<g clip-path="url(#' + uid + '-upper)"><circle r="46" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2"/></g>' +
    '<path d="M-46 0 A46 15 0 0 0 46 0" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.6"/>' +
    '<ellipse cx="-17" cy="-30" rx="15" ry="5.5" transform="rotate(-35 -17 -30)" fill="#fff" opacity=".85"/>' +
    '<ellipse cx="22" cy="-27" rx="4" ry="2.2" transform="rotate(40 22 -27)" fill="#fff" opacity=".55"/>' +
    "</g>" +
    '<g clip-path="url(#' + uid + '-lower)" class="tg-cap-rim"><circle r="46" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="2"/></g>' +
    "</svg>"
  );
}
