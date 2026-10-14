export interface Book {
  id: string;
  title: string;
  author?: string;
  color: string;
  width: number;
  height: number;
  rotation?: number;
  shelfId: string;
  order: number;
  pages: string[];
  progress: number;
  subtitle?: string;
  year?: string;
  /** Continuous body text, paginated by the reader to fit its page. Used instead of `pages`. */
  text?: string;
  /** Chapter ranges inside `text`. */
  chapters?: { title: string; start: number; end: number; level?: number }[];
  /** Visible character count of `text`, for display. */
  length?: number;
  /** Added by the reader at runtime (as opposed to the host's catalogue). */
  imported?: boolean;
  /** Front cover artwork (any URL: object URL, data URL, http). Replaces the drawn cover face. */
  coverImage?: string;
  /** Width / height of the cover artwork; the foreground book takes this shape. */
  coverAspect?: number;
}
export interface Shelf {
  id: string;
  title: string;
  caption?: string;
}
export function validateBooks(books: Book[], shelves: Shelf[]) {
  const ids = new Set<string>();
  for (const b of books) {
    if (
      ids.has(b.id) ||
      !shelves.some((s) => s.id === b.shelfId) ||
      b.width < 20 ||
      b.height < 40 ||
      !Number.isFinite(b.width + b.height + b.order) ||
      !Number.isFinite(b.progress) ||
      !Array.isArray(b.pages) ||
      (b.text !== undefined && typeof b.text !== "string")
    )
      throw new Error(`Invalid book: ${b.id}`);
    ids.add(b.id);
  }
}
