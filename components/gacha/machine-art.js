// Procedural vector skin for the classic tabletop gacha machine.
// Everything is drawn in one 400 × 700 design view. Colours come from CSS
// custom properties so themes never touch geometry or interaction code.

export const GEOM = {
  width: 400,
  height: 700,
  globe: { cx: 200, cy: 222, r: 158 },
  lidY: 86,
  floorY: 354,
  exit: { x: 200, y: 356, rx: 30, ry: 8 },
  canvas: { x: 38, y: 60, w: 324, h: 344 },
  knob: { cx: 152, cy: 506, r: 52 },
  coin: { x: 236, y: 424, w: 60, h: 88, slotX: 266, slotY: 444, slotH: 46 },
  tray: { x: 124, y: 578, w: 128, h: 56 },
  capsuleR: 25,
};

const esc = (value) => String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const stop = (offset, color, opacity = 1) =>
  '<stop offset="' + offset + '" style="stop-color:' + color + ";stop-opacity:" + opacity + '"/>';

const DEFS = `
<defs>
  <linearGradient id="accentH" x1="0" x2="1" y1="0" y2="0">
    ${stop(0, "var(--_accent-dark)")}${stop(0.18, "var(--_accent)")}${stop(0.42, "var(--_accent-hi)")}${stop(0.7, "var(--_accent)")}${stop(1, "var(--_accent-deep)")}
  </linearGradient>
  <linearGradient id="accentV" x1="0" x2="0" y1="0" y2="1">
    ${stop(0, "var(--_accent-hi)")}${stop(0.5, "var(--_accent)")}${stop(1, "var(--_accent-dark)")}
  </linearGradient>
  <radialGradient id="lid" cx=".38" cy=".25" r=".9">
    ${stop(0, "var(--_accent-hi)")}${stop(0.45, "var(--_accent)")}${stop(1, "var(--_accent-deep)")}
  </radialGradient>
  <linearGradient id="bodyFront" x1="0" x2="1" y1="0" y2="0">
    ${stop(0, "var(--_body-shade)")}${stop(0.12, "var(--_body)")}${stop(0.55, "var(--_body-hi)")}${stop(1, "var(--_body)")}
  </linearGradient>
  <linearGradient id="bodySide" x1="0" x2="1" y1="0" y2="0">
    ${stop(0, "var(--_body-shade)")}${stop(1, "var(--_body-deep)")}
  </linearGradient>
  <linearGradient id="bodyV" x1="0" x2="0" y1="0" y2="1">
    ${stop(0, "#fff", 0.0)}${stop(0.85, "#000", 0.0)}${stop(1, "#000", 0.08)}
  </linearGradient>
  <radialGradient id="globeBack" cx=".5" cy=".5" r=".5">
    ${stop(0, "var(--_glass)", 0.05)}${stop(0.78, "var(--_glass)", 0.14)}${stop(1, "var(--_glass-edge)", 0.42)}
  </radialGradient>
  <radialGradient id="globeFront" cx=".34" cy=".3" r=".75">
    ${stop(0, "#fff", 0.10)}${stop(0.5, "#fff", 0.0)}${stop(0.92, "var(--_glass-edge)", 0.10)}${stop(1, "var(--_glass-edge)", 0.32)}
  </radialGradient>
  <radialGradient id="metal" cx=".36" cy=".32" r=".8">
    ${stop(0, "var(--_metal-hi)")}${stop(0.5, "var(--_metal)")}${stop(1, "var(--_metal-dark)")}
  </radialGradient>
  <linearGradient id="metalPlate" x1="0" x2="1" y1="0" y2="1">
    ${stop(0, "var(--_metal-hi)")}${stop(0.55, "var(--_metal)")}${stop(1, "var(--_metal-dark)")}
  </linearGradient>
  <linearGradient id="cavity" x1="0" x2="0" y1="0" y2="1">
    ${stop(0, "#140c08")}${stop(0.55, "#2a1d16")}${stop(1, "#3d2c22")}
  </linearGradient>
  <radialGradient id="hole" cx=".5" cy=".4" r=".6">
    ${stop(0, "#0d0806")}${stop(1, "var(--_accent-deep)")}
  </radialGradient>
  <linearGradient id="floor" x1="0" x2="0" y1="0" y2="1">
    ${stop(0, "var(--_accent-deep)")}${stop(1, "var(--_accent-dark)")}
  </linearGradient>
  <filter id="soft" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>
  <filter id="grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 .5  0 0 0 0 .45  0 0 0 0 .4  0 0 0 .07 0"/>
    <feComposite in2="SourceGraphic" operator="in"/>
  </filter>
</defs>`;

