// Typewriter mechanics without the DOM: a sheet of paper on a grid of
// columns × rows, the carriage position (column) and the platen position
// (line), and what each key does to them. Rendering, timing and sound live
// in the element; this file is deterministic and testable in Node.
//
// Text is handled as grapheme clusters (é, 👍🏽, क्षि stay one strike) and
// East-Asian wide characters take two columns, like on a CJK terminal.

export const PAGE_DEFAULTS = {
  columns: 30,
  rows: 12,
  tabSize: 5,
  /** The bell rings this many columns before the right margin. */
  bellAt: 5,
  /** "wrap" = automatic carriage return at the margin; "lock" = carriage locks like a real machine. */
  lineEnd: "wrap",
  /** "erase" = correction tape (removes the last character); "move" = carriage steps back, next strike overprints. */
  backspace: "erase",
};

/* ------------------------------------------------------------- graphemes */

const segmenter = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

/** Split text into user-perceived characters. */
export function graphemes(text) {
  const s = String(text ?? "");
  if (segmenter) return Array.from(segmenter.segment(s), (x) => x.segment);
  // fallback: code points, with combining marks glued to their base
  const out = [];
  for (const c of s) {
    if (out.length && /\p{M}|‍|️/u.test(c)) out[out.length - 1] += c;
    else out.push(c);
  }
  return out;
}

const WIDE = [
  [0x1100, 0x115f], [0x231a, 0x231b], [0x2329, 0x232a], [0x23e9, 0x23ec], [0x23f0, 0x23f0], [0x23f3, 0x23f3],
  [0x25fd, 0x25fe], [0x2614, 0x2615], [0x2648, 0x2653], [0x267f, 0x267f], [0x2693, 0x2693], [0x26a1, 0x26a1],
  [0x26aa, 0x26ab], [0x26bd, 0x26be], [0x26c4, 0x26c5], [0x26ce, 0x26ce], [0x26d4, 0x26d4], [0x26ea, 0x26ea],
  [0x26f2, 0x26f5], [0x26fa, 0x26fd], [0x2705, 0x2705], [0x270a, 0x270b], [0x2728, 0x2728], [0x274c, 0x274c],
  [0x2753, 0x2755], [0x2757, 0x2757], [0x2795, 0x2797], [0x27b0, 0x27b0], [0x27bf, 0x27bf], [0x2b1b, 0x2b1c],
  [0x2b50, 0x2b50], [0x2b55, 0x2b55], [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff],
  [0xa000, 0xa4cf], [0xa960, 0xa97f], [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe10, 0xfe19], [0xfe30, 0xfe6f],
  [0xff00, 0xff60], [0xffe0, 0xffe6], [0x16fe0, 0x16fe4], [0x17000, 0x18cff], [0x1b000, 0x1b2ff],
  [0x1f004, 0x1f004], [0x1f0cf, 0x1f0cf], [0x1f18e, 0x1f18e], [0x1f191, 0x1f19a], [0x1f200, 0x1f251],
  [0x1f300, 0x1f64f], [0x1f680, 0x1f6ff], [0x1f7e0, 0x1f7eb], [0x1f90c, 0x1f9ff], [0x1fa70, 0x1faff],
  [0x20000, 0x3fffd],
];

/** Columns a grapheme occupies: 2 for CJK / full-width / emoji, otherwise 1. */
export function charWidth(g) {
  if (!g) return 0;
  const cp = g.codePointAt(0);
  if (g.includes("️") || g.includes("‍")) return 2; // emoji presentation / ZWJ sequences
  let lo = 0, hi = WIDE.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < WIDE[mid][0]) hi = mid - 1;
    else if (cp > WIDE[mid][1]) lo = mid + 1;
    else return 2;
  }
  return 1;
}

/** Strong right-to-left characters (Hebrew, Arabic, Syriac, Thaana, N'Ko…). */
export const isRTL = (g) => /[֐-ࣿיִ-﷿ﹰ-﻿]/u.test(g || "");

