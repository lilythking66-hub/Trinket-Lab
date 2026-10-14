export const PRINTER_CSS = `
:host {
  display: block;
  width: 100%;
  max-width: var(--trinket-printer-width, 560px);
  contain: layout style;
}
:host([hidden]) { display: none; }
* { box-sizing: border-box; }
.tp-stage {
  position: relative;
  width: 100%;
  isolation: isolate;
  overflow: visible;
  user-select: none;
  -webkit-user-select: none;
}
.tp-machine {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  pointer-events: none;
  -webkit-user-drag: none;
}
.tp-back { z-index: 0; filter: drop-shadow(0 12px 18px rgba(70, 60, 45, .12)); }
.tp-paper-viewport {
  position: absolute;
  left: 0;
  width: 100%;
  overflow: hidden;
  z-index: 1;
  pointer-events: none;
}
.tp-paper {
  position: absolute;
  top: 0;
  background: var(--trinket-paper-color, #fffdf8);
  transform-origin: 50% 0;
  will-change: transform;
  overflow: hidden;
  pointer-events: auto;
}
::slotted([slot="paper"]) {
  display: block;
  width: 100%;
  height: 100%;
  margin: 0;
}
.tp-shadow-crop {
  position: absolute;
  overflow: hidden;
  z-index: 2;
  pointer-events: none;
}
.tp-slot-shadow {
  position: absolute;
  max-width: none;
  pointer-events: none;
}
.tp-front { z-index: 3; }
.tp-button {
  position: absolute;
  z-index: 4;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.tp-button:focus-visible {
  outline: 3px solid color-mix(in srgb, currentColor 45%, transparent);
  outline-offset: 3px;
}
.tp-button:disabled { cursor: default; }
:host([state="feeding"]) .tp-button,
:host([state="settling"]) .tp-button { pointer-events: none; }
@media (prefers-reduced-motion: reduce) {
  .tp-paper { will-change: auto; }
}
`;
