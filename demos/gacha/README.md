# Gacha demo

Public build-free demo for the Trinket Gacha component.

From the repository root:

~~~sh
python3 -m http.server 8000
# open http://localhost:8000/demos/gacha/
node demos/gacha/tests/core-smoke.mjs
~~~

The demo runs three different prize sets through the same machine:

- **Tiny objects** — declared in HTML with `<template data-prize>`, weighted, emoji visible through the capsules;
- **Fortune notes** — built in JS, paper slips as DOM nodes;
- **Limited run** — one of each, data-only prizes with the default card, sells out and refills.

All prize content and its styling live in this demo, not in the component.
