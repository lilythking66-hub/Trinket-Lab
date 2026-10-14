/**
 * EPUB 2 / 3 import → the same continuous-text model as .txt (text + chapter ranges),
 * plus the cover image. Needs DOMParser (browser / worker with a DOM shim).
 *
 * Chapters come from the table of contents (EPUB3 nav, else EPUB2 NCX). A TOC entry that
 * points into the middle of a file (#fragment) starts its chapter at that element, so books
 * that keep several chapters in one file still split correctly. Files without a TOC entry
 * continue the previous chapter. Images, tables and styling are reduced to text.
 */
import { ZipArchive } from "./zip";
import { guessFromFileName, type ImportedText } from "./text";

export interface EpubChapter {
  title: string;
  start: number;
  end: number;
  /** Nesting depth in the source TOC (0 = top level). */
  level: number;
}
export interface EpubImport extends ImportedText {
  chapters: EpubChapter[];
  cover?: Blob;
  language?: string;
  format: "epub";
}
export class EpubError extends Error {
  constructor(
    public code: "invalid" | "drm" | "empty",
    message: string,
  ) {
    super(message);
  }
}

const OPS = "http://www.idpf.org/2007/ops";
const FONT_OBFUSCATION = [
  "http://www.idpf.org/2008/embedding",
  "http://ns.adobe.com/pdf/enc#RC",
];
const SKIP = new Set([
  "script",
  "style",
  "head",
  "title",
  "svg",
  "math",
  "img",
  "video",
  "audio",
  "object",
  "iframe",
  "noscript",
  "rt",
  "rp",
]);
const BLOCK = new Set([
  "p",
  "div",
  "section",
  "article",
  "header",
  "footer",
  "aside",
  "blockquote",
  "pre",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "dt",
  "dd",
  "tr",
  "figcaption",
  "hr",
  "table",
  "ul",
  "ol",
  "dl",
  "figure",
  "main",
  "body",
]);

const parse = (xml: string, type: DOMParserSupportedType) =>
  new DOMParser().parseFromString(xml, type);
function parseXML(xml: string) {
  const doc = parse(xml, "application/xml");
  return doc.getElementsByTagName("parsererror").length ? null : doc;
}
function parseXHTML(xml: string) {
  const strict = parse(xml, "application/xhtml+xml");
  return strict.getElementsByTagName("parsererror").length
    ? parse(xml, "text/html")
    : strict;
}
const tags = (root: Document | Element, local: string) =>
  Array.from(root.getElementsByTagNameNS("*", local));
const first = (root: Document | Element, local: string) => tags(root, local)[0];
const clean = (s: string | null | undefined) =>
  (s ?? "").replace(/\s+/g, " ").trim();
const norm = (s: string) =>
  s.replace(/[\s　·.．:：、,，\-—_]/g, "").toLowerCase();

function dirOf(path: string) {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i + 1);
}
/** Resolve an href relative to the file it appears in; returns [path, fragment]. */
function resolve(base: string, href: string): [string, string] {
  const [rawPath, frag = ""] = href.split("#");
  let decoded = rawPath;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    /* keep raw */
  }
  if (!decoded) return ["", frag];
  const parts = (
    decoded.startsWith("/") ? decoded.slice(1) : dirOf(base) + decoded
  ).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p && p !== ".") out.push(p);
  }
  return [out.join("/"), frag];
}

interface TocEntry {
  path: string;
  fragment: string;
  title: string;
  level: number;
}
function navToc(doc: Document, base: string): TocEntry[] {
  const navs = tags(doc, "nav");
  const toc =
    navs.find((n) =>
      (n.getAttributeNS(OPS, "type") ?? n.getAttribute("epub:type") ?? "")
        .split(/\s+/)
        .includes("toc"),
    ) ?? navs[0];
  if (!toc) return [];
  const out: TocEntry[] = [];
  const walk = (list: Element, level: number) => {
    for (const li of Array.from(list.children).filter(
      (c) => c.localName === "li",
    )) {
      const a = Array.from(li.children).find(
        (c) => c.localName === "a" || c.localName === "span",
      );
      const href = a?.getAttribute("href");
      if (a && href) {
        const [path, fragment] = resolve(base, href);
        out.push({ path, fragment, title: clean(a.textContent), level });
      }
      const sub = Array.from(li.children).find(
        (c) => c.localName === "ol" || c.localName === "ul",
      );
      if (sub) walk(sub, level + 1);
    }
  };
  const root = Array.from(toc.getElementsByTagNameNS("*", "ol"))[0];
  if (root) walk(root, 0);
  return out;
}
function ncxToc(doc: Document, base: string): TocEntry[] {
  const out: TocEntry[] = [];
  const walk = (parent: Element, level: number) => {
    for (const np of Array.from(parent.children).filter(
      (c) => c.localName === "navPoint",
    )) {
      const label = clean(first(np, "text")?.textContent);
      const src = first(np, "content")?.getAttribute("src");
      if (src) {
        const [path, fragment] = resolve(base, src);
        out.push({ path, fragment, title: label, level });
      }
      walk(np, level + 1);
    }
  };
  const map = first(doc, "navMap");
  if (map) walk(map, 0);
  return out;
}

