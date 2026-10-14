import type { Book } from "../core/Book";
/**
 * All user-facing copy owned by the shelf base. Defaults are short, neutral English;
 * hosts localise or rebrand by passing partial overrides. Product copy stays in the host.
 */
export interface ShelfRowInfo {
  index: number;
  title: string;
  caption?: string;
  continuation: boolean;
}
export interface BookshelfLabels {
  /** aria-label of the shelf region. */
  shelf: string;
  /** aria-label while a drag is in progress. */
  rearranging: string;
  /** Accessible name of a spine. */
  book(book: Book): string;
  /** Visible text under a shelf row. Return "" to hide it. */
  shelfRow(row: ShelfRowInfo): string;
}
export interface PresentationLabels {
  /** Accessible name of the cover button. */
  openBook(book: Book): string;
  /** Small text printed on the cover. "" hides it. */
  coverHint: string;
  /** Hint under the held book. "" hides it. */
  actionHint: string;
  returnToShelf: string;
}
export interface ReaderLabels {
  back: string;
  previous: string;
  next: string;
  progress: string;
  /** Page counter text when a book has no pages. */
  noPages: string;
  /** Body text when a book has no pages. */
  emptyBody(book: Book): string;
  /** Optional small line above the title. "" hides it. */
  eyebrow: string;
  /** Optional header text. "" hides it. */
  header: string;
  /** Shown while a continuous text is being cut into pages. */
  paginating: string;
  /** Table of contents button / panel title, and its close button. */
  contents: string;
  closeContents: string;
}

export const defaultShelfLabels: BookshelfLabels = {
  shelf: "Bookshelf",
  rearranging: "Rearranging books. Press Escape to cancel.",
  book: (b) =>
    [
      b.title,
      b.author,
      b.progress > 0 ? `${Math.round(b.progress * 100)}% read` : "",
    ]
      .filter(Boolean)
      .join(", "),
  shelfRow: (row) => (row.continuation ? "" : row.title),
};
export const defaultPresentationLabels: PresentationLabels = {
  openBook: (b) => `Open ${b.title}`,
  coverHint: "",
  actionHint: "Tap the cover to open",
  returnToShelf: "Put back",
};
export const defaultReaderLabels: ReaderLabels = {
  back: "← Back to shelf",
  previous: "Previous page",
  next: "Next page",
  progress: "Reading progress",
  noPages: "No pages",
  emptyBody: () => "This book has no pages yet.",
  eyebrow: "",
  header: "",
  paginating: "Laying out…",
  contents: "Contents",
  closeContents: "Close contents",
};
