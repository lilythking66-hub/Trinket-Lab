import { describe, it, expect } from "vitest";
import {
  decodeText,
  parseText,
  guessFromFileName,
  importTextFile,
} from "../src/import/text";
import { generateSpine } from "../src/import/spine";
import { BookshelfEngine } from "../src/core/BookshelfEngine";
import { LocalPersistence } from "../src/core/Persistence";
import { books, shelves } from "../src/demo/books";

const gbk = new Uint8Array([
  202, 233, 195, 251, 163, 186, 206, 237, 206, 178, 213, 242, 192, 180, 208,
  197, 10, 215, 247, 213, 223, 163, 186, 193, 214, 188, 228, 10, 10, 181, 218,
  210, 187, 213, 194, 32, 181, 198, 203, 254, 10, 161, 161, 161, 161, 186, 163,
  206, 237, 180, 211, 212, 231, 179, 191, 190, 205, 195, 187, 211, 208, 201,
  162, 161, 163, 10, 10, 181, 218, 182, 254, 213, 194, 32, 211, 202, 178, 238,
  10, 161, 161, 161, 161, 211, 202, 178, 238, 192, 180, 193, 203, 161, 163,
]);

describe("decoding", () => {
  it("reads UTF-8 with and without BOM", () => {
    const u = new TextEncoder().encode("你好");
    expect(decodeText(u)).toEqual({ text: "你好", encoding: "UTF-8" });
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...u])).text).toBe(
      "你好",
    );
  });
  it("falls back to GBK for Chinese .txt", () => {
    const r = decodeText(gbk);
    expect(r.encoding).toBe("GBK");
    expect(r.text).toContain("海雾从早晨就没有散");
  });
});

describe("parsing", () => {
  it("finds chapters and metadata in a Chinese txt", () => {
    const r = importTextFile(gbk, "随便.txt");
    expect(r.title).toBe("雾尾镇来信");
    expect(r.author).toBe("林间");
    expect(r.chapters.map((c) => c.title)).toEqual([
      "第一章 灯塔",
      "第二章 邮差",
    ]);
    const [a, b] = r.chapters;
    expect(r.text.slice(a.start, a.end)).toBe("　　海雾从早晨就没有散。");
    expect(r.text.slice(b.start, b.end)).toBe("　　邮差来了。");
    expect(r.text).not.toContain("书名");
  });
  it("keeps a lead-in before the first chapter and collapses blank lines", () => {
    const r = parseText(
      "前面的话。\n\n\n\n还有一段。\n\nChapter 1\nIt begins.",
      {},
    );
    expect(r.chapters[0]).toMatchObject({ title: "" });
    expect(r.text.slice(r.chapters[0].start, r.chapters[0].end)).toBe(
      "前面的话。\n\n还有一段。",
    );
    expect(r.chapters[1].title).toBe("Chapter 1");
  });
  it("does not treat ordinary sentences as chapters", () => {
    const r = parseText(
      "第一次见到海的时候，我们都没有说话，只是站在那里看了很久很久很久很久很久很久很久很久很久。",
      {},
    );
    expect(r.chapters).toHaveLength(1);
    expect(r.chapters[0].title).toBe("");
  });
  it("strips Markdown and uses h1 as title, h2 as chapters", () => {
    const md =
      "---\nauthor: Lin\n---\n# 关于留白\n\n引子 **加粗** 和 [链接](http://x)。\n\n## 一\n\n- 第一项\n> 引用\n\n## 二\n\n`代码`";
    const r = parseText(md, { fileName: "notes.md" });
    expect(r.title).toBe("关于留白");
    expect(r.author).toBe("Lin");
    expect(r.chapters.map((c) => c.title)).toEqual(["", "一", "二"]);
    expect(r.text).toContain("引子 加粗 和 链接。");
    expect(r.text).toContain("· 第一项");
    expect(r.text).not.toMatch(/[#*>`]/);
  });
  it("guesses title and author from common file names", () => {
    expect(guessFromFileName("《夜航船》张岱.txt")).toEqual({
      title: "夜航船",
      author: "张岱",
    });
    expect(guessFromFileName("Walden - Thoreau.md")).toEqual({
      title: "Walden",
      author: "Thoreau",
    });
    expect(guessFromFileName("山间来信_林间.txt")).toEqual({
      title: "山间来信",
      author: "林间",
    });
    expect(guessFromFileName("随笔.txt")).toEqual({ title: "随笔" });
  });
});

describe("spines and engine", () => {
  it("makes longer books thicker and keeps the look stable per title", () => {
    const a = generateSpine("短文", 2_000);
    const b = generateSpine("长篇", 400_000);
    expect(b.width).toBeGreaterThan(a.width);
    expect(generateSpine("短文", 2_000)).toEqual(a);
    expect(a.width).toBeGreaterThanOrEqual(20);
  });
  it("adds an imported book at the end of its shelf and edits it in place", () => {
    const e = new BookshelfEngine(
      books,
      shelves,
      new LocalPersistence("t", { getItem: () => null, setItem: () => {} }),
    );
    e.addBook({
      id: "user-1",
      title: "新书",
      color: "#999999",
      width: 30,
      height: 220,
      shelfId: "everyday",
      order: 9999,
      pages: [],
      progress: 0,
      text: "正文",
      imported: true,
    });
    const shelf = e.books
      .filter((b) => b.shelfId === "everyday")
      .sort((a, b) => a.order - b.order);
    expect(shelf[shelf.length - 1].id).toBe("user-1");
    e.updateBook("user-1", { title: "改名", color: "#123456" });
    expect(e.book("user-1")).toMatchObject({
      title: "改名",
      color: "#123456",
      shelfId: "everyday",
    });
    expect(() => e.updateBook("user-1", { width: 2 })).toThrow();
  });
  it("cancelled drags roll back placement without cloning texts", () => {
    const e = new BookshelfEngine(
      books,
      shelves,
      new LocalPersistence("t", { getItem: () => null, setItem: () => {} }),
    );
    const before = e.books.map((b) => `${b.id}:${b.shelfId}:${b.order}`).join();
    e.beginDrag("book-3");
    e.move("book-3", "ideas");
    e.endDrag(true);
    expect(e.books.map((b) => `${b.id}:${b.shelfId}:${b.order}`).join()).toBe(
      before,
    );
  });
});
