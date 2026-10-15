import { createFrames, canPlayH264 } from "../../components/projector/projector-element.js";
import { makeDemoPhotos } from "./demo-photos.js";

const pj = document.getElementById("pj");
const $ = (id) => document.getElementById(id);
const hint = $("hint");
const thumbs = $("thumbs");

/* ------------------------------------------------ persistence (host-owned) */

const DB = "trinket-projector-demo";
function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("photos", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function store(mode, fn) {
  try {
    const d = await db();
    return await new Promise((resolve, reject) => {
      const tx = d.transaction("photos", mode);
      const out = fn(tx.objectStore("photos"));
      tx.oncomplete = () => resolve(out?.result ?? out);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("[demo] storage unavailable", err);
    return null;
  }
}
const savePhotos = (files) => store("readwrite", (s) => {
  s.clear();
  files.forEach((file, i) => s.put({ id: String(i).padStart(4, "0"), file, name: file.name }));
});
const loadSaved = () => store("readonly", (s) => s.getAll());
const clearSaved = () => store("readwrite", (s) => s.clear());

/* ------------------------------------------------------------------ hints */

let sayTimer = 0;
function say(text, ms = 3600) {
  hint.textContent = text;
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => { hint.textContent = defaultHint(); }, ms);
}
function defaultHint() {
  const s = pj.state;
  if (pj.roll) return pj.lidOpen ? "Drop the film can into the open bay." : "Drag the film can into the projector, or just click it.";
  if (s === "empty") return "Add photos or an MP4 below and you'll get a film can to load.";
  if (s === "off") return "Flip the power switch on the front panel.";
  if (pj.mode === "filmstrip") {
    return s === "playing" ? "Grab the film and drag it. Scroll over it, or tap a frame to bring it to the gate." : "Press the middle key to run the film, or drag it by hand.";
  }
  if (pj.source === "video") return s === "playing" ? "The side keys skip 10 seconds. Turn the lens ring to focus." : "Press play to roll the film.";
  return s === "playing" ? "Turn the knurled lens ring to focus. The side keys change slides." : "Press the middle key for a slideshow, or step with the side keys.";
}

/* ----------------------------------------------------------------- thumbs */

function renderThumbs() {
  thumbs.replaceChildren();
  pj.frames.forEach((fr, i) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.className = "thumb";
    b.setAttribute("aria-label", `Photo ${i + 1}${fr.title ? ": " + fr.title : ""}`);
    const img = document.createElement("img");
    img.src = fr.thumb;
    img.alt = "";
    const n = document.createElement("span");
    n.className = "n";
    n.textContent = String(i + 1).padStart(2, "0");
    b.append(img, n);
    b.addEventListener("click", () => {
      if (pj.mode === "cinema") pj.source = "photos";
      pj.goTo(i);
    });
    li.append(b);
    thumbs.append(li);
  });
  if (pj.clip) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.className = "thumb video";
    b.textContent = "▶ MP4";
    b.setAttribute("aria-label", "Play the video in the cinema");
    b.addEventListener("click", () => { pj.mode = "cinema"; pj.source = "video"; pj.play(); });
    li.append(b);
    thumbs.append(li);
  }
  $("count").textContent = String(pj.frames.length);
  markCurrent();
}
function markCurrent() {
  const i = pj.index;
  [...thumbs.querySelectorAll(".thumb:not(.video)")].forEach((b, k) => b.classList.toggle("current", k === i && pj.frames.length > 0));
}

/* ----------------------------------------------------------------- events */

