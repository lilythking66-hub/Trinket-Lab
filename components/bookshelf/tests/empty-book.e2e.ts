import { test, expect } from "@playwright/test";
test("empty book opens from its cover, returns, and a readable book still pages", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.locator(".book-target")).toHaveCount(24);
  const choose = async (selector: string) => {
    if (info.project.name === "desktop") await page.locator(selector).click();
    else await page.locator(selector).tap();
  };
  await choose('[data-book="book-4"]');
  await expect(page.locator(".book-foreground")).toHaveAttribute(
    "data-phase",
    "cover",
  );
  await expect(page.locator(".foreground-cover")).toBeEnabled();
  await choose(".foreground-cover");
  await expect(page.locator(".reader")).toBeVisible();
  await expect(page.locator(".reader-body")).toContainText(
    "This book has no pages yet.",
  );
  await expect(page.locator(".page-count")).toHaveText("No pages");
  await expect(page.locator(".page-prev")).toBeDisabled();
  await expect(page.locator(".page-next")).toBeDisabled();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  expect(
    await page.evaluate(() => localStorage.getItem("trinket-bookshelf:v1")),
  ).toBeNull();
  await choose(".reader-close");
  await expect(page.locator(".book-foreground")).toHaveAttribute(
    "data-phase",
    "idle",
  );
  await choose('[data-book="book-1"]');
  await expect(page.locator(".book-foreground")).toHaveAttribute(
    "data-phase",
    "cover",
  );
  await choose(".foreground-cover");
  await expect(page.locator(".reader")).toBeVisible();
  await expect(page.locator("progress")).toBeVisible();
  await choose(".page-next");
  await expect(page.locator(".page-count")).toHaveText("02 / 03");
  await choose(".reader-close");
  await expect(page.locator(".book-foreground")).toHaveAttribute(
    "data-phase",
    "idle",
  );
  await choose('[data-book="book-4"]');
  await expect(page.locator(".book-foreground")).toHaveAttribute(
    "data-phase",
    "cover",
  );
  await choose(".foreground-cover");
  await expect(page.locator(".reader-body")).toContainText(
    "This book has no pages yet.",
  );
});
