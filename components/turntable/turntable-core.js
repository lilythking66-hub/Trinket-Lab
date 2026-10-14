// Turntable mechanics without any DOM: platter inertia, tonearm, cueing and
// the mapping between arm angle and playback progress.
//
// Everything is expressed in "deck units" — the coordinate system of the
// flat top plate (x → right, y → towards the viewer). Angles are in degrees,
// measured like screen angles (0° = +x, 90° = +y).

export const RPM = { 33: 100 / 3, 45: 45 };
const REV_33 = RPM[33] / 60; // revolutions per second at 33⅓

export const DECK = {
  width: 560,
  height: 420,
  platter: { cx: 208, cy: 212, r: 168 },
  record: { r: 150, label: 50, outer: 145, inner: 64, runout: 57, hole: 4 },
  pivot: { x: 452, y: 98 },
  armLength: 264,
  restAngle: 95.5,
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rad = (deg) => (deg * Math.PI) / 180;

/** Where the stylus sits for a given arm angle. */
export function stylusAt(angle, deck = DECK) {
  return {
    x: deck.pivot.x + deck.armLength * Math.cos(rad(angle)),
    y: deck.pivot.y + deck.armLength * Math.sin(rad(angle)),
  };
}

/** Distance from the spindle to the stylus for a given arm angle. */
export function stylusRadius(angle, deck = DECK) {
  const s = stylusAt(angle, deck);
  return Math.hypot(s.x - deck.platter.cx, s.y - deck.platter.cy);
}

/** The arm angle that pointing most directly at the spindle (closest approach). */
function innermostAngle(deck) {
  const dx = deck.platter.cx - deck.pivot.x;
  const dy = deck.platter.cy - deck.pivot.y;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/** Solve the arm angle that puts the stylus at `r` from the spindle. */
export function angleForRadius(r, deck = DECK) {
  let lo = deck.restAngle;
  let hi = innermostAngle(deck);
  if (hi < lo) hi += 360;
  // stylusRadius decreases monotonically from rest towards the spindle.
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (stylusRadius(mid, deck) > r) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function createGeometry(deck = DECK) {
  const outer = angleForRadius(deck.record.outer, deck);
  const inner = angleForRadius(deck.record.inner, deck);
  const runout = angleForRadius(deck.record.runout, deck);
  const edge = angleForRadius(deck.record.r, deck);
  const label = angleForRadius(deck.record.label, deck);
  return {
    deck,
    outer,
    inner,
    runout,
    edge,
    label,
    min: deck.restAngle - 6,
    max: label + 2,
    angleForProgress: (p) => outer + clamp(p, 0, 1) * (inner - outer),
    progressForAngle: (a) => clamp((a - outer) / (inner - outer), 0, 1),
    /** Is the stylus above the vinyl (anywhere between the edge and the label)? */
    overRecord: (a) => a >= edge - 0.2 && a <= label,
  };
}

/**
 * Damped spring step towards a target (critically damped).
 * Returns [value, velocity].
 */
function spring(value, velocity, target, omega, dt) {
  const x = value - target;
  const exp = Math.exp(-omega * dt);
  const nx = (x + (velocity + omega * x) * dt) * exp;
  const nv = (velocity - omega * (velocity + omega * x) * dt) * exp;
  return [target + nx, nv];
}

/**
 * Arm modes:
 *  rest      — sitting on the rest post
 *  held      — the user is moving it
 *  swing     — moving on its own to a target (auto-play / return)
 *  hover     — lifted above the record, not moving
 *  lowering  — the cue is letting the needle down
 *  tracking  — the needle is in the groove; angle follows playback
 *  runout    — the needle is in the lead-out groove after the music ended
 */
export function createTurntable({ deck = DECK, autoReturn = true } = {}) {
  const geo = createGeometry(deck);
  const listeners = new Set();

  const s = {
    record: null,
    power: false,
    speed: 33,
    omega: 0, // revolutions / second
    platterAngle: 0,
    arm: { angle: deck.restAngle, velocity: 0, height: 1, mode: "rest", target: deck.restAngle },
    progress: 0,
    autoReturn,
    swingThen: null,
    runoutTime: 0,
  };

  const emit = (event, detail = {}) => {
    for (const fn of listeners) fn(event, snapshot(), detail);
  };

  function snapshot() {
    return {
      record: s.record,
      power: s.power,
      speed: s.speed,
      omega: s.omega,
      rpm: s.omega * 60,
      platterAngle: s.platterAngle,
      arm: { angle: s.arm.angle, height: s.arm.height, mode: s.arm.mode },
      needleDown: needleDown(),
      progress: s.progress,
      rate: rate(),
    };
  }

  const needleDown = () => s.arm.height < 0.02 && (s.arm.mode === "tracking" || s.arm.mode === "runout");
  const spinning = () => s.omega > 0.004;

  /** Playback rate the audio should run at (0 when silent). */
  function rate() {
    if (!s.record || s.arm.mode !== "tracking" || s.arm.height > 0.02) return 0;
    return s.omega / REV_33;
  }

  function setMode(mode) {
    if (s.arm.mode === mode) return;
    const prev = s.arm.mode;
    s.arm.mode = mode;
    emit("arm", { mode, prev });
  }

  const api = {
    geometry: geo,
    deck,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    snapshot,
    get state() {
      if (!s.record) return "empty";
      if (s.arm.mode === "tracking" && s.arm.height < 0.02) return spinning() ? "playing" : "paused";
      if (s.arm.mode === "runout") return "ended";
      if (s.arm.mode === "held") return "cueing";
      if (s.arm.mode === "swing" || s.arm.mode === "lowering") return "cueing";
      return s.power ? "spinning" : "loaded";
    },
    get rate() { return rate(); },
    get autoReturn() { return s.autoReturn; },
    set autoReturn(v) { s.autoReturn = !!v; },

    /** Arm is safely away from the platter (records can be swapped). */
    armClear() { return s.arm.mode === "rest" || (s.arm.angle < geo.edge - 4 && s.arm.mode !== "held"); },

    setRecord(record) {
      if (record && !api.armClear()) return false;
      s.record = record || null;
      s.progress = 0;
      emit(record ? "load" : "unload", { record });
      return true;
    },

    setPower(on) {
      on = !!on;
      if (s.power === on) return;
      s.power = on;
      emit("power", { on });
    },

    setSpeed(speed) {
      speed = Number(speed) === 45 ? 45 : 33;
      if (s.speed === speed) return;
      s.speed = speed;
      emit("speed", { speed });
    },

    /** Set from the audio clock while the needle is tracking. */
    setProgress(p) {
      s.progress = clamp(p, 0, 1);
    },

    /* ---- tonearm ---- */
    grab() {
      if (s.arm.mode === "tracking" || s.arm.mode === "runout") emit("lift", { progress: s.progress });
      s.swingThen = null;
      setMode("held");
      s.arm.target = s.arm.angle;
      return true;
    },
    drag(angle) {
      if (s.arm.mode !== "held") return;
      s.arm.target = clamp(angle, geo.min, geo.max);
    },
    /** Let go of the arm. Over the record it lowers; elsewhere it goes home. */
    release() {
      if (s.arm.mode !== "held") return "none";
      const a = s.arm.target;
      if (s.record && a >= geo.edge - 1 && a <= geo.label) {
        api.lower(geo.progressForAngle(a));
        return "lower";
      }
      if (a > geo.edge - 1) {
        // Over the bare platter / label without a record: go home.
        api.returnHome();
        return "return";
      }
      // Near the rest post: snap onto it.
      api.returnHome();
      return "return";
    },

    /** Lift the needle (the cue lever up). */
    lift() {
      if (s.arm.mode === "tracking" || s.arm.mode === "runout" || s.arm.mode === "lowering") {
        emit("lift", { progress: s.progress });
        setMode("hover");
        s.arm.target = s.arm.angle;
        return true;
      }
      return false;
    },

    /** Lower the needle at a playback position (0–1). */
    lower(progress = null) {
      if (!s.record) return false;
      if (progress !== null) {
        s.progress = clamp(progress, 0, 1);
        s.arm.target = geo.angleForProgress(s.progress);
      } else if (s.arm.mode === "hover") {
        s.progress = geo.progressForAngle(s.arm.angle);
        s.arm.target = geo.angleForProgress(s.progress);
      }
      s.swingThen = null;
      setMode("lowering");
      emit("cue", { progress: s.progress });
      return true;
    },

    /** Swing the lifted arm to a progress point, then lower it. */
    cueTo(progress = 0) {
      if (!s.record) return false;
      if (s.arm.mode === "tracking" || s.arm.mode === "runout") emit("lift", { progress: s.progress });
      const p = clamp(progress, 0, 1);
      s.arm.target = geo.angleForProgress(p);
      s.swingThen = () => api.lower(p);
      setMode("swing");
      return true;
    },

    returnHome() {
      if (s.arm.mode === "tracking" || s.arm.mode === "runout") emit("lift", { progress: s.progress });
      s.arm.target = deck.restAngle;
      s.swingThen = () => { s.progress = 0; setMode("rest"); emit("rest"); };
      setMode("swing");
    },

    /** The audio reached its end: drift into the lead-out groove. */
    ended() {
      if (s.arm.mode !== "tracking") return;
      s.progress = 1;
      s.runoutTime = 0;
      setMode("runout");
      emit("ended");
    },

    /** Advance the simulation by dt seconds. */
    step(dt) {
      dt = clamp(dt, 0, 0.1);
      // --- platter ---
      const target = s.power ? RPM[s.speed] / 60 : 0;
      if (s.omega < target) {
        // motor torque, eased near the target
        s.omega = Math.min(target, s.omega + (0.18 + (target - s.omega) * 2.6) * dt);
      } else if (s.omega > target) {
        // friction (slower than spin-up), plus gentle electronic braking at speed change
        const decel = s.power ? 0.9 : 0.2 + s.omega * 0.35;
        s.omega = Math.max(target, s.omega - decel * dt);
      }
      s.platterAngle = (s.platterAngle + s.omega * 360 * dt) % 360;

      // --- arm ---
      const arm = s.arm;
      switch (arm.mode) {
        case "held": {
          [arm.angle, arm.velocity] = spring(arm.angle, arm.velocity, arm.target, 26, dt);
          arm.height = Math.min(1, arm.height + dt / 0.25);
          break;
        }
        case "swing": {
          arm.height = Math.min(1, arm.height + dt / 0.3);
          if (arm.height < 0.85) break; // lift first, then move
          [arm.angle, arm.velocity] = spring(arm.angle, arm.velocity, arm.target, 6.5, dt);
          if (Math.abs(arm.angle - arm.target) < 0.08 && Math.abs(arm.velocity) < 0.6) {
            arm.angle = arm.target;
            arm.velocity = 0;
            const then = s.swingThen;
            s.swingThen = null;
            if (then) then(); else setMode("hover");
          }
          break;
        }
        case "hover":
        case "rest": {
          arm.height = Math.min(1, arm.height + dt / 0.3);
          arm.velocity = 0;
          break;
        }
        case "lowering": {
          [arm.angle, arm.velocity] = spring(arm.angle, arm.velocity, arm.target, 14, dt);
          // hydraulic cue: slow at the end
          arm.height = Math.max(0, arm.height - dt * (0.35 + arm.height * 1.6));
          if (arm.height <= 0.0001) {
            arm.height = 0;
            arm.angle = arm.target;
            arm.velocity = 0;
            setMode("tracking");
            emit("needledown", { progress: s.progress });
          }
          break;
        }
        case "tracking": {
          arm.height = 0;
          arm.angle = geo.angleForProgress(s.progress);
          break;
        }
        case "runout": {
          arm.height = 0;
          const k = 1 - Math.exp(-dt * 2.2);
          arm.angle += (geo.runout - arm.angle) * k;
          if (spinning()) s.runoutTime += dt;
          if (s.autoReturn && s.runoutTime > 2.4) {
            api.returnHome();
            s.swingThen = () => { s.progress = 0; setMode("rest"); emit("rest"); api.setPower(false); };
          }
          break;
        }
      }
      return snapshot();
    },

    /** Is the simulation at rest (nothing would change by stepping)? */
    idle() {
      const m = s.arm.mode;
      const armStill = (m === "rest" || m === "hover") && s.arm.height >= 1;
      const platterStill = !s.power && s.omega === 0;
      return armStill && platterStill;
    },
  };

  return api;
}
