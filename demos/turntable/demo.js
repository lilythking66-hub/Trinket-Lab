import { createRecord, createRecords, renderSleeve, renderRecord, loadImage, releaseRecord } from "../../components/turntable/turntable-element.js";
import { makeDemoRecords } from "./demo-tracks.js";

const tt = document.getElementById("tt");
const crateEl = document.getElementById("crate");
const hint = document.getElementById("hint");
const $ = (id) => document.getElementById(id);
const crate = [];

/* ------------------------------------------------ persistence (host-owned) */

const DB = "trinket-turntable-demo";
function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("records", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function store(mode, fn) {
  try {
    const d = await db();
    return await new Promise((resolve, reject) => {
      const tx = d.transaction("records", mode);
      const out = fn(tx.objectStore("records"));
      tx.oncomplete = () => resolve(out?.result ?? out);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("[demo] storage unavailable", err);
    return null;
  }
}
const saveFile = (id, file) => store("readwrite", (s) => s.put({ id, file, name: file.name, added: Date.now() }));
const removeFile = (id) => store("readwrite", (s) => s.delete(id));
const loadFiles = () => store("readonly", (s) => s.getAll());

/* ------------------------------------------------------------------ crate */

function fmt(t) {
  if (!Number.isFinite(t) || t < 0) t = 0;
  return Math.floor(t / 60) + ":" + String(Math.floor(t % 60)).padStart(2, "0");
}

async function sleeveCanvas(record, size) {
  const img = record.cover ? await loadImage(record.coverBlob || record.cover) : null;
  return renderSleeve(record, { size, image: img });
}

async function addToCrate(record, { persist = false } = {}) {
  crate.push(record);
  const li = document.createElement("li");
  li.dataset.id = record.id;
  const btn = document.createElement("button");
  btn.className = "sleeve";
  btn.setAttribute("aria-label", `Play ${record.title}${record.artist ? " by " + record.artist : ""}`);
  btn.style.setProperty("--label", record.palette?.base || "#e2a34a");
  const art = document.createElement("span");
  art.className = "sleeve-art";
  const disc = document.createElement("span");
  disc.className = "sleeve-disc";
  art.append(disc, await sleeveCanvas(record, 240));
  const title = document.createElement("span");
  title.className = "sleeve-title";
  title.textContent = record.title;
  const artist = document.createElement("span");
  artist.className = "sleeve-artist";
  artist.textContent = record.artist || "Unknown artist";
  btn.append(art, title, artist);
  li.append(btn);
  if (!record.demo) {
    const x = document.createElement("button");
    x.className = "remove";
    x.textContent = "×";
    x.setAttribute("aria-label", `Remove ${record.title}`);
    x.addEventListener("click", async () => {
      if (tt.record?.id === record.id) await tt.unload();
      li.remove();
      crate.splice(crate.indexOf(record), 1);
      releaseRecord(record);
      removeFile(record.id);
    });
    li.append(x);
  }
  enableDrag(btn, record);
  crateEl.append(li);
  if (persist && record.file) saveFile(record.id, record.file);
  markOnDeck();
}

function markOnDeck() {
  for (const li of crateEl.children) li.querySelector(".sleeve").classList.toggle("on-deck", tt.record?.id === li.dataset.id);
}

async function importFiles(files) {
  const records = await createRecords(files);
  if (!records.length) { say("Those don't look like audio files."); return []; }
  for (const r of records) await addToCrate(r, { persist: true });
  say(records.length === 1 ? `Pressed “${records[0].title}”.` : `Pressed ${records.length} records.`);
  return records;
}

/* -------------------------------------- drag a sleeve onto the turntable */

function enableDrag(btn, record) {
  let drag = null;
  btn.addEventListener("pointerdown", (e) => {
    if (e.button > 0 || e.pointerType === "touch") return; // touch: tap to load, keep scrolling
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId, ghost: null };
  });
  btn.addEventListener("pointermove", async (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    if (!drag.ghost && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) {
      btn.setPointerCapture(e.pointerId);
      drag.ghost = document.createElement("div");
      drag.ghost.className = "ghost";
      const img = record.cover ? await loadImage(record.coverBlob || record.cover) : null;
      if (!drag) return;
      drag.ghost.append(renderRecord(record, { size: 256, image: img }));
      document.body.append(drag.ghost);
    }
    if (drag.ghost) {
      drag.ghost.style.left = e.clientX + "px";
      drag.ghost.style.top = e.clientY + "px";
      const r = tt.getBoundingClientRect();
      const over = e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom;
      drag.ghost.style.opacity = over ? "1" : ".8";
    }
  });
  const end = (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const d = drag;
    drag = null;
    if (!d.ghost) return;
    d.ghost.remove();
    btn.dataset.dragged = "1";
    const r = tt.getBoundingClientRect();
    if (e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom) tt.load(record, { autoplay: true });
  };
  btn.addEventListener("pointerup", end);
  btn.addEventListener("pointercancel", end);
  btn.addEventListener("click", () => {
    if (btn.dataset.dragged) { delete btn.dataset.dragged; return; }
    if (tt.record?.id === record.id) tt.toggle();
    else tt.load(record, { autoplay: true });
  });
}

/* ------------------------------------------------------------ now playing */

const nowSleeve = $("now-sleeve").getContext("2d");
async function showRecord(record) {
  $("now-title").textContent = record ? record.title : "No record";
  $("now-artist").textContent = record ? [record.artist, record.album].filter(Boolean).join(" · ") || "Unknown artist" : "Pick one from the crate";
  nowSleeve.clearRect(0, 0, 120, 120);
  if (record) nowSleeve.drawImage(await sleeveCanvas(record, 120), 0, 0);
  $("time-total").textContent = fmt(record?.duration);
  setProgress(0, 0, record?.duration || 0);
  markOnDeck();
}

function setProgress(p, t, d) {
  $("progress-fill").style.width = (p * 100).toFixed(2) + "%";
  $("progress").setAttribute("aria-valuenow", String(Math.round(p * 100)));
  $("time-now").textContent = fmt(t);
  if (d) $("time-total").textContent = fmt(d);
}

let sayTimer = 0;
function say(text, ms = 3200) {
  hint.textContent = text;
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => { hint.textContent = defaultHint(); }, ms);
}
function defaultHint() {
  const s = tt.state;
  if (s === "empty") return "Choose a record from the crate, or drop music onto the deck.";
  if (s === "loaded" || s === "spinning") return "Drag the tonearm onto the record, or tap it.";
  if (s === "playing") return "Drag the arm to skip around. The 45 knob speeds it up.";
  if (s === "paused") return "The platter stopped. Turn the power knob back on.";
  return "";
}

tt.addEventListener("load", (e) => showRecord(e.detail.record));
tt.addEventListener("unload", () => showRecord(null));
tt.addEventListener("durationchange", (e) => { $("time-total").textContent = fmt(e.detail.duration); });
tt.addEventListener("timeupdate", (e) => setProgress(e.detail.progress, e.detail.currentTime, e.detail.duration));
tt.addEventListener("statechange", (e) => {
  document.body.dataset.state = e.detail.state;
  $("state").textContent = e.detail.state;
  $("play").textContent = e.detail.state === "playing" || e.detail.state === "cueing" ? "Pause" : "Play";
  if (e.detail.state === "ended") setProgress(1, tt.duration, tt.duration);
  hint.textContent = defaultHint();
});
tt.addEventListener("blocked", (e) => {
  const reason = e.detail.reason;
  if (reason === "empty") say("The platter is empty. Pick a record from the crate first.");
  else if (reason === "autoplay") say("Tap the tonearm to start. Your browser wants a tap first.");
  else if (reason === "not-audio") say("Those don't look like audio files.");
  else if (reason === "cue") say("Swing the arm over the record first.");
});
tt.addEventListener("error", () => say("This file can't be played in this browser."));
tt.addEventListener("import", async (e) => {
  // files dropped on the deck: keep them in the crate too (the deck loads the first one)
  for (const r of e.detail.records) await addToCrate(r, { persist: true });
});
tt.addEventListener("speed", (e) => activate("speed", "speed", String(e.detail.speed)));
tt.addEventListener("lid", (e) => activate("lid", "lid", e.detail.lid));

/* ---------------------------------------------------------------- controls */

$("play").addEventListener("click", async () => {
  if (!tt.record) {
    if (!crate.length) return say("Import some music first.");
    await tt.load(crate[0], { autoplay: true });
    return;
  }
  tt.toggle();
});
$("stop").addEventListener("click", () => tt.stop());
$("import").addEventListener("change", async (e) => {
  const records = await importFiles(e.target.files);
  e.target.value = "";
  if (records[0] && !tt.playing) tt.load(records[0], { autoplay: true });
});

const progress = $("progress");
const progressAt = (e) => {
  const r = progress.getBoundingClientRect();
  return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
};
progress.addEventListener("pointerdown", (e) => {
  progress.setPointerCapture(e.pointerId);
  $("progress-fill").style.width = progressAt(e) * 100 + "%";
});
progress.addEventListener("pointermove", (e) => {
  if (progress.hasPointerCapture(e.pointerId)) $("progress-fill").style.width = progressAt(e) * 100 + "%";
});
progress.addEventListener("pointerup", (e) => { if (tt.record) tt.seek(progressAt(e)); });
progress.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") tt.seek(tt.progress + 0.05, { instant: true });
  if (e.key === "ArrowLeft") tt.seek(tt.progress - 0.05, { instant: true });
});

