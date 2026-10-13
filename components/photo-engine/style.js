// Styles injected into each camera element's shadow root.
export const ENGINE_CSS = /* css */ `
:host {
  display: block;
  position: relative;
  width: 100%;
  max-width: var(--trinket-width, 360px);
  margin-inline: auto;
  aspect-ratio: 640 / 760;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
:host([hidden]) { display: none; }

.te-stage {
  position: absolute;
  inset: 0;
  container-type: inline-size;
  transition: opacity .3s ease;
}
.te-stage.loading { opacity: 0; }
.te-body { position: absolute; inset: 0; transform-origin: 50% 56%; }
.te-layer {
  position: absolute;
  display: block;
  max-width: none;
  pointer-events: none;
  -webkit-user-drag: none;
}

/* photo channel: everything above the slot line is hidden while ejecting */
.te-clip {
  position: absolute;
  inset: 0;
  pointer-events: none;
  clip-path: polygon(-80% var(--te-slot), 180% var(--te-slot), 180% 300%, -80% 300%);
}
.te-clip.free { clip-path: none; z-index: 50; }

/* state-driven skin layers */
.te-lamp-on, .te-glow, .te-shutter-pressed { opacity: 0; }
.te-glow { transition: opacity .32s ease-out; }
.pressed .te-shutter-pressed { opacity: 1; }
.pressed .te-shutter-normal { opacity: 0; }
.flash .te-lamp-on, .flash .te-glow { opacity: 1; transition: none; }
.flash .te-lamp-off { opacity: 0; }

.te-shutter-hit {
  position: absolute;
  z-index: 60;
  border: 0; padding: 0; margin: 0;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.te-shutter-hit:focus-visible { outline: 2px solid #d98a74; outline-offset: 2px; }
.te-stage:not([data-state="idle"]):not([data-state="ready"]) .te-shutter-hit { cursor: default; }

/* film card */
.te-card {
  position: absolute;
  container-type: inline-size;
  pointer-events: auto;
  transform-origin: 50% 0;
  touch-action: none;
  outline: none;
}
.te-clip.free .te-card { cursor: grab; }
.te-card.dragging { cursor: grabbing; }
.te-card:focus-visible .te-paper { outline: 2px solid #d98a74; outline-offset: 2px; }
.te-card img { position: absolute; display: block; max-width: none; pointer-events: none; -webkit-user-drag: none; }
.te-paper, .te-gloss { inset: 0; width: 100%; height: 100%; }
.te-win { position: absolute; overflow: hidden; }
.te-win .te-photo { inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; }
.te-win .te-tex { position: absolute; inset: 0; background-size: 50% auto; opacity: 0; }
.te-win::after {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  box-shadow: inset 0 .45cqw .8cqw rgba(0,0,0,.16);
}
.te-cap {
  position: absolute;
  display: flex; align-items: center; justify-content: space-between; gap: 2cqw;
  padding-inline: 1.6cqw .8cqw;
  box-sizing: border-box;
  color: #4a4743;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
}
.te-cap .te-t { font-family: var(--trinket-caption-font, var(--te-caption-font, cursive)); font-size: 7.6cqw; overflow: hidden; text-overflow: ellipsis; }
.te-cap .te-d { font: 3.9cqw/1 ui-monospace, "SF Mono", Menlo, monospace; opacity: .65; flex: none; }
.te-stamp { position: absolute; opacity: .92; }

/* live preview + on-screen messages (Instant Camera) */
.te-preview { position: absolute; overflow: hidden; background: #1c1e21; }
.te-preview > video, .te-preview > img {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block;
}
.te-preview.mirror > video { transform: scaleX(-1); }
.te-screen-off { transition: opacity .25s ease; }
.live .te-screen-off { opacity: 0; }
.te-screen-ui {
  position: absolute;
  z-index: 55;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 1.8cqw;
  padding: 2cqw;
  box-sizing: border-box;
  text-align: center;
  color: rgba(255,255,255,.88);
  font: 500 3.1cqw/1.3 system-ui, -apple-system, "PingFang SC", "Noto Sans SC", sans-serif;
  pointer-events: none;
}
.te-screen-ui:empty { display: none; }
.te-screen-ui .te-row { display: flex; gap: 1.4cqw; flex-wrap: nowrap; justify-content: center; }
.te-screen-ui .te-msg { white-space: nowrap; }
.te-screen-ui button {
  pointer-events: auto;
  font: inherit; font-size: 2.8cqw;
  color: #2b2a28;
  background: rgba(255,255,255,.92);
  border: 0; border-radius: 999px;
  padding: 1cqw 2.6cqw;
  white-space: nowrap;
  flex: none;
  cursor: pointer;
  touch-action: manipulation;
}
.te-screen-ui button.te-ghost { background: rgba(255,255,255,.16); color: #fff; }
.te-screen-ui .te-dim { opacity: .7; font-size: 2.9cqw; }
.te-screen-tap { position: absolute; z-index: 54; border: 0; padding: 0; background: transparent; cursor: pointer; }

/* live lens (optional Instant Photo selfie view) */
.te-lens-live {
  position: absolute;
  border-radius: 50%;
  overflow: hidden;
  opacity: 0;
  transition: opacity .35s ease;
  pointer-events: none;
}
.te-lens-live > canvas, .te-lens-live > video {
  position: absolute; inset: 0; width: 100%; height: 100%; display: block; object-fit: cover;
}
.te-lens-live::after {
  /* glass depth: darker rim + faint blue coating, like looking into a real lens */
  content: ""; position: absolute; inset: 0; border-radius: 50%;
  background:
    radial-gradient(circle at 50% 50%, transparent 52%, rgba(10,14,22,.45) 86%, rgba(6,8,12,.85) 100%),
    radial-gradient(circle at 62% 70%, rgba(70,60,130,.18), transparent 45%);
}
.lens-live .te-lens-live { opacity: 1; }
.te-lens-hit {
  position: absolute; z-index: 58; border: 0; padding: 0; margin: 0;
  border-radius: 50%; background: transparent; cursor: pointer; touch-action: manipulation;
}
.te-lens-hit:focus-visible { outline: 2px solid #d98a74; outline-offset: 2px; }
.lens-starting .te-lens { animation: te-lens-wait 1s ease-in-out infinite; }
@keyframes te-lens-wait { 50% { filter: brightness(1.08); } }

@media (prefers-reduced-motion: reduce) {
  .te-stage, .te-screen-off { transition: none; }
}
`;
