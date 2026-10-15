# Crank Press demo

Public build-free demo for the Trinket Crank Press component.

From the repository root:

~~~sh
python3 -m http.server 8000
# open http://localhost:8000/demos/crank-press/
node demos/crank-press/tests/core-smoke.mjs
# and open http://localhost:8000/demos/crank-press/tests/lifecycle.html
~~~

What the demo adds on top of the component (all host-side):

- **Scenes** showing the same machine reused: an embossed slip, a numbered vintage ticket (one crank turn = one ticket, ink border), a fortune note (plain roller, host text) and a monogram card.
- A roller picker built from `patternPreview()`, paper and finish choices.
- **Taken sheets:** `take()` hands back a standalone node, which the demo pins in a little tray before loading a fresh sheet.

The tests cover the ratchet and pawl, the flywheel, the motor target, the sheet lifecycle (load → grip → feed → release → out → take), the paper path, the camera inverse used for dragging the crank, and the pattern set.
