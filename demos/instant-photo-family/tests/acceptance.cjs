const { chromium, devices } = require("playwright");
// Acceptance run for Instant Photo V1 (docs/INSTANT_PHOTO_V1.md).
// 1. serve the repo root:   python3 -m http.server 8765
// 2. once:                  npm install --no-save playwright && npx playwright install chromium
// 3. run:                   node demos/instant-photo-family/tests/acceptance.cjs
// Screenshots go to demos/instant-photo-family/tests/shots/ (git-ignored).
const path = require("path");
const OUT = path.join(__dirname, "shots");
const URL0 = (process.env.DEMO_URL || "http://localhost:8765") + "/demos/instant-photo-family/index.html";
const SAMPLE_FILE = path.join(__dirname, "..", "samples", "lake.svg");
require("fs").mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (name, cond, info = "") => { results.push(`${cond ? "PASS" : "FAIL"}  ${name} ${info}`); };

async function page(browser, opts = {}) {
  const ctx = await browser.newContext(opts.ctx || { viewport: { width: 1280, height: 980 } });
  const p = await ctx.newPage();
  p.errors = [];
  p.on("pageerror", (e) => p.errors.push(String(e)));
  p.on("console", (m) => m.type() === "error" && !/TUNNEL|404/.test(m.text()) && p.errors.push(m.text()));
  if (opts.route) await opts.route(p);
  await p.goto(opts.url || URL0);
  if (opts.skipWait) return p;
  await p.waitForFunction(() => document.getElementById("photo")?.hasAttribute("state") && document.getElementById("camera")?.hasAttribute("state"));
  await p.evaluate(() => {
    window.__states = { photo: [], camera: [] };
    for (const id of ["photo", "camera"]) document.getElementById(id).addEventListener("statechange", (e) => window.__states[id].push(e.detail.state));
  });
  return p;
}
const state = (p, id) => p.evaluate((id) => document.getElementById(id).state, id);
const waitState = (p, id, s, timeout = 15000) => p.waitForFunction(([id, s]) => document.getElementById(id).state === s, [id, s], { timeout });

