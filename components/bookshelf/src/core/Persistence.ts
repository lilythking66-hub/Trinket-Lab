import type { Book, Shelf } from "./Book";
export interface StorageAdapter {
  load(books: Book[], shelves: Shelf[]): Book[];
  save(books: Book[]): boolean;
}
export class LocalPersistence implements StorageAdapter {
  constructor(
    private key = "trinket-bookshelf:v1",
    private storage?: Pick<Storage, "getItem" | "setItem">,
  ) {}
  load(books: Book[], shelves: Shelf[]): Book[] {
    try {
      const data = JSON.parse(
        (this.storage ?? localStorage).getItem(this.key) ?? "null",
      );
      if (data?.version !== 1 || !Array.isArray(data.books))
        return structuredClone(books);
      return books.map((b) => {
        const saved = data.books.find((s: Partial<Book>) => s.id === b.id);
        if (!saved) return { ...b };
        return {
          ...b,
          shelfId: shelves.some((s) => s.id === saved.shelfId)
            ? saved.shelfId
            : b.shelfId,
          order: Number.isFinite(saved.order) ? saved.order : b.order,
          progress: Number.isFinite(saved.progress)
            ? Math.min(1, Math.max(0, saved.progress))
            : b.progress,
        };
      });
    } catch {
      return structuredClone(books);
    }
  }
  save(books: Book[]) {
    try {
      (this.storage ?? localStorage).setItem(
        this.key,
        JSON.stringify({
          version: 1,
          books: books.map(({ id, shelfId, order, progress }) => ({
            id,
            shelfId,
            order,
            progress,
          })),
        }),
      );
      return true;
    } catch {
      return false;
    }
  }
}
