import "../demo/style.css";
import { BookPresentation } from "../render/BookPresentation";
import {
  BookshelfEngine,
  BookshelfView,
  LocalPersistence,
  SimplePageReader,
  applySurface,
  neutralTheme,
  oakTheme,
  IndexedDBBookStore,
  MemoryBookStore,
  storedToBook,
  type BookStore,
  type StoredBook,
  type ReaderRenderer,
} from "../index";
import { createAddBookDialog } from "./addBook";
import { books, shelves } from "./books";
import { oakDecoration } from "./decorate";
const skins = { neutral: neutralTheme, oak: oakTheme } as const;
type SkinName = keyof typeof skins;
const SKIN_KEY = "trinket-bookshelf:skin";
const LIBRARY_FLAG = "trinket-bookshelf:has-library";
function initialSkin(): SkinName {
  const fromUrl = new URLSearchParams(location.search).get("skin");
  if (fromUrl === "oak" || fromUrl === "neutral") return fromUrl;
  try {
    const saved = localStorage.getItem(SKIN_KEY);
    if (saved === "oak" || saved === "neutral") return saved;
  } catch {
    /* storage unavailable: use the default */
  }
  return "neutral";
}
let skin = initialSkin();
const icon =
  '<span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
document.querySelector("#app")!.innerHTML =
  `<div class="workspace"><header class="site-header"><a class="brand" href="./">${icon}<span>Bookshelf<small>INTERACTIVE SHELF & READER</small></span></a><button class="help-button" aria-label="How to use Bookshelf">?</button></header><main><div class="toolbar"><div class="tabs" aria-label="Book filter"><button class="active" data-filter="all" aria-pressed="true">All books <span id="all-count">24</span></button><button data-filter="reading" aria-pressed="false">Reading <span id="reading-count">0</span></button></div><button class="add-book-button" type="button" aria-label="Add a book"><span aria-hidden="true">＋</span><em>Add book</em></button><label class="search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search books" aria-label="Search books by title or author"/><kbd>/</kbd></label></div><section class="shelf-area"><div class="shelf-hint"><span>THE SHELF</span><span class="skin-switch" role="group" aria-label="Shelf appearance"><button data-skin="neutral" aria-pressed="false">Neutral</button><button data-skin="oak" aria-pressed="false">Oak</button></span><span class="desktop-hint">Tap to take · Drag to rearrange</span><span class="mobile-hint">Tap to take · Hold to rearrange</span></div><div id="bookshelf" aria-label="Bookshelf"><div class="loading">Arranging books…</div></div><p class="empty" hidden>No books match this view.</p><div class="shelf-bottom"><span class="save-status" role="status">● Saved locally</span></div></section></main></div><dialog class="help"><button class="help-close" aria-label="Close help">×</button><div class="eyebrow">HOW TO USE IT</div><h2>Take a book. Move it. Open it.</h2><p>Tap a spine to pull the book out. Tap the cover to open the reader.</p><p>Desktop: drag books to reorder them or move them between shelves.</p><p>Touch: hold a spine, then drag. Move near the screen edge to scroll.</p><p>Keyboard: Tab selects a book. Enter takes it out. Alt + ← / → reorders it, and Alt + ↑ / ↓ moves it between shelves.</p><p>While reading, use ← / → to change pages. Escape closes the current layer.</p><p>Use “Add book” to import EPUB, TXT, or Markdown, paste text, or add a blank placeholder.</p><small>Order and reading progress are stored in this browser.</small></dialog>`;
// The reader's own books live in IndexedDB; placement and progress stay in LocalPersistence.
// The database is only opened up front once this browser has added a book (flag below),
// so a plain visit never pays for IndexedDB start-up.
const flag = (() => {
  try {
    return localStorage.getItem(LIBRARY_FLAG) === "1";
  } catch {
    return true;
  }
})();
let store: BookStore = new IndexedDBBookStore("trinket-bookshelf-library");
let stored: StoredBook[] = [];
if (flag)
  try {
    stored = await store.list();
  } catch {
    store = new MemoryBookStore();
  }
const engine = new BookshelfEngine(
  [
    ...books,
    ...stored.map((s) =>
      storedToBook(
        shelves.some((x) => x.id === s.shelfId)
          ? s
          : { ...s, shelfId: shelves[0].id },
      ),
    ),
  ],
  shelves,
  new LocalPersistence("trinket-bookshelf:v1"),
);
const root = document.querySelector<HTMLElement>("#bookshelf")!;
const view = new BookshelfView(root, engine, {
  theme: skins[skin],
});

