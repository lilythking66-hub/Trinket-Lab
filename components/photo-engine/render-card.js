// Renders a finished instant photo (paper + image + caption) to a canvas,
// for "save" / "share" / host-side albums.

import { loadImage } from "./util.js";

/**
 * @param {object} skin   loaded skin
 * @param {object} recipe PhotoRecipe
 * @param {object} [opts] { scale = 3, image?: HTMLImageElement (already loaded) }
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderCard(skin, recipe, opts = {}) {
  const scale = opts.scale ?? 3;
  const f = skin.film;
  const W = f.card.w * scale, H = f.card.h * scale;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext("2d");

  const paperSrc = recipe.frame || skin.src(skin.filmPaper, 3);
  const [paper, image, gloss, stamp] = await Promise.all([
    loadImage(paperSrc),
    opts.image || loadImage(recipe.image),
    loadImage(skin.src(skin.filmGloss, 3)),
    recipe.stamp ? loadImage(recipe.stamp).catch(() => null) : null,
  ]);
  g.drawImage(paper, 0, 0, W, H);

  const win = f.photoWindow;
  const wx = win.x * scale, wy = win.y * scale, ww = win.w * scale, wh = win.h * scale;
  const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
  const k = Math.max(ww / iw, wh / ih);
  const sw = ww / k, sh = wh / k;
  g.drawImage(image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, wx, wy, ww, wh);
  // hairline where the paper overlaps the film
  const grad = g.createLinearGradient(0, wy, 0, wy + 3 * scale);
  grad.addColorStop(0, "rgba(0,0,0,0.16)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(wx, wy, ww, 3 * scale);
  g.drawImage(gloss, 0, 0, W, H);

  const cap = f.captionArea;
  const font = (f.captionFont || "cursive").replace(/"/g, "'");
  if (recipe.caption) {
    const size = Math.round(cap.h * 0.56 * scale);
    try { await document.fonts?.load(`${size}px ${font}`); } catch {}
    g.font = `${size}px ${font}`;
    g.fillStyle = "#4a4743";
    g.textBaseline = "middle";
    g.fillText(recipe.caption, (cap.x + 4) * scale, (cap.y + cap.h / 2) * scale, (cap.w * 0.72) * scale);
  }
  if (recipe.date) {
    const size = Math.round(cap.h * 0.3 * scale);
    g.font = `${size}px ui-monospace, Menlo, monospace`;
    g.fillStyle = "rgba(74,71,67,0.65)";
    g.textAlign = "right";
    g.textBaseline = "middle";
    g.fillText(recipe.date, (cap.x + cap.w - 2) * scale, (cap.y + cap.h / 2) * scale);
    g.textAlign = "left";
  }
  if (stamp) {
    const s = cap.h * 1.25 * scale;
    g.globalAlpha = 0.9;
    g.drawImage(stamp, (cap.x + cap.w) * scale - s, (win.y + win.h) * scale - s * 0.55, s, s);
    g.globalAlpha = 1;
  }
  return canvas;
}

export function canvasToBlob(canvas, type = "image/png", quality) {
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), type, quality)
  );
}
