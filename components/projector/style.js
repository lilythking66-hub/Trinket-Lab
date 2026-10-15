export const PROJECTOR_CSS = `
:host {
  --trinket-projector-body: #e9dec8;
  --trinket-projector-grain: 0;
  --trinket-projector-base: #2f4a3f;
  --trinket-projector-metal: #c8a264;
  --trinket-projector-accent: #d9583a;
  --trinket-projector-print: #4a3d2e;
  --trinket-projector-light: #ffc070;
  --trinket-projector-room: #120d0a;
  --trinket-projector-film: #1f150e;

  --_body: var(--trinket-projector-body);
  --_body-hi: color-mix(in oklab, var(--_body), white 22%);
  --_body-mid: color-mix(in oklab, var(--_body), black 9%);
  --_body-side: color-mix(in oklab, var(--_body), black 26%);
  --_body-dark: color-mix(in oklab, var(--_body), black 44%);
  --_base: var(--trinket-projector-base);
  --_base-hi: color-mix(in oklab, var(--_base), white 14%);
  --_base-side: color-mix(in oklab, var(--_base), black 30%);
  --_metal: var(--trinket-projector-metal);
  --_metal-hi: color-mix(in oklab, var(--_metal), white 55%);
  --_metal-mid: color-mix(in oklab, var(--_metal), black 20%);
  --_metal-dark: color-mix(in oklab, var(--_metal), black 52%);
  --_accent: var(--trinket-projector-accent);
  --_print: var(--trinket-projector-print);
  --_light: var(--trinket-projector-light);
  --_light-hi: color-mix(in oklab, var(--_light), white 55%);
  --_room: var(--trinket-projector-room);
  --_film: var(--trinket-projector-film);
  --_lamp: 0;

  display: block;
  position: relative;
  width: 100%;
  aspect-ratio: var(--trinket-projector-aspect, 16 / 9);
  -webkit-tap-highlight-color: transparent;
  contain: layout paint;
}
:host([hidden]) { display: none; }
:host([theme="green"]) {
  --trinket-projector-body: #5d7a68; --trinket-projector-base: #2b2621; --trinket-projector-print: #efe4cc;
}
:host([theme="walnut"]) {
  --trinket-projector-body: #7a4a2b; --trinket-projector-grain: 1; --trinket-projector-base: #2a221c; --trinket-projector-print: #f0dfbf;
}
* { box-sizing: border-box; }

.pj-stage { position: absolute; inset: 0; overflow: hidden; user-select: none; -webkit-user-select: none; }
.pj-abs, .pj-plane { position: absolute; left: 0; top: 0; }
.pj-plane { transform-origin: 0 0; }
.pj-abs { overflow: visible; pointer-events: none; }
.pj-fill { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }

/* ---- room (Cinema) ---- */
.pj-room {
  position: absolute; inset: 0; opacity: 0; pointer-events: none;
  background:
    radial-gradient(60% 70% at 62% 36%, color-mix(in oklab, var(--_room), var(--_light) 7%), transparent 70%),
    radial-gradient(120% 90% at 50% 40%, color-mix(in oklab, var(--_room), white 4%), var(--_room) 75%);
}
.pj-spill {
  position: absolute; left: 0; top: 0; opacity: 0; pointer-events: none; border-radius: 12%;
  background: radial-gradient(closest-side, color-mix(in srgb, var(--_light) 38%, transparent), transparent);
  filter: blur(18px);
  mix-blend-mode: screen;
}

/* ---- screen ---- */
.pj-screen {
  position: absolute; left: 0; top: 0; overflow: hidden; visibility: hidden;
  border-radius: 1.4% / 2%;
  background: #0b0908;
  box-shadow: 0 0 0 1px rgba(255, 230, 190, .05), 0 0 50px 4px color-mix(in srgb, var(--_light) 14%, transparent);
  -webkit-mask: radial-gradient(130% 135% at 50% 50%, #000 62%, transparent 72%);
  mask: radial-gradient(130% 135% at 50% 50%, #000 62%, transparent 72%);
}
.pj-jolt, .pj-weave { position: absolute; inset: -1.5%; }
.pj-weave { inset: 0; filter: blur(var(--_blur, 0px)); }
.pj-shot { position: absolute; inset: 0; opacity: 0; transition: opacity .6s ease; }
.pj-shot.cut { transition-duration: .01s; }
.pj-shot.on { opacity: 1; }
.pj-shot img, .pj-video {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block;
  filter: sepia(.2) saturate(.9) contrast(1.06) brightness(1.02);
}
.pj-video { object-fit: contain; background: #000; opacity: 0; transition: opacity .4s ease; }
.pj-screen[data-show="video"] .pj-video { opacity: 1; }
.pj-screen[data-show="video"] .pj-shot { opacity: 0; }
.pj-blank {
  position: absolute; inset: 0; opacity: 0; transition: opacity .4s ease;
  background:
    radial-gradient(circle at 50% 50%, transparent 0 18%, rgba(60, 40, 20, .25) 18.3% 18.8%, transparent 19.1% 31%, rgba(60, 40, 20, .2) 31.3% 31.7%, transparent 32%),
    linear-gradient(90deg, transparent calc(50% - .5px), rgba(60, 40, 20, .2) 0 calc(50% + .5px), transparent 0),
    linear-gradient(0deg, transparent calc(50% - .5px), rgba(60, 40, 20, .2) 0 calc(50% + .5px), transparent 0),
    radial-gradient(closest-side, #f6ead2, #d9c3a0);
}
.pj-screen[data-show="blank"] .pj-blank { opacity: 1; }
.pj-screen[data-show="blank"] .pj-shot { opacity: 0; }
.pj-grain { position: absolute; inset: 0; width: 100%; height: 100%; mix-blend-mode: overlay; opacity: 0; image-rendering: auto; }
.pj-vignette {
  position: absolute; inset: 0;
  background: radial-gradient(120% 110% at 50% 46%, transparent 45%, rgba(20, 10, 4, .35) 75%, rgba(10, 5, 2, .75) 100%);
  box-shadow: inset 0 0 40px rgba(60, 30, 10, .35);
}
.pj-dark { position: absolute; inset: 0; background: #070504; opacity: 1; }
.pj-shutter { position: absolute; inset: 0; background: #050302; opacity: 0; }

/* ---- beam ---- */
.pj-beam, .pj-dust, .pj-film-svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.pj-beam { mix-blend-mode: screen; visibility: hidden; filter: blur(3px); }
.pj-beam-core { filter: blur(6px); }
.pj-dust { mix-blend-mode: screen; }
.pj-flare {
  position: absolute; left: 0; top: 0; pointer-events: none; border-radius: 50%; opacity: 0;
  background: radial-gradient(closest-side, #fffaf0 0, var(--_light-hi) 14%, color-mix(in srgb, var(--_light) 45%, transparent) 34%, transparent 72%);
  mix-blend-mode: screen;
}

/* ---- machine ---- */
.pj-machine { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.pj-mscene { position: relative; }
.pj-ground { border-radius: 40px; background: #2a1c10; opacity: .32; filter: blur(14px); }
.pj-ground.pj-contact { opacity: .42; filter: blur(4px); border-radius: 8px; }
.pj-lens-shadow { border-radius: 50%; background: #000; opacity: .35; filter: blur(9px); }
.pj-body-shadow { background: #000; opacity: .25; filter: blur(4px); border-radius: 6px; }

.pj-base { background: var(--_base); }
.pj-base-top {
  border-radius: 7px;
  background: linear-gradient(120deg, var(--_base-hi), var(--_base) 45%, color-mix(in oklab, var(--_base), black 10%));
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--_metal) 70%, transparent), inset 0 0 0 3px rgba(0,0,0,.25), inset 2px 2px 0 3px rgba(255,255,255,.08);
}
.pj-base-front {
  background: linear-gradient(180deg, color-mix(in oklab, var(--_base), black 8%), var(--_base-side));
  box-shadow: inset 0 1.5px 0 var(--_metal-hi), inset 0 2.5px 0 var(--_metal-mid), inset 0 -3px 4px rgba(0,0,0,.3);
  border-radius: 0 0 3px 3px;
}
.pj-base-right { background: linear-gradient(180deg, var(--_base-side), color-mix(in oklab, var(--_base), black 48%)); box-shadow: inset 0 1.5px 0 var(--_metal-mid); }

.pj-body { overflow: hidden; }
.pj-body::before { content: ""; position: absolute; inset: 0; background-image: var(--_grain-img); background-size: 384px 192px; mix-blend-mode: multiply; opacity: calc(var(--trinket-projector-grain) * .85); pointer-events: none; }
.pj-front {
  border-radius: 6px 6px 2px 2px;
  background:
    repeating-linear-gradient(0deg, rgba(255,255,255,.035) 0 1px, transparent 1px 3px),
    linear-gradient(170deg, var(--_body-hi), var(--_body) 34%, var(--_body-mid));
  box-shadow: inset 0 1.5px 0 rgba(255,255,255,.55), inset 1.5px 0 0 rgba(255,255,255,.3), inset -2px 0 0 rgba(0,0,0,.1), inset 0 -5px 7px rgba(0,0,0,.16);
}
.pj-right {
  border-radius: 2px 6px 2px 2px;
  background: linear-gradient(180deg, var(--_body-side), var(--_body-dark));
  box-shadow: inset 1.5px 0 0 rgba(255,255,255,.22), inset 0 1.5px 0 rgba(255,255,255,.2);
}
.pj-top {
  border-radius: 6px;
  background: linear-gradient(110deg, var(--_body-hi), var(--_body) 60%, var(--_body-mid));
  box-shadow: inset 0 0 0 1.2px rgba(255,255,255,.4), inset -2px -2px 3px rgba(0,0,0,.1);
}
.pj-top-ribs {
  position: absolute; left: 10px; right: 76px; top: 10px; bottom: 10px; border-radius: 4px;
  background: repeating-linear-gradient(180deg, rgba(0,0,0,.13) 0 1px, rgba(255,255,255,.28) 1px 2px, transparent 2px 5px);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.08);
}
.pj-vents { position: absolute; left: 0; top: 18px; height: 40px; width: 60px; }
.pj-vents i { position: absolute; top: 0; width: 2.4px; height: 40px; border-radius: 2px; background: rgba(0,0,0,.38); box-shadow: 1px 0 0 rgba(255,255,255,.18); }

.pj-screws i { position: absolute; width: 4.5px; height: 4.5px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #fff, var(--_metal) 50%, var(--_metal-dark)); box-shadow: 0 .5px 0 rgba(0,0,0,.25); }
.pj-grille {
  position: absolute; left: 16px; top: 16px; width: 70px; height: 60px; border-radius: 6px;
  background: linear-gradient(180deg, color-mix(in oklab, var(--_body), black 30%), color-mix(in oklab, var(--_body), black 18%));
  box-shadow: inset 0 1px 2px rgba(0,0,0,.35), 0 1px 0 rgba(255,255,255,.4);
}
.pj-grille i { position: absolute; left: 7px; right: 7px; height: 4.4px; border-radius: 3px; background: linear-gradient(180deg, #120d09, #2a1f17); box-shadow: 0 .8px 0 rgba(255,255,255,.25); }
.pj-grille-glow { position: absolute; inset: 0; opacity: var(--_lamp); transition: opacity .2s; }
.pj-grille-glow i { background: linear-gradient(180deg, #fff3d8, var(--_light) 45%, color-mix(in oklab, var(--_light), #a03a10 45%)); box-shadow: 0 0 5px 1px color-mix(in srgb, var(--_light) 70%, transparent), 0 0 12px 3px color-mix(in srgb, var(--_light) 30%, transparent); }
.pj-badge { position: absolute; left: 16px; top: 84px; width: 70px; text-align: center; font: 700 4.6px/1 ui-rounded, "Avenir Next", system-ui, sans-serif; letter-spacing: 1.2px; color: var(--_print); opacity: .55; }

.pj-plate {
  position: absolute; left: 102px; top: 15px; width: 122px; height: 36px; border-radius: 3px;
  display: grid; place-content: center; text-align: center; gap: 2px;
  background: linear-gradient(180deg, color-mix(in oklab, var(--_metal), white 45%), var(--_metal) 55%, var(--_metal-mid));
  box-shadow: inset 0 0 0 .8px rgba(80,50,15,.5), inset 0 1px 0 rgba(255,255,255,.7), 0 1px 1.5px rgba(0,0,0,.35);
  color: #4c3412;
}
.pj-brand { font: 600 13.5px/1 "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Songti SC", serif; letter-spacing: .14em; text-shadow: 0 .6px 0 rgba(255,255,255,.55); white-space: nowrap; }
.pj-model { font: italic 5.5px/1 Georgia, serif; letter-spacing: .1em; opacity: .75; }

.pj-panel { position: absolute; left: 100px; top: 62px; width: 128px; height: 42px; }
.pj-cap { position: absolute; top: 35px; width: 24px; text-align: center; font: 700 3.8px/1 ui-rounded, system-ui, sans-serif; letter-spacing: .9px; color: var(--_print); opacity: .6; white-space: nowrap; }
.pj-toggle {
  position: absolute; left: 4px; top: 2px; width: 18px; height: 30px; padding: 0; border: 0; border-radius: 4px; cursor: pointer;
  background: linear-gradient(180deg, #2a2420, #15110e);
  box-shadow: inset 0 0 0 .8px var(--_metal-mid), inset 0 1px 0 rgba(255,255,255,.15), 0 1px 1px rgba(0,0,0,.3);
}
.pj-lever {
  position: absolute; left: 4px; width: 10px; height: 10px; border-radius: 50%; top: 17px;
  background: radial-gradient(circle at 35% 30%, #fff, var(--_metal-hi) 30%, var(--_metal) 60%, var(--_metal-dark));
  box-shadow: 0 2px 2px rgba(0,0,0,.5);
  transition: top .16s cubic-bezier(.3,1.6,.5,1);
}
.pj-lever::before { content: ""; position: absolute; left: 3.5px; top: 5px; width: 3px; height: 9px; background: linear-gradient(90deg, var(--_metal-dark), var(--_metal-hi), var(--_metal-mid)); z-index: -1; border-radius: 1px; }
:host([data-power]) .pj-lever { top: 3px; }
:host([data-power]) .pj-lever::before { top: -4px; }
.pj-led {
  position: absolute; left: 27px; top: 5px; width: 6px; height: 6px; border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, #8a3a2a, #3a160f);
  box-shadow: inset 0 0 0 .8px rgba(0,0,0,.4), 0 0 0 1px rgba(255,255,255,.35);
}
:host([data-power]) .pj-led { background: radial-gradient(circle at 40% 35%, #fff4e0, var(--_accent) 60%); box-shadow: 0 0 4px 1px color-mix(in srgb, var(--_accent) 70%, transparent), 0 0 0 1px rgba(255,255,255,.35); }
.pj-key {
  position: absolute; top: 6px; width: 23px; height: 21px; padding: 0; border: 0; border-radius: 3.5px; cursor: pointer;
  display: grid; place-items: center;
  background: linear-gradient(180deg, #3d3530, #1e1915 70%);
  box-shadow: inset 0 0 0 .8px rgba(255,255,255,.08), inset 0 1px 0 rgba(255,255,255,.2), 0 2.5px 0 #0c0907, 0 3px 3px rgba(0,0,0,.4);
  transition: transform .06s, box-shadow .06s;
}
.pj-key[data-hit="prev"] { left: 44px; }
.pj-key[data-hit="play"] { left: 71px; }
.pj-key[data-hit="next"] { left: 98px; }
.pj-key:active { transform: translateY(2px); box-shadow: inset 0 1px 0 rgba(255,255,255,.12), 0 .5px 0 #0c0907, 0 1px 1px rgba(0,0,0,.4); }
.pj-key svg { width: 11px; height: 9px; fill: var(--_metal-hi); filter: drop-shadow(0 .5px 0 rgba(0,0,0,.6)); }
.pj-i-pause { display: none; }
:host([data-playing]) .pj-i-play { display: none; }
:host([data-playing]) .pj-i-pause { display: inline; }
:host([data-playing]) .pj-key-play { box-shadow: inset 0 0 0 .8px color-mix(in srgb, var(--_accent) 60%, transparent), inset 0 1px 0 rgba(255,255,255,.2), 0 1.2px 0 #0c0907, 0 2px 2px rgba(0,0,0,.4); transform: translateY(1.3px); }

/* ---- reels ---- */
.pj-reel-back {
  border-radius: 50%;
  background: radial-gradient(circle at 45% 40%, color-mix(in oklab, var(--_metal-dark), black 10%), color-mix(in oklab, var(--_metal-dark), black 45%) 75%, color-mix(in oklab, var(--_metal), black 65%));
}
.pj-reel { border-radius: 50%; }
.pj-reel-rot { position: absolute; inset: 0; border-radius: 50%; will-change: transform; --pack: .24; }
.pj-pack { position: absolute; inset: 0; }
.pj-pack-g { transform: scale(var(--pack)); }
/* light stays put while the reel turns: a broad anisotropic sheen and a crisp rim glint */
.pj-reel-sheen {
  position: absolute; inset: 0; border-radius: 50%; pointer-events: none;
  background:
    conic-gradient(from 300deg, transparent, rgba(255,250,235,.38) 18deg, transparent 46deg, transparent 165deg, rgba(255,250,235,.2) 196deg, transparent 228deg),
    radial-gradient(circle at 34% 28%, rgba(255,252,240,.35), transparent 42%);
  -webkit-mask: radial-gradient(circle, transparent 0 9%, #000 10% 98%, transparent 99%);
  mask: radial-gradient(circle, transparent 0 9%, #000 10% 98%, transparent 99%);
  mix-blend-mode: soft-light;
}
.pj-reel-sheen::after {
  content: ""; position: absolute; inset: 0; border-radius: 50%;
  background: conic-gradient(from 300deg, transparent, rgba(255,252,240,.7) 14deg, transparent 34deg, transparent 180deg, rgba(255,252,240,.35) 200deg, transparent 222deg);
  -webkit-mask: radial-gradient(circle, transparent 0 94%, #000 95.5% 99%, transparent 99.5%);
  mask: radial-gradient(circle, transparent 0 94%, #000 95.5% 99%, transparent 99.5%);
  mix-blend-mode: screen;
}
.pj-reel { filter: drop-shadow(0 2px 2px rgba(40,24,8,.25)); }

/* ---- film bay, hatch and cans ---- */
.pj-layer { position: absolute; left: 0; top: 0; width: 0; height: 0; }
.pj-bay {
  border-radius: 4px;
  background: radial-gradient(120% 120% at 50% 40%, #2a2019, #0f0b08 70%);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.6), inset 0 6px 10px rgba(0,0,0,.7), 0 0 0 1.2px color-mix(in oklab, var(--_body), black 30%);
}
.pj-lid { position: absolute; left: 0; top: 0; }
.pj-lid-top {
  border-radius: 4px;
  background: linear-gradient(110deg, var(--_body-hi), var(--_body) 60%, var(--_body-mid));
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.18), inset 0 1.2px 0 rgba(255,255,255,.5), 0 1px 1.5px rgba(0,0,0,.18);
}
.pj-lid-top::before { content: ""; position: absolute; inset: 0; background-image: var(--_grain-img); background-size: 384px 192px; mix-blend-mode: multiply; opacity: calc(var(--trinket-projector-grain) * .85); border-radius: inherit; pointer-events: none; }
.pj-lid-ribs { position: absolute; left: 8px; right: 8px; top: 8px; bottom: 14px; border-radius: 3px; background: repeating-linear-gradient(180deg, rgba(0,0,0,.13) 0 1px, rgba(255,255,255,.28) 1px 2px, transparent 2px 5px); }
.pj-latch { position: absolute; left: calc(50% - 9px); bottom: 3px; width: 18px; height: 6px; border-radius: 2px; background: linear-gradient(180deg, var(--_metal-hi), var(--_metal) 50%, var(--_metal-dark)); box-shadow: 0 .5px 0 rgba(0,0,0,.35); }
.pj-lid-top.inner { background: linear-gradient(180deg, color-mix(in oklab, var(--_body), black 45%), color-mix(in oklab, var(--_body), black 60%)); }
.pj-lid-top.inner .pj-lid-ribs, .pj-lid-top.inner .pj-latch { visibility: hidden; }
.pj-lid-front { background: linear-gradient(180deg, var(--_body-mid), var(--_body-side)); border-radius: 0 0 2px 2px; }
:host([data-can-over]) .pj-bay { box-shadow: inset 0 0 0 1px rgba(0,0,0,.6), inset 0 6px 10px rgba(0,0,0,.7), 0 0 0 2px color-mix(in srgb, var(--_accent) 70%, white); }
:host([data-can-over]) .pj-lid-top:not(.inner) { box-shadow: 0 0 0 2px color-mix(in srgb, var(--_accent) 70%, white), 0 0 18px color-mix(in srgb, var(--_accent) 45%, transparent); }
.pj-can { position: absolute; left: 0; top: 0; width: 0; height: 0; will-change: transform; }
.pj-layer[data-slot="table"] .pj-can { cursor: grab; pointer-events: auto; }
.pj-can.held { cursor: grabbing; }
.pj-can.held .pj-can-shadow { opacity: .18; }
.pj-can:focus-visible .pj-can-lid { outline: 2.5px solid color-mix(in srgb, var(--_accent) 70%, white); outline-offset: 2px; }
.pj-can-lid { border-radius: 50%; pointer-events: auto; }
.pj-can svg.pj-abs { pointer-events: auto; }
.pj-can-shadow { border-radius: 50%; background: #1b120a; opacity: .35; filter: blur(5px); pointer-events: none; }
.pj-layer[data-slot="bay"] .pj-can-shadow { display: none; }

/* ---- lens ---- */
.pj-lamp-glass { opacity: calc(var(--_lamp) * .92); mix-blend-mode: screen; }
.pj-hit-focus { border-radius: 40%; cursor: ew-resize; touch-action: none; }

/* ---- film ---- */
.pj-film { position: absolute; inset: 0; pointer-events: none; outline: none; }
.pj-film:focus-visible .pj-film-base { stroke: color-mix(in srgb, var(--_accent) 70%, white); stroke-width: 2; }
.pj-film-base { fill: var(--_film); fill-opacity: .94; }
.pj-film-edge { stroke: rgba(255, 228, 190, .22); stroke-width: 1.2; }
.pj-film-hit { fill: none; pointer-events: all; cursor: grab; touch-action: none; }
:host([data-dragging]) .pj-film-hit { cursor: grabbing; }
.pj-film-svg { filter: drop-shadow(0 12px 14px rgba(40, 22, 8, .28)); }
.pj-film-canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }

/* ---- hit targets ---- */
.pj-hit { position: absolute; padding: 0; margin: 0; border: 0; background: transparent; cursor: pointer; pointer-events: auto; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
.pj-hit-round { border-radius: 50%; }
.pj-hit:focus-visible, .pj-key:focus-visible, .pj-toggle:focus-visible { outline: 2.5px solid color-mix(in srgb, var(--_accent) 70%, white); outline-offset: 2px; }

/* ---- drop / misc ---- */
.pj-drop {
  position: absolute; inset: 5%; display: grid; place-items: center; pointer-events: none; opacity: 0;
  border: 2px dashed color-mix(in srgb, var(--_accent) 60%, white); border-radius: 22px;
  background: color-mix(in srgb, white 50%, transparent); -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px);
  color: #3c3530; font: 600 14px/1.4 ui-rounded, system-ui, sans-serif; transition: opacity .18s ease;
}
:host([data-dropping]) .pj-drop { opacity: 1; }
.pj-file { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.pj-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

@media (prefers-reduced-motion: reduce) {
  .pj-lever, .pj-shot, .pj-video { transition-duration: .01s; }
}
`;
