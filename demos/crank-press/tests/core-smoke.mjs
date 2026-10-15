// Run with: node demos/crank-press/tests/core-smoke.mjs
import { createPress, TAU } from "../../../components/crank-press/press-core.js";
import { pathSegments, pathPoint, OUTFEED, INFEED, createProjector, CRANK, ROLLER } from "../../../components/crank-press/press-art.js";
import { PATTERNS, PATTERN_NAMES, PAPERS, deckle } from "../../../components/crank-press/press-patterns.js";

function assert(name, condition) {
  if (!condition) throw new Error("FAIL: " + name);
  console.log("PASS: " + name);
}
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const run = (p, secs) => { for (let t = 0; t < secs; t += 1 / 60) p.step(1 / 60); };

/* ---------------- crank & ratchet ---------------- */
const events = [];
const p = createPress({ detents: 12 });
p.subscribe((type, d) => events.push([type, d]));
assert("one turn feeds one circumference", near(p.turnLength, TAU * 26));
p.grab();
p.drag(TAU / 12 + 0.01, 1 / 30);
assert("a forward drag turns the crank", p.angle > TAU / 12);
assert("passing a tooth ticks the ratchet", events.some(([t]) => t === "tick"));
p.drag(-0.5, 1 / 30);
assert("the pawl stops a back-turn at the last tooth", near(p.angle, TAU / 12) && events.some(([t]) => t === "pawl"));
p.release();

/* ---------------- flywheel ---------------- */
const f = createPress();
f.grab();
for (let i = 0; i < 10; i++) f.drag(0.25, 1 / 60);
f.release();
const a0 = f.angle;
run(f, 0.2);
assert("a fling keeps coasting", f.angle > a0 + 0.1 && f.omega > 0);
run(f, 8);
assert("friction brings it to rest", f.omega === 0 && !f.active);

/* ---------------- sheet lifecycle ---------------- */
const s = createPress();
const seen = [];
s.subscribe((t) => seen.push(t));
s.load(100);
assert("a loaded sheet slides in first", s.state === "loading");
s.grab(); s.drag(1, 1 / 30); s.release(); s.step(0);
assert("turning before the grip does not feed", s.progress === 0);
run(s, 1);
assert("the rollers grip it", s.state === "gripped" && seen.includes("grip"));
s.drive(TAU, s.releaseAngle() + 0.01, 7);
run(s, 3);
assert("cranking feeds it through and releases it", ["released", "out"].includes(s.state) && seen.includes("release"));
assert("feed is radius × angle", s.progress === 1);
run(s, 2);
assert("it slides out onto the table", s.state === "out" && seen.includes("out") && seen.includes("arrive"));
assert("take() hands it over", s.take() && s.state === "empty" && seen.includes("take"));
assert("nothing to take twice", s.take() === false);

/* ---------------- motor target ---------------- */
const m = createPress();
m.drive(2 * TAU, 3 * TAU, 1);
run(m, 4);
assert("crank(n) stops exactly on target", near(m.angle, 3 * TAU));

/* ---------------- every motor run reports back once ---------------- */
const mm = createPress();
const arrived = [];
mm.subscribe((t, d) => { if (t === "arrive") arrived.push([d.id, !!d.stopped]); });
mm.drive(TAU, 10 * TAU, 1);
mm.step(1 / 60);
mm.drive(TAU, 10 * TAU, 2);
assert("a replaced motor reports stopped", arrived.length === 1 && arrived[0][0] === 1 && arrived[0][1]);
mm.grab();
assert("a hand on the crank stops the motor", arrived.length === 2 && arrived[1][0] === 2 && arrived[1][1] && mm.motorId === 0);
assert("the motor won't start under a hand", mm.drive(TAU, 1, 3) === false && mm.motorId === 0);
mm.release();
mm.drive(TAU, mm.angle + 0.5, 4);
run(mm, 2);
assert("reaching the target reports once, not stopped", arrived.length === 3 && arrived[2][0] === 4 && !arrived[2][1]);
mm.stop();
assert("stop() with no motor reports nothing", arrived.length === 3);

/* ---------------- geometry ---------------- */
const segs = pathSegments(OUTFEED, 50);
assert("paper path starts at the nip", near(segs[0].o[0], ROLLER.y) && near(segs[0].o[1], ROLLER.z - ROLLER.r));
assert("segments are contiguous", segs.every((g, i) => i === 0 || near(g.a, segs[i - 1].a + Math.hypot(OUTFEED[i][0] - OUTFEED[i - 1][0], OUTFEED[i][1] - OUTFEED[i - 1][1]))));
assert("the path ends on the table", near(pathPoint(OUTFEED, 999)[1], OUTFEED.at(-1)[1], 0.01));
assert("infeed hangs down behind", pathPoint(INFEED, 400)[1] < 20);
const P = createProjector();
P.origin.x = 40; P.origin.y = 300;
const q = P.proj(CRANK.x, 117, 81);
const [y, z] = P.onPlaneX(q.x, q.y, CRANK.x);
assert("screen → crank plane inverts the camera", near(y, 117, 1e-9) && near(z, 81, 1e-9));

/* ---------------- patterns ---------------- */
assert("eight rollers ship", PATTERN_NAMES.length === 8 && PATTERN_NAMES.includes("monogram"));
assert("every pattern can draw", PATTERN_NAMES.every((n) => typeof PATTERNS[n].draw === "function" && (PATTERNS[n].tile === "sheet" || PATTERNS[n].tile > 0)));
assert("paper presets have colours", Object.values(PAPERS).every((x) => /^#/.test(x.color)));
assert("deckle edge is a polygon", deckle(100, 200).startsWith("polygon("));

console.log("\nAll crank press core checks passed.");
