// Projector mechanics without any DOM: power and lamp warm-up, the film's
// position and motion in Filmstrip mode, slide stepping in Cinema mode, reel
// rotation (synced to the film, the slides or a video) and the focus ring.
//
// One number is the shared reading position: `offset`, measured in frames.
// The current photo is round(offset) wrapped to the reel length, so both
// modes always agree on where you are. The reel loops endlessly.

export const MODES = ["filmstrip", "cinema"];
export const FRAME_DEG = 46; // reel rotation per frame of film travel

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wrap = (i, n) => (n > 0 ? ((Math.round(i) % n) + n) % n : 0);
const ease = (dt, tau) => 1 - Math.exp(-dt / tau);

export function createProjectorCore({
  count = 0,
  mode = "filmstrip",
  speed = 1,
  interval = 4,
  filmRate = 0.3, // frames per second at speed 1
} = {}) {
  const s = {
    power: false,
    lamp: 0,
    playing: false,
    mode: MODES.includes(mode) ? mode : "filmstrip",
    source: "photos", // what Cinema shows: photos | video
    count,
    hasVideo: false,
    offset: 0,
    vel: 0,
    target: null,
    dragging: false,
    clock: 0,
    speed,
    interval,
    filmRate,
    focus: 0,
    reelAngle: 0,
    reelOmega: 0,
    video: { playing: false, rate: 1, progress: 0 },
  };
  let lastIndex = 0;
  let lastState = "empty";
  const listeners = new Set();
  const emit = (type, detail = {}) => { for (const fn of listeners) fn(type, detail, api); };

  const index = () => wrap(s.offset, s.count);
  const hasContent = () => (s.mode === "cinema" && s.source === "video" ? s.hasVideo : s.count > 0);
  const running = () => s.power && s.playing && hasContent();

  function state() {
    if (!s.count && !s.hasVideo) return "empty";
    if (!s.power) return "off";
    return running() ? "playing" : "paused";
  }

  function checkEvents() {
    const i = index();
    if (s.count && i !== lastIndex) {
      lastIndex = i;
      emit("index", { index: i });
    }
    const st = state();
    if (st !== lastState) {
      const prev = lastState;
      lastState = st;
      emit("state", { state: st, prev });
    }
  }

  /** Nearest offset that shows photo i, preferring forward travel on ties. */
  function offsetFor(i, from = s.offset) {
    const n = s.count;
    if (!n) return 0;
    const base = Math.round(from);
    let d = wrap(i, n) - wrap(base, n);
    if (d > n / 2) d -= n;
    if (d < -n / 2) d += n;
    if (n % 2 === 0 && d === -n / 2) d = n / 2;
    return base + d;
  }

  const api = {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get state() { return state(); },
    get index() { return index(); },
    get running() { return running(); },
    get hasContent() { return hasContent(); },
    snapshot() { return { ...s, video: { ...s.video }, index: index(), state: state(), running: running() }; },

    /* ---- content */
    setCount(n, { keep = false } = {}) {
      const had = s.count;
      s.count = Math.max(0, n | 0);
      if (!keep) { s.offset = 0; s.vel = 0; s.target = null; s.clock = 0; }
      lastIndex = index();
      emit("reel", { count: s.count, previous: had });
      checkEvents();
    },
    setVideo(present) {
      s.hasVideo = !!present;
      if (!present) { s.video.playing = false; if (s.source === "video") s.source = "photos"; }
      checkEvents();
    },
    setSource(src) {
      const next = src === "video" ? "video" : "photos";
      if (next === "video" && !s.hasVideo) { emit("blocked", { reason: "no-video" }); return false; }
      if (next === s.source) return true;
      s.source = next;
      s.clock = 0;
      emit("source", { source: next });
      checkEvents();
      return true;
    },

    /* ---- controls */
    setPower(on) {
      on = !!on;
      if (on === s.power) return;
      s.power = on;
      emit("power", { on });
      checkEvents();
    },
    play() {
      if (!hasContent()) { emit("blocked", { reason: s.mode === "cinema" && s.source === "video" ? "no-video" : "empty" }); return false; }
      if (!s.power) api.setPower(true);
      if (!s.playing) { s.playing = true; s.clock = 0; emit("play"); }
      checkEvents();
      return true;
    },
    pause() {
      if (!s.playing) return false;
      s.playing = false;
      emit("pause");
      checkEvents();
      return true;
    },
    toggle() { return s.playing ? api.pause() : api.play(); },

    setMode(m) {
      if (!MODES.includes(m) || m === s.mode) return false;
      // land on a whole frame so both modes show the same photo
      s.offset = Math.round(s.offset);
      s.vel = 0;
      s.target = null;
      s.dragging = false;
      s.clock = 0;
      s.mode = m;
      emit("mode", { mode: m });
      checkEvents();
      return true;
    },

    /** Step to the next / previous photo (Cinema: a slide change). */
    step(dir = 1) {
      if (!s.count) { emit("blocked", { reason: "empty" }); return false; }
      dir = dir < 0 ? -1 : 1;
      s.clock = 0;
      if (s.mode === "cinema") {
        s.offset = Math.round(s.offset) + dir;
        s.reelOmega += 160 * dir;
        emit("slide", { dir, index: index() });
      } else {
        const from = s.target ?? s.offset;
        s.target = Math.round(from) + dir;
        s.dragging = false;
      }
      checkEvents();
      return true;
    },
    next() { return api.step(1); },
    prev() { return api.step(-1); },

    /** Bring photo i to the gate (Filmstrip glides there; Cinema cuts). */
    goTo(i, { instant = false } = {}) {
      if (!s.count) return false;
      const t = offsetFor(i);
      s.clock = 0;
      if (instant || s.mode === "cinema") {
        const dir = Math.sign(t - s.offset) || 1;
        s.offset = t;
        s.vel = 0;
        s.target = null;
        if (s.mode === "cinema") emit("slide", { dir, index: index() });
      } else {
        s.target = t;
        s.dragging = false;
      }
      checkEvents();
      return true;
    },

    /* ---- direct manipulation of the film (Filmstrip) */
    grab() { s.dragging = true; s.target = null; s.vel = 0; },
    drag(offset, vel = 0) {
      if (!s.dragging) return;
      s.reelAngle += (offset - s.offset) * FRAME_DEG;
      s.offset = offset;
      s.vel = vel;
      checkEvents();
    },
    release(vel = s.vel) {
      if (!s.dragging) return;
      s.dragging = false;
      s.vel = clamp(vel, -12, 12);
    },
    nudge(frames) {
      // wheel / trackpad: move the film directly
      s.target = null;
      s.reelAngle += frames * FRAME_DEG;
      s.offset += frames;
      s.vel = 0;
      checkEvents();
    },

    setFocus(v) { s.focus = clamp(Number(v) || 0, -1, 1); },
    get focus() { return s.focus; },
    setSpeed(v) { s.speed = clamp(Number(v) || 1, 0.1, 6); },
    setInterval(v) { s.interval = clamp(Number(v) || 4, 0.5, 120); },

    /** The host reports what the <video> is doing. */
    setVideoState({ playing, rate, progress } = {}) {
      if (playing !== undefined) s.video.playing = !!playing;
      if (rate !== undefined) s.video.rate = rate;
      if (progress !== undefined) s.video.progress = progress;
    },
    /** Called when the video reaches its end. */
    videoEnded() {
      if (s.mode === "cinema" && s.source === "video") { s.playing = false; emit("pause", { reason: "ended" }); checkEvents(); }
    },

    /* ---- time */
    tick(dt) {
      dt = clamp(dt, 0, 0.1);
      // lamp warms quickly and cools with an afterglow
      s.lamp += ((s.power ? 1 : 0) - s.lamp) * ease(dt, s.power ? 0.22 : 0.45);
      if (Math.abs(s.lamp - (s.power ? 1 : 0)) < 0.002) s.lamp = s.power ? 1 : 0;

      if (s.mode === "filmstrip") {
        const before = s.offset;
        if (s.dragging) {
          // offset set by drag()
        } else if (s.target !== null) {
          const k = 46, c = 2 * Math.sqrt(k);
          s.vel += (k * (s.target - s.offset) - c * s.vel) * dt;
          s.offset += s.vel * dt;
          if (Math.abs(s.target - s.offset) < 0.002 && Math.abs(s.vel) < 0.02) { s.offset = s.target; s.vel = 0; s.target = null; }
        } else if (running()) {
          const auto = s.filmRate * s.speed;
          s.vel += (auto - s.vel) * ease(dt, 0.7);
          s.offset += s.vel * dt;
        } else if (Math.abs(s.vel) > 0.35) {
          s.vel *= Math.exp(-dt * 2.4);
          s.offset += s.vel * dt;
        } else {
          // settle onto a whole frame, like a registration claw
          const k = 30, c = 2 * Math.sqrt(k);
          const goal = Math.round(s.offset);
          s.vel += (k * (goal - s.offset) - c * s.vel) * dt;
          s.offset += s.vel * dt;
          if (Math.abs(goal - s.offset) < 0.001 && Math.abs(s.vel) < 0.01) { s.offset = goal; s.vel = 0; }
        }
        if (!s.dragging) s.reelAngle += (s.offset - before) * FRAME_DEG;
        s.reelOmega = s.vel * FRAME_DEG;
      } else {
        if (running() && s.source === "photos" && s.count > 1) {
          s.clock += dt;
          if (s.clock >= s.interval / s.speed) {
            s.clock = 0;
            s.offset = Math.round(s.offset) + 1;
            s.reelOmega += 160;
            emit("slide", { dir: 1, index: index(), auto: true });
          }
        }
        let target = 0;
        if (s.power && s.source === "video" && s.video.playing) target = 150 * s.video.rate;
        else if (running() && s.source === "photos") target = 36 * Math.sqrt(s.speed);
        s.reelOmega += (target - s.reelOmega) * ease(dt, 0.45);
        if (Math.abs(s.reelOmega) < 0.5 && target === 0) s.reelOmega = 0;
        s.reelAngle += s.reelOmega * dt;
      }
      s.reelAngle %= 360000;
      checkEvents();
      return api.snapshot();
    },

    /** Nothing is moving: the host can stop its animation loop. */
    idle() {
      if (s.dragging || s.target !== null || running()) return false;
      if (s.lamp !== 0 && s.lamp !== 1) return false;
      if (s.mode === "filmstrip") return s.vel === 0 && Number.isInteger(s.offset);
      return s.reelOmega === 0;
    },
  };
  return api;
}
