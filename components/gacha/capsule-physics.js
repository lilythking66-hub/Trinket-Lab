// Tiny 2D capsule pile inside a round globe. Verlet integration + positional
// constraint solving. Platform-neutral: no DOM, works in design units.

const TAU = Math.PI * 2;

export function createGlobeSim({
  cx, cy, radius,          // globe circle
  floorY,                  // flat floor the pile rests on
  ceilingY = -Infinity,    // underside of the lid
  ballRadius = 24,
  gravity = 1900,
  rng = Math.random,
} = {}) {
  const balls = [];
  let nextId = 1;
  let sleepTime = 0;

  function add(props = {}, spawn = "top") {
    const r = props.r ?? ballRadius * (0.96 + rng() * 0.08);
    let x, y;
    if (spawn === "top") {
      x = cx + (rng() - 0.5) * radius * 0.8;
      y = Math.max(ceilingY + r + 2, cy - radius * 0.55) + rng() * 20;
    } else {
      x = spawn.x; y = spawn.y;
    }
    const ball = {
      id: nextId++, x, y, px: x - (rng() - 0.5) * 2, py: y, r,
      angle: rng() * TAU, spin: 0, ...props,
    };
    balls.push(ball);
    sleepTime = 0;
    return ball;
  }

  function remove(ball) {
    const i = balls.indexOf(ball);
    if (i >= 0) balls.splice(i, 1);
    sleepTime = 0;
  }

  function clear() { balls.length = 0; }

  /** Ball closest to a point (default: the exit at the bottom centre). */
  function nearest(x = cx, y = floorY, filter = () => true) {
    let best = null, bestD = Infinity;
    for (const ball of balls) {
      if (!filter(ball)) continue;
      const d = (ball.x - x) ** 2 + (ball.y - y) ** 2;
      if (d < bestD) { bestD = d; best = ball; }
    }
    return best;
  }

  /** Random velocity kick for the lower part of the pile (detent jolt). */
  function kick(strength = 1) {
    for (const ball of balls) {
      const depth = Math.max(0, (ball.y - (floorY - radius * 0.9)) / (radius * 0.9));
      const s = strength * (0.25 + depth) * 3.2;
      ball.px -= (rng() - 0.5) * s * 1.6;
      ball.py += s * (0.6 + rng() * 0.8);
    }
    sleepTime = 0;
  }

  function constrain(ball) {
    // Globe wall
    const dx = ball.x - cx, dy = ball.y - cy;
    const d = Math.hypot(dx, dy);
    const max = radius - ball.r;
    if (d > max) {
      const k = max / d;
      ball.x = cx + dx * k;
      ball.y = cy + dy * k;
    }
    if (ball.y > floorY - ball.r) {
      ball.y = floorY - ball.r;
      // floor friction
      ball.px += (ball.x - ball.px) * 0.08;
    }
    if (ball.y < ceilingY + ball.r) ball.y = ceilingY + ball.r;
  }

  /**
   * Advance the simulation.
   * stir: angular speed (rad/s) of the internal agitator driven by the knob.
   */
  function step(dt, { stir = 0 } = {}) {
    const h = Math.min(dt, 1 / 30);
    const sub = Math.max(1, Math.ceil(h / (1 / 120)));
    const sdt = h / sub;
    let motion = 0;
    for (let s = 0; s < sub; s++) {
      for (const ball of balls) {
        let ax = 0, ay = gravity;
        if (stir) {
          // agitator paddle near the floor pushes the lower pile around a pivot
          const ox = ball.x - cx, oy = ball.y - (floorY - ballRadius * 1.6);
          const lower = Math.max(0, 1 - Math.abs(oy) / (radius * 0.85));
          const len = Math.hypot(ox, oy) || 1;
          const f = stir * 260 * lower;
          ax += (-oy / len) * f;
          ay += (ox / len) * f - Math.abs(stir) * 160 * lower;
        }
        const vx = (ball.x - ball.px) * 0.992;
        const vy = (ball.y - ball.py) * 0.992;
        ball.px = ball.x; ball.py = ball.y;
        ball.x += vx + ax * sdt * sdt;
        ball.y += vy + ay * sdt * sdt;
      }
      for (let iter = 0; iter < 3; iter++) {
        for (let i = 0; i < balls.length; i++) {
          const a = balls[i];
          for (let j = i + 1; j < balls.length; j++) {
            const b = balls[j];
            const dx = b.x - a.x, dy = b.y - a.y;
            const min = a.r + b.r;
            const d2 = dx * dx + dy * dy;
            if (d2 >= min * min || d2 === 0) continue;
            const d = Math.sqrt(d2);
            const push = (min - d) / d * 0.5;
            a.x -= dx * push; a.y -= dy * push;
            b.x += dx * push; b.y += dy * push;
          }
        }
        for (const ball of balls) constrain(ball);
      }
      for (const ball of balls) {
        const vx = ball.x - ball.px;
        // rolling: spin follows horizontal travel, decays otherwise
        ball.spin = ball.spin * 0.9 + (vx / ball.r) * 0.1;
        ball.angle += ball.spin;
        motion = Math.max(motion, Math.abs(vx), Math.abs(ball.y - ball.py));
      }
    }
    sleepTime = motion < 0.02 && !stir ? sleepTime + h : 0;
    return motion;
  }

  /** Run until settled (or for at most `seconds`). Useful on first paint. */
  function settle(seconds = 3) {
    const dt = 1 / 60;
    for (let t = 0; t < seconds; t += dt) {
      step(dt);
      if (sleepTime > 0.4) break;
    }
    for (const ball of balls) { ball.px = ball.x; ball.py = ball.y; ball.spin = 0; }
    sleepTime = 1;
  }

  return {
    balls, add, remove, clear, nearest, kick, step, settle,
    get asleep() { return sleepTime > 0.6; },
    wake() { sleepTime = 0; },
    geometry: { cx, cy, radius, floorY, ceilingY, ballRadius },
  };
}
