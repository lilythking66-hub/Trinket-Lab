// Demo-only copy and decoration. The shelf base ships neutral English defaults;
// this file shows how a product localises and dresses it without touching the engine.
import type {
  BookFaces,
  BookshelfLabels,
  PresentationLabels,
  ReaderLabels,
} from "../index";
import type { Book } from "../core/Book";

export const shelfLabels: Partial<BookshelfLabels> = {
  shelf: "书架",
  rearranging: "正在调整排列，按 Escape 取消",
  book: (b) =>
    [
      b.title,
      b.author,
      b.progress > 0 ? `已读 ${Math.round(b.progress * 100)}%` : "",
    ]
      .filter(Boolean)
      .join("，"),
  shelfRow: (row) =>
    `${String(row.index + 1).padStart(2, "0")}   /   ${row.title}${row.continuation ? " · 续" : ""}`,
};
export const presentationLabels: Partial<PresentationLabels> = {
  openBook: (b) => `打开《${b.title}》`,
  coverHint: "轻触封面 · 打开书",
  actionHint: "轻触封面，打开这本书",
  returnToShelf: "放回书架 ↘",
};
export const readerLabels: Partial<ReaderLabels> = {
  back: "← 返回书架",
  previous: "上一页",
  next: "下一页",
  progress: "阅读进度",
  noPages: "暂无正文",
  emptyBody: (b) =>
    b.imported
      ? "这是一本空白书。\n\n合上后在详情里点「编辑这本书」，可以导入 .txt / .md 文件或粘贴文字作为正文。"
      : "这本书尚未收录正文。\n\n你已打开这本书，可以合上后放回书架。\n\n如需体验正文翻页，请打开《山间来信》《日常的光》或《关于留白》。",
  eyebrow: "慢慢读 · READ AT YOUR OWN PACE",
  header: "",
  paginating: "正在排版…",
  contents: "目录",
  closeContents: "关闭目录",
};

/** Oak skin dresses the cover with the Bookshelf Lab imprint; the neutral skin leaves it plain. */
export function oakDecoration({ cover, endpaper }: BookFaces, _book: Book) {
  const slot = (root: HTMLElement, sel: string, text: string) => {
    const el = root.querySelector<HTMLElement>(sel)!;
    el.textContent = text;
    el.hidden = false;
  };
  slot(cover, ".cover-top", "BOOKSHELF LAB\nPRIVATE COLLECTION");
  slot(endpaper, ".endpaper-top", "A LITTLE SPACE FOR BIG WORLDS");
  slot(endpaper, ".endpaper-bottom", "把时间，留在书页之间。");
  for (const [root, after] of [
    [cover, ".cover-author"],
    [endpaper, ".endpaper-author"],
  ] as const) {
    const mark = document.createElement("span");
    mark.dataset.decoration = "";
    mark.className = "imprint-flower";
    mark.textContent = "✳";
    root.querySelector(after)!.after(mark);
  }
}
