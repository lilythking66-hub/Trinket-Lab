# Projector demo

Public build-free demo for the Trinket Projector component.

From the repository root:

~~~sh
python3 -m http.server 8000
# open http://localhost:8000/demos/projector/
node demos/projector/tests/core-smoke.mjs
~~~

What the demo adds on top of the component (all host-side):

- **A demo reel.** Seven photos are painted on a canvas when the page loads (`demo-photos.js`), so there are no image files and no licensing questions. One is portrait, to show the screen adapting. It arrives as a film can on the table: drag it into the projector (or click it) to load it.
- **Desktop first.** The projector is designed for wide screens; on a phone the demo shows it scaled down with a note.
- **Import.** "+ Photos" and "+ MP4 video" (or dropping files on the machine, or clicking a reel) give you a new film can. Photos you load are kept in this browser's IndexedDB and come back already in the projector; "Demo reel" puts the demo can back on the table.
- **The page dims with the room** in Cinema (the component only darkens its own stage; the page listens to `modechange`).
- **A thumbnail row** that jumps to any frame and follows the projector, transport and speed, finish, grain, slide interval, sound, and a button that knocks the focus off so you can turn the lens ring.

The tests cover the projector mechanics (film motion, drag and fling, looping, shared position across modes, slideshow timing, video-driven reels), the film track geometry and file sorting, without a browser.
