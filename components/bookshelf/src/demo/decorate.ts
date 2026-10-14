import type { BookFaces } from "../render/BookPresentation";
import type { Book } from "../core/Book";

/** Optional decoration used only by the demo's oak theme. */
export function oakDecoration({ cover, endpaper }: BookFaces, _book: Book) {
  const slot = (root: HTMLElement, selector: string, text: string) => {
    const element = root.querySelector<HTMLElement>(selector)!;
    element.textContent = text;
    element.hidden = false;
  };

  slot(cover, ".cover-top", "BOOKSHELF\nSAMPLE EDITION");
  slot(endpaper, ".endpaper-top", "TAKE A BOOK · OPEN IT · PUT IT BACK");
  slot(endpaper, ".endpaper-bottom", "A reusable shelf and reader component.");

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
