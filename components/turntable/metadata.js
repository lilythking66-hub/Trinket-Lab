// Read title / artist / album / cover art from a local audio file.
// No dependencies, no network. Supports:
//   MP3 (ID3v2.2 / 2.3 / 2.4 + ID3v1), M4A / MP4 / AAC (iTunes ilst),
//   FLAC (Vorbis comments + PICTURE), OGG Vorbis / Opus, WAV (LIST INFO + id3 chunk).
// Anything it can't read falls back to the file name ("Artist - Title.mp3").

const MAX_TAG_BYTES = 24 * 1024 * 1024;

async function bytes(blob, start, length) {
  const end = Math.min(blob.size, start + length);
  if (start >= end) return new Uint8Array(0);
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

const ascii = (b, start, len) => {
  let s = "";
  for (let i = start; i < start + len && i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};
const u32be = (b, i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const u32le = (b, i) => b[i] + (b[i + 1] << 8) + (b[i + 2] << 16) + ((b[i + 3] << 24) >>> 0);
const u24be = (b, i) => (b[i] << 16) + (b[i + 1] << 8) + b[i + 2];
const syncsafe = (b, i) => (b[i] & 0x7f) * 0x200000 + (b[i + 1] & 0x7f) * 0x4000 + (b[i + 2] & 0x7f) * 0x80 + (b[i + 3] & 0x7f);

const decoders = {};
function decoder(label) {
  if (!(label in decoders)) {
    try { decoders[label] = new TextDecoder(label, { fatal: true }); } catch { decoders[label] = null; }
  }
  return decoders[label];
}
function tryDecode(label, b) {
  const d = decoder(label);
  if (!d) return null;
  try { return d.decode(b); } catch { return null; }
}

/**
 * "Latin-1" tags are very often really UTF-8 or a legacy CJK code page
 * (GBK / Big5 / Shift-JIS), especially in Chinese MP3s. Pick the most plausible.
 */
export function decodeLegacy(b) {
  let high = false;
  for (let i = 0; i < b.length; i++) if (b[i] > 0x7f) { high = true; break; }
  if (!high) return ascii(b, 0, b.length);
  const utf8 = tryDecode("utf-8", b);
  if (utf8 !== null) return utf8;
  const locale = (globalThis.navigator?.language || "").toLowerCase();
  const order = locale.startsWith("zh-tw") || locale.startsWith("zh-hk") ? ["big5", "gb18030", "shift_jis"]
    : locale.startsWith("ja") ? ["shift_jis", "gb18030", "big5"]
    : ["gb18030", "big5", "shift_jis"];
  // Only accept a CJK reading when the bytes look like double-byte text.
  const pairs = countHighPairs(b);
  if (pairs.ratio > 0.8) {
    for (const label of order) {
      const s = tryDecode(label, b);
      if (s !== null && /[぀-ヿ㐀-鿿가-힯]/.test(s)) return s;
    }
  }
  return tryDecode("windows-1252", b) ?? ascii(b, 0, b.length);
}
function countHighPairs(b) {
  let leads = 0, paired = 0;
  for (let i = 0; i < b.length; i++) {
    if (b[i] > 0x7f) {
      leads++;
      if (i + 1 < b.length && b[i + 1] >= 0x40) { paired++; i++; }
    }
  }
  return { ratio: leads ? paired / leads : 0 };
}

const clean = (s) => (s || "").replace(/\0+$/g, "").replace(/\0/g, " / ").trim();

function decodeText(enc, b) {
  if (!b.length) return "";
  switch (enc) {
    case 0: return clean(decodeLegacy(trimNul(b, 1)));
    case 1: {
      // UTF-16 with BOM (may contain several BOM-prefixed values)
      let le = true, start = 0;
      if (b[0] === 0xfe && b[1] === 0xff) { le = false; start = 2; } else if (b[0] === 0xff && b[1] === 0xfe) start = 2;
      return clean(new TextDecoder(le ? "utf-16le" : "utf-16be").decode(trimNul(b.subarray(start), 2)).replace(/﻿/g, ""));
    }
    case 2: return clean(new TextDecoder("utf-16be").decode(trimNul(b, 2)));
    case 3: return clean(new TextDecoder("utf-8").decode(trimNul(b, 1)));
    default: return clean(decodeLegacy(b));
  }
}
function trimNul(b, width) {
  let end = b.length;
  while (end >= width && b[end - 1] === 0 && (width === 1 || b[end - 2] === 0)) end -= width;
  return b.subarray(0, end);
}
/** Find the end of a NUL-terminated string in the given encoding. */
function nulEnd(b, start, enc) {
  if (enc === 1 || enc === 2) {
    for (let i = start; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return i;
    return b.length;
  }
  const i = b.indexOf(0, start);
  return i < 0 ? b.length : i;
}

function removeUnsync(b) {
  const out = new Uint8Array(b.length);
  let j = 0;
  for (let i = 0; i < b.length; i++) {
    out[j++] = b[i];
    if (b[i] === 0xff && b[i + 1] === 0x00) i++;
  }
  return out.subarray(0, j);
}

function sniffImage(b) {
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49) return "image/gif";
  if (ascii(b, 8, 4) === "WEBP") return "image/webp";
  if (b[0] === 0x42 && b[1] === 0x4d) return "image/bmp";
  return null;
}
function picture(data, mime) {
  const type = sniffImage(data) || (mime && mime.includes("/") ? mime : mime ? "image/" + mime.toLowerCase().replace("jpg", "jpeg") : "image/jpeg");
  return new Blob([data], { type });
}

/* ------------------------------------------------------------------ ID3v2 */

const ID3_FIELDS = {
  TIT2: "title", TT2: "title",
  TPE1: "artist", TP1: "artist",
  TALB: "album", TAL: "album",
  TPE2: "albumArtist", TP2: "albumArtist",
  TYER: "year", TYE: "year", TDRC: "year", TDOR: "year",
  TRCK: "track", TRK: "track",
  TCON: "genre", TCO: "genre",
};

export function parseId3v2(b) {
  if (ascii(b, 0, 3) !== "ID3") return null;
  const major = b[3];
  const flags = b[5];
  const size = syncsafe(b, 6);
  let body = b.subarray(10, Math.min(b.length, 10 + size));
  if (flags & 0x80 && major < 4) body = removeUnsync(body);
  let pos = 0;
  if (flags & 0x40) {
    if (major === 3) pos = 4 + u32be(body, 0);
    else if (major === 4) pos = syncsafe(body, 0);
  }

  const tags = {};
  const pictures = [];
  const idLen = major === 2 ? 3 : 4;
  const headLen = major === 2 ? 6 : 10;

  while (pos + headLen <= body.length) {
    const id = ascii(body, pos, idLen);
    if (!/^[A-Z0-9]{3,4}$/.test(id)) break;
    let fsize = major === 2 ? u24be(body, pos + 3) : major === 4 ? syncsafe(body, pos + 4) : u32be(body, pos + 4);
    // iTunes once wrote v2.4 sizes without syncsafe encoding.
    if (major === 4 && fsize > 0x7f) {
      const plain = u32be(body, pos + 4);
      const nextSync = pos + headLen + fsize, nextPlain = pos + headLen + plain;
      const okFrame = (at) => at === body.length || (at + 4 <= body.length && (/^[A-Z0-9]{4}$/.test(ascii(body, at, 4)) || body[at] === 0));
      if (!okFrame(nextSync) && okFrame(nextPlain)) fsize = plain;
    }
    const fflags = major === 2 ? 0 : body[pos + 9];
    let data = body.subarray(pos + headLen, pos + headLen + fsize);
    pos += headLen + fsize;
    if (fsize <= 0) continue;

    if (major === 4) {
      if (fflags & 0x0c) continue; // compressed / encrypted
      if (fflags & 0x01) data = data.subarray(4); // data length indicator
      if (fflags & 0x02) data = removeUnsync(data);
    } else if (major === 3) {
      if (fflags & 0xc0) continue;
      if (fflags & 0x20) data = data.subarray(1);
    }

    if (ID3_FIELDS[id] && !tags[ID3_FIELDS[id]]) {
      tags[ID3_FIELDS[id]] = decodeText(data[0], data.subarray(1));
    } else if (id === "APIC" || id === "PIC") {
      const enc = data[0];
      let i = 1, mime;
      if (id === "PIC") { mime = ascii(data, 1, 3); i = 4; } else {
        const e = data.indexOf(0, 1);
        mime = ascii(data, 1, e - 1);
        i = e + 1;
      }
      const kind = data[i];
      const descEnd = nulEnd(data, i + 1, enc);
      const start = descEnd + (enc === 1 || enc === 2 ? 2 : 1);
      const img = data.subarray(start);
      if (img.length > 16) pictures.push({ kind, blob: picture(img, mime) });
    }
  }
  if (tags.genre) tags.genre = tags.genre.replace(/^\((\d+)\)/, "").trim() || tags.genre;
  if (tags.year) tags.year = tags.year.slice(0, 4);
  const front = pictures.find((p) => p.kind === 3) || pictures[0];
  return { ...tags, picture: front?.blob || null };
}

export function parseId3v1(b) {
  if (b.length < 128 || ascii(b, b.length - 128, 3) !== "TAG") return null;
  const t = b.subarray(b.length - 128);
  const field = (s, l) => clean(decodeLegacy(trimNul(t.subarray(s, s + l), 1)).replace(/\s+$/, ""));
  return { title: field(3, 30), artist: field(33, 30), album: field(63, 30), year: field(93, 4) };
}

/* -------------------------------------------------------- Vorbis comments */

const VORBIS_FIELDS = { TITLE: "title", ARTIST: "artist", ALBUM: "album", ALBUMARTIST: "albumArtist", "ALBUM ARTIST": "albumArtist", DATE: "year", YEAR: "year", TRACKNUMBER: "track", GENRE: "genre" };

function parseVorbisComment(b, start = 0) {
  const tags = {};
  let pictureBlob = null;
  let i = start;
  const vlen = u32le(b, i); i += 4 + vlen;
  const count = u32le(b, i); i += 4;
  const utf8 = new TextDecoder("utf-8");
  for (let n = 0; n < count && i + 4 <= b.length; n++) {
    const len = u32le(b, i); i += 4;
    const entry = b.subarray(i, i + len); i += len;
    const eq = entry.indexOf(0x3d);
    if (eq < 0) continue;
    const key = ascii(entry, 0, eq).toUpperCase();
    if (key === "METADATA_BLOCK_PICTURE" || key === "COVERART") {
      if (pictureBlob) continue;
      try {
        const raw = base64(ascii(entry, eq + 1, entry.length - eq - 1));
        pictureBlob = key === "COVERART" ? picture(raw) : parseFlacPicture(raw)?.blob || null;
      } catch { /* ignore broken art */ }
      continue;
    }
    const field = VORBIS_FIELDS[key];
    if (field && !tags[field]) tags[field] = utf8.decode(entry.subarray(eq + 1)).trim();
  }
  if (tags.year) tags.year = tags.year.slice(0, 4);
  return { ...tags, picture: pictureBlob };
}

function base64(s) {
  const bin = atob(s.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function parseFlacPicture(b) {
  let i = 0;
  const kind = u32be(b, i); i += 4;
  const mlen = u32be(b, i); i += 4;
  const mime = ascii(b, i, mlen); i += mlen;
  const dlen = u32be(b, i); i += 4 + dlen;
  i += 16;
  const len = u32be(b, i); i += 4;
  return { kind, blob: picture(b.subarray(i, i + len), mime) };
}

async function parseFlac(file, offset) {
  const tags = {};
  const pictures = [];
  let pos = offset + 4;
  for (let guard = 0; guard < 64; guard++) {
    const h = await bytes(file, pos, 4);
    if (h.length < 4) break;
    const last = h[0] & 0x80, type = h[0] & 0x7f, len = u24be(h, 1);
    if (type === 4 || type === 6) {
      const block = await bytes(file, pos + 4, Math.min(len, MAX_TAG_BYTES));
      if (type === 4) Object.assign(tags, parseVorbisComment(block));
      else pictures.push(parseFlacPicture(block));
    }
    pos += 4 + len;
    if (last) break;
  }
  const front = pictures.find((p) => p.kind === 3) || pictures[0];
  return { ...tags, picture: front?.blob || tags.picture || null };
}

/* ------------------------------------------------------------------- Ogg */

async function parseOgg(file) {
  // Reassemble the first packets of the first logical stream.
  const packets = [];
  let current = [];
  let pos = 0;
  let serial = null;
  while (packets.length < 2 && pos < file.size && pos < MAX_TAG_BYTES) {
    const head = await bytes(file, pos, 27 + 255);
    if (ascii(head, 0, 4) !== "OggS") break;
    const segs = head[26];
    const table = head.subarray(27, 27 + segs);
    const pageSerial = u32le(head, 14);
    let bodyLen = 0;
    for (const s of table) bodyLen += s;
    const body = await bytes(file, pos + 27 + segs, bodyLen);
    pos += 27 + segs + bodyLen;
    if (serial === null) serial = pageSerial;
    if (pageSerial !== serial) continue;
    let o = 0;
    for (const s of table) {
      current.push(body.subarray(o, o + s));
      o += s;
      if (s < 255) {
        const total = current.reduce((n, c) => n + c.length, 0);
        const p = new Uint8Array(total);
        let k = 0;
        for (const c of current) { p.set(c, k); k += c.length; }
        packets.push(p);
        current = [];
        if (packets.length >= 2) break;
      }
    }
  }
  const tagsPacket = packets[1];
  if (!tagsPacket) return null;
  if (ascii(tagsPacket, 0, 7) === "\x03vorbis") return parseVorbisComment(tagsPacket, 7);
  if (ascii(tagsPacket, 0, 8) === "OpusTags") return parseVorbisComment(tagsPacket, 8);
  return null;
}

/* ------------------------------------------------------------------- MP4 */

const MP4_CONTAINERS = new Set(["moov", "udta", "meta", "ilst", "trak", "mdia"]);
const MP4_FIELDS = { "\xa9nam": "title", "\xa9ART": "artist", "\xa9alb": "album", aART: "albumArtist", "\xa9day": "year", "\xa9gen": "genre" };

async function parseMp4(file) {
  // walk the top level until moov
  let pos = 0;
  for (let guard = 0; guard < 256 && pos < file.size; guard++) {
    const h = await bytes(file, pos, 16);
    if (h.length < 8) break;
    let size = u32be(h, 0);
    const type = ascii(h, 4, 4);
    let headLen = 8;
    if (size === 1) { size = u32be(h, 8) * 2 ** 32 + u32be(h, 12); headLen = 16; }
    else if (size === 0) size = file.size - pos;
    if (size < headLen) break;
    if (type === "moov") {
      const moov = await bytes(file, pos + headLen, Math.min(size - headLen, MAX_TAG_BYTES));
      const out = {};
      walkMp4(moov, 0, moov.length, out);
      if (out.year) out.year = out.year.slice(0, 4);
      return { ...out, picture: out.picture || null };
    }
    pos += size;
  }
  return null;
}

function walkMp4(b, start, end, out, parent = "") {
  let pos = start;
  while (pos + 8 <= end) {
    let size = u32be(b, pos);
    const type = ascii(b, pos + 4, 4);
    let head = 8;
    if (size === 1) { size = u32be(b, pos + 12); head = 16; }
    else if (size === 0) size = end - pos;
    if (size < head || pos + size > end) break;
    const bodyStart = pos + head;
    if (type === "meta") {
      // full box (4 bytes version/flags) unless QuickTime-style
      const looksFull = ascii(b, bodyStart + 8, 4) === "hdlr" || ascii(b, bodyStart + 8, 4) === "ilst";
      walkMp4(b, looksFull ? bodyStart + 4 : bodyStart, pos + size, out, type);
    } else if (MP4_CONTAINERS.has(type)) {
      walkMp4(b, bodyStart, pos + size, out, type);
    } else if (parent === "ilst") {
      readIlstItem(b, type, bodyStart, pos + size, out);
    }
    pos += size;
  }
}

function readIlstItem(b, type, start, end, out) {
  let pos = start;
  while (pos + 16 <= end) {
    const size = u32be(b, pos);
    if (size < 16 || ascii(b, pos + 4, 4) !== "data") { pos += Math.max(size, 8); continue; }
    const dataType = u32be(b, pos + 8) & 0xffffff;
    const payload = b.subarray(pos + 16, pos + size);
    if (type === "covr" && !out.picture) {
      out.picture = picture(payload, dataType === 14 ? "image/png" : dataType === 13 ? "image/jpeg" : null);
    } else if (type === "trkn" && payload.length >= 4 && !out.track) {
      out.track = String((payload[2] << 8) + payload[3]);
    } else if (type === "gnre" && !out.genre) {
      // ID3v1 genre index + 1; leave as unknown text
    } else if (MP4_FIELDS[type] && !out[MP4_FIELDS[type]]) {
      out[MP4_FIELDS[type]] = new TextDecoder("utf-8").decode(payload).trim();
    }
    pos += size;
  }
}

/* ------------------------------------------------------------------- WAV */

async function parseWav(file) {
  const out = {};
  let pos = 12;
  for (let guard = 0; guard < 128 && pos + 8 <= file.size; guard++) {
    const h = await bytes(file, pos, 12);
    const id = ascii(h, 0, 4);
    const size = u32le(h, 4);
    if (id === "LIST" && ascii(h, 8, 4) === "INFO") {
      const body = await bytes(file, pos + 12, Math.min(size - 4, 65536));
      let i = 0;
      const map = { INAM: "title", IART: "artist", IPRD: "album", ICRD: "year", IGNR: "genre", ITRK: "track" };
      while (i + 8 <= body.length) {
        const sid = ascii(body, i, 4), slen = u32le(body, i + 4);
        if (map[sid] && !out[map[sid]]) out[map[sid]] = clean(decodeLegacy(trimNul(body.subarray(i + 8, i + 8 + slen), 1)));
        i += 8 + slen + (slen & 1);
      }
    } else if (id === "id3 " || id === "ID3 ") {
      const tag = parseId3v2(await bytes(file, pos + 8, Math.min(size, MAX_TAG_BYTES)));
      if (tag) for (const [k, v] of Object.entries(tag)) if (v && !out[k]) out[k] = v;
    } else if (id === "data" && pos + 8 + size >= file.size - 8) {
      break;
    }
    pos += 8 + size + (size & 1);
  }
  return out;
}

/* ------------------------------------------------------------- file name */

/** "03 - Artist - Title (Live).mp3" → { artist, title, track } */
export function parseFileName(name = "") {
  let base = String(name).replace(/^.*[\\/]/, "").replace(/\.[a-z0-9]{1,5}$/i, "").replace(/_/g, " ").trim();
  let track = "";
  const m = base.match(/^(\d{1,3})\s*(?:[-.)、]\s*|\s+)(.+)$/);
  if (m && !/^\d{4}$/.test(m[1])) { track = String(Number(m[1])); base = m[2]; }
  const parts = base.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim(), track };
  return { title: base, artist: "", track };
}

/* ----------------------------------------------------------------- entry */

/**
 * Read tags and cover art from an audio File/Blob.
 * Resolves to { title, artist, album, albumArtist, year, track, genre, picture, format }.
 * `picture` is an image Blob or null. Never throws for unreadable tags.
 */
export async function readAudioMetadata(file) {
  const name = file.name || "";
  let tags = null;
  let format = "";
  try {
    const head = await bytes(file, 0, 16);
    const sig = ascii(head, 0, 4);
    if (ascii(head, 0, 3) === "ID3") {
      const size = syncsafe(head, 6) + 10 + (head[5] & 0x10 ? 10 : 0);
      const tagBytes = await bytes(file, 0, Math.min(size, MAX_TAG_BYTES));
      tags = parseId3v2(tagBytes);
      format = "mp3";
      // ID3 in front of FLAC
      const after = await bytes(file, size, 4);
      if (ascii(after, 0, 4) === "fLaC") {
        format = "flac";
        const flac = await parseFlac(file, size);
        tags = merge(flac, tags);
      }
    } else if (sig === "fLaC") {
      format = "flac";
      tags = await parseFlac(file, 0);
    } else if (sig === "OggS") {
      format = "ogg";
      tags = await parseOgg(file);
    } else if (ascii(head, 4, 4) === "ftyp") {
      format = "mp4";
      tags = await parseMp4(file);
    } else if (sig === "RIFF" && ascii(head, 8, 4) === "WAVE") {
      format = "wav";
      tags = await parseWav(file);
    }
    if (!tags?.title && (format === "mp3" || format === "" ) && file.size > 128) {
      const v1 = parseId3v1(await bytes(file, file.size - 128, 128));
      if (v1) { tags = merge(tags || {}, v1); format ||= "mp3"; }
    }
  } catch (err) {
    console.warn("[turntable] could not read tags from", name, err);
  }
  const fromName = parseFileName(name);
  const t = tags || {};
  return {
    title: t.title || fromName.title || "Untitled",
    artist: t.artist || t.albumArtist || fromName.artist || "",
    album: t.album || "",
    albumArtist: t.albumArtist || "",
    year: t.year || "",
    track: t.track || fromName.track || "",
    genre: t.genre || "",
    picture: t.picture || null,
    format: format || (name.match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase(),
  };
}

function merge(primary, secondary) {
  const out = { ...(secondary || {}) };
  for (const [k, v] of Object.entries(primary || {})) if (v) out[k] = v;
  return out;
}
