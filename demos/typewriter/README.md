# Typewriter demo

Public build-free demo for the Trinket Typewriter component.

From the repository root:

~~~sh
python3 -m http.server 8000
# open http://localhost:8000/demos/typewriter/
node demos/typewriter/tests/core-smoke.mjs
~~~

What the demo adds on top of the component (all host-side):

- **Samples** in English, Chinese, Japanese and mixed scripts, typed with `type()`.
- **Take the page**: `eject()` hands back the text; the demo pins it as a little paper card you can copy, then feeds a new sheet.
- Finish, paper, ribbon colour, margin behaviour (auto return / carriage lock) and backspace mode (correction tape / overstrike).

The tests cover the carriage, bell, margin, backspace modes, page end, sheets, wide cells, grapheme clusters and the cap layout lookups.
