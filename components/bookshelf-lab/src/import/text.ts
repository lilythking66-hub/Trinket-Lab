/**
 * Plain-text / Markdown import: decoding, cleanup, chapter detection and title/author guessing.
 * Pure functions, no DOM: usable in a worker, a server or tests.
 */
export interface Chapter {
  /** Heading shown at the top of the chapter's first page. "" for untitled lead-in text. */
  title: string;
  /** Offsets into ImportedText.text, end exclusive. Heading lines are not part of the body. */
  start: number;
  end: number;
  /** Nesting depth in a table of contents (0 = top level). */
  level?: number;
}
export interface ImportedText {
  text: string;
  chapters: Chapter[];
  /** Suggestions only; the host lets the reader edit them. */
  title?: string;
  author?: string;
  encoding: string;
  /** Visible characters, excluding whitespace. */
  length: number;
}

/** Detect UTF-8 / UTF-16 (BOM) / GB18030 (GBK, common for Chinese .txt) / Big5. */
export function decodeText(bytes: ArrayBuffer | Uint8Array): {
  text: string;
  encoding: string;
} {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf)
    return {
      text: new TextDecoder("utf-8").decode(u8.subarray(3)),
      encoding: "UTF-8",
    };
  if (u8[0] === 0xff && u8[1] === 0xfe)
    return {
      text: new TextDecoder("utf-16le").decode(u8.subarray(2)),
      encoding: "UTF-16LE",
    };
  if (u8[0] === 0xfe && u8[1] === 0xff)
    return {
      text: new TextDecoder("utf-16be").decode(u8.subarray(2)),
      encoding: "UTF-16BE",
    };
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(u8),
      encoding: "UTF-8",
    };
  } catch {
    /* not UTF-8 */
  }
  const candidates = ["gb18030", "big5"];
  let best = {
    text: new TextDecoder("utf-8").decode(u8),
    encoding: "UTF-8",
    bad: Infinity,
  };
  for (const label of candidates) {
    try {
      const text = new TextDecoder(label).decode(u8);
      const bad = (text.match(/�/g) ?? []).length;
      if (bad < best.bad)
        best = { text, encoding: label === "gb18030" ? "GBK" : "Big5", bad };
      if (bad === 0) break;
    } catch {
      /* label unsupported in this runtime */
    }
  }
  return { text: best.text, encoding: best.encoding };
}

const CHAPTER_LINE =
  /^\s*(?:(?:第\s*[零〇一二两三四五六七八九十百千万\d]+\s*[章节回卷部篇集幕])(?:[\s:：、.．·-].{0,40}|.{0,40})?|(?:序章|序言|序|楔子|引子|前言|尾声|后记|番外|终章|附录)(?:[\s:：、.．·-].{0,30})?|(?:chapter|part|book)\s+(?:\d+|[ivxlcdm]+|[a-z]+)\b.{0,50}|prologue|epilogue)\s*$/i;

