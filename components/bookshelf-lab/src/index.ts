export { BookshelfEngine } from "./core/BookshelfEngine";
export { BookshelfView } from "./render/BookshelfView";
export { paintSpine } from "./render/BookRenderer";
export type { BookshelfViewOptions } from "./render/BookshelfView";
export { LocalPersistence } from "./core/Persistence";
export { layoutBooks, insertionAt } from "./core/LayoutEngine";
export { responsiveLayout, defaultBreakpoints } from "./responsive/Layouts";
export type { LayoutConfig, LayoutOptions } from "./responsive/Layouts";
export { SimplePageReader } from "./reader/SimplePageReader";
export type { SimplePageReaderOptions } from "./reader/SimplePageReader";
export type { Book, Shelf } from "./core/Book";
export type { ReaderRenderer, ReaderCallbacks } from "./reader/ReaderRenderer";
export type { StorageAdapter } from "./core/Persistence";

export { BookPresentation } from "./render/BookPresentation";
export type {
  BookFaces,
  PresentationOptions,
  PresentationPhase,
} from "./render/BookPresentation";

export {
  neutralTheme,
  defineTheme,
  surfaceVars,
  applySurface,
  isLightColor,
  inkFor,
} from "./theme/Theme";
export type {
  BookshelfTheme,
  ThemeOverrides,
  ShelfSkin,
  SpineSkin,
  SurfaceSkin,
} from "./theme/Theme";
export { oakTheme } from "./theme/presets";
export {
  defaultShelfLabels,
  defaultPresentationLabels,
  defaultReaderLabels,
} from "./theme/Labels";
export type {
  BookshelfLabels,
  PresentationLabels,
  ReaderLabels,
  ShelfRowInfo,
} from "./theme/Labels";

export {
  decodeText,
  parseText,
  importTextFile,
  markdownToText,
  guessFromFileName,
} from "./import/text";
export type { ImportedText, Chapter } from "./import/text";
export { generateSpine, spinePalette } from "./import/spine";
export type { SpineSpec } from "./import/spine";
export {
  IndexedDBBookStore,
  MemoryBookStore,
  storedToBook,
  newBookId,
} from "./import/LibraryStore";
export type { BookStore, StoredBook } from "./import/LibraryStore";
export { paginate, createMeasurer, pageHTML } from "./reader/paginate";
export type { TextPage } from "./reader/paginate";
export { ZipArchive } from "./import/zip";
export { importEpub, EpubError } from "./import/epub";
export type { EpubImport, EpubChapter } from "./import/epub";
export { coverInfo } from "./import/cover";
export type { CoverInfo } from "./import/cover";
