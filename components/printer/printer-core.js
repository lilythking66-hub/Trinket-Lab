// Platform-neutral paper-feed motion extracted from printer-motion-lab.
// No DOM, framework, or browser APIs live in this file.

const clamp = (value) => Math.max(0, Math.min(1, value));

export function validate(config) {
  const { skin, paper, motion } = config;
  const positive = [
    skin.canvasWidth, skin.canvasHeight, skin.slotWidth, skin.defaultPaperWidth,
    skin.gripDepth, paper.width, paper.height, motion.speed,
  ];
  if (positive.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new RangeError("Dimensions, grip and speed must be positive finite numbers.");
  }
  if (![skin.slotX, skin.slotY, motion.startDelayMs, motion.startupRatio, motion.settleStartRatio].every(Number.isFinite)) {
    throw new RangeError("Geometry and timing must be finite.");
  }
  if (
    skin.slotY < 0 ||
    skin.slotY > skin.canvasHeight ||
    skin.slotX - skin.slotWidth / 2 < 0 ||
    skin.slotX + skin.slotWidth / 2 > skin.canvasWidth
  ) {
    throw new RangeError("Slot must fit the skin canvas.");
  }
  if (paper.width > skin.slotWidth || paper.height <= skin.gripDepth || skin.defaultPaperWidth > skin.slotWidth) {
    throw new RangeError("Paper must fit the slot and extend beyond the grip.");
  }
  if (
    motion.startDelayMs < 0 ||
    motion.startupRatio <= 0 ||
    motion.startupRatio >= motion.settleStartRatio ||
    motion.settleStartRatio >= 1
  ) {
    throw new RangeError("Invalid timing profile.");
  }
}

function profileArea(motion) {
  return 1 - motion.startupRatio / 2 - (1 - motion.settleStartRatio) / 2;
}

export function durationMs(config) {
  validate(config);
  return (
    ((config.paper.height - config.skin.gripDepth) /
      (config.motion.speed * profileArea(config.motion))) *
    1000
  );
}

// Integral of a continuous trapezoidal velocity curve: accelerate, cruise, brake.
export function feedProgress(time, motion) {
  const t = clamp(time);
  const a = motion.startupRatio;
  const b = motion.settleStartRatio;
  const distance =
    t < a
      ? (t * t) / (2 * a)
      : t <= b
        ? t - a / 2
        : b - a / 2 + (t - b) - ((t - b) ** 2) / (2 * (1 - b));
  return clamp(distance / profileArea(motion));
}

export function getFrame(elapsedMs, config) {
  if (!Number.isFinite(elapsedMs)) throw new RangeError("Elapsed time must be finite.");
  const { skin, paper, motion } = config;
  const duration = durationMs(config);
  const t = clamp((elapsedMs - motion.startDelayMs) / duration);
  const progress = feedProgress(t, motion);
  return {
    state: t >= 1 ? "finished" : t >= motion.settleStartRatio ? "settling" : "feeding",
    progress,
    x: skin.slotX - paper.width / 2,
    y: skin.slotY - paper.height + (paper.height - skin.gripDepth) * progress,
    width: paper.width,
    height: paper.height,
    durationMs: duration + motion.startDelayMs,
    elapsedMs: Math.max(0, elapsedMs),
    slotShadowOpacity: Math.min(1, (progress * (paper.height - skin.gripDepth)) / 12),
    paperShadowOpacity: progress === 0 ? 0 : 0.08 + 0.07 * progress,
  };
}

export function getMotionPlan(config) {
  validate(config);
  const { motion } = config;
  const transportDurationMs = durationMs(config);
  const boundaries = [
    {
      phase: "startup",
      startMs: motion.startDelayMs,
      endMs: motion.startDelayMs + transportDurationMs * motion.startupRatio,
    },
    {
      phase: "cruise",
      startMs: motion.startDelayMs + transportDurationMs * motion.startupRatio,
      endMs: motion.startDelayMs + transportDurationMs * motion.settleStartRatio,
    },
    {
      phase: "settling",
      startMs: motion.startDelayMs + transportDurationMs * motion.settleStartRatio,
      endMs: motion.startDelayMs + transportDurationMs,
    },
  ];
  const segments = boundaries.map(({ phase, startMs, endMs }) => {
    const from = getFrame(startMs, config);
    const to = getFrame(endMs, config);
    return {
      phase,
      startMs,
      durationMs: endMs - startMs,
      fromY: from.y,
      toY: to.y,
      fromProgress: from.progress,
      toProgress: to.progress,
    };
  });
  return {
    startDelayMs: motion.startDelayMs,
    transportDurationMs,
    totalDurationMs: motion.startDelayMs + transportDurationMs,
    initialY: getFrame(0, config).y,
    finalY: getFrame(motion.startDelayMs + transportDurationMs, config).y,
    segments,
  };
}

export function createPrinter(input) {
  validate(input);
  const config = {
    skin: { ...input.skin },
    paper: { ...input.paper },
    motion: { ...input.motion },
  };
  let startTime = null;
  let lastTime = 0;
  let current = { ...getFrame(0, config), state: "idle" };
  const listeners = new Set();
  const emit = (event) => {
    for (const listener of [...listeners]) listener({ ...current }, event);
  };

  return {
    getState: () => ({ ...current }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start(now, reducedMotion = false) {
      if (!Number.isFinite(now)) throw new RangeError("Clock must be finite.");
      if (startTime !== null) return false;
      startTime = now;
      lastTime = now;
      current = getFrame(0, config);
      emit("printstart");
      if (startTime === null) return true;
      if (reducedMotion) {
        current = getFrame(durationMs(config) + config.motion.startDelayMs, config);
        startTime = null;
        emit("printcomplete");
      }
      return true;
    },
    tick(now) {
      if (!Number.isFinite(now)) throw new RangeError("Clock must be finite.");
      if (startTime === null) return { ...current };
      lastTime = Math.max(lastTime, now);
      current = getFrame(lastTime - startTime, config);
      if (current.state === "finished") {
        startTime = null;
        emit("printcomplete");
      } else {
        emit("frame");
      }
      return { ...current };
    },
    reset() {
      startTime = null;
      current = { ...getFrame(0, config), state: "idle" };
      emit("reset");
    },
    cancel() {
      if (startTime === null) return false;
      startTime = null;
      current = { ...getFrame(0, config), state: "idle" };
      emit("printcancel");
      return true;
    },
  };
}
