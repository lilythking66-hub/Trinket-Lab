import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

const fixture = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

test("EPUB 3: metadata, cover, nested TOC and chapter jump", async ({
  page,
}, info) => {
  const choose = async (sel: string) => {
    if (info.project.name === "desktop") await page.locator(sel).click();
    else await page.locator(sel).tap();
  };
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".book-target")).toHaveCount(24);
  await page.locator(".add-book-button").click();
  await page
    .locator('dialog.add-book input[type="file"]')
    .setInputFiles(fixture("sample-epub3.epub"));
  await expect(page.locator(".add-book-status")).toContainText("识别到 3 章");
  await expect(page.locator(".add-book-status")).toContainText("有封面");
  await expect(page.locator('input[name="title"]')).toHaveValue("雾尾镇来信");
  await expect(page.locator('input[name="author"]')).toHaveValue("林间");
  await page.locator(".add-book-submit").click();
  await expect(page.locator(".book-target")).toHaveCount(25);
  const id = await page
    .locator('.book-target[aria-label^="雾尾镇来信"]')
    .getAttribute("data-book");

  await choose(`[data-book="${id}"]`);
  await expect(page.locator(".book-foreground")).toHaveAttribute(
    "data-phase",
    "cover",
  );
  await expect(page.locator(".foreground-cover")).toHaveClass(
    /has-cover-image/,
  );
  const bg = await page
    .locator(".foreground-cover")
    .evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bg).toContain("blob:");
  // The cover takes the artwork's 60×90 shape.
  const box = (await page.locator(".foreground-front").boundingBox())!;
  expect(box.width / box.height).toBeCloseTo(60 / 90, 1);

  await choose(".foreground-cover");
  await expect(page.locator(".reader")).toBeVisible();
  await expect(page.locator(".page-count")).toHaveText(/^01 \/ \d+$/);
  await expect(page.locator(".reader-body .reader-chapter")).toHaveText(
    "第一章 灯塔",
  );
  // The two-line heading in the file is not repeated under the chapter title.
  await expect(page.locator(".reader-body")).not.toContainText("第一章第一章");
  expect(
    (await page.locator(".reader-body").textContent())!.startsWith(
      "第一章 灯塔　　海雾",
    ),
  ).toBe(true);

  await choose(".reader-toc-button");
  const items = page.locator(".reader-toc-list button");
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toHaveAttribute("aria-current", "true");
  await expect(items.nth(2)).toContainText("第三章 回信");
  const indent = await items
    .nth(2)
    .evaluate((el) => getComputedStyle(el).paddingLeft);
  expect(parseFloat(indent)).toBeGreaterThan(30);
  await items.nth(2).click();
  await expect(page.locator(".reader-toc")).toBeHidden();
  await expect(page.locator(".reader-body .reader-chapter")).toHaveText(
    "第三章 回信",
  );
  await expect(page.locator(".reader-body")).toContainText("我给他回信。");
  await expect(page.locator(".reader-body")).not.toContainText("bad()");

  // Escape closes the TOC first, then the reader.
  await choose(".reader-toc-button");
  await expect(page.locator(".reader-toc")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".reader-toc")).toBeHidden();
  await expect(page.locator(".reader")).toBeVisible();
  await choose(".reader-close");
  await expect(page.locator(".book-foreground")).toHaveAttribute(
    "data-phase",
    "idle",
  );

  // Cover survives a reload (stored as a Blob in IndexedDB).
  await page.reload();
  await expect(page.locator(".book-target")).toHaveCount(25);
  await choose(`[data-book="${id}"]`);
  await expect(page.locator(".foreground-cover")).toHaveClass(
    /has-cover-image/,
  );
  expect(errors).toEqual([]);
});

test("EPUB 2 with NCX, and DRM-protected files are refused", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".book-target")).toHaveCount(24);
  await page.locator(".add-book-button").click();
  const input = page.locator('dialog.add-book input[type="file"]');
  await input.setInputFiles(fixture("drm.epub"));
  await expect(page.locator(".add-book-status")).toContainText("DRM");
  await expect(page.locator(".add-book-submit")).toBeDisabled();
  await input.setInputFiles(fixture("sample-epub2.epub"));
  await expect(page.locator(".add-book-status")).toContainText("识别到 2 章");
  await expect(page.locator('input[name="title"]')).toHaveValue(
    "The Lighthouse Letters",
  );
  await expect(page.locator('input[name="author"]')).toHaveValue("Lin Jian");
  await page.locator(".add-book-submit").click();
  await expect(page.locator(".book-target")).toHaveCount(25);
});
