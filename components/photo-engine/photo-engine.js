// Photo Engine — shared physical illusion + lifecycle for the Instant Photo family.
//
// idle → shutter → flash → ejecting → developing → ready → taken → idle
//
// The engine builds the layered camera from a skin, owns the state machine,
// the film card, ejection / developing motion and the take-away gesture.
// It knows nothing about QR codes, camera permissions or product logic.

import { el, pct, sleep, loadImage, prefersReducedMotion } from "./util.js";
import { shutterCue, motorCue, takeCue } from "./sound.js";
import { renderCard, canvasToBlob } from "./render-card.js";

export const STATES = ["idle", "shutter", "flash", "ejecting", "developing", "ready", "taken"];

export const DEFAULT_TIMING = {
  shutter: 110,   // shutter travel before the flash fires
  flash: 170,     // flash lamp on
  eject: 1700,    // paper leaves the slot
  develop: 3600,  // image emerges
  take: 460,      // photo leaves the hand
};

const ABORT = Symbol("abort");

/** Accepts a PhotoRecipe, an image URL, or a Blob/File. */
export function normalizeRecipe(input) {
  if (!input) throw new Error("print() needs a PhotoRecipe or an image");
  if (typeof input === "string") return { image: input };
  if (input instanceof Blob) return { image: URL.createObjectURL(input), metadata: { blob: input } };
  if (input.image instanceof Blob) return { ...input, image: URL.createObjectURL(input.image) };
  if (!input.image) throw new Error("PhotoRecipe.image is required");
  return { ...input };
}

export class PhotoEngine extends EventTarget {
  /**
   * @param {HTMLElement} container  where the stage is built (usually a shadow root)
   * @param {object} skin            result of loadSkin()
   * @param {object} [options]
   *   variant: "photo" | "camera"
   *   timing: Partial<DEFAULT_TIMING>
   *   sound: boolean, haptics: boolean, screenFlash: boolean
   *   onShutter: () => void         called when the on-camera shutter is clicked
   *   labels: { shutter, take }
   */
  constructor(container, skin, options = {}) {
    super();
    this.skin = skin;
    this.variant = options.variant || "photo";
    this.options = { sound: false, haptics: true, screenFlash: true, ...options };
    this.timing = { ...DEFAULT_TIMING, ...(options.timing || {}) };
    this.state = "idle";
    this.recipe = null;
    this._run = 0;
    this._busy = false;
    this._anims = new Set();
    this._imgs = [];
    this._card = null;
    this._image = null;
    this._build(container);
  }

  // ------------------------------------------------------------------ public

  /** Run the full print sequence. Resolves true when the photo is ready, false if refused/aborted. */
  async print(input) {
    const recipe = normalizeRecipe(input);
    if (this.state === "ready") await this.take();
    if (this._busy) return false;
    this._busy = true;
    const run = ++this._run;
    const T = this.timing;
    const imageP = loadImage(recipe.image);
    imageP.catch(() => {});

    try {
      await this.ready;
      this._check(run);

      // shutter
      this._setState("shutter");
      this.stage.classList.add("pressed");
      this._recoil();
      if (this.options.sound) shutterCue();
      if (this.options.haptics) navigator.vibrate?.(12);
      await this._wait(T.shutter, run);

      // flash
      this._setState("flash");
      this.stage.classList.add("flash");
      this._screenFlash();
      await this._wait(T.flash, run);
      this.stage.classList.remove("flash", "pressed");

      // the image may still be loading (e.g. remote content)
      let image;
      try {
        image = await imageP;
      } catch (err) {
        this._check(run);
        this._fail(err);
        return false;
      }
      this._check(run);
      this.recipe = recipe;
      this._image = image;

      // ejecting
      this._setState("ejecting");
      const card = this._makeCard(recipe, image);
      this._card = card;
      this.clip.append(card);
      await this._eject(card, run);

      // developing
      this._setState("developing");
      await this._develop(card, run);

      // ready
      this.clip.classList.add("free");
      card.tabIndex = 0;
      this._setState("ready");
      this._emit("ready", { recipe });
      return true;
    } catch (err) {
      if (err === ABORT) return false;
      this._fail(err);
      return false;
    }
  }

