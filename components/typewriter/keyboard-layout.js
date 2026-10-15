// Keyboard layouts for the typewriter. A layout only describes the key caps:
// which physical key (KeyboardEvent.code) sits where, what is printed on the
// cap, and what it types when clicked. What the *user's* keyboard types is
// decided by their OS layout / IME, so any language works with any layout;
// the cap that moves is always the one at the same physical position.

/** A printable key. legend defaults to the upper-case letter, or "shift / char". */
export const k = (code, char, shift = char.toUpperCase(), legend = null) => ({ code, kind: "char", char, shift, legend });
/** A function key: shift, lock, tab, back. */
export const fn = (code, kind, legend) => ({ code, kind, legend });

export const QWERTY = {
  name: "qwerty",
  /** Row x offsets in key pitches (back row first) – the classic stagger. */
  offsets: [0, 0.3, 0.55, 0.05],
  rows: [
    [k("Digit1", "1", "!"), k("Digit2", "2", "@"), k("Digit3", "3", "#"), k("Digit4", "4", "$"), k("Digit5", "5", "%"),
     k("Digit6", "6", "^"), k("Digit7", "7", "&"), k("Digit8", "8", "*"), k("Digit9", "9", "("), k("Digit0", "0", ")"),
     k("Minus", "-", "_"), k("Equal", "=", "+"), fn("Backspace", "back", "←")],
    [fn("Tab", "tab", "TAB"), k("KeyQ", "q"), k("KeyW", "w"), k("KeyE", "e"), k("KeyR", "r"), k("KeyT", "t"),
     k("KeyY", "y"), k("KeyU", "u"), k("KeyI", "i"), k("KeyO", "o"), k("KeyP", "p"), k("BracketLeft", "[", "{"), k("BracketRight", "]", "}")],
    [fn("CapsLock", "lock", "LOCK"), k("KeyA", "a"), k("KeyS", "s"), k("KeyD", "d"), k("KeyF", "f"), k("KeyG", "g"),
     k("KeyH", "h"), k("KeyJ", "j"), k("KeyK", "k"), k("KeyL", "l"), k("Semicolon", ";", ":"), k("Quote", "'", "\"")],
    [fn("ShiftLeft", "shift", "SHIFT"), k("KeyZ", "z"), k("KeyX", "x"), k("KeyC", "c"), k("KeyV", "v"), k("KeyB", "b"),
     k("KeyN", "n"), k("KeyM", "m"), k("Comma", ",", "<"), k("Period", ".", ">"), k("Slash", "/", "?"), fn("ShiftRight", "shift", "SHIFT")],
  ],
};

/** Keys that exist on every layout but have no cap of their own. */
export const ALIASES = {
  Enter: "return",
  NumpadEnter: "return",
  Space: "space",
  Backquote: "Digit1",
  Backslash: "BracketRight",
  IntlBackslash: "ShiftLeft",
  IntlRo: "Slash",
  IntlYen: "Equal",
};

/**
 * Normalise a layout: every key gets its legend, and lookup tables are built
 * (code → key, char → key) so programmatic typing can find the cap to press.
 */
export function compileLayout(layout = QWERTY) {
  const rows = layout.rows.map((row) => row.map((key) => {
    const kk = { ...key };
    if (kk.kind === "char") {
      kk.shift ??= kk.char.toUpperCase();
      if (!kk.legend) kk.legend = /\p{L}/u.test(kk.char) && kk.shift !== kk.char ? kk.shift : kk.shift !== kk.char ? `${kk.shift}\n${kk.char}` : kk.char;
    }
    kk.legend ??= kk.code;
    return kk;
  }));
  const byCode = new Map();
  const byChar = new Map();
  for (const row of rows) for (const key of row) {
    byCode.set(key.code, key);
    if (key.kind === "char") {
      if (!byChar.has(key.char)) byChar.set(key.char, { key, shift: false });
      if (!byChar.has(key.shift)) byChar.set(key.shift, { key, shift: true });
    }
  }
  const printable = rows.flat().filter((key) => key.kind === "char");
  return { name: layout.name || "custom", offsets: layout.offsets || rows.map(() => 0), rows, byCode, byChar, printable };
}

/** Pick the cap a character would be typed on (falls back to a stable "random" cap). */
export function keyForChar(compiled, ch) {
  if (!ch) return null;
  const hit = compiled.byChar.get(ch) || compiled.byChar.get(ch.toLowerCase());
  if (hit) return hit;
  // accents fold to their base letter (é → e), everything else (CJK, emoji…)
  // gets a deterministic cap so the same character always moves the same key
  const base = ch.normalize("NFD").replace(/\p{M}/gu, "");
  const viaBase = base && base !== ch ? compiled.byChar.get(base.toLowerCase()) : null;
  if (viaBase) return { key: viaBase.key, shift: base !== base.toLowerCase() };
  let h = 2166136261;
  for (const c of ch) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  const list = compiled.printable;
  return { key: list[(h >>> 0) % list.length], shift: false };
}
