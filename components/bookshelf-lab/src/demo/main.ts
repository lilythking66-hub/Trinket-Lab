import "../demo/style.css";
import { BookPresentation } from "../render/BookPresentation";
import {
  BookshelfEngine,
  BookshelfView,
  LocalPersistence,
  SimplePageReader,
  applySurface,
  inkFor,
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
import {
  shelfLabels,
  presentationLabels,
  readerLabels,
  oakDecoration,
} from "./copy";
const skins = { neutral: neutralTheme, oak: oakTheme } as const;
type SkinName = keyof typeof skins;
const SKIN_KEY = "bookshelf-lab:skin";
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
  `<div class="workspace"><header class="site-header"><a class="brand" href="./">${icon}<span>Bookshelf <em>Lab</em><small>A LITTLE SPACE FOR BIG WORLDS</small></span></a><span class="header-note">一本书，就是一间自己的房间。</span><button class="help-button" aria-label="使用说明">?</button></header><main><section class="intro"><div><div class="eyebrow">YOUR PERSONAL LIBRARY · 私人书房</div><h1>把时间，留在书页之间<span>。</span></h1><p>收藏故事，也收藏片刻的安静。</p></div><div class="collection-number"><strong id="collection-count">24</strong><span>BOOKS & COUNTING</span></div></section><div class="toolbar"><div class="tabs" aria-label="书籍筛选"><button class="active" data-filter="all" aria-pressed="true">全部藏书 <span id="all-count">24</span></button><button data-filter="reading" aria-pressed="false">正在阅读 <span id="reading-count">0</span></button></div><button class="add-book-button" type="button" aria-label="添加一本书"><span aria-hidden="true">＋</span><em>添加一本书</em></button><label class="search"><span aria-hidden="true">⌕</span><input type="search" placeholder="寻找一本书" aria-label="搜索书名或作者"/><kbd>/</kbd></label></div><div class="library-grid"><section class="shelf-area"><div class="shelf-hint"><span>THE SHELF</span><span class="skin-switch" role="group" aria-label="书架外观"><button data-skin="neutral" aria-pressed="false">中性</button><button data-skin="oak" aria-pressed="false">橡木</button></span><span class="desktop-hint">轻点抽出 · 拖动整理</span><span class="mobile-hint">轻点抽出 · 长按整理</span></div><div id="bookshelf" aria-label="书架"><div class="loading">正在整理书架…</div></div><p class="empty" hidden>这里暂时没有书。试试其他关键词，或翻开一本开始阅读。</p><div class="shelf-bottom"><span class="save-status" role="status">● 已保存在此设备</span><span>每一本，都有自己的位置。</span></div></section><aside class="detail-panel" aria-label="书籍详情"><div class="detail-default"><div class="eyebrow">A MOMENT TO YOURSELF</div><div class="quiet-art" aria-hidden="true"><span class="sun"></span><span class="vase"></span><span class="stem"></span><span class="leaf leaf-one"></span><span class="leaf leaf-two"></span><span class="still-book"></span></div><h2>世界很大，<br/>先读几页。</h2><p>从书架抽出一本书，<br/>让新的故事慢慢展开。</p><div class="recommended"><span class="eyebrow">从这里开始</span><button data-pick="book-1">山间来信 <span>↗</span></button><button data-pick="book-9">日常的光 <span>↗</span></button><button data-pick="book-17">关于留白 <span>↗</span></button><small>3 篇可阅读的原创短章</small></div></div><div class="detail-content" hidden><div class="detail-top"><span class="eyebrow">FROM YOUR SHELF</span><button class="close-detail" aria-label="将书放回书架">×</button></div><div class="cover" aria-hidden="true"><div class="cover-border"><small>BOOKSHELF LAB<br/>PRIVATE COLLECTION</small><strong></strong><span></span><i>✳</i></div></div><div class="book-meta"><span class="book-category eyebrow"></span><h2 class="book-title"></h2><p class="book-author"></p><p class="book-description"></p><div class="book-progress"></div><button class="read-button">开始阅读 <span>↗</span></button><button class="return-button">放回书架</button><button class="edit-button" hidden>编辑这本书</button><small class="preview-note"></small></div></div></aside></div></main><footer class="site-footer"><span>BOOKSHELF LAB <i> / </i> 一个安放故事的地方</span><span>DESIGNED FOR SLOW READING</span></footer></div><dialog class="help"><button class="help-close" aria-label="关闭使用说明">×</button><div class="eyebrow">MAKE YOURSELF AT HOME</div><h2>你的书架，你的秩序。</h2><p>轻点书脊，抽出一本书。轻触前景封面，打开书后进入正文。</p><p>电脑：拖动书籍调整位置，也可以跨层移动。<br/>手机：长按书脊后拖动，靠近屏幕边缘可滚动。</p><p>键盘：Tab 选择书籍，Enter 抽出。<br/>Alt + ← / → 调整顺序，Alt + ↑ / ↓ 移至其他书架。<br/>阅读时用 ← / → 翻页，Escape 返回。</p><p>手机阅读时左右滑动正文，或点击底部翻页按钮。</p><p>点「＋ 添加一本书」可以导入 .txt / .md 文件、粘贴文字，或先放一本空书；自己添加的书可以在详情里编辑或移除。</p><small>顺序和进度保存在当前浏览器。标注「原创示例」的三本书提供可读正文，其余书籍也可打开查看暂无正文提示。</small></dialog>`;
// The reader's own books live in IndexedDB; placement and progress stay in LocalPersistence.
// The database is only opened up front once this browser has added a book (flag below),
// so a plain visit never pays for IndexedDB start-up.
const LIBRARY_FLAG = "bookshelf-lab:has-library";
const flag = (() => {
  try {
    return localStorage.getItem(LIBRARY_FLAG) === "1";
  } catch {
    return true;
  }
})();
let store: BookStore = new IndexedDBBookStore("bookshelf-lab-library");
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
  new LocalPersistence(),
);
const root = document.querySelector<HTMLElement>("#bookshelf")!;
const view = new BookshelfView(root, engine, {
  theme: skins[skin],
  labels: shelfLabels,
});
const detail = document.querySelector<HTMLElement>(".detail-panel")!;

