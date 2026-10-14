// Minimal host: the neutral shelf base with zero product styling or copy.
import {
  BookPresentation,
  BookshelfEngine,
  BookshelfView,
  LocalPersistence,
  SimplePageReader,
} from "../index";
import { books, shelves } from "./books";

const sample = books.slice(0, 10).map((b, i) => ({
  ...b,
  shelfId: shelves[i < 6 ? 0 : 1].id,
  order: i < 6 ? i : i - 6,
}));
const engine = new BookshelfEngine(
  sample,
  shelves
    .slice(0, 2)
    .map((s, i) => ({ ...s, title: ["Fiction", "Everyday"][i] })),
  new LocalPersistence("trinket-bookshelf:embed:v1"),
);
const view = new BookshelfView(
  document.querySelector<HTMLElement>("#shelf")!,
  engine,
  {
    layout: { basis: "container" },
  },
);
const reader = new SimplePageReader({
  onProgress: (id, p) => engine.setProgress(id, p),
  onClose: () => void presentation.close(),
});
const presentation = new BookPresentation(view, {
  onOpen: (book) => {
    engine.read(book.id);
    reader.open(book);
  },
  onReturn: () => engine.close(),
});
engine.subscribe((change) => {
  if (change !== "selection") return;
  if (engine.state.kind === "selected")
    void presentation.select(engine.book(engine.state.id));
  else if (engine.state.kind === "idle") void presentation.close();
});
await view.init();