  /** Take the ready photo away. `drag` = { dx, dy } in px if it was dragged. */
  async take(drag = {}) {
    if (this.state !== "ready" || !this._card) return false;
    const run = this._run;
    const card = this._card;
    const recipe = this.recipe;
    const image = this._image;
    this._setState("taken");
    if (this.options.sound) takeCue();

    const dx = drag.dx || 0, dy = drag.dy || 0;
    let ux = dx, uy = dy;
    const len = Math.hypot(ux, uy);
    if (len < 6) { ux = 0.22; uy = 1; } // tap: pull straight-ish down
    const n = Math.hypot(ux, uy);
    ux /= n; uy /= n;
    const dist = this.stage.clientHeight * 0.75;
    const r0 = dx * 0.04;
    const a = this._track(card.animate(
      [
        { translate: `${dx}px ${dy}px`, rotate: `${r0}deg`, opacity: 1 },
        { translate: `${dx + ux * dist}px ${dy + uy * dist}px`, rotate: `${r0 + ux * 16 + 4}deg`, opacity: 0 },
      ],
      { duration: prefersReducedMotion() ? 160 : this.timing.take, easing: "cubic-bezier(.3,.1,.55,1)", fill: "forwards" }
    ));
    try { await a.finished; } catch {}
    if (run !== this._run) return false;
    card.remove();
    this._card = null;
    this.clip.classList.remove("free");
    this._emit("taken", this._output(recipe, image));
    this._busy = false;
    this._setState("idle");
    return true;
  }

  /** Abort anything in flight and return to idle without emitting "taken". */
  reset() {
    this._run++;
    for (const a of this._anims) { try { a.cancel(); } catch {} }
    this._anims.clear();
    this._stopMotor?.();
    this._card?.remove();
    this._card = null;
    this.clip.classList.remove("free");
    this.stage.classList.remove("flash", "pressed");
    this._busy = false;
    if (this.state !== "idle") this._setState("idle");
  }

  /** Render the current (ready) photo to a Blob — for saving or sharing. */
  async exportCard(type = "image/png", scale = 3) {
    if (!this.recipe || !this._image) throw new Error("No photo to export");
    return canvasToBlob(await renderCard(this.skin, this.recipe, { scale, image: this._image }), type);
  }

  get busy() { return this._busy; }

  destroy() {
    this.reset();
    this._ro?.disconnect();
    this.stage.remove();
  }

  // ------------------------------------------------------------------ build

