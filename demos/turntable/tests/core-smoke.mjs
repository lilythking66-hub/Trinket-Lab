// Run with: node demos/turntable/tests/core-smoke.mjs
import { createTurntable, createGeometry, stylusRadius, DECK } from "../../../components/turntable/turntable-core.js";
import { readAudioMetadata, parseFileName, decodeLegacy } from "../../../components/turntable/metadata.js";

function assert(name, condition) {
  if (!condition) throw new Error("FAIL: " + name);
  console.log("PASS: " + name);
}
const run = (tt, seconds, until) => {
  for (let t = 0; t < seconds; t += 1 / 60) {
    tt.step(1 / 60);
    if (until?.()) return t;
  }
  return seconds;
};

/* ---------------- geometry ---------------- */
const geo = createGeometry();
assert("arm reaches the outer groove", Math.abs(stylusRadius(geo.outer) - DECK.record.outer) < 0.01);
assert("arm reaches the inner groove", Math.abs(stylusRadius(geo.inner) - DECK.record.inner) < 0.01);
assert("rest position is off the platter", stylusRadius(DECK.restAngle) > DECK.platter.r + 10);
assert("progress ↔ angle round-trips", Math.abs(geo.progressForAngle(geo.angleForProgress(0.37)) - 0.37) < 1e-9);

/* ---------------- platter ---------------- */
const tt = createTurntable();
const events = [];
tt.subscribe((e) => events.push(e));
assert("empty deck refuses to cue", tt.cueTo(0) === false && tt.state === "empty");
tt.setRecord({ id: "a", title: "A" });
tt.setPower(true);
const spinUp = run(tt, 5, () => Math.abs(tt.snapshot().rpm - 100 / 3) < 0.05);
assert("platter reaches 33⅓ rpm in about a second", spinUp > 0.5 && spinUp < 2.5);
tt.setSpeed(45);
run(tt, 3);
assert("45 rpm plays 1.35× faster", Math.abs(tt.snapshot().rpm - 45) < 0.05);
tt.setSpeed(33);
run(tt, 3);

/* ---------------- cue & play ---------------- */
tt.cueTo(0.5);
const cue = run(tt, 6, () => tt.state === "playing");
assert("auto-cue lifts, swings and lowers into the groove", tt.state === "playing" && cue < 4);
assert("needle lands where it was cued", Math.abs(tt.snapshot().progress - 0.5) < 1e-6);
assert("audio rate is 1 at 33⅓", Math.abs(tt.rate - 1) < 0.01);
tt.setProgress(0.8);
tt.step(1 / 60);
assert("arm follows playback inward", Math.abs(tt.snapshot().arm.angle - geo.angleForProgress(0.8)) < 1e-6);

/* ---------------- power cut: wow ---------------- */
tt.setPower(false);
run(tt, 0.5);
const r = tt.rate;
assert("cutting power slows the music (pitch drops)", r > 0.3 && r < 0.95);
run(tt, 6);
assert("platter stops, needle stays down", tt.snapshot().omega === 0 && tt.state === "paused");
tt.setPower(true);
run(tt, 3);
assert("power back on resumes", tt.state === "playing");

/* ---------------- manual arm ---------------- */
tt.grab();
assert("grabbing lifts the needle", events.includes("lift") && tt.rate === 0);
tt.drag(geo.angleForProgress(0.2));
run(tt, 1);
assert("released over the record → lowers", tt.release() === "lower");
run(tt, 3, () => tt.state === "playing");
assert("plays from the new spot", tt.state === "playing" && Math.abs(tt.snapshot().progress - 0.2) < 0.01);
tt.grab();
tt.drag(DECK.restAngle + 4);
run(tt, 1);
assert("released off the record → goes home", tt.release() === "return");
run(tt, 4, () => tt.snapshot().arm.mode === "rest");
assert("arm parks on the rest", tt.snapshot().arm.mode === "rest" && tt.state === "spinning");

/* ---------------- end of side ---------------- */
tt.cueTo(0.99);
run(tt, 5, () => tt.state === "playing");
tt.ended();
assert("end of the music drifts into the run-out", tt.state === "ended");
run(tt, 10, () => tt.snapshot().arm.mode === "rest");
assert("auto-return parks the arm and switches off", tt.snapshot().arm.mode === "rest" && !tt.snapshot().power);
assert("a finished side rewinds to the start", tt.snapshot().progress === 0);
assert("records can only be swapped with the arm clear", tt.armClear() && tt.setRecord({ id: "b" }));

/* ---------------- metadata ---------------- */
const enc = new TextEncoder();
const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const ss = (n) => [(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127];
const bytes = (...parts) => Uint8Array.from(parts.flat(Infinity));
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(40).fill(7)];

