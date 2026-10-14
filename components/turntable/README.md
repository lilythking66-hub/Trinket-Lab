# Turntable

A reusable 2.5D vintage record player: **import local music → tags and cover art are read → a record is pressed → place it on the platter → switch on → lower the needle.**

The deck is the reusable part. The music, the crate, persistence and any product logic stay in the host.

[Open the live demo →](https://lilythking66-hub.github.io/Trinket-Lab/demos/turntable/)

[![Turntable demo](../../docs/demo-images/turntable-demo.jpg)](https://lilythking66-hub.github.io/Trinket-Lab/demos/turntable/)

## Use

~~~html
<script type="module" src="./components/turntable/turntable-element.js"></script>
<trinket-turntable lid="open" label="TRINKET"></trinket-turntable>
~~~

Drop audio files on the deck and it plays them. From JavaScript:

~~~js
import { createRecord } from "./components/turntable/turntable-element.js";

const deck = document.querySelector("trinket-turntable");

// from a file input / drag & drop
const record = await createRecord(file);      // reads title, artist, album, cover
await deck.load(record, { autoplay: true });

// or from a URL you already know about
await deck.load({ src: "/music/song.mp3", title: "Song", artist: "Someone", cover: "/covers/song.jpg" });

deck.addEventListener("play", (e) => console.log("now playing", e.detail.record.title));
~~~

`deck.load(file)` also works directly with a `File`.

## How it behaves

It runs on a small piece of physics, not on a list of animations:

- The **platter** has inertia. It spins up in about a second and coasts down when switched off.
- The **music's playback rate follows the platter** (pitch is not preserved). Switch off mid-song and the music slurs down to a stop; switch on and it winds back up. The 45 rpm knob plays it 1.35× faster.
- The **tonearm** maps its angle to the song position. Drag it anywhere over the grooves and let go: it lowers there and the music seeks to that point. While playing, the arm creeps inward with the song.
- Tap the arm (or the record) to play or pause. Pausing lifts the needle; the platter keeps turning. The **cue lever** lifts and lowers it in place.
- At the end of the side the needle rides the run-out groove (soft clicks), then the arm returns home and the motor switches off (`auto-return="off"` keeps it in the groove).
- The record label is made from the cover art; without a cover, a typographic label is set in a colour taken from the title. The grooves are pressed from the song's loudness, so quiet passages show as darker bands, like on a real LP.
- Sound effects (needle drop, lift, clicks, motor) and surface noise are synthesized. There are no audio assets.

## Local music → record

`record-maker.js` and `metadata.js` work without the deck, so other trinkets (radio, cassette, jukebox…) can reuse them.

| Format | Tags | Cover |
|---|---|---|
| MP3 | ID3v2.2 / 2.3 / 2.4, ID3v1 | APIC / PIC |
| M4A / MP4 / AAC | iTunes `ilst` | `covr` |
| FLAC | Vorbis comments | PICTURE block |
| OGG Vorbis / Opus | Vorbis comments | `METADATA_BLOCK_PICTURE` |
| WAV | `LIST/INFO`, `id3 ` chunk | via ID3 |

Missing tags fall back to the file name (`03 - Artist - Title.mp3`). "Latin-1" tags that are really UTF-8, GBK, Big5 or Shift-JIS (common in older Chinese and Japanese MP3s) are recovered. Everything runs locally: files are never uploaded.

~~~js
import { readAudioMetadata, createRecords, renderSleeve, renderRecord } from "./components/turntable/turntable-element.js";

const tags = await readAudioMetadata(file);          // { title, artist, album, year, track, genre, picture: Blob|null, format }
const records = await createRecords(input.files);    // skips non-audio files
const sleeve = renderSleeve(record, { size: 240, image });   // <canvas> album sleeve
~~~

### Record shape

| Field | Meaning |
|---|---|
| `src` | audio URL (object URLs are created for files) |
| `title`, `artist`, `album`, `year`, `track`, `genre` | text |
| `cover` | image URL; `coverBlob` holds embedded art |
| `file` | the original `File`, if any (useful for persistence) |
| `palette` | `{ base, ink }` label colours (derived from the cover) |
| `vinyl` | vinyl colour, default black (try `"#b3262e"`) |
| `duration`, `envelope` | filled in when known |
| anything else | passed through untouched |

Ownership: when you pass a `File` (or a plain `{ src, … }` object without an `id`) to `load()`, the deck creates the record itself and frees its object URLs when the record is swapped out, unloaded or the deck is destroyed. Record objects with an `id` — including records you created with `createRecord()` — stay yours: call `releaseRecord(record)` when you throw one away.

### Lifecycle

Removing the element closes its `AudioContext`; moving it in the DOM does not. Re-adding a removed deck reopens the audio for the record still on the platter. `destroy()` frees everything, including records the deck owns, and the element stays usable afterwards.

## Public API

### Attributes

| Attribute | Meaning |
|---|---|
| `theme` | `espresso` · `cream` · `mint`; omit for walnut |
| `lid` | `open` · `closed`; omit for no dust cover. Tap the lid to open/close it |
| `label` | name plate text (default `TRINKET`) |
| `speed` | `33` (default) or `45` |
| `crackle` | surface noise 0–1 (default 0.35) |
| `tone` | `warm` (default, gentle vintage EQ) or `clean` |
| `volume` | 0–1 |
| `muted` | silence everything |
| `sfx="off"` | no mechanical sounds |
| `auto-return="off"` | stay in the run-out groove at the end |
| `autoplay` | `load()` starts playing |
| `drop="off"` | don't accept dropped files |
| `grooves="plain"` | skip the loudness analysis (saves decoding large files) |
| `state` | reflected: `empty · loaded · spinning · cueing · playing · paused · ended` |

### Properties & methods

`record`, `state`, `playing`, `power`, `speed`, `volume`, `currentTime`, `duration`, `progress`, `lid`, `labels`, `audioElement`

`whenReady()`, `load(recordOrFile, { autoplay })`, `unload()`, `play()`, `pause()`, `stop()`, `toggle()`, `seek(value, { unit: "progress" | "seconds", instant })`, `importFiles(files)`, `destroy()`

`seek()` lifts the arm, swings it and drops it like a person would; pass `{ instant: true }` to jump.

### Events

`ready`, `statechange`, `load`, `unload`, `power`, `speed`, `cue`, `needledown`, `play`, `pause`, `ended`, `rest`, `timeupdate`, `durationchange`, `lid`, `import` (files dropped on the deck; cancelable, `detail.records`), `blocked` (`reason: empty | autoplay | cue | not-audio`), `error`.

### Styling hooks

CSS custom properties: `--trinket-turntable-body`, `--trinket-turntable-grain` (0 = painted finish), `--trinket-turntable-metal`, `--trinket-turntable-mat`, `--trinket-turntable-accent`, `--trinket-turntable-shadow`, `--trinket-turntable-print`, `--trinket-turntable-lid` (acrylic smoke colour), `--trinket-turntable-lid-tint` (0–1, default .075), `--trinket-turntable-base` (the recessed foot), `--trinket-turntable-width`. Highlights and shading derive from these with `color-mix()`.

Parts: `stage`, `nameplate`, `drop`.

### Localization

~~~js
deck.labels = {
  arm: "Tonearm",
  record: "Record — tap to play or pause",
  power: "Power",
  speed: "Speed 33 / 45",
  cue: "Cue lever",
  lid: "Dust cover",
  drop: "Drop music here to press a record",
};
~~~

## Structure

~~~text
turntable-core.js     platter inertia, tonearm, cueing, arm angle ↔ song position (no DOM)
metadata.js           tag + cover reader for MP3 / M4A / FLAC / OGG / WAV (no DOM)
record-maker.js       file or URL → record object; duration; loudness envelope
record-art.js         canvas vinyl + label, album sleeves, palette from cover art
deck-art.js           orthographic camera, procedural skin, cylinders, tonearm
audio-engine.js       <audio> + Web Audio: rate follows platter, crackle, mechanics
style.js              shadow-DOM styles + finishes
turntable-element.js  <trinket-turntable>: wiring, input, choreography
~~~

The deck is drawn with an orthographic camera computed in JavaScript: every flat face is a 2D affine CSS matrix and every cylinder an SVG side plus top. There is no CSS 3D, so layering is plain DOM order, hit-testing is exact and Safari behaves. A raster skin could replace `deck-art.js` later as long as it keeps the `DECK` geometry (platter, pivot, arm length, rest angle) from `turntable-core.js`.

## Notes

- Works with mouse, touch and keyboard. On the focused tonearm: Enter plays/pauses, ←/→ skip (Shift for bigger steps), Home goes to the start, Escape stops.
- Browsers only allow sound after a user gesture; `blocked` with `reason: "autoplay"` tells you when to ask for a tap.
- Audio from another origin needs CORS to get the warm tone and loudness grooves; without it, it still plays.
- Honours `prefers-reduced-motion`. The animation loop sleeps when the deck is still.
