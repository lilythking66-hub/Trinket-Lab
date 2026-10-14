import { createPrinter, durationMs, feedProgress, getFrame, getMotionPlan } from "../../../components/printer/printer-core.js";

const log = typeof print === "function" ? print : console.log;

function assert(name, condition) {
  if (!condition) throw new Error("FAIL: " + name);
  log("PASS: " + name);
}

const config = {
  skin: {
    canvasWidth: 1254,
    canvasHeight: 1254,
    slotX: 627,
    slotY: 392,
    slotWidth: 723,
    defaultPaperWidth: 586,
    gripDepth: 16,
  },
  paper: { width: 586, height: 733 },
  motion: { speed: 245, startDelayMs: 120, startupRatio: 0.08, settleStartRatio: 0.88 },
};

const start = getFrame(0, config);
const end = getFrame(99999, config);
assert("full sheet begins hidden above the slot", start.y === 392 - 733);
assert("finished sheet remains held by gripDepth", end.y === 392 - 16);
assert("finished frame keeps fixed paper dimensions", end.width === 586 && end.height === 733);
assert("feed profile starts at zero and ends at one", feedProgress(0, config.motion) === 0 && feedProgress(1, config.motion) === 1);
assert("transport duration matches the premium feed model", Math.abs(durationMs(config) - 3251.70068) < 0.01);

const plan = getMotionPlan(config);
assert("motion plan has startup, cruise and settling", plan.segments.map((x) => x.phase).join(",") === "startup,cruise,settling");

const events = [];
const printer = createPrinter(config);
printer.subscribe((frame, event) => events.push([event, frame.state]));
assert("first start succeeds", printer.start(1000) === true);
assert("overlapping print is rejected", printer.start(1001) === false);
printer.tick(5000);
assert("completion fires exactly once", events.filter(([event]) => event === "printcomplete").length === 1);
assert("controller finishes in the held pose", printer.getState().state === "finished" && printer.getState().y === 376);

const reducedEvents = [];
const reduced = createPrinter(config);
reduced.subscribe((frame, event) => reducedEvents.push([event, frame.state]));
reduced.start(0, true);
assert("reduced motion completes synchronously", reduced.getState().state === "finished");
assert("reduced motion emits one completion", reducedEvents.filter(([event]) => event === "printcomplete").length === 1);
