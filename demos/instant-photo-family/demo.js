// Demo wiring only — everything here is "host product" code.
const photo = document.getElementById("photo");
const camera = document.getElementById("camera");
const main = document.querySelector("main.stage");

const SAMPLES = [
  { id: "lake", image: new URL("./samples/lake.svg", import.meta.url).href, label: "Lakeside" },
  { id: "sunset", image: new URL("./samples/sunset.svg", import.meta.url).href, label: "Sunset" },
  { id: "night", image: new URL("./samples/night.svg", import.meta.url).href, label: "Starlight" },
];
const today = () => {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
};
const recipeFor = (s) => ({ image: s.image, caption: captionPhoto.value || undefined, date: today(), title: s.label });

// ---------- tabs (phone layout shows one camera at a time)
for (const tab of document.querySelectorAll(".seg [data-show]")) {
  tab.addEventListener("click", () => {
    main.dataset.show = tab.dataset.show;
    for (const t of document.querySelectorAll(".seg [data-show]")) t.setAttribute("aria-selected", String(t === tab));
    if (tab.dataset.show === "photo" && camera.cameraState === "live") camera.stopCamera();
    if (tab.dataset.show === "camera" && photo.cameraState === "live") photo.stopCamera();
  });
}

// ---------- Instant Photo
const samples = document.getElementById("samples");
const captionPhoto = document.getElementById("caption-photo");
for (const s of SAMPLES) {
  const b = document.createElement("button");
  b.className = "sample";
  b.innerHTML = `<img src="${s.image}" alt=""><span>${s.label}</span>`;
  b.addEventListener("click", () => photo.print(recipeFor(s)));
  samples.append(b);
}
// Instant Photo: the on-camera shutter takes a selfie through the lens; samples print via code
const selfieToggle = document.getElementById("selfie-toggle");
const hintPhoto = document.getElementById("hint-photo");
const fisheye = document.getElementById("opt-fisheye");
selfieToggle.addEventListener("click", () => (photo.cameraState === "live" ? photo.stopCamera() : photo.startCamera()));
fisheye.addEventListener("change", () => photo.setAttribute("fisheye", fisheye.checked ? "0.65" : "off"));
const PHOTO_HINTS = {
  off: "Tap the lens to open the selfie preview, then press the shutter.",
  starting: "Opening the front camera…",
  live: "Look into the lens and press the shutter.",
  denied: "Camera permission denied — allow access in browser settings or print a sample below.",
  unavailable: "No camera available — you can still print a sample below.",
  busy: "Camera is in use by another app.",
  insecure: "Camera access requires HTTPS or localhost.",
  error: "Could not open camera.",
};
photo.addEventListener("camerastate", (e) => {
  const st = e.detail.state;
  hintPhoto.textContent = PHOTO_HINTS[st] || "";
  hintPhoto.classList.toggle("warn", !["off", "starting", "live"].includes(st));
  selfieToggle.textContent = st === "live" ? "Close selfie" : st === "starting" ? "Opening…" : "Open selfie";
});
captionPhoto.addEventListener("input", () => photo.setAttribute("caption", captionPhoto.value));
document.getElementById("upload").addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  e.target.value = "";
  if (f) photo.print({ image: f, caption: captionPhoto.value || undefined, date: today() });
});

// ---------- Instant Camera
const camToggle = document.getElementById("cam-toggle");
const captionCamera = document.getElementById("caption-camera");
camToggle.addEventListener("click", () => (camera.cameraState === "live" ? camera.stopCamera() : camera.startCamera()));
document.getElementById("cam-switch").addEventListener("click", () => camera.switchCamera());
captionCamera.addEventListener("input", () => camera.setAttribute("caption", captionCamera.value));
const camSwitch = document.getElementById("cam-switch");
camera.addEventListener("cameradevices", (e) => {
  camSwitch.disabled = !e.detail.canSwitch;
  camSwitch.title = e.detail.canSwitch ? "" : "Only one camera is available on this device";
});
// one camera at a time: opening one turns the other off (Safari can't share a camera)
camera.addEventListener("camerastate", (e) => { if (e.detail.state === "starting" && photo.cameraState !== "off") photo.stopCamera(); });
photo.addEventListener("camerastate", (e) => { if (e.detail.state === "starting" && camera.cameraState !== "off") camera.stopCamera(); });
camera.addEventListener("camerastate", (e) => {
  camToggle.textContent = e.detail.state === "live" ? "Close camera" : e.detail.state === "starting" ? "Opening…" : "Open camera";
});

// ---------- shared: state pills, options, tray
for (const [key, el] of [["photo", photo], ["camera", camera]]) {
  const pill = document.querySelector(`.state[data-for="${key}"]`);
  el.addEventListener("statechange", (e) => {
    pill.textContent = e.detail.state;
    pill.dataset.state = e.detail.state;
  });
  el.addEventListener("taken", (e) => addToTray(e.detail));
  el.addEventListener("error", (e) => console.warn(key, e.detail.error));
}

const sound = document.getElementById("opt-sound");
const fast = document.getElementById("opt-fast");
const applyOpts = () => {
  for (const el of [photo, camera]) {
    el.toggleAttribute("sound", sound.checked);
    if (fast.checked) el.setAttribute("develop-duration", "1200");
    else el.removeAttribute("develop-duration");
  }
};
sound.addEventListener("change", applyOpts);
fast.addEventListener("change", applyOpts);

const tray = document.getElementById("tray");
async function addToTray(detail) {
  document.getElementById("tray-hint").textContent = "Tap a photo to save it";
  const blob = await detail.toBlob("image/png", 2);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.className = "kept";
  a.href = url;
  a.download = `instant-${Date.now()}.png`;
  a.style.setProperty("--tilt", `${(Math.random() * 8 - 4).toFixed(1)}deg`);
  a.innerHTML = `<img src="${url}" alt="${detail.recipe.caption || "Instant photo"}">`;
  tray.prepend(a);
}

// ---------- optional QR trigger: opening ?spot=lake prints that sample.
// Loaded dynamically so deleting triggers/qr leaves the rest of the demo working.
import("../../triggers/qr/qr-trigger.js")
  .then(({ triggerFromUrl, readPayloadFromUrl }) => {
    if (readPayloadFromUrl("spot")) {
      main.dataset.show = "photo";
    }
    return triggerFromUrl({
      param: "spot",
      target: photo,
      resolve: (spot) => {
        const s = SAMPLES.find((x) => x.id === spot);
        return s ? recipeFor(s) : null;
      },
    });
  })
  .catch(() => document.getElementById("qr-links")?.remove());