const reader: ReaderRenderer = new SimplePageReader(
  {
    onProgress: (id, p) => engine.setProgress(id, p),
    onClose: () => {
      void presentation.close();
    },
  },
  { labels: readerLabels },
);
const presentation = new BookPresentation(
  view,
  {
    onOpen: (book) => {
      if (engine.read(book.id)) reader.open(book);
    },
    onReturn: () => engine.close(),
    onPhase: () => updateDetail(),
  },
  {
    labels: presentationLabels,
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
function updateDetail() {
  const state = engine.state;
  const selected = state.kind === "selected";
  detail.classList.toggle("is-selected", selected);
  document.querySelector<HTMLElement>(".detail-default")!.hidden = selected;
  document.querySelector<HTMLElement>(".detail-content")!.hidden = !selected;
  if (!selected) return;
  const b = engine.book(state.id);
  detail.querySelector(".book-title")!.textContent = b.title;
  detail.querySelector(".book-author")!.textContent = b.author ?? "";
  detail.querySelector(".book-description")!.textContent = b.subtitle ?? "";
  detail.querySelector(".book-category")!.textContent =
    engine.shelves.find((s) => s.id === b.shelfId)?.title ?? "";
  const cover = detail.querySelector<HTMLElement>(".cover")!;
  cover.style.background = b.color;
  cover.querySelector("strong")!.textContent = b.title;
  cover.querySelector("span")!.textContent = b.author ?? "";
  cover.style.color = inkFor(b.color, "#333b34", "#fff8e8");
  cover.style.backgroundImage = b.coverImage ? `url("${b.coverImage}")` : "";
  cover.classList.toggle("has-image", !!b.coverImage);
  const readable = b.pages.length > 0 || !!b.text;
  const done =
    b.progress > 0 ? `已读 ${Math.round(b.progress * 100)}%` : "尚未开始";
  detail.querySelector(".book-progress")!.textContent = b.text
    ? `${wordCount(b.length ?? b.text.length)}${b.chapters && b.chapters.length > 1 ? ` · ${b.chapters.length} 章` : ""} · ${done}`
    : b.pages.length
      ? `${b.pages.length} 页短章 · ${done}`
      : b.imported
        ? "空白书 · 可在编辑里导入正文"
        : "陈列示例 · 暂无正文";
  if (b.imported)
    detail.querySelector(".book-description")!.textContent = b.text
      ? "你添加的书。正文会按屏幕自动分页。"
      : "你添加的空白书。";
  const read = detail.querySelector<HTMLButtonElement>(".read-button")!;
  read.disabled = presentation.phase !== "cover";
  read.textContent = readable
    ? b.progress > 0
      ? "继续阅读 ↗"
      : "开始阅读 ↗"
    : "打开书籍 ↗";
  detail.querySelector(".preview-note")!.textContent = b.imported
    ? "保存在此设备的浏览器里"
    : b.pages.length
      ? "原创文字，仅为阅读体验示例"
      : "试试《山间来信》《日常的光》《关于留白》";
  detail.querySelector<HTMLElement>(".edit-button")!.hidden = !b.imported;
}
function filterBooks() {
  view.setFilter(search.value, filter === "reading");
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(".empty")!.hidden =
      root.dataset.visible !== "0";
  });
}
function wordCount(n: number) {
  return n >= 10000
    ? `约 ${(n / 10000).toFixed(n >= 100000 ? 0 : 1)} 万字`
    : `约 ${n} 字`;
}
function updateCounts() {
  const n = String(engine.books.length);
  document.querySelector("#all-count")!.textContent = n;
  document.querySelector("#collection-count")!.textContent = n;
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
  onRemoved: () => updateDetail(),
});
document.querySelector(".add-book-button")!.addEventListener("click", () => {
  engine.close();
  addDialog.openNew();
});
document.querySelector(".edit-button")!.addEventListener("click", () => {
  if (engine.state.kind !== "selected") return;
  const id = engine.state.id;
  void presentation.close().then(() => addDialog.openEdit(id));
});
engine.subscribe((change) => {
  if (change === "layout") updateCounts();
  if (change === "selection") {
    if (engine.state.kind === "selected")
      void presentation.select(engine.book(engine.state.id));
    else if (engine.state.kind === "idle") void presentation.close();
  }
  if (change === "selection" || change === "progress" || change === "layout")
    updateDetail();
  document.querySelector("#reading-count")!.textContent = String(
    engine.books.filter((b) => b.progress > 0).length,
  );
  if (change === "storage") {
    const status = document.querySelector(".save-status")!;
    status.textContent = engine.saved
      ? "● 已保存在此设备"
      : "○ 浏览器未允许保存，本次仍可使用";
    status.classList.toggle("save-failed", !engine.saved);
  }
});
document.querySelector("#reading-count")!.textContent = String(
  engine.books.filter((b) => b.progress > 0).length,
);
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
document
  .querySelector(".close-detail")!
  .addEventListener("click", () => engine.close());
document
  .querySelector(".return-button")!
  .addEventListener("click", () => engine.close());
document
  .querySelector(".read-button")!
  .addEventListener("click", () => void presentation.open());
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-pick]",
))
  button.addEventListener("click", () => {
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
    document
      .querySelector<HTMLElement>(`[data-book="${button.dataset.pick}"]`)
      ?.scrollIntoView({ block: "center", behavior: "instant" });
    engine.select(button.dataset.pick!);
  });
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
  root.textContent =
    "书架未能初始化。请使用支持 WebGL 的浏览器，并开启硬件加速。";
  console.error(error);
}
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    presentation.destroy();
    view.destroy();
    reader.destroy();
  });