const reader: ReaderRenderer = new SimplePageReader({
  onProgress: (id, p) => engine.setProgress(id, p),
  onClose: () => {
    void presentation.close();
  },
});
const presentation = new BookPresentation(
  view,
  {
    onOpen: (book) => {
      if (engine.read(book.id)) reader.open(book);
    },
    onReturn: () => engine.close(),
  },
  {
    decorate: (faces, book) => {
      if (skin === "oak") oakDecoration(faces, book);
    },
  },
);
function applySkin(name: SkinName) {
  skin = name;
  document.documentElement.dataset.skin = name;
  applySurface(document.documentElement, skins[name].surface);
  document.querySelectorAll<HTMLButtonElement>("[data-skin]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.skin === name));
  });
  try {
    localStorage.setItem(SKIN_KEY, name);
  } catch {
    /* ignore */
  }
}
applySkin(skin);
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-skin]",
))
  button.addEventListener("click", () => {
    const name = button.dataset.skin as SkinName;
    if (name === skin) return;
    applySkin(name);
    view.setTheme(skins[name]);
  });
let filter = "all";
const search = document.querySelector<HTMLInputElement>("input[type=search]")!;
function filterBooks() {
  view.setFilter(search.value, filter === "reading");
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(".empty")!.hidden =
      root.dataset.visible !== "0";
  });
}
function updateCounts() {
  const n = String(engine.books.length);
  document.querySelector("#all-count")!.textContent = n;
  document.querySelector("#reading-count")!.textContent = String(
    engine.books.filter((book) => book.progress > 0).length,
  );
}
updateCounts();
const addDialog = createAddBookDialog({
  engine,
  store,
  spineSkin: () => skins[skin].spine,
  onAdded: (id) => {
    try {
      localStorage.setItem(LIBRARY_FLAG, "1");
    } catch {
      /* ignore */
    }
    search.value = "";
    filter = "all";
    document
      .querySelectorAll<HTMLButtonElement>("[data-filter]")
      .forEach((b) => {
        const on = b.dataset.filter === "all";
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", String(on));
      });
    view.setFilter("");
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(`[data-book="${id}"]`);
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
      target?.classList.add("just-added");
      setTimeout(() => target?.classList.remove("just-added"), 2400);
    });
  },
  onRemoved: () => updateCounts(),
});
document.querySelector(".add-book-button")!.addEventListener("click", () => {
  engine.close();
  addDialog.openNew();
});
engine.subscribe((change) => {
  if (change === "layout") updateCounts();
  if (change === "selection") {
    if (engine.state.kind === "selected")
      void presentation.select(engine.book(engine.state.id));
    else if (engine.state.kind === "idle") void presentation.close();
  }
  if (change === "progress" || change === "layout") updateCounts();
  if (change === "storage") {
    const status = document.querySelector(".save-status")!;
    status.textContent = engine.saved
      ? "● Saved locally"
      : "○ Local storage is unavailable";
    status.classList.toggle("save-failed", !engine.saved);
  }
});
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-filter]",
))
  button.addEventListener("click", () => {
    filter = button.dataset.filter!;
    document.querySelectorAll("[data-filter]").forEach((b) => {
      b.classList.toggle("active", b === button);
      b.setAttribute("aria-pressed", String(b === button));
    });
    filterBooks();
  });
search.addEventListener("input", filterBooks);
const help = document.querySelector<HTMLDialogElement>(".help")!;
document
  .querySelector(".help-button")!
  .addEventListener("click", () => help.showModal());
document
  .querySelector(".help-close")!
  .addEventListener("click", () => help.close());
window.addEventListener("keydown", (e) => {
  if (
    e.key === "/" &&
    !(e.target instanceof HTMLInputElement) &&
    engine.state.kind !== "reading" &&
    !help.open
  ) {
    e.preventDefault();
    search.focus();
  }
});
// Flag missing (e.g. site data partly cleared): pick up stored books once the shelf is showing.
if (!flag)
  setTimeout(async () => {
    try {
      const late = await store.list();
      for (const s of late)
        if (!engine.books.some((b) => b.id === s.id))
          engine.addBook(
            storedToBook(
              shelves.some((x) => x.id === s.shelfId)
                ? s
                : { ...s, shelfId: shelves[0].id },
            ),
          );
      if (late.length) localStorage.setItem(LIBRARY_FLAG, "1");
    } catch {
      /* no IndexedDB: nothing stored */
    }
  }, 2500);
try {
  await view.init();
  document.querySelector(".loading")?.remove();
} catch (error) {
  root.textContent = "Bookshelf could not start. Use a browser with WebGL enabled.";
  console.error(error);
}
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    presentation.destroy();
    view.destroy();
    reader.destroy();
  });
