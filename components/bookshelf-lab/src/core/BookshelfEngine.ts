import { type Book, type Shelf, validateBooks } from "./Book";
import type { InteractionState } from "./InteractionState";
import type { StorageAdapter } from "./Persistence";
export type Change = "layout" | "selection" | "progress" | "storage";
export class BookshelfEngine {
  books: Book[];
  state: InteractionState = { kind: "idle" };
  saved = true;
  private listeners = new Set<(change: Change) => void>();
  /** Drag rollback only needs placement, never text. */
  private snapshot?: Map<string, { shelfId: string; order: number }>;
  constructor(
    books: Book[],
    public shelves: Shelf[],
    private persistence: StorageAdapter,
  ) {
    validateBooks(books, shelves);
    this.books = persistence.load(books, shelves);
    this.normalize();
  }
  subscribe(fn: (change: Change) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(change: Change) {
    this.listeners.forEach((fn) => fn(change));
  }
  book(id: string) {
    const b = this.books.find((b) => b.id === id);
    if (!b) throw new Error(`Unknown book ${id}`);
    return b;
  }
  select(id: string) {
    this.book(id);
    this.state = { kind: "selected", id };
    this.emit("selection");
  }
  close() {
    this.state = { kind: "idle" };
    this.emit("selection");
  }
  read(id: string) {
    this.book(id);
    this.state = { kind: "reading", id };
    this.emit("selection");
    return true;
  }
  beginDrag(id: string) {
    this.book(id);
    this.snapshot = new Map(
      this.books.map((b) => [b.id, { shelfId: b.shelfId, order: b.order }]),
    );
    this.state = { kind: "dragging", id };
    this.emit("selection");
  }
  move(id: string, shelfId: string, beforeId?: string) {
    if (!this.shelves.some((s) => s.id === shelfId) || beforeId === id) return;
    const book = this.book(id);
    const target = this.books
      .filter((b) => b.shelfId === shelfId && b.id !== id)
      .sort((a, b) => a.order - b.order);
    let index = beforeId
      ? target.findIndex((b) => b.id === beforeId)
      : target.length;
    if (index < 0) index = target.length;
    const previous = this.books
      .filter((b) => b.shelfId === shelfId)
      .sort((a, b) => a.order - b.order)
      .map((b) => b.id)
      .join("|");
    target.splice(index, 0, book);
    if (
      book.shelfId === shelfId &&
      previous === target.map((b) => b.id).join("|")
    )
      return;
    book.shelfId = shelfId;
    target.forEach((b, i) => (b.order = i));
    this.normalize();
    this.emit("layout");
  }
  endDrag(cancel = false) {
    if (cancel && this.snapshot)
      for (const b of this.books) Object.assign(b, this.snapshot.get(b.id));
    this.snapshot = undefined;
    this.state = { kind: "idle" };
    if (!cancel) this.persist();
    this.emit("layout");
    this.emit("selection");
  }
  setProgress(id: string, value: number) {
    this.book(id).progress = Math.max(0, Math.min(1, value));
    this.persist();
    this.emit("progress");
  }
  addBook(book: Book) {
    validateBooks([...this.books, book], this.shelves);
    const copy = structuredClone(book);
    // A new book goes to the end of its shelf unless the caller placed it.
    if (!Number.isFinite(book.order) || book.order >= 9999)
      copy.order =
        Math.max(
          -1,
          ...this.books
            .filter((b) => b.shelfId === book.shelfId)
            .map((b) => b.order),
        ) + 1;
    this.books.push(copy);
    this.normalize();
    this.persist();
    this.emit("layout");
  }
  /** Change a book's metadata or content in place (title, colour, size, text…); shelf moves go through move(). */
  updateBook(
    id: string,
    patch: Partial<Omit<Book, "id" | "shelfId" | "order">>,
  ) {
    const book = this.book(id);
    const next = {
      ...book,
      ...patch,
      id: book.id,
      shelfId: book.shelfId,
      order: book.order,
    };
    validateBooks(
      this.books.map((b) => (b.id === id ? next : b)),
      this.shelves,
    );
    Object.assign(book, patch);
    this.persist();
    this.emit("layout");
  }
  removeBook(id: string) {
    this.books = this.books.filter((b) => b.id !== id);
    if ("id" in this.state && this.state.id === id) this.close();
    this.normalize();
    this.persist();
    this.emit("layout");
  }
  configureShelves(shelves: Shelf[]) {
    validateBooks(this.books, shelves);
    this.shelves = shelves;
    this.persist();
    this.emit("layout");
  }
  private normalize() {
    for (const s of this.shelves)
      this.books
        .filter((b) => b.shelfId === s.id)
        .sort((a, b) => a.order - b.order)
        .forEach((b, i) => (b.order = i));
  }
  private persist() {
    this.saved = this.persistence.save(this.books);
    this.emit("storage");
  }
}
