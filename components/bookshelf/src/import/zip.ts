/**
 * Minimal ZIP reader for EPUB: central directory + stored / deflate entries.
 * Inflation uses the platform DecompressionStream("deflate-raw"), so there is no dependency.
 */
export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  offset: number;
}

export interface ZipLimits {
  maxEntries?: number;
  maxEntrySize?: number;
  maxTotalSize?: number;
}

const DEFAULT_LIMITS: Required<ZipLimits> = {
  maxEntries: 4096,
  maxEntrySize: 32 * 1024 * 1024,
  maxTotalSize: 256 * 1024 * 1024,
};

export class ZipArchive {
  private view: DataView;
  private limits: Required<ZipLimits>;
  readonly entries = new Map<string, ZipEntry>();

  constructor(
    private bytes: Uint8Array,
    limits: ZipLimits = {},
  ) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this.readDirectory();
  }

  static from(data: ArrayBuffer | Uint8Array, limits: ZipLimits = {}) {
    return new ZipArchive(
      data instanceof Uint8Array ? data : new Uint8Array(data),
      limits,
    );
  }

  private readDirectory() {
    const v = this.view;
    // End of central directory: scan back over a possible comment (≤ 64 KB).
    let eocd = -1;
    for (
      let i = this.bytes.length - 22;
      i >= Math.max(0, this.bytes.length - 65557);
      i--
    )
      if (v.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    if (eocd < 0) throw new Error("Not a ZIP file");

    const count = v.getUint16(eocd + 10, true);
    if (count > this.limits.maxEntries)
      throw new Error("ZIP contains too many entries");

    let p = v.getUint32(eocd + 16, true);
    let totalSize = 0;
    const decoder = new TextDecoder();

    for (let i = 0; i < count; i++) {
      if (p < 0 || p + 46 > this.bytes.length)
        throw new Error("Corrupt ZIP directory");
      if (v.getUint32(p, true) !== 0x02014b50)
        throw new Error("Corrupt ZIP directory");

      const method = v.getUint16(p + 10, true);
      const compressedSize = v.getUint32(p + 20, true);
      const size = v.getUint32(p + 24, true);
      const nameLen = v.getUint16(p + 28, true);
      const extraLen = v.getUint16(p + 30, true);
      const commentLen = v.getUint16(p + 32, true);
      const offset = v.getUint32(p + 42, true);
      const next = p + 46 + nameLen + extraLen + commentLen;
      if (next > this.bytes.length) throw new Error("Corrupt ZIP directory");

      if (size > this.limits.maxEntrySize)
        throw new Error("ZIP entry exceeds the uncompressed size limit");
      totalSize += size;
      if (totalSize > this.limits.maxTotalSize)
        throw new Error("ZIP exceeds the total uncompressed size limit");

      const name = decoder.decode(
        this.bytes.subarray(p + 46, p + 46 + nameLen),
      );
      if (!name.endsWith("/"))
        this.entries.set(name, { name, method, compressedSize, size, offset });
      p = next;
    }
  }

  has(name: string) {
    return this.entries.has(name);
  }

  /** Case-insensitive fallback: some EPUBs reference "Text/ch1.xhtml" stored as "text/ch1.xhtml". */
  find(name: string) {
    const exact = this.entries.get(name);
    if (exact) return exact;
    const lower = name.toLowerCase();
    for (const e of this.entries.values())
      if (e.name.toLowerCase() === lower) return e;
    return undefined;
  }

  async bytesOf(name: string): Promise<Uint8Array> {
    const e = this.find(name);
    if (!e) throw new Error(`Missing ${name}`);
    const v = this.view;
    if (e.offset < 0 || e.offset + 30 > this.bytes.length)
      throw new Error(`Corrupt entry ${name}`);
    if (v.getUint32(e.offset, true) !== 0x04034b50)
      throw new Error(`Corrupt entry ${name}`);

    const start =
      e.offset +
      30 +
      v.getUint16(e.offset + 26, true) +
      v.getUint16(e.offset + 28, true);
    const end = start + e.compressedSize;
    if (start < 0 || end > this.bytes.length)
      throw new Error(`Corrupt entry ${name}`);

    const raw = this.bytes.subarray(start, end);
    if (e.method === 0) {
      if (raw.byteLength !== e.size)
        throw new Error(`Corrupt entry size for ${name}`);
      return raw;
    }
    if (e.method !== 8) throw new Error(`Unsupported compression ${e.method}`);

    const stream = new Blob([raw as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
        total += chunk.byteLength;
        if (total > this.limits.maxEntrySize) {
          await reader.cancel();
          throw new Error(`ZIP entry exceeds the uncompressed size limit: ${name}`);
        }
        chunks.push(chunk);
      }
    } finally {
      reader.releaseLock();
    }

    if (total !== e.size) throw new Error(`Corrupt entry size for ${name}`);
    const out = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
      out.set(chunk, at);
      at += chunk.byteLength;
    }
    return out;
  }

  async text(name: string) {
    return new TextDecoder("utf-8").decode(await this.bytesOf(name));
  }
}
