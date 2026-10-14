import { describe, it, expect } from "vitest";
import { layoutBooks, insertionAt } from "../src/core/LayoutEngine";
import { responsiveLayout } from "../src/responsive/Layouts";
import { BookshelfEngine } from "../src/core/BookshelfEngine";
import { LocalPersistence } from "../src/core/Persistence";
import { ReaderState } from "../src/core/ReaderState";
import { books, shelves } from "../src/demo/books";
import { defineTheme, neutralTheme, isLightColor } from "../src/theme/Theme";
import { oakTheme } from "../src/theme/presets";
import { defaultShelfLabels } from "../src/theme/Labels";
function fixture() {
  let value: string | null = null;
  const storage = {
    getItem: () => value,
    setItem: (_k: string, v: string) => {
      value = v;
    },
  };
  return { persistence: new LocalPersistence("test", storage), storage };
}
describe("layout", () => {
  for (const [width, viewport] of [
    [820, 1440],
    [485, 768],
    [350, 390],
  ])
    it(`contains every spine at ${viewport}`, () => {
      const l = layoutBooks(books, shelves, responsiveLayout(width, viewport));
      expect(l.slots.size).toBe(24);
      let leaning = 0;
      for (const row of l.rows) {
        let end = 0;
        row.slots.forEach((s, i) => {
          if (!s.rotation) {
            expect(s.x).toBeGreaterThanOrEqual(Math.max(0, end - 0.1));
            expect(s.x + s.width).toBeLessThanOrEqual(width);
            expect(s.y).toBe(row.y);
            end = s.x + s.width;
            return;
          }
          // Only the last book of a row leans, back onto its neighbour.
          leaning++;
          expect(i).toBe(row.slots.length - 1);
          expect(s.rotation).toBeLessThanOrEqual(-3);
          expect(s.rotation).toBeGreaterThanOrEqual(-7);
          const t = (-s.rotation * Math.PI) / 180;
          const cx = s.x + s.width / 2;
          // Rests on its inner bottom corner: lowest point is on the plank.
          const lowest = s.y + (s.width / 2) * Math.sin(t);
          expect(Math.abs(lowest - row.y)).toBeLessThan(0.01);
          // Stays inside the case.
          expect(cx + (s.width / 2) * Math.cos(t)).toBeLessThanOrEqual(width);
          // Touches but does not cut into the neighbour at the neighbour's height.
          const prev = row.slots[i - 1];
          const along = Math.min(s.height, prev.height / Math.cos(t));
          const leftAtContact =
            cx - (s.width / 2) * Math.cos(t) - along * Math.sin(t);
          expect(leftAtContact).toBeGreaterThanOrEqual(
            prev.x + prev.width - 0.1,
          );
        });
      }
      expect(leaning).toBeGreaterThan(0);
    });
  it("reflows without changing logical shelf/order", () => {
    const before = JSON.stringify(books);
    const a = layoutBooks(books, shelves, responsiveLayout(820, 1440));
    const b = layoutBooks(books, shelves, responsiveLayout(180, 390));
    expect(b.rows.length).toBeGreaterThan(a.rows.length);
    expect(JSON.stringify(books)).toBe(before);
  });
  it("finds insertion before the first book of the next wrapped row", () => {
    const l = layoutBooks(books, shelves, responsiveLayout(180, 390));
    const first = l.rows[0];
    const next = l.rows[1];
    expect(next.shelfId).toBe(first.shelfId);
    expect(insertionAt(l, 259, first.y - 50, "book-1").beforeId).toBe(
      next.slots[0].id,
    );
  });
});
describe("engine + persistence", () => {
  it("moves C before A, commits and reloads", () => {
    const f = fixture();
    const e = new BookshelfEngine(books, shelves, f.persistence);
    e.beginDrag("book-3");
    e.move("book-3", "fiction", "book-1");
    e.endDrag();
    const fresh = new BookshelfEngine(books, shelves, f.persistence);
    expect(
      fresh.books
        .filter((b) => b.shelfId === "fiction")
        .sort((a, b) => a.order - b.order)
        .slice(0, 3)
        .map((b) => b.id),
    ).toEqual(["book-3", "book-1", "book-2"]);
  });
  it("cancels cross-shelf drag without saving intermediate order", () => {
    const f = fixture();
    const e = new BookshelfEngine(books, shelves, f.persistence);
    e.beginDrag("book-3");
    e.move("book-3", "everyday", "book-9");
    e.endDrag(true);
    expect(e.book("book-3").shelfId).toBe("fiction");
    expect(e.book("book-3").order).toBe(2);
    expect(f.storage.getItem()).toBeNull();
  });
  it("persists shelf and progress while retaining current catalog", () => {
    const f = fixture();
    const e = new BookshelfEngine(books, shelves, f.persistence);
    e.beginDrag("book-1");
    e.move("book-1", "ideas");
    e.endDrag();
    e.setProgress("book-1", 0.5);
    const fresh = new BookshelfEngine(books, shelves, f.persistence);
    expect(fresh.book("book-1").shelfId).toBe("ideas");
    expect(fresh.book("book-1").progress).toBe(0.5);
    expect(fresh.book("book-1").pages.length).toBe(3);
  });
  it("survives corrupt or unavailable storage", () => {
    const f = fixture();
    f.storage.setItem("", "{oops");
    expect(
      new BookshelfEngine(books, shelves, f.persistence).books,
    ).toHaveLength(24);
    const p = new LocalPersistence("test", {
      getItem: () => {
        throw Error();
      },
      setItem: () => {
        throw Error();
      },
    });
    expect(p.load(books, shelves)).toHaveLength(24);
    expect(p.save(books)).toBe(false);
  });
  it("supports insert/remove and rejects duplicate IDs", () => {
    const e = new BookshelfEngine(books, shelves, fixture().persistence);
    expect(() => e.addBook(books[0])).toThrow();
    e.addBook({ ...books[0], id: "new" });
    expect(e.books).toHaveLength(25);
    e.removeBook("new");
    expect(e.books).toHaveLength(24);
  });
});
it("reader clamps boundaries and restores progress", () => {
  const state = new ReaderState(3, 0.5);
  expect(state.index).toBe(1);
  state.goTo(20);
  expect(state.index).toBe(2);
  expect(state.progress).toBe(1);
  state.goTo(-1);
  expect(state.index).toBe(0);
});
it("opens a book without content without inventing reading progress", () => {
  const e = new BookshelfEngine(books, shelves, fixture().persistence);
  expect(e.book("book-4").pages).toHaveLength(0);
  expect(e.read("book-4")).toBe(true);
  expect(e.state).toEqual({ kind: "reading", id: "book-4" });
  const state = new ReaderState(0);
  state.goTo(1);
  expect(state.index).toBe(0);
  expect(state.progress).toBe(0);
});

