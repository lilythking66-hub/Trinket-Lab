# Printer demo

Public build-free demo for the Trinket Printer component.

From the repository root:

~~~sh
python3 -m http.server 8000
# open http://localhost:8000/demos/printer/
~~~

The demo deliberately feeds three different paper shapes through the same machine:

- postcard — 586 × 733;
- note — 586 × 820;
- receipt — 470 × 1180.

If all three read as one physical printer moving rigid sheets through the same rollers, the reusable feed model is doing its job.

The paper content is host HTML. None of the sample copy or artwork lives inside the printer component.
