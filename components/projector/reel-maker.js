// Local photos → a reel of frames, local video → a clip. Everything stays on
// the device: files become object URLs, and each photo also gets a small
// thumbnail for the film strip. Usable without the
// projector (a photo booth, a slideshow, a contact sheet…).

export const IMAGE_ACCEPT = "image/*,.jpg,.jpeg,.png,.webp,.gif,.avif,.bmp";
export const VIDEO_ACCEPT = "video/mp4,video/*,.mp4,.m4v,.mov,.webm";

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|bmp|svg)$/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|ogv)$/i;
let seq = 0;
const uid = (p) => p + "-" + Date.now().toString(36) + "-" + (++seq).toString(36);

export const isImageFile = (f) => !!f && (/^image\//.test(f.type || "") || IMAGE_EXT.test(f.name || "")) && !/heic|heif/i.test(f.type || f.name || "");
export const isVideoFile = (f) => !!f && (/^video\//.test(f.type || "") || VIDEO_EXT.test(f.name || ""));

/** "probably" / "maybe" / "" — whether this browser can play H.264 MP4. */
export function canPlayH264() {
  if (typeof document === "undefined") return "";
  const v = document.createElement("video");
  return v.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"') || v.canPlayType('video/mp4; codecs="avc1.42E01E"');
}

/**
 * Make one frame. Accepts a File/Blob, a URL string, or an object with
 * { src, thumb?, title?, … } (extra fields pass through untouched).
 */
export async function createFrame(input, { thumbSize = 640 } = {}) {
  if (!input) throw new Error("No image");
  let frame;
  if (input instanceof Blob) {
    const src = URL.createObjectURL(input);
    frame = { id: uid("frame"), src, title: stripExt(input.name || ""), file: input, owned: [src] };
  } else if (typeof input === "string") {
    frame = { id: uid("frame"), src: input, title: "", owned: [] };
  } else {
    frame = { id: input.id || uid("frame"), title: "", ...input, owned: [] };
    if (!frame.src) throw new Error("Frame needs a src");
  }
  const img = await loadImage(frame.src).catch(() => null);
  if (!img) {
    releaseFrame(frame);
    throw new Error("Not a readable image: " + (frame.title || frame.src));
  }
  frame.width = img.naturalWidth || img.width;
  frame.height = img.naturalHeight || img.height;
  frame.aspect = frame.width / frame.height || 4 / 3;
  if (!frame.thumb) {
    const thumb = await makeThumb(img, thumbSize);
    if (thumb) { frame.thumb = thumb; frame.owned.push(thumb); } else frame.thumb = frame.src;
  }
  return frame;
}

/** Many files at once → frames, in the given order. Non-images are skipped. */
export async function createFrames(list, options) {
  const items = [...(list || [])].filter((f) => !(f instanceof Blob) || isImageFile(f));
  const frames = [];
  for (const item of items) {
    try { frames.push(await createFrame(item, options)); } catch (err) { console.warn("[projector]", err.message); }
  }
  return frames;
}

/** A video clip from a File or { src, title }. Metadata is read lazily. */
export function createClip(input) {
  if (!input) throw new Error("No video");
  if (input instanceof Blob) {
    const src = URL.createObjectURL(input);
    return { id: uid("clip"), src, title: stripExt(input.name || "Video"), file: input, type: input.type || "video/mp4", owned: [src] };
  }
  if (typeof input === "string") return { id: uid("clip"), src: input, title: "", owned: [] };
  return { id: input.id || uid("clip"), title: "", ...input, owned: [] };
}

/** Split a mixed FileList into { frames, clip } (first video wins). */
export async function sortFiles(list, options) {
  const files = [...(list || [])];
  const video = files.find(isVideoFile);
  const frames = await createFrames(files.filter(isImageFile), options);
  return { frames, clip: video ? createClip(video) : null };
}

export function releaseFrame(frame) {
  for (const url of frame?.owned || []) URL.revokeObjectURL(url);
  if (frame) frame.owned = [];
}
export const releaseClip = releaseFrame;

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    if (!src) return reject(new Error("no src"));
    const img = new Image();
    img.decoding = "async";
    if (!/^(blob:|data:)/.test(src)) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => {
      if (img.crossOrigin) {
        // retry without CORS: it still displays, it just can't be thumbnailed
        const plain = new Image();
        plain.onload = () => resolve(plain);
        plain.onerror = reject;
        plain.src = src;
      } else reject(new Error("image failed"));
    };
    img.src = src;
  });
}

async function makeThumb(img, size) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  if (!w || !h) return null;
  const k = Math.min(1, size / Math.max(w, h));
  if (k > 0.85) return null; // already small: reuse the original
  try {
    const c = document.createElement("canvas");
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.86));
    return blob ? URL.createObjectURL(blob) : null;
  } catch {
    return null; // tainted canvas (cross-origin without CORS)
  }
}

const stripExt = (name) => name.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_]+/g, " ").trim();
