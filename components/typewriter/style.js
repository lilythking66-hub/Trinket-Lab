export const TYPEWRITER_CSS = `
:host {
  --trinket-typewriter-body: #15120f;
  --trinket-typewriter-trim: #c8a35b;
  --trinket-typewriter-metal: #cfcac1;
  --trinket-typewriter-key: #141210;
  --trinket-typewriter-legend: #f2e8d2;
  --trinket-typewriter-ink: #1f1c1a;
  --trinket-typewriter-ribbon: #b3262e;
  --trinket-typewriter-paper: #f4ecda;
  --trinket-typewriter-shadow: #2c1d10;
  --trinket-typewriter-font: "American Typewriter", "Courier Prime", "Courier New", Courier, "Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", "Hiragino Mincho ProN", "Yu Mincho", "Apple SD Gothic Neo", "Noto Serif", serif;

  --_body: var(--trinket-typewriter-body);
  --_body-hi: color-mix(in oklab, var(--_body), white 22%);
  --_body-side: color-mix(in oklab, var(--_body), black 25%);
  --_body-dark: color-mix(in oklab, var(--_body), black 45%);
  --_body-deep: color-mix(in oklab, var(--_body), black 70%);
  --_trim: var(--trinket-typewriter-trim);
  --_trim-dark: color-mix(in oklab, var(--_trim), black 45%);
  --_metal: var(--trinket-typewriter-metal);
  --_metal-hi: color-mix(in oklab, var(--_metal), white 62%);
  --_metal-mid: color-mix(in oklab, var(--_metal), black 22%);
  --_metal-dark: color-mix(in oklab, var(--_metal), black 52%);
  --_key: var(--trinket-typewriter-key);
  --_legend: var(--trinket-typewriter-legend);
  --_ink: var(--trinket-typewriter-ink);
  --_ink-faded: color-mix(in oklab, var(--_ink) 52%, transparent);
  --_ribbon: var(--trinket-typewriter-ribbon);
  --_paper: var(--trinket-typewriter-paper);
  --_shadow: var(--trinket-typewriter-shadow);
  --_font: var(--trinket-typewriter-font);
  --_k: 1;

  display: block;
  position: relative;
  width: 100%;
  max-width: var(--trinket-typewriter-width, 640px);
  -webkit-tap-highlight-color: transparent;
  contain: layout;
}
:host([hidden]) { display: none; }
:host([theme="green"]) { --trinket-typewriter-body: #1d3b2d; --trinket-typewriter-key: #10120f; }
:host([theme="burgundy"]) { --trinket-typewriter-body: #5b1a20; --trinket-typewriter-key: #160d0c; }
:host([theme="cream"]) {
  --trinket-typewriter-body: #e8dcc2; --trinket-typewriter-trim: #a5803f; --trinket-typewriter-key: #f3ebd9;
  --trinket-typewriter-legend: #2b241d; --trinket-typewriter-shadow: #5b4a33;
}
* { box-sizing: border-box; }

.tw-stage { position: relative; width: 100%; user-select: none; -webkit-user-select: none; touch-action: manipulation; }
.tw-scene { position: absolute; left: 0; top: 0; transform-origin: 0 0; transform: scale(var(--_k)); }
.tw-abs, .tw-plane, .tw-layer { position: absolute; left: 0; top: 0; }
.tw-plane { transform-origin: 0 0; }
.tw-abs { overflow: visible; pointer-events: none; }
.tw-fill { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
.tw-layer { width: 0; height: 0; }

/* ---- body ---- */
.tw-ground { border-radius: 36px; background: var(--_shadow); opacity: .5; filter: blur(20px); }
.tw-ground.tw-contact { opacity: .6; filter: blur(4px); border-radius: 8px; }
.tw-lac { background-color: var(--_body); overflow: hidden; }
.tw-lac::after { content: ""; position: absolute; inset: 0; pointer-events: none; }
.tw-base-top { background-color: var(--_body-dark); }
.tw-base-front::after { background: linear-gradient(180deg, rgba(255,240,215,.16), rgba(0,0,0,.25) 70%, rgba(0,0,0,.5)); }
.tw-base-side::after { background: linear-gradient(180deg, rgba(255,240,215,.08), rgba(0,0,0,.45)); }
.tw-deck::after {
  background:
    linear-gradient(104deg, transparent 30%, rgba(255, 244, 222, .1) 36%, transparent 44%),
    linear-gradient(180deg, rgba(255, 244, 222, .12), rgba(0,0,0,0) 35%, rgba(0,0,0,.18));
}
.tw-hood-top::after { background: linear-gradient(180deg, rgba(0,0,0,.25), rgba(255, 244, 222, .14) 85%, rgba(255, 244, 222, .26)); }
.tw-hood-front::after { background: linear-gradient(180deg, rgba(255, 244, 222, .14), rgba(0,0,0,.1)); }
.tw-wall-out::after {
  background:
    linear-gradient(98deg, transparent 52%, rgba(255, 244, 222, .14) 58%, transparent 66%),
    linear-gradient(180deg, rgba(255, 244, 222, .1), rgba(0,0,0,.28));
}
.tw-wall-in::after { background: rgba(0,0,0,.35); }
.tw-rim::after { background: linear-gradient(90deg, rgba(255, 246, 228, .32), rgba(255, 246, 228, .1)); }
.tw-apron::after { background: linear-gradient(180deg, rgba(255, 244, 222, .22), rgba(0,0,0,.1) 40%, rgba(0,0,0,.3)); }
.tw-pin { position: absolute; inset: 0; pointer-events: none; }

/* ---- carriage ---- */
.tw-carriage { position: absolute; left: 0; top: 0; width: 0; height: 0; will-change: transform; }
.tw-table { background: linear-gradient(180deg, color-mix(in oklab, var(--_body), black 35%), var(--_body-deep)); border-radius: 10px 10px 0 0; box-shadow: inset 0 1.5px 0 rgba(255,240,215,.2); }
.tw-table::after { content: ""; position: absolute; inset: 5px 8px auto; height: 1px; background: var(--_trim); opacity: .55; }
.tw-endplate { background: linear-gradient(180deg, var(--_body-hi), var(--_body) 40%, var(--_body-dark)); border-radius: 9px 9px 3px 3px; }

.tw-sheet {
  position: absolute; left: 0; top: 0;
  transform-origin: 0 0;
  background-color: var(--_paper);
  background-image: var(--_noise);
  background-blend-mode: multiply;
  background-size: 128px 128px;
  box-shadow: 0 0 0 .35px rgba(60, 40, 20, .25);
  overflow: hidden;
  cursor: text;
  will-change: transform, clip-path;
}
.tw-sheet-shade {
  position: absolute; left: 0; right: 0; height: 18px; pointer-events: none;
  background: linear-gradient(180deg, rgba(0,0,0,0), rgba(40, 25, 10, .13) 60%, rgba(40, 25, 10, .28));
}
.tw-sheet-light { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(170deg, rgba(255,255,255,.22), rgba(255,255,255,0) 40%, rgba(60,40,20,.06)); }
.tw-guides { position: absolute; inset: 0; pointer-events: none; }
:host([paper="lined"]) .tw-guides {
  background:
    linear-gradient(90deg, transparent calc(var(--_ml) - 5px), rgba(205, 80, 80, .45) calc(var(--_ml) - 5px), rgba(205, 80, 80, .45) calc(var(--_ml) - 4.4px), transparent calc(var(--_ml) - 4.4px)),
    repeating-linear-gradient(180deg, transparent 0 calc(var(--_lh) - .45px), rgba(80, 120, 175, .38) calc(var(--_lh) - .45px) var(--_lh));
  background-position: 0 0, 0 var(--_lines-y);
}
:host([paper="grid"]) .tw-guides {
  background:
    repeating-linear-gradient(90deg, rgba(90, 140, 130, .28) 0 .4px, transparent .4px var(--_gx)),
    repeating-linear-gradient(180deg, rgba(90, 140, 130, .28) 0 .4px, transparent .4px var(--_lh));
  background-position: var(--_ml) 0, 0 var(--_grid-y);
}
:host([paper="kraft"]) { --trinket-typewriter-paper: #c9a676; }
:host([paper="kraft"]) .tw-sheet { background-size: 96px 96px; }
:host([paper="kraft"]) .tw-guides { background: radial-gradient(120% 90% at 30% 20%, rgba(255,240,210,.18), transparent 60%); }
:host([paper="airmail"]) { --trinket-typewriter-paper: #f7f1e4; }
:host([paper="airmail"]) .tw-guides {
  border: 5px solid transparent;
  background: repeating-linear-gradient(-45deg, #c8383d 0 7px, transparent 7px 11px, #2c4e8e 11px 18px, transparent 18px 22px) border-box;
  -webkit-mask: linear-gradient(#000 0 0) padding-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) padding-box exclude, linear-gradient(#000 0 0);
  opacity: .85;
}

.tw-text { position: absolute; inset: 0; }
.tw-g {
  position: absolute;
  font-family: var(--_font);
  line-height: 1;
  padding: .3em .15em;
  margin: -.3em 0 0;
  white-space: pre;
  color: transparent;
  background: linear-gradient(var(--a, 180deg), var(--_ink) 0 calc(var(--f, .6) * 100%), var(--_ink-faded));
  -webkit-background-clip: text;
  background-clip: text;
  opacity: var(--o, .9);
  transform: translateX(-50%) rotate(var(--r, 0deg));
  pointer-events: none;
}
.tw-g[data-rtl] { direction: rtl; }
.tw-g.tw-fresh { animation: tw-ink .32s ease-out; }
@keyframes tw-ink { from { filter: brightness(.4) contrast(1.6); transform: translateX(-50%) rotate(var(--r, 0deg)) scale(1.06); } }
.tw-g.tw-erased { transition: opacity .28s ease, filter .28s ease; opacity: 0; filter: blur(.6px); }
.tw-ghost {
  position: absolute;
  font-family: var(--_font);
  line-height: 1;
  white-space: pre;
  color: color-mix(in oklab, var(--_ink) 38%, transparent);
  border-bottom: .6px dashed color-mix(in oklab, var(--_ink) 45%, transparent);
  pointer-events: none;
}
.tw-ghost:empty { display: none; }

.tw-scale { background: linear-gradient(180deg, var(--_metal-hi), var(--_metal) 55%, var(--_metal-mid)); border-radius: .8px; box-shadow: 0 .6px 0 rgba(0,0,0,.35); }

/* ---- spools ---- */
.tw-spool-cap { border-radius: 50%; }

/* ---- keys ---- */
.tw-key { position: absolute; left: 0; top: 0; width: 0; height: 0; will-change: transform; }
.tw-cap { border-radius: 50%; background: radial-gradient(circle at 40% 32%, var(--_metal-hi), var(--_metal) 42%, var(--_metal-dark) 78%, var(--_metal-mid)); }
.tw-glass {
  position: absolute; inset: 1.5px; border-radius: 50%;
  background: radial-gradient(circle at 40% 30%, color-mix(in oklab, var(--_key), white 26%), var(--_key) 46%, color-mix(in oklab, var(--_key), black 45%));
  box-shadow: inset 0 0 0 .5px rgba(255,255,255,.2), inset 0 -1.2px 2px rgba(0,0,0,.45);
  display: grid; place-items: center;
  color: var(--_legend);
  font: 700 7px/1 Georgia, "Times New Roman", serif;
  text-align: center;
  white-space: pre;
  overflow: hidden;
}
.tw-glass[data-small] { font-size: 4.2px; letter-spacing: .1px; }
.tw-glass[data-tiny] { font: 700 2.9px/1 ui-rounded, "Avenir Next", system-ui, sans-serif; letter-spacing: .25px; }
.tw-glass::after { content: ""; position: absolute; left: 22%; top: 12%; width: 38%; height: 26%; border-radius: 50%; background: radial-gradient(closest-side, rgba(255,255,255,.55), rgba(255,255,255,0)); }

.tw-hit {
  position: absolute; padding: 0; margin: 0; border: 0; background: transparent; cursor: pointer;
  border-radius: 50%; -webkit-tap-highlight-color: transparent; touch-action: none;
}
.tw-hit:focus-visible { outline: 1.5px solid var(--_trim); outline-offset: 1px; }
.tw-hit-rect { border-radius: 4px; }

.tw-input {
  position: absolute; width: 4px; height: 16px; padding: 0; margin: 0; border: 0;
  opacity: 0; resize: none; overflow: hidden; background: transparent; color: transparent; caret-color: transparent;
  font-size: 16px; line-height: 16px; outline: none; pointer-events: none;
}
.tw-focus-ring { position: absolute; pointer-events: none; opacity: 0; transition: opacity .2s; }
.tw-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: pre; }

@media (prefers-reduced-motion: reduce) {
  .tw-g.tw-fresh { animation: none; }
}
`;
