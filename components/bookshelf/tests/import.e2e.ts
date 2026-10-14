import { test, expect, type Page } from "@playwright/test";

const gbk = Buffer.from([
  202, 233, 195, 251, 163, 186, 206, 237, 206, 178, 213, 242, 192, 180, 208,
  197, 10, 215, 247, 213, 223, 163, 186, 193, 214, 188, 228, 10, 10, 181, 218,
  210, 187, 213, 194, 32, 181, 198, 203, 254, 10, 161, 161, 161, 161, 186, 163,
  206, 237, 180, 211, 212, 231, 179, 191, 190, 205, 195, 187, 211, 208, 201,
  162, 161, 163, 10, 10, 181, 218, 182, 254, 213, 194, 32, 211, 202, 178, 238,
  10, 161, 161, 161, 161, 211, 202, 178, 238, 192, 180, 193, 203, 161, 163,
]);
function longText() {
  const para =
    "　　海雾从早晨就没有散，灯塔的影子落在潮湿的石阶上。邮差把信放进木箱，又沿着来时的路慢慢走回去。";
  return ["第一章 灯塔", "第二章 邮差", "第三章 回信"]
    .map((h) => h + "\n" + Array.from({ length: 30 }, () => para).join("\n"))
    .join("\n\n");
}

test("import a GBK .txt, read it across chapters and persist", async ({
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
  await expect(page.locator("dialog.add-book")).toBeVisible();
  await page.locator('dialog.add-book input[type="file"]').setInputFiles({
    name: "雾尾镇.txt",
    mimeType: "text/plain",
    buffer: gbk,
  });
  await expect(page.locator(".add-book-status")).toContainText("2 chapters detected");
  await expect(page.locator(".add-book-status")).toContainText("GBK");
  await expect(page.locator('input[name="title"]')).toHaveValue("雾尾镇来信");
  await expect(page.locator('input[name="author"]')).toHaveValue("林间");
  await page.locator('select[name="shelf"]').selectOption("everyday");
  await page.locator(".add-book-submit").click();
  await expect(page.locator("dialog.add-book")).not.toBeVisible();
  await expect(page.locator(".book-target")).toHaveCount(25);
  const id = await page
    .locator('.book-target[aria-label^="雾尾镇来信"]')
    .getAttribute("data-book");
  expect(id).toMatch(/^user-/);

  await choose(`[data-book="${id}"]`);
  await expect(page.locator(".book-foreground")).toHaveAttribute(
    "data-phase",
    "cover",
  );
  await choose(".foreground-cover");
  await expect(page.locator(".reader")).toBeVisible();
  await expect(page.locator(".page-count")).toHaveText("01 / 02");
  await expect(page.locator(".reader-body .reader-chapter")).toHaveText(
    "第一章 灯塔",
  );
  await choose(".page-next");
  await expect(page.locator(".page-count")).toHaveText("02 / 02");
  await expect(page.locator(".reader-body")).toContainText("邮差来了");
  await choose(".reader-close");
  await expect(page.locator(".book-foreground")).toHaveAttribute(
    "data-phase",
    "idle",
  );

  await page.reload();
  await expect(page.locator(".book-target")).toHaveCount(25);
  await expect(page.locator(`[data-book="${id}"]`)).toHaveAttribute(
    "aria-label",
    /100% read/,
  );
  expect(errors).toEqual([]);
});

test("pasted long text is paginated to fill the page without overflow", async ({
  page,
}, info) => {
  const choose = async (sel: string) => {
    if (info.project.name === "desktop") await page.locator(sel).click();
    else await page.locator(sel).tap();
  };
  await page.goto("/");
  await expect(page.locator(".book-target")).toHaveCount(24);
  await page.locator(".add-book-button").click();
  await page.locator('[data-source="paste"]').click();
  await page.locator("dialog.add-book textarea").fill(longText());
  await expect(page.locator(".add-book-status")).toContainText("3 chapters detected");
  await page.locator('input[name="title"]').fill("Long text test");
  await page.locator(".add-book-submit").click();
  const id = await page
    .locator('.book-target[aria-label^="Long text test"]')
    .getAttribute("data-book");
  await choose(`[data-book="${id}"]`);
  await expect(page.locator(".book-foreground")).toHaveAttribute(
    "data-phase",
    "cover",
  );
  await choose(".foreground-cover");
  await expect(page.locator(".page-count")).toHaveText(/^01 \/ \d+$/);
  const total = Number(
    (await page.locator(".page-count").textContent())!.split("/")[1],
  );
  expect(total).toBeGreaterThan(5);
  const seen = new Set<string>();
  for (let i = 0; i < Math.min(total, 8); i++) {
    const m = await page.locator(".reader-body").evaluate((el) => ({
      fits: el.scrollHeight <= el.clientHeight + 1,
      fill: el.scrollHeight / el.clientHeight,
      text: el.textContent ?? "",
    }));
    expect(m.fits).toBe(true);
    seen.add((await page.locator(".page-count").textContent())!);
    if (i < Math.min(total, 8) - 1) await page.keyboard.press("ArrowRight");
  }
  expect(seen.size).toBe(Math.min(total, 8));
  // Every page of the book fits, and each chapter heading opens a page.
  const check = await page.evaluate(async () => {
    const out = { overflow: 0, headings: 0 };
    const count = () => document.querySelector(".page-count")!.textContent!;
    const total = Number(count().split("/")[1]);
    for (let i = 0; i < total; i++)
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft" }),
      );
    for (let i = 0; i < total; i++) {
      const el = document.querySelector<HTMLElement>(".reader-body")!;
      if (el.scrollHeight > el.clientHeight + 1) out.overflow++;
      if (el.querySelector(".reader-chapter")) out.headings++;
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight" }),
      );
    }
    return out;
  });
  expect(check).toEqual({ overflow: 0, headings: 3 });
});
