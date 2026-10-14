/**
 * Measure-based pagination: a continuous text is cut into pages that exactly fill the
 * reader's page box, chapter by chapter (a chapter always starts on a new page).
 * Page boundaries are text offsets, so progress survives resizes and devices.
 */
export interface TextPage {
  start: number;
  end: number;
  /** Chapter heading shown at the top of the chapter's first page. */
  heading?: string;
  chapter: number;
}
export interface ChapterRange {
  title: string;
  start: number;
  end: number;
}
const escapeHTML = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
export function pageHTML(
  text: string,
  page: Pick<TextPage, "start" | "end" | "heading">,
) {
  const head = page.heading
    ? `<h2 class="reader-chapter">${escapeHTML(page.heading)}</h2>`
    : "";
  return head + escapeHTML(text.slice(page.start, page.end));
}
const NO_LINE_START = "，。、！？；：”’」』）》〉】…—,.!?;:)]";

/** A hidden twin of the page body; `fits(html)` lays it out and checks for overflow. */
export function createMeasurer(body: HTMLElement) {
  // Exact fractional box (clientWidth rounds), shaved by half a pixel so a line that
  // only just fits in the twin can never wrap on the real page.
  const rect = body.getBoundingClientRect();
  const sizer = body.cloneNode(false) as HTMLElement;
  sizer.removeAttribute("tabindex");
  sizer.setAttribute("aria-hidden", "true");
  Object.assign(sizer.style, {
    position: "absolute",
    visibility: "hidden",
    pointerEvents: "none",
    left: `${body.offsetLeft}px`,
    top: `${body.offsetTop}px`,
    width: `${rect.width - 0.5}px`,
    height: `${rect.height - 0.5}px`,
    boxSizing: "border-box",
    overflow: "hidden",
    flex: "none",
  });
  body.parentElement!.append(sizer);
  return {
    fits(html: string) {
      sizer.innerHTML = html;
      return sizer.scrollHeight <= sizer.clientHeight + 0.5;
    },
    dispose() {
      sizer.remove();
    },
  };
}

export async function paginate(
  text: string,
  chapters: ChapterRange[] | undefined,
  fits: (html: string) => boolean,
  options: {
    isCancelled?: () => boolean;
    onProgress?: (pages: number, at: number) => void;
  } = {},
): Promise<TextPage[] | undefined> {
  const ranges = chapters?.length
    ? chapters
    : [{ title: "", start: 0, end: text.length }];
  const pages: TextPage[] = [];
  let guess = 320;
  let sinceYield = 0;
  for (let ci = 0; ci < ranges.length; ci++) {
    const { title, start: cs, end: ce } = ranges[ci];
    let s = cs;
    let first = true;
    while (first || s < ce) {
      while (s < ce && text[s] === "\n") s++;
      const heading = first && title ? title : undefined;
      if (s >= ce) {
        if (heading) pages.push({ start: s, end: s, heading, chapter: ci });
        break;
      }
      const html = (n: number) =>
        pageHTML(text, { start: s, end: Math.min(ce, s + n), heading });
      const room = ce - s;
      let lo = 0;
      let hi = Math.min(room, Math.max(8, guess));
      if (fits(html(hi))) {
        lo = hi;
        while (s + hi < ce) {
          hi = Math.min(hi * 2, ce - s);
          if (!fits(html(hi))) break;
          lo = hi;
        }
        if (s + lo >= ce) hi = lo;
      }
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (fits(html(mid))) lo = mid;
        else hi = mid;
      }
      let end = s + Math.min(room, Math.max(1, lo));
      if (end < ce) {
        const nl = text.lastIndexOf("\n", end - 1);
        if (nl > s + lo * 0.82) end = nl + 1;
        else if (/\w/.test(text[end - 1]) && /\w/.test(text[end])) {
          const sp = text.slice(Math.max(s, end - 25), end).search(/\s\S*$/);
          if (sp >= 0) end = Math.max(s, end - 25) + sp + 1;
        } else if (NO_LINE_START.includes(text[end]) && end - s > 2) end -= 1;
      }
      pages.push({ start: s, end, heading, chapter: ci });
      guess = Math.max(40, end - s);
      s = end;
      first = false;
      if (++sinceYield >= 24) {
        sinceYield = 0;
        options.onProgress?.(pages.length, s / Math.max(1, text.length));
        await new Promise((r) => setTimeout(r));
        if (options.isCancelled?.()) return undefined;
      }
    }
  }
  return pages;
}

/** Index of the page that contains a text offset. */
export function pageAt(pages: TextPage[], offset: number) {
  let i = 0;
  while (i + 1 < pages.length && pages[i + 1].start <= offset) i++;
  return i;
}
