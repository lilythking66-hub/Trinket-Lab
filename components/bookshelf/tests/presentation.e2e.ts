import { test, expect, type Page, type TestInfo } from "@playwright/test";

async function visualShot(
  page: Page,
  info: TestInfo,
  name: string,
) {
  if (process.env.BOOKSHELF_VISUAL_SHOTS !== "1") return;
  await page.screenshot({
    path: `test-results/visual/${info.project.name}-${name}.png`,
  });
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".book-target")).toHaveCount(24);
});
test("one foreground book: pull, turn, open spread, read, close and return", async ({
  page,
}, info) => {
  const phases: string[] = [];
  await page.exposeFunction("recordPhase", (phase: string) =>
    phases.push(phase),
  );
  await page.evaluate(() => {
    const el = document.querySelector(".book-foreground")!;
    new MutationObserver(() => {
      (window as any).recordPhase(el.getAttribute("data-phase"));
    }).observe(el, { attributes: true, attributeFilter: ["data-phase"] });
  });
  const book = page.locator('[data-book="book-1"]');
  const before = await book.boundingBox();
  await book.click();
  const fg = page.locator(".book-foreground");
  await expect(fg).toHaveAttribute("data-phase", "cover");
  await visualShot(page, info, "cover");
  expect(await fg.evaluate((el) => el.parentElement === document.body)).toBe(
    true,
  );
  const actor = await page.locator(".book-actor").boundingBox();
  expect(actor!.y).toBeGreaterThan(0);
  expect(actor!.x).toBeGreaterThan(0);
  await page.evaluate(() => {
    (window as any).overflowFrames = [];
    const check = () => {
      const phase = document
        .querySelector(".book-foreground")
        ?.getAttribute("data-phase");
      if (phase === "reading") return;
      if (phase === "opening" || phase === "open")
        for (const selector of [".foreground-endpaper", ".foreground-paper"]) {
          const r = document.querySelector(selector)!.getBoundingClientRect();
          if (
            r.left < -1 ||
            r.right > innerWidth + 1 ||
            r.top < -1 ||
            r.bottom > innerHeight + 1
          )
            (window as any).overflowFrames.push({
              phase,
              selector,
              left: r.left,
              right: r.right,
              top: r.top,
              bottom: r.bottom,
            });
        }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
  await page.locator(".foreground-cover").click();
  await page.waitForFunction(
    () =>
      document.querySelector(".book-foreground")?.getAttribute("data-phase") ===
      "open",
  );
  await expect(page.locator(".reader")).not.toBeVisible();
  await visualShot(page, info, "open-spread");
  await expect(fg).toHaveAttribute("data-phase", "reading");
  await expect(page.locator(".reader")).toBeVisible();
  expect(await page.evaluate(() => (window as any).overflowFrames)).toEqual([]);
  await expect(page.locator(".reader")).toHaveCSS("opacity", "1");
  await visualShot(page, info, "reader");
  await page.locator(".page-next").click();
  await expect(page.locator(".page-count")).toHaveText("02 / 03");
  await page.locator(".reader-close").click();
  await expect(fg).toHaveAttribute("data-phase", "closing");
  await visualShot(page, info, "closing");
  await expect(fg).toHaveAttribute("data-phase", "idle");
  await expect(fg).toBeHidden();
  await expect(book).toHaveAttribute("aria-pressed", "false");
  expect(await book.boundingBox()).toEqual(before);
  expect(phases).toEqual(
    expect.arrayContaining([
      "pulling",
      "turning",
      "cover",
      "opening",
      "open",
      "reading",
      "closing",
      "turning-back",
      "returning",
      "idle",
    ]),
  );
  const ordered = phases.filter((p, i) => i === 0 || p !== phases[i - 1]);
  expect(ordered).toEqual([
    "pulling",
    "turning",
    "cover",
    "opening",
    "open",
    "reading",
    "closing",
    "turning-back",
    "returning",
    "idle",
  ]);
});
test("top shelf extraction stays unclipped; interrupted return works", async ({
  page,
}, info) => {
  const book = page.locator('[data-book="book-4"]');
  await book.click();
  await expect(page.locator(".book-foreground")).toHaveAttribute(
    "data-phase",
    "turning",
  );
  const actor = await page.locator(".book-actor").boundingBox();
  expect(actor!.y).toBeGreaterThan(0);
  expect(actor!.x).toBeGreaterThan(0);
  expect(actor!.x + actor!.width).toBeLessThan(page.viewportSize()!.width);
  expect(actor!.y + actor!.height).toBeLessThan(page.viewportSize()!.height);
  expect(
    await page
      .locator(".book-foreground")
      .evaluate((element) => element.parentElement === document.body),
  ).toBe(true);
  await visualShot(page, info, "top-extraction");
  await page.keyboard.press("Escape");
  await expect(page.locator(".book-foreground")).toHaveAttribute(
    "data-phase",
    "idle",
  );
  await book.click();
  await expect(page.locator(".book-foreground")).toHaveAttribute(
    "data-phase",
    "cover",
  );
  await page.setViewportSize({
    width: info.project.name === "mobile" ? 768 : 390,
    height: 844,
  });
  await expect
    .poll(async () => (await page.locator(".book-actor").boundingBox())!.x)
    .toBeGreaterThan(0);
  await expect
    .poll(async () => {
      const rect = (await page.locator(".book-actor").boundingBox())!;
      return rect.x + rect.width;
    })
    .toBeLessThan(page.viewportSize()!.width);
  await page.locator(".foreground-return").click();
  await expect(page.locator(".book-foreground")).toHaveAttribute(
    "data-phase",
    "idle",
  );
  await expect(book).toHaveAttribute("aria-pressed", "false");
});
test("straight spines remain tightly adjacent and touch regions do not overlap", async ({
  page,
}) => {
  const a = (await page.locator('[data-book="book-1"]').boundingBox())!,
    b = (await page.locator('[data-book="book-2"]').boundingBox())!;
  expect(Math.abs(b.x - (a.x + a.width))).toBeLessThan(2);
  // Target width follows the actual spine: no hidden 44px spacer or overlapping hit areas.
  expect(a.x + a.width).toBeLessThanOrEqual(b.x + 0.1);
});