/* ----------------------------------------------------------------- engine */

let glyphId = 0;

/**
 * Create a typewriter mechanism.
 * Every operation returns a result object and notifies subscribers with
 * (event, result, snapshot). Nothing here waits; timing is the host's job.
 */
export function createTypewriter(options = {}) {
  const cfg = { ...PAGE_DEFAULTS, ...options };
  const rnd = options.random || Math.random;
  const listeners = new Set();
  let lines = [[]];
  let line = 0;
  let col = 0;
  let bellRung = false;
  let shift = false;
  let lock = false;
  let hasSheet = true;

  const emit = (event, detail = {}) => {
    const snap = snapshot();
    for (const fn of listeners) fn(event, detail, snap);
    return detail;
  };

  function snapshot() {
    return { line, column: col, columns: cfg.columns, rows: cfg.rows, shift, lock, hasSheet, lineEnd: cfg.lineEnd, backspace: cfg.backspace };
  }

  /** Where the cursor would end after a w-column strike (or null if it doesn't fit). */
  const fits = (w) => col + w <= cfg.columns;
  const lineLength = (i) => lines[i].reduce((m, g) => Math.max(m, g.col + g.w), 0);

  function checkBell(before) {
    const at = cfg.columns - cfg.bellAt;
    if (!bellRung && before < at && col >= at) {
      bellRung = true;
      emit("bell", { line, column: col });
      return true;
    }
    return false;
  }

  /** Advance the carriage by n columns (space / escapement). */
  function escape(n = 1) {
    const before = col;
    col = Math.min(cfg.columns, col + n);
    const bell = checkBell(before);
    return { from: before, column: col, bell };
  }

  const api = {
    get config() { return { ...cfg }; },
    get line() { return line; },
    get column() { return col; },
    get shift() { return shift; },
    get lock() { return lock; },
    get hasSheet() { return hasSheet; },
    get lines() { return lines; },

    configure(next = {}) {
      Object.assign(cfg, next);
      col = Math.min(col, cfg.columns);
      return snapshot();
    },

    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    snapshot,

    /** Would a character of this width need a carriage return first? */
    needsReturn(w = 1) { return !fits(w); },
    /** Is there a line left below the current one? */
    canReturn() { return line + 1 < cfg.rows; },

    setShift(on) { shift = !!on; return emit("shift", { shift, lock }); },
    setLock(on) { lock = !!on; return emit("lock", { shift, lock }); },

    /**
     * Strike one grapheme at the carriage position. Characters are printed as
     * given (the host decides casing); returns the glyph or a refusal.
     */
    strike(ch, extra = {}) {
      if (!hasSheet) return emit("blocked", { reason: "no-paper", char: ch });
      const g = String(ch);
      const w = charWidth(g);
      if (!fits(w)) {
        return emit("lineend", { reason: cfg.lineEnd === "lock" ? "locked" : "needs-return", char: g, line, column: col });
      }
      const glyph = {
        id: ++glyphId,
        ch: g,
        line,
        col,
        w,
        rtl: isRTL(g),
        // the imperfections of a real strike: position, tilt, ink and an uneven impression
        jx: (rnd() - 0.5) * 0.5,
        jy: (rnd() - 0.5) * 0.7,
        rot: (rnd() - 0.5) * 2.4,
        ink: 0.74 + rnd() * 0.24,
        tilt: Math.floor(rnd() * 360),
        fade: 0.45 + rnd() * 0.5,
        ...extra,
      };
      lines[line].push(glyph);
      const step = escape(w);
      return emit("strike", { glyph, line, column: col, bell: step.bell });
    },

    space() {
      if (!fits(1)) return emit("lineend", { reason: cfg.lineEnd === "lock" ? "locked" : "needs-return", char: " ", line, column: col });
      const step = escape(1);
      return emit("space", { line, column: col, bell: step.bell });
    },

    tab() {
      const next = Math.min(cfg.columns, (Math.floor(col / cfg.tabSize) + 1) * cfg.tabSize);
      const step = escape(next - col);
      return emit("tab", { line, column: col, from: step.from, bell: step.bell });
    },

    /**
     * Backspace. "erase" lifts the last character off the page (and may roll
     * back up a line); "move" only steps the carriage back.
     */
    backspace(mode = cfg.backspace) {
      if (mode === "move") {
        if (col === 0) return emit("backspace", { line, column: col, moved: false });
        col -= 1;
        return emit("backspace", { line, column: col, moved: true });
      }
      if (col === 0) {
        if (line === 0) return emit("backspace", { line, column: col, moved: false });
        lines.pop();
        line -= 1;
        col = lineLength(line);
        bellRung = col >= cfg.columns - cfg.bellAt;
        return emit("backspace", { line, column: col, moved: true, lineUp: true });
      }
      // the last glyph whose cell covers col-1 (latest strike wins)
      const row = lines[line];
      let idx = -1;
      for (let i = row.length - 1; i >= 0; i--) {
        const g = row[i];
        if (g.col <= col - 1 && g.col + g.w > col - 1) { idx = i; break; }
      }
      let erased = null;
      if (idx >= 0) {
        erased = row.splice(idx, 1)[0];
        col = erased.col;
      } else col -= 1;
      if (col < cfg.columns - cfg.bellAt) bellRung = false;
      return emit("backspace", { line, column: col, moved: true, erased });
    },

    /** Carriage back to the left margin + one line feed. */
    carriageReturn() {
      if (!hasSheet) return emit("blocked", { reason: "no-paper" });
      if (!api.canReturn()) return emit("pagefull", { line, column: col });
      const from = col;
      line += 1;
      col = 0;
      bellRung = false;
      lines[line] ??= [];
      return emit("return", { line, column: col, from });
    },

    /** Turn the platen without moving the carriage. */
    lineFeed(n = 1) {
      if (!hasSheet) return emit("blocked", { reason: "no-paper" });
      let fed = 0;
      while (fed < n && api.canReturn()) { line += 1; lines[line] ??= []; fed++; }
      if (!fed) return emit("pagefull", { line, column: col });
      return emit("linefeed", { line, column: col, fed });
    },

    /** Move the carriage to a column on the current line (margin release, tab clear…). */
    moveTo(column) {
      const from = col;
      col = Math.max(0, Math.min(cfg.columns, Math.round(column)));
      bellRung = col >= cfg.columns - cfg.bellAt;
      return emit("move", { line, column: col, from });
    },

    /** Take the sheet out: returns the page and leaves the machine empty. */
    eject() {
      const page = api.page();
      hasSheet = false;
      return emit("eject", { page });
    },

    /** Insert a fresh sheet (top margin, column 0). */
    insert() {
      lines = [[]];
      line = 0;
      col = 0;
      bellRung = false;
      hasSheet = true;
      return emit("insert", {});
    },

    /** Plain text of the page. Wide glyphs fill their two cells; overstrikes keep the last strike. */
    text() { return api.page().text; },

    page() {
      const out = [];
      const last = Math.max(line, lines.length - 1);
      for (let i = 0; i <= last; i++) {
        const row = lines[i] || [];
        const cells = [];
        for (const g of row) {
          while (cells.length < g.col + g.w) cells.push(" ");
          cells[g.col] = g.ch;
          if (g.w === 2) cells[g.col + 1] = "";
        }
        out.push(cells.join("").replace(/\s+$/u, ""));
      }
      while (out.length > 1 && out[out.length - 1] === "" && out.length - 1 > line) out.pop();
      return {
        text: out.join("\n"),
        lines: out,
        glyphs: lines.flatMap((row) => row.map((g) => ({ ...g }))),
        columns: cfg.columns,
        rows: cfg.rows,
      };
    },
  };
  return api;
}