/** Behind the capsule canvas: ground shadow, inner globe glass, floor. */
export function backSvg() {
  const { cx, cy, r } = GEOM.globe;
  const e = GEOM.exit;
  return `<svg class="tg-layer" viewBox="0 0 400 700" aria-hidden="true">${DEFS}
  <ellipse cx="204" cy="680" rx="176" ry="14" fill="var(--_shadow)" opacity=".38" filter="url(#soft)"/>
  <ellipse cx="204" cy="676" rx="150" ry="6" fill="var(--_shadow)" opacity=".35"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#globeBack)"/>
  <ellipse cx="200" cy="${GEOM.floorY + 2}" rx="128" ry="17" fill="url(#floor)"/>
  <ellipse cx="200" cy="${GEOM.floorY + 2}" rx="114" ry="13" fill="#000" opacity=".12"/>
  <ellipse cx="${e.x}" cy="${e.y}" rx="${e.rx}" ry="${e.ry}" fill="url(#hole)"/>
  <path d="M${e.x - e.rx} ${e.y} A${e.rx} ${e.ry} 0 0 0 ${e.x + e.rx} ${e.y}" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="1.5"/>
</svg>`;
}

/** In front of the capsules: glass, lid, collar, body, plates, tray frame. */
export function frontSvg({ label = "GACHA", price = "100" } = {}) {
  const { cx, cy, r } = GEOM.globe;
  const k = GEOM.knob;
  const c = GEOM.coin;
  const t = GEOM.tray;
  const arcR = k.r + 15;
  const a0 = (-52 * Math.PI) / 180, a1 = (38 * Math.PI) / 180;
  const ax0 = k.cx + arcR * Math.cos(a0), ay0 = k.cy + arcR * Math.sin(a0);
  const ax1 = k.cx + arcR * Math.cos(a1), ay1 = k.cy + arcR * Math.sin(a1);
  const tx = -Math.sin(a1), ty = Math.cos(a1); // clockwise tangent
  const nx = Math.cos(a1), ny = Math.sin(a1);
  const head = [
    [ax1 + tx * 13, ay1 + ty * 13],
    [ax1 + nx * 7.5, ay1 + ny * 7.5],
    [ax1 - nx * 7.5, ay1 - ny * 7.5],
  ].map((p) => p.map((v) => v.toFixed(1)).join(" ")).join(" L");

  const vents = Array.from({ length: 6 }, (_, i) => {
    const y = 448 + i * 13;
    return `<path d="M322 ${y + 5} L338 ${y - 2}" stroke="var(--_body-deep)" stroke-width="4" stroke-linecap="round" opacity=".55"/>
    <path d="M322 ${y + 7} L338 ${y}" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity=".35"/>`;
  }).join("");

  return `<svg class="tg-layer" viewBox="0 0 400 700" aria-hidden="true">${DEFS}
  <!-- globe glass -->
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#globeFront)"/>
  <circle cx="${cx}" cy="${cy}" r="${r - 3}" fill="none" stroke="var(--_glass-edge)" stroke-opacity=".28" stroke-width="5"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.6"/>
  <path d="M86 150 C 64 196, 62 260, 86 312 C 74 262, 76 200, 104 146 Z" fill="#fff" opacity=".42"/>
  <path d="M96 128 C 104 116, 114 106, 126 98" stroke="#fff" stroke-opacity=".7" stroke-width="5" stroke-linecap="round" fill="none"/>
  <path d="M292 140 C 312 170, 320 206, 318 236" stroke="#fff" stroke-opacity=".38" stroke-width="7" stroke-linecap="round" fill="none"/>
  <ellipse cx="296" cy="290" rx="6" ry="16" transform="rotate(28 296 290)" fill="#fff" opacity=".22"/>
  <circle cx="114" cy="118" r="3" fill="#fff" opacity=".8"/>

  <!-- lid -->
  <path d="M116 ${GEOM.lidY} L116 ${GEOM.lidY + 7} A84 10 0 0 0 284 ${GEOM.lidY + 7} L284 ${GEOM.lidY} Z" fill="var(--_accent-deep)"/>
  <path d="M116 ${GEOM.lidY} C116 58 150 46 200 46 C250 46 284 58 284 ${GEOM.lidY} A84 10 0 0 1 116 ${GEOM.lidY} Z" fill="url(#lid)"/>
  <ellipse cx="200" cy="${GEOM.lidY}" rx="84" ry="10" fill="none" stroke="var(--_accent-deep)" stroke-opacity=".5" stroke-width="1.5"/>
  <path d="M138 70 C 152 56, 178 51, 204 51" stroke="#fff" stroke-opacity=".5" stroke-width="5" stroke-linecap="round" fill="none"/>
  <ellipse cx="200" cy="48" rx="20" ry="5.5" fill="var(--_accent-dark)"/>
  <ellipse cx="200" cy="46.5" rx="16" ry="3.8" fill="var(--_accent-hi)"/>

  <!-- collar -->
  <path d="M72 ${GEOM.floorY + 2} A128 17 0 0 0 328 ${GEOM.floorY + 2} L334 392 A134 14 0 0 1 66 392 Z" fill="url(#accentH)"/>
  <path d="M72 ${GEOM.floorY + 2} A128 17 0 0 0 328 ${GEOM.floorY + 2}" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="2"/>
  <path d="M68 380 A132 15 0 0 0 332 380" fill="none" stroke="#000" stroke-opacity=".12" stroke-width="2"/>

  <!-- body: top face, side, front -->
  <path d="M60 396 L316 396 L342 384 L86 384 Z" fill="var(--_body-shade)"/>
  <path d="M316 396 L342 384 L342 632 L316 646 Z" fill="url(#bodySide)"/>
  ${vents}
  <rect x="60" y="392" width="256" height="254" rx="10" fill="url(#bodyFront)"/>
  <rect x="60" y="392" width="256" height="254" rx="10" fill="url(#bodyV)"/>
  <rect x="60" y="392" width="256" height="254" rx="10" filter="url(#grain)" fill="#fff"/>
  <path d="M60 404 L60 402 Q60 392 70 392 L306 392 Q316 392 316 402 L316 410 L60 410 Z" fill="url(#accentV)"/>
  <path d="M316 398 L342 386 L342 398 L316 410 Z" fill="var(--_accent-dark)"/>
  <path d="M66 412 L310 412" stroke="#fff" stroke-opacity=".7" stroke-width="1.2"/>
  <path d="M61 420 L61 636" stroke="#fff" stroke-opacity=".5" stroke-width="1.5"/>

  <!-- label plate -->
  <rect x="80" y="418" width="104" height="24" rx="4" fill="var(--_body-hi)" stroke="var(--_accent)" stroke-width="1.5"/>
  <text x="132" y="435.5" text-anchor="middle" font-family="ui-rounded, 'Arial Rounded MT Bold', 'Avenir Next', system-ui, sans-serif" font-weight="800" font-size="15" letter-spacing="2.5" fill="var(--_accent)">${esc(label)}</text>

  <!-- knob housing -->
  <circle cx="${k.cx}" cy="${k.cy + 3}" r="${k.r + 8}" fill="#000" opacity=".1"/>
  <circle cx="${k.cx}" cy="${k.cy}" r="${k.r + 7}" fill="url(#metalPlate)"/>
  <circle cx="${k.cx}" cy="${k.cy}" r="${k.r + 2}" fill="var(--_metal-dark)"/>
  <path d="M${ax0.toFixed(1)} ${ay0.toFixed(1)} A${arcR} ${arcR} 0 0 1 ${ax1.toFixed(1)} ${ay1.toFixed(1)}" fill="none" stroke="var(--_accent)" stroke-width="5.5" stroke-linecap="round"/>
  <path d="M${head} Z" fill="var(--_accent)"/>

  <!-- coin plate -->
  <rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="8" fill="url(#metalPlate)" stroke="var(--_metal-dark)" stroke-opacity=".6"/>
  <rect x="${c.x + 5}" y="${c.y + 5}" width="${c.w - 10}" height="${c.h - 10}" rx="5" fill="none" stroke="#fff" stroke-opacity=".45"/>
  <rect x="${c.slotX - 5}" y="${c.slotY - 3}" width="10" height="${c.slotH + 6}" rx="5" fill="var(--_metal-dark)"/>
  <rect x="${c.slotX - 2.5}" y="${c.slotY}" width="5" height="${c.slotH}" rx="2.5" fill="#120b08"/>
  <rect x="${c.x}" y="${c.y + c.h + 10}" width="${c.w}" height="26" rx="4" fill="#fffdf8" stroke="var(--_body-deep)" stroke-opacity=".5"/>
  <text x="${c.x + c.w / 2}" y="${c.y + c.h + 28.5}" text-anchor="middle" font-family="ui-rounded, 'Avenir Next', system-ui, sans-serif" font-weight="700" font-size="15" fill="#3b3330">${esc(price)}</text>

  <!-- tray frame + cavity -->
  <rect x="${t.x - 14}" y="${t.y - 12}" width="${t.w + 28}" height="${t.h + 20}" rx="9" fill="url(#accentV)"/>
  <rect x="${t.x - 14}" y="${t.y - 12}" width="${t.w + 28}" height="${t.h + 20}" rx="9" fill="none" stroke="#fff" stroke-opacity=".35"/>
  <rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" rx="5" fill="url(#cavity)"/>
  <path d="M${t.x + 6} ${t.y + 2} L${t.x + t.w - 6} ${t.y + 2}" stroke="#000" stroke-opacity=".6" stroke-width="6"/>

  <!-- base -->
  <path d="M320 646 L346 632 L346 656 L320 672 Z" fill="var(--_accent-deep)"/>
  <rect x="54" y="644" width="266" height="28" rx="6" fill="url(#accentH)"/>
  <path d="M60 647 L314 647" stroke="#fff" stroke-opacity=".4" stroke-width="1.2"/>
  <rect x="70" y="670" width="30" height="8" rx="3" fill="#2b2420"/>
  <rect x="276" y="670" width="30" height="8" rx="3" fill="#2b2420"/>
</svg>`;
}

