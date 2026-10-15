export const PRESS_CSS = `
:host {
  --trinket-press-body: #35574a;
  --trinket-press-brass: #c8a466;
  --trinket-press-steel: #c3c6c4;
  --trinket-press-iron: #3a2a1c;
  --trinket-press-wood: #6b3a22;
  --trinket-press-ink: #2c2622;
  --trinket-press-shadow: #2a1c10;

  /* enamel: tints and shades keep the hue (oklch), so greens never turn khaki */
  --_body: var(--trinket-press-body);
  --_body-hi: color-mix(in oklch, var(--_body), #f4f1e8 24%);
  --_body-dark: color-mix(in oklch, var(--_body), black 32%);
  --_body-deep: color-mix(in oklch, var(--_body), black 60%);
  --_body-shade: color-mix(in oklch, var(--_body-deep) 55%, transparent);
  /* polished brass: pale-gold highlights, saturated mids, warm red-brown shadows */
  --_brass: var(--trinket-press-brass);
  --_brass-hi: color-mix(in oklch, var(--_brass), #fbf3e0 52%);
  --_brass-light: color-mix(in oklch, var(--_brass), #f3e2bc 30%);
  --_brass-mid: color-mix(in oklch, var(--_brass), #5a4126 26%);
  --_brass-dark: color-mix(in oklch, var(--_brass), #3a2a18 54%);
  --_brass-deep: color-mix(in oklch, var(--_brass), #241a10 72%);
  --_steel: var(--trinket-press-steel);
  --_steel-hi: color-mix(in oklch, var(--_steel), white 70%);
  --_steel-mid: color-mix(in oklab, var(--_steel), black 25%);
  --_steel-dark: color-mix(in oklab, var(--_steel), black 55%);
  --_iron: var(--trinket-press-iron);
  --_iron-hi: color-mix(in oklch, var(--_iron), #ffe2b0 34%);
  --_iron-deep: color-mix(in oklab, var(--_iron), black 50%);
  --_wood: var(--trinket-press-wood);
  --_wood-hi: color-mix(in oklch, var(--_wood), #ffb27a 30%);
  --_wood-hi2: color-mix(in oklch, var(--_wood), #fff0de 62%);
  --_wood-dark: color-mix(in oklab, var(--_wood), black 38%);
  --_wood-deep: color-mix(in oklab, var(--_wood), black 65%);
  --_shadow: var(--trinket-press-shadow);
  --_k: 1;

  display: block;
  position: relative;
  width: 100%;
  max-width: var(--trinket-press-width, 620px);
  -webkit-tap-highlight-color: transparent;
  contain: layout;
}
:host([hidden]) { display: none; }
:host([theme="cream"]) { --trinket-press-body: #ebe3d2; --trinket-press-brass: #c4a068; --trinket-press-shadow: #4a3624; }
:host([theme="coral"]) { --trinket-press-body: #cf8f86; --trinket-press-brass: #c8a466; --trinket-press-shadow: #4a241c; }
:host([theme="navy"]) { --trinket-press-body: #2d3a52; --trinket-press-brass: #c8a466; --trinket-press-shadow: #121828; }
* { box-sizing: border-box; }

.pr-stage { position: relative; width: 100%; user-select: none; -webkit-user-select: none; touch-action: manipulation; outline: none; }
.pr-stage:focus-visible::after { content: ""; position: absolute; inset: -6px; border-radius: 18px; box-shadow: 0 0 0 2px color-mix(in oklab, var(--_brass), black 10%); pointer-events: none; }
.pr-scene { position: absolute; left: 0; top: 0; transform-origin: 0 0; transform: scale(var(--_k)); }
.pr-abs, .pr-plane { position: absolute; left: 0; top: 0; }
.pr-plane { transform-origin: 0 0; }
.pr-abs { overflow: visible; pointer-events: none; }
.pr-fill { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
.pr-layer { position: absolute; left: 0; top: 0; width: 0; height: 0; }

/* ---- body ---- */
.pr-ground { border-radius: 40px; background: var(--_shadow); opacity: .42; filter: blur(18px); }
.pr-ground.pr-contact { opacity: .55; filter: blur(4px); border-radius: 10px; }
.pr-face { overflow: hidden; background-color: var(--_body); background-image: var(--_cast, none); background-size: 64px 64px; background-blend-mode: multiply; }
.pr-face::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: var(--_shade, transparent); }
.pr-face.pr-plinth { background-color: var(--_body-dark); }
.pr-face.pr-top::before { content: ""; position: absolute; inset: 0; background: radial-gradient(120% 90% at 16% 8%, rgba(255,255,255,.16), transparent 60%), linear-gradient(160deg, transparent 40%, var(--_body-shade)); }
.pr-face.pr-front::before { content: ""; position: absolute; inset: 0; background:
  linear-gradient(100deg, transparent 18%, rgba(255,255,255,.06) 26%, rgba(255,255,255,.02) 31%, transparent 38%),
  linear-gradient(180deg, rgba(255,255,255,.14), transparent 28%, var(--_body-shade)); }
.pr-face.pr-side::before { content: ""; position: absolute; inset: 0; background:
  linear-gradient(98deg, transparent 52%, rgba(255,255,255,.04) 60%, transparent 70%),
  linear-gradient(180deg, rgba(255,255,255,.08), transparent 30%, var(--_body-shade)); }
.pr-face.pr-bevel { background-color: var(--_body-hi); }
.pr-crossbar-front::before { content: ""; position: absolute; inset: 0; background: linear-gradient(100deg, transparent 30%, rgba(255,255,255,.12) 38%, transparent 48%), linear-gradient(180deg, rgba(255,255,255,.18), transparent 40%, var(--_body-shade)); }
.pr-tray { background: linear-gradient(90deg, var(--_brass-dark), var(--_brass) 18%, var(--_brass-light) 40%, var(--_brass-mid) 70%, var(--_brass-dark)); border-radius: 2px; }
.pr-tray::after { content: ""; position: absolute; inset: 0; background: linear-gradient(0deg, rgba(0,0,0,.4), transparent 60%); }

/* ---- pattern roller ---- */
.pr-facet { background-repeat: repeat-y, repeat; background-color: var(--_brass); }
.pr-facet.pr-tiled { background-repeat: repeat, repeat; }
.pr-facet::after { content: ""; position: absolute; inset: 0; background: var(--_shade, transparent); pointer-events: none; }
.pr-facet::before { content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 1;
  background: linear-gradient(90deg, var(--_brass) 0, var(--_brass-light) 2.6%, var(--_brass) 5.2%, var(--_brass-dark) 5.6%, var(--_brass-mid) 6%, transparent 6.6%, transparent 93.4%, var(--_brass-mid) 94%, var(--_brass-dark) 94.4%, var(--_brass) 94.8%, var(--_brass-light) 97.4%, var(--_brass) 100%); }

/* ---- sheets ---- */
.pr-seg { overflow: hidden; pointer-events: none; }
.pr-sheet {
  position: absolute; left: 0; top: 0;
  background-color: var(--_paper, #f2e8d4);
  background-image: var(--_paper-noise);
  background-blend-mode: multiply;
  background-size: 96px 96px;
  will-change: transform;
}
.pr-sheet::after { content: ""; position: absolute; inset: 0; background: var(--_shade, transparent); pointer-events: none; }
.pr-sheet.pr-edge { box-shadow: inset .4px 0 0 rgba(255,255,255,.55), inset -.45px 0 0 rgba(80,55,30,.4), inset 0 -.45px 0 rgba(80,55,30,.32), inset 0 0 0 .2px rgba(70,45,20,.25); }
.pr-drape-shade { pointer-events: none; background: linear-gradient(180deg, rgba(20,12,4,.5), rgba(20,12,4,.22) 45%, rgba(20,12,4,.32)); filter: blur(1.6px); border-radius: 2px; }
.pr-emboss { position: absolute; inset: 0; pointer-events: none; }
.pr-content { position: absolute; left: 0; top: 0; overflow: hidden; width: 100%; height: 100%; }
.pr-content-in { position: absolute; left: 0; top: 0; transform-origin: 0 0; transform: scale(.5); color: var(--trinket-press-ink); }
.pr-blank { position: absolute; left: 0; right: 0; background-color: var(--_paper, #f2e8d4); background-image: var(--_paper-noise); background-blend-mode: multiply; background-size: 96px 96px; }
.pr-blank::after { content: ""; position: absolute; inset: 0; background: var(--_shade, transparent); }
.pr-sheet-shadow { position: absolute; left: -1px; right: -1px; background: var(--_shadow); opacity: .5; filter: blur(3.5px); border-radius: 3px; }
.pr-sheets[data-state="out"] .pr-seg, .pr-sheets[data-state="released"] .pr-seg { pointer-events: auto; cursor: pointer; }
.pr-sheets.pr-taking { transition: opacity .42s ease, transform .5s cubic-bezier(.3, 0, .6, 1); opacity: 0; transform: translate(-30px, 40px); }
.pr-sheets.pr-fading { transition: opacity .25s ease; opacity: 0; }

/* ---- moving parts ---- */
.pr-cast { filter: blur(1.6px); opacity: .55; }
.pr-nip-shade { pointer-events: none; -webkit-mask-image: linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent); mask-image: linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent); }
.pr-rot { position: absolute; inset: 0; transform-origin: 50% 50%; will-change: transform; }
.pr-hit { position: absolute; cursor: grab; touch-action: none; -webkit-touch-callout: none; }
.pr-hit-handle { left: 0; top: 0; width: 44px; height: 44px; border-radius: 50%; }
:host([locked]) .pr-hit { cursor: not-allowed; }
.pr-stage[data-cranking] .pr-hit { cursor: grabbing; }
.pr-stage[data-cranking] { touch-action: none; }

.pr-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: pre-wrap; }

@media (prefers-reduced-motion: reduce) {
  .pr-sheets.pr-taking { transition-duration: .01s; }
}
`;

/** Inline styles for a taken sheet rendered outside the shadow DOM. */
export const FLAT_SHEET_CSS = "position:relative;overflow:hidden;background-blend-mode:multiply;box-shadow:0 1px 0 rgba(255,255,255,.4) inset,0 8px 20px rgba(60,40,20,.18),0 0 0 .5px rgba(60,40,20,.2)";