async function checkDrm(zip: ZipArchive) {
  if (zip.has("META-INF/rights.xml") || zip.has("META-INF/sinf.xml"))
    throw new EpubError("drm", "This EPUB is DRM protected.");
  if (!zip.has("META-INF/encryption.xml")) return;
  const doc = parseXML(await zip.text("META-INF/encryption.xml"));
  if (!doc) return;
  for (const data of tags(doc, "EncryptedData")) {
    const alg =
      first(data, "EncryptionMethod")?.getAttribute("Algorithm") ?? "";
    if (!FONT_OBFUSCATION.includes(alg))
      throw new EpubError("drm", "This EPUB is DRM protected.");
  }
}

export async function importEpub(
  data: ArrayBuffer | Uint8Array,
  fileName = "",
): Promise<EpubImport> {
  let zip: ZipArchive;
  try {
    zip = ZipArchive.from(data);
  } catch {
    throw new EpubError("invalid", "Not a valid EPUB (zip) file.");
  }
  await checkDrm(zip);
  const container = zip.has("META-INF/container.xml")
    ? parseXML(await zip.text("META-INF/container.xml"))
    : null;
  const opfPath =
    container && first(container, "rootfile")?.getAttribute("full-path");
  if (!opfPath || !zip.find(opfPath))
    throw new EpubError("invalid", "EPUB package document not found.");
  const opf = parseXML(await zip.text(opfPath));
  if (!opf)
    throw new EpubError("invalid", "EPUB package document is malformed.");

  // Metadata
  const meta = first(opf, "metadata");
  const title = clean(meta && first(meta, "title")?.textContent) || undefined;
  const author =
    clean(meta && first(meta, "creator")?.textContent) || undefined;
  const language =
    clean(meta && first(meta, "language")?.textContent) || undefined;

  // Manifest + spine
  const manifest = new Map<
    string,
    { path: string; type: string; props: string[] }
  >();
  for (const item of tags(opf, "item")) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (!id || !href) continue;
    manifest.set(id, {
      path: resolve(opfPath, href)[0],
      type: item.getAttribute("media-type") ?? "",
      props: (item.getAttribute("properties") ?? "").split(/\s+/),
    });
  }
  const spineEl = first(opf, "spine");
  const spine = tags(opf, "itemref")
    .filter((r) => r.getAttribute("linear") !== "no")
    .map((r) => manifest.get(r.getAttribute("idref") ?? ""))
    .filter((m): m is NonNullable<typeof m> => !!m && /html|xml/.test(m.type));

  // Table of contents
  let toc: TocEntry[] = [];
  const nav = [...manifest.values()].find((m) => m.props.includes("nav"));
  if (nav && zip.find(nav.path))
    toc = navToc(parseXHTML(await zip.text(nav.path)), nav.path);
  if (!toc.length) {
    const ncx =
      manifest.get(spineEl?.getAttribute("toc") ?? "") ??
      [...manifest.values()].find((m) => m.type === "application/x-dtbncx+xml");
    if (ncx && zip.find(ncx.path)) {
      const doc = parseXML(await zip.text(ncx.path));
      if (doc) toc = ncxToc(doc, ncx.path);
    }
  }

  // Cover image
  let coverItem = [...manifest.values()].find((m) =>
    m.props.includes("cover-image"),
  );
  if (!coverItem) {
    const metaCover = tags(opf, "meta")
      .find((m) => m.getAttribute("name") === "cover")
      ?.getAttribute("content");
    coverItem = metaCover ? manifest.get(metaCover) : undefined;
  }
  if (!coverItem)
    coverItem = [...manifest.entries()].find(
      ([id, m]) => m.type.startsWith("image/") && /cover/i.test(id + m.path),
    )?.[1];
  let cover: Blob | undefined;
  if (
    coverItem &&
    coverItem.type.startsWith("image/") &&
    zip.find(coverItem.path)
  )
    cover = new Blob([(await zip.bytesOf(coverItem.path)) as BlobPart], {
      type: coverItem.type,
    });

  // Text
  const cjk = /^(zh|ja|ko)/i.test(language ?? "");
  const byPath = new Map<string, TocEntry[]>();
  for (const e of toc) byPath.set(e.path, [...(byPath.get(e.path) ?? []), e]);
  let text = "";
  const chapters: EpubChapter[] = [];
  // Headings at the very start of a chapter that just repeat its TOC title are dropped:
  // the reader prints the title once, styled. `consumed` tracks multi-line headings.
  let consumed = "";
  const startChapter = (title: string, level: number) => {
    closeChapter();
    chapters.push({ title, start: text.length, end: text.length, level });
    consumed = "";
  };
  const closeChapter = () => {
    const c = chapters[chapters.length - 1];
    if (c) c.end = text.length;
  };
  const addPara = (para: string, heading: boolean) => {
    const p = para.replace(/[ \t\u00a0]+/g, " ").trim();
    if (!p) return;
    if (!chapters.length) startChapter("", 0);
    const c = chapters[chapters.length - 1];
    if (heading && c.title && text.length === c.start) {
      const next = consumed + norm(p);
      if (next && norm(c.title).startsWith(next)) {
        consumed = next;
        return;
      }
    }
    if (text.length === c.start) {
      // First paragraph of a chapter: separate from the previous chapter, start after the gap.
      if (text.length) {
        text += "\n\n";
        c.start = text.length;
      }
    } else text += cjk ? "\n" : "\n\n";
    text += cjk && !heading ? `\u3000\u3000${p}` : p;
  };

  for (const item of spine) {
    if (item === nav || !zip.find(item.path)) continue;
    const doc = parseXHTML(await zip.text(item.path));
    const body = first(doc, "body");
    if (!body) continue;
    const entries = byPath.get(item.path) ?? [];
    const atStart = entries.find(
      (e) => !e.fragment || !doc.getElementById(e.fragment),
    );
    const anchors = new Map(
      entries
        .filter(
          (e) => e.fragment && e !== atStart && doc.getElementById(e.fragment),
        )
        .map((e) => [e.fragment, e]),
    );
    if (atStart) startChapter(atStart.title, atStart.level);
    else if (!toc.length) {
      const h =
        tags(body, "h1")[0] ?? tags(body, "h2")[0] ?? tags(body, "h3")[0];
      startChapter(clean(h?.textContent), 0);
    }
    let para = "";
    let heading = false;
    const flush = () => {
      addPara(para, heading);
      para = "";
      heading = false;
    };
    const walk = (node: Node, pre: boolean) => {
      if (node.nodeType === 3) {
        para += pre
          ? node.nodeValue
          : (node.nodeValue ?? "").replace(/\s+/g, " ");
        return;
      }
      if (node.nodeType !== 1) return;
      const el = node as Element;
      const name = el.localName.toLowerCase();
      if (SKIP.has(name)) return;
      const anchor = el.id && anchors.get(el.id);
      if (anchor) {
        flush();
        startChapter(anchor.title, anchor.level);
        anchors.delete(el.id);
      }
      if (name === "br") {
        para += "\n";
        return;
      }
      const block = BLOCK.has(name);
      if (block) flush();
      if (/^h[1-6]$/.test(name)) heading = true;
      for (const child of Array.from(el.childNodes))
        walk(child, pre || name === "pre");
      if (block) flush();
    };
    walk(body, false);
    flush();
  }
  closeChapter();

  const kept = chapters.filter((c) => c.end > c.start || c.title);
  if (!text.trim())
    throw new EpubError("empty", "This EPUB has no readable text.");
  const fromName = guessFromFileName(fileName);
  return {
    text,
    chapters: kept.length
      ? kept
      : [{ title: "", start: 0, end: text.length, level: 0 }],
    title: (title ?? fromName.title)?.slice(0, 80),
    author: (author ?? fromName.author)?.slice(0, 60),
    encoding: "EPUB",
    length: text.replace(/\s/g, "").length,
    cover,
    language,
    format: "epub",
  };
}
