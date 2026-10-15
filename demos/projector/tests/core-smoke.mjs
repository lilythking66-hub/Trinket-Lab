// Run with: node demos/projector/tests/core-smoke.mjs
import { createProjectorCore, wrap, FRAME_DEG } from "../../../components/projector/projector-core.js";
import { createFilmPath } from "../../../components/projector/film-path.js";
import { isImageFile, isVideoFile } from "../../../components/projector/reel-maker.js";

function assert(name, condition) {
  if (!condition) throw new Error("FAIL: " + name);
  console.log("PASS: " + name);
}
const run = (core, seconds, until) => {
  for (let t = 0; t < seconds; t += 1 / 60) {
    core.tick(1 / 60);
    if (until?.()) return t;
  }
  return seconds;
};

/* ---------------- empty projector ---------------- */
let core = createProjectorCore();
const events = [];
core.subscribe((type, detail) => events.push([type, detail]));
assert("empty reel refuses to play", core.play() === false && core.state === "empty" && events.some(([t, d]) => t === "blocked" && d.reason === "empty"));

/* ---------------- loading + power ---------------- */
core.setCount(5);
assert("a loaded reel starts switched off", core.state === "off");
core.play();
assert("play switches the power on", core.snapshot().power && core.state === "playing");
run(core, 0.6);
assert("lamp warms up quickly", core.snapshot().lamp > 0.9);

/* ---------------- filmstrip motion ---------------- */
core = createProjectorCore({ count: 6, filmRate: 0.5 });
core.play();
run(core, 4);
const s1 = core.snapshot();
assert("film runs continuously forward", s1.offset > 1.2 && s1.vel > 0.45);
assert("reels turn in step with the film", Math.abs(s1.reelAngle - s1.offset * FRAME_DEG) < 1e-6);
core.pause();
run(core, 4);
assert("pausing lets the film settle on a whole frame", Number.isInteger(core.snapshot().offset) && core.snapshot().vel === 0);
assert("nothing moves when settled", core.idle());

/* ---------------- drag + fling ---------------- */
const start = core.snapshot().offset;
core.grab();
core.drag(start + 1.4);
assert("dragging moves the film directly", core.snapshot().offset === start + 1.4);
core.release(3);
run(core, 5);
assert("a fling coasts then snaps to a frame", core.snapshot().offset > start + 1.4 && Number.isInteger(core.snapshot().offset));

/* ---------------- goTo + looping ---------------- */
core.goTo(2);
run(core, 3);
assert("goTo glides to the photo", core.index === 2 && Number.isInteger(core.snapshot().offset));
core.goTo(5);
run(core, 3);
assert("goTo takes the short way round the loop", core.index === 5);
assert("index wraps around the reel", wrap(-1, 6) === 5 && wrap(13, 6) === 1);

/* ---------------- shared position across modes ---------------- */
core.goTo(4, { instant: true });
core.setMode("cinema");
assert("cinema shows the same photo", core.index === 4);
core.next();
assert("next is a slide change in cinema", core.index === 5);
core.setMode("filmstrip");
assert("filmstrip resumes at the cinema position", core.index === 5 && Number.isInteger(core.snapshot().offset));

/* ---------------- cinema auto slideshow ---------------- */
core.setMode("cinema");
core.setInterval(2);
core.setSpeed(2);
const slides = [];
core.subscribe((t, d) => { if (t === "slide") slides.push(d); });
core.play();
run(core, 3.2);
assert("slides advance on the interval / speed", slides.filter((s) => s.auto).length === 3);
run(core, 0.5);
assert("reels turn during a slideshow", core.snapshot().reelOmega > 5);

/* ---------------- video ---------------- */
assert("video source needs a clip", core.setSource("video") === false);
core.setVideo(true);
core.setSource("video");
core.setVideoState({ playing: true, rate: 1 });
run(core, 1.5);
const om = core.snapshot().reelOmega;
assert("reels follow the video while it plays", om > 100);
core.setVideoState({ playing: false });
run(core, 3);
assert("reels stop when the video stops", core.snapshot().reelOmega === 0);
core.videoEnded();
assert("video end pauses the projector", core.state === "paused");
core.setVideo(false);
assert("removing the video falls back to photos", core.snapshot().source === "photos");

/* ---------------- focus ---------------- */
core.setFocus(3);
assert("focus is clamped", core.focus === 1);

/* ---------------- film path ---------------- */
const path = createFilmPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 50 }, { x: 300, y: 0 }]);
assert("path passes through its waypoints", Math.hypot(path.at(0).x, path.at(0).y) < 1e-6 && Math.abs(path.at(path.total).x - 300) < 1e-6);
assert("arc length is at least the chord", path.total >= 300);
const mid = path.nearest(200, 50);
assert("nearest point lookup", mid.distance < 3);
assert("extrapolates past the end", path.at(path.total + 50).x > 300);

/* ---------------- file sorting ---------------- */
const f = (name, type) => ({ name, type });
assert("images by type or extension", isImageFile(f("a.JPG", "")) && isImageFile(f("x", "image/png")));
assert("HEIC is not treated as displayable", !isImageFile(f("a.heic", "image/heic")));
assert("mp4 / mov are video", isVideoFile(f("a.mp4", "")) && isVideoFile(f("b.mov", "video/quicktime")) && !isVideoFile(f("c.jpg", "image/jpeg")));

console.log("\nAll projector checks passed.");
