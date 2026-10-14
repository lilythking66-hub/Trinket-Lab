export const TURNTABLE_CSS = `
:host {
  --trinket-turntable-body: #8a4f2c;
  --trinket-turntable-grain: 1;
  --trinket-turntable-metal: #c9c5bd;
  --trinket-turntable-mat: #26262a;
  --trinket-turntable-accent: #e24a37;
  --trinket-turntable-shadow: #3b2414;
  --trinket-turntable-print: #3a3631;
  --trinket-turntable-lid: #3b322c;

  --_body: var(--trinket-turntable-body);
  --_body-hi: color-mix(in oklab, var(--_body), white 16%);
  --_body-side: color-mix(in oklab, var(--_body), black 18%);
  --_body-dark: color-mix(in oklab, var(--_body), black 38%);
  --_metal: var(--trinket-turntable-metal);
  --_metal-hi: color-mix(in oklab, var(--_metal), white 62%);
  --_metal-mid: color-mix(in oklab, var(--_metal), black 18%);
  --_metal-dark: color-mix(in oklab, var(--_metal), black 48%);
  --_mat: var(--trinket-turntable-mat);
  --_accent: var(--trinket-turntable-accent);
  --_shadow: var(--trinket-turntable-shadow);
  --_print: var(--trinket-turntable-print);
  --_print-wood: color-mix(in oklab, var(--_body), black 62%);
  --_base: var(--trinket-turntable-base, #231a15);
  --_lid: var(--trinket-turntable-lid);
  --_k: 1;

  display: block;
  position: relative;
  width: 100%;
  max-width: var(--trinket-turntable-width, 560px);
  -webkit-tap-highlight-color: transparent;
  contain: layout;
}
:host([hidden]) { display: none; }
:host([theme="espresso"]) { --trinket-turntable-body: #4a2e20; --trinket-turntable-metal: #bfbab2; --trinket-turntable-shadow: #22140b; }
:host([theme="cream"]) { --trinket-turntable-body: #eee4d0; --trinket-turntable-grain: 0; --trinket-turntable-metal: #cdc8be; --trinket-turntable-shadow: #5a4a36; --trinket-turntable-accent: #d9542f; }
:host([theme="mint"]) { --trinket-turntable-body: #9fcbb5; --trinket-turntable-grain: 0; --trinket-turntable-metal: #d2d0c8; --trinket-turntable-shadow: #2f4a3c; --trinket-turntable-accent: #e0623f; }
* { box-sizing: border-box; }

.tt-stage {
  position: relative;
  width: 100%;
  user-select: none;
  -webkit-user-select: none;
}
.tt-scene {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
  transform: scale(var(--_k));
}
.tt-abs, .tt-plane, .tt-slot { position: absolute; left: 0; top: 0; }
.tt-plane { transform-origin: 0 0; }
.tt-abs { overflow: visible; pointer-events: none; }
.tt-fill { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.tt-slot { width: 0; height: 0; }

/* ---- plinth ---- */
.tt-ground {
  width: 560px; height: 420px;
  border-radius: 40px;
  background: var(--_shadow);
  opacity: .5;
  filter: blur(22px);
}
.tt-ground.tt-contact { opacity: .55; filter: blur(5px); border-radius: 10px; }
.tt-wood {
  background-color: var(--_body);
  overflow: hidden;
}
.tt-wood::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: var(--_grain);
  background-size: 640px 320px;
  mix-blend-mode: multiply;
  opacity: calc(var(--trinket-turntable-grain) * 1);
}
.tt-wood::after { content: ""; position: absolute; inset: 0; }
.tt-top { width: 560px; height: 420px; clip-path: inset(7px); }
.tt-top::after {
  /* clear coat: warm window light from the left, two soft window reflections */
  background:
    linear-gradient(112deg, transparent 47%, rgba(255, 249, 236, .10) 50%, rgba(255, 249, 236, .07) 57%, transparent 60%,
      transparent 63%, rgba(255, 249, 236, .08) 65.5%, rgba(255, 249, 236, .05) 71%, transparent 73.5%),
    linear-gradient(100deg, rgba(255, 236, 200, .26), rgba(255, 236, 200, .06) 38%, rgba(0, 0, 0, 0) 60%, rgba(0, 0, 0, .1));
  box-shadow: inset 0 0 18px rgba(40, 20, 8, .12);
}
.tt-face { height: 54px; }
.tt-face::after { box-shadow: inset 0 -10px 12px -4px rgba(0,0,0,.28); }
.tt-front { width: 560px; }
.tt-front::after { background: linear-gradient(90deg, rgba(255, 236, 205, .06), rgba(0,0,0,.05) 45%, rgba(0,0,0,.16)), linear-gradient(180deg, rgba(255,240,220,.08), transparent 30%); }
.tt-left { width: 420px; }
.tt-left::after { background: linear-gradient(90deg, rgba(0,0,0,.08), rgba(255, 232, 196, .07) 70%, rgba(255, 232, 196, .1)); }
.tt-right { width: 420px; }
.tt-right::after { background: rgba(0,0,0,.34); }
.tt-back { width: 560px; }
.tt-back::after { background: rgba(0,0,0,.38); }

/* bevelled top edge: catches the light and draws the silhouette */
.tt-bevel::before { background-size: 640px 320px; }
.tt-bevel-front::after { background: linear-gradient(180deg, rgba(255, 246, 228, .42), rgba(255, 240, 215, .14) 55%, rgba(0,0,0,.08)), linear-gradient(90deg, transparent 60%, rgba(0,0,0,.1)); }
.tt-bevel-left::after { background: linear-gradient(180deg, rgba(255, 246, 228, .5), rgba(255, 240, 215, .2)); }
.tt-bevel-right::after { background: linear-gradient(180deg, rgba(255,240,220,.1), rgba(0,0,0,.18)); }
.tt-bevel-back::after { background: linear-gradient(180deg, rgba(255,240,220,.18), rgba(0,0,0,.08)); }

/* recessed base the body floats on */
.tt-base {
  background: linear-gradient(180deg, color-mix(in oklab, var(--_base), white 10%), var(--_base) 40%, color-mix(in oklab, var(--_base), black 35%));
  box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
}
.tt-base-right, .tt-base-back { filter: brightness(.7); }
.tt-nameplate {
  position: absolute;
  left: 34px;
  top: 17px;
  height: 20px;
  min-width: 82px;
  padding: 0 11px;
  border-radius: 2px;
  display: grid;
  place-items: center;
  font: 700 8.5px/1 ui-rounded, "Avenir Next", system-ui, sans-serif;
  letter-spacing: .24em;
  color: #5a4220;
  background: linear-gradient(180deg, #f6e2b3, #d6b26b 55%, #b8904a);
  box-shadow: inset 0 0 0 .8px rgba(90, 60, 20, .5), inset 0 1px 0 rgba(255,255,255,.7), 0 1px 1px rgba(0,0,0,.3);
  z-index: 1;
  white-space: nowrap;
}
.tt-nameplate:empty { display: none; }

/* ---- platter ---- */
.tt-platter { width: 336px; height: 336px; }
.tt-rim {
  position: absolute; inset: 0; border-radius: 50%;
  background:
    radial-gradient(circle, transparent 0 151px, rgba(0,0,0,.4) 151.5px 152.5px, transparent 153px 165px, rgba(255,255,255,.55) 165.5px 166.2px, rgba(0,0,0,.35) 167px),
    conic-gradient(from 200deg, var(--_metal-mid), var(--_metal-hi) 30deg, var(--_metal) 60deg, var(--_metal-mid) 110deg, var(--_metal-hi) 180deg, #fff 205deg, var(--_metal) 240deg, var(--_metal-mid) 300deg, var(--_metal-mid));
}
.tt-rot { position: absolute; inset: 0; border-radius: 50%; will-change: transform; }
.tt-strobe {
  position: absolute; inset: 0; border-radius: 50%;
  background: repeating-conic-gradient(rgba(20, 18, 16, .55) 0 1.1deg, transparent 1.1deg 4deg);
  -webkit-mask: radial-gradient(circle, transparent 0 157px, #000 157.5px 162px, transparent 162.5px);
  mask: radial-gradient(circle, transparent 0 157px, #000 157.5px 162px, transparent 162.5px);
}
.tt-mat {
  position: absolute; left: 16px; top: 16px; width: 304px; height: 304px; border-radius: 50%;
  background:
    radial-gradient(circle, color-mix(in oklab, var(--_mat), white 8%) 0 22px, transparent 22.5px),
    repeating-radial-gradient(circle, var(--_mat) 0 5px, color-mix(in oklab, var(--_mat), black 18%) 5.5px 7px, var(--_mat) 7.5px 9px);
  box-shadow: 0 0 0 1px rgba(0,0,0,.5);
}
.tt-mat::after {
  content: ""; position: absolute; inset: 0; border-radius: 50%;
  background: conic-gradient(from 210deg, rgba(255,255,255,.06), transparent 40deg, transparent 180deg, rgba(255,255,255,.05) 220deg, transparent 260deg);
}
.tt-mat-sheen {
  position: absolute; left: 16px; top: 16px; width: 304px; height: 304px; border-radius: 50%;
  background: radial-gradient(circle at 34% 30%, rgba(255,255,255,.07), transparent 55%);
}

/* ---- record ---- */
.tt-record-group { position: absolute; left: 0; top: 0; will-change: transform, opacity; }
.tt-record-group[data-empty] { visibility: hidden; }
.tt-record { width: 300px; height: 300px; }
.tt-vinyl { position: absolute; inset: 0; border-radius: 50%; background: #111113; overflow: hidden; }
.tt-vinyl canvas { width: 100%; height: 100%; display: block; }
.tt-sheen {
  position: absolute; inset: 0; border-radius: 50%; pointer-events: none;
  background:
    conic-gradient(from 288deg, transparent 0deg, rgba(255, 252, 245, .16) 16deg, rgba(255,255,255,.26) 23deg, rgba(255, 252, 245, .16) 30deg, transparent 48deg,
      transparent 180deg, rgba(255, 252, 245, .09) 198deg, rgba(255,255,255,.15) 205deg, rgba(255, 252, 245, .09) 212deg, transparent 228deg);
  -webkit-mask: radial-gradient(circle, transparent 0 63px, #000 66px 144px, rgba(0,0,0,.5) 146px 149px, transparent 150px);
  mask: radial-gradient(circle, transparent 0 63px, #000 66px 144px, rgba(0,0,0,.5) 146px 149px, transparent 150px);
  mix-blend-mode: screen;
}
.tt-gloss {
  position: absolute; inset: 0; border-radius: 50%; pointer-events: none;
  background: radial-gradient(circle at 30% 26%, rgba(255,255,255,.1), transparent 46%);
}
.tt-spindle-top { pointer-events: none; }
.tt-spindle-top[hidden] { display: none; }

/* ---- controls ---- */
.tt-knob { border-radius: 50%; }
.tt-knob-face {
  position: absolute; inset: 0; border-radius: 50%;
  background:
    radial-gradient(circle, transparent 0 62%, rgba(0,0,0,.18) 63%, transparent 66%),
    conic-gradient(from 0deg, var(--_metal-hi), var(--_metal) 45deg, #fff 90deg, var(--_metal-mid) 140deg, var(--_metal-hi) 190deg, var(--_metal) 230deg, #fff 270deg, var(--_metal-mid) 320deg, var(--_metal-hi));
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.25), inset 0 0 0 2.5px rgba(255,255,255,.35);
}
.tt-knob-ind { position: absolute; inset: 0; transition: transform .28s cubic-bezier(.3,1.5,.5,1); }
.tt-knob-ind::before {
  content: ""; position: absolute; left: calc(50% - 1.4px); top: 8%; width: 2.8px; height: 30%; border-radius: 2px;
  background: var(--_accent); box-shadow: 0 0 0 .5px rgba(0,0,0,.2);
}
.tt-led {
  width: 9px; height: 9px; border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, #8a3a30, #3b1712);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.4), 0 0 0 1.5px rgba(255,255,255,.4);
  transition: background .3s ease, box-shadow .3s ease;
}
:host([data-power]) .tt-led {
  background: radial-gradient(circle at 40% 35%, #fff1e8, var(--_accent) 55%, color-mix(in oklab, var(--_accent), black 30%));
  box-shadow: 0 0 6px 2px color-mix(in srgb, var(--_accent) 70%, transparent), 0 0 16px 5px color-mix(in srgb, var(--_accent) 30%, transparent), 0 0 0 1.5px rgba(255,255,255,.4);
}
.tt-cue-lever {
  position: absolute; left: -4px; top: -16px; width: 8px; height: 22px; border-radius: 4px;
  background: linear-gradient(90deg, var(--_metal-dark), var(--_metal-hi) 40%, var(--_metal) 70%, var(--_metal-dark));
  box-shadow: 0 0 0 .6px rgba(0,0,0,.35);
  transform-origin: 50% 100%;
  transition: transform .3s cubic-bezier(.3,1.3,.5,1);
}
.tt-cue-lever::after { content: ""; position: absolute; left: -2px; top: -2px; width: 12px; height: 7px; border-radius: 3px; background: #2c2a28; }
:host([data-lifted]) .tt-cue-lever { transform: translateY(14px); }

/* ---- tonearm ---- */
.tt-arm-rot { position: absolute; left: 0; top: 0; width: 0; height: 0; will-change: transform; }
.tt-arm-shadow { filter: blur(var(--_sb, 3px)); opacity: var(--_so, .32); }

/* ---- lid: smoked acrylic ---- */
.tt-lid-face {
  --_lid-a: var(--trinket-turntable-lid-tint, .075);
  border-radius: 4px;
  background: color-mix(in srgb, var(--_lid) calc(var(--_lid-a) * 100%), transparent);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, .55),
    inset 0 0 0 3.5px color-mix(in srgb, var(--_lid) 20%, transparent),
    inset 0 0 0 4.5px rgba(255, 255, 255, .14);
  pointer-events: auto;
  cursor: pointer;
}
.tt-lid-top {
  border-radius: 7px;
  background:
    linear-gradient(104deg, transparent 14%, rgba(255, 252, 244, .2) 17%, rgba(255, 252, 244, .13) 26%, transparent 28.5%,
      transparent 31.5%, rgba(255, 252, 244, .15) 34%, rgba(255, 252, 244, .09) 42%, transparent 44.5%),
    radial-gradient(90% 70% at 10% 0%, rgba(255, 250, 240, .16), transparent 60%),
    linear-gradient(180deg, transparent 70%, color-mix(in srgb, var(--_lid) 8%, transparent)),
    color-mix(in srgb, var(--_lid) calc(var(--_lid-a) * 80%), transparent);
}
.tt-lid-skirt {
  /* seen at a grazing angle: more of the smoke, brighter polished top edge */
  background:
    linear-gradient(180deg, rgba(255, 252, 244, .12), transparent 18%),
    color-mix(in srgb, var(--_lid) calc(var(--_lid-a) * 170%), transparent);
  box-shadow:
    inset 0 1.6px 0 rgba(255, 255, 255, .85),
    inset 0 0 0 1px rgba(255, 255, 255, .45),
    inset 0 0 0 3.5px color-mix(in srgb, var(--_lid) 24%, transparent),
    inset 0 -2px 0 rgba(255, 255, 255, .25);
}
.tt-lid-left { background:
    linear-gradient(90deg, rgba(255, 252, 244, .14), transparent 40%),
    color-mix(in srgb, var(--_lid) calc(var(--_lid-a) * 230%), transparent); }
.tt-lid-hinge {
  position: absolute; bottom: 2px; width: 34px; height: 14px; border-radius: 2px;
  background: linear-gradient(180deg, var(--_metal-hi), var(--_metal) 45%, var(--_metal-dark));
  box-shadow: 0 0 0 .6px rgba(0,0,0,.4);
}
.tt-lid-hinge::after { content: ""; position: absolute; left: 4px; right: 4px; top: 6px; height: 2px; border-radius: 1px; background: rgba(0,0,0,.35); }

/* ---- hit targets ---- */
.tt-hit {
  position: absolute;
  padding: 0; margin: 0; border: 0;
  background: transparent;
  cursor: pointer;
  pointer-events: auto;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.tt-hit:focus-visible { outline: 2.5px solid color-mix(in srgb, var(--_accent) 70%, white); outline-offset: 2px; }
.tt-hit-round { border-radius: 50%; }
.tt-hit-arm { cursor: grab; touch-action: none; border-radius: 16px; }
.tt-hit-arm:active, :host([data-arm="held"]) .tt-hit-arm { cursor: grabbing; }
.tt-hit[disabled] { cursor: default; }

/* ---- file drop ---- */
.tt-drop {
  position: absolute; inset: 6% 4%;
  display: grid; place-items: center;
  border: 2px dashed color-mix(in srgb, var(--_accent) 60%, white);
  border-radius: 22px;
  background: color-mix(in srgb, white 55%, transparent);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
  color: #3c3530;
  font: 600 14px/1.4 ui-rounded, system-ui, sans-serif;
  letter-spacing: .03em;
  opacity: 0;
  pointer-events: none;
  transition: opacity .18s ease;
}
:host([data-dropping]) .tt-drop { opacity: 1; }
.tt-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

@media (prefers-reduced-motion: reduce) {
  .tt-knob-ind, .tt-cue-lever { transition-duration: .01s; }
}
`;
