# Turntable demo

Public build-free demo for the Trinket Turntable component.

From the repository root:

~~~sh
python3 -m http.server 8000
# open http://localhost:8000/demos/turntable/
node demos/turntable/tests/core-smoke.mjs
~~~

What the demo adds on top of the component (all host-side):

- **A crate.** Three demo songs are synthesized in the browser on load (`demo-tracks.js`, so no audio files and no licensing questions). Two have generated cover art and one has none, which shows the typographic label.
- **Import.** "Import music" or dropping files on the deck presses new records. Imported files are kept in this browser's IndexedDB so the crate survives a reload.
- **Drag a sleeve onto the deck** with a mouse; on touch, tap a sleeve.
- **Now playing**, a seek bar that moves the tonearm, finish / lid / speed / noise controls.

The tests cover the deck mechanics and the tag readers (ID3v2.3/2.4, UTF-16, GBK legacy tags, FLAC, MP4, file-name fallback) using synthetic bytes, so no binary fixtures live in the repo.
