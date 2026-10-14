// Platform-neutral gacha state machine, prize pool and knob ratchet.
// No DOM, framework, or browser APIs live in this file.
//
//   locked ──coin──▶ idle ──turn──▶ turning ──complete──▶ dispensing
//                     ▲                                       │ landed
//                     │                                       ▼
//                  collect ◀── revealed ◀──open── presenting ◀──take── waiting
//
// "empty" replaces idle/locked when no prize has stock left.

export const REST_STATES = ["locked", "idle", "empty"];
export const BUSY_STATES = ["turning", "dispensing", "waiting", "presenting", "revealed"];

/** Small deterministic PRNG for demos and tests. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizePrize(raw, index = 0) {
  if (!raw || typeof raw !== "object") throw new TypeError("A prize must be an object.");
  const id = raw.id != null && raw.id !== "" ? String(raw.id) : "prize-" + (index + 1);
  const weight = raw.weight == null || raw.weight === "" ? 1 : Number(raw.weight);
  if (!Number.isFinite(weight) || weight < 0) throw new RangeError("Prize weight must be a finite number ≥ 0 (" + id + ").");
  const stockValue = raw.stock == null || raw.stock === "" ? Infinity : Number(raw.stock);
  const stock = stockValue === Infinity ? Infinity : Math.floor(stockValue);
  if (!(stock >= 0)) throw new RangeError("Prize stock must be ≥ 0 or omitted (" + id + ").");
  return { ...raw, id, weight, stock };
}

export function availablePrizes(prizes) {
  return prizes.filter((prize) => prize.weight > 0 && prize.stock > 0);
}

export function remainingStock(prizes) {
  return availablePrizes(prizes).reduce((sum, prize) => sum + prize.stock, 0);
}

export function pickWeighted(prizes, rng = Math.random) {
  const pool = availablePrizes(prizes);
  if (!pool.length) return null;
  const total = pool.reduce((sum, prize) => sum + prize.weight, 0);
  let roll = rng() * total;
  for (const prize of pool) {
    roll -= prize.weight;
    if (roll < 0) return prize;
  }
  return pool[pool.length - 1];
}

/**
 * Ratcheted knob: only clockwise motion counts.
 * Returns the new progress (degrees), detent indices crossed, and completion.
 */
export function knobStep(progressDeg, deltaDeg, { detentDeg = 90, totalDeg = 360 } = {}) {
  const from = Math.max(0, Math.min(totalDeg, progressDeg));
  const to = Math.max(from, Math.min(totalDeg, from + Math.max(0, deltaDeg)));
  const passed = [];
  for (let i = Math.floor(from / detentDeg) + 1; i * detentDeg <= to + 1e-9; i++) {
    if (i * detentDeg > from + 1e-9) passed.push(i);
  }
  return { progress: to, passed, complete: to >= totalDeg - 1e-9 };
}

/**
 * Detent "feel": the displayed angle lingers near each detent and hurries
 * between them, while staying strictly monotonic (strength < 1).
 */
export function detentFeel(progressDeg, detentDeg = 90, strength = 0.32) {
  const k = (2 * Math.PI) / detentDeg;
  return progressDeg - (strength / k) * Math.sin(k * progressDeg);
}

export function createGacha({ prizes = [], requireCoin = false, rng = Math.random } = {}) {
  let list = prizes.map(normalizePrize);
  let coinRequired = Boolean(requireCoin);
  let credits = 0;
  let current = null;
  const history = [];
  const listeners = new Set();

  const restState = () => {
    if (availablePrizes(list).length === 0) return "empty";
    return coinRequired && credits <= 0 ? "locked" : "idle";
  };
  let state = restState();

  const snapshot = () => ({
    state,
    credits,
    requireCoin: coinRequired,
    prize: current,
    remaining: remainingStock(list),
    history: history.slice(),
  });

  const emit = (event, detail = {}) => {
    const snap = snapshot();
    for (const listener of listeners) listener(event, snap, detail);
  };

  const go = (next, event, detail) => {
    const previous = state;
    state = next;
    if (previous !== next) emit("statechange", { state: next, previous });
    if (event) emit(event, detail);
    if (next === "empty" && previous !== "empty") emit("empty", {});
  };

  const settle = () => {
    if (REST_STATES.includes(state)) go(restState());
  };

  const findPrize = (wanted) => {
    if (wanted == null) return pickWeighted(list, rng);
    if (typeof wanted === "object") {
      const known = list.find((prize) => prize.id === String(wanted.id));
      return known ?? normalizePrize(wanted, list.length);
    }
    const known = list.find((prize) => prize.id === String(wanted));
    if (!known) throw new RangeError("Unknown prize: " + wanted);
    return known;
  };

  return {
    getState: snapshot,
    get state() { return state; },
    get prizes() { return list.slice(); },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    setPrizes(next) {
      list = (next ?? []).map(normalizePrize);
      settle();
    },

    setRequireCoin(value) {
      coinRequired = Boolean(value);
      settle();
    },

    insertCoin(count = 1) {
      const n = Math.max(0, Math.floor(Number(count) || 0));
      if (!n) return credits;
      credits += n;
      emit("coin", { credits, added: n });
      settle();
      return credits;
    },

    beginTurn() {
      if (state !== "idle") return false;
      go("turning", "turnstart");
      return true;
    },

    /** Abandon an unfinished turn (no prize, no coin spent). */
    cancelTurn() {
      if (state !== "turning") return false;
      go(restState(), "turncancel");
      return true;
    },

    /**
     * Finish the turn and commit a prize. `wanted` may be undefined (weighted draw),
     * a prize id, or a prize object (e.g. decided by a server).
     */
    completeTurn(wanted) {
      if (state !== "turning") return null;
      const prize = findPrize(wanted);
      if (!prize || prize.stock <= 0) {
        go(restState(), "turncancel", { reason: "no-prize" });
        return null;
      }
      if (coinRequired) credits = Math.max(0, credits - 1);
      if (Number.isFinite(prize.stock)) prize.stock -= 1;
      current = prize;
      history.push(prize.id);
      go("dispensing", "dispense", { prize });
      return prize;
    },

    landed() {
      if (state !== "dispensing") return false;
      go("waiting", "land", { prize: current });
      return true;
    },

    take() {
      if (state !== "waiting") return false;
      go("presenting", "take", { prize: current });
      return true;
    },

    open() {
      if (state !== "presenting") return false;
      go("revealed", "reveal", { prize: current });
      return true;
    },

    collect() {
      if (state !== "revealed") return false;
      const prize = current;
      current = null;
      go(restState(), "collect", { prize });
      return true;
    },

    /** Clear any in-flight capsule. Does not refund coins or stock. */
    reset() {
      current = null;
      go(restState(), "reset");
    },
  };
}
