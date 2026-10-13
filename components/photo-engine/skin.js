// Skin loader: reads a skin's web/manifest.json and hands out layer sources.
// A skin only supplies pictures + coordinates; it never contains behaviour.

const cache = new Map();

export const DEFAULT_SKIN_URL = new URL(
  "../../skins/neutral-camera-v1/web/manifest.json",
  import.meta.url
).href;

export function loadSkin(url = DEFAULT_SKIN_URL) {
  const href = new URL(url, document.baseURI).href;
  if (!cache.has(href)) {
    cache.set(
      href,
      fetch(href)
        .then((r) => {
          if (!r.ok) throw new Error(`Skin manifest ${href} → HTTP ${r.status}`);
          return r.json();
        })
        .then((manifest) => createSkin(manifest, href))
        .catch((err) => {
          cache.delete(href);
          throw err;
        })
    );
  }
  return cache.get(href);
}

function createSkin(manifest, href) {
  const base = new URL(".", href);
  const { pattern, scales } = manifest.files;
  const file = (name, scale) => new URL(pattern.replace("{name}", name).replace("{scale}", scale), base).href;

  return {
    manifest,
    layout: manifest.layout,
    artboard: manifest.layout.artboard,
    /** Visible stage: the artboard, optionally cropped at the bottom (same origin). */
    stage: manifest.stage || manifest.layout.artboard,
    film: manifest.layout.film,
    has: (name) => name in manifest.layers,
    /** Box of a camera layer in artboard @1x units. */
    box: (name) => manifest.layers[name],
    /** srcset entries for an image whose @1x width is `w`. */
    srcset(name, w) {
      return scales.map((s) => `${file(name, s)} ${Math.round(w * s)}w`).join(", ");
    },
    src: (name, scale = scales[scales.length - 1]) => file(name, scale),
    asset: (rel) => new URL(rel, base).href,
    filmPaper: manifest.film.paper,
    filmShadow: manifest.film.shadow,
    filmGloss: manifest.film.gloss,
    developTexture: new URL(manifest.film.developTexture, base).href,
  };
}