pj.addEventListener("load", renderThumbs);
pj.addEventListener("unload", renderThumbs);
pj.addEventListener("video", () => {
  $("sources").querySelector('[data-source="video"]').disabled = false;
  renderThumbs();
});
pj.addEventListener("change", (e) => {
  markCurrent();
  // keep the current thumb in view without scrolling the page
  const b = thumbs.querySelectorAll(".thumb")[e.detail.index];
  if (b) {
    const left = b.parentElement.offsetLeft, right = left + b.offsetWidth;
    if (left < thumbs.scrollLeft || right > thumbs.scrollLeft + thumbs.clientWidth) thumbs.scrollTo({ left: left - thumbs.clientWidth / 2 + b.offsetWidth / 2, behavior: "smooth" });
  }
});
pj.addEventListener("statechange", (e) => {
  document.body.toggleAttribute("data-playing", e.detail.state === "playing");
  $("play").setAttribute("aria-label", e.detail.state === "playing" ? "Pause" : "Play");
  hint.textContent = defaultHint();
});
pj.addEventListener("modechange", (e) => {
  document.body.dataset.mode = e.detail.mode;
  document.documentElement.dataset.mode = e.detail.mode;
  for (const b of $("modes").children) b.classList.toggle("active", b.dataset.mode === e.detail.mode);
  document.querySelector('meta[name="theme-color"]').content = e.detail.mode === "cinema" ? "#17110d" : "#f1e8da";
  hint.textContent = defaultHint();
});
pj.addEventListener("sourcechange", (e) => {
  for (const b of $("sources").children) b.classList.toggle("active", b.dataset.source === e.detail.source);
  hint.textContent = defaultHint();
});
pj.addEventListener("power", () => { hint.textContent = defaultHint(); });
pj.addEventListener("blocked", (e) => {
  const r = e.detail.reason;
  if (r === "empty") say("The reel is empty. Add some photos first.");
  else if (r === "no-video") say("Import an MP4 to play video in the cinema.");
  else if (r === "codec") say("This video can't be decoded here. Try an H.264 MP4.");
  else if (r === "autoplay") say("Your browser started the video muted. Tap the page to allow sound.");
  else if (r === "not-image" || r === "not-media") say("Those files don't look like photos or an MP4.");
});
pj.addEventListener("roll", () => say("Your film is ready. Drag the can into the projector, or click it.", 5000));
pj.addEventListener("lid", () => { hint.textContent = defaultHint(); });
pj.addEventListener("insert", (e) => {
  // keep what's on the projector for next time (photos only; videos can be large)
  const files = e.detail.roll.frames.map((f) => f.file).filter(Boolean);
  if (files.length) savePhotos(files);
  say(e.detail.roll.clip && !e.detail.roll.frames.length ? "Film loaded. Switch to the cinema and press play." : "Film loaded. Flip the power switch and press play.");
});
pj.addEventListener("focuschange", (e) => {
  if (Math.abs(e.detail.focus) < 0.04) say("Sharp.", 1200);
});

/* --------------------------------------------------------------- controls */

$("modes").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) pj.mode = b.dataset.mode;
});
$("sources").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  pj.source = b.dataset.source;
  if (pj.mode !== "cinema") pj.mode = "cinema";
});
$("play").addEventListener("click", () => pj.toggle());
$("prev").addEventListener("click", () => pj.prev());
$("next").addEventListener("click", () => pj.next());
$("speed").addEventListener("change", (e) => { pj.speed = e.target.value; });
$("grain").addEventListener("input", (e) => pj.setAttribute("grain", e.target.value));
$("interval").addEventListener("input", (e) => { pj.interval = e.target.value; $("interval-out").textContent = e.target.value + "s"; });
$("sfx").addEventListener("change", (e) => (e.target.checked ? pj.removeAttribute("sfx") : pj.setAttribute("sfx", "off")));
$("defocus").addEventListener("click", () => {
  pj.focus = (Math.random() < 0.5 ? -1 : 1) * (0.45 + Math.random() * 0.3);
  say("Now turn the knurled ring on the lens until it's sharp again.");
});
$("themes").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.theme) pj.setAttribute("theme", b.dataset.theme); else pj.removeAttribute("theme");
  for (const s of $("themes").children) s.classList.toggle("active", s === b);
});

$("import-photos").addEventListener("change", async (e) => {
  const files = [...e.target.files];
  e.target.value = "";
  if (!files.length) return;
  say("Winding the film…", 8000);
  const frames = await createFrames(files);
  if (!frames.length) return say("Those don't look like photos.");
  await pj.addRoll({ frames });
});
$("import-video").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  if (!canPlayH264()) say("This browser may not decode H.264. Trying anyway.");
  await pj.addRoll({ clip: file });
});
$("reset").addEventListener("click", async () => {
  await clearSaved();
  await loadDemo();
  say("Back to the demo reel.");
});

/* ------------------------------------------------------------------ start */

async function loadDemo() {
  // the demo reel arrives as a can on the table: load it yourself
  const frames = await createFrames(await makeDemoPhotos());
  await pj.addRoll({ frames, label: { line1: "DEMO REEL", line2: "7 FRAMES" } });
}

hint.textContent = "Winding the demo reel…";
(async () => {
  await pj.whenReady();
  const saved = (await loadSaved()) || [];
  let loaded = false;
  if (saved.length) {
    const files = saved.sort((a, b) => a.id.localeCompare(b.id)).map((s) => (s.file instanceof File ? s.file : new File([s.file], s.name || "photo.jpg")));
    const frames = await createFrames(files);
    if (frames.length) { await pj.loadPhotos(frames); loaded = true; }
  }
  if (!loaded) await loadDemo();
  hint.textContent = defaultHint();
  window.projectorDemo = { pj };
})();
