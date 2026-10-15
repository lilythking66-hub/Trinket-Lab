// Run with: node demos/typewriter/tests/core-smoke.mjs
import { createTypewriter, graphemes, charWidth, isRTL } from "../../../components/typewriter/typewriter-core.js";
import { QWERTY, compileLayout, keyForChar } from "../../../components/typewriter/keyboard-layout.js";

function assert(name, condition) {
  if (!condition) throw new Error("FAIL: " + name);
  console.log("PASS: " + name);
}
const typeAll = (tw, text) => {
  for (const g of graphemes(text)) {
    if (g === "\n") tw.carriageReturn();
    else if (g === " ") { if (tw.needsReturn(1)) tw.carriageReturn(); else tw.space(); }
    else { if (tw.needsReturn(charWidth(g))) tw.carriageReturn(); tw.strike(g); }
  }
};

/* ---------------- text units ---------------- */
assert("grapheme clusters stay whole", graphemes("é👍🏽क्षि").length === 3);
assert("latin is one column", charWidth("a") === 1 && charWidth("é") === 1);
assert("CJK / kana / hangul are two columns", charWidth("字") === 2 && charWidth("か") === 2 && charWidth("한") === 2 && charWidth("，") === 2);
assert("emoji are two columns", charWidth("✉️") === 2 && charWidth("👍🏽") === 2);
assert("RTL is detected", isRTL("ש") && isRTL("ع") && !isRTL("a"));

/* ---------------- carriage ---------------- */
const events = [];
const tw = createTypewriter({ columns: 10, rows: 3, bellAt: 3, random: () => 0.5 });
tw.subscribe((e) => events.push(e));
tw.strike("H"); tw.strike("i");
assert("each strike escapes one column", tw.column === 2);
tw.strike("字");
assert("a wide strike escapes two columns", tw.column === 4);
tw.space(); tw.space(); tw.space();
assert("the bell rings near the margin", events.includes("bell"));
tw.strike("a"); tw.strike("b"); tw.strike("c");
assert("line is full at the margin", tw.column === 10 && tw.needsReturn(1));
const blocked = tw.strike("x");
assert("striking past the margin is refused", blocked.reason && tw.column === 10);
tw.carriageReturn();
assert("carriage return goes to the next line, column 0", tw.line === 1 && tw.column === 0);
assert("page text keeps wide cells", tw.text() === "Hi字   abc\n");

/* ---------------- backspace ---------------- */
tw.strike("o"); tw.strike("k");
tw.backspace("erase");
assert("correction tape removes the last character", tw.text().endsWith("o") && tw.column === 1);
tw.backspace("erase"); tw.backspace("erase");
assert("erase at column 0 rolls back up a line", tw.line === 0 && tw.column === 10);
tw.backspace("move");
assert("overstrike mode only moves the carriage", tw.column === 9 && tw.text().startsWith("Hi字   abc"));
tw.strike("Z");
assert("overstrike keeps the last strike in text", tw.text().startsWith("Hi字   abZ"));

/* ---------------- page end & sheets ---------------- */
tw.carriageReturn(); tw.carriageReturn();
const full = tw.carriageReturn();
assert("the last row cannot return", tw.line === 2 && events.includes("pagefull") && full.line === 2);
const { page } = tw.eject();
assert("eject hands back the page", page.lines.length === 3 && !tw.hasSheet);
assert("no paper, no ink", tw.strike("q").reason === "no-paper");
tw.insert();
assert("a new sheet starts blank", tw.hasSheet && tw.text() === "" && tw.line === 0 && tw.column === 0);

/* ---------------- tab, lock line end ---------------- */
const t2 = createTypewriter({ columns: 12, rows: 2, lineEnd: "lock" });
t2.tab();
assert("tab jumps to the next stop", t2.column === 5);
typeAll(t2, "abcdefg");
assert("lock mode: still on the first line", t2.line === 0 && t2.column === 12);

/* ---------------- multilingual round trip ---------------- */
const t3 = createTypewriter({ columns: 20, rows: 6 });
typeAll(t3, "Hello, 你好！\nこんにちは ¡Hola! 안녕");
assert("mixed scripts round-trip (wide chars wrap by cell)", t3.text() === "Hello, 你好！\nこんにちは ¡Hola! 안\n녕");

/* ---------------- layout ---------------- */
const L = compileLayout(QWERTY);
assert("every printable key has a legend", L.printable.every((k) => k.legend));
assert("char → cap", keyForChar(L, "Q").key.code === "KeyQ" && keyForChar(L, "Q").shift);
assert("accents fold to their base cap", keyForChar(L, "é").key.code === "KeyE");
const a = keyForChar(L, "字").key.code, b = keyForChar(L, "字").key.code;
assert("other scripts get a stable cap", a === b && L.byCode.has(a));

console.log("\nAll typewriter core checks passed.");
