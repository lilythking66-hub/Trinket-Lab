// Mechanics of a hand-crank roller press, without the DOM.
//
// One crank angle drives everything: the pattern roller sits on the crank
// shaft, so the sheet advances by `radius` for every radian turned. A ratchet
// pawl lets the crank go forward only (it can settle back to the last tooth),
// and a flywheel keeps it coasting after a fling. A loaded sheet slides to the
// nip, is gripped, fed through, released and finally rests on the table until
// it is taken. Units are sheet units (the element draws 1 unit = 2 CSS px of
// sheet content).

export const TAU = Math.PI * 2;

export const PRESS_DEFAULTS = {
  radius: 26,              // pattern roller radius: feed per radian
  detents: 12,             // ratchet teeth per turn
  maxSpeed: 2.6 * TAU,     // rad/s
  friction: 2.6,           // rad/s² coasting deceleration with nothing in the nip
  paperFriction: 7,        // extra rad/s² while a sheet is gripped
  drag: 0.7,               // proportional damping (1/s)
  accel: 16,               // motor acceleration (rad/s²) for drive()/crank()
  lead: 34,                // how far before the nip a loaded sheet starts
  loadSpeed: 80,           // units/s the sheet slides in by itself
  slide: 18,               // how far a released sheet slides out onto the table
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createPress(options = {}) {
  const cfg = { ...PRESS_DEFAULTS, ...options };
  const D = TAU / cfg.detents;
  const subs = new Set();
  let angle = 0, omega = 0, tooth = 0;
  let held = false, heldMoved = false;
  let motor = null;            // { speed, target|null }
  let sheet = null;            // { length, s, state, v, gripAngle }
  let pawlArmed = true;

  const emit = (type, detail = {}) => { for (const fn of subs) fn(type, detail); };
  /** Every motor run ends with exactly one `arrive`: reached, or stopped/replaced. */
  function cancelMotor() {
    if (!motor) return;
    const m = motor;
    motor = null;
    emit("arrive", { angle, id: m.id, stopped: true });
  }

  /** Move the crank to `next`, honouring the pawl. Returns the forward delta. */
  function turnTo(next) {
    const floor = tooth * D;
    if (next < floor) {
      next = floor;
      if (pawlArmed && angle - floor > 1e-4) { pawlArmed = false; emit("pawl", { angle: floor }); }
      if (omega < 0) omega = 0;
    } else if (next > floor + D * 0.25) pawlArmed = true;
    const d = next - angle;
    angle = next;
    const idx = Math.floor(angle / D + 1e-9);
    if (idx > tooth) { const count = idx - tooth; tooth = idx; emit("tick", { count, angle }); }
    if (d > 0) advance(d);
    return d;
  }

  function advance(d) {
    if (!sheet || sheet.state !== "gripped") return;
    sheet.s += d * cfg.radius;
    if (sheet.s >= sheet.length) {
      sheet.s = sheet.length;
      sheet.state = "released";
      sheet.v = Math.max(omega * cfg.radius * 0.6, 28);
      emit("release", { length: sheet.length });
    }
  }

  function step(dt) {
    dt = clamp(dt, 0, 0.05);
    if (held) {
      if (!heldMoved) omega *= Math.exp(-dt * 14);
      heldMoved = false;
    } else if (motor) {
      const remaining = motor.target == null ? Infinity : motor.target - angle;
      let want = motor.speed;
      if (remaining < Infinity) want = Math.min(want, Math.sqrt(2 * cfg.accel * Math.max(0, remaining)) + 0.4);
      omega += clamp(want - omega, -cfg.accel * 2 * dt, cfg.accel * dt);
      if (motor.target != null && angle + omega * dt >= motor.target - 1e-6) {
        turnTo(motor.target);
        omega = 0;
        const m = motor; motor = null;
        emit("arrive", { angle, id: m.id });
      } else turnTo(angle + omega * dt);
    } else if (omega > 0) {
      const gripped = sheet?.state === "gripped";
      const dec = cfg.friction + (gripped ? cfg.paperFriction : 0) + cfg.drag * omega;
      omega = Math.max(0, omega - dec * dt);
      turnTo(angle + omega * dt);
    } else omega = 0;

    if (sheet?.state === "loading") {
      sheet.s = Math.min(0, sheet.s + cfg.loadSpeed * dt);
      if (sheet.s >= 0) { sheet.state = "gripped"; sheet.gripAngle = angle; emit("grip", { angle }); }
    } else if (sheet?.state === "released") {
      const end = sheet.length + cfg.slide;
      sheet.v = Math.max(10, sheet.v - 60 * dt);
      sheet.s = Math.min(end, sheet.s + sheet.v * dt);
      if (sheet.s >= end) { sheet.state = "out"; emit("out", { length: sheet.length }); }
    }
    return active();
  }

  const active = () => held || !!motor || omega > 1e-3 || sheet?.state === "loading" || sheet?.state === "released";

  return {
    config: cfg,
    get angle() { return angle; },
    get omega() { return omega; },
    get turns() { return angle / TAU; },
    get held() { return held; },
    get driving() { return !!motor; },
    /** id of the running motor (0 when none). */
    get motorId() { return motor ? motor.id : 0; },
    get sheet() { return sheet ? { ...sheet } : null; },
    get state() { return sheet ? sheet.state : "empty"; },
    get progress() { return sheet ? clamp(sheet.s / sheet.length, 0, 1) : 0; },
    /** Feed of one full crank turn (sheet units). */
    get turnLength() { return TAU * cfg.radius; },
    get active() { return active(); },

    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    configure(o) { Object.assign(cfg, o); },

    /** Put a sheet on the infeed; it slides to the nip and is gripped. */
    load(length, { lead = cfg.lead } = {}) {
      sheet = { length: Math.max(1, length), s: -Math.max(0, lead), state: lead > 0 ? "loading" : "gripped", v: 0, gripAngle: angle };
      emit("load", { length: sheet.length });
      if (sheet.state === "gripped") emit("grip", { angle });
    },
    /** Take a sheet that has come through. Returns false while it is still in the machine. */
    take() {
      if (!sheet || (sheet.state !== "out" && sheet.state !== "released")) return false;
      const length = sheet.length;
      sheet = null;
      emit("take", { length });
      return true;
    },
    clear() { sheet = null; },

    /* hand on the crank */
    grab() { cancelMotor(); held = true; heldMoved = false; },
    /** Turn by a delta angle (radians) while held; dt is the time since the last call. */
    drag(delta, dt = 1 / 60) {
      if (!held) return 0;
      delta = clamp(delta, -Math.PI / 2, Math.PI / 2);
      const max = cfg.maxSpeed * Math.max(dt, 1 / 240) * 1.5;
      const d = turnTo(angle + clamp(delta, -max, max));
      const v = d / Math.max(dt, 1 / 240);
      omega = omega * 0.45 + clamp(v, -cfg.maxSpeed, cfg.maxSpeed) * 0.55;
      heldMoved = true;
      return d;
    },
    release() {
      held = false;
      omega = clamp(omega, 0, cfg.maxSpeed);
    },

    /* motor: keyboard, crank(), feedAll() */
    /** Run the motor (to `target` if given). Returns false while a hand holds the crank. */
    drive(speed, target = null, id = 0) {
      if (held) return false;
      if (motor && motor.id !== id) cancelMotor();
      motor = { speed: clamp(speed, 0.1, cfg.maxSpeed), target, id };
      return true;
    },
    /** Stop the motor; a pending target reports `arrive` with stopped: true. */
    stop() { cancelMotor(); },
    /** Angle at which the current sheet will have left the nip. */
    releaseAngle() {
      if (!sheet) return angle;
      const left = sheet.length - Math.max(0, sheet.s);
      return angle + Math.max(0, left) / cfg.radius + (sheet.state === "loading" ? 0 : 0);
    },

    step,
    /** Snap to an angle without events (restoring state). */
    setAngle(a) { angle = a; tooth = Math.floor(a / D + 1e-9); omega = 0; },
  };
}