/** Strip Markdown syntax to readable text; returns heading markers as `\u0001<level> title` lines. */
export function markdownToText(md: string): {
  text: string;
  title?: string;
  author?: string;
} {
  let title: string | undefined;
  let author: string | undefined;
  let src = md.replace(/\r\n?/g, "\n");
  const fm = src.match(/^---\n([\s\S]*?)\n---\n/);
  if (fm) {
    for (const line of fm[1].split("\n")) {
      const m = line.match(/^(title|author)\s*:\s*["']?(.+?)["']?\s*$/i);
      if (m && m[1].toLowerCase() === "title") title = m[2];
      if (m && m[1].toLowerCase() === "author") author = m[2];
    }
    src = src.slice(fm[0].length);
  }
  const out: string[] = [];
  let fence = false;
  for (let line of src.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence) {
      out.push(line);
      continue;
    }
    const h = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (h) {
      const text = inline(h[2]);
      if (!title && h[1].length === 1) {
        title = text;
        continue;
      }
      out.push(h[1].length <= 2 ? `\u0001${text}` : text);
      continue;
    }
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      out.push("");
      continue;
    }
    line = line
      .replace(/^\s{0,3}>\s?/, "")
      .replace(/^(\s*)[-*+]\s+(\[[ xX]\]\s+)?/, "$1· ")
      .replace(/^(\s*)(\d+)[.)]\s+/, "$1$2. ");
    out.push(inline(line));
  }
  return { text: out.join("\n"), title, author };
}
function inline(s: string) {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?=[^\w*]|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\\([\\`*_{}[\]()#+\-.!>])/g, "$1");
}

/** Guess title / author from a file name such as `《书名》作者.txt`, `书名 - 作者.md`, `书名_作者.txt`. */
export function guessFromFileName(name: string): {
  title?: string;
  author?: string;
} {
  const base = name
    .replace(/\.[^.]+$/, "")
    .replace(/[_\s]*\(\d+\)$/, "")
    .trim();
  if (!base) return {};
  let m = base.match(/^《(.+?)》\s*(?:[-_—·]\s*)?(?:作者[:：]?)?\s*(.*)$/);
  if (m) return { title: m[1].trim(), author: m[2].trim() || undefined };
  m = base.match(/^(.+?)\s*(?:\s-\s|—|_|·)\s*(?:作者[:：]?)?(.+)$/);
  if (m) return { title: m[1].trim(), author: m[2].trim() };
  m = base.match(/^(.+?)\s*作者[:：]\s*(.+)$/);
  if (m) return { title: m[1].trim(), author: m[2].trim() };
  return { title: base };
}

/**
 * Clean text and split chapters. Headings come from Markdown (h1/h2 after the title)
 * or from common chapter lines (第一章 / 序章 / Chapter 3 …). Without headings the
 * whole text is one untitled chapter.
 */
export function parseText(
  raw: string,
  options: { format?: "txt" | "md"; fileName?: string; encoding?: string } = {},
): ImportedText {
  const format =
    options.format ??
    (/\.(md|markdown|mdown)$/i.test(options.fileName ?? "") ? "md" : "txt");
  let src = raw.replace(/\r\n?/g, "\n").replace(/﻿/g, "");
  let title: string | undefined;
  let author: string | undefined;
  if (format === "md") ({ text: src, title, author } = markdownToText(src));
  const lines = src.split("\n").map((l) => l.replace(/[ \t ]+$/g, ""));
  // Leading metadata lines common in Chinese web novels: 书名：/ 作者：
  for (let i = 0; i < Math.min(8, lines.length); i++) {
    const m = lines[i].match(
      /^\s*(书名|标题|title|作者|author)\s*[:：]\s*(.+)$/i,
    );
    if (!m) continue;
    if (/书名|标题|title/i.test(m[1]))
      title ??= m[2].replace(/^《|》$/g, "").trim();
    else author ??= m[2].trim();
    lines[i] = "";
  }
  const fromName = guessFromFileName(options.fileName ?? "");
  title ??= fromName.title;
  author ??= fromName.author;

  // Rebuild text: single newlines inside paragraphs, at most one blank line between them,
  // heading lines removed from the body and recorded as chapter starts.
  const parts: (string | { heading: string })[] = [];
  const trimBlank = () => {
    while (parts.length && parts[parts.length - 1] === "") parts.pop();
  };
  for (const line of lines) {
    const md = line.startsWith("\u0001");
    const heading = md ? line.slice(1).trim() : line.trim();
    if (
      md ||
      (format === "txt" && heading.length <= 50 && CHAPTER_LINE.test(heading))
    ) {
      trimBlank();
      parts.push({ heading });
    } else if (!line.trim()) {
      const last = parts[parts.length - 1];
      if (parts.length && last !== "" && typeof last === "string")
        parts.push("");
    } else parts.push(line);
  }
  trimBlank();
  let text = "";
  const marks: { title: string; at: number }[] = [];
  for (const part of parts) {
    if (typeof part !== "string") {
      text = text.replace(/\n+$/, "");
      if (text) text += "\n\n";
      marks.push({ title: part.heading, at: text.length });
      continue;
    }
    if (
      text &&
      !text.endsWith("\n\n") &&
      !(marks.length && marks[marks.length - 1].at === text.length)
    )
      text += "\n";
    text += part;
  }
  text = text.replace(/\n+$/, "");
  const chapters: Chapter[] = [];
  const firstAt = marks[0]?.at ?? text.length;
  if (text.slice(0, firstAt).trim())
    chapters.push({ title: "", start: 0, end: firstAt });
  marks.forEach((m, i) =>
    chapters.push({
      title: m.title,
      start: m.at,
      end: marks[i + 1]?.at ?? text.length,
    }),
  );
  if (!chapters.length)
    chapters.push({ title: "", start: 0, end: text.length });
  for (const c of chapters) {
    while (c.start < c.end && text[c.start] === "\n") c.start++;
    while (c.end > c.start && text[c.end - 1] === "\n") c.end--;
  }
  const cleaned = chapters.filter(
    (c, i) => c.end > c.start || c.title || i === 0,
  );
  return {
    text,
    chapters: cleaned,
    title: title?.slice(0, 80),
    author: author?.slice(0, 60),
    encoding: options.encoding ?? "UTF-8",
    length: text.replace(/\s/g, "").length,
  };
}

/** Bytes → ImportedText in one step (file input / drag-and-drop). */
export function importTextFile(
  bytes: ArrayBuffer | Uint8Array,
  fileName: string,
) {
  const { text, encoding } = decodeText(bytes);
  return parseText(text, { fileName, encoding });
}
