# Printer

A reusable paper-feed trinket extracted from the approved printer-motion-lab foundation.

The important illusion is simple: **a complete rigid sheet already exists inside the machine and is transported by rollers.** The printer never grows a rectangle downward to fake printing.

[Live demo →](https://lilythking66-hub.github.io/Trinket-Lab/demos/printer/)

## What moved into Trinket Lab

- platform-neutral feed geometry and state machine;
- a build-free Web Component renderer: **trinket-printer**;
- the approved porcelain front skin;
- a restrained premium-feed motion profile;
- arbitrary slotted paper content;
- reduced-motion support.

The original printer-motion-lab remains the experimentation repository. Its WeChat adapter, reference media, construction history and post-print presentation experiments are intentionally not copied here.

## Use

~~~html
<script type="module" src="./components/printer/printer-element.js"></script>

<trinket-printer paper-width="586" paper-height="733">
  <article slot="paper" class="my-paper">
    Anything can live here.
  </article>
</trinket-printer>
~~~

~~~js
const printer = document.querySelector("trinket-printer");

await printer.whenReady();
await printer.print();

printer.addEventListener("printcomplete", (event) => {
  console.log("finished", event.detail.frame);
});
~~~

## Public API

### Attributes

| Attribute | Meaning |
|---|---|
| skin | URL to a printer skin manifest; defaults to porcelain-printer-v1 and is read on first connection |
| paper-width | paper width in skin design units |
| paper-height | paper height in skin design units |
| speed | peak feed speed in design units / second |
| state | reflected state: idle · feeding · settling · finished |
| progress | reflected 0…1 feed progress |

Paper width must fit the skin slot. Paper height can vary freely as long as it extends beyond the configured grip depth.

### Methods

- whenReady()
- print() — true when a feed starts, false if already active
- reset()
- cancel()
- setPaperSize(width, height)
- seek(fraction) — inspection helper; does not emit completion

### Events

ready, statechange, printstart, frame, printcomplete, printcancel, reset, error.

## Motion model

~~~text
idle
  ↓
feeding
  ↓
settling
  ↓
finished
~~~

The sheet keeps its full dimensions from the first frame. Primary motion is translation only. It finishes with gripDepth still held inside the slot.

The layer model is:

~~~text
printer back
    ↓
full paper sheet
    ↓
slot contact shadow
    ↓
printer front
~~~

This is what prevents the classic “paper tongue growing out of the machine” look.

## Skin contract

The V1 manifest provides canvas dimensions, slot geometry, suggested paper geometry, the physical print-button hit area, a default motion profile, and back/front/slot-shadow assets.

Skin owns appearance and geometry. Core owns state, timing and paper position. Host code owns what is printed.

## Source

This trinket is derived from the user's existing printer-motion-lab project. No external reference media or third-party code was copied into this folder.
