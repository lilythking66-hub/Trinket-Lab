import type { Book } from "../core/Book";
import type { Chapter } from "./text";

/** What is kept for a book the reader added. Order, shelf and progress stay in the engine's StorageAdapter. */
export interface StoredBook {
  id: string;
  title: string;
  author?: string;
  color: string;
  width: number;
  height: number;
  /** Shelf chosen when the book was added; used if the order store has nothing for it. */
  shelfId: string;
  text?: string;
  chapters?: Chapter[];
  length?: number;
  encoding?: string;
  /** Cover artwork (e.g. from an EPUB); stored as a Blob in IndexedDB. */
  cover?: Blob;
  coverAspect?: number;
  createdAt: number;
}

export interface BookStore {
  list(): Promise<StoredBook[]>;
  put(book: StoredBook): Promise<void>;
  delete(id: string): Promise<void>;
}

/** IndexedDB store: holds whole texts (localStorage is ~5 MB and synchronous). */
export class IndexedDBBookStore implements BookStore {
  private db?: Promise<IDBDatabase>;
  constructor(private name = "bookshelf-lab-library") {}
  private open() {
    return (this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(this.name, 1);
      req.onupgradeneeded = () =>
        req.result.createObjectStore("books", { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }
  private async tx<T>(
    mode: IDBTransactionMode,
    run: (s: IDBObjectStore) => IDBRequest<T>,
  ) {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const req = run(db.transaction("books", mode).objectStore("books"));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async list() {
    const all = await this.tx<StoredBook[]>(
      "readonly",
      (s) => s.getAll() as IDBRequest<StoredBook[]>,
    );
    return all.sort((a, b) => a.createdAt - b.createdAt);
  }
  async put(book: StoredBook) {
    await this.tx("readwrite", (s) => s.put(book));
  }
  async delete(id: string) {
    await this.tx("readwrite", (s) => s.delete(id));
  }
}

/** Fallback when IndexedDB is unavailable (private mode, tests): books live for the session only. */
export class MemoryBookStore implements BookStore {
  private map = new Map<string, StoredBook>();
  async list() {
    return [...this.map.values()].sort((a, b) => a.createdAt - b.createdAt);
  }
  async put(book: StoredBook) {
    this.map.set(book.id, structuredClone(book));
  }
  async delete(id: string) {
    this.map.delete(id);
  }
}

export function storedToBook(s: StoredBook, order = 9999): Book {
  return {
    id: s.id,
    title: s.title,
    author: s.author,
    color: s.color,
    width: s.width,
    height: s.height,
    shelfId: s.shelfId,
    order,
    pages: [],
    text: s.text,
    chapters: s.chapters,
    length: s.length,
    progress: 0,
    imported: true,
    coverImage: s.cover ? URL.createObjectURL(s.cover) : undefined,
    coverAspect: s.coverAspect,
  };
}
export function newBookId() {
  return `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
