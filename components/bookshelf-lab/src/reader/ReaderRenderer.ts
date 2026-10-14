import type { Book } from "../core/Book";
export interface ReaderRenderer {
  open(book: Book): void;
  close(): void;
  goToPage(index: number): void;
  nextPage(): void;
  previousPage(): void;
  destroy(): void;
}
export interface ReaderCallbacks {
  onProgress(id: string, progress: number): void;
  onClose(): void;
}