  _build(container) {
    const skin = this.skin;
    const A = skin.stage;
    const L = skin.layout;
    const stage = el("div", "te-stage loading");
    stage.dataset.state = "idle";
    stage.dataset.variant = this.variant;
    stage.style.setProperty("--te-slot", pct(L.slotLine.y, A.h));
    stage.style.setProperty("--te-caption-font", L.film.captionFont || "cursive");
    this.stage = stage;

    const place = (node, b) => {
      node.style.left = pct(b.x, A.w);
      node.style.top = pct(b.y, A.h);
      node.style.width = pct(b.w, A.w);
      node.style.height = pct(b.h, A.h);
      return node;
    };
    const layer = (name, cls = "") => {
      if (!skin.has(name)) return null;
      const b = skin.box(name);
      const img = el("img", `te-layer ${cls}`, {
        alt: "",
        draggable: "false",
        decoding: "async",
        srcset: skin.srcset(name, b.w),
        sizes: "1px",
      });
      img.dataset.w = b.w;
      this._imgs.push(img);
      return place(img, b);
    };
    this._place = place;

    const shadow = layer("shared/body-shadow", "te-shadow");
    const body = el("div", "te-body");
    this.body = body;
    const clip = el("div", "te-clip");
    this.clip = clip;

    const parts = [
      layer("shared/body-shell", "te-shell"),
      layer("shared/slot-cavity", "te-cavity"),
      clip,
      layer("shared/slot-lip", "te-lip"),
    ];
    if (this.variant === "camera") {
      const sr = L.screenRect;
      const preview = place(el("div", "te-preview"), sr);
      preview.style.borderRadius = `${pct(sr.radius, sr.w)} / ${pct(sr.radius, sr.h)}`;
      const ui = place(el("div", "te-screen-ui", { "aria-live": "polite" }), sr);
      this.previewSlot = preview;
      this.screenUi = ui;
      this.screenOff = layer("instant-camera/screen-off", "te-screen-off");
      parts.push(
        layer("instant-camera/front-panel", "te-panel"),
        preview,
        this.screenOff,
        layer("instant-camera/screen-glass", "te-screen-glass"),
        layer("instant-camera/screen-frame", "te-screen-frame"),
        ui
      );
    } else {
      // optional live-lens slot: a circle over the lens glass where a component may
      // show something (e.g. a selfie feed). Sits under the glint so the glass reflects.
      let lensSlot = null;
      if (L.lensGlass) {
        const g = L.lensGlass;
        lensSlot = place(el("div", "te-lens-live"), { x: g.x - g.r, y: g.y - g.r, w: g.r * 2, h: g.r * 2 });
        this.lensSlot = lensSlot;
      }
      parts.push(
        layer("instant-photo/front-panel", "te-panel"),
        layer("instant-photo/lens", "te-lens"),
        lensSlot,
        layer("instant-photo/lens-glint", "te-lens-glint")
      );
    }
    parts.push(
      layer("shared/flash-housing", "te-flash-housing"),
      layer("shared/flash-lamp-off", "te-lamp-off"),
      layer("shared/flash-lamp-on", "te-lamp-on"),
      layer("shared/shutter-normal", "te-shutter-normal"),
      layer("shared/shutter-pressed", "te-shutter-pressed"),
      layer("shared/flash-glow", "te-glow")
    );

    // shutter hit area: generous touch target around the button
    const s = L.shutterCenter;
    const hr = Math.max(s.r * 1.45, 24);
    const hit = place(
      el("button", "te-shutter-hit", { type: "button", "aria-label": this.options.labels?.shutter || "Shutter" }),
      { x: s.x - hr, y: s.y - hr, w: hr * 2, h: hr * 2 }
    );
    const canPress = () => !this._busy || this.state === "ready";
    hit.addEventListener("pointerdown", () => { if (canPress()) stage.classList.add("pressed"); });
    const release = () => { if (this.state !== "shutter") stage.classList.remove("pressed"); };
    hit.addEventListener("pointerup", release);
    hit.addEventListener("pointercancel", release);
    hit.addEventListener("pointerleave", release);
    hit.addEventListener("click", () => this.options.onShutter?.());
    parts.push(hit);
    this.shutterButton = hit;

    body.append(...parts.filter(Boolean));
    stage.append(...[shadow, body].filter(Boolean));
    container.append(stage);

    // pick the right resolution for the rendered size
    const updateSizes = (w) => {
      if (!w) return;
      for (const img of this._imgs) img.sizes = `${Math.ceil((w * img.dataset.w) / A.w)}px`;
    };
    updateSizes(stage.getBoundingClientRect().width || 360);
    if ("ResizeObserver" in window) {
      this._ro = new ResizeObserver((entries) => updateSizes(entries[0].contentRect.width));
      this._ro.observe(stage);
    }

    this.ready = Promise.all(
      this._imgs.map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()))
    ).then(() => {
      stage.classList.remove("loading");
    });
  }

  _makeCard(recipe, image) {
    const skin = this.skin;
    const f = skin.film;
    const C = f.card;
    const L = skin.layout;
    const card = this._place(
      el("div", "te-card", { role: "button", tabindex: "-1", "aria-label": this.options.labels?.take || "Take photo" }),
      { x: L.photoReady.x, y: L.photoReady.y, w: C.w, h: C.h }
    );
    const inCard = (node, b) => {
      node.style.left = pct(b.x, C.w);
      node.style.top = pct(b.y, C.h);
      node.style.width = pct(b.w, C.w);
      node.style.height = pct(b.h, C.h);
      return node;
    };
    const cardW = Math.ceil((this.stage.clientWidth * C.w) / skin.stage.w) || C.w;
    const filmImg = (name, cls) =>
      el("img", cls, { alt: "", draggable: "false", srcset: skin.srcset(name, C.w), sizes: `${cardW}px` });

    if (f.shadow) {
      const sh = el("img", "te-film-shadow", {
        alt: "", draggable: "false",
        srcset: skin.srcset(skin.filmShadow, f.shadow.w),
        sizes: `${Math.ceil((cardW * f.shadow.w) / C.w)}px`,
      });
      card.append(inCard(sh, f.shadow));
    }
    const paper = recipe.frame
      ? el("img", "te-paper", { alt: "", draggable: "false", src: recipe.frame })
      : filmImg(skin.filmPaper, "te-paper");
    const win = inCard(el("div", "te-win"), f.photoWindow);
    const photo = el("img", "te-photo", { alt: recipe.title || recipe.caption || "", draggable: "false", src: image.src });
    const tex = el("div", "te-tex");
    tex.style.backgroundImage = `url("${skin.developTexture}")`;
    win.append(photo, tex);
    card.append(paper, win, filmImg(skin.filmGloss, "te-gloss"));

    if (recipe.caption || recipe.date) {
      const cap = inCard(el("div", "te-cap"), f.captionArea);
      cap.append(el("span", "te-t", { text: recipe.caption || "" }));
      if (recipe.date) cap.append(el("span", "te-d", { text: recipe.date }));
      card.append(cap);
    }
    if (recipe.stamp) {
      const ca = f.captionArea, pw = f.photoWindow;
      const size = ca.h * 1.25;
      card.append(inCard(el("img", "te-stamp", { alt: "", draggable: "false", src: recipe.stamp }), {
        x: ca.x + ca.w - size, y: pw.y + pw.h - size * 0.55, w: size, h: size,
      }));
    }

    const startShift = ((L.photoStart.y - L.photoReady.y) / C.h) * 100;
    card.style.translate = `0 ${startShift}%`;
    card._parts = { photo, tex };
    card._startShift = startShift;
    this._bindDrag(card);
    return card;
  }

  // ------------------------------------------------------------------ motion

  async _eject(card, run) {
    const T = this.timing.eject;
    const reduce = prefersReducedMotion();
    const s = card._startShift;
    const eject = this._track(card.animate(
      reduce
        ? [{ translate: `0 ${s}%` }, { translate: "0 0" }]
        : [
            { translate: `0 ${s}%`, easing: "cubic-bezier(.45,0,.3,1)" },
            { translate: "0 -1.4%", offset: 0.86, easing: "ease-out" },
            { translate: "0 0.7%", offset: 0.95, easing: "ease-in-out" },
            { translate: "0 0" },
          ],
      { duration: T, fill: "forwards" }
    ));
    if (!reduce) {
      const steps = Math.max(1, Math.round(T / 110));
      this._track(this.body.animate(
        [
          { translate: "0 0" },
          { translate: "0.12% 0.08%" },
          { translate: "-0.1% 0" },
          { translate: "0.08% -0.06%" },
          { translate: "0 0" },
        ],
        { duration: 110, iterations: steps, easing: "linear" }
      ));
    }
    this._stopMotor = this.options.sound ? motorCue(T) : null;
    if (this.options.haptics && !reduce) navigator.vibrate?.([8, 70, 8, 70, 8, 70, 8]);
    await this._finish(eject, run);
    this._stopMotor = null;
    eject.cancel();
    card.style.translate = "0 0";
    if (!reduce) {
      // the paper settles and sways a little as it hangs from the slot
      this._track(card.animate(
        [{ rotate: "0deg" }, { rotate: "0.9deg" }, { rotate: "-0.55deg" }, { rotate: "0.25deg" }, { rotate: "0deg" }],
        { duration: 1100, easing: "ease-out" }
      ));
    }
  }

  async _develop(card, run) {
    const T = this.timing.develop;
    const { photo, tex } = card._parts;
    const dev = this._track(photo.animate(
      [
        { opacity: 0, filter: "blur(7px) saturate(0) brightness(1.55) contrast(.45) sepia(.35)" },
        { opacity: 0.45, filter: "blur(3.5px) saturate(.25) brightness(1.35) contrast(.6) sepia(.3)", offset: 0.35 },
        { opacity: 0.85, filter: "blur(1px) saturate(.7) brightness(1.1) contrast(.85) sepia(.12)", offset: 0.72 },
        { opacity: 1, filter: "blur(0px) saturate(1) brightness(1) contrast(1) sepia(0)" },
      ],
      { duration: T, easing: "ease-in-out", fill: "forwards" }
    ));
    this._track(tex.animate([{ opacity: 0.75 }, { opacity: 0.35, offset: 0.5 }, { opacity: 0 }], {
      duration: T, easing: "ease-in", fill: "forwards",
    }));
    await this._finish(dev, run);
    photo.style.opacity = "1";
    tex.style.opacity = "0";
  }

  _recoil() {
    if (prefersReducedMotion()) return;
    this._track(this.body.animate(
      [
        { translate: "0 0", scale: "1" },
        { translate: "0 0.45%", scale: "0.992", offset: 0.35 },
        { translate: "0 0", scale: "1" },
      ],
      { duration: 240, easing: "cubic-bezier(.2,.7,.3,1)" }
    ));
  }

  _screenFlash() {
    if (!this.options.screenFlash) return;
    const o = document.createElement("div");
    Object.assign(o.style, {
      position: "fixed", inset: "0", background: "#fffdf6",
      pointerEvents: "none", zIndex: "2147483646", opacity: "0",
    });
    document.body.appendChild(o);
    const peak = prefersReducedMotion() ? 0.15 : 0.5;
    o.animate([{ opacity: peak }, { opacity: 0 }], { duration: 360, easing: "ease-out" })
      .finished.catch(() => {}).finally(() => o.remove());
  }

  _bindDrag(card) {
    let start = null, last = null, vx = 0, vy = 0;
    const off = (e) => ({ dx: e.clientX - start.x, dy: e.clientY - start.y });

    card.addEventListener("pointerdown", (e) => {
      if (this.state !== "ready" || (e.button ?? 0) > 0) return;
      e.preventDefault();
      card.setPointerCapture?.(e.pointerId);
      start = { x: e.clientX, y: e.clientY };
      last = { x: e.clientX, y: e.clientY, t: performance.now() };
      vx = vy = 0;
      for (const a of card.getAnimations()) a.cancel();
      card.classList.add("dragging");
    });
    card.addEventListener("pointermove", (e) => {
      if (!start) return;
      const now = performance.now();
      const dt = Math.max(1, now - last.t);
      vx = (e.clientX - last.x) / dt;
      vy = (e.clientY - last.y) / dt;
      last = { x: e.clientX, y: e.clientY, t: now };
      const { dx, dy } = off(e);
      card.style.translate = `${dx}px ${dy}px`;
      card.style.rotate = `${dx * 0.04}deg`;
    });
    const end = (e, cancelled) => {
      if (!start) return;
      const { dx, dy } = off(e);
      start = null;
      card.classList.remove("dragging");
      const dist = Math.hypot(dx, dy);
      const speed = Math.hypot(vx, vy);
      const w = this.stage.clientWidth;
      if (!cancelled && dist < 6) return this.take();
      if (!cancelled && (dist > w * 0.16 || speed > 0.55)) return this.take({ dx, dy });
      // not far enough: spring back
      const back = card.animate(
        [{ translate: `${dx}px ${dy}px`, rotate: `${dx * 0.04}deg` }, { translate: "0 0", rotate: "0deg" }],
        { duration: 260, easing: "cubic-bezier(.3,1.4,.5,1)" }
      );
      card.style.translate = "0 0";
      card.style.rotate = "0deg";
      this._track(back);
    };
    card.addEventListener("pointerup", (e) => end(e, false));
    card.addEventListener("pointercancel", (e) => end(e, true));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.take(); }
    });
  }

  // ------------------------------------------------------------------ helpers

  _output(recipe, image) {
    const skin = this.skin;
    return {
      recipe,
      toCanvas: (scale = 3) => renderCard(skin, recipe, { scale, image }),
      toBlob: async (type = "image/png", scale = 3) =>
        canvasToBlob(await renderCard(skin, recipe, { scale, image }), type),
    };
  }

  _setState(state) {
    const prev = this.state;
    this.state = state;
    this.stage.dataset.state = state;
    this._emit("statechange", { state, prev });
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  _fail(error) {
    this._run++;
    for (const a of this._anims) { try { a.cancel(); } catch {} }
    this._anims.clear();
    this._card?.remove();
    this._card = null;
    this.clip.classList.remove("free");
    this.stage.classList.remove("flash", "pressed");
    this._busy = false;
    this._setState("idle");
    this._emit("error", { error });
  }

  _track(anim) {
    this._anims.add(anim);
    anim.finished.catch(() => {}).finally(() => this._anims.delete(anim));
    return anim;
  }

  _check(run) {
    if (run !== this._run) throw ABORT;
  }

  async _wait(ms, run) {
    await sleep(ms);
    this._check(run);
  }

  async _finish(anim, run) {
    try {
      await anim.finished;
    } catch {
      throw ABORT;
    }
    this._check(run);
  }
}
