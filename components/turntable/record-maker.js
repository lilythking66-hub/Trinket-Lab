// Local music → record. Independent of the turntable element so other
// trinkets (radio, cassette, jukebox…) can reuse the same pipeline.
//
//   const record = await createRecord(file);      // File from <input> / drop
//   const record = await createRecord({ src, title, artist, cover });

import { readAudioMetadata } from "./metadata.js";
import { extractPalette, fallbackPalette, loadImage, forgetImage } from "./record-art.js";

export const AUDIO_ACCEPT = "audio/*,.mp3,.m4a,.aac,.mp4,.flac,.ogg,.oga,.opus,.wav,.webm";
const AUDIO_EXT = /\.(mp3|m4a|m4b|aac|mp4|flac|ogg|oga|opus|wav|wave|webm|aif|aiff)$/i;

export const isAudioFile = (file) => !!file && (/^audio\//.test(file.type) || AUDIO_EXT.test(file.name || ""));

const uid = () => globalThis.crypto?.randomUUID?.() ?? "rec-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/**
 * Build a record from a File/Blob or a plain description.
 *
 * Record shape (all optional except src):
 *   id, src, title, artist, album, year, track, genre,
 *   cover        image URL (object URL for embedded art)
 *   coverBlob    the embedded image, if any (useful for persistence)
 *   file         the original File, if any
 *   palette      { base, ink, light } label colours
 *   vinyl        vinyl colour, default black
 *   duration     seconds, when known
 *   envelope     loudness per groove band (0–1), when analysed
 *   meta         anything the host wants to carry along
 */
export async function createRecord(input, { palette = true } = {}) {
  let record;
  if (input instanceof Blob) {
    const tags = await readAudioMetadata(input);
    record = {
      id: uid(),
      src: URL.createObjectURL(input),
      file: input,
      title: tags.title,
      artist: tags.artist,
      album: tags.album,
      year: tags.year,
      track: tags.track,
      genre: tags.genre,
      format: tags.format,
      coverBlob: tags.picture,
      cover: tags.picture ? URL.createObjectURL(tags.picture) : null,
      _owned: true,
    };
  } else if (input && typeof input === "object") {
    record = { id: uid(), ...input };
    if (record.cover instanceof Blob) {
      record.coverBlob = record.cover;
      record.cover = URL.createObjectURL(record.cover);
      record._ownsCover = true;
    }
    if (record.src instanceof Blob) {
      record.file = record.src;
      record.src = URL.createObjectURL(record.src);
      record._owned = true;
    }
    if (!record.title && record.src) record.title = decodeURIComponent(String(record.src).split(/[?#]/)[0].split("/").pop() || "Untitled").replace(/\.[a-z0-9]+$/i, "");
  } else {
    throw new TypeError("createRecord expects a File/Blob or a record object");
  }

  if (palette && !record.palette) {
    const img = record.cover ? await loadImage(record.coverBlob || record.cover) : null;
    record.palette = (img && extractPalette(img)) || fallbackPalette(record);
  }
  return record;
}

/** Release object URLs created by createRecord. */
export function releaseRecord(record) {
  if (!record) return;
  if (record._owned && record.src?.startsWith?.("blob:")) URL.revokeObjectURL(record.src);
  if ((record._owned || record._ownsCover) && record.cover?.startsWith?.("blob:")) URL.revokeObjectURL(record.cover);
  if (record.coverBlob) forgetImage(record.coverBlob);
  if (record.cover) forgetImage(record.cover);
}

/** Turn a FileList / array / DataTransfer into records (non-audio files are skipped). */
export async function createRecords(files, options) {
  const list = files?.files ? [...files.files] : files?.items ? [...files.items].map((i) => i.getAsFile?.()).filter(Boolean) : [...(files || [])];
  const out = [];
  for (const f of list) if (isAudioFile(f)) out.push(await createRecord(f, options));
  return out;
}

/** Read the duration of a record's audio (seconds), without playing it. */
export function probeDuration(record, timeout = 8000) {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = "metadata";
    const done = (v) => { clearTimeout(t); a.removeAttribute("src"); a.load(); resolve(v); };
    const t = setTimeout(() => done(null), timeout);
    a.addEventListener("loadedmetadata", () => done(Number.isFinite(a.duration) ? a.duration : null), { once: true });
    a.addEventListener("error", () => done(null), { once: true });
    a.src = record.src;
  });
}

/**
 * Loudness envelope used to press the grooves (quiet passages show as
 * darker bands, like a real LP). Decodes the whole file, so it's skipped
 * for very large files. Resolves to an array of 0–1 values or null.
 */
export async function analyzeEnvelope(record, { bins = 180, maxBytes = 60 * 1024 * 1024 } = {}) {
  try {
    let buf;
    if (record.file) {
      if (record.file.size > maxBytes) return null;
      buf = await record.file.arrayBuffer();
    } else if (record.src) {
      const res = await fetch(record.src);
      if (!res.ok) return null;
      buf = await res.arrayBuffer();
      if (buf.byteLength > maxBytes) return null;
    } else return null;
    const AC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    if (!AC) return null;
    const ctx = new AC(1, 1, 22050);
    const audio = await ctx.decodeAudioData(buf);
    const ch = audio.getChannelData(0);
    const per = Math.max(1, Math.floor(ch.length / bins));
    const out = new Array(bins).fill(0);
    let max = 1e-6;
    for (let b = 0; b < bins; b++) {
      let sum = 0;
      const start = b * per;
      const stride = Math.max(1, Math.floor(per / 2000));
      let n = 0;
      for (let i = start; i < start + per && i < ch.length; i += stride) { sum += ch[i] * ch[i]; n++; }
      out[b] = Math.sqrt(sum / Math.max(1, n));
      if (out[b] > max) max = out[b];
    }
    return out.map((v) => Math.min(1, v / max));
  } catch {
    return null;
  }
}
