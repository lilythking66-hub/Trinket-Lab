export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    if (!src) return reject(new Error("PhotoRecipe.image is required"));
    if (src instanceof HTMLImageElement && src.complete && src.naturalWidth) return resolve(src);
    const img = new Image();
    img.decoding = "async";
    // same-origin and blob/data URLs need nothing; remote images need CORS to be exportable
    if (typeof src === "string" && /^https?:/.test(src) && new URL(src).origin !== location.origin) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image: ${String(src).slice(0, 120)}`));
    img.src = src instanceof HTMLImageElement ? src.src : src;
  });
}

export function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** Percent of a total, as a CSS string. */
export const pct = (v, total) => `${((v / total) * 100).toFixed(4)}%`;

export function el(tag, cls, attrs = {}) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "style") Object.assign(n.style, v);
    else if (k === "text") n.textContent = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  return n;
}