function id3(major, frames) {
  const body = frames.flat(Infinity);
  return bytes(ascii("ID3"), major, 0, 0, ss(body.length), body, [0xff, 0xfb, 0x90, 0, ...new Array(64).fill(0)]);
}
const frame23 = (id, data) => [ascii(id), be32(data.length), 0, 0, data];
const frame24 = (id, data) => [ascii(id), ss(data.length), 0, 0, data];

// ID3v2.4, UTF-8 text + front cover
const v24 = id3(4, [
  frame24("TIT2", [3, ...enc.encode("晚风")]),
  frame24("TPE1", [3, ...enc.encode("Lily")]),
  frame24("TALB", [3, ...enc.encode("Desk")]),
  frame24("APIC", [0, ...ascii("image/png"), 0, 3, ...ascii("cover"), 0, ...PNG]),
]);
let m = await readAudioMetadata(new File([v24], "x.mp3"));
assert("ID3v2.4 UTF-8 tags", m.title === "晚风" && m.artist === "Lily" && m.album === "Desk");
assert("ID3v2.4 embedded cover", m.picture?.type === "image/png" && m.picture.size === PNG.length);

// ID3v2.3 UTF-16 with BOM
const u16 = (s) => { const out = [0xff, 0xfe]; for (const c of s) { const n = c.charCodeAt(0); out.push(n & 255, n >> 8); } return out; };
m = await readAudioMetadata(new File([id3(3, [frame23("TIT2", [1, ...u16("Hello")]), frame23("TPE1", [1, ...u16("Wörld")])])], "y.mp3"));
assert("ID3v2.3 UTF-16 tags", m.title === "Hello" && m.artist === "Wörld");

// "Latin-1" frames that are really GBK (very common in Chinese MP3s)
const gbk = { 晴天: [0xc7, 0xe7, 0xcc, 0xec], 周杰伦: [0xd6, 0xdc, 0xbd, 0xdc, 0xc2, 0xd7] };
m = await readAudioMetadata(new File([id3(3, [frame23("TIT2", [0, ...gbk["晴天"]]), frame23("TPE1", [0, ...gbk["周杰伦"]])])], "z.mp3"));
assert("legacy GBK tags are recovered", m.title === "晴天" && m.artist === "周杰伦");
assert("plain Latin-1 stays Latin-1", decodeLegacy(Uint8Array.from([0x43, 0x61, 0x66, 0xe9])) === "Café");

// FLAC: Vorbis comment + PICTURE block
const vc = (pairs) => { const out = [...le32(3), ...ascii("tst"), ...le32(pairs.length)]; for (const p of pairs) { const b = enc.encode(p); out.push(...le32(b.length), ...b); } return out; };
const comment = vc(["TITLE=Flac Tune", "ARTIST=Lossless", "DATE=2021-05-01"]);
const pic = [...be32(3), ...be32(9), ...ascii("image/png"), ...be32(0), ...be32(1), ...be32(1), ...be32(24), ...be32(0), ...be32(PNG.length), ...PNG];
const block = (type, data, last) => [(last ? 0x80 : 0) | type, (data.length >> 16) & 255, (data.length >> 8) & 255, data.length & 255, ...data];
const flac = bytes(ascii("fLaC"), block(0, new Array(34).fill(0)), block(4, comment), block(6, pic, true));
m = await readAudioMetadata(new File([flac], "t.flac"));
assert("FLAC Vorbis comments", m.title === "Flac Tune" && m.artist === "Lossless" && m.year === "2021" && m.format === "flac");
assert("FLAC picture block", m.picture?.size === PNG.length);

// MP4 / M4A: moov › udta › meta › ilst
const box = (type, ...content) => { const body = content.flat(Infinity); return [...be32(body.length + 8), ...ascii(type), ...body]; };
const data = (type, payload) => box("data", be32(type), be32(0), payload);
const ilst = box("ilst",
  box("\xa9nam", data(1, [...enc.encode("M4A Song")])),
  box("\xa9ART", data(1, [...enc.encode("Mp4 Person")])),
  box("covr", data(14, PNG)));
const mp4 = bytes(box("ftyp", ascii("M4A "), be32(0)), box("moov", box("udta", box("meta", [0, 0, 0, 0], box("hdlr", new Array(25).fill(0)), ilst))));
m = await readAudioMetadata(new File([mp4], "t.m4a"));
assert("MP4 ilst tags", m.title === "M4A Song" && m.artist === "Mp4 Person" && m.format === "mp4");
assert("MP4 cover", m.picture?.type === "image/png");

// no tags at all → file name
m = await readAudioMetadata(new File([new Uint8Array(200)], "07 - Lily Band - Night Bus.mp3"));
assert("file name fallback", m.title === "Night Bus" && m.artist === "Lily Band" && m.track === "7");
assert("file name without artist", parseFileName("demo_take_2.wav").title === "demo take 2");

console.log("\nAll turntable checks passed.");
