export const GACHA_CSS = `
:host {
  --trinket-gacha-accent: #d6473c;
  --trinket-gacha-body: #f2e9d8;
  --trinket-gacha-metal: #c5c8cc;
  --trinket-gacha-glass: #dcebf3;
  --trinket-gacha-shadow: #4a3a2c;
  --trinket-gacha-card: #fffdf8;
  --trinket-gacha-ink: #3a332e;

  --_accent: var(--trinket-gacha-accent);
  --_accent-hi: color-mix(in oklab, var(--_accent), white 30%);
  --_accent-dark: color-mix(in oklab, var(--_accent), black 20%);
  --_accent-deep: color-mix(in oklab, var(--_accent), black 42%);
  --_body: var(--trinket-gacha-body);
  --_body-hi: color-mix(in oklab, var(--_body), white 55%);
  --_body-shade: color-mix(in oklab, var(--_body), #6b5340 12%);
  --_body-deep: color-mix(in oklab, var(--_body), #4a3626 28%);
  --_metal: var(--trinket-gacha-metal);
  --_metal-hi: color-mix(in oklab, var(--_metal), white 70%);
  --_metal-dark: color-mix(in oklab, var(--_metal), black 40%);
  --_glass: var(--trinket-gacha-glass);
  --_glass-edge: color-mix(in oklab, var(--_glass), #2f4656 50%);
  --_shadow: var(--trinket-gacha-shadow);

  display: block;
  position: relative;
  width: 100%;
  max-width: var(--trinket-gacha-width, 340px);
  color: var(--trinket-gacha-ink);
  -webkit-tap-highlight-color: transparent;
}
:host([hidden]) { display: none; }
:host([theme="butter"]) { --trinket-gacha-accent: #e6b545; --trinket-gacha-body: #f7f0e0; }
:host([theme="mint"])   { --trinket-gacha-accent: #4caa8b; --trinket-gacha-body: #eff1e6; }
:host([theme="navy"])   { --trinket-gacha-accent: #2d4f87; --trinket-gacha-body: #f0ebe0; }
* { box-sizing: border-box; }

.tg-stage {
  position: relative;
  width: 100%;
  aspect-ratio: 400 / 700;
  user-select: none;
  -webkit-user-select: none;
}
.tg-machine { position: absolute; inset: 0; transform-origin: 50% 96%; }
.tg-layer, .tg-globe {
  position: absolute;
  pointer-events: none;
}
.tg-layer { inset: 0; width: 100%; height: 100%; overflow: visible; }

.tg-knob, .tg-coin, .tg-tray-clip, .tg-flap, .tg-hit, .tg-light { position: absolute; }
.tg-knob { pointer-events: none; filter: drop-shadow(0 2px 2px rgba(40, 28, 20, .28)); }
.tg-knob-rotor, .tg-knob-gloss { position: absolute; inset: 0; }
.tg-knob-rotor { will-change: transform; }
.tg-knob svg, .tg-coin svg, .tg-flap svg { display: block; width: 100%; height: 100%; }

.tg-light {
  border-radius: 50%;
  background: #4b3b33;
  box-shadow: inset 0 1px 1px rgba(0,0,0,.5);
  transition: background .25s ease, box-shadow .25s ease;
  pointer-events: none;
}
:host([credits]) .tg-light, .tg-light.on {
  background: #ffcf6b;
  box-shadow: 0 0 6px 2px rgba(255, 196, 90, .75), inset 0 -1px 1px rgba(150,90,0,.4);
}

.tg-coin { pointer-events: none; opacity: 0; }

.tg-tray-clip { overflow: hidden; pointer-events: none; border-radius: 4px; }
.tg-tray-capsule {
  position: absolute;
  left: 0; top: 0;
  opacity: 0;
  filter: drop-shadow(0 3px 3px rgba(0,0,0,.35));
}
.tg-tray-capsule.show { opacity: 1; }
.tg-capsule-svg { display: block; width: 100%; height: 100%; overflow: visible; }

.tg-flap {
  pointer-events: none;
  transform-origin: 50% 0;
  transition: transform .45s cubic-bezier(.3, 1.4, .5, 1);
  transform: perspective(380px) rotateX(0deg);
}
.tg-flap.open { transform: perspective(380px) rotateX(-62deg); transition-duration: .32s; transition-timing-function: cubic-bezier(.2,.8,.3,1); }

.tg-hit {
  padding: 0;
  margin: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
  border-radius: 50%;
}
.tg-hit:focus-visible { outline: 3px solid color-mix(in srgb, var(--_accent) 60%, white); outline-offset: 3px; }
.tg-hit-knob { cursor: grab; }
.tg-hit-knob:active { cursor: grabbing; }
.tg-hit-tray { border-radius: 10px; touch-action: manipulation; }
.tg-hit-coin { border-radius: 10px; touch-action: manipulation; }
.tg-hit[disabled] { cursor: default; }
.tg-hit[data-cue]::after {
  content: "";
  position: absolute;
  inset: -4%;
  border-radius: inherit;
  border: 1.5px solid color-mix(in srgb, var(--_accent) 40%, white);
  opacity: 0;
  animation: tg-cue 1.8s ease-out infinite;
  pointer-events: none;
}
@keyframes tg-cue {
  0% { opacity: 0; transform: scale(.92); }
  25% { opacity: .6; }
  100% { opacity: 0; transform: scale(1.12); }
}

/* ---- presentation overlay ---- */
.tg-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--trinket-gacha-overlay-z, 1000);
  display: grid;
  place-items: center;
  visibility: hidden;
  pointer-events: none;
}
:host([reveal="inline"]) .tg-overlay { position: absolute; }
.tg-overlay.open { visibility: visible; pointer-events: auto; }
.tg-backdrop {
  position: absolute;
  inset: 0;
  background: var(--trinket-gacha-backdrop, rgba(42, 32, 24, .42));
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  opacity: 0;
  transition: opacity .35s ease;
}
:host([reveal="inline"]) .tg-backdrop { border-radius: 18px; }
.tg-overlay.open .tg-backdrop { opacity: 1; }
.tg-present {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 18px;
  width: min(92vw, 420px);
  padding: 24px 16px;
}
:host([reveal="inline"]) .tg-present { width: 100%; }
.tg-open-wrap {
  --size: var(--trinket-gacha-open-size, min(58vw, 46vh, 250px));
  position: relative;
  width: var(--size);
  height: var(--size);
}
:host([reveal="inline"]) .tg-open-wrap { --size: min(64%, 220px); }
.tg-open-capsule {
  position: absolute;
  inset: 0;
  padding: 0;
  border: 0;
  background: none;
  cursor: grab;
  touch-action: none;
  filter: drop-shadow(0 18px 22px rgba(30, 18, 10, .35));
  -webkit-tap-highlight-color: transparent;
}
.tg-open-capsule:focus-visible { outline: 3px solid rgba(255,255,255,.8); outline-offset: 6px; border-radius: 50%; }
.tg-open-capsule .tg-cap-top, .tg-open-capsule .tg-cap-bottom, .tg-open-capsule .tg-cap-rim { transform-box: view-box; transform-origin: 0 0; }
.tg-card-wrap {
  position: absolute;
  left: 50%;
  top: 50%;
  width: max-content;
  max-width: min(84vw, 340px);
  transform: translate(-50%, -50%);
  pointer-events: none;
  opacity: 0;
}
:host([reveal="inline"]) .tg-card-wrap { max-width: 88%; }
.tg-card-wrap.show { pointer-events: auto; }
.tg-card {
  display: block;
  min-width: 180px;
  padding: 18px;
  border-radius: 14px;
  background: var(--trinket-gacha-card);
  color: var(--trinket-gacha-ink);
  box-shadow: 0 22px 46px rgba(30, 18, 10, .28), 0 2px 6px rgba(30,18,10,.12);
}
:host([prize-frame="none"]) .tg-card { padding: 0; min-width: 0; background: none; box-shadow: none; border-radius: 0; }
::slotted([slot="prize"]) { display: block; }
.tg-default-prize { display: grid; justify-items: center; gap: 8px; text-align: center; font: 15px/1.5 ui-rounded, system-ui, sans-serif; }
.tg-default-prize .tg-dp-thumb { font-size: 64px; line-height: 1.1; }
.tg-default-prize img { max-width: 220px; max-height: 220px; border-radius: 8px; }
.tg-default-prize strong { font-size: 18px; }
.tg-default-prize p { margin: 0; color: color-mix(in srgb, currentColor 65%, transparent); }

.tg-caption {
  min-height: 1.5em;
  margin: 0;
  color: rgba(255, 252, 245, .92);
  font: 500 13px/1.5 ui-rounded, system-ui, sans-serif;
  letter-spacing: .04em;
  text-align: center;
  text-shadow: 0 1px 2px rgba(0,0,0,.25);
  transition: opacity .3s ease;
}
.tg-actions { display: flex; gap: 10px; justify-content: center; opacity: 0; transition: opacity .3s ease; pointer-events: none; }
.tg-actions.show { opacity: 1; pointer-events: auto; }
.tg-keep {
  min-width: 132px;
  padding: 11px 22px;
  border: 0;
  border-radius: 999px;
  background: var(--trinket-gacha-card);
  color: var(--trinket-gacha-ink);
  font: 600 14px/1 ui-rounded, system-ui, sans-serif;
  letter-spacing: .04em;
  box-shadow: 0 6px 16px rgba(0,0,0,.18);
  cursor: pointer;
}
.tg-keep:focus-visible { outline: 3px solid color-mix(in srgb, var(--_accent) 60%, white); outline-offset: 3px; }
.tg-sparks { position: absolute; left: 50%; top: 50%; width: 0; height: 0; pointer-events: none; }
.tg-spark {
  position: absolute;
  left: -4px; top: -4px;
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #fff6d8;
  box-shadow: 0 0 8px 2px rgba(255, 228, 160, .8);
  opacity: 0;
}
.tg-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
`;
