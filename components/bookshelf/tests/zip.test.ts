import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ZipArchive } from "../src/import/zip";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

describe("zip reader", () => {
  it("lists entries and reads stored and deflated files", async () => {
    const zip = ZipArchive.from(fixture("sample-epub3.epub"));
    expect([...zip.entries.keys()]).toContain("OEBPS/content.opf");
    expect(zip.entries.get("mimetype")!.method).toBe(0);
    expect(await zip.text("mimetype")).toBe("application/epub+zip");
    expect(zip.entries.get("OEBPS/content.opf")!.method).toBe(8);
    expect(await zip.text("OEBPS/content.opf")).toContain("雾尾镇来信");
    expect(await zip.text("oebps/CONTENT.opf")).toContain("<package");
    const png = await zip.bytesOf("OEBPS/Images/cover.png");
    expect([...png.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
  });
  it("rejects archives whose declared expansion exceeds safety limits", () => {
    const data = fixture("sample-epub3.epub");
    expect(() => ZipArchive.from(data, { maxEntries: 1 })).toThrow();
    expect(() => ZipArchive.from(data, { maxEntrySize: 16 })).toThrow();
    expect(() => ZipArchive.from(data, { maxTotalSize: 64 })).toThrow();
  });

  it("rejects files that are not zips", () => {
    expect(() =>
      ZipArchive.from(new TextEncoder().encode("plain text, not a zip")),
    ).toThrow();
  });
});