(async () => {
  const browser = await chromium.launch({
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
  });

  // ---------------- desktop: Instant Photo
  let p = await page(browser);
  await p.screenshot({ path: `${OUT}/d0-idle.png` });
  await p.click(".sample >> nth=0");
  await p.waitForTimeout(150);
  await p.screenshot({ path: `${OUT}/d1-flash.png` });
  await waitState(p, "photo", "ejecting");
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/d2-ejecting.png` });
  // #6 re-trigger during active print
  const second = await p.evaluate(() => document.getElementById("photo").print({ image: "./samples/night.svg" }));
  ok("#6 re-trigger while printing is refused", second === false);
  await waitState(p, "photo", "developing");
  await p.waitForTimeout(1300);
  await p.screenshot({ path: `${OUT}/d3-developing.png` });
  await waitState(p, "photo", "ready");
  await p.screenshot({ path: `${OUT}/d4-ready.png` });
  const seq = await p.evaluate(() => window.__states.photo.join(">"));
  ok("#2 visible sequence", seq === "shutter>flash>ejecting>developing>ready", seq);
  // #3 masking: at start of eject the card must be fully above slot (clipped). Checked via screenshot d2 + geometry
  // #5 take via drag
  const card = await p.evaluateHandle(() => document.getElementById("photo").shadowRoot.querySelector(".te-card"));
  const bb = await card.boundingBox();
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(bb.x + bb.width / 2 + i * 14, bb.y + bb.height / 2 + i * 10);
  await p.screenshot({ path: `${OUT}/d5-dragging.png` });
  await p.mouse.up();
  await waitState(p, "photo", "idle");
  await p.waitForTimeout(400);
  const trayN = await p.evaluate(() => document.querySelectorAll("#tray .kept").length);
  ok("#5 take → taken → idle, output delivered", trayN === 1 && (await p.evaluate(() => window.__states.photo.slice(-2).join(">"))) === "taken>idle");
  // shutter button prints content; ready + shutter → auto-take + new print
  await p.evaluate(() => {
    const ph = document.getElementById("photo");
    ph.setAttribute("develop-duration", "400");
    ph.recipe = { image: "./samples/sunset.svg", caption: "shutter" }; // shutter prints prepared content when the selfie camera is off
  });
  const shut = await p.evaluateHandle(() => document.getElementById("photo").shadowRoot.querySelector(".te-shutter-hit"));
  await shut.click();
  await waitState(p, "photo", "ready");
  await shut.click();
  await waitState(p, "photo", "ejecting");
  await waitState(p, "photo", "ready");
  ok("shutter while ready takes old photo and prints a new one", (await p.evaluate(() => document.querySelectorAll("#tray .kept").length)) >= 2);
  // tap to take
  const card2 = await p.evaluateHandle(() => document.getElementById("photo").shadowRoot.querySelector(".te-card"));
  await card2.click();
  await waitState(p, "photo", "idle");
  ok("tap photo to take", true);
  // stress: hammer shutter 10 times
  for (let i = 0; i < 10; i++) { await shut.click({ delay: 5 }); await p.waitForTimeout(40); }
  await waitState(p, "photo", "ready");
  const cards = await p.evaluate(() => document.getElementById("photo").shadowRoot.querySelectorAll(".te-card").length);
  ok("#6 rapid shutter mashing leaves exactly one card", cards === 1, `cards=${cards}`);
  await p.evaluate(() => document.getElementById("photo").reset());
  ok("reset() returns to idle", (await state(p, "photo")) === "idle");
  // #1 direct API without QR, Blob input
  const blobOk = await p.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = c.height = 200;
    const g = c.getContext("2d"); g.fillStyle = "#c66"; g.fillRect(0, 0, 200, 200);
    const b = await new Promise((r) => c.toBlob(r));
    return document.getElementById("photo").print(b);
  });
  ok("#1 print(Blob) via code", blobOk === true);
  const exp = await p.evaluate(async () => (await document.getElementById("photo").exportCard()).size);
  ok("exportCard returns a PNG", exp > 10000, `${exp} bytes`);
  // error path: bad image
  await p.evaluate(() => document.getElementById("photo").reset());
  const bad = await p.evaluate(() => document.getElementById("photo").print({ image: "./nope.png" }));
  ok("bad image → false, back to idle", bad === false && (await state(p, "photo")) === "idle");

  // ---------------- desktop: Instant Camera (fake device)
  await p.click("#cam-toggle");
  await p.waitForFunction(() => document.getElementById("camera").cameraState === "live", null, { timeout: 8000 });
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/c0-live.png` });
  const camShut = await p.evaluateHandle(() => document.getElementById("camera").shadowRoot.querySelector(".te-shutter-hit"));
  await camShut.click();
  await waitState(p, "camera", "ejecting");
  await p.waitForTimeout(900);
  await p.screenshot({ path: `${OUT}/c1-ejecting.png` });
  await waitState(p, "camera", "ready");
  await p.screenshot({ path: `${OUT}/c2-ready.png` });
  const camSeq = await p.evaluate(() => window.__states.camera.join(">"));
  ok("#7 camera frame uses the same eject/develop flow", camSeq === "shutter>flash>ejecting>developing>ready", camSeq);
  const sameEngine = await p.evaluate(() => document.getElementById("camera").engine.constructor === document.getElementById("photo").engine.constructor);
  ok("#7 same PhotoEngine class", sameEngine);
  const camFacing = await p.evaluate(() => [document.getElementById("camera").facing, document.getElementById("camera").mirror]);
  ok("Instant Camera asks for the back camera by default; laptop webcam (no facing info) is mirrored", camFacing[0] === "environment" && camFacing[1] === true, camFacing.join(","));
  // switching while live restarts once and comes back live (no double start / black screen)
  await p.evaluate(() => { window.__camStarts = 0; document.getElementById("camera").addEventListener("camerastate", (e) => { if (e.detail.state === "starting") window.__camStarts++; }); });
  await p.click("#cam-switch").catch(() => p.evaluate(() => document.getElementById("camera").switchCamera()));
  await p.waitForFunction(() => document.getElementById("camera").cameraState === "live", null, { timeout: 8000 });
  await p.waitForTimeout(300);
  const sw = await p.evaluate(() => [window.__camStarts, document.getElementById("camera").facing, document.getElementById("camera").shadowRoot.querySelector("video").videoWidth]);
  ok("switchCamera() restarts the camera exactly once and stays live", sw[0] === 1 && sw[1] === "user" && sw[2] > 0, sw.join(","));
  const swBtn = await p.evaluate(() => document.getElementById("cam-switch").disabled);
  ok("single-camera device: switch control is disabled", swBtn === true);
  // opening the Instant Photo selfie camera turns Instant Camera off (one camera at a time)
  await p.evaluate(() => document.getElementById("photo").startCamera());
  await p.waitForFunction(() => document.getElementById("photo").cameraState === "live", null, { timeout: 8000 });
  ok("one camera at a time on the demo page", (await p.evaluate(() => document.getElementById("camera").cameraState)) === "off");
  await p.evaluate(() => { document.getElementById("photo").stopCamera(); document.getElementById("camera").stopCamera(); });

  // ---------------- Instant Photo selfie lens + fisheye
  await p.evaluate(() => { const ph = document.getElementById("photo"); ph.reset(); ph.recipe = null; });
  const lensHit = await p.evaluateHandle(() => document.getElementById("photo").shadowRoot.querySelector(".te-lens-hit"));
  await lensHit.click();
  await p.waitForFunction(() => document.getElementById("photo").cameraState === "live", null, { timeout: 8000 });
  await p.waitForTimeout(600);
  const lensPx = await p.evaluate(() => {
    const ph = document.getElementById("photo");
    const c = ph.shadowRoot.querySelector(".te-lens-live canvas");
    return { live: ph.engine.stage.classList.contains("lens-live"), w: c?.width || 0, op: getComputedStyle(ph.shadowRoot.querySelector(".te-lens-live")).opacity };
  });
  ok("Instant Photo: tapping the lens shows the live camera inside the lens", lensPx.live && lensPx.w > 0, JSON.stringify(lensPx));
  await p.screenshot({ path: `${OUT}/s0-lens-live.png` });
  const shutP = await p.evaluateHandle(() => document.getElementById("photo").shadowRoot.querySelector(".te-shutter-hit"));
  await shutP.click();
  await waitState(p, "photo", "ready");
  await p.screenshot({ path: `${OUT}/s1-selfie-ready.png` });
  const meta = await p.evaluate(() => document.getElementById("photo").engine.recipe.metadata);
  ok("Instant Photo: shutter takes a fisheye selfie through the same engine", meta?.source === "selfie" && meta?.fisheye > 0, JSON.stringify({ s: meta?.source, f: meta?.fisheye }));
  await p.evaluate(() => document.getElementById("photo").setAttribute("selfie", "off"));
  const off = await p.evaluate(() => [document.getElementById("photo").cameraState, document.getElementById("photo").shadowRoot.querySelector(".te-lens-hit").hidden]);
  ok('selfie="off" turns Instant Photo into a print-only camera', off[0] === "off" && off[1] === true, off.join(","));

  // ---------------- lifecycle: removing a camera releases everything; it works again when re-added
  await p.evaluate(() => document.getElementById("photo").setAttribute("selfie", ""));
  await p.evaluate(() => document.getElementById("photo").startCamera());
  await p.waitForFunction(() => document.getElementById("photo").cameraState === "live", null, { timeout: 8000 });
  const rel = await p.evaluate(async () => {
    const ph = document.getElementById("photo");
    const cam = ph._cam, track = cam._stream.getVideoTracks()[0], view = ph._view, parent = ph.parentNode, next = ph.nextSibling;
    ph.remove();
    const after = { track: track.readyState, destroyed: cam.destroyed, gl: view.gl === null, camRef: ph._cam === null, state: ph.cameraState, canvas: !ph.shadowRoot.querySelector(".te-lens-live canvas") };
    parent.insertBefore(ph, next);
    const st = await ph.startCamera();
    return { ...after, restarted: st };
  });
  ok("Instant Photo removed while live: track stopped, camera destroyed, WebGL freed", rel.track === "ended" && rel.destroyed && rel.gl && rel.camRef && rel.state === "off" && rel.canvas, JSON.stringify(rel));
  ok("Instant Photo re-added: selfie camera works again", rel.restarted === "live");
  await p.evaluate(() => document.getElementById("photo").stopCamera());

  await p.evaluate(() => document.getElementById("camera").startCamera());
  await p.waitForFunction(() => document.getElementById("camera").cameraState === "live", null, { timeout: 8000 });
  const rel2 = await p.evaluate(async () => {
    const c = document.getElementById("camera");
    const cam = c._cam, track = cam._stream.getVideoTracks()[0], video = cam.video, parent = c.parentNode, next = c.nextSibling;
    c.remove();
    const after = { track: track.readyState, destroyed: cam.destroyed, videoGone: !video.isConnected && !video.srcObject, state: c.cameraState };
    parent.insertBefore(c, next);
    const st = await c.startCamera();
    const ok = c.shadowRoot.querySelector(".te-preview video")?.videoWidth > 0;
    c.stopCamera();
    return { ...after, restarted: st, ok };
  });
  ok("Instant Camera removed while live: track stopped, <video> released; works again when re-added", rel2.track === "ended" && rel2.destroyed && rel2.videoGone && rel2.state === "off" && rel2.restarted === "live" && rel2.ok, JSON.stringify(rel2));

  // ---------------- abnormal stream end (camera taken away / unplugged)
  await p.evaluate(() => document.getElementById("photo").startCamera());
  await p.waitForFunction(() => document.getElementById("photo").cameraState === "live", null, { timeout: 8000 });
  const ab = await p.evaluate(async () => {
    const ph = document.getElementById("photo");
    const cam = ph._cam, track = cam._stream.getVideoTracks()[0];
    track.dispatchEvent(new Event("ended"));
    await new Promise((r) => setTimeout(r, 50));
    return { state: ph.cameraState, stream: cam._stream === null, track: track.readyState, src: cam.video.srcObject === null, live: ph.engine.stage.classList.contains("lens-live"), resume: cam._resume, err: cam.error?.name };
  });
  ok("stream ended unexpectedly → off, tracks + <video> released, no auto-resume", ab.state === "off" && ab.stream && ab.track === "ended" && ab.src && !ab.live && ab.resume === false, JSON.stringify(ab));

  // ---------------- churn: create/remove 24 selfie cameras; no WebGL context pile-up
  p.webglWarnings = 0;
  p.on("console", (m) => { if (/Too many active WebGL contexts/i.test(m.text())) p.webglWarnings++; });
  const churn = await p.evaluate(async () => {
    for (let i = 0; i < 24; i++) {
      const e = document.createElement("instant-photo");
      e.setAttribute("selfie", "");
      document.body.append(e);
      await e.whenReady();
      await e.startCamera();
      await new Promise((r) => requestAnimationFrame(r));
      e.remove();
    }
    const last = document.createElement("instant-photo");
    last.setAttribute("selfie", "");
    document.body.append(last);
    await last.whenReady();
    const st = await last.startCamera();
    await new Promise((r) => setTimeout(r, 200));
    const ok = !!last._view?.ok && !last._view.gl.isContextLost();
    last.remove();
    return { st, ok };
  });
  ok("24 create/remove cycles: no WebGL context warnings, the next one still renders", p.webglWarnings === 0 && churn.st === "live" && churn.ok, JSON.stringify({ ...churn, warnings: p.webglWarnings }));

  // ---------------- P1: removed while the camera code is still loading
  const race = await p.evaluate(async () => {
    let added = 0, removed = 0;
    const add = document.addEventListener, rem = document.removeEventListener;
    document.addEventListener = function (t, ...a) { if (t === "visibilitychange") added++; return add.call(this, t, ...a); };
    document.removeEventListener = function (t, ...a) { if (t === "visibilitychange") removed++; return rem.call(this, t, ...a); };
    const e = document.createElement("instant-photo");
    e.setAttribute("selfie", "");
    document.body.append(e);
    await e.whenReady();
    const pending = e._ensureCamera();  // camera code loading (dynamic import in flight)…
    e.remove();                          // …and the element is gone before it resolves
    const cam = await pending;
    await new Promise((r) => setTimeout(r, 50));
    document.addEventListener = add; document.removeEventListener = rem;
    return { cam, kept: e._cam, added, removed, state: e.cameraState };
  });
  ok("P1: removed while camera code loads → camera discarded, listener released", race.cam === null && race.kept == null && race.added === 1 && race.removed === 1 && race.state === "off", JSON.stringify(race));

  // ---------------- P2: a stream that never delivers a frame → error, and the camera is released
  const nf = await p.evaluate(async () => {
    const cam = document.getElementById("camera");
    await cam.whenReady();
    const src = cam._ensureCamera();
    Object.defineProperty(src.video, "videoWidth", { get: () => 0, configurable: true }); // "no picture"
    const st = await cam.startCamera();
    const track = src.video.srcObject;
    const out = { st, srcObject: track === null, stream: src._stream === null, err: src.error?.name };
    delete src.video.videoWidth;
    return out;
  });
  ok("P2: stream without video frames → error, stream released (camera light off)", nf.st === "error" && nf.srcObject && nf.stream && nf.err === "NotReadableError", JSON.stringify(nf));
  ok("no page errors (desktop)", p.errors.length === 0, p.errors.join(" | "));
  await p.context().close();

  // ---------------- #8 camera denied
  const b2 = await chromium.launch({ args: ["--use-fake-device-for-media-stream"] });
  p = await page(b2, { route: (pg) => pg.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
  }) });
  await p.click("#tab-camera").catch(() => {});
  await p.evaluate(() => document.getElementById("camera").startCamera());
  const cs = await p.evaluate(() => document.getElementById("camera").cameraState);
  await p.screenshot({ path: `${OUT}/c3-denied.png` });
  ok("#8 permission denied → fallback state", cs === "denied", cs);
  const photoStill = await p.evaluate(() => document.getElementById("photo").print({ image: "./samples/lake.svg" }));
  ok("#8 rest of family still works after denial", photoStill === true);
  // fallback: pick a photo
  const [chooser] = await Promise.all([
    p.waitForEvent("filechooser"),
    p.evaluate(() => document.getElementById("camera").shadowRoot.querySelector(".te-screen-ui button").click()),
  ]).catch(() => [null]);
  if (chooser) {
    await chooser.setFiles(SAMPLE_FILE);
    await waitState(p, "camera", "ready");
    ok("#8 fallback: pick photo prints through camera", true);
  } else {
    // the first button is "retry"; find "pick"
    const picked = await Promise.all([
      p.waitForEvent("filechooser"),
      p.evaluate(() => [...document.getElementById("camera").shadowRoot.querySelectorAll(".te-screen-ui button")].find((b) => b.textContent.includes("Choose")).click()),
    ]);
    await picked[0].setFiles(SAMPLE_FILE);
    await waitState(p, "camera", "ready");
    ok("#8 fallback: pick photo prints through camera", true);
  }
  await p.screenshot({ path: `${OUT}/c4-fallback-ready.png` });
  await b2.close();

  // ---------------- selfie is opt-in: a plain <instant-photo> never touches the camera
  p = await page(browser, { url: URL0.replace("index.html", "tests/fixtures/print-only.html"), skipWait: true });
  await p.waitForFunction(() => document.getElementById("p")?.getAttribute("state") === "idle");
  const po = await p.evaluate(async () => {
    let gum = 0;
    const orig = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    if (orig) navigator.mediaDevices.getUserMedia = (...a) => { gum++; return orig(...a); };
    const el = document.getElementById("p");
    const hit = el.shadowRoot.querySelector(".te-lens-hit");
    const started = await el.startCamera();
    const printed = await el.pressShutter();          // prints its src
    const kit = performance.getEntriesByType("resource").some((r) => r.name.includes("camera-kit"));
    return { lensHidden: !hit || hit.hidden, started, printed, gum, kit, cam: el.cameraState };
  });
  ok("<instant-photo> without `selfie`: no lens button, no camera request, camera code not loaded, shutter prints", po.lensHidden && po.started === "off" && po.printed === true && po.gum === 0 && !po.kit && po.cam === "off", JSON.stringify(po));
  await p.context().close();

  // ---------------- QR via URL
  p = await page(browser, { url: URL0 + "?spot=sunset" });
  await waitState(p, "photo", "ready");
  const href = await p.evaluate(() => location.search);
  ok("QR ?spot=sunset prints and clears the param", href === "", href);
  await p.context().close();

  // ---------------- #10 QR adapter removed
  p = await page(browser, { url: URL0 + "?spot=sunset", route: (pg) => pg.route("**/triggers/qr/**", (r) => r.fulfill({ status: 404, body: "" })) });
  await p.click(".sample >> nth=1");
  await waitState(p, "photo", "ready");
  const qrGone = await p.evaluate(() => !document.getElementById("qr-links"));
  ok("#10 without QR adapter the external-image flow works", qrGone, "");
  await p.context().close();

  // ---------------- mobile
  const iphone = devices["iPhone 13"];
  p = await page(browser, { ctx: { ...iphone } });
  await p.screenshot({ path: `${OUT}/m0-idle.png`, fullPage: true });
  await p.tap(".sample >> nth=2");
  await waitState(p, "photo", "developing");
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/m1-developing.png` });
  await waitState(p, "photo", "ready");
  await p.screenshot({ path: `${OUT}/m2-ready.png` });
  const c3 = await p.evaluateHandle(() => document.getElementById("photo").shadowRoot.querySelector(".te-card"));
  await c3.tap();
  await waitState(p, "photo", "idle");
  ok("mobile: tap to take", true);
  await p.tap("#tab-camera");
  await p.tap("#cam-toggle");
  await p.waitForFunction(() => document.getElementById("camera").cameraState === "live", null, { timeout: 8000 });
  await p.waitForTimeout(400);
  const cs2 = await p.evaluateHandle(() => document.getElementById("camera").shadowRoot.querySelector(".te-shutter-hit"));
  await cs2.tap();
  await waitState(p, "camera", "ready");
  await p.screenshot({ path: `${OUT}/m3-camera-ready.png` });
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  ok("mobile: no horizontal overflow", !overflow);
  const imgW = await p.evaluate(() => [...document.getElementById("camera").shadowRoot.querySelectorAll("img.te-layer")].map((i) => i.currentSrc.split("@")[1]).join(","));
  const sharp = await p.evaluate(() => [...document.getElementById("camera").shadowRoot.querySelectorAll("img.te-layer")].every((i) => +i.dataset.w * +i.currentSrc.match(/@(\d)x/)[1] >= i.getBoundingClientRect().width * devicePixelRatio * 0.98));
  ok("mobile: every layer has enough pixels for a 3x screen", sharp, imgW.slice(0, 30));
  ok("no page errors (mobile)", p.errors.length === 0, p.errors.join(" | "));
  await p.context().close();

  await browser.close();
  console.log(results.join("\n"));
})().catch((e) => { console.error(e); console.log(results.join("\n")); process.exit(1); });