function activate(groupId, attr, value) {
  for (const b of $(groupId).querySelectorAll("button")) b.classList.toggle("active", b.dataset[attr] === value);
}
$("themes").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.theme) tt.setAttribute("theme", b.dataset.theme); else tt.removeAttribute("theme");
  for (const s of $("themes").children) s.classList.toggle("active", s === b);
});
$("lid").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  tt.lid = b.dataset.lid;
  activate("lid", "lid", b.dataset.lid);
});
$("speed").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  tt.speed = Number(b.dataset.speed);
});
$("crackle").addEventListener("input", (e) => tt.setAttribute("crackle", e.target.value));
$("warm").addEventListener("change", (e) => tt.setAttribute("tone", e.target.checked ? "warm" : "clean"));

/* ------------------------------------------------------------------ start */

if (matchMedia("(max-width: 600px)").matches) { tt.lid = "none"; activate("lid", "lid", "none"); }
hint.textContent = "Pressing the demo records…";
(async () => {
  try {
    for (const d of await makeDemoRecords()) await addToCrate(await createRecord(d));
  } catch (err) {
    console.warn("[demo] could not synthesize demo records", err);
  }
  const saved = (await loadFiles()) || [];
  for (const s of saved.sort((a, b) => a.added - b.added)) {
    try {
      const file = s.file instanceof File ? s.file : new File([s.file], s.name || "track");
      const rec = await createRecord(file);
      rec.id = s.id;
      await addToCrate(rec);
    } catch { /* skip unreadable */ }
  }
  hint.textContent = defaultHint();
  window.turntableDemo = { tt, crate };
})();