/** Tray capsule sits in its own clipped layer between frontSvg and flapSvg. */
export function flapSvg() {
  return `<svg viewBox="0 0 140 64" preserveAspectRatio="none" aria-hidden="true">
  <path d="M2 0 L138 0 L140 62 L0 62 Z" fill="#eaf3f8" fill-opacity=".16" stroke="#fff" stroke-opacity=".7" stroke-width="1.4"/>
  <path d="M12 6 L40 56" stroke="#fff" stroke-opacity=".38" stroke-width="5" stroke-linecap="round"/>
  <path d="M30 6 L44 32" stroke="#fff" stroke-opacity=".3" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M0 54 L140 54 L140 62 L0 62 Z" fill="#fff" fill-opacity=".22"/>
  <path d="M2 1.5 L138 1.5" stroke="#fff" stroke-opacity=".8" stroke-width="2.2"/>
</svg>`;
}

/** The part of the knob that rotates (brushed disk + grip bar). */
export function knobRotorSvg() {
  const ticks = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    const x1 = Math.cos(a) * 44, y1 = Math.sin(a) * 44;
    const x2 = Math.cos(a) * 49, y2 = Math.sin(a) * 49;
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }).join("");
  return `<svg viewBox="-52 -52 104 104" aria-hidden="true">
  <defs>
    <radialGradient id="kd" cx=".5" cy=".5" r=".5">
      ${stop(0, "var(--_metal-hi)")}${stop(0.7, "var(--_metal)")}${stop(1, "var(--_metal-dark)")}
    </radialGradient>
    <linearGradient id="kb" x1="0" x2="0" y1="0" y2="1">
      ${stop(0, "var(--_metal-hi)")}${stop(0.45, "var(--_metal)")}${stop(0.55, "var(--_metal-dark)")}${stop(1, "var(--_metal)")}
    </linearGradient>
  </defs>
  <circle r="50" fill="url(#kd)"/>
  <g stroke="var(--_metal-dark)" stroke-width="1.6" stroke-opacity=".7">${ticks}</g>
  <circle r="40" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1"/>
  <rect x="-46" y="-12" width="92" height="24" rx="12" fill="#000" opacity=".16" transform="translate(1.5 3)"/>
  <rect x="-46" y="-12" width="92" height="24" rx="12" fill="url(#kb)" stroke="var(--_metal-dark)" stroke-width="1"/>
  <rect x="-40" y="-8" width="80" height="5" rx="2.5" fill="#fff" opacity=".55"/>
  <circle cx="34" cy="0" r="3.2" fill="var(--_accent)"/>
  <circle r="7" fill="var(--_metal-dark)"/><circle r="4.5" fill="var(--_metal-hi)"/>
</svg>`;
}