describe("leaning", () => {
  it("leans only the last book of a row, and moves the lean when the order changes", () => {
    const c = responsiveLayout(820, 1440);
    const leanOf = (bs: typeof books) =>
      [...layoutBooks(bs, shelves, c).slots.values()]
        .filter((s) => s.rotation)
        .map((s) => s.id);
    const first = leanOf(books);
    expect(first).toEqual(["book-8", "book-16", "book-24"]);
    // Move book-3 to the end of shelf one: it leans, book-8 stands up.
    const moved = books.map((b) =>
      b.id === "book-3" ? { ...b, order: 99 } : b,
    );
    expect(leanOf(moved)).toEqual(["book-3", "book-16", "book-24"]);
    expect(leanOf(books)).toEqual(first);
    expect(
      [
        ...layoutBooks(books, shelves, { ...c, lean: "none" }).slots.values(),
      ].some((s) => s.rotation),
    ).toBe(false);
  });
  it("does not lean when the row is full", () => {
    const c = responsiveLayout(180, 390);
    const l = layoutBooks(books, shelves, c);
    for (const row of l.rows) {
      const last = row.slots[row.slots.length - 1];
      if (!last.rotation) continue;
      const t = (-last.rotation * Math.PI) / 180;
      expect(
        last.x + last.width / 2 + (last.width / 2) * Math.cos(t),
      ).toBeLessThanOrEqual(180 - c.padding);
    }
  });
});
describe("neutral base", () => {
  it("picks the mode from the container when asked, for embedded scenes", () => {
    expect(responsiveLayout(480, 1440).mode).toBe("desktop");
    expect(responsiveLayout(480, 1440, { basis: "container" }).mode).toBe(
      "mobile",
    );
    expect(
      responsiveLayout(700, 700, { breakpoints: { mobile: 400, tablet: 650 } })
        .mode,
    ).toBe("desktop");
  });
  it("accepts layout overrides without losing mode or width", () => {
    const c = responsiveLayout(820, 1440, {
      overrides: (base) => ({ rowHeight: base.rowHeight + 40, gap: 4 }),
    });
    const base = responsiveLayout(820, 1440).rowHeight;
    expect(c.rowHeight).toBe(base + 40);
    expect(c.gap).toBe(4);
    expect(c.width).toBe(820);
    const l = layoutBooks(books, shelves, c);
    expect(l.rows[1].y - l.rows[0].y).toBe(base + 40);
    expect(l.rows[0].hitY).toBeLessThan(l.rows[0].y);
  });
  it("themes merge onto the neutral master and carry no product branding", () => {
    const t = defineTheme({ shelf: { top: 0x123456 } });
    expect(t.shelf.top).toBe(0x123456);
    expect(t.shelf.front).toBe(neutralTheme.shelf.front);
    expect(neutralTheme.spine.mark).toBeNull();
    expect(oakTheme.spine.mark).toBeNull();
  });
  it("default copy is neutral and hides continuation rows", () => {
    expect(
      defaultShelfLabels.shelfRow({
        index: 0,
        title: "Fiction",
        continuation: false,
      }),
    ).toBe("Fiction");
    expect(
      defaultShelfLabels.shelfRow({
        index: 1,
        title: "Fiction",
        continuation: true,
      }),
    ).toBe("");
    expect(isLightColor("#ffffff")).toBe(true);
    expect(isLightColor("#222")).toBe(false);
  });
});
