import type { Book, Shelf } from "./Book";
import type { LayoutConfig } from "../responsive/Layouts";
export interface Slot {
  id: string;
  shelfId: string;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
}
export interface ShelfRow {
  shelfId: string;
  index: number;
  y: number;
  title: string;
  caption?: string;
  continuation: boolean;
  /** Vertical centre of the books in this row; used for drop targeting. */
  hitY: number;
  slots: Slot[];
}
export interface Layout {
  slots: Map<string, Slot>;
  rows: ShelfRow[];
  height: number;
}
/** Pure layout. Shelf identity persists across responsive wrapping. Rotation reserves its projected footprint. */
export function layoutBooks(
  books: Book[],
  shelves: Shelf[],
  config: LayoutConfig,
): Layout {
  const slots = new Map<string, Slot>();
  const rows: ShelfRow[] = [];
  const { width, padding, gap, rowHeight, baseline, headroom } = config;
  for (const shelf of shelves) {
    const sorted = books
      .filter((b) => b.shelfId === shelf.id)
      .sort((a, b) => a.order - b.order);
    let row: ShelfRow;
    let x = padding;
    const newRow = (continuation: boolean) => {
      const y = rows.length * rowHeight + rowHeight - baseline;
      row = {
        shelfId: shelf.id,
        index: rows.length,
        y,
        title: shelf.title,
        caption: shelf.caption,
        continuation,
        hitY: y - (rowHeight - headroom) / 2,
        slots: [],
      };
      rows.push(row);
      x = padding;
    };
    newRow(false);
    for (const b of sorted) {
      const rotation =
        config.lean === "manual"
          ? Math.max(-8, Math.min(8, b.rotation ?? 0))
          : 0;
      const rad = (rotation * Math.PI) / 180;
      const maxScale = Math.min(
        config.bookScale,
        (rowHeight - headroom) / b.height,
      );
      const rawFootprint =
        b.width * Math.cos(rad) + b.height * Math.abs(Math.sin(rad));
      const scale = Math.min(
        maxScale,
        Math.max(1, width - padding * 2) / rawFootprint,
      );
      const footprint = rawFootprint * scale;
      if (x + footprint > width - padding && row!.slots.length) newRow(true);
      const slot: Slot = {
        id: b.id,
        shelfId: shelf.id,
        row: row!.index,
        x:
          x +
          (footprint - rawFootprint * scale) / 2 +
          (rotation < 0 ? b.height * scale * Math.abs(Math.sin(rad)) : 0),
        y: row!.y,
        width: b.width * scale,
        height: b.height * scale,
        rotation,
        scale,
      };
      slots.set(b.id, slot);
      row!.slots.push(slot);
      x += footprint + gap;
    }
  }
  if (config.lean === "auto")
    for (const row of rows) leanLastBook(row, width - padding, gap);
  return { slots, rows, height: rows.length * rowHeight + 16 };
}
function leanAngle(id: string) {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return 3 + ((h >>> 0) % 400) / 100; // 3–7°
}
/**
 * The last book of a row, if there is room after it, leans back onto its neighbour:
 * it rests on its outer bottom corner and touches the neighbour's right edge at the
 * lower of the two heights (so it can overhang a shorter neighbour, like a real book).
 * Rotation is about the bottom centre, so the slot is lifted to keep the corner on the plank.
 */
function leanLastBook(row: ShelfRow, limit: number, gap: number) {
  const n = row.slots.length;
  if (n < 2) return;
  const last = row.slots[n - 1];
  const prev = row.slots[n - 2];
  const theta = (leanAngle(last.id) * Math.PI) / 180;
  const { width: w, height: h } = last;
  const contact = Math.min(prev.height, h);
  // Height along the book's own edge that reaches `contact` above the plank once tilted.
  const along = Math.min(h, contact / Math.cos(theta));
  const cx =
    prev.x +
    prev.width +
    gap +
    (w / 2) * Math.cos(theta) +
    along * Math.sin(theta);
  if (cx + (w / 2) * Math.cos(theta) > limit) return;
  last.rotation = -(theta * 180) / Math.PI;
  last.x = cx - w / 2;
  last.y = row.y - (w / 2) * Math.sin(theta);
}
export function insertionAt(
  layout: Layout,
  x: number,
  y: number,
  draggedId: string,
): { shelfId: string; beforeId?: string } {
  const row = layout.rows.reduce((a, b) =>
    Math.abs(b.hitY - y) < Math.abs(a.hitY - y) ? b : a,
  );
  const before = row.slots.find(
    (s) => s.id !== draggedId && x < s.x + s.width / 2,
  );
  if (before) return { shelfId: row.shelfId, beforeId: before.id };
  const nextRow = layout.rows.find(
    (r) => r.index > row.index && r.shelfId === row.shelfId,
  );
  return {
    shelfId: row.shelfId,
    beforeId: nextRow?.slots.find((s) => s.id !== draggedId)?.id,
  };
}