/** Static light on top of the rotating knob, so the highlight never spins. */
export function knobGlossSvg() {
  return `<svg viewBox="-52 -52 104 104" aria-hidden="true">
  <defs><radialGradient id="kg" cx=".3" cy=".25" r=".7">${stop(0, "#fff", 0.55)}${stop(0.5, "#fff", 0.08)}${stop(1, "#000", 0.18)}</radialGradient></defs>
  <circle r="50" fill="url(#kg)"/>
  <path d="M-34 -30 A46 46 0 0 1 4 -46" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-linecap="round" fill="none"/>
</svg>`;
}

export function coinSvg() {
  return `<svg viewBox="-20 -20 40 40" aria-hidden="true">
  <defs><radialGradient id="cg" cx=".35" cy=".3" r=".8">${stop(0, "#fff6d6")}${stop(0.45, "#e2bd6a")}${stop(1, "#9c7430")}</radialGradient></defs>
  <circle r="18" fill="url(#cg)" stroke="#8a6526" stroke-width="1.2"/>
  <circle r="13.5" fill="none" stroke="#fff4cf" stroke-opacity=".7" stroke-width="1.2"/>
  <text y="5" text-anchor="middle" font-size="13" font-weight="800" font-family="system-ui,sans-serif" fill="#8a6526">✦</text>
</svg>`;
}
