// Run with: node demos/gacha/tests/core-smoke.mjs
import { createGacha, knobStep, detentFeel, pickWeighted, mulberry32, normalizePrize } from "../../../components/gacha/gacha-core.js";
import { createGlobeSim } from "../../../components/gacha/capsule-physics.js";

function assert(name, condition) {
  if (!condition) throw new Error("FAIL: " + name);
  console.log("PASS: " + name);
}

// knob ratchet
const a = knobStep(0, 100);
assert("knob crosses first detent", a.progress === 100 && a.passed.join() === "1" && !a.complete);
assert("knob ignores counter-clockwise motion", knobStep(100, -40).progress === 100);
const b = knobStep(100, 400);
assert("knob clamps to one turn and completes", b.progress === 360 && b.passed.join() === "2,3,4" && b.complete);
let mono = true;
for (let x = 0, prev = -1; x <= 360; x += 0.5) { const v = detentFeel(x); if (v <= prev) mono = false; prev = v; }
assert("detent feel stays monotonic", mono && detentFeel(0) === 0 && Math.abs(detentFeel(360) - 360) < 1e-9);

// weighted draw
const rng = mulberry32(42);
const pool = [{ id: "a", weight: 9 }, { id: "b", weight: 1 }, { id: "c", weight: 0 }].map(normalizePrize);
const counts = { a: 0, b: 0, c: 0 };
for (let i = 0; i < 5000; i++) counts[pickWeighted(pool, rng).id]++;
assert("weights shape the draw", counts.c === 0 && counts.a / 5000 > 0.86 && counts.a / 5000 < 0.94);

// full lifecycle with coin + stock
const events = [];
const g = createGacha({ prizes: [{ id: "x", stock: 1 }, { id: "y", stock: 1 }], requireCoin: true, rng: mulberry32(1) });
g.subscribe((event) => events.push(event));
assert("coin mode starts locked", g.state === "locked" && g.beginTurn() === false);
g.insertCoin();
assert("coin unlocks", g.state === "idle");
assert("turn starts", g.beginTurn() && g.state === "turning");
const first = g.completeTurn();
assert("turn commits a prize and spends the coin", first && g.getState().credits === 0 && g.state === "dispensing");
assert("cannot take before landing", g.take() === false);
g.landed(); g.take(); g.open();
assert("reveal holds the prize", g.state === "revealed" && g.getState().prize.id === first.id);
g.collect();
assert("collect returns to locked without credit", g.state === "locked");
g.insertCoin(); g.beginTurn();
const second = g.completeTurn("y" === first.id ? "x" : "y");
assert("forced prize by id", second.id !== first.id);
g.landed(); g.take(); g.open(); g.collect();
assert("sold out becomes empty", g.state === "empty" && events.includes("empty"));
g.setPrizes([{ id: "x", stock: 1 }]);
assert("refill leaves empty", g.state === "locked");

// server-decided prize object not in list
const free = createGacha({ prizes: [{ id: "a" }] });
free.beginTurn();
assert("external prize object accepted", free.completeTurn({ id: "server-1", title: "From API" }).id === "server-1");

// physics settles inside the globe
const sim = createGlobeSim({ cx: 200, cy: 222, radius: 154, floorY: 354, ceilingY: 94, ballRadius: 25, rng: mulberry32(3) });
for (let i = 0; i < 24; i++) sim.add({}, { x: 120 + (i % 6) * 30, y: 150 + Math.floor(i / 6) * 40 });
sim.settle(5);
const inside = sim.balls.every((ball) => Math.hypot(ball.x - 200, ball.y - 222) <= 154 - ball.r + 0.5 && ball.y <= 354 - ball.r + 0.5);
assert("capsules settle inside the globe", inside && sim.asleep);
console.log("All gacha core checks passed.");
