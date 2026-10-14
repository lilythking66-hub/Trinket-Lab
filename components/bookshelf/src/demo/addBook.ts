// Demo host UI for adding, editing and removing local books.
// All parsing, sizing, storage and pagination come from the library (src/import, src/reader);
// this file only owns the dialog and its copy.
import {
  coverInfo,
  EpubError,
  importEpub,
  generateSpine,
  importTextFile,
  newBookId,
  paintSpine,
  parseText,
  spinePalette,
  type Book,
  type BookshelfEngine,
  type BookStore,
  type ImportedText,
  type SpineSkin,
  type StoredBook,
} from "../index";

type Source = "keep" | "file" | "paste" | "blank";
export interface AddBookDialog {
  openNew(): void;
  openEdit(id: string): void;
}
const MAX_BYTES = 30 * 1024 * 1024;

export function createAddBookDialog(opts: {
  engine: BookshelfEngine;
  store: BookStore;
  spineSkin: () => SpineSkin;
  onAdded(id: string): void;
  onRemoved(id: string): void;
}): AddBookDialog {
  const { engine, store } = opts;
  const dialog = document.createElement("dialog");
  dialog.className = "add-book";
  dialog.setAttribute("aria-labelledby", "add-book-title");
  dialog.innerHTML = `
    <form method="dialog" class="add-book-form" novalidate>
      <div class="add-book-head">
        <div><div class="eyebrow add-book-eyebrow">ADD TO YOUR SHELF</div><h2 id="add-book-title">Add a book</h2></div>
        <button type="button" class="add-book-close" aria-label="Close">×</button>
      </div>
      <div class="add-book-tabs" role="tablist">
        <button type="button" role="tab" data-source="keep">Keep text</button>
        <button type="button" role="tab" data-source="file">Import file</button>
        <button type="button" role="tab" data-source="paste">Paste text</button>
        <button type="button" role="tab" data-source="blank">Blank book</button>
      </div>
      <div class="add-book-grid">
        <div class="add-book-main">
          <section data-panel="file">
            <label class="drop-zone">
              <input type="file" accept=".txt,.md,.markdown,.text,.epub,text/plain,text/markdown,application/epub+zip" />
              <strong>Drop an .epub, .txt, or .md file here, or click to choose</strong>
              <span>EPUB imports metadata, contents, and cover art. TXT detects UTF-8 / GBK and common chapter headings.</span>
            </label>
          </section>
          <section data-panel="paste">
            <textarea rows="7" placeholder="Paste text here.&#10;Use Chapter 1… or Markdown # / ## headings to split chapters."></textarea>
          </section>
          <section data-panel="blank"><p class="add-book-note">Add an empty placeholder book.</p></section>
          <section data-panel="keep"><p class="add-book-note keep-note"></p></section>
          <p class="add-book-status" role="status"></p>
          <div class="add-book-fields">
            <label>Title<input name="title" required maxlength="80" autocomplete="off" /></label>
            <label>Author<input name="author" maxlength="60" autocomplete="off" /></label>
            <label>Shelf<select name="shelf"></select></label>
          </div>
          <fieldset class="add-book-colors"><legend>Spine color</legend><div class="swatches"></div></fieldset>
        </div>
        <figure class="add-book-preview" aria-hidden="true">
          <canvas></canvas>
          <figcaption></figcaption>
        </figure>
      </div>
      <div class="add-book-actions">
        <button type="button" class="add-book-remove" hidden>Remove from shelf</button>
        <span class="spacer"></span>
        <button type="button" class="add-book-cancel">Cancel</button>
        <button type="submit" class="add-book-submit">Add to shelf</button>
      </div>
    </form>`;
  document.body.append(dialog);
  const $ = <T extends Element = HTMLElement>(sel: string) =>
    dialog.querySelector<T>(sel)!;
  const form = $<HTMLFormElement>("form");
  const titleIn = $<HTMLInputElement>('input[name="title"]');
  const authorIn = $<HTMLInputElement>('input[name="author"]');
  const shelfIn = $<HTMLSelectElement>('select[name="shelf"]');
  const fileIn = $<HTMLInputElement>('input[type="file"]');
  const pasteIn = $<HTMLTextAreaElement>("textarea");
  const status = $(".add-book-status");
  const canvas = $<HTMLCanvasElement>(".add-book-preview canvas");
  const caption = $(".add-book-preview figcaption");
  const swatches = $(".swatches");
  const removeBtn = $<HTMLButtonElement>(".add-book-remove");

  let source: Source = "file";
  let editing: Book | undefined;
  let parsed: ImportedText | undefined;
  let fileName = "";
  /** Cover from an imported EPUB (preview only until saved). */
  let cover:
    | {
        blob: Blob;
        url: string;
        aspect: number;
        color: string;
        img: HTMLImageElement;
      }
    | undefined;
  const dropCover = () => {
    if (cover) URL.revokeObjectURL(cover.url);
    cover = undefined;
  };
  let color = spinePalette[0];
  let colorTouched = false;
  let titleTouched = false;
  let authorTouched = false;
  let confirmRemove = false;

  for (const c of spinePalette) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch";
    b.style.background = c;
    b.dataset.color = c;
    b.setAttribute("aria-label", `Color ${c}`);
    b.addEventListener("click", () => {
      color = c;
      colorTouched = true;
      refresh();
    });
    swatches.append(b);
  }

  const lengthOf = () =>
    source === "keep"
      ? (editing?.length ?? 0)
      : source === "blank"
        ? 0
        : (parsed?.length ?? 0);
  function spec() {
    const s = generateSpine(titleIn.value.trim() || "Untitled", lengthOf());
    if (!colorTouched && !editing) color = cover?.color ?? s.color;
    return { ...s, color };
  }
  function describe() {
    if (source === "keep")
      return editing?.text
        ? `${measure(editing.length ?? 0)} · ${editing.chapters?.length ?? 1} chapters`
        : "This book has no text yet";
    if (source === "blank") return "Blank book · no text";
    if (!parsed) return "";
    const ch = parsed.chapters.filter((c) => c.title).length;
    return [
      source === "file" ? fileName : "",
      measure(parsed.length),
      ch ? `${ch} chapters detected` : "No chapter headings detected · continuous pagination",
      parsed.encoding === "EPUB"
        ? cover
          ? "EPUB · cover found"
          : "EPUB"
        : parsed.encoding !== "UTF-8"
          ? `Encoding ${parsed.encoding}`
          : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  function refresh() {
    for (const tab of dialog.querySelectorAll<HTMLButtonElement>(
      "[data-source]",
    )) {
      const on = tab.dataset.source === source;
      tab.setAttribute("aria-selected", String(on));
      tab.hidden =
        tab.dataset.source === "keep"
          ? !editing
          : tab.dataset.source === "blank"
            ? !!editing
            : false;
    }
    for (const panel of dialog.querySelectorAll<HTMLElement>("[data-panel]"))
      panel.hidden = panel.dataset.panel !== source;
    $(".keep-note").textContent = editing?.text
      ? "Keep the current text and edit the metadata below."
      : "This book is blank. Import a file or paste text to add content.";
    status.textContent = describe();
    const s = spec();
    swatches
      .querySelectorAll<HTMLElement>(".swatch")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.color === color)),
      );
    drawPreview({
      id: editing?.id ?? "preview",
      title: titleIn.value.trim() || "Untitled",
      color: s.color,
      width: s.width,
      height: s.height,
    });
    caption.textContent = `Width ${s.width} · Height ${s.height}`;
    const ok =
      !!titleIn.value.trim() &&
      (source !== "file" || !!parsed) &&
      (source !== "paste" || !!pasteIn.value.trim());
    $<HTMLButtonElement>(".add-book-submit").disabled = !ok;
  }
  function drawPreview(
    b: Pick<Book, "id" | "title" | "color" | "width" | "height">,
  ) {
    const scale = 0.78;
    const dpr = Math.min(devicePixelRatio, 2);
    const W = 150,
      H = 230;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const art = paintSpine(b, opts.spineSkin());
    const w = b.width * scale,
      h = b.height * scale,
      y = H - 18 - h;
    const art2 = source === "file" ? cover : undefined;
    const coverW = art2?.img.complete
      ? Math.min(W - w - 34, h * art2.aspect)
      : 0;
    const x = coverW ? 14 : (W - w) / 2;
    ctx.fillStyle = "rgba(0,0,0,.08)";
    for (let i = 0; i < 8; i++)
      ctx.fillRect(x + w + i, y + i * 2, 1, h - i * 2);
    ctx.fillStyle = b.color;
    ctx.fillRect(x, y - 3, w, 3);
    ctx.fillStyle = "#f3efe6";
    ctx.fillRect(x + 2, y - 2.5, w - 4, 2.5);
    ctx.drawImage(art, x, y, w, h);
    if (coverW && art2) {
      // Front cover stood next to the spine, the way you'd prop a new book on a shelf.
      const ch = coverW / art2.aspect;
      const cx = x + w + 8;
      ctx.fillStyle = "rgba(0,0,0,.12)";
      ctx.fillRect(cx + 2, H - 18 - ch + 3, coverW, ch);
      ctx.drawImage(art2.img, cx, H - 18 - ch, coverW, ch);
    }
    ctx.fillStyle = "#e3ded5";
    ctx.fillRect(8, H - 18, W - 16, 7);
    ctx.fillStyle = "#d3cdc2";
    ctx.fillRect(8, H - 11, W - 16, 5);
  }
  function setSource(next: Source) {
    source = next;
    refresh();
  }
  function applyGuess(t?: string, a?: string) {
    if (t && !titleTouched) titleIn.value = t;
    if (a && !authorTouched) authorIn.value = a;
  }
  async function readFile(file: File) {
    dropCover();
    if (/\.epub$/i.test(file.name) || file.type === "application/epub+zip") {
      if (file.size > MAX_BYTES * 3) {
        parsed = undefined;
        status.textContent = "Files over 90 MB are not supported.";
        return refreshButtons();
      }
      status.textContent = "Reading EPUB…";
      fileName = file.name;
      try {
        const r = await importEpub(await file.arrayBuffer(), file.name);
        parsed = r;
        if (r.cover) {
          const info = await coverInfo(r.cover);
          if (info) {
            const url = URL.createObjectURL(r.cover);
            const img = new Image();
            img.onload = () => refresh();
            img.src = url;
            cover = { blob: r.cover, url, img, ...info };
          }
        }
        applyGuess(r.title, r.author);
        refresh();
      } catch (error) {
        parsed = undefined;
        const code = error instanceof EpubError ? error.code : "invalid";
        status.textContent =
          code === "drm"
            ? "This EPUB is DRM-protected and cannot be imported."
            : code === "empty"
              ? "This EPUB has no readable text. It may be image-only."
              : "Could not read this EPUB. The file may be damaged.";
        refreshButtons();
      }
      return;
    }
    if (file.size > MAX_BYTES) {
      parsed = undefined;
      status.textContent = "Files over 30 MB are not supported.";
      return refreshButtons();
    }
    status.textContent = "Reading…";
    fileName = file.name;
    try {
      parsed = importTextFile(await file.arrayBuffer(), file.name);
      if (!parsed.text.trim()) {
        parsed = undefined;
        status.textContent = "This file has no readable text.";
        return refreshButtons();
      }
      applyGuess(parsed.title, parsed.author);
      refresh();
    } catch {
      parsed = undefined;
      status.textContent = "Could not read this file. Use plain .txt or .md text.";
      refreshButtons();
    }
  }
  function refreshButtons() {
    $<HTMLButtonElement>(".add-book-submit").disabled = true;
  }

  dialog.querySelectorAll<HTMLButtonElement>("[data-source]").forEach((tab) =>
    tab.addEventListener("click", () => {
      setSource(tab.dataset.source as Source);
      if (source === "paste") pasteIn.focus();
    }),
  );
  fileIn.addEventListener(
    "change",
    () => fileIn.files?.[0] && void readFile(fileIn.files[0]),
  );
  const zone = $(".drop-zone");
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("is-over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("is-over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("is-over");
    const f = e.dataTransfer?.files?.[0];
    if (f) void readFile(f);
  });
  let pasteTimer: ReturnType<typeof setTimeout> | undefined;
  pasteIn.addEventListener("input", () => {
    clearTimeout(pasteTimer);
    pasteTimer = setTimeout(() => {
      const raw = pasteIn.value;
      parsed = raw.trim()
        ? parseText(raw, { format: /^\s*#\s/m.test(raw) ? "md" : "txt" })
        : undefined;
      applyGuess(parsed?.title, parsed?.author);
      refresh();
    }, 180);
  });
  titleIn.addEventListener("input", () => {
    titleTouched = true;
    refresh();
  });
  authorIn.addEventListener("input", () => (authorTouched = true));
  $(".add-book-close").addEventListener("click", () => dialog.close());
  $(".add-book-cancel").addEventListener("click", () => dialog.close());
  removeBtn.addEventListener("click", async () => {
    if (!editing) return;
    if (!confirmRemove) {
      confirmRemove = true;
      removeBtn.textContent = "Click again to confirm";
      removeBtn.classList.add("is-armed");
      return;
    }
    const id = editing.id;
    await store.delete(id).catch(() => {});
    if (editing.coverImage?.startsWith("blob:"))
      URL.revokeObjectURL(editing.coverImage);
    engine.removeBook(id);
    dialog.close();
    opts.onRemoved(id);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = titleIn.value.trim();
    if (!title) return titleIn.focus();
    const s = spec();
    const content =
      source === "keep"
        ? {
            text: editing?.text,
            chapters: editing?.chapters,
            length: editing?.length,
          }
        : source === "blank"
          ? { text: undefined, chapters: undefined, length: 0 }
          : {
              text: parsed?.text,
              chapters: parsed?.chapters,
              length: parsed?.length,
            };
    const record: StoredBook = {
      id: editing?.id ?? newBookId(),
      title,
      author: authorIn.value.trim() || undefined,
      color: s.color,
      width: s.width,
      height: s.height,
      shelfId: shelfIn.value,
      ...content,
      encoding: source === "file" ? parsed?.encoding : undefined,
      createdAt: Date.now(),
    };
    // A new EPUB brings its cover; otherwise an edited book keeps the one it had.
    const newCover = source === "file" ? cover : undefined;
    const submit = $<HTMLButtonElement>(".add-book-submit");
    submit.disabled = true;
    try {
      if (editing) {
        const prev = (await store.list()).find((b) => b.id === editing!.id);
        await store.put({
          ...record,
          cover: newCover?.blob ?? prev?.cover,
          coverAspect: newCover?.aspect ?? prev?.coverAspect,
          createdAt: prev?.createdAt ?? record.createdAt,
        });
        if (newCover && editing.coverImage)
          URL.revokeObjectURL(editing.coverImage);
        engine.updateBook(editing.id, {
          title: record.title,
          author: record.author,
          color: record.color,
          width: record.width,
          height: record.height,
          text: record.text,
          chapters: record.chapters,
          length: record.length,
          ...(newCover
            ? {
                coverImage: URL.createObjectURL(newCover.blob),
                coverAspect: newCover.aspect,
              }
            : {}),
          // Changing the text invalidates the old reading position.
          ...(source === "keep" ? {} : { progress: 0 }),
        });
        if (engine.book(editing.id).shelfId !== record.shelfId) {
          engine.beginDrag(editing.id);
          engine.move(editing.id, record.shelfId);
          engine.endDrag();
        }
        dialog.close();
      } else {
        await store.put({
          ...record,
          cover: newCover?.blob,
          coverAspect: newCover?.aspect,
        });
        engine.addBook({
          id: record.id,
          title: record.title,
          author: record.author,
          color: record.color,
          width: record.width,
          height: record.height,
          shelfId: record.shelfId,
          order: 9999,
          pages: [],
          progress: 0,
          text: record.text,
          chapters: record.chapters,
          length: record.length,
          imported: true,
          coverImage: newCover ? URL.createObjectURL(newCover.blob) : undefined,
          coverAspect: newCover?.aspect,
        });
        dialog.close();
        opts.onAdded(record.id);
      }
    } catch (error) {
      console.error(error);
      status.textContent = "Could not save. Local browser storage may be unavailable.";
      submit.disabled = false;
    }
  });

  function reset(book?: Book) {
    editing = book;
    parsed = undefined;
    fileName = "";
    dropCover();
    confirmRemove = false;
    titleTouched = !!book;
    authorTouched = !!book;
    colorTouched = !!book;
    form.reset();
    fileIn.value = "";
    pasteIn.value = "";
    shelfIn.innerHTML = engine.shelves
      .map((s) => `<option value="${s.id}">${s.title}</option>`)
      .join("");
    shelfIn.value = book?.shelfId ?? engine.shelves[0].id;
    titleIn.value = book?.title ?? "";
    authorIn.value = book?.author ?? "";
    color = book?.color ?? spinePalette[0];
    removeBtn.hidden = !book;
    removeBtn.textContent = "Remove from shelf";
    removeBtn.classList.remove("is-armed");
    $("#add-book-title").textContent = book ? "Edit book" : "Add a book";
    $(".add-book-eyebrow").textContent = book
      ? "EDIT BOOK"
      : "ADD TO YOUR SHELF";
    $(".add-book-submit").textContent = book ? "Save" : "Add to shelf";
    source = book ? "keep" : "file";
    refresh();
  }
  return {
    openNew() {
      reset();
      dialog.showModal();
    },
    openEdit(id: string) {
      reset(engine.book(id));
      dialog.showModal();
      titleIn.focus();
    },
  };
}
function measure(n: number) {
  if (n >= 1000) return `~${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k characters`;
  return `~${n} characters`;
}
